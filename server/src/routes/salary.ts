import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireAccountant, requireManager } from '../middleware/auth.js';
import { fireWebhook } from '../utils/webhookNotifier.js';
import { resolveEmployeeKpiForPayroll } from '../utils/kpiPayrollResolver.js';

const router = Router();

// Get salary list by period
router.get('/', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month, year, status } = req.query;
        const currentMonth = month || new Date().getMonth() + 1;
        const currentYear = year || new Date().getFullYear();

        let query = supabaseAdmin
            .from('salary_records')
            .select(`
        *,
        user:users!salary_records_user_id_fkey(id, name, email, avatar, department, role, employee_code)
      `)
            .eq('month', currentMonth)
            .eq('year', currentYear)
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data: salaries, error } = await query;

        if (error) {
            console.error('Salary query error:', error);
            // If table doesn't exist, return empty data instead of error
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                return res.json({
                    status: 'success',
                    data: {
                        salaries: [],
                        summary: {
                            totalBaseSalary: 0,
                            totalCommission: 0,
                            totalBonus: 0,
                            totalDeduction: 0,
                            totalNet: 0,
                            count: 0,
                            month: currentMonth,
                            year: currentYear,
                        }
                    },
                    message: 'Bảng salary_records chưa được tạo. Vui lòng chạy migration.'
                });
            }
            throw new ApiError('Lỗi khi lấy danh sách lương: ' + error.message, 500);
        }

        // Tính tổng
        const totalBaseSalary = salaries?.reduce((sum, s) => sum + s.base_salary, 0) || 0;
        const totalCommission = salaries?.reduce((sum, s) => sum + s.commission, 0) || 0;
        const totalBonus = salaries?.reduce((sum, s) => sum + s.bonus, 0) || 0;
        const totalDeduction = salaries?.reduce((sum, s) => sum + s.deduction, 0) || 0;
        const totalNet = salaries?.reduce((sum, s) => sum + s.net_salary, 0) || 0;

        res.json({
            status: 'success',
            data: {
                salaries,
                summary: {
                    totalBaseSalary,
                    totalCommission,
                    totalBonus,
                    totalDeduction,
                    totalNet,
                    count: salaries?.length || 0,
                    month: currentMonth,
                    year: currentYear,
                }
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get salary by user
router.get('/user/:userId', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { userId } = req.params;
        const { year } = req.query;
        const currentYear = year || new Date().getFullYear();

        // Chỉ cho phép xem lương của chính mình hoặc quản lý
        if (req.user!.id !== userId && req.user!.role !== 'manager' && req.user!.role !== 'accountant') {
            throw new ApiError('Không có quyền xem lương người khác', 403);
        }

        const { data: salaries, error } = await supabaseAdmin
            .from('salary_records')
            .select('*')
            .eq('user_id', userId)
            .eq('year', currentYear)
            .order('month', { ascending: true });

        if (error) {
            throw new ApiError('Lỗi khi lấy lương', 500);
        }

        res.json({
            status: 'success',
            data: { salaries },
        });
    } catch (error) {
        next(error);
    }
});

// Get commission details for user
router.get('/user/:userId/commissions', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { userId } = req.params;
        const { month, year } = req.query;

        if (!month || !year) {
            throw new ApiError('Thiếu tháng hoặc năm', 400);
        }

        const m = Number(month);
        const y = Number(year);
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const endDate = new Date(y, m, 0).toISOString().split('T')[0];

        const details: any[] = [];

        // 1. Commissions table
        try {
            const { data: commissions } = await supabaseAdmin
                .from('commissions')
                .select('amount, commission_type, created_at, order_id, notes')
                .eq('user_id', userId)
                .in('status', ['pending', 'approved'])
                .gte('created_at', startDate)
                .lte('created_at', endDate + 'T23:59:59');

            if (commissions) {
                for (const c of commissions) {
                    details.push({
                        invoice: c.order_id || c.notes || 'Khác',
                        time: new Date(c.created_at).toLocaleDateString('vi-VN'),
                        customer_name: '--',
                        type: c.commission_type === 'referral' ? 'Hoa hồng giới thiệu' : 'Hoa hồng dịch vụ',
                        product_name: '--',
                        quantity: 1,
                        revenue: 0,
                        rate: '--',
                        commission_amount: c.amount || 0
                    });
                }
            }
        } catch (e) { }

        // Step 1: Fetch all valid orders for this timeframe
        let validOrders: any[] = [];
        try {
            const { data } = await supabaseAdmin
                .from('orders')
                .select('id, order_code, created_at, customer:customers(name)')
                .or('payment_status.eq.paid,status.in.(done,completed,delivered,after_sale)')
                .gte('created_at', startDate)
                .lte('created_at', endDate + 'T23:59:59');
            if (data) validOrders = data;
        } catch (e) {
            console.error('Error fetching valid orders', e);
        }

        const validOrderIds = validOrders.map(o => o.id);
        const getOrderMeta = (orderId: string) => {
            const o = validOrders.find(x => x.id === orderId);
            const cName = o?.customer && !Array.isArray(o.customer) ? o.customer.name : '--';
            return {
                invoice: o?.order_code || orderId,
                time: o?.created_at ? new Date(o.created_at).toLocaleDateString('vi-VN') : '--',
                customer_name: cName
            };
        };

        if (validOrderIds.length > 0) {
            // 2. Legacy: sales from order_items
            try {
                const { data: salesOrders } = await supabaseAdmin
                    .from('orders')
                    .select('id')
                    .eq('sales_id', userId)
                    .in('id', validOrderIds);
                if (salesOrders && salesOrders.length > 0) {
                    const { data: items } = await supabaseAdmin
                        .from('order_items')
                        .select('*')
                        .in('order_id', salesOrders.map(o => o.id));
                    if (items) {
                        for (const item of items) {
                            if (item.commission_sale_amount > 0) {
                                const meta = getOrderMeta(item.order_id);
                                details.push({
                                    ...meta,
                                    type: item.item_type === 'product' ? 'Bán hàng hóa' : 'Bán dịch vụ',
                                    product_name: item.item_name || item.product_name || item.service_name || '--',
                                    quantity: item.quantity || item.qty || 1,
                                    revenue: (item.unit_price || item.price || 0) * (item.quantity || 1),
                                    rate: `${item.commission_sale_rate || item.commission_sale || 0}%`,
                                    commission_amount: item.commission_sale_amount
                                });
                            }
                        }
                    }
                }
            } catch (e) { }

            // 3. Legacy: tech from order_items
            try {
                const { data: items } = await supabaseAdmin
                    .from('order_items')
                    .select('*')
                    .eq('technician_id', userId)
                    .in('order_id', validOrderIds);
                if (items) {
                    for (const item of items) {
                        if (item.commission_tech_amount > 0) {
                            const meta = getOrderMeta(item.order_id);
                            details.push({
                                ...meta,
                                type: 'Thực hiện dịch vụ',
                                product_name: item.item_name || item.product_name || item.service_name || '--',
                                quantity: item.quantity || item.qty || 1,
                                revenue: (item.unit_price || item.price || 0) * (item.quantity || 1),
                                rate: `${item.commission_tech_rate || item.commission_tech || 0}%`,
                                commission_amount: item.commission_tech_amount
                            });
                        }
                    }
                }
            } catch (e) { }

            // 4. V2: sales from order_item_sales
            try {
                const { data: saleItems } = await supabaseAdmin
                    .from('order_item_sales')
                    .select('commission, item:order_item_id ( id, order_id, item_name, total_price, quantity )')
                    .eq('sale_id', userId);
                if (saleItems) {
                    for (const row of saleItems) {
                        const item = (row as any).item;
                        if (item && validOrderIds.includes(item.order_id)) {
                            const meta = getOrderMeta(item.order_id);
                            const rev = item.total_price || 0;
                            const rate = row.commission || 0;
                            const amt = Math.floor((rev * rate) / 100);
                            if (amt > 0) {
                                details.push({
                                    ...meta,
                                    type: 'Bán hàng hóa',
                                    product_name: item.item_name || '--',
                                    quantity: item.quantity || 1,
                                    revenue: rev,
                                    rate: `${rate}%`,
                                    commission_amount: amt
                                });
                            }
                        }
                    }
                }
            } catch (e) { }

            // 5. V2: sales from order_product_service_sales
            try {
                const { data: saleServices } = await supabaseAdmin
                    .from('order_product_service_sales')
                    .select('commission, service:order_product_service_id ( id, item_name, unit_price, order_product:order_product_id ( order_id ) )')
                    .eq('sale_id', userId);
                if (saleServices) {
                    for (const row of saleServices) {
                        const svc = (row as any).service;
                        const orderId = svc?.order_product?.order_id;
                        if (orderId && validOrderIds.includes(orderId)) {
                            const meta = getOrderMeta(orderId);
                            const rev = svc.unit_price || 0;
                            const rate = row.commission || 0;
                            const amt = Math.floor((rev * rate) / 100);
                            if (amt > 0) {
                                details.push({
                                    ...meta,
                                    type: 'Bán dịch vụ',
                                    product_name: svc.item_name || '--',
                                    quantity: 1,
                                    revenue: rev,
                                    rate: `${rate}%`,
                                    commission_amount: amt
                                });
                            }
                        }
                    }
                }
            } catch (e) { }

            // 6. V2: tech from order_product_service_technicians
            try {
                const { data: techServices } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select('commission, service:order_product_service_id ( id, item_name, unit_price, order_product:order_product_id ( order_id ) )')
                    .eq('technician_id', userId);
                if (techServices) {
                    for (const row of techServices) {
                        const svc = (row as any).service;
                        const orderId = svc?.order_product?.order_id;
                        if (orderId && validOrderIds.includes(orderId)) {
                            const meta = getOrderMeta(orderId);
                            const rev = svc.unit_price || 0;
                            const rate = row.commission || 0;
                            const amt = Math.floor((rev * rate) / 100);
                            if (amt > 0) {
                                details.push({
                                    ...meta,
                                    type: 'Thực hiện dịch vụ',
                                    product_name: svc.item_name || '--',
                                    quantity: 1,
                                    revenue: rev,
                                    rate: `${rate}%`,
                                    commission_amount: amt
                                });
                            }
                        }
                    }
                }
            } catch (e) { }
        }

        res.json({
            status: 'success',
            data: { commissions: details }
        });
    } catch (error) {
        next(error);
    }
});

