import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireAccountant, requireManager } from '../middleware/auth.js';
import { resolveEmployeeKpiForPayroll } from '../utils/kpiPayrollResolver.js';

const router = Router();
const TECH_KPI_COMMISSION_POLICY_MARKER = '[TECH_KPI_COMMISSION_POLICY_V1]';

// ========== Helper: Get last Sunday of a given month ==========
function getLastSundayOfMonth(year: number, month: number): Date {
    // month is 1-based
    const lastDay = new Date(year, month, 0); // last day of the month
    const dayOfWeek = lastDay.getDay(); // 0=Sunday
    const lastSunday = new Date(lastDay);
    lastSunday.setDate(lastDay.getDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));
    return lastSunday;
}

function parseMoneyValue(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^\d]/g, '');
        if (!cleaned) return 0;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function resolveSalaryBasis(userId: string, userData: any) {
    let salaryConfig: any = null;
    try {
        const { data } = await supabaseAdmin
            .from('salary_configs')
            .select('salary_type, base_amount, overtime_enabled, allowance_enabled, allowance_amount, commission_enabled')
            .eq('user_id', userId)
            .maybeSingle();
        salaryConfig = data || null;
    } catch (error) {
        console.error(`[PayrollBatch] Salary config lookup failed for ${userId}:`, error);
    }

    const configuredBase = toNumber(salaryConfig?.base_amount);
    const userBase = toNumber(userData?.base_salary);
    const baseAmount = configuredBase > 0 ? configuredBase : userBase;
    const standardWorkDays = 26;
    const salaryType = salaryConfig?.salary_type || (userData?.hourly_rate ? 'hourly' : 'standard_day');
    const hourlyRate = toNumber(userData?.hourly_rate) || Math.floor(baseAmount / (standardWorkDays * 8));

    return {
        salaryConfig,
        salaryType,
        baseAmount,
        standardWorkDays,
        hourlyRate,
    };
}

async function resolveApprovedAttendanceSalary(params: {
    userId: string;
    startDate: string;
    endDate: string;
    baseAmount: number;
    salaryType: string;
    standardWorkDays: number;
    hourlyRate: number;
    overtimeEnabled: boolean;
}) {
    const { userId, startDate, endDate, baseAmount, salaryType, standardWorkDays, hourlyRate, overtimeEnabled } = params;
    let totalHours = 0;
    let workedDays = 0;
    let overtimeHours = 0;

    try {
        const { data: timesheets } = await supabaseAdmin
            .from('timesheets')
            .select('check_in, check_out, status, schedule_date')
            .eq('user_id', userId)
            .eq('status', 'approved')
            .gte('schedule_date', startDate)
            .lte('schedule_date', endDate);

        const workedDates = new Set<string>();
        for (const t of timesheets || []) {
            if (t.schedule_date) workedDates.add(t.schedule_date);
            if (!t.check_in || !t.check_out) continue;
            const hours = (new Date(t.check_out).getTime() - new Date(t.check_in).getTime()) / (1000 * 60 * 60);
            if (!Number.isFinite(hours) || hours <= 0) continue;
            const cappedHours = Math.min(hours, 12);
            totalHours += cappedHours;
            overtimeHours += Math.max(0, cappedHours - 8);
        }
        workedDays = workedDates.size;
    } catch (error) {
        console.error(`[PayrollBatch] Approved timesheet lookup failed for ${userId}:`, error);
    }

    totalHours = Math.round(totalHours * 100) / 100;
    overtimeHours = overtimeEnabled ? Math.round(overtimeHours * 100) / 100 : 0;

    const baseSalary = salaryType === 'hourly'
        ? Math.round(totalHours * hourlyRate)
        : Math.round((baseAmount / standardWorkDays) * workedDays);
    const hourlyWage = Math.round(totalHours * hourlyRate);
    const overtimePay = overtimeEnabled ? Math.round(overtimeHours * hourlyRate * 1.5) : 0;

    return { totalHours, workedDays, overtimeHours, baseSalary, hourlyWage, overtimePay };
}

function setTechKpiPolicyMarker(notes: string | null | undefined, enabled: boolean): string | null {
    const lines = String(notes || '')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0 && s !== TECH_KPI_COMMISSION_POLICY_MARKER);

    if (enabled) lines.unshift(TECH_KPI_COMMISSION_POLICY_MARKER);
    if (lines.length === 0) return null;
    return lines.join('\n');
}

function hasTechKpiPolicyMarker(notes: string | null | undefined): boolean {
    return String(notes || '').includes(TECH_KPI_COMMISSION_POLICY_MARKER);
}

function getValidOrderFilter(onlyFullyPaid: boolean): string {
    return onlyFullyPaid
        ? 'payment_status.eq.paid'
        : 'payment_status.eq.paid,status.in.(done,completed,delivered,after_sale)';
}

