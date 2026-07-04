import { supabaseAdmin } from '../config/supabase.js';

interface KpiViolationParams {
    employeeId: string;
    ruleCode: string;
    ruleName: string;
    deductPoint: number;
    relatedLeadId?: string;
    relatedOrderId?: string;
    note?: string;
    violationType?: 'discipline' | 'quality' | 'process' | 'other';
}

export async function autoLogKpiViolation(params: KpiViolationParams): Promise<void> {
    const { employeeId, ruleCode, ruleName, deductPoint, relatedLeadId, relatedOrderId, note, violationType } = params;
    
    if (!employeeId) return;
    
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Dedup check: match on employee + rule_code + related entity
    let dedupQuery = supabaseAdmin.from('kpi_violation_logs')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('rule_code', ruleCode);
    
    if (relatedLeadId) {
        dedupQuery = dedupQuery.eq('related_lead_id', relatedLeadId);
    }
    if (relatedOrderId) {
        dedupQuery = dedupQuery.eq('related_order_id', relatedOrderId);
    }
    
    const { data: existing } = await dedupQuery.limit(1).maybeSingle();
    if (existing) return;
    
    const { error } = await supabaseAdmin.from('kpi_violation_logs').insert({
        employee_id: employeeId,
        month_key: monthKey,
        violation_type: violationType || 'discipline',
        rule_code: ruleCode,
        rule_name: ruleName,
        source_type: 'auto',
        deduct_kpi_point: 0,
        deduct_amount: 0,
        related_lead_id: relatedLeadId || null,
        related_order_id: relatedOrderId || null,
        note: note || `Hệ thống tự động ghi nhận vào lúc ${now.toLocaleString('vi-VN')}`,
        status: 'approved'
    });
    
    if (error) {
        console.error(`[KPI Violation] Error auto logging ${ruleCode}:`, error);
    }
}