// Get bonus details for user
router.get('/user/:userId/bonuses', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { userId } = req.params;
        const { month, year } = req.query;

        if (!month || !year) {
            throw new ApiError('Thiếu tháng hoặc năm', 400);
        }

        const bonuses: any[] = [];

        // 1. KPI Bonus (from kpi_monthly locked records)
        try {
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            const { data: kpiResults } = await supabaseAdmin
                .from('kpi_monthly')
                .select('total_score, rank, kpi_bonus_amount, kpi_penalty_amount, kpi_commission_factor')
                .eq('employee_id', userId)
                .eq('month_key', monthKey)
                .eq('status', 'locked');

            for (const kpiResult of (kpiResults || [])) {
                const kpiBonus = Number(kpiResult.kpi_bonus_amount) || 0;
                const kpiPenalty = Number(kpiResult.kpi_penalty_amount) || 0;
                const kpiScore = Number(kpiResult.total_score) || 0;

                if (kpiBonus > 0) {
                    bonuses.push({
                        type: `Thưởng KPI (${kpiScore} điểm - ${kpiResult.rank})`,
                        amount: kpiBonus
                    });
                }
                if (kpiPenalty > 0) {
                    bonuses.push({
                        type: `Phạt KPI (${kpiScore} điểm - ${kpiResult.rank})`,
                        amount: -kpiPenalty
                    });
                }
            }
        } catch (e) {
            console.error('Lỗi khi lấy thưởng KPI:', e);
        }

        // 2. Other Rewards
        try {
            const { data: vrRecords } = await supabaseAdmin
                .from('violations_rewards')
                .select('type, amount, category, description')
                .eq('user_id', userId)
                .eq('month', month)
                .eq('year', year)
                .eq('type', 'reward');

            if (vrRecords) {
                for (const r of vrRecords) {
                    bonuses.push({
                        type: r.description || r.category || 'Thưởng khác',
                        amount: Number(r.amount)
                    });
                }
            }
        } catch (e) {
            console.error('Lỗi khi lấy thưởng khác:', e);
        }

        // 3. Manual Bonus Details from salary_records
        try {
            const { data: record } = await supabaseAdmin
                .from('salary_records')
                .select('bonus_details')
                .eq('user_id', userId)
                .eq('month', month)
                .eq('year', year)
                .single();

            if (record?.bonus_details) {
                const details = record.bonus_details;
                if (details.byDay) {
                    details.byDay.forEach((b: any) => {
                        bonuses.push({
                            type: `Thưởng ngày: ${b.type} (${b.count} lần)`,
                            amount: (b.amount || 0) * (b.count || 1)
                        });
                    });
                }
                if (details.other) {
                    details.other.forEach((b: any) => {
                        bonuses.push({
                            type: b.type || 'Thưởng khác (thủ công)',
                            amount: (b.amount || 0) * (b.count || 1)
                        });
                    });
                }
            }
        } catch (e) { }

        res.json({
            status: 'success',
            data: { bonuses }
        });
    } catch (error) {
        next(error);
    }
});