async function calculateTechnicianCommissionByKpiPolicy(params: {
    userId: string;
    validOrderIds: string[];
    kpiFactor: number;
}) {
    const { userId, validOrderIds, kpiFactor } = params;
    if (!validOrderIds.length) {
        return {
            totalServiceFee: 0,
            totalAccessoryCost: 0,
            commissionAmount: 0,
        };
    }

    let totalServiceFee = 0;
    let totalAccessoryCost = 0;
    const v1ServiceItemIds: string[] = [];
    const v2ServiceIds: string[] = [];

    try {
        const { data: v1TechServices } = await supabaseAdmin
            .from('order_items')
            .select('id, total_price, item_type, order_id')
            .eq('technician_id', userId)
            .in('order_id', validOrderIds);

        if (v1TechServices) {
            for (const service of v1TechServices) {
                if ((service.item_type || '').toLowerCase() === 'product') continue;
                totalServiceFee += Number(service.total_price || 0);
                v1ServiceItemIds.push(service.id);
            }
        }
    } catch (error) {
        console.error('[PayrollBatch] V1 tech service commission policy error:', error);
    }

    try {
        const { data: v2TechServices } = await supabaseAdmin
            .from('order_product_service_technicians')
            .select('service:order_product_service_id ( id, unit_price, order_product:order_product_id ( order_id ) )')
            .eq('technician_id', userId);

        if (v2TechServices) {
            for (const row of v2TechServices) {
                const service = (row as any).service;
                const orderId = service?.order_product?.order_id;
                if (!orderId || !validOrderIds.includes(orderId)) continue;

                totalServiceFee += Number(service.unit_price || 0);
                if (service.id) v2ServiceIds.push(service.id);
            }
        }
    } catch (error) {
        console.error('[PayrollBatch] V2 tech service commission policy error:', error);
    }

    try {
        if (v1ServiceItemIds.length > 0) {
            const { data: v1Accessories } = await supabaseAdmin
                .from('order_item_accessories')
                .select('status, metadata')
                .in('order_item_id', v1ServiceItemIds);

            if (v1Accessories) {
                for (const accessory of v1Accessories) {
                    if (accessory.status === 'rejected') continue;
                    totalAccessoryCost += parseMoneyValue((accessory as any)?.metadata?.price_estimate);
                }
            }
        }
    } catch (error) {
        console.error('[PayrollBatch] V1 accessory policy error:', error);
    }

    try {
        if (v2ServiceIds.length > 0) {
            const { data: v2Accessories } = await supabaseAdmin
                .from('order_item_accessories')
                .select('status, metadata')
                .in('order_product_service_id', v2ServiceIds);

            if (v2Accessories) {
                for (const accessory of v2Accessories) {
                    if (accessory.status === 'rejected') continue;
                    totalAccessoryCost += parseMoneyValue((accessory as any)?.metadata?.price_estimate);
                }
            }
        }
    } catch (error) {
        console.error('[PayrollBatch] V2 accessory policy error:', error);
    }

    const commissionBase = Math.max(0, totalServiceFee - totalAccessoryCost);
    const commissionAmount = Math.floor(commissionBase * (kpiFactor / 100));

    return {
        totalServiceFee,
        totalAccessoryCost,
        commissionAmount,
    };
}

// ========== Helper: Create or get payroll batch for a month ==========
async function getOrCreatePayrollBatch(month: number, year: number, createdBy?: string) {
    // Check if batch already exists
    const { data: existing } = await supabaseAdmin
        .from('payroll_batches')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .single();

    if (existing) {
        if (existing.status === 'locked') {
            const { data: reopened } = await supabaseAdmin
                .from('payroll_batches')
                .update({ status: 'pending' })
                .eq('id', existing.id)
                .select()
                .single();
            return reopened || existing;
        }
        return existing;
    }

    // Create new batch
    const lastDay = new Date(year, month, 0).getDate();
    const workPeriodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const workPeriodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const { data: batch, error } = await supabaseAdmin
        .from('payroll_batches')
        .insert({
            code: '', // auto-generated via trigger
            name: `Bảng lương tháng ${month}/${year}`,
            month,
            year,
            pay_period: 'Hàng tháng',
            work_period_start: workPeriodStart,
            work_period_end: workPeriodEnd,
            status: 'pending',
            scope: 'Tất cả nhân viên',
            created_by: createdBy || null,
        })
        .select()
        .single();

    if (error) {
        console.error('[PayrollBatch] Error creating batch:', error);
        throw new ApiError('Lỗi khi tạo bảng lương: ' + error.message, 500);
    }

    return batch;
}

// ========== Helper: Recalculate batch totals from salary_records ==========
async function recalculateBatchTotals(batchId: string) {
    const { data: records } = await supabaseAdmin
        .from('salary_records')
        .select('gross_salary, net_salary, deduction, status')
        .eq('payroll_batch_id', batchId);

    if (!records) return;

        const totalSalary = records.reduce((s, r) => s + (r.net_salary || 0), 0);
    const totalPaid = records.reduce((s, r) => s + (r.status === 'paid' ? r.net_salary : 0), 0);

    await supabaseAdmin
        .from('payroll_batches')
        .update({
            total_salary: totalSalary,
            total_paid: totalPaid,
            total_remaining: totalSalary - totalPaid,
            employee_count: records.length,
        })
        .eq('id', batchId);
}

// ========================================================================
// ROUTES
// ========================================================================

// GET /api/payroll-batches - List all payroll batches
router.get('/', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { status, month, year } = req.query;

        let query = supabaseAdmin
            .from('payroll_batches')
            .select('*, creator:users!payroll_batches_created_by_fkey(id, name), approver:users!payroll_batches_approved_by_fkey(id, name)')
            .order('year', { ascending: false })
            .order('month', { ascending: false });

        if (status) query = query.eq('status', status);
        if (month) query = query.eq('month', Number(month));
        if (year) query = query.eq('year', Number(year));

        const { data: batches, error } = await query;

        if (error) {
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                return res.json({ status: 'success', data: { batches: [] } });
            }
            throw new ApiError('Lỗi khi lấy danh sách bảng lương: ' + error.message, 500);
        }

        res.json({ status: 'success', data: { batches: batches || [] } });
    } catch (error) {
        next(error);
    }
});

