import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';
import { resolveTeamMembers, resolveStoreMembers, resolveStoreForManager } from '../utils/teamResolver.js';

const router = Router();

// ============================================================
// SCORING ENGINE - Calculate score for a single metric
// ============================================================
function calculateMetricScore(
    scoringRules: any,
    weight: number,
    targetValue: number,
    actualValue: number
): { raw_score: number; achievement_rate: number } {
    if (!scoringRules || !scoringRules.type) {
        return { raw_score: 0, achievement_rate: 0 };
    }

    const achievementRate = targetValue > 0
        ? (actualValue / targetValue) * 100
        : (actualValue > 0 ? 100 : 0);

    switch (scoringRules.type) {
        case 'threshold': {
            const tiers = scoringRules.tiers || [];
            // Sort tiers by min descending to find the first matching tier
            const sortedTiers = [...tiers].sort((a: any, b: any) => (b.min || 0) - (a.min || 0));
            for (const tier of sortedTiers) {
                const min = tier.min ?? 0;
                const max = tier.max ?? Infinity;
                if (achievementRate >= min && achievementRate <= max) {
                    return { raw_score: tier.score || 0, achievement_rate: Math.round(achievementRate * 100) / 100 };
                }
            }
            // If no tier matched, return lowest tier score or 0
            const lowestTier = sortedTiers[sortedTiers.length - 1];
            return {
                raw_score: lowestTier?.score || 0,
                achievement_rate: Math.round(achievementRate * 100) / 100
            };
        }

        case 'linear': {
            const baseScore = scoringRules.base_score || weight;
            const score = Math.min((achievementRate / 100) * baseScore, baseScore);
            return {
                raw_score: Math.round(score * 100) / 100,
                achievement_rate: Math.round(achievementRate * 100) / 100
            };
        }

        case 'per_event': {
            const pointsPerEvent = scoringRules.points_per_event || 0;
            const maxDeduct = scoringRules.max_deduct ?? -weight;
            // For per_event: actualValue = number of events (violations)
            // Start with full weight, deduct per event
            let score = weight + (actualValue * pointsPerEvent);
            if (maxDeduct < 0) {
                score = Math.max(score, weight + maxDeduct);
            }
            score = Math.max(score, 0); // Never go below 0
            return {
                raw_score: Math.round(score * 100) / 100,
                achievement_rate: weight > 0 ? Math.round((score / weight) * 100 * 100) / 100 : 0
            };
        }

        case 'boolean': {
            const yesScore = scoringRules.yes_score ?? weight;
            const noScore = scoringRules.no_score ?? 0;
            const score = actualValue > 0 ? yesScore : noScore;
            return {
                raw_score: score,
                achievement_rate: actualValue > 0 ? 100 : 0
            };
        }

        case 'manual': {
            // For manual: actualValue is the manager-assigned score (0-max)
            const maxScore = scoringRules.max_score ?? weight;
            const score = Math.min(actualValue, maxScore);
            return {
                raw_score: Math.max(score, 0),
                achievement_rate: maxScore > 0 ? Math.round((score / maxScore) * 100 * 100) / 100 : 0
            };
        }

        default:
            return { raw_score: 0, achievement_rate: 0 };
    }
}