// ====================================================================
// Calculate salary (CÔNG THỨC MỚI)
// ====================================================================
// LƯƠNG THỰC NHẬN = Lương cơ bản
//   + Làm thêm giờ (overtime_pay)
//   + Hoa hồng (service + product + referral)
//   + KPI Bonus
//   + Thưởng (từ violations_rewards type=reward)
//   − BHXH + BHYT + Thuế TNCN
//   − Ứng lương (từ salary_advances status=approved)
//   − Phạt vi phạm (từ violations_rewards type=violation)
// ====================================================================
router.post('/calculate', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { user_id, month, year } = req.body;

        if (!user_id || !month || !year) {
            throw new ApiError('Thiếu thông tin bắt buộc', 400);
        }

        // ── 1. Lấy thông tin user & config ─────────────────────────
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, name, email, avatar, role, department, base_salary, hourly_rate')
            .eq('id', user_id)
            .single();

        if (userError || !user) {
            throw new ApiError('Không tìm thấy nhân viên', 404);
        }

        let salaryConfig: any = null;
        try {
            const { data } = await supabaseAdmin.from('salary_configs').select('*').eq('user_id', user_id).single();
            salaryConfig = data;
        } catch (e) { }

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        const configBase = Number(salaryConfig?.base_amount || user.base_salary || 0);
        const configType = salaryConfig?.salary_type || 'standard_day';
        const standardWorkDays = 26;
        const hourlyRate = Number(user.hourly_rate || Math.floor(configBase / (standardWorkDays * 8)) || 0);

        // ── 2. Tính giờ công từ TIMESHEETS ───────────────────────
        let totalHours = 0;
        let overtimeHours = 0;
        let daysWorked = 0;
        try {
            // Query timesheets table (new schema: check_in, check_out, status, schedule_date)
            const { data: timesheets } = await supabaseAdmin
                .from('timesheets')
                .select('check_in, check_out, status, schedule_date')
                .eq('user_id', user_id)
                .eq('status', 'approved')
                .gte('schedule_date', startDate)
                .lte('schedule_date', endDate);

            if (timesheets && timesheets.length > 0) {
                let workedHours = 0;
                const workedDates = new Set<string>();
                for (const t of timesheets) {
                    if (t.check_in && t.check_out) {
                        const checkIn = new Date(t.check_in);
                        const checkOut = new Date(t.check_out);
                        const hours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
                        workedHours += Math.min(hours, 12); // Cap at 12h per day
                        if (t.schedule_date) workedDates.add(t.schedule_date);
                    }
                }
                daysWorked = workedDates.size;
                totalHours = Math.round(workedHours * 100) / 100;
                overtimeHours = timesheets.reduce((sum: number, t: any) => {
                    if (!t.check_in || !t.check_out) return sum;
                    const hours = (new Date(t.check_out).getTime() - new Date(t.check_in).getTime()) / (1000 * 60 * 60);
                    return sum + Math.max(0, Math.min(hours, 12) - 8);
                }, 0);
            }
        } catch (e) {
            console.log('[Salary] Timesheets table error, using zero approved attendance');
        }

        let actualBasePay = configBase;
        if (configType === 'hourly') {
            actualBasePay = Math.round(totalHours * hourlyRate);
        } else if (configType === 'standard_day') {
            actualBasePay = Math.round((configBase / standardWorkDays) * daysWorked);
        } else if (configType === 'shift') {
            // For shift based, standard base pay uses hours for now unless strict shift tables are provided
            const standardWorkedHours = Math.max(0, totalHours - overtimeHours);
            actualBasePay = Math.round(standardWorkedHours * hourlyRate);
        } else if (configType === 'fixed') {
            actualBasePay = configBase;
        }

        const baseSalary = actualBasePay;
        const hourlyWage = Math.round(totalHours * hourlyRate);

        let overtimePay = Math.round(overtimeHours * hourlyRate * 1.5);
        if (salaryConfig && salaryConfig.overtime_enabled === false) {
            overtimePay = 0;
            overtimeHours = 0;
        }

        // ── 3. Tính HOA HỒNG từ orders ──────────────────────────
        let serviceCommission = 0;
        let productCommission = 0;
        let referralCommission = 0;

        try {
            // Commission from commissions table
            const { data: commissions } = await supabaseAdmin
                .from('commissions')
                .select('amount, commission_type')
                .eq('user_id', user_id)
                .in('status', ['pending', 'approved'])
                .gte('created_at', startDate)
                .lte('created_at', endDate + 'T23:59:59');

            if (commissions) {
                for (const c of commissions) {
                    const amt = c.amount || 0;
                    if (c.commission_type === 'referral') {
                        referralCommission += amt;
                    } else {
                        serviceCommission += amt;
                    }
                }
            }
        } catch (e) {
            console.log('[Salary] Commissions table may not exist');
        }

        try {
            // Fetch all valid orders to filter by order status consistently
            const { data: validOrders } = await supabaseAdmin
                .from('orders')
                .select('id, sales_id')
                .or('payment_status.eq.paid,status.in.(done,completed,delivered,after_sale)')
                .gte('created_at', startDate)
                .lte('created_at', endDate + 'T23:59:59');

            const validOrderIds = validOrders ? validOrders.map(o => o.id) : [];
            const saleOrderIds = validOrders ? validOrders.filter(o => o.sales_id === user_id).map(o => o.id) : [];

            if (validOrderIds.length > 0) {
                // 1. V1 Sales
                if (saleOrderIds.length > 0) {
                    const { data: v1Sales } = await supabaseAdmin
                        .from('order_items')
                        .select('commission_sale_amount, item_type')
                        .in('order_id', saleOrderIds);
                    if (v1Sales) {
                        for (const it of v1Sales) {
                            if (it.item_type === 'product') productCommission += (it.commission_sale_amount || 0);
                            else serviceCommission += (it.commission_sale_amount || 0);
                        }
                    }
                }

                // 2. V1 Tech
                const { data: v1Tech } = await supabaseAdmin
                    .from('order_items')
                    .select('commission_tech_amount')
                    .eq('technician_id', user_id)
                    .in('order_id', validOrderIds);
                if (v1Tech) {
                    serviceCommission += v1Tech.reduce((sum, item) => sum + (item.commission_tech_amount || 0), 0);
                }

                // 3. V2 Sales - order_item_sales
                const { data: v2SalesItem } = await supabaseAdmin
                    .from('order_item_sales')
                    .select('commission, item:order_item_id(order_id, total_price)')
                    .eq('sale_id', user_id);
                if (v2SalesItem) {
                    for (const row of v2SalesItem) {
                        const item = (row as any).item;
                        if (item && validOrderIds.includes(item.order_id)) {
                            const amt = Math.floor(((item.total_price || 0) * (row.commission || 0)) / 100);
                            productCommission += amt;
                        }
                    }
                }

                // 4. V2 Sales - order_product_service_sales
                const { data: v2SalesSvc } = await supabaseAdmin
                    .from('order_product_service_sales')
                    .select('commission, service:order_product_service_id(unit_price, order_product:order_product_id(order_id))')
                    .eq('sale_id', user_id);
                if (v2SalesSvc) {
                    for (const row of v2SalesSvc) {
                        const svc = (row as any).service;
                        const oId = svc?.order_product?.order_id;
                        if (oId && validOrderIds.includes(oId)) {
                            const amt = Math.floor(((svc.unit_price || 0) * (row.commission || 0)) / 100);
                            serviceCommission += amt;
                        }
                    }
                }

                // 5. V2 Tech - order_product_service_technicians
                const { data: v2TechSvc } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select('commission, service:order_product_service_id(unit_price, order_product:order_product_id(order_id))')
                    .eq('technician_id', user_id);
                if (v2TechSvc) {
                    for (const row of v2TechSvc) {
                        const svc = (row as any).service;
                        const oId = svc?.order_product?.order_id;
                        if (oId && validOrderIds.includes(oId)) {
                            const amt = Math.floor(((svc.unit_price || 0) * (row.commission || 0)) / 100);
                            serviceCommission += amt;
                        }
                    }
                }
            }
        } catch (e) {
            console.log('[Salary] Error calculating commission from order_items:', e);
        }

        let totalCommission = serviceCommission + productCommission + referralCommission;
        if (salaryConfig && salaryConfig.commission_enabled === false) {
            totalCommission = 0;
            serviceCommission = 0;
            productCommission = 0;
            referralCommission = 0;
        }

        // ── 4. Tính KPI BONUS từ kpi_monthly (locked records) ──────────────────────
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const kpiPayroll = await resolveEmployeeKpiForPayroll(user_id, monthKey);
        let kpiAchievement = kpiPayroll.primary.score;
        let kpiBonus = kpiPayroll.primary.bonus;
        let kpiPenalty = kpiPayroll.primary.penalty;
        let kpiFactor = kpiPayroll.primary.commissionFactor;
        const teamleadBonus = kpiPayroll.teamleadBonus;
        const managementBonus = kpiPayroll.managementBonus;
        const kpiPrimaryRank = kpiPayroll.primary.rank;
        const kpiSecondaryDetails = kpiPayroll.secondaryDetails;

        // ── 5. Tính THƯỞNG / PHẠT từ violations_rewards ─────────
        let totalRewards = 0;
        let totalViolations = 0;
        try {
            const { data: vrRecords } = await supabaseAdmin
                .from('violations_rewards')
                .select('type, amount')
                .eq('user_id', user_id)
                .eq('month', month)
                .eq('year', year);

            if (vrRecords) {
                for (const r of vrRecords) {
                    if (r.type === 'reward') {
                        totalRewards += Number(r.amount);
                    } else {
                        totalViolations += Number(r.amount);
                    }
                }
            }
        } catch (e) {
            console.log('[Salary] violations_rewards table may not exist');
        }

        // ── 6. Tính ỨNG LƯƠNG từ salary_advances ─────────────────
        let totalAdvances = 0;
        try {
            const { data: advances } = await supabaseAdmin
                .from('salary_advances')
                .select('amount')
                .eq('user_id', user_id)
                .eq('month', month)
                .eq('year', year)
                .eq('status', 'approved');

            if (advances) {
                totalAdvances = advances.reduce((sum, a) => sum + Number(a.amount), 0);
            }
        } catch (e) {
            console.log('[Salary] salary_advances table may not exist');
        }

        // ── 7. Tổng hợp: GROSS SALARY ───────────────────────────
        let existing: any = null;
        try {
            const { data } = await supabaseAdmin
                .from('salary_records')
                .select('id, bonus_details, deduction_details')
                .eq('user_id', user_id)
                .eq('month', month)
                .eq('year', year)
                .single();
            existing = data;
        } catch (e) {
            // Table may not exist or no record found
        }

        let manualBonus = 0;
        if (existing?.bonus_details) {
            const det = existing.bonus_details;
            const dSum = (det.byDay || []).reduce((s: number, b: any) => s + (b.amount || 0) * (b.count || 1), 0);
            const oSum = (det.other || []).reduce((s: number, b: any) => s + (b.amount || 0) * (b.count || 1), 0);
            manualBonus = dSum + oSum;
        }

        let totalAllowances = 0;
        if (salaryConfig?.allowance_enabled) {
            const aRules = salaryConfig.allowance_rules || [];
            if (aRules.length > 0) {
                for (const r of aRules) {
                    if (r.type === 'fixed_day') {
                        totalAllowances += (Number(r.amount) * daysWorked);
                    } else {
                        totalAllowances += Number(r.amount);
                    }
                }
            } else {
                totalAllowances += Number(salaryConfig.allowance_amount || 0);
            }
        }

        // Add allowances into totalBonus so it's incorporated to grossSalary natively
        const totalBonus = kpiBonus + totalRewards + manualBonus + totalAllowances + teamleadBonus + managementBonus;

        let bonusDetailsObj = manualBonus > 0 ? (existing?.bonus_details || {}) : {};
        if (totalAllowances > 0) {
            bonusDetailsObj = {
                ...bonusDetailsObj,
                allowances: totalAllowances,
                allowances_desc: 'Phụ cấp (từ cấu hình)'
            };
        }

        // Nhân hệ số KPI vào phần Hoa hồng trước khi cộng vào Lương Gross
        if (totalCommission > 0) {
            totalCommission = Math.floor(totalCommission * (kpiFactor / 100));
        }
        const grossSalary = baseSalary + overtimePay + totalCommission + totalBonus;

        // ── 8. Tính KHẤU TRỪ ─────────────────────────────────────
        const socialInsurance = 0;
        const healthInsurance = 0;
        const personalTax = 0;

        // ── 7.5. Tính KHẤU TRỪ THỦ CÔNG ──────────────────────────
        let manualDeduction = 0;
        if (existing?.deduction_details) {
            const det = existing.deduction_details;
            const dSum = (det.byDay || []).reduce((s: number, d: any) => s + (d.amount || 0) * (d.count || 1), 0);
            const oSum = (det.other || []).reduce((s: number, d: any) => s + (d.amount || 0) * (d.count || 1), 0);
            manualDeduction = dSum + oSum;
        }

        const totalDeduction = socialInsurance + healthInsurance + personalTax + totalAdvances + totalViolations + manualDeduction + kpiPenalty;

        // ── 9. NET SALARY ────────────────────────────────────────
        const netSalary = grossSalary - totalDeduction;

        console.log(`[Salary] User ${user.name} (${user_id}) - ${month}/${year}:`);
        console.log(`  Base: ${baseSalary} (Type: ${configType}), Overtime: ${overtimePay} (${overtimeHours}h)`);
        console.log(`  Commission: ${totalCommission} (service: ${serviceCommission}, product: ${productCommission}, referral: ${referralCommission})`);
        console.log(`  KPI: ${kpiAchievement}% → bonus: ${kpiBonus}, penalty: ${kpiPenalty}, factor: ${kpiFactor}`);
        console.log(`  Rewards: ${totalRewards}, Allowances: ${totalAllowances}, Violations: ${totalViolations}`);
        console.log(`  Advances: ${totalAdvances}`);
        console.log(`  Insurance: ${socialInsurance + healthInsurance}, Tax: ${personalTax}`);
        console.log(`  Gross: ${grossSalary} → Net: ${netSalary}`);

        // ── 10. Upsert salary record ─────────────────────────────

        const salaryData = {
            user_id,
            month,
            year,
            base_salary: baseSalary,
            hourly_rate: hourlyRate,
            hourly_wage: hourlyWage,
            overtime_pay: overtimePay,
            total_hours: totalHours,
            overtime_hours: overtimeHours,
            // Commission breakdown
            service_commission: serviceCommission,
            product_commission: productCommission,
            referral_commission: referralCommission,
            commission: totalCommission,
            // KPI
            kpi_achievement: kpiAchievement,
            kpi_primary_score: kpiAchievement,
            kpi_primary_rank: kpiPrimaryRank,
            kpi_primary_bonus: kpiPayroll.primary.bonus,
            kpi_primary_penalty: kpiPayroll.primary.penalty,
            kpi_primary_commission_factor: kpiPayroll.primary.commissionFactor,
            kpi_secondary_details: kpiSecondaryDetails.length > 0 ? kpiSecondaryDetails : null,
            teamlead_bonus: teamleadBonus,
            management_bonus: managementBonus,
            // Bonus = KPI bonus + rewards + manual + allowances
            bonus: totalBonus,
            bonus_details: (manualBonus > 0 || totalAllowances > 0) ? bonusDetailsObj : null,
            // Deductions breakdown
            social_insurance: socialInsurance,
            health_insurance: healthInsurance,
            personal_tax: personalTax,
            advances: totalAdvances,
            // Violations as separate field
            deduction: totalDeduction,
            deduction_details: manualDeduction > 0 ? existing?.deduction_details : null,
            // Totals
            gross_salary: grossSalary,
            net_salary: netSalary,
            status: 'draft',
        };

        let salary;
        try {
            if (existing) {
                const { data, error } = await supabaseAdmin
                    .from('salary_records')
                    .update({ ...salaryData, updated_at: new Date().toISOString() })
                    .eq('id', existing.id)
                    .select(`*, user:users!salary_records_user_id_fkey(id, name, email, avatar, role, department, employee_code)`)
                    .single();

                if (error) throw new ApiError('Lỗi khi cập nhật lương: ' + error.message, 500);
                salary = data;
            } else {
                const { data, error } = await supabaseAdmin
                    .from('salary_records')
                    .insert({ ...salaryData, created_by: req.user!.id })
                    .select(`*, user:users!salary_records_user_id_fkey(id, name, email, avatar, role, department, employee_code)`)
                    .single();

                if (error) throw new ApiError('Lỗi khi tạo bản ghi lương: ' + error.message, 500);
                salary = data;
            }
        } catch (e: any) {
            if (e.message?.includes('does not exist')) {
                throw new ApiError('Bảng salary_records chưa được tạo. Vui lòng chạy migration.', 500);
            }
            throw e;
        }

        // ── 11. Mark advances as deducted ────────────────────────
        if (totalAdvances > 0 && salary) {
            try {
                await supabaseAdmin
                    .from('salary_advances')
                    .update({
                        status: 'deducted',
                        deducted_at: new Date().toISOString(),
                        salary_record_id: salary.id,
                    })
                    .eq('user_id', user_id)
                    .eq('month', month)
                    .eq('year', year)
                    .eq('status', 'approved');
            } catch (e) {
                console.log('[Salary] Error marking advances as deducted:', e);
            }
        }

        res.json({
            status: 'success',
            data: { salary },
        });
    } catch (error) {
        next(error);
    }
});