// GET /api/payroll-batches/:id - Get single batch with salary records
router.get('/:id', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: batch, error } = await supabaseAdmin
            .from('payroll_batches')
            .select('*, creator:users!payroll_batches_created_by_fkey(id, name), approver:users!payroll_batches_approved_by_fkey(id, name)')
            .eq('id', id)
            .single();

        if (error || !batch) throw new ApiError('Không tìm thấy bảng lương', 404);

        // Get salary records for this batch
        const { data: records } = await supabaseAdmin
            .from('salary_records')
            .select(`*, user:users!salary_records_user_id_fkey(id, name, email, avatar, department, role, employee_code)`)
            .eq('payroll_batch_id', id)
            .order('created_at', { ascending: false });

        res.json({
            status: 'success',
            data: { batch, records: records || [] },
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/payroll-batches/generate - Generate payroll batch for a month
// This calculates salary for ALL active employees and creates/updates the batch
router.post('/generate', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month, year, apply_technician_kpi_commission_policy: applyTechKpiPolicyRaw } = req.body;
        if (!month || !year) throw new ApiError('Thiếu tháng hoặc năm', 400);
        const applyTechKpiPolicy = Boolean(applyTechKpiPolicyRaw);

        // Create or get the batch
        let batch = await getOrCreatePayrollBatch(month, year, req.user!.id);
        const desiredNotes = setTechKpiPolicyMarker((batch as any)?.notes, applyTechKpiPolicy);
        if (((batch as any)?.notes || null) !== desiredNotes) {
            const { data: updatedBatch } = await supabaseAdmin
                .from('payroll_batches')
                .update({ notes: desiredNotes, updated_at: new Date().toISOString() })
                .eq('id', batch.id)
                .select('*')
                .single();
            if (updatedBatch) batch = updatedBatch;
        }

        // Get all active employees
        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('status', 'active');

        if (!users || users.length === 0) {
            return res.json({
                status: 'success',
                data: { batch, message: 'Không có nhân viên active' },
            });
        }

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        for (const user of users) {
            try {
                const { data: userData } = await supabaseAdmin
                    .from('users')
                    .select('id, name, base_salary, hourly_rate, role')
                    .eq('id', user.id)
                    .single();

                if (!userData) continue;

                const salaryBasis = await resolveSalaryBasis(user.id, userData);
                const { salaryConfig, salaryType, baseAmount, standardWorkDays, hourlyRate } = salaryBasis;

                // ── Commission breakdown ──
                let serviceCommission = 0, productCommission = 0, referralCommission = 0;
                try {
                    const { data: commissions } = await supabaseAdmin
                        .from('commissions')
                        .select('amount, commission_type')
                        .eq('user_id', user.id)
                        .in('status', ['pending', 'approved'])
                        .gte('created_at', startDate)
                        .lte('created_at', endDate + 'T23:59:59');
                    if (commissions) {
                        for (const c of commissions) {
                            if (c.commission_type === 'referral') referralCommission += (c.amount || 0);
                            else serviceCommission += (c.amount || 0);
                        }
                    }
                } catch (e) { /* table may not exist */ }

                // validOrders for commissions
                let validOrderIds: string[] = [];
                try {
                    const { data: validOrders } = await supabaseAdmin
                        .from('orders')
                        .select('id')
                        .or(getValidOrderFilter(applyTechKpiPolicy))
                        .gte('created_at', startDate)
                        .lte('created_at', endDate + 'T23:59:59');
                    if (validOrders && validOrders.length > 0) {
                        validOrderIds = validOrders.map(o => o.id);
                    }
                } catch (e) { /* ignore */ }

                if (validOrderIds.length > 0) {
                    // Legacy: Sales commissions from order_items
                    try {
                        const { data: salesOrders } = await supabaseAdmin
                            .from('orders')
                            .select('id')
                            .eq('sales_id', user.id)
                            .in('id', validOrderIds);
                        
                        if (salesOrders && salesOrders.length > 0) {
                            const { data: salesItems } = await supabaseAdmin
                                .from('order_items')
                                .select('commission_sale_amount, item_type')
                                .in('order_id', salesOrders.map(o => o.id));
                            if (salesItems) {
                                for (const item of salesItems) {
                                    if (item.item_type === 'product') productCommission += (item.commission_sale_amount || 0);
                                    else serviceCommission += (item.commission_sale_amount || 0);
                                }
                            }
                        }
                    } catch (e) { /* ignore */ }

                    // Legacy: Tech commissions from order_items
                    try {
                        const { data: techItems } = await supabaseAdmin
                            .from('order_items')
                            .select('commission_tech_amount')
                            .eq('technician_id', user.id)
                            .in('order_id', validOrderIds);
                        if (techItems) {
                            for (const item of techItems) {
                                serviceCommission += (item.commission_tech_amount || 0);
                            }
                        }
                    } catch (e) { /* ignore */ }

                    // V2: Sales commissions from order_item_sales
                    try {
                        const { data: saleItems } = await supabaseAdmin
                             .from('order_item_sales')
                             .select('commission, item:order_item_id ( total_price, order_id )')
                             .eq('sale_id', user.id);
                        if (saleItems) {
                            for (const row of saleItems) {
                                const orderId = (row as any).item?.order_id;
                                if (orderId && validOrderIds.includes(orderId)) {
                                    const price = (row as any).item?.total_price || 0;
                                    const rate = row.commission || 0;
                                    productCommission += Math.floor((price * rate) / 100);
                                }
                            }
                        }
                    } catch(e){}

                    // V2: Sales commissions from order_product_service_sales
                    try {
                        const { data: saleServices } = await supabaseAdmin
                             .from('order_product_service_sales')
                             .select('commission, service:order_product_service_id ( unit_price, order_product:order_product_id ( order_id ) )')
                             .eq('sale_id', user.id);
                        if (saleServices) {
                            for (const row of saleServices) {
                                const orderId = (row as any).service?.order_product?.order_id;
                                if (orderId && validOrderIds.includes(orderId)) {
                                    const price = (row as any).service?.unit_price || 0;
                                    const rate = row.commission || 0;
                                    serviceCommission += Math.floor((price * rate) / 100);
                                }
                            }
                        }
                    } catch(e){}

                    // V2: Tech commissions from order_product_service_technicians
                    try {
                        const { data: techServices } = await supabaseAdmin
                             .from('order_product_service_technicians')
                             .select('commission, service:order_product_service_id ( unit_price, order_product:order_product_id ( order_id ) )')
                             .eq('technician_id', user.id);
                        if (techServices) {
                            for (const row of techServices) {
                                const orderId = (row as any).service?.order_product?.order_id;
                                if (orderId && validOrderIds.includes(orderId)) {
                                    const price = (row as any).service?.unit_price || 0;
                                    const rate = row.commission || 0;
                                    serviceCommission += Math.floor((price * rate) / 100);
                                }
                            }
                        }
                    } catch(e){}
                }

                let totalCommission = (salaryConfig?.commission_enabled === false) ? 0 : serviceCommission + productCommission + referralCommission;

                // ── Timesheets ──
                const attendanceSalary = await resolveApprovedAttendanceSalary({
                    userId: user.id,
                    startDate,
                    endDate,
                    baseAmount,
                    salaryType,
                    standardWorkDays,
                    hourlyRate,
                    overtimeEnabled: !!salaryConfig?.overtime_enabled,
                });
                const { totalHours, overtimeHours, baseSalary, hourlyWage, overtimePay } = attendanceSalary;

                // ── KPI (from kpi_monthly locked records) ──
                const monthKey = `${year}-${String(month).padStart(2, '0')}`;
                const kpiPayroll = await resolveEmployeeKpiForPayroll(user.id, monthKey);
                let kpiAchievement = kpiPayroll.primary.score;
                let kpiBonus = kpiPayroll.primary.bonus;
                let kpiPenalty = kpiPayroll.primary.penalty;
                let kpiFactor = kpiPayroll.primary.commissionFactor;
                const kpiTeamleadBonus = kpiPayroll.teamleadBonus;
                const kpiManagementBonus = kpiPayroll.managementBonus;
                let techServiceFeeTotal: number | null = null;
                let techAccessoryCostTotal: number | null = null;
                let techCommissionFinal: number | null = null;
                let techCommissionPolicyApplied = false;

                if (applyTechKpiPolicy && userData.role === 'technician') {
                    const policyResult = await calculateTechnicianCommissionByKpiPolicy({
                        userId: user.id,
                        validOrderIds,
                        kpiFactor,
                    });
                    serviceCommission = policyResult.commissionAmount;
                    productCommission = 0;
                    referralCommission = 0;
                    techServiceFeeTotal = policyResult.totalServiceFee;
                    techAccessoryCostTotal = policyResult.totalAccessoryCost;
                    techCommissionFinal = policyResult.commissionAmount;
                    techCommissionPolicyApplied = true;
                }

                // ── Violations / Rewards ──
                let totalRewards = 0, totalViolationAmount = 0;
                try {
                    const { data: vrRecords } = await supabaseAdmin
                        .from('violations_rewards')
                        .select('type, amount')
                        .eq('user_id', user.id)
                        .eq('month', month)
                        .eq('year', year);
                    if (vrRecords) {
                        for (const r of vrRecords) {
                            if (r.type === 'reward') totalRewards += Number(r.amount);
                            else totalViolationAmount += Number(r.amount);
                        }
                    }
                } catch (e) { /* ignore */ }

                // ── Advances ──
                let totalAdvances = 0;
                try {
                    const { data: advances } = await supabaseAdmin
                        .from('salary_advances')
                        .select('amount')
                        .eq('user_id', user.id)
                        .eq('month', month)
                        .eq('year', year)
                        .eq('status', 'approved');
                    if (advances) totalAdvances = advances.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
                } catch (e) { /* ignore */ }

                // ── Final calculation (aligned with salary.ts formula) ──
                totalCommission = (salaryConfig?.commission_enabled === false) ? 0 : serviceCommission + productCommission + referralCommission;
                if (totalCommission > 0 && !(applyTechKpiPolicy && userData.role === 'technician')) {
                    totalCommission = Math.floor(totalCommission * (kpiFactor / 100));
                }
                const allowance = salaryConfig?.allowance_enabled ? toNumber(salaryConfig.allowance_amount) : 0;
                const totalBonus = kpiBonus + totalRewards + kpiTeamleadBonus + kpiManagementBonus + allowance;
                const grossSalary = baseSalary + overtimePay + totalCommission + totalBonus;
                const socialInsurance = 0;
                const healthInsurance = 0;
                const personalTax = 0;
                const totalDeduction = socialInsurance + healthInsurance + personalTax + totalAdvances + totalViolationAmount + kpiPenalty;
                const netSalary = grossSalary - totalDeduction;

                const salaryData = {
                    user_id: user.id,
                    month,
                    year,
                    base_salary: baseSalary,
                    hourly_rate: hourlyRate,
                    hourly_wage: hourlyWage,
                    overtime_pay: overtimePay,
                    total_hours: totalHours,
                    overtime_hours: overtimeHours,
                    service_commission: serviceCommission,
                    product_commission: productCommission,
                    referral_commission: referralCommission,
                    commission: totalCommission,
                    tech_service_fee_total: techServiceFeeTotal,
                    tech_accessory_cost_total: techAccessoryCostTotal,
                    tech_commission_final: techCommissionFinal,
                    tech_commission_policy_applied: techCommissionPolicyApplied,
                    kpi_achievement: kpiAchievement,
                    kpi_primary_score: kpiAchievement,
                    kpi_primary_rank: kpiPayroll.primary.rank,
                    kpi_primary_bonus: kpiPayroll.primary.bonus,
                    kpi_primary_penalty: kpiPayroll.primary.penalty,
                    kpi_primary_commission_factor: kpiPayroll.primary.commissionFactor,
                    kpi_secondary_details: kpiPayroll.secondaryDetails.length > 0 ? kpiPayroll.secondaryDetails : null,
                    teamlead_bonus: kpiTeamleadBonus,
                    management_bonus: kpiManagementBonus,
                    bonus: totalBonus,
                    social_insurance: socialInsurance,
                    health_insurance: healthInsurance,
                    personal_tax: personalTax,
                    advances: totalAdvances,
                    deduction: totalDeduction,
                    gross_salary: grossSalary,
                    net_salary: netSalary,
                    status: 'draft',
                    payroll_batch_id: batch.id,
                };

                // Upsert
                const { data: existing } = await supabaseAdmin
                    .from('salary_records')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('month', month)
                    .eq('year', year)
                    .single();

                if (existing) {
                    await supabaseAdmin
                        .from('salary_records')
                        .update({ ...salaryData, updated_at: new Date().toISOString() })
                        .eq('id', existing.id);
                } else {
                    await supabaseAdmin
                        .from('salary_records')
                        .insert({ ...salaryData, created_by: req.user!.id });
                }
            } catch (e) {
                console.error(`[PayrollBatch] Error calculating for user ${user.id}:`, e);
            }
        }

        // Mark advances as deducted
        try {
            await supabaseAdmin
                .from('salary_advances')
                .update({ status: 'deducted', deducted_at: new Date().toISOString() })
                .eq('month', month)
                .eq('year', year)
                .eq('status', 'approved');
        } catch (e) { /* table may not exist */ }

        // Recalculate totals
        await recalculateBatchTotals(batch.id);

        // Fetch updated batch
        const { data: updatedBatch } = await supabaseAdmin
            .from('payroll_batches')
            .select('*')
            .eq('id', batch.id)
            .single();

        res.json({
            status: 'success',
            data: { batch: updatedBatch },
            message: `Đã tạo bảng lương tháng ${month}/${year} cho ${users.length} nhân viên`,
        });
    } catch (error) {
        next(error);
    }
});

