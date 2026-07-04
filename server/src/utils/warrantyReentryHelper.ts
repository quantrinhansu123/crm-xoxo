import { supabaseAdmin } from '../config/supabase.js';

const ACTIVE_WORKFLOW_STATUSES = new Set(['processing', 'assigned', 'in_progress']);

/** Dịch vụ vẫn đang chạy trên Kanban kỹ thuật — không reset khi tạo HD bảo hành */
export function isServiceActivelyInWorkflow(service: {
    current_phase?: string | null;
    status?: string | null;
}): boolean {
    return service.current_phase === 'workflow' && ACTIVE_WORKFLOW_STATUSES.has(service.status || '');
}

/** Tạo bộ bước workflow mới (pending) — giữ nguyên các bước completed cũ để lưu lịch sử */
export async function clonePendingWorkflowStepsForService(service: {
    id: string;
    item_type?: string | null;
    service_id?: string | null;
    package_id?: string | null;
}): Promise<number> {
    let workflowId: string | null = null;

    if (service.item_type === 'service' && service.service_id) {
        const { data: svcRow } = await supabaseAdmin
            .from('services')
            .select('workflow_id')
            .eq('id', service.service_id)
            .maybeSingle();
        workflowId = svcRow?.workflow_id ?? null;
    }

    if (!workflowId) return 0;

    const { data: existingActive } = await supabaseAdmin
        .from('order_item_steps')
        .select('id')
        .eq('order_product_service_id', service.id)
        .in('status', ['pending', 'assigned', 'in_progress'])
        .limit(1);

    if (existingActive?.length) return 0;

    const { data: wSteps } = await supabaseAdmin
        .from('workflow_steps')
        .select('id, step_order, name, department_id, estimated_duration')
        .eq('workflow_id', workflowId)
        .order('step_order', { ascending: true });

    if (!wSteps?.length) return 0;

    const itemSteps = wSteps.map((ws) => ({
        order_product_service_id: service.id,
        workflow_step_id: ws.id,
        step_order: ws.step_order,
        step_name: ws.name || `Bước ${ws.step_order}`,
        department_id: ws.department_id,
        status: 'pending',
        estimated_duration: ws.estimated_duration,
        notes: 'Chu kỳ bảo hành mới',
    }));

    const { error } = await supabaseAdmin.from('order_item_steps').insert(itemSteps);
    if (error) {
        console.error('[warrantyReentry] clone steps failed:', service.id, error.message);
        return 0;
    }

    return itemSteps.length;
}