// Update single salary record manual fields (Base Salary)
router.patch('/:id/update-base', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { base_salary, standard_work_days, actual_work_days, applied_salary } = req.body;

        const { data: record, error: getErr } = await supabaseAdmin
            .from('salary_records')
            .select('*')
            .eq('id', id)
            .single();

        if (getErr || !record) throw new ApiError('Không tìm thấy phiếu lương', 404);
        if (record.status === 'locked' || record.status === 'paid') {
            throw new ApiError('Phiếu lương đã chốt hoặc thanh toán, không thể sửa', 400);
        }

        // We use applied_salary as the new base_salary for calculation natively
        const newBaseSalary = applied_salary !== undefined ? Number(applied_salary) : Number(base_salary || record.base_salary);

        let newTotalHours = record.total_hours;
        if (actual_work_days !== undefined) {
            newTotalHours = Number(actual_work_days) * 8;
        }

        const hourlyRate = Math.floor(newBaseSalary / (standard_work_days ? Number(standard_work_days) * 8 : 176));
        const hourlyWage = Math.round(newTotalHours * hourlyRate);

        const grossSalary = newBaseSalary + (record.overtime_pay || 0) + (record.commission || 0) + (record.bonus || 0);

        const socialInsurance = Math.floor(newBaseSalary * 0.08);
        const healthInsurance = Math.floor(newBaseSalary * 0.015);
        const taxableIncome = grossSalary - 11000000;
        const personalTax = taxableIncome > 0 ? Math.floor(taxableIncome * 0.05) : 0;

        const violations = (record.deduction || 0) - (record.social_insurance || 0) - (record.health_insurance || 0) - (record.personal_tax || 0) - (record.advances || 0);

        const newDeduction = socialInsurance + healthInsurance + personalTax + (record.advances || 0) + violations;
        const netSalary = grossSalary - newDeduction;

        const updateData: any = {
            base_salary: newBaseSalary,
            hourly_wage: hourlyWage,
            total_hours: newTotalHours,
            social_insurance: socialInsurance,
            health_insurance: healthInsurance,
            personal_tax: personalTax,
            deduction: newDeduction,
            gross_salary: grossSalary,
            net_salary: netSalary,
        };

        const { data: updated, error: updateErr } = await supabaseAdmin
            .from('salary_records')
            .update({ ...updateData, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select(`*, user:users!salary_records_user_id_fkey(id, name, email, avatar, role, department, employee_code)`)
            .single();

        if (updateErr) throw new ApiError('Lỗi cập nhật lương: ' + updateErr.message, 500);

        res.json({ status: 'success', data: { salary: updated } });
    } catch (error) {
        next(error);
    }
});