// PATCH /api/payroll-batches/:id/status - Update batch status
router.patch('/:id/status', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const updateData: Record<string, any> = { status };
        if (status === 'approved') {
            updateData.approved_by = req.user!.id;
            updateData.approved_at = new Date().toISOString();
        }

        const { data: batch, error } = await supabaseAdmin
            .from('payroll_batches')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new ApiError('Lỗi khi cập nhật trạng thái', 500);

        res.json({ status: 'success', data: { batch } });
    } catch (error) {
        next(error);
    }
});

// POST /api/payroll-batches/auto-create - Auto-create batch for current month
// Called by cron on last Sunday of month
router.post('/auto-create', async (req, res, next) => {
    try {
        // Verify cron secret
        const secret = req.headers['x-cron-secret'] || req.query.secret;
        const expectedSecret = process.env.CRON_SECRET;
        if (expectedSecret && secret !== expectedSecret) {
            throw new ApiError('Unauthorized', 401);
        }

        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        // Check if today is the last Sunday
        const lastSunday = getLastSundayOfMonth(year, month);
        const isLastSunday = now.getDate() === lastSunday.getDate() &&
            now.getMonth() === lastSunday.getMonth() &&
            now.getFullYear() === lastSunday.getFullYear();

        if (!isLastSunday) {
            return res.json({
                status: 'skipped',
                message: `Hôm nay không phải chủ nhật cuối tháng. Chủ nhật cuối: ${lastSunday.toISOString().split('T')[0]}`,
            });
        }

        // Create batch
        const batch = await getOrCreatePayrollBatch(month, year);

        console.log(`[PayrollBatch] Auto-created batch for ${month}/${year}: ${batch.code}`);

        res.json({
            status: 'success',
            data: { batch },
            message: `Đã tự động tạo bảng lương tháng ${month}/${year}`,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/payroll-batches/:id/recalculate - Recalculate all salary records in a batch from source data
router.post('/:id/recalculate', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { apply_technician_kpi_commission_policy: applyTechKpiPolicyRaw } = req.body || {};

        const { data: batch, error: batchErr } = await supabaseAdmin
            .from('payroll_batches')
            .select('*')
            .eq('id', id)
            .single();

        if (batchErr || !batch) throw new ApiError('Không tìm thấy bảng lương', 404);
        if (batch.status === 'locked') throw new ApiError('Bảng lương đã khóa, không thể tính lại', 400);
        const applyTechKpiPolicy = (applyTechKpiPolicyRaw === undefined || applyTechKpiPolicyRaw === null)
            ? hasTechKpiPolicyMarker((batch as any)?.notes)
            : Boolean(applyTechKpiPolicyRaw);
        if (!(applyTechKpiPolicyRaw === undefined || applyTechKpiPolicyRaw === null)) {
            const desiredNotes = setTechKpiPolicyMarker((batch as any)?.notes, applyTechKpiPolicy);
            if (((batch as any)?.notes || null) !== desiredNotes) {
                await supabaseAdmin
                    .from('payroll_batches')
                    .update({ notes: desiredNotes, updated_at: new Date().toISOString() })
                    .eq('id', id);
            }
        }

        const { month, year } = batch;
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        // Get all employees currently in this batch
        const { data: existingRecords } = await supabaseAdmin
            .from('salary_records')
            .select('user_id')
            .eq('payroll_batch_id', id);

        const userIds = existingRecords?.map(r => r.user_id) || [];

        if (userIds.length === 0) {
            return res.json({ status: 'success', data: { batch }, message: 'Không có nhân viên trong bảng lương' });
        }

        // Reset advances back to 'approved' so they can be picked up again
        try {
            await supabaseAdmin
                .from('salary_advances')
                .update({ status: 'approved', deducted_at: null, salary_record_id: null })
                .eq('month', month)
                .eq('year', year)
                .eq('status', 'deducted');
        } catch (e) { /* ignore */ }

        for (const userId of userIds) {
            try {
                const { data: userData } = await supabaseAdmin
                    .from('users')
                    .select('id, name, base_salary, hourly_rate, role')
                    .eq('id', userId)
                    .single();

                if (!userData) continue;

                const salaryBasis = await resolveSalaryBasis(userId, userData);
                const { salaryConfig, salaryType, baseAmount, standardWorkDays, hourlyRate } = salaryBasis;

                // ── Commission breakdown ──
                let serviceCommission = 0, productCommission = 0, referralCommission = 0;
                try {
                    const { data: commissions } = await supabaseAdmin
                        .from('commissions')
                        .select('amount, commission_type')
                        .eq('user_id', userId)
                        .in('status', ['pending', 'approved'])
                        .gte('created_at', startDate)
                        .lte('created_at', endDate + 'T23:59:59');
                    if (commissions) {
                        for (const c of commissions) {
                            if (c.commission_type === 'referral') referralCommission += (c.amount || 0);
                            else serviceCommission += (c.amount || 0);
                        }
                    }
                } catch (e) { /* table may not exist */ }

                let validOrderIds: string[] = [];
                try {
                    const { data: validOrders } = await supabaseAdmin
                        .from('orders')
                        .select('id')
                        .or(getValidOrderFilter(applyTechKpiPolicy))
                        .gte('created_at', startDate)
                        .lte('created_at', endDate + 'T23:59:59');
                    if (validOrders && validOrders.length > 0) {
                        validOrderIds = validOrders.map(o => o.id);
                    }
                } catch (e) { /* ignore */ }

                if (validOrderIds.length > 0) {
                    try {
                        const { data: salesOrders } = await supabaseAdmin
                            .from('orders').select('id').eq('sales_id', userId).in('id', validOrderIds);
                        if (salesOrders && salesOrders.length > 0) {
                            const { data: salesItems } = await supabaseAdmin
                                .from('order_items').select('commission_sale_amount, item_type').in('order_id', salesOrders.map(o => o.id));
                            if (salesItems) {
                                for (const item of salesItems) {
                                    if (item.item_type === 'product') productCommission += (item.commission_sale_amount || 0);
                                    else serviceCommission += (item.commission_sale_amount || 0);
                                }
                            }
                        }
                    } catch (e) { /* ignore */ }

                    try {
                        const { data: techItems } = await supabaseAdmin
                            .from('order_items').select('commission_tech_amount').eq('technician_id', userId).in('order_id', validOrderIds);
                        if (techItems) {
                            for (const item of techItems) serviceCommission += (item.commission_tech_amount || 0);
                        }
                    } catch (e) { /* ignore */ }

                    try {
                        const { data: saleItems } = await supabaseAdmin
                            .from('order_item_sales')
                            .select('commission, item:order_item_id ( total_price, order_id )')
                            .eq('sale_id', userId);
                        if (saleItems) {
                            for (const row of saleItems) {
                                const orderId = (row as any).item?.order_id;
                                if (orderId && validOrderIds.includes(orderId)) {
                                    productCommission += Math.floor(((row as any).item?.total_price || 0) * (row.commission || 0) / 100);
                                }
                            }
                        }
                    } catch (e) { }

                    try {
                        const { data: saleServices } = await supabaseAdmin
                            .from('order_product_service_sales')
                            .select('commission, service:order_product_service_id ( unit_price, order_product:order_product_id ( order_id ) )')
                            .eq('sale_id', userId);
                        if (saleServices) {
                            for (const row of saleServices) {
                                const orderId = (row as any).service?.order_product?.order_id;
                                if (orderId && validOrderIds.includes(orderId)) {
                                    serviceCommission += Math.floor(((row as any).service?.unit_price || 0) * (row.commission || 0) / 100);
                                }
                            }
                        }
                    } catch (e) { }

                    try {
                        const { data: techServices } = await supabaseAdmin
                            .from('order_product_service_technicians')
                            .select('commission, service:order_product_service_id ( unit_price, order_product:order_product_id ( order_id ) )')
                            .eq('technician_id', userId);
                        if (techServices) {
                            for (const row of techServices) {
                                const orderId = (row as any).service?.order_product?.order_id;
                                if (orderId && validOrderIds.includes(orderId)) {
                                    serviceCommission += Math.floor(((row as any).service?.unit_price || 0) * (row.commission || 0) / 100);
                                }
                            }
                        }
                    } catch (e) { }
                }

                let totalCommission = (salaryConfig?.commission_enabled === false) ? 0 : serviceCommission + productCommission + referralCommission;

                // ── Timesheets ──
                const attendanceSalary = await resolveApprovedAttendanceSalary({
                    userId,
                    startDate,
                    endDate,
                    baseAmount,
                    salaryType,
                    standardWorkDays,
                    hourlyRate,
                    overtimeEnabled: !!salaryConfig?.overtime_enabled,
                });
                const { totalHours, overtimeHours, baseSalary, hourlyWage, overtimePay } = attendanceSalary;

                // ── KPI ──
                let kpiAchievement = 0, kpiBonus = 0, kpiPenalty = 0, kpiFactor = 100.0;
                let kpiPrimaryRank: string | null = null;
                let kpiTeamleadBonus = 0, kpiManagementBonus = 0;
                let kpiSecondaryDetails: any[] = [];
                let techServiceFeeTotal: number | null = null;
                let techAccessoryCostTotal: number | null = null;
                let techCommissionFinal: number | null = null;
                let techCommissionPolicyApplied = false;
                try {
                    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
                    const kpiPayrollRec = await resolveEmployeeKpiForPayroll(userId, monthKey);
                    kpiAchievement = kpiPayrollRec.primary.score;
                    kpiBonus = kpiPayrollRec.primary.bonus;
                    kpiPenalty = kpiPayrollRec.primary.penalty;
                    kpiFactor = kpiPayrollRec.primary.commissionFactor;
                    kpiPrimaryRank = kpiPayrollRec.primary.rank;
                    kpiTeamleadBonus = kpiPayrollRec.teamleadBonus;
                    kpiManagementBonus = kpiPayrollRec.managementBonus;
                    kpiSecondaryDetails = kpiPayrollRec.secondaryDetails;
                } catch (e) { /* ignore */ }

                if (applyTechKpiPolicy && userData.role === 'technician') {
                    const policyResult = await calculateTechnicianCommissionByKpiPolicy({
                        userId,
                        validOrderIds,
                        kpiFactor,
                    });
                    serviceCommission = policyResult.commissionAmount;
                    productCommission = 0;
                    referralCommission = 0;
                    techServiceFeeTotal = policyResult.totalServiceFee;
                    techAccessoryCostTotal = policyResult.totalAccessoryCost;
                    techCommissionFinal = policyResult.commissionAmount;
                    techCommissionPolicyApplied = true;
                }

                // ── Violations / Rewards ──
                let totalRewards = 0, totalViolationAmount = 0;
                try {
                    const { data: vrRecords } = await supabaseAdmin
                        .from('violations_rewards')
                        .select('type, amount')
                        .eq('user_id', userId)
                        .eq('month', month)
                        .eq('year', year);
                    if (vrRecords) {
                        for (const r of vrRecords) {
                            if (r.type === 'reward') totalRewards += Number(r.amount);
                            else totalViolationAmount += Number(r.amount);
                        }
                    }
                } catch (e) { /* ignore */ }

                // ── Advances ──
                let totalAdvances = 0;
                try {
                    const { data: advances } = await supabaseAdmin
                        .from('salary_advances')
                        .select('amount')
                        .eq('user_id', userId)
                        .eq('month', month)
                        .eq('year', year)
                        .eq('status', 'approved');
                    if (advances) totalAdvances = advances.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
                } catch (e) { /* ignore */ }

                // ── Preserve manual bonus/deduction details ──
                let bonusDetails: any = null;
                let deductionDetails: any = null;
                let manualBonus = 0;
                let manualDeduction = 0;
                try {
                    const { data: existingRec } = await supabaseAdmin
                        .from('salary_records')
                        .select('bonus_details, deduction_details')
                        .eq('user_id', userId)
                        .eq('payroll_batch_id', id)
                        .single();
                    if (existingRec?.bonus_details) {
                        bonusDetails = existingRec.bonus_details;
                        const dSum = (bonusDetails.byDay || []).reduce((s: number, b: any) => s + (b.amount || 0) * (b.count || 1), 0);
                        const oSum = (bonusDetails.other || []).reduce((s: number, b: any) => s + (b.amount || 0) * (b.count || 1), 0);
                        manualBonus = dSum + oSum;
                    }
                    if (existingRec?.deduction_details) {
                        deductionDetails = existingRec.deduction_details;
                        const dSum = (deductionDetails.byDay || []).reduce((s: number, d: any) => s + (d.amount || 0) * (d.count || 1), 0);
                        const oSum = (deductionDetails.other || []).reduce((s: number, d: any) => s + (d.amount || 0) * (d.count || 1), 0);
                        manualDeduction = dSum + oSum;
                    }
                } catch (e) { /* ignore */ }

                // ── Final calculation ──
                totalCommission = (salaryConfig?.commission_enabled === false) ? 0 : serviceCommission + productCommission + referralCommission;
                if (totalCommission > 0 && !(applyTechKpiPolicy && userData.role === 'technician')) {
                    totalCommission = Math.floor(totalCommission * (kpiFactor / 100));
                }
                const allowance = salaryConfig?.allowance_enabled ? toNumber(salaryConfig.allowance_amount) : 0;
                const totalBonus = kpiBonus + totalRewards + kpiTeamleadBonus + kpiManagementBonus + manualBonus + allowance;
                const grossSalary = baseSalary + overtimePay + totalCommission + totalBonus;
                const socialInsurance = 0;
                const healthInsurance = 0;
                const personalTax = 0;
                const totalDeduction = socialInsurance + healthInsurance + personalTax + totalAdvances + totalViolationAmount + kpiPenalty + manualDeduction;
                const netSalary = grossSalary - totalDeduction;

                const salaryData = {
                    base_salary: baseSalary,
                    hourly_rate: hourlyRate,
                    hourly_wage: hourlyWage,
                    overtime_pay: overtimePay,
                    total_hours: totalHours,
                    overtime_hours: overtimeHours,
                    service_commission: serviceCommission,
                    product_commission: productCommission,
                    referral_commission: referralCommission,
                    commission: totalCommission,
                    tech_service_fee_total: techServiceFeeTotal,
                    tech_accessory_cost_total: techAccessoryCostTotal,
                    tech_commission_final: techCommissionFinal,
                    tech_commission_policy_applied: techCommissionPolicyApplied,
                    kpi_achievement: kpiAchievement,
                    kpi_primary_score: kpiAchievement,
                    kpi_primary_rank: kpiPrimaryRank,
                    kpi_primary_bonus: kpiBonus,
                    kpi_primary_penalty: kpiPenalty,
                    kpi_primary_commission_factor: kpiFactor,
                    kpi_secondary_details: kpiSecondaryDetails.length > 0 ? kpiSecondaryDetails : null,
                    teamlead_bonus: kpiTeamleadBonus,
                    management_bonus: kpiManagementBonus,
                    bonus: totalBonus,
                    bonus_details: bonusDetails,
                    social_insurance: socialInsurance,
                    health_insurance: healthInsurance,
                    personal_tax: personalTax,
                    advances: totalAdvances,
                    deduction: totalDeduction,
                    deduction_details: deductionDetails,
                    gross_salary: grossSalary,
                    net_salary: netSalary,
                    updated_at: new Date().toISOString(),
                };

                await supabaseAdmin
                    .from('salary_records')
                    .update(salaryData)
                    .eq('user_id', userId)
                    .eq('payroll_batch_id', id);

                // Mark advances as deducted
                if (totalAdvances > 0) {
                    try {
                        await supabaseAdmin
                            .from('salary_advances')
                            .update({ status: 'deducted', deducted_at: new Date().toISOString() })
                            .eq('user_id', userId)
                            .eq('month', month)
                            .eq('year', year)
                            .eq('status', 'approved');
                    } catch (e) { /* ignore */ }
                }
            } catch (e) {
                console.error(`[PayrollBatch] Recalculate error for user ${userId}:`, e);
            }
        }

        // Recalculate batch totals
        await recalculateBatchTotals(id);

        // Update batch updated_at timestamp
        await supabaseAdmin
            .from('payroll_batches')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', id);

        // Return updated batch + records
        const { data: updatedBatch } = await supabaseAdmin
            .from('payroll_batches')
            .select('*, creator:users!payroll_batches_created_by_fkey(id, name), approver:users!payroll_batches_approved_by_fkey(id, name)')
            .eq('id', id)
            .single();

        const { data: updatedRecords } = await supabaseAdmin
            .from('salary_records')
            .select('*, user:users!salary_records_user_id_fkey(id, name, email, avatar, department, role, employee_code)')
            .eq('payroll_batch_id', id)
            .order('created_at', { ascending: false });

        res.json({
            status: 'success',
            data: { batch: updatedBatch, records: updatedRecords || [] },
            message: `Đã tính lại lương cho ${userIds.length} nhân viên`,
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/payroll-batches/:id - Cancel/delete a batch
router.delete('/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: batch } = await supabaseAdmin.from('payroll_batches').select('status').eq('id', id).single();
        if (batch?.status === 'paid') {
            throw new ApiError('Không thể xóa bảng lương đã thanh toán', 400);
        }

        // Hard delete salary records first (in case there's no cascade constraint)
        await supabaseAdmin.from('salary_records').delete().eq('payroll_batch_id', id);

        // Delete the batch
        const { error } = await supabaseAdmin
            .from('payroll_batches')
            .delete()
            .eq('id', id);

        if (error) throw new ApiError('Lỗi khi xóa bảng lương', 500);

        res.json({ status: 'success', message: 'Đã xóa bảng lương thành công' });
    } catch (error) {
        next(error);
    }
});

export { router as payrollBatchesRouter };