// ============================================================
// AUTO DATA SOURCE - Fetch actual values from system
// ============================================================
async function fetchAutoMetricValue(
    sourceKey: string,
    employeeId: string,
    monthKey: string
): Promise<{ value: number; ref: any }> {
    const [year, month] = monthKey.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    try {
        switch (sourceKey) {
            case 'order_revenue_by_sale': {
                const { data: orders } = await supabaseAdmin
                    .from('orders')
                    .select('id, total_amount')
                    .eq('sales_id', employeeId)
                    .in('status', ['done', 'after_sale'])
                    .gte('created_at', startDate)
                    .lte('created_at', endDate);

                const total = (orders || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);
                return { value: total, ref: { order_count: (orders || []).length, total } };
            }

            case 'won_leads_ratio':
            case 'closed_leads_ratio': { // backward compat alias
                // Denominator: qualified leads assigned to this sale in period
                // Qualified = pipeline_stage beyond initial contact (>= hen_gui_anh)
                const qualifiedStages = ['hen_gui_anh', 'dam_phan_gia', 'hen_qua_ship', 'chot_don', 'fail'];
                
                const { data: qualifiedLeads } = await supabaseAdmin
                    .from('leads')
                    .select('id')
                    .eq('assigned_to', employeeId)
                    .in('pipeline_stage', qualifiedStages)
                    .gte('created_at', startDate)
                    .lte('created_at', endDate);
                
                const qualifiedCount = (qualifiedLeads || []).length;
                
                // Numerator: leads that resulted in an order from this sale
                let wonCount = 0;
                
                if (qualifiedCount > 0) {
                    const qualifiedIds = (qualifiedLeads || []).map((l: any) => l.id);
                    
                    // Get leads that have been converted (have customer_id)
                    const { data: convertedLeads } = await supabaseAdmin
                        .from('leads')
                        .select('id, customer_id')
                        .in('id', qualifiedIds)
                        .not('customer_id', 'is', null);
                    
                    if (convertedLeads && convertedLeads.length > 0) {
                        const customerIds = convertedLeads.map((l: any) => l.customer_id).filter(Boolean);
                        
                        // Check which customers have orders from THIS sale in the period
                        const { data: wonOrders } = await supabaseAdmin
                            .from('orders')
                            .select('customer_id')
                            .eq('sales_id', employeeId)
                            .in('customer_id', customerIds)
                            .in('status', ['before_sale', 'in_progress', 'done', 'after_sale'])
                            .gte('created_at', startDate)
                            .lte('created_at', endDate);
                        
                        // Count unique leads that got orders (not unique orders)
                        const wonCustomerIds = new Set((wonOrders || []).map((o: any) => o.customer_id));
                        wonCount = convertedLeads.filter((l: any) => wonCustomerIds.has(l.customer_id)).length;
                    }
                }
                
                const ratio = qualifiedCount > 0 ? (wonCount / qualifiedCount) * 100 : 0;
                return {
                    value: ratio,
                    ref: {
                        qualified_leads: qualifiedCount,
                        won_leads: wonCount,
                        qualified_stages: qualifiedStages
                    }
                };
            }

            case 'return_customer_count': {
                const { data: periodOrders } = await supabaseAdmin
                    .from('orders')
                    .select('customer_id')
                    .eq('sales_id', employeeId)
                    .in('status', ['done', 'after_sale', 'in_progress', 'before_sale'])
                    .gte('created_at', startDate)
                    .lte('created_at', endDate);

                const customerIds = (periodOrders || []).map((o: any) => o.customer_id).filter(Boolean);
                let returnCount = 0;

                if (customerIds.length > 0) {
                    const uniqueCustomers = [...new Set(customerIds)];
                    for (const cid of uniqueCustomers) {
                        const { count } = await supabaseAdmin
                            .from('orders')
                            .select('*', { count: 'exact', head: true })
                            .eq('customer_id', cid)
                            .in('status', ['done', 'after_sale'])
                            .lt('created_at', startDate);

                        if ((count || 0) > 0) returnCount++;
                    }
                }

                return {
                    value: returnCount,
                    ref: {
                        return_customers: returnCount,
                        total_customers_in_period: new Set(customerIds).size
                    }
                };
            }

            case 'lead_reclaimed_count': {
                // Count leads that were reclaimed/reassigned from this employee
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .eq('rule_code', 'lead_reclaimed')
                    .eq('status', 'approved');

                return { value: (violations || []).length, ref: { count: (violations || []).length } };
            }

            case 'sla_missed_count': {
                // Count SLA misses from violation logs
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .eq('rule_code', 'sla_missed')
                    .eq('status', 'approved');

                return { value: (violations || []).length, ref: { count: (violations || []).length } };
            }

            case 'completed_jobs_count': {
                // Count completed technician jobs
                // V1: order_items
                const { data: v1Items } = await supabaseAdmin
                    .from('order_items')
                    .select('id, order_id')
                    .eq('technician_id', employeeId)
                    .eq('status', 'completed');

                // V2: order_product_service_technicians
                const { data: v2Items } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select('id, service:order_product_services(order_id, status)')
                    .eq('technician_id', employeeId);

                const v2Completed = (v2Items || []).filter((s: any) => {
                    const svc = Array.isArray(s.service) ? s.service[0] : s.service;
                    return svc && svc.status === 'completed';
                });

                // Get orders within date range
                const { data: periodOrders } = await supabaseAdmin
                    .from('orders')
                    .select('id')
                    .gte('created_at', startDate)
                    .lte('created_at', endDate);

                const periodOrderIds = new Set((periodOrders || []).map(o => o.id));

                const v1InPeriod = (v1Items || []).filter(i => periodOrderIds.has(i.order_id));
                const v2InPeriod = v2Completed.filter((s: any) => {
                    const svc = Array.isArray(s.service) ? s.service[0] : s.service;
                    return svc && periodOrderIds.has(svc.order_id);
                });

                const uniqueOrders = new Set([
                    ...v1InPeriod.map(i => i.order_id),
                    ...v2InPeriod.map((s: any) => {
                        const svc = Array.isArray(s.service) ? s.service[0] : s.service;
                        return svc?.order_id;
                    })
                ]);

                return { value: uniqueOrders.size, ref: { v1: v1InPeriod.length, v2: v2InPeriod.length, total: uniqueOrders.size } };
            }

            case 'on_time_completion_rate': {
                // Compare completed_at vs order due_at for technician jobs
                // Excludes orders with approved extension requests where kpi_impact = false
                const { data: techOrders } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select('id, completed_at, service:order_product_services(order_id, completed_at, status)')
                    .eq('technician_id', employeeId)
                    .eq('status', 'completed');

                // Get orders in period with due_at
                const { data: ordersWithDue } = await supabaseAdmin
                    .from('orders')
                    .select('id, due_at')
                    .gte('created_at', startDate)
                    .lte('created_at', endDate)
                    .not('due_at', 'is', null);

                const dueMap = new Map((ordersWithDue || []).map(o => [o.id, o.due_at]));

                // Fetch extensions approved with kpi_impact=false (exclude those orders from KPI)
                const orderIdsInPeriod = (ordersWithDue || []).map(o => o.id);
                let excludedOrderIds = new Set<string>();

                if (orderIdsInPeriod.length > 0) {
                    const { data: excludedExtensions } = await supabaseAdmin
                        .from('order_extension_requests')
                        .select('order_id')
                        .in('order_id', orderIdsInPeriod)
                        .eq('kpi_impact', false)
                        .in('status', ['approved', 'manager_approved', 'notified_tech', 'done']);

                    excludedOrderIds = new Set((excludedExtensions || []).map((e: any) => e.order_id));
                }

                // Calculate rate excluding KPI-exempt orders
                let totalWithDeadline = 0;
                let onTimeCount = 0;
                let excludedCount = 0;

                for (const t of (techOrders || [])) {
                    const svc = Array.isArray(t.service) ? t.service[0] : t.service;
                    if (!svc || !svc.order_id) continue;
                    const dueAt = dueMap.get(svc.order_id);
                    if (!dueAt) continue;

                    // Skip jobs excluded from KPI by approved extension with kpi_impact=false
                    if (excludedOrderIds.has(svc.order_id)) {
                        excludedCount++;
                        continue;
                    }

                    totalWithDeadline++;
                    const completedAt = t.completed_at || svc.completed_at;
                    if (completedAt && new Date(completedAt) <= new Date(dueAt)) {
                        onTimeCount++;
                    }
                }

                const onTimeRate = totalWithDeadline > 0 ? (onTimeCount / totalWithDeadline) * 100 : 100;
                return {
                    value: Math.round(onTimeRate * 100) / 100,
                    ref: {
                        on_time: onTimeCount,
                        total_with_deadline: totalWithDeadline,
                        excluded_by_extension: excludedCount
                    }
                };
            }

            case 'before_sale_task_completed_on_time_rate': {
                // Leads assigned to this sale with follow-up tasks before closing
                // Check leads where followup was done before next_followup_time
                const { data: leads } = await supabaseAdmin
                    .from('leads')
                    .select('id, status, next_followup_time, updated_at, followup_step')
                    .eq('assigned_to', employeeId)
                    .gte('created_at', startDate)
                    .lte('created_at', endDate)
                    .not('next_followup_time', 'is', null);

                const totalLeads = (leads || []).length;
                let onTimeTasks = 0;

                for (const lead of (leads || [])) {
                    // If lead was followed up (status changed or updated before deadline)
                    if (lead.updated_at && lead.next_followup_time) {
                        if (new Date(lead.updated_at) <= new Date(lead.next_followup_time)) {
                            onTimeTasks++;
                        }
                    }
                }

                const beforeRate = totalLeads > 0 ? (onTimeTasks / totalLeads) * 100 : 100;
                return {
                    value: Math.round(beforeRate * 100) / 100,
                    ref: { on_time_tasks: onTimeTasks, total_leads: totalLeads }
                };
            }

            case 'after_sale_task_completed_on_time_rate': {
                // Orders in after_sale status assigned to this sale
                // Check if after_sale stage transitions happened on time
                const { data: afterSaleOrders } = await supabaseAdmin
                    .from('orders')
                    .select('id, after_sale_stage, due_at, updated_at')
                    .eq('sales_id', employeeId)
                    .eq('status', 'after_sale')
                    .gte('created_at', startDate)
                    .lte('created_at', endDate);

                // Also check the stage log for timeliness
                const orderIds = (afterSaleOrders || []).map(o => o.id);
                let totalAfterSale = orderIds.length;
                let onTimeAfterSale = 0;

                if (orderIds.length > 0) {
                    const { data: stageLogs } = await supabaseAdmin
                        .from('order_after_sale_stage_log')
                        .select('order_id, created_at')
                        .in('order_id', orderIds);

                    // Group by order_id - if all stage transitions exist, consider on-time
                    const logsByOrder = new Map<string, number>();
                    for (const log of (stageLogs || [])) {
                        logsByOrder.set(log.order_id, (logsByOrder.get(log.order_id) || 0) + 1);
                    }

                    // Orders with at least 1 stage log entry are considered followed up
                    for (const orderId of orderIds) {
                        if ((logsByOrder.get(orderId) || 0) > 0) {
                            onTimeAfterSale++;
                        }
                    }
                }

                const afterRate = totalAfterSale > 0 ? (onTimeAfterSale / totalAfterSale) * 100 : 100;
                return {
                    value: Math.round(afterRate * 100) / 100,
                    ref: { on_time: onTimeAfterSale, total: totalAfterSale }
                };
            }

            case 'status_update_rate': {
                // For technicians: check if they updated status for their assigned services
                // Count services assigned vs services with status log entries
                const { data: assignedServices } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select('id, service:order_product_services(id, order_id, status)')
                    .eq('technician_id', employeeId);

                // Filter to period
                const { data: periodOrders2 } = await supabaseAdmin
                    .from('orders')
                    .select('id')
                    .gte('created_at', startDate)
                    .lte('created_at', endDate);

                const periodOrderIdSet = new Set((periodOrders2 || []).map(o => o.id));

                const inPeriod = (assignedServices || []).filter((s: any) => {
                    const svc = Array.isArray(s.service) ? s.service[0] : s.service;
                    return svc && periodOrderIdSet.has(svc.order_id);
                });

                const serviceIds = inPeriod.map((s: any) => {
                    const svc = Array.isArray(s.service) ? s.service[0] : s.service;
                    return svc?.id;
                }).filter(Boolean);

                let withStatusUpdate = 0;
                if (serviceIds.length > 0) {
                    const { data: statusLogs } = await supabaseAdmin
                        .from('order_item_status_log')
                        .select('entity_id')
                        .eq('entity_type', 'order_product_service')
                        .in('entity_id', serviceIds);

                    const loggedEntities = new Set((statusLogs || []).map(l => l.entity_id));
                    withStatusUpdate = serviceIds.filter((id: string) => loggedEntities.has(id)).length;
                }

                const statusRate = serviceIds.length > 0 ? (withStatusUpdate / serviceIds.length) * 100 : 100;
                return {
                    value: Math.round(statusRate * 100) / 100,
                    ref: { with_update: withStatusUpdate, total_services: serviceIds.length }
                };
            }

            case 'late_jobs_count': {
                // From violation logs
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .eq('rule_code', 'late_jobs')
                    .eq('status', 'approved');

                return { value: (violations || []).length, ref: { count: (violations || []).length } };
            }

            case 'rework_count': {
                // From violation logs or orders with rework status
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .eq('rule_code', 'rework')
                    .eq('status', 'approved');

                return { value: (violations || []).length, ref: { count: (violations || []).length } };
            }

            case 'technical_process_violation_count': {
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .eq('rule_code', 'technical_process')
                    .eq('status', 'approved');

                return { value: (violations || []).length, ref: { count: (violations || []).length } };
            }

            case 'critical_quality_error_count': {
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .eq('rule_code', 'critical_quality_error')
                    .eq('status', 'approved');

                return { value: (violations || []).length, ref: { count: (violations || []).length } };
            }

            case 'cleaning_violation_count': {
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .eq('rule_code', 'cleaning_violation')
                    .eq('status', 'approved');

                return { value: (violations || []).length, ref: { count: (violations || []).length } };
            }

            case 'conduct_deduction_sum': {
                // Sum deduct_kpi_point for conduct violations (2-tier: conduct_light=2, conduct_severe=5)
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id, deduct_kpi_point')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .in('rule_code', ['conduct_light', 'conduct_severe'])
                    .eq('status', 'approved');

                const totalDeduction = (violations || []).reduce((sum: number, v: any) => sum + Math.abs(Number(v.deduct_kpi_point || 0)), 0);
                return {
                    value: totalDeduction,
                    ref: {
                        violations: (violations || []).map((v: any) => ({
                            id: v.id,
                            deduct_kpi_point: v.deduct_kpi_point
                        })),
                        total_deduction: totalDeduction
                    }
                };
            }

            case 'bad_feedback_count': {
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .eq('rule_code', 'bad_feedback')
                    .eq('status', 'approved');

                return { value: (violations || []).length, ref: { count: (violations || []).length } };
            }

            case 'employee_violation_logs': {
                // EXCLUDE violations already scored by their own dedicated metrics
                const excludedRuleCodes = ['lead_reclaimed', 'sla_missed', 'debt_overdue'];
                
                let violationQuery = supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('month_key', monthKey)
                    .eq('status', 'approved');
                
                for (const code of excludedRuleCodes) {
                    violationQuery = violationQuery.neq('rule_code', code);
                }
                
                const { data: violations } = await violationQuery;
                return { value: (violations || []).length, ref: { count: (violations || []).length } };
            }

            case 'overdue_receivables_after_finish_photo_by_sale': {
                // Count orders where debt_start_at is set, remaining_debt > 0,
                // and more than 10 days have passed since debt_start_at
                const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
                const now = new Date();
                
                const { data: overdueOrders } = await supabaseAdmin
                    .from('orders')
                    .select('id, order_code, debt_start_at, remaining_debt')
                    .eq('sales_id', employeeId)
                    .not('debt_start_at', 'is', null)
                    .gt('remaining_debt', 0)
                    .gte('debt_start_at', startDate)
                    .lte('debt_start_at', endDate);
                
                const overdueList = (overdueOrders || []).filter((o: any) => {
                    const debtStart = new Date(o.debt_start_at);
                    return (now.getTime() - debtStart.getTime()) > tenDaysMs;
                });
                
                return {
                    value: overdueList.length,
                    ref: {
                        overdue_count: overdueList.length,
                        overdue_orders: overdueList.map((o: any) => ({
                            order_id: o.id,
                            order_code: o.order_code,
                            debt_start_at: o.debt_start_at,
                            remaining_debt: o.remaining_debt
                        }))
                    }
                };
            }

            // ── TEAMLEAD SALE source_keys ──────────────────────────

            case 'team_order_revenue': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let totalRevenue = 0;
                const memberRevenues: any[] = [];
                for (const member of teamMembers) {
                    const { data: orders } = await supabaseAdmin
                        .from('orders')
                        .select('total_amount')
                        .eq('sales_id', member.id)
                        .in('status', ['done', 'after_sale'])
                        .gte('created_at', startDate)
                        .lte('created_at', endDate);
                    const rev = (orders || []).reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
                    totalRevenue += rev;
                    memberRevenues.push({ id: member.id, name: member.name, revenue: rev });
                }
                return { value: totalRevenue, ref: { team_size: teamMembers.length, members: memberRevenues, total: totalRevenue } };
            }

            case 'team_closed_leads_ratio': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let totalQualified = 0;
                let totalWon = 0;
                const qualifiedStages = ['hen_gui_anh', 'dam_phan_gia', 'hen_qua_ship', 'chot_don', 'fail'];
                for (const member of teamMembers) {
                    const { data: qualified } = await supabaseAdmin
                        .from('leads')
                        .select('id')
                        .eq('assigned_to', member.id)
                        .in('pipeline_stage', qualifiedStages)
                        .gte('created_at', startDate)
                        .lte('created_at', endDate);
                    totalQualified += (qualified || []).length;
                    if ((qualified || []).length > 0) {
                        const qIds = (qualified || []).map((l: any) => l.id);
                        const { data: converted } = await supabaseAdmin
                            .from('leads')
                            .select('id')
                            .in('id', qIds)
                            .not('customer_id', 'is', null);
                        totalWon += (converted || []).length;
                    }
                }
                const ratio = totalQualified > 0 ? Math.round((totalWon / totalQualified) * 100) : 0;
                return { value: ratio, ref: { qualified: totalQualified, won: totalWon, team_size: teamMembers.length } };
            }

            case 'team_return_customer_count': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let totalReturn = 0;
                for (const member of teamMembers) {
                    const memberResult = await fetchAutoMetricValue('return_customer_count', member.id, monthKey);
                    totalReturn += memberResult.value;
                }
                return { value: totalReturn, ref: { team_size: teamMembers.length } };
            }

            case 'team_member_kpi_attainment_rate': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                const memberIds = teamMembers.map(m => m.id);
                const { data: primaryAssignments } = await supabaseAdmin
                    .from('employee_kpi_assignments')
                    .select('employee_id, policy_id')
                    .in('employee_id', memberIds)
                    .eq('assignment_type', 'primary')
                    .eq('is_active', true);
                const primaryPolicyMap = new Map((primaryAssignments || []).map((a: any) => [a.employee_id, a.policy_id]));
                const { data: kpiRecords } = await supabaseAdmin
                    .from('kpi_monthly')
                    .select('employee_id, rank')
                    .in('employee_id', memberIds)
                    .eq('month_key', monthKey)
                    .in('status', ['pending', 'locked']);
                const primaryKpis = (kpiRecords || []).filter((r: any) => primaryPolicyMap.has(r.employee_id));
                const passedCount = primaryKpis.filter((r: any) => ['A+', 'A', 'B'].includes(r.rank)).length;
                const rate = teamMembers.length > 0 ? Math.round((passedCount / teamMembers.length) * 100) : 0;
                return { value: rate, ref: { passed: passedCount, total: teamMembers.length } };
            }

            case 'team_before_sale_task_completed_on_time_rate': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let totalRate = 0;
                for (const member of teamMembers) {
                    const memberResult = await fetchAutoMetricValue('before_sale_task_completed_on_time_rate', member.id, monthKey);
                    totalRate += memberResult.value;
                }
                const avgRate = teamMembers.length > 0 ? Math.round(totalRate / teamMembers.length) : 0;
                return { value: avgRate, ref: { team_size: teamMembers.length } };
            }

            case 'team_after_sale_task_completed_on_time_rate': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let totalRate = 0;
                for (const member of teamMembers) {
                    const memberResult = await fetchAutoMetricValue('after_sale_task_completed_on_time_rate', member.id, monthKey);
                    totalRate += memberResult.value;
                }
                const avgRate = teamMembers.length > 0 ? Math.round(totalRate / teamMembers.length) : 0;
                return { value: avgRate, ref: { team_size: teamMembers.length } };
            }

            case 'team_lead_reclaimed_count': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let total = 0;
                for (const member of teamMembers) {
                    const memberResult = await fetchAutoMetricValue('lead_reclaimed_count', member.id, monthKey);
                    total += memberResult.value;
                }
                return { value: total, ref: { team_size: teamMembers.length } };
            }

            case 'shift_coverage_violation_count': {
                const { data: violations } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('rule_code', 'shift_coverage')
                    .gte('occurred_at', startDate)
                    .lte('occurred_at', endDate);
                return { value: (violations || []).length, ref: { note: 'shift coverage violations' } };
            }

            case 'team_sale_operation_error_count': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                const memberIds = teamMembers.map(m => m.id);
                const { data: errors } = await supabaseAdmin
                    .from('kpi_violation_logs')
                    .select('id')
                    .in('employee_id', memberIds)
                    .eq('rule_code', 'sale_operation_error')
                    .gte('occurred_at', startDate)
                    .lte('occurred_at', endDate);
                return { value: (errors || []).length, ref: { team_size: teamMembers.length } };
            }

            // ── LEAD KỸ THUẬT source_keys ───────────────────────────

            case 'team_on_time_completion_rate': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let totalRate = 0;
                for (const member of teamMembers) {
                    const memberResult = await fetchAutoMetricValue('on_time_completion_rate', member.id, monthKey);
                    totalRate += memberResult.value;
                }
                const avgRate = teamMembers.length > 0 ? Math.round(totalRate / teamMembers.length) : 0;
                return { value: avgRate, ref: { team_size: teamMembers.length } };
            }

            case 'team_completed_jobs_vs_plan': {
                return { value: 0, ref: { source_type: 'manual' } };
            }

            case 'team_late_jobs_count': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let total = 0;
                for (const member of teamMembers) {
                    const memberResult = await fetchAutoMetricValue('late_jobs_count', member.id, monthKey);
                    total += memberResult.value;
                }
                return { value: total, ref: { team_size: teamMembers.length } };
            }

            case 'team_rework_count': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let total = 0;
                for (const member of teamMembers) {
                    const memberResult = await fetchAutoMetricValue('rework_count', member.id, monthKey);
                    total += memberResult.value;
                }
                return { value: total, ref: { team_size: teamMembers.length } };
            }

            case 'team_bad_feedback_count': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let total = 0;
                for (const member of teamMembers) {
                    const memberResult = await fetchAutoMetricValue('bad_feedback_count', member.id, monthKey);
                    total += memberResult.value;
                }
                return { value: total, ref: { team_size: teamMembers.length } };
            }

            case 'team_critical_quality_error_count': {
                const teamMembers = await resolveTeamMembers(employeeId);
                if (teamMembers.length === 0) return { value: 0, ref: { team_size: 0 } };
                let total = 0;
                for (const member of teamMembers) {
                    const memberResult = await fetchAutoMetricValue('critical_quality_error_count', member.id, monthKey);
                    total += memberResult.value;
                }
                return { value: total, ref: { team_size: teamMembers.length } };
            }

            // ── QUẢN LÝ CỬA HÀNG store_keys ───────────────────────

            case 'store_total_revenue': {
                const storeId = await resolveStoreForManager(employeeId);
                if (!storeId) return { value: 0, ref: { note: 'no store' } };
                const storeMembers = await resolveStoreMembers(storeId);
                let total = 0;
                for (const member of storeMembers) {
                    const memberResult = await fetchAutoMetricValue('order_revenue_by_sale', member.id, monthKey);
                    total += memberResult.value;
                }
                return { value: total, ref: { store_id: storeId, member_count: storeMembers.length } };
            }

            case 'store_closed_leads_ratio': {
                const storeId = await resolveStoreForManager(employeeId);
                if (!storeId) return { value: 0, ref: { note: 'no store' } };
                const storeMembers = await resolveStoreMembers(storeId);
                if (storeMembers.length === 0) return { value: 0, ref: { store_member_count: 0 } };
                let totalQualified = 0;
                let totalWon = 0;
                const qualifiedStages = ['hen_gui_anh', 'dam_phan_gia', 'hen_qua_ship', 'chot_don', 'fail'];
                for (const member of storeMembers) {
                    const { data: qualified } = await supabaseAdmin
                        .from('leads')
                        .select('id')
                        .eq('assigned_to', member.id)
                        .in('pipeline_stage', qualifiedStages)
                        .gte('created_at', startDate)
                        .lte('created_at', endDate);
                    totalQualified += (qualified || []).length;
                    if ((qualified || []).length > 0) {
                        const qIds = (qualified || []).map((l: any) => l.id);
                        const { data: converted } = await supabaseAdmin
                            .from('leads').select('id').in('id', qIds).not('customer_id', 'is', null);
                        totalWon += (converted || []).length;
                    }
                }
                const ratio = totalQualified > 0 ? Math.round((totalWon / totalQualified) * 100) : 0;
                return { value: ratio, ref: { qualified: totalQualified, won: totalWon } };
            }

            case 'store_return_customer_count': {
                const storeId = await resolveStoreForManager(employeeId);
                if (!storeId) return { value: 0, ref: { note: 'no store' } };
                const storeMembers = await resolveStoreMembers(storeId);
                let total = 0;
                for (const member of storeMembers) {
                    const memberResult = await fetchAutoMetricValue('return_customer_count', member.id, monthKey);
                    total += memberResult.value;
                }
                return { value: total, ref: { store_member_count: storeMembers.length } };
            }

            case 'store_sla_compliance_rate': {
                const storeId = await resolveStoreForManager(employeeId);
                if (!storeId) return { value: 0, ref: { note: 'no store' } };
                const storeMembers = await resolveStoreMembers(storeId);
                if (storeMembers.length === 0) return { value: 0, ref: { store_member_count: 0 } };
                let totalRate = 0;
                for (const member of storeMembers) {
                    const memberResult = await fetchAutoMetricValue('before_sale_task_completed_on_time_rate', member.id, monthKey);
                    totalRate += memberResult.value;
                }
                const avgRate = Math.round(totalRate / storeMembers.length);
                return { value: avgRate, ref: { store_member_count: storeMembers.length } };
            }

            case 'store_on_time_completion_rate': {
                const storeId = await resolveStoreForManager(employeeId);
                if (!storeId) return { value: 0, ref: { note: 'no store' } };
                const storeMembers = await resolveStoreMembers(storeId);
                if (storeMembers.length === 0) return { value: 0, ref: { store_member_count: 0 } };
                let totalRate = 0;
                for (const member of storeMembers) {
                    const memberResult = await fetchAutoMetricValue('on_time_completion_rate', member.id, monthKey);
                    totalRate += memberResult.value;
                }
                const avgRate = Math.round(totalRate / storeMembers.length);
                return { value: avgRate, ref: { store_member_count: storeMembers.length } };
            }

            case 'store_rework_count': {
                const storeId = await resolveStoreForManager(employeeId);
                if (!storeId) return { value: 0, ref: { note: 'no store' } };
                const storeMembers = await resolveStoreMembers(storeId);
                let total = 0;
                for (const member of storeMembers) {
                    const memberResult = await fetchAutoMetricValue('rework_count', member.id, monthKey);
                    total += memberResult.value;
                }
                return { value: total, ref: { store_member_count: storeMembers.length } };
            }

            case 'store_bad_feedback_count': {
                const storeId = await resolveStoreForManager(employeeId);
                if (!storeId) return { value: 0, ref: { note: 'no store' } };
                const storeMembers = await resolveStoreMembers(storeId);
                let total = 0;
                for (const member of storeMembers) {
                    const memberResult = await fetchAutoMetricValue('bad_feedback_count', member.id, monthKey);
                    total += memberResult.value;
                }
                return { value: total, ref: { store_member_count: storeMembers.length } };
            }

            case 'store_member_kpi_attainment_rate': {
                const storeId = await resolveStoreForManager(employeeId);
                if (!storeId) return { value: 0, ref: { note: 'no store' } };
                const storeMembers = await resolveStoreMembers(storeId);
                if (storeMembers.length === 0) return { value: 0, ref: { store_member_count: 0 } };
                const memberIds = storeMembers.map(m => m.id);
                const { data: primaryAssignments } = await supabaseAdmin
                    .from('employee_kpi_assignments')
                    .select('employee_id, policy_id')
                    .in('employee_id', memberIds)
                    .eq('assignment_type', 'primary')
                    .eq('is_active', true);
                const primaryPolicyMap = new Map((primaryAssignments || []).map((a: any) => [a.employee_id, a.policy_id]));
                const { data: kpiRecords } = await supabaseAdmin
                    .from('kpi_monthly')
                    .select('employee_id, rank')
                    .in('employee_id', memberIds)
                    .eq('month_key', monthKey)
                    .in('status', ['pending', 'locked']);
                const primaryKpis = (kpiRecords || []).filter((r: any) => primaryPolicyMap.has(r.employee_id));
                const passedCount = primaryKpis.filter((r: any) => ['A+', 'A', 'B'].includes(r.rank)).length;
                const rate = storeMembers.length > 0 ? Math.round((passedCount / storeMembers.length) * 100) : 0;
                return { value: rate, ref: { passed: passedCount, total: storeMembers.length } };
            }

            // ── MANUAL source_keys (manager fills in actual_value) ──

            case 'teamlead_weekly_report_submission':
            case 'teamlead_training_completion_score':
            case 'marketing_coordination_score':
            case 'team_conduct_cooperation_score':
            case 'technical_assignment_management_score':
            case 'technical_issue_handling_score':
            case 'team_technical_process_compliance_score':
            case 'technical_training_completion_score':
            case 'store_coordination_score':
            case 'store_training_score':
                return { value: 0, ref: { source_type: 'manual' } };

            default:
                return { value: 0, ref: { note: `Unknown source_key: ${sourceKey}` } };
        }
    } catch (err) {
        console.error(`[KPI] Error fetching auto metric ${sourceKey}:`, err);
        return { value: 0, ref: { error: 'Failed to fetch' } };
    }
}