// Update manual bonus details
router.patch('/:id/update-bonus', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { bonus_details } = req.body;

        const { data: record, error: getErr } = await supabaseAdmin
            .from('salary_records')
            .select('*')
            .eq('id', id)
            .single();

        if (getErr || !record) throw new ApiError('Không tìm thấy phiếu lương', 404);
        if (record.status === 'locked' || record.status === 'paid') {
            throw new ApiError('Phiếu lương đã chốt hoặc thanh toán, không thể sửa', 400);
        }

        // Calculate manual bonus total
        const byDaySum = (bonus_details.byDay || []).reduce((s: number, b: any) => s + (b.amount || 0) * (b.count || 1), 0);
        const otherSum = (bonus_details.other || []).reduce((s: number, b: any) => s + (b.amount || 0) * (b.count || 1), 0);
        const manualBonusTotal = byDaySum + otherSum;

        // Recalculate totals
        // We need to re-fetch or calculate based on existing fields
        // totalBonus = KPI Bonus + totalRewards (from violations_rewards) + manualBonusTotal
        // But we don't know totalRewards here without re-querying or relying on old 'bonus' field.
        // Old 'bonus' = KPI + Rewards + OLD manual bonus.
        // It's safer to re-calculate total bonus based on components if they were saved, 
        // but they aren't saved separately in columns.
        // However, standard recalculation logic is in /calculate.
        // For a quick patch, we can adjust the bonus field based on the delta or just re-calculate the whole thing.

        // Let's re-calculate to be safe.
        // Actually, let's just update the record and then let the user "Calculate" if they want full sync,
        // OR we implement the same logic as /calculate here.

        // Re-calculating total bonus:
        // We need KPI bonus and Rewards.
        const month = record.month;
        const year = record.year;
        const user_id = record.user_id;

        // KPI (from kpi_monthly locked records)
        let kpiBonus = 0;
        let kpiTeamleadBonus = 0;
        let kpiManagementBonus = 0;
        try {
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            const kpiPayrollRec = await resolveEmployeeKpiForPayroll(user_id, monthKey);
            kpiBonus = kpiPayrollRec.primary.bonus;
            kpiTeamleadBonus = kpiPayrollRec.teamleadBonus;
            kpiManagementBonus = kpiPayrollRec.managementBonus;
        } catch (e) { }

        // Rewards
        let totalRewards = 0;
        try {
            const { data: vr } = await supabaseAdmin.from('violations_rewards').select('amount').eq('user_id', user_id).eq('month', month).eq('year', year).eq('type', 'reward');
            if (vr) totalRewards = vr.reduce((s, r) => s + Number(r.amount), 0);
        } catch (e) { }

        const newTotalBonus = kpiBonus + kpiTeamleadBonus + kpiManagementBonus + totalRewards + manualBonusTotal;
        const newGrossSalary = (record.base_salary || 0) + (record.overtime_pay || 0) + (record.commission || 0) + newTotalBonus;

        const taxableIncome = newGrossSalary - 11000000;
        const newPersonalTax = taxableIncome > 0 ? Math.floor(taxableIncome * 0.05) : 0;

        const oldDeductionWithoutTax = (record.deduction || 0) - (record.personal_tax || 0);
        const newDeduction = oldDeductionWithoutTax + newPersonalTax;
        const newNetSalary = newGrossSalary - newDeduction;

        const { data: updated, error: updateErr } = await supabaseAdmin
            .from('salary_records')
            .update({
                bonus_details,
                bonus: newTotalBonus,
                personal_tax: newPersonalTax,
                deduction: newDeduction,
                gross_salary: newGrossSalary,
                net_salary: newNetSalary,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select(`*, user:users!salary_records_user_id_fkey(id, name, email, avatar, role, department, employee_code)`)
            .single();

        if (updateErr) throw new ApiError('Lỗi cập nhật thưởng: ' + updateErr.message, 500);

        res.json({ status: 'success', data: { salary: updated } });
    } catch (error) {
        next(error);
    }
});

