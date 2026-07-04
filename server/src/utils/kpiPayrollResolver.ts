import { supabaseAdmin } from '../config/supabase.js';

export interface KpiPayrollResult {
    primary: {
        score: number;
        rank: string | null;
        bonus: number;
        penalty: number;
        commissionFactor: number;
    };
    secondaryDetails: Array<{
        policy_id: string;
        policy_code: string;
        score: number;
        rank: string | null;
        bonus: number;
        penalty: number;
        commission_factor: number;
        bucket: string;
    }>;
    teamleadBonus: number;
    managementBonus: number;
}

export async function resolveEmployeeKpiForPayroll(
    employeeId: string,
    monthKey: string
): Promise<KpiPayrollResult> {
    const defaultResult: KpiPayrollResult = {
        primary: { score: 0, rank: null, bonus: 0, penalty: 0, commissionFactor: 100 },
        secondaryDetails: [],
        teamleadBonus: 0,
        managementBonus: 0,
    };

    try {
        // Fetch all locked KPI records for this employee+month
        const { data: kpiRecords } = await supabaseAdmin
            .from('kpi_monthly')
            .select('*, policy:kpi_policies(id, code, name, compensation_rules)')
            .eq('employee_id', employeeId)
            .eq('month_key', monthKey)
            .eq('status', 'locked');

        if (!kpiRecords || kpiRecords.length === 0) return defaultResult;

        // Fetch active assignments for this employee
        const { data: empAssignments } = await supabaseAdmin
            .from('employee_kpi_assignments')
            .select('policy_id, assignment_type, compensation_bucket')
            .eq('employee_id', employeeId)
            .eq('is_active', true);

        const assignmentMap = new Map(
            (empAssignments || []).map((a: any) => [a.policy_id, a])
        );

        const primaryKpi = kpiRecords.find(
            (r: any) => assignmentMap.get(r.policy_id)?.assignment_type === 'primary'
        );
        const secondaryKpis = kpiRecords.filter(
            (r: any) => assignmentMap.get(r.policy_id)?.assignment_type === 'secondary'
        );

        const result: KpiPayrollResult = {
            primary: {
                score: Number(primaryKpi?.total_score) || 0,
                rank: primaryKpi?.rank || null,
                bonus: Number(primaryKpi?.kpi_bonus_amount) || 0,
                penalty: Number(primaryKpi?.kpi_penalty_amount) || 0,
                commissionFactor: Number(primaryKpi?.kpi_commission_factor) || 100,
            },
            secondaryDetails: [],
            teamleadBonus: 0,
            managementBonus: 0,
        };

        for (const secKpi of secondaryKpis) {
            const policy = (secKpi as any).policy;
            const rules = policy?.compensation_rules;
            const assignment = assignmentMap.get(secKpi.policy_id);
            let bonus = 0;

            if (rules?.type === 'team_revenue_percentage') {
                // Fetch team revenue for teamlead commission
                const teamRevenue = await fetchTeamRevenueForEmployee(employeeId, monthKey);
                const rate = rules.rates_by_rank?.[secKpi.rank] ?? 0;
                bonus = Math.floor(teamRevenue * rate);

                if (assignment?.compensation_bucket === 'teamlead_sale') {
                    result.teamleadBonus += bonus;
                } else {
                    result.managementBonus += bonus;
                }
            }

            result.secondaryDetails.push({
                policy_id: secKpi.policy_id,
                policy_code: policy?.code || '',
                score: Number(secKpi.total_score) || 0,
                rank: secKpi.rank || null,
                bonus,
                penalty: Number(secKpi.kpi_penalty_amount) || 0,
                commission_factor: Number(secKpi.kpi_commission_factor) || 100,
                bucket: assignment?.compensation_bucket || 'secondary_general',
            });
        }

        return result;
    } catch (err) {
        console.error('[kpiPayrollResolver] resolveEmployeeKpiForPayroll error:', err);
        return defaultResult;
    }
}

async function fetchTeamRevenueForEmployee(teamleadId: string, monthKey: string): Promise<number> {
    try {
        // Find departments managed by this teamlead
        const { data: departments } = await supabaseAdmin
            .from('departments')
            .select('id')
            .eq('manager_id', teamleadId);

        let memberIds: string[] = [];

        if (departments && departments.length > 0) {
            const deptIds = departments.map((d: any) => d.id);
            const { data: members } = await supabaseAdmin
                .from('users')
                .select('id')
                .in('department_id', deptIds)
                .eq('status', 'active')
                .neq('id', teamleadId);
            memberIds = (members || []).map((m: any) => m.id);
        } else {
            // Fallback: same department members
            const { data: teamlead } = await supabaseAdmin
                .from('users')
                .select('department_id')
                .eq('id', teamleadId)
                .single();
            if (teamlead?.department_id) {
                const { data: members } = await supabaseAdmin
                    .from('users')
                    .select('id')
                    .eq('department_id', teamlead.department_id)
                    .eq('status', 'active')
                    .neq('id', teamleadId);
                memberIds = (members || []).map((m: any) => m.id);
            }
        }

        if (memberIds.length === 0) return 0;

        const [year, month] = monthKey.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1).toISOString();
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

        const { data: orders } = await supabaseAdmin
            .from('orders')
            .select('total_amount')
            .in('sales_id', memberIds)
            .in('status', ['done', 'after_sale'])
            .gte('created_at', startDate)
            .lte('created_at', endDate);

        return (orders || []).reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);
    } catch (err) {
        console.error('[kpiPayrollResolver] fetchTeamRevenueForEmployee error:', err);
        return 0;
    }
}