// ============================================================
// Find matching rank from configs
// ============================================================
function findMatchingRank(configs: any[], totalScore: number): {
    rank: string;
    bonus_amount: number;
    penalty_amount: number;
    commission_factor: number;
} {
    for (const config of configs) {
        if (totalScore >= config.min_score && totalScore <= config.max_score) {
            return {
                rank: config.rank_code,
                bonus_amount: Number(config.bonus_amount),
                penalty_amount: Number(config.penalty_amount),
                commission_factor: Number(config.commission_factor)
            };
        }
    }

    // Default to lowest rank
    const lowest = configs[configs.length - 1];
    return {
        rank: lowest.rank_code,
        bonus_amount: Number(lowest.bonus_amount),
        penalty_amount: Number(lowest.penalty_amount),
        commission_factor: Number(lowest.commission_factor)
    };
}

// ============================================================
// Determine rank from score (policy-first with global fallback)
// ============================================================
async function determineRank(totalScore: number, policyId?: string): Promise<{
    rank: string;
    bonus_amount: number;
    penalty_amount: number;
    commission_factor: number;
}> {
    const defaultResult = { rank: 'N/A', bonus_amount: 0, penalty_amount: 0, commission_factor: 100.0 };

    // If policyId provided, try policy-specific configs first
    if (policyId) {
        const { data: policyConfigs } = await supabaseAdmin
            .from('kpi_rank_configs')
            .select('*')
            .eq('policy_id', policyId)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (policyConfigs && policyConfigs.length > 0) {
            return findMatchingRank(policyConfigs, totalScore);
        }
    }

    // Fallback to global configs
    const { data: globalConfigs } = await supabaseAdmin
        .from('kpi_rank_configs')
        .select('*')
        .is('policy_id', null)
        .is('employee_id', null)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

    if (!globalConfigs || globalConfigs.length === 0) {
        return defaultResult;
    }

    return findMatchingRank(globalConfigs, totalScore);
}