// Update manual deduction details
router.patch('/:id/update-deduction', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { deduction_details } = req.body;

        const { data: record, error: getErr } = await supabaseAdmin
            .from('salary_records')
            .select('*')
            .eq('id', id)
            .single();

        if (getErr || !record) throw new ApiError('Không tìm thấy phiếu lương', 404);
        if (record.status === 'locked' || record.status === 'paid') {
            throw new ApiError('Phiếu lương đã chốt hoặc thanh toán, không thể sửa', 400);
        }

        // Calculate manual deduction total
        const byDaySum = (deduction_details.byDay || []).reduce((s: number, d: any) => s + (d.amount || 0) * (d.count || 1), 0);
        const otherSum = (deduction_details.other || []).reduce((s: number, d: any) => s + (d.amount || 0) * (d.count || 1), 0);
        const manualDeductionTotal = byDaySum + otherSum;

        // Recalculate totals
        const grossSalary = record.gross_salary || 0;
        const socialInsurance = record.social_insurance || 0;
        const healthInsurance = record.health_insurance || 0;
        const totalAdvances = record.advances || 0;

        // Table violations from violations_rewards
        let tableViolations = 0;
        try {
            const { data: vr } = await supabaseAdmin.from('violations_rewards').select('amount').eq('user_id', record.user_id).eq('month', record.month).eq('year', record.year).eq('type', 'violation');
            if (vr) tableViolations = vr.reduce((s, r) => s + Number(r.amount), 0);
        } catch (e) { }

        const taxableIncome = grossSalary - 11000000;
        const personalTax = taxableIncome > 0 ? Math.floor(taxableIncome * 0.05) : 0;

        const newDeduction = socialInsurance + healthInsurance + personalTax + totalAdvances + tableViolations + manualDeductionTotal;
        const newNetSalary = grossSalary - newDeduction;

        const { data: updated, error: updateErr } = await supabaseAdmin
            .from('salary_records')
            .update({
                deduction_details,
                personal_tax: personalTax,
                deduction: newDeduction,
                net_salary: newNetSalary,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select(`*, user:users!salary_records_user_id_fkey(id, name, email, avatar, role, department, employee_code)`)
            .single();

        if (updateErr) throw new ApiError('Lỗi cập nhật khấu trừ: ' + updateErr.message, 500);

        res.json({ status: 'success', data: { salary: updated } });
    } catch (error) {
        next(error);
    }
});

