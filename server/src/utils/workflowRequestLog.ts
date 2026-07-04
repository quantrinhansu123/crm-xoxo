import { supabaseAdmin } from '../config/supabase.js';

export async function logWorkflowRequest(params: {
    entityId: string;
    action: string;
    stepName: string;
    notes?: string | null;
    reason?: string | null;
    createdBy?: string | null;
}): Promise<void> {
    try {
        await supabaseAdmin.from('order_workflow_step_log').insert({
            entity_id: params.entityId,
            order_item_step_id: null,
            action: params.action,
            step_name: params.stepName,
            notes: params.notes ?? null,
            reason: params.reason ?? null,
            created_by: params.createdBy ?? null,
        });
    } catch (err) {
        console.error('order_workflow_step_log insert error:', err);
    }
}

export function resolveRequestEntityId(row: {
    order_item_id?: string | null;
    order_product_id?: string | null;
    order_product_service_id?: string | null;
}): string | null {
    return row.order_product_id || row.order_item_id || row.order_product_service_id || null;
}

const ACCESSORY_STATUS_LOGS: Record<string, { action: string; stepName: string; notes: string }> = {
    requested: { action: 'accessory_requested', stepName: 'Yêu cầu mua phụ kiện', notes: 'Yêu cầu mua phụ kiện' },
    need_buy: { action: 'accessory_need_buy', stepName: 'Mua phụ kiện', notes: 'QL đã duyệt mua phụ kiện' },
    bought: { action: 'accessory_bought', stepName: 'Mua phụ kiện', notes: 'Đã mua xong phụ kiện' },
    waiting_ship: { action: 'accessory_waiting_ship', stepName: 'Mua phụ kiện', notes: 'Phụ kiện đang chờ ship' },
    shipped: { action: 'accessory_shipped', stepName: 'Mua phụ kiện', notes: 'Đã nhận phụ kiện' },
    delivered_to_tech: { action: 'accessory_delivered_to_tech', stepName: 'Mua phụ kiện', notes: 'Đã giao phụ kiện cho kỹ thuật' },
    rejected: { action: 'accessory_rejected', stepName: 'Mua phụ kiện', notes: 'QL từ chối yêu cầu mua phụ kiện' },
};

const PARTNER_STATUS_LOGS: Record<string, { action: string; stepName: string; notes: string }> = {
    requested: { action: 'partner_requested', stepName: 'Gửi đối tác', notes: 'Yêu cầu gửi đối tác' },
    ship_to_partner: { action: 'partner_ship_to_partner', stepName: 'Gửi đối tác', notes: 'QL đã duyệt gửi đối tác' },
    partner_doing: { action: 'partner_partner_doing', stepName: 'Gửi đối tác', notes: 'Đối tác đang xử lý' },
    ship_back: { action: 'partner_ship_back', stepName: 'Gửi đối tác', notes: 'Đối tác gửi trả sản phẩm' },
    done: { action: 'partner_done', stepName: 'Gửi đối tác', notes: 'Hoàn tất gửi đối tác' },
    rejected: { action: 'partner_rejected', stepName: 'Gửi đối tác', notes: 'QL từ chối yêu cầu gửi đối tác' },
};

export async function logPartnerStatusChange(
    row: { order_item_id?: string | null; order_product_id?: string | null; order_product_service_id?: string | null },
    oldStatus: string | undefined,
    newStatus: string,
    notes: string | null | undefined,
    createdBy: string | null | undefined
): Promise<void> {
    const entityId = resolveRequestEntityId(row);
    if (!entityId || oldStatus === newStatus) return;
    const config = PARTNER_STATUS_LOGS[newStatus];
    if (!config) return;

    await logWorkflowRequest({
        entityId,
        action: oldStatus === 'requested' && newStatus === 'ship_to_partner' ? 'partner_approved' : config.action,
        stepName: config.stepName,
        notes: notes || config.notes,
        reason: newStatus === 'rejected' ? notes : null,
        createdBy,
    });
}

export async function logAccessoryStatusChange(
    row: { order_item_id?: string | null; order_product_id?: string | null; order_product_service_id?: string | null },
    oldStatus: string | undefined,
    newStatus: string,
    notes: string | null | undefined,
    createdBy: string | null | undefined
): Promise<void> {
    const entityId = resolveRequestEntityId(row);
    if (!entityId || oldStatus === newStatus) return;
    const config = ACCESSORY_STATUS_LOGS[newStatus];
    if (!config) return;

    await logWorkflowRequest({
        entityId,
        action: oldStatus === 'requested' && newStatus === 'need_buy' ? 'accessory_approved' : config.action,
        stepName: config.stepName,
        notes: notes || config.notes,
        reason: newStatus === 'rejected' ? notes : null,
        createdBy,
    });
}

export async function logExtensionStatusChange(
    row: { order_item_id?: string | null; order_product_service_id?: string | null },
    oldStatus: string | undefined,
    newStatus: string,
    notes: string | null | undefined,
    createdBy: string | null | undefined
): Promise<void> {
    const entityId = resolveRequestEntityId(row);
    if (!entityId || oldStatus === newStatus) return;

    if (newStatus === 'requested') {
        await logWorkflowRequest({
            entityId,
            action: 'extension_requested',
            stepName: 'Xin gia hạn',
            notes: notes || 'Yêu cầu gia hạn',
            createdBy,
        });
        return;
    }

    if (newStatus === 'rejected') {
        await logWorkflowRequest({
            entityId,
            action: 'extension_rejected',
            stepName: 'Xin gia hạn',
            notes: notes || 'QL từ chối yêu cầu gia hạn',
            reason: notes,
            createdBy,
        });
        return;
    }

    if (newStatus === 'manager_approved' && oldStatus === 'requested') {
        await logWorkflowRequest({
            entityId,
            action: 'extension_approved',
            stepName: 'Xin gia hạn',
            notes: notes || 'QL đã duyệt gia hạn',
            createdBy,
        });
    }
}
