import { supabaseAdmin } from '../config/supabase.js';

export interface TeamMember {
    id: string;
    name: string;
    role: string;
}

export async function resolveTeamMembers(teamleadId: string): Promise<TeamMember[]> {
    // 1. Find departments where this user is manager
    const { data: departments } = await supabaseAdmin
        .from('departments')
        .select('id')
        .eq('manager_id', teamleadId)
        .eq('status', 'active');

    if (!departments || departments.length === 0) {
        // Fallback: find users in the same department as the teamlead
        const { data: teamlead } = await supabaseAdmin
            .from('users')
            .select('department_id')
            .eq('id', teamleadId)
            .single();

        if (!teamlead?.department_id) return [];

        const { data: members } = await supabaseAdmin
            .from('users')
            .select('id, name, role')
            .eq('department_id', teamlead.department_id)
            .eq('status', 'active')
            .neq('id', teamleadId);

        return (members || []) as TeamMember[];
    }

    const deptIds = departments.map((d: any) => d.id);
    const { data: members } = await supabaseAdmin
        .from('users')
        .select('id, name, role')
        .in('department_id', deptIds)
        .eq('status', 'active')
        .neq('id', teamleadId);

    return (members || []) as TeamMember[];
}

export async function resolveStoreMembers(storeId: string): Promise<TeamMember[]> {
    const { data: members } = await supabaseAdmin
        .from('users')
        .select('id, name, role')
        .eq('store_id', storeId)
        .eq('status', 'active');

    return (members || []) as TeamMember[];
}

export async function resolveStoreForManager(managerId: string): Promise<string | null> {
    const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id')
        .eq('manager_id', managerId)
        .eq('is_active', true)
        .single();

    return store?.id || null;
}

export async function fetchTeamRevenue(teamleadId: string, monthKey: string): Promise<number> {
    const members = await resolveTeamMembers(teamleadId);
    if (members.length === 0) return 0;

    const [year, month] = monthKey.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    const memberIds = members.map(m => m.id);

    const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('total_amount')
        .in('sales_id', memberIds)
        .in('status', ['done', 'after_sale'])
        .gte('created_at', startDate)
        .lte('created_at', endDate);

    return (orders || []).reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);
}