// Approve salary
router.patch('/:id/approve', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: salary, error } = await supabaseAdmin
            .from('salary_records')
            .update({
                status: 'approved',
                approved_by: req.user!.id,
                approved_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi duyệt lương', 500);
        }

        res.json({
            status: 'success',
            data: { salary },
        });
    } catch (error) {
        next(error);
    }
});

// Helper for PC code
async function generatePCCOde(): Promise<string> {
    const { data: transactions } = await supabaseAdmin
        .from('transactions')
        .select('code')
        .like('code', 'PC%')
        .order('created_at', { ascending: false })
        .limit(100);

    let maxNumber = 0;
    if (transactions && transactions.length > 0) {
        for (const trans of transactions) {
            const numStr = trans.code.replace('PC', '');
            const num = parseInt(numStr, 10);
            if (!isNaN(num) && num > maxNumber) maxNumber = num;
        }
    }
    return `PC${String(maxNumber + 1).padStart(6, '0')}`;
}

// Mark as paid & create PC record
router.patch('/:id/pay', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { payment_method, payment_date, notes, amount } = req.body;

        // 1. Lấy thông tin phiếu lương
        const { data: salary, error: fetchError } = await supabaseAdmin
            .from('salary_records')
            .select(`
                *,
                user:users!salary_records_user_id_fkey(name, employee_code, phone)
            `)
            .eq('id', id)
            .single();

        if (fetchError || !salary) {
            throw new ApiError('Không tìm thấy phiếu lương', 404);
        }

        if (salary.status === 'paid') {
            throw new ApiError('Phiếu lương này đã được thanh toán', 400);
        }

        const requestedAmount = Number(amount);
        const netSalary = Number.isFinite(requestedAmount) && requestedAmount > 0
            ? requestedAmount
            : Number(salary.net_salary || 0);
        const code = await generatePCCOde();

        // 2. Tạo phiếu chi (Transaction)
        const { error: transError } = await supabaseAdmin
            .from('transactions')
            .insert({
                code,
                type: 'expense',
                category: 'Lương nhân viên',
                amount: netSalary,
                payment_method: payment_method || 'transfer',
                notes: notes || `Chi lương cho nhân viên ${salary.user?.name || ''} tháng ${salary.month}/${salary.year}`,
                date: payment_date || new Date().toISOString().split('T')[0],
                status: 'approved',
                created_by: req.user!.id,
                approved_by: req.user!.id,
                approved_at: new Date().toISOString(),
                metadata: {
                    payer_name: salary.user?.name,
                    customer_code: salary.user?.employee_code || `NV${salary.user_id?.slice(0, 6).toUpperCase()}`,
                    customer_phone: salary.user?.phone || 'N/A'
                }
            });

        if (transError) {
            console.error('[SalaryPay] Error creating transaction:', transError);
            throw new ApiError('Lỗi khi tạo phiếu chi: ' + transError.message, 500);
        }

        // 3. Cập nhật phiếu lương
        const { data: updatedSalary, error: updateError } = await supabaseAdmin
            .from('salary_records')
            .update({
                status: 'paid',
                payment_method: payment_method || 'bank_transfer',
                paid_at: payment_date || new Date().toISOString(),
                paid_by: req.user!.id,
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            throw new ApiError('Lỗi khi cập nhật trạng thái thanh toán', 500);
        }

        res.json({
            status: 'success',
            data: { salary: updatedSalary },
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/salary/send-payroll — Chốt bảng lương & gửi Telegram/n8n
router.post('/send-payroll', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month, year } = req.body;

        if (!month || !year) {
            throw new ApiError('Thiếu tháng hoặc năm', 400);
        }

        // Lấy toàn bộ bảng lương tháng đó
        const { data: salaries, error } = await supabaseAdmin
            .from('salary_records')
            .select(`
                *,
                user:users!salary_records_user_id_fkey(id, name, email, role, department)
            `)
            .eq('month', month)
            .eq('year', year);

        if (error) {
            throw new ApiError('Lỗi khi lấy bảng lương: ' + error.message, 500);
        }

        if (!salaries || salaries.length === 0) {
            throw new ApiError('Không có dữ liệu lương cho tháng này', 404);
        }

        // Format payroll data cho n8n
        const payrollData = salaries.map((s: any) => ({
            employee_name: s.user?.name || 'N/A',
            department: s.user?.department || 'N/A',
            role: s.user?.role || 'N/A',
            base_salary: s.base_salary,
            commission: s.commission,
            kpi_achievement: s.kpi_achievement,
            bonus: s.bonus,
            deduction: s.deduction,
            advances: s.advances,
            gross_salary: s.gross_salary,
            net_salary: s.net_salary,
            status: s.status,
        }));

        // 🔔 WH8: Fire webhook — Chốt Bảng Lương
        fireWebhook('payroll.finalized', {
            month,
            year,
            total_employees: payrollData.length,
            total_net: salaries.reduce((sum: number, s: any) => sum + (s.net_salary || 0), 0),
            payroll: payrollData,
        });

        res.json({
            status: 'success',
            message: `Đã gửi bảng lương tháng ${month}/${year} (${payrollData.length} nhân viên)`,
            data: { count: payrollData.length },
        });
    } catch (error) {
        next(error);
    }
});

export { router as salaryRouter };