// ============================================================
// KPI MONTHLY ROUTES
// ============================================================

// GET /api/kpi/monthly - List monthly KPI records
router.get('/monthly', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month_key, status, employee_id, page = 1, limit = 50 } = req.query;

        const now = new Date();
        const currentMonthKey = month_key || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const offset = (pageNum - 1) * limitNum;

        let query = supabaseAdmin
            .from('kpi_monthly')
            .select(`
                *,
                employee:users!kpi_monthly_employee_id_fkey(id, name, email, avatar, role, department, department_id, departments!department_id(name)),
                policy:kpi_policies(id, code, name),
                reviewer:users!kpi_monthly_reviewed_by_fkey(id, name)
            `, { count: 'exact' })
            .eq('month_key', currentMonthKey)
            .order('total_score', { ascending: false })
            .range(offset, offset + limitNum - 1);

        if (status && status !== 'all') query = query.eq('status', status);
        if (employee_id) query = query.eq('employee_id', employee_id);

        const { data: records, error, count } = await query;

        if (error) throw new ApiError('Lỗi khi lấy danh sách KPI tháng: ' + error.message, 500);

        // Summary stats
        const allRecords = records || [];
        const summary = {
            total: count || 0,
            draft: allRecords.filter((r: any) => r.status === 'draft').length,
            pending: allRecords.filter((r: any) => r.status === 'pending').length,
            locked: allRecords.filter((r: any) => r.status === 'locked').length,
            avg_score: allRecords.length > 0
                ? Math.round(allRecords.reduce((sum: number, r: any) => sum + Number(r.total_score), 0) / allRecords.length * 100) / 100
                : 0
        };

        res.json({
            status: 'success',
            data: {
                records: allRecords,
                month_key: currentMonthKey,
                summary,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / limitNum)
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/kpi/monthly/:id - Get detail of one employee's monthly KPI
router.get('/monthly/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: records, error } = await supabaseAdmin
            .from('kpi_monthly')
            .select(`
                *,
                employee:users!kpi_monthly_employee_id_fkey(id, name, email, avatar, role, department, department_id, departments!department_id(name)),
                policy:kpi_policies(id, code, name),
                reviewer:users!kpi_monthly_reviewed_by_fkey(id, name)
            `)
            .eq('id', id);

        const record = records?.[0];
        if (error || !record) throw new ApiError('Không tìm thấy KPI tháng', 404);

        if (record.employee) {
            record.employee.department = record.employee.departments?.name || record.employee.department || null;
        }

        // Get items
        const { data: items } = await supabaseAdmin
            .from('kpi_monthly_items')
            .select('*')
            .eq('monthly_kpi_id', id)
            .order('created_at', { ascending: true });

        // Get violations for this employee/month
        const { data: violations } = await supabaseAdmin
            .from('kpi_violation_logs')
            .select('*')
            .eq('employee_id', record.employee_id)
            .eq('month_key', record.month_key)
            .order('created_at', { ascending: false });

        // Get adjustment logs
        const { data: adjustments } = await supabaseAdmin
            .from('kpi_adjustment_logs')
            .select(`
                *,
                creator:users!kpi_adjustment_logs_created_by_fkey(id, name)
            `)
            .eq('monthly_kpi_id', id)
            .order('created_at', { ascending: false });

        res.json({
            status: 'success',
            data: {
                record: {
                    ...record,
                    items: items || [],
                    violations: violations || [],
                    adjustments: adjustments || []
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/monthly/generate - Generate monthly KPI for all employees
router.post('/monthly/generate', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month_key } = req.body;

        if (!month_key) throw new ApiError('Thiếu month_key (YYYY-MM)', 400);

        // Validate format
        if (!/^\d{4}-\d{2}$/.test(month_key)) {
            throw new ApiError('month_key phải có định dạng YYYY-MM', 400);
        }

        // Get all active assignments with employee + policy info
        const { data: allAssignments, error: assignError } = await supabaseAdmin
            .from('employee_kpi_assignments')
            .select(`
                id,
                employee_id,
                policy_id,
                assignment_type,
                compensation_bucket,
                effective_from,
                effective_to,
                employee:users!employee_kpi_assignments_employee_id_fkey(id, name, role, status),
                policy:kpi_policies!employee_kpi_assignments_policy_id_fkey(id, code, name)
            `)
            .eq('is_active', true);

        if (assignError) throw new ApiError('Lỗi khi lấy danh sách gán KPI: ' + assignError.message, 500);

        // Filter: only assignments active for this month and employee is active
        const [yearNum, monthNum] = month_key.split('-').map(Number);
        const monthStart = new Date(yearNum, monthNum - 1, 1);
        const monthEnd = new Date(yearNum, monthNum, 0);

        const activeAssignments = (allAssignments || []).filter((a: any) => {
            if (a.employee?.status !== 'active') return false;
            const effFrom = new Date(a.effective_from);
            const effTo = a.effective_to ? new Date(a.effective_to) : null;
            return effFrom <= monthEnd && (!effTo || effTo >= monthStart);
        });

        if (activeAssignments.length === 0) {
            throw new ApiError('Không có nhân sự nào được gán chính sách KPI. Vui lòng gán chính sách KPI cho nhân sự trước.', 400);
        }

        const results: any[] = [];
        const errors: any[] = [];

        for (const assignment of activeAssignments) {
            const emp = assignment.employee as any;
            try {
                // Check if already exists
                const { data: existingList } = await supabaseAdmin
                    .from('kpi_monthly')
                    .select('id, status')
                    .eq('employee_id', emp.id)
                    .eq('month_key', month_key)
                    .eq('policy_id', assignment.policy_id);
                const existing = existingList?.[0] || null;

                if (existing) {
                    if (existing.status === 'locked') {
                        errors.push({ employee: emp.name, error: 'KPI đã khóa, không thể tạo lại' });
                        continue;
                    }
                    // Delete existing draft/pending to regenerate
                    await supabaseAdmin.from('kpi_monthly_items').delete().eq('monthly_kpi_id', existing.id);
                    await supabaseAdmin.from('kpi_monthly').delete().eq('id', existing.id);
                }

                // Get policy metrics
                const { data: metrics } = await supabaseAdmin
                    .from('kpi_policy_metrics')
                    .select('*')
                    .eq('policy_id', assignment.policy_id)
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true });

                if (!metrics || metrics.length === 0) {
                    errors.push({ employee: emp.name, error: 'Chính sách KPI không có chỉ tiêu nào' });
                    continue;
                }

                // Create monthly record
                const { data: monthlyList, error: monthlyError } = await supabaseAdmin
                    .from('kpi_monthly')
                    .insert({
                        employee_id: emp.id,
                        month_key,
                        policy_id: assignment.policy_id,
                        status: 'draft'
                    })
                    .select();

                const monthly = monthlyList?.[0];
                if (monthlyError) {
                    errors.push({ employee: emp.name, error: monthlyError.message });
                    continue;
                }

                // Process each metric
                let totalScore = 0;
                const items: any[] = [];

                for (const metric of metrics) {
                    let actualValue = 0;
                    let sourceRef: any = null;

                    // Fetch auto data
                    if (metric.source_type === 'auto' || metric.source_type === 'hybrid') {
                        if (metric.source_key) {
                            const autoData = await fetchAutoMetricValue(metric.source_key, emp.id, month_key);
                            actualValue = autoData.value;
                            sourceRef = autoData.ref;
                        }
                    }
                    // manual: leave actualValue = 0 for manager to fill in

                    // Calculate score
                    const { raw_score, achievement_rate } = calculateMetricScore(
                        metric.scoring_rules,
                        Number(metric.weight),
                        Number(metric.target_value),
                        actualValue
                    );

                    const finalScore = raw_score; // No manual adjustment yet

                    items.push({
                        monthly_kpi_id: monthly.id,
                        metric_code: metric.metric_code,
                        metric_name: metric.metric_name,
                        metric_group: metric.metric_group,
                        weight: metric.weight,
                        target_value: metric.target_value,
                        actual_value: actualValue,
                        achievement_rate,
                        raw_score,
                        manual_adjustment: 0,
                        final_score: finalScore,
                        source_type: metric.source_type,
                        source_ref: sourceRef
                    });

                    totalScore += finalScore;
                }

                // Insert items
                if (items.length > 0) {
                    const { error: itemsError } = await supabaseAdmin
                        .from('kpi_monthly_items')
                        .insert(items);

                    if (itemsError) {
                        console.error('[KPI] Error inserting items:', itemsError);
                    }
                }

                totalScore = Math.max(0, totalScore);

                // Determine rank
                const rankResult = await determineRank(totalScore, assignment.policy_id);

                // Update monthly record with totals
                await supabaseAdmin
                    .from('kpi_monthly')
                    .update({
                        total_score: totalScore,
                        rank: rankResult.rank,
                        kpi_bonus_amount: rankResult.bonus_amount,
                        kpi_penalty_amount: rankResult.penalty_amount,
                        kpi_commission_factor: rankResult.commission_factor
                    })
                    .eq('id', monthly.id);

                results.push({
                    employee_id: emp.id,
                    employee_name: emp.name,
                    monthly_kpi_id: monthly.id,
                    total_score: totalScore,
                    rank: rankResult.rank
                });
            } catch (err: any) {
                errors.push({ employee: emp.name, error: err.message });
            }
        }

        res.json({
            status: 'success',
            data: {
                generated: results.length,
                errors: errors.length,
                results,
                errors_detail: errors
            }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/monthly/:id/recalculate - Recalculate scores
router.post('/monthly/:id/recalculate', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Get the monthly record
        const { data: monthlyList, error } = await supabaseAdmin
            .from('kpi_monthly')
            .select('*')
            .eq('id', id);

        const monthly = monthlyList?.[0];
        if (error || !monthly) throw new ApiError('Không tìm thấy KPI tháng', 404);
        if (monthly.status === 'locked') throw new ApiError('KPI đã khóa, không thể tính lại', 400);

        // Get items
        const { data: items } = await supabaseAdmin
            .from('kpi_monthly_items')
            .select('*')
            .eq('monthly_kpi_id', id);

        if (!items || items.length === 0) throw new ApiError('Không có chỉ tiêu KPI nào', 400);

        // Get policy metrics for scoring rules
        const { data: policyMetrics } = await supabaseAdmin
            .from('kpi_policy_metrics')
            .select('*')
            .eq('policy_id', monthly.policy_id);

        const metricsMap = new Map((policyMetrics || []).map((m: any) => [m.metric_code, m]));

        let totalScore = 0;

        for (const item of items) {
            const policyMetric = metricsMap.get(item.metric_code);
            const scoringRules = policyMetric?.scoring_rules || {};

            // Re-fetch auto data if source_type is auto
            let actualValue = Number(item.actual_value);
            let sourceRef = item.source_ref;

            if (item.source_type === 'auto' || item.source_type === 'hybrid') {
                if (policyMetric?.source_key) {
                    const autoData = await fetchAutoMetricValue(policyMetric.source_key, monthly.employee_id, monthly.month_key);
                    actualValue = autoData.value;
                    sourceRef = autoData.ref;
                }
            }

            const { raw_score, achievement_rate } = calculateMetricScore(
                scoringRules,
                Number(item.weight),
                Number(item.target_value),
                actualValue
            );

            const finalScore = raw_score + Number(item.manual_adjustment);

            await supabaseAdmin
                .from('kpi_monthly_items')
                .update({
                    actual_value: actualValue,
                    achievement_rate,
                    raw_score,
                    final_score: Math.max(finalScore, 0),
                    source_ref: sourceRef
                })
                .eq('id', item.id);

            totalScore += Math.max(finalScore, 0);
        }

        // Add manual adjustment from monthly level
        totalScore += Number(monthly.manual_adjustment_score || 0);

        totalScore = Math.max(0, totalScore);

        // Determine rank
        const rankResult = await determineRank(totalScore, monthly.policy_id);

        // Update monthly
        const { data: updatedList } = await supabaseAdmin
            .from('kpi_monthly')
            .update({
                total_score: totalScore,
                rank: rankResult.rank,
                kpi_bonus_amount: rankResult.bonus_amount,
                kpi_penalty_amount: rankResult.penalty_amount,
                kpi_commission_factor: rankResult.commission_factor
            })
            .eq('id', id)
            .select();

        const updated = updatedList?.[0];
        res.json({
            status: 'success',
            data: { record: updated }
        });
    } catch (error) {
        next(error);
    }
});

// PATCH /api/kpi/monthly/:id - Update monthly KPI (manual adjustments)
router.patch('/monthly/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: monthly } = await supabaseAdmin
            .from('kpi_monthly')
            .select('status')
            .eq('id', id)
            .single();

        if (!monthly) throw new ApiError('Không tìm thấy KPI tháng', 404);
        if (monthly.status === 'locked') throw new ApiError('KPI đã khóa, không thể sửa', 400);

        const { manual_adjustment_score, note, items } = req.body;

        // Update individual items if provided
        if (items && Array.isArray(items)) {
            for (const item of items) {
                if (!item.id) continue;
                const updateFields: any = {};
                if (item.actual_value !== undefined) updateFields.actual_value = item.actual_value;
                if (item.manual_adjustment !== undefined) updateFields.manual_adjustment = item.manual_adjustment;
                if (item.note !== undefined) updateFields.note = item.note;

                if (Object.keys(updateFields).length > 0) {
                    await supabaseAdmin
                        .from('kpi_monthly_items')
                        .update(updateFields)
                        .eq('id', item.id);
                }
            }
        }

        // Update monthly record
        const updateData: any = {};
        if (manual_adjustment_score !== undefined) updateData.manual_adjustment_score = manual_adjustment_score;
        if (note !== undefined) updateData.note = note;

        if (Object.keys(updateData).length > 0) {
            await supabaseAdmin
                .from('kpi_monthly')
                .update(updateData)
                .eq('id', id);
        }

        // Return success - caller should recalculate if needed
        res.json({
            status: 'success',
            message: 'Đã cập nhật KPI tháng. Hãy tính lại điểm nếu cần.'
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/monthly/:id/lock - Lock monthly KPI
router.post('/monthly/:id/lock', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: monthly } = await supabaseAdmin
            .from('kpi_monthly')
            .select('status')
            .eq('id', id)
            .single();

        if (!monthly) throw new ApiError('Không tìm thấy KPI tháng', 404);
        if (monthly.status === 'locked') throw new ApiError('KPI đã khóa rồi', 400);

        const { data: updated, error } = await supabaseAdmin
            .from('kpi_monthly')
            .update({
                status: 'locked',
                reviewed_by: req.user!.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select(`
                *,
                employee:users!kpi_monthly_employee_id_fkey(id, name, role)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi khóa KPI: ' + error.message, 500);

        res.json({
            status: 'success',
            data: { record: updated }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/monthly/batch-lock - Lock all KPIs for a month
router.post('/monthly/batch-lock', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month_key } = req.body;
        if (!month_key) throw new ApiError('Thiếu month_key', 400);

        const { data: updated, error } = await supabaseAdmin
            .from('kpi_monthly')
            .update({
                status: 'locked',
                reviewed_by: req.user!.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('month_key', month_key)
            .in('status', ['draft', 'pending'])
            .select('id');

        if (error) throw new ApiError('Lỗi khi khóa hàng loạt: ' + error.message, 500);

        res.json({
            status: 'success',
            data: { locked_count: (updated || []).length }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/monthly/:id/push-to-payroll - Push KPI result to payroll
router.post('/monthly/:id/push-to-payroll', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: monthly, error } = await supabaseAdmin
            .from('kpi_monthly')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !monthly) throw new ApiError('Không tìm thấy KPI tháng', 404);
        if (monthly.status !== 'locked') {
            throw new ApiError('Chỉ có thể đẩy KPI đã khóa sang bảng lương', 400);
        }

        const [yearStr, monthStr] = monthly.month_key.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);

        // Look up assignment type for this policy
        const { data: assignment } = await supabaseAdmin
            .from('employee_kpi_assignments')
            .select('assignment_type, compensation_bucket, policy:kpi_policies(code)')
            .eq('employee_id', monthly.employee_id)
            .eq('policy_id', monthly.policy_id)
            .eq('is_active', true)
            .maybeSingle();

        const salaryRecordList = await supabaseAdmin
            .from('salary_records')
            .select('id, kpi_secondary_details')
            .eq('user_id', monthly.employee_id)
            .eq('month', month)
            .eq('year', year);
        const salaryRecord = salaryRecordList.data?.[0] || null;

        if (salaryRecord) {
            const updateData: any = { updated_at: new Date().toISOString() };

            if (!assignment || assignment.assignment_type === 'primary') {
                updateData.kpi_achievement = monthly.total_score;
                updateData.kpi_primary_score = monthly.total_score;
                updateData.kpi_primary_rank = monthly.rank;
                updateData.kpi_primary_bonus = monthly.kpi_bonus_amount;
                updateData.kpi_primary_penalty = monthly.kpi_penalty_amount;
                updateData.kpi_primary_commission_factor = monthly.kpi_commission_factor;
            } else {
                // Secondary: update the JSONB array
                const existing = salaryRecord.kpi_secondary_details || [];
                const filtered = (existing as any[]).filter((d: any) => d.policy_id !== monthly.policy_id);
                filtered.push({
                    policy_id: monthly.policy_id,
                    policy_code: (assignment as any)?.policy?.code ?? '',
                    score: monthly.total_score,
                    rank: monthly.rank,
                    bonus: monthly.kpi_bonus_amount,
                    penalty: monthly.kpi_penalty_amount,
                    commission_factor: monthly.kpi_commission_factor,
                });
                updateData.kpi_secondary_details = filtered;
            }

            await supabaseAdmin
                .from('salary_records')
                .update(updateData)
                .eq('id', salaryRecord.id);
        }

        res.json({
            status: 'success',
            data: {
                pushed: true,
                assignment_type: assignment?.assignment_type || 'primary',
                kpi_score_final: monthly.total_score,
                kpi_rank_final: monthly.rank,
                kpi_bonus_amount: monthly.kpi_bonus_amount,
                kpi_penalty_amount: monthly.kpi_penalty_amount,
                kpi_commission_factor: monthly.kpi_commission_factor,
                salary_record_updated: !!salaryRecord
            }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/monthly/batch-push - Push all locked KPIs to payroll
router.post('/monthly/batch-push', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month_key } = req.body;
        if (!month_key) throw new ApiError('Thiếu month_key', 400);

        const { data: lockedRecords } = await supabaseAdmin
            .from('kpi_monthly')
            .select('*')
            .eq('month_key', month_key)
            .eq('status', 'locked');

        if (!lockedRecords || lockedRecords.length === 0) {
            throw new ApiError('Không có KPI nào đã khóa trong tháng này', 400);
        }

        const [yearStr, monthStr] = month_key.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);

        const employeeIds = [...new Set(lockedRecords.map((r: any) => r.employee_id))];
        const { data: allAssignments } = await supabaseAdmin
            .from('employee_kpi_assignments')
            .select('employee_id, policy_id, assignment_type, compensation_bucket, policy:kpi_policies(code)')
            .in('employee_id', employeeIds)
            .eq('is_active', true);

        const assignmentLookup = new Map<string, any>();
        for (const a of (allAssignments || [])) {
            assignmentLookup.set(`${a.employee_id}:${a.policy_id}`, a);
        }

        const { data: salaryRecords } = await supabaseAdmin
            .from('salary_records')
            .select('id, user_id, kpi_secondary_details')
            .in('user_id', employeeIds)
            .eq('month', month)
            .eq('year', year);

        const salaryRecordMap = new Map<string, any>();
        for (const sr of (salaryRecords || [])) {
            salaryRecordMap.set(sr.user_id, sr);
        }

        let updatedCount = 0;

        for (const record of lockedRecords) {
            const salaryRecord = salaryRecordMap.get(record.employee_id);
            if (!salaryRecord) continue;

            const assignment = assignmentLookup.get(`${record.employee_id}:${record.policy_id}`);
            const updateData: any = { updated_at: new Date().toISOString() };

            if (!assignment || assignment.assignment_type === 'primary') {
                updateData.kpi_achievement = record.total_score;
                updateData.kpi_primary_score = record.total_score;
                updateData.kpi_primary_rank = record.rank;
                updateData.kpi_primary_bonus = record.kpi_bonus_amount;
                updateData.kpi_primary_penalty = record.kpi_penalty_amount;
                updateData.kpi_primary_commission_factor = record.kpi_commission_factor;
            } else {
                const existing = salaryRecord.kpi_secondary_details || [];
                const filtered = (existing as any[]).filter((d: any) => d.policy_id !== record.policy_id);
                filtered.push({
                    policy_id: record.policy_id,
                    policy_code: (assignment as any)?.policy?.code ?? '',
                    score: record.total_score,
                    rank: record.rank,
                    bonus: record.kpi_bonus_amount,
                    penalty: record.kpi_penalty_amount,
                    commission_factor: record.kpi_commission_factor,
                });
                updateData.kpi_secondary_details = filtered;
                salaryRecord.kpi_secondary_details = filtered;
            }

            await supabaseAdmin
                .from('salary_records')
                .update(updateData)
                .eq('id', salaryRecord.id);
            updatedCount++;
        }

        res.json({
            status: 'success',
            data: {
                total_locked: lockedRecords.length,
                salary_records_updated: updatedCount
            }
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================
// ADJUSTMENT LOGS - For modifying locked KPIs
// ============================================================

// GET /api/kpi/monthly/:id/adjustments - List adjustment logs
router.get('/monthly/:id/adjustments', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: adjustments, error } = await supabaseAdmin
            .from('kpi_adjustment_logs')
            .select(`
                *,
                creator:users!kpi_adjustment_logs_created_by_fkey(id, name)
            `)
            .eq('monthly_kpi_id', id)
            .order('created_at', { ascending: false });

        if (error) throw new ApiError('Lỗi khi lấy lịch sử điều chỉnh: ' + error.message, 500);

        res.json({
            status: 'success',
            data: { adjustments: adjustments || [] }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/monthly/:id/adjustments - Create adjustment for locked KPI
router.post('/monthly/:id/adjustments', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { field_name, old_value, new_value, reason, item_id } = req.body;

        if (!field_name || !reason) {
            throw new ApiError('Thiếu thông tin bắt buộc (field_name, reason)', 400);
        }

        // Get the monthly record
        const { data: monthly } = await supabaseAdmin
            .from('kpi_monthly')
            .select('id, status, employee_id, month_key, total_score, rank')
            .eq('id', id)
            .single();

        if (!monthly) throw new ApiError('Không tìm thấy KPI tháng', 404);
        if (monthly.status !== 'locked') {
            throw new ApiError('Chỉ KPI đã khóa mới cần tạo điều chỉnh. KPI chưa khóa có thể sửa trực tiếp.', 400);
        }

        // Create adjustment log
        const { data: adjustment, error: adjError } = await supabaseAdmin
            .from('kpi_adjustment_logs')
            .insert({
                monthly_kpi_id: id,
                field_name,
                old_value: String(old_value ?? ''),
                new_value: String(new_value ?? ''),
                reason,
                created_by: req.user!.id
            })
            .select(`
                *,
                creator:users!kpi_adjustment_logs_created_by_fkey(id, name)
            `)
            .single();

        if (adjError) throw new ApiError('Lỗi khi tạo điều chỉnh: ' + adjError.message, 500);

        // Apply the adjustment
        if (item_id) {
            // Adjustment to a specific metric item
            const updateFields: any = {};
            if (field_name === 'actual_value') updateFields.actual_value = Number(new_value);
            if (field_name === 'manual_adjustment') updateFields.manual_adjustment = Number(new_value);
            if (field_name === 'final_score') updateFields.final_score = Number(new_value);

            if (Object.keys(updateFields).length > 0) {
                await supabaseAdmin
                    .from('kpi_monthly_items')
                    .update(updateFields)
                    .eq('id', item_id);
            }
        } else {
            // Adjustment to monthly record level
            const updateFields: any = {};
            if (field_name === 'manual_adjustment_score') updateFields.manual_adjustment_score = Number(new_value);
            if (field_name === 'total_score') updateFields.total_score = Number(new_value);
            if (field_name === 'note') updateFields.note = new_value;

            if (Object.keys(updateFields).length > 0) {
                await supabaseAdmin
                    .from('kpi_monthly')
                    .update(updateFields)
                    .eq('id', id);
            }
        }

        // If score-related fields changed, recalculate rank
        if (['total_score', 'manual_adjustment_score', 'actual_value', 'final_score'].includes(field_name)) {
            // Re-sum items to get new total
            const { data: items } = await supabaseAdmin
                .from('kpi_monthly_items')
                .select('final_score')
                .eq('monthly_kpi_id', id);

            const { data: monthlyRecord } = await supabaseAdmin
                .from('kpi_monthly')
                .select('manual_adjustment_score, policy_id')
                .eq('id', id)
                .single();

            const itemsTotal = (items || []).reduce((sum: number, i: any) => sum + Number(i.final_score || 0), 0);
            const totalScore = itemsTotal + Number(monthlyRecord?.manual_adjustment_score || 0);

            const rankResult = await determineRank(totalScore, monthlyRecord?.policy_id);

            await supabaseAdmin
                .from('kpi_monthly')
                .update({
                    total_score: totalScore,
                    rank: rankResult.rank,
                    kpi_bonus_amount: rankResult.bonus_amount,
                    kpi_penalty_amount: rankResult.penalty_amount,
                    kpi_commission_factor: rankResult.commission_factor
                })
                .eq('id', id);
        }

        res.status(201).json({
            status: 'success',
            data: { adjustment }
        });
    } catch (error) {
        next(error);
    }
});

export { router as kpiMonthlyRouter };
