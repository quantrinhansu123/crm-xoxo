import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { checkAndCompleteOrder } from '../utils/orderHelper.js';
import { fireWebhook, notifyCrmMaster } from '../utils/webhookNotifier.js';
import { logAccessoryStatusChange, logPartnerStatusChange } from '../utils/workflowRequestLog.js';
import {
    buildServiceEventBase,
    buildCrmOrderUrl,
    getManagerRecipients,
    buildRequestWorkflowPayload,
    getServiceNotificationContext,
    notifyCrmMasterUser,
    resolveRequestNotificationContext,
} from '../utils/n8nCrmEvents.js';
import {
    AFTER_SALE_STAGE_ORDER,
    CARE_STAGE_ORDER,
    WARRANTY_STAGE_ORDER,
    assertForwardStageMove,
    resolveAfterSaleOldStage,
} from '../utils/kanbanStageValidation.js';
import {
    collectAssignedSalesFromServices,
    firePickupInfoWebhook,
} from '../utils/orderStaffHelper.js';
import { extractSalesStepLogContent } from '../utils/salesStepLogContent.js';
import {
    buildLightweightHistoryNote,
    normalizeMediaRefs,
    sanitizeHistoryNotes,
    summarizeMediaUpload,
} from '../utils/historyLog.js';

function emitRequestWebhook(event: string, payload: Record<string, any>) {
    fireWebhook(event, payload);
    notifyCrmMaster(event, payload);
}

async function notifyWorkflowRequestEvent(event: string, request: Record<string, any>, extra: Record<string, any> = {}) {
    const context = await resolveRequestNotificationContext(request);
    const payload = buildRequestWorkflowPayload(event, request, context, extra);
    if (!payload.target_user_id) {
        const manager = (await getManagerRecipients())[0];
        if (!manager) return;
        payload.target_user_id = manager.id;
        payload.target_role = manager.role || 'manager';
    }
    notifyCrmMasterUser(event, {
        ...payload,
        [event.startsWith('accessory.') ? 'accessory' : 'partner']: {
            id: request.id,
            name: request.metadata?.accessory_name || request.metadata?.partner_name || request.metadata?.item_name || null,
            price_estimate: request.metadata?.price_estimate || request.metadata?.cost || null,
            eta: request.metadata?.eta || null,
        },
    });
}

async function resolveSalesStepData(
    entityType: 'order_item' | 'order_product_service' | 'order_product',
    entityId: string
): Promise<Record<string, unknown>> {
    if (entityType === 'order_item') {
        const { data } = await supabaseAdmin
            .from('order_items')
            .select('sales_step_data')
            .eq('id', entityId)
            .maybeSingle();
        return (data?.sales_step_data as Record<string, unknown>) || {};
    }

    if (entityType === 'order_product') {
        const { data } = await supabaseAdmin
            .from('order_products')
            .select('sales_step_data')
            .eq('id', entityId)
            .maybeSingle();
        return (data?.sales_step_data as Record<string, unknown>) || {};
    }

    const { data: service } = await supabaseAdmin
        .from('order_product_services')
        .select('order_product_id')
        .eq('id', entityId)
        .maybeSingle();

    if (!service?.order_product_id) return {};

    const { data: parent } = await supabaseAdmin
        .from('order_products')
        .select('sales_step_data')
        .eq('id', service.order_product_id)
        .maybeSingle();

    return (parent?.sales_step_data as Record<string, unknown>) || {};
}

function derivePhaseFromStatus(status: string): { current_phase: string; phase_stage: string } {
    if (['step1', 'step2', 'step3', 'step4'].includes(status)) {
        return { current_phase: 'sales', phase_stage: status };
    }
    if (status === 'step5') {
        return { current_phase: 'workflow', phase_stage: 'waiting' };
    }
    if (['assigned', 'in_progress', 'processing'].includes(status)) {
        return { current_phase: 'workflow', phase_stage: 'room_active' };
    }
    if (status === 'completed') {
        return { current_phase: 'workflow', phase_stage: 'done' };
    }
    if (status === 'delivered') {
        return { current_phase: 'after_sale', phase_stage: 'after1' };
    }
    if (status === 'after_sale') {
        return { current_phase: 'after_sale', phase_stage: 'after1' };
    }
    return { current_phase: 'sales', phase_stage: 'step1' };
}


function getTechRoomDisplayName(room?: string | null): string | null {
    if (!room) return null;
    const roomMap: Record<string, string> = {
        phong_ma: 'Mạ',
        phong_dan_de: 'Dán đế',
        phong_da: 'Da',
        phong_ve_sinh: 'Vệ sinh',
        ve_sinh: 'Vệ sinh',
        waiting: 'Chờ xử lý',
        done: 'Hoàn thành',
        fail: 'Thất bại',
    };
    return roomMap[room] || room;
}
const router = Router();
console.log('📦 Order Items Router Loaded');

router.use((req, res, next) => {
    console.log(`[Top Order Items Router] Hit: ${req.method} ${req.url}`);
    next();
});

// POST /api/order-items/accessories - Tạo yêu cầu mua phụ kiện mới (Moved to top to avoid shadowing)
router.post('/accessories', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { order_item_id, order_product_id, order_product_service_id, notes, metadata } = req.body;
        const userId = req.user?.id;

        const payload = {
            order_item_id: order_item_id || null,
            order_product_id: order_product_id || null,
            order_product_service_id: order_product_service_id || null,
            status: 'requested',
            notes: notes || null,
            metadata: metadata || {},
            updated_by: userId
        };

        const { data, error } = await supabaseAdmin
            .from('order_item_accessories')
            .insert(payload)
            .select(`
                id,
                order_item_id,
                order_product_id,
                order_product_service_id,
                status,
                notes,
                metadata,
                created_at,
                updated_at,
                order_item:order_items(
                    id,
                    item_name,
                    item_code,
                    order:orders(id, order_code),
                    product:products(id, image)
                ),
                order_product:order_products(id, name, product_code, images, order:orders(id, order_code)),
                order_product_service:order_product_services(
                    id,
                    order_product_id,
                    order_product:order_products(id, name, product_code, images, order:orders(id, order_code))
                )
            `)
            .single();

        if (error) {
            throw new ApiError('Không thể tạo yêu cầu mua phụ kiện: ' + error.message, 500);
        }

        const entityId = order_item_id || order_product_id || order_product_service_id;
        console.log('[Accessory] entityId:', entityId, 'order_item_id:', order_item_id, 'order_product_id:', order_product_id, 'order_product_service_id:', order_product_service_id);
        const itemName = metadata?.item_name || 'Phụ kiện';
        let orderCode = metadata?.order_code || 'N/A';
        let contextItemName = itemName;
        if (entityId) {
            try {
                const insertResult = await supabaseAdmin.from('order_workflow_step_log').insert({
                    entity_id: entityId,
                    order_item_step_id: null,
                    action: 'accessory_requested',
                    step_name: 'Yêu cầu mua phụ kiện',
                    notes: `${itemName}${notes ? ': ' + notes : ''}`,
                    created_by: userId
                });
                console.log('[Accessory] Insert result:', JSON.stringify(insertResult));
                console.log('[Accessory] Log inserted successfully with entity_id:', entityId);
            } catch (logErr) {
                console.error('[Accessory] workflow log insert error:', logErr);
            }
        }

        if (order_item_id) {
            const { data: ctx } = await supabaseAdmin
                .from('order_items')
                .select('item_name, order:orders(order_code)')
                .eq('id', order_item_id)
                .maybeSingle();
            const orderObj = Array.isArray((ctx as any)?.order) ? (ctx as any).order[0] : (ctx as any)?.order;
            orderCode = orderObj?.order_code || orderCode;
            contextItemName = (ctx as any)?.item_name || contextItemName;
        } else if (order_product_id) {
            const { data: ctx } = await supabaseAdmin
                .from('order_products')
                .select('name, order:orders(order_code)')
                .eq('id', order_product_id)
                .maybeSingle();
            const orderObj = Array.isArray((ctx as any)?.order) ? (ctx as any).order[0] : (ctx as any)?.order;
            orderCode = orderObj?.order_code || orderCode;
            contextItemName = (ctx as any)?.name || contextItemName;
        } else if (order_product_service_id) {
            const { data: ctx } = await supabaseAdmin
                .from('order_product_services')
                .select('item_name, order_product:order_products(name, order:orders(order_code))')
                .eq('id', order_product_service_id)
                .maybeSingle();
            const orderProduct = Array.isArray((ctx as any)?.order_product) ? (ctx as any).order_product[0] : (ctx as any)?.order_product;
            const orderObj = Array.isArray(orderProduct?.order) ? orderProduct.order[0] : orderProduct?.order;
            orderCode = orderObj?.order_code || orderCode;
            contextItemName = (ctx as any)?.item_name || orderProduct?.name || contextItemName;
        }

        await notifyWorkflowRequestEvent('accessory.request.created', {
            ...data,
            order_item_id: order_item_id || null,
            order_product_id: order_product_id || null,
            order_product_service_id: order_product_service_id || null,
            metadata: { ...(metadata || {}), order_code: orderCode, item_name: contextItemName, accessory_name: itemName },
        }, { notes: notes || null });

        res.status(201).json({ status: 'success', data });
    } catch (e) {
        next(e);
    }
});

// Assign technician(s) to order item
router.patch('/:id/assign', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { technician_id, assignments } = req.body;
        console.log('[Assign] Body:', JSON.stringify(req.body, null, 2));
        const userId = req.user?.id;

        let item: any = null;

        // Try to update V1 item (order_items)
        // First check if it exists in V1
        const { data: v1Exists } = await supabaseAdmin.from('order_items').select('id, total_price').eq('id', id).maybeSingle();

        if (v1Exists) {
            const techAssignments = (Array.isArray(assignments) ? assignments : []).map(t => ({
                technician_id: t.technician_id,
                commission: Number(t.commission) || 0
            }));

            // Backward compatibility for single technician_id
            if (techAssignments.length === 0 && technician_id) {
                techAssignments.push({ technician_id, commission: 0 });
            }

            if (techAssignments.length === 0) throw new ApiError('Cần ít nhất một kỹ thuật viên', 400);

            const primaryTechId = techAssignments[0].technician_id;

            // Update V1 item main status/tech
            const { data: v1Item, error: v1Error } = await supabaseAdmin
                .from('order_items')
                .update({
                    technician_id: primaryTechId,
                    status: 'assigned',
                    assigned_at: new Date().toISOString(),
                    commission_tech_rate: techAssignments[0].commission,
                    commission_tech_amount: Math.floor(((v1Exists.total_price || 0) * (techAssignments[0].commission || 0)) / 100)
                })
                .eq('id', id)
                .select('*, order:orders(id, order_code, status, sales_id)')
                .single();

            if (v1Error) throw new ApiError('Lỗi cập nhật hạng mục: ' + v1Error.message, 500);
            item = v1Item;

            // Handle junction table for multiple technicians
            // 1. Delete existing assignments
            await supabaseAdmin.from('order_item_technicians').delete().eq('order_item_id', id);

            // 2. Insert new assignments
            const junctionRows = techAssignments.map(t => ({
                order_item_id: id,
                technician_id: t.technician_id,
                commission: t.commission || 0,
                assigned_by: userId,
                assigned_at: new Date().toISOString()
            }));

            console.log('[Assign] V1 junctionRows:', JSON.stringify(junctionRows, null, 2));

            const { error: junctionError } = await supabaseAdmin.from('order_item_technicians').insert(junctionRows);
            if (junctionError) {
                console.error('Error inserting order_item_technicians:', junctionError);
                // Continue anyway, primary tech is set
            }
        } else {
            // Try V2 item (order_product_services)
            const { data: v2Exists } = await supabaseAdmin.from('order_product_services').select('id, unit_price').eq('id', id).maybeSingle();

            if (v2Exists) {
                const techAssignments = (Array.isArray(assignments) ? assignments : []).map(t => ({
                    technician_id: t.technician_id,
                    commission: Number(t.commission) || 0
                }));

                if (techAssignments.length === 0 && technician_id) {
                    techAssignments.push({ technician_id, commission: 0 });
                }

                if (techAssignments.length === 0) throw new ApiError('Cần ít nhất một kỹ thuật viên', 400);

                const primaryTechId = techAssignments[0].technician_id;

                // Update V2 item main status/tech
                const { data: v2Item, error: v2Error } = await supabaseAdmin
                    .from('order_product_services')
                    .update({
                        technician_id: primaryTechId,
                        status: 'assigned',
                        assigned_at: new Date().toISOString()
                    })
                    .eq('id', id)
                    .select('*, order_product:order_products(order:orders(id, order_code, status, sales_id))')
                    .single();

                if (v2Error) throw new ApiError('Lỗi cập nhật dịch vụ: ' + v2Error.message, 500);

                item = {
                    ...v2Item,
                    order: v2Item.order_product?.order
                };

                // Handle junction table for V2
                // 1. Delete existing
                await supabaseAdmin.from('order_product_service_technicians').delete().eq('order_product_service_id', id);

                // 2. Insert new
                const junctionRows = techAssignments.map(t => ({
                    order_product_service_id: id,
                    technician_id: t.technician_id,
                    commission: t.commission || 0,
                    assigned_by: userId,
                    assigned_at: new Date().toISOString(),
                    status: 'assigned'
                }));

                console.log('[Assign] V2 junctionRows:', JSON.stringify(junctionRows, null, 2));

                const { error: junctionError } = await supabaseAdmin.from('order_product_service_technicians').insert(junctionRows);
                if (junctionError) {
                    console.error('Error inserting order_product_service_technicians:', junctionError);
                }
            } else {
                throw new ApiError('Không tìm thấy hạng mục hoặc dịch vụ', 404);
            }
        }

        // If order is already 'done' or 'after_sale', re-trigger commission recording
        if (item?.order?.id && (item.order.status === 'done' || item.order.status === 'after_sale')) {
            const { recordCommissions } = await import('../utils/orderHelper.js');
            await recordCommissions(item.order.id);
        }

        if (item?.technician_id) {
            const { data: technician } = await supabaseAdmin
                .from('users')
                .select('id, name, role, telegram_chat_id')
                .eq('id', item.technician_id)
                .maybeSingle();

            if (technician?.id) {
                let basePayload: any = null;
                if (v1Exists) {
                    const orderObj = Array.isArray(item.order) ? item.order[0] : item.order;
                    basePayload = {
                        order: orderObj ? { id: orderObj.id, order_code: orderObj.order_code, return_due_at: null } : null,
                        item: { id: item.id, service_name: item.item_name || null, deadline_at: null, note: item.notes || null },
                        links: { crm_url: buildCrmOrderUrl(orderObj?.order_code || orderObj?.id) },
                    };
                } else {
                    const context = await getServiceNotificationContext(id);
                    basePayload = context ? buildServiceEventBase(context) : null;
                }

                notifyCrmMasterUser('workflow.item.assigned', {
                    ...(basePayload || { item: { id }, order: item.order ? { id: item.order.id, order_code: item.order.order_code } : null }),
                    target_user_id: technician.id,
                    target_role: 'technician',
                    channel: 'telegram',
                    staff: {
                        id: technician.id,
                        name: technician.name,
                        role: technician.role || 'technician',
                        telegram_chat_id: technician.telegram_chat_id || null,
                    },
                });
            }
        }
        res.json({
            status: 'success',
            data: item,
            message: 'Đã phân công kỹ thuật viên thành công'
        });
    } catch (error) {
        next(error);
    }
});

// Assign salesperson(s) to order item
router.patch('/:id/assign-sale', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { sale_id, assignments } = req.body;
        console.log('[Assign Sale] Body:', JSON.stringify(req.body, null, 2));
        const userId = req.user?.id;

        let item: any = null;

        // Try to update V1 item (order_items)
        const { data: v1Exists } = await supabaseAdmin.from('order_items').select('id, total_price, order_id').eq('id', id).maybeSingle();

        if (v1Exists) {
            const saleAssignments = (Array.isArray(assignments) ? assignments : []).map(s => ({
                sale_id: s.sale_id || s.id,
                commission: Number(s.commission) || 0
            }));

            // Backward compatibility
            if (saleAssignments.length === 0 && sale_id) {
                saleAssignments.push({ sale_id, commission: 0 });
            }

            if (saleAssignments.length === 0) throw new ApiError('Cần ít nhất một nhân viên kinh doanh', 400);

            // Handle junction table for multiple salespersons
            // 1. Delete existing assignments
            await supabaseAdmin.from('order_item_sales').delete().eq('order_item_id', id);

            // 2. Insert new assignments
            const junctionRows = saleAssignments.map(s => ({
                order_item_id: id,
                sale_id: s.sale_id,
                commission: s.commission || 0,
                assigned_by: userId,
                assigned_at: new Date().toISOString()
            }));

            const { error: junctionError } = await supabaseAdmin.from('order_item_sales').insert(junctionRows);
            if (junctionError) throw new ApiError('Lỗi cập nhật phân công sales: ' + junctionError.message, 500);

            // Get updated item with order info
            const { data: v1Item } = await supabaseAdmin
                .from('order_items')
                .select('*, order:orders(id, order_code, status)')
                .eq('id', id)
                .single();
            item = v1Item;
        } else {
            // Try V2 item (order_product_services)
            const { data: v2Exists } = await supabaseAdmin.from('order_product_services').select('id, unit_price').eq('id', id).maybeSingle();

            if (v2Exists) {
                const saleAssignments = (Array.isArray(assignments) ? assignments : []).map(s => ({
                    sale_id: s.sale_id || s.id,
                    commission: Number(s.commission) || 0
                }));

                if (saleAssignments.length === 0 && sale_id) {
                    saleAssignments.push({ sale_id, commission: 0 });
                }

                if (saleAssignments.length === 0) throw new ApiError('Cần ít nhất một nhân viên kinh doanh', 400);

                // Handle junction table for V2
                // 1. Delete existing
                await supabaseAdmin.from('order_product_service_sales').delete().eq('order_product_service_id', id);

                // 2. Insert new
                const junctionRows = saleAssignments.map(s => ({
                    order_product_service_id: id,
                    sale_id: s.sale_id,
                    commission: s.commission || 0,
                    assigned_by: userId,
                    assigned_at: new Date().toISOString()
                }));

                const { error: junctionError } = await supabaseAdmin.from('order_product_service_sales').insert(junctionRows);
                if (junctionError) throw new ApiError('Lỗi cập nhật phân công sales cho dịch vụ: ' + junctionError.message, 500);

                // Get updated item
                const { data: v2Item } = await supabaseAdmin
                    .from('order_product_services')
                    .select('*, order_product:order_products(order:orders(id, order_code, status))')
                    .eq('id', id)
                    .single();

                item = {
                    ...v2Item,
                    order: v2Item.order_product?.order
                };
            } else {
                throw new ApiError('Không tìm thấy hạng mục hoặc dịch vụ', 404);
            }
        }

        // Re-trigger commission recording
        if (item?.order?.id && (item.order.status === 'done' || item.order.status === 'after_sale')) {
            const { recordCommissions } = await import('../utils/orderHelper.js');
            await recordCommissions(item.order.id);
        }

        res.json({
            status: 'success',
            data: item,
            message: 'Đã phân công nhân viên kinh doanh thành công'
        });
    } catch (error) {
        next(error);
    }
});

// Update order item status (generic)
router.patch('/:id/status', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { status, reason, photos, warranty_code, notes } = req.body;
        const userId = req.user?.id;

        const validStatuses = [
            'pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'delivered',
            'step1', 'step2', 'step3', 'step4', 'step5', 'after_sale'
        ];

        if (!validStatuses.includes(status)) {
            throw new ApiError('Trạng thái không hợp lệ', 400);
        }

        // Lấy trạng thái cũ và order_id trước khi update (để ghi log Sales Kanban)
        let oldStatus: string | null = null;
        let orderIdForLog: string | null = null;
        let entityType: 'order_item' | 'order_product_service' | 'order_product' | null = null;

        const { data: v1Current } = await supabaseAdmin.from('order_items').select('id, status, order_id').eq('id', id).maybeSingle();
        if (v1Current) {
            oldStatus = v1Current.status ?? null;
            orderIdForLog = v1Current.order_id ?? null;
            entityType = 'order_item';
        }
        if (!entityType) {
            const { data: v2Svc } = await supabaseAdmin.from('order_product_services').select('id, status, order_product_id').eq('id', id).maybeSingle();
            if (v2Svc) {
                oldStatus = v2Svc.status ?? null;
                entityType = 'order_product_service';
                const { data: op } = await supabaseAdmin.from('order_products').select('order_id').eq('id', v2Svc.order_product_id).single();
                if (op) orderIdForLog = op.order_id;
            }
        }
        if (!entityType) {
            const { data: v2Prod } = await supabaseAdmin.from('order_products').select('id, status, order_id').eq('id', id).maybeSingle();
            if (v2Prod) {
                oldStatus = v2Prod.status ?? null;
                orderIdForLog = v2Prod.order_id ?? null;
                entityType = 'order_product';
            }
        }

        // Map status for DB compatibility
        // services (order_items, order_product_services) don't have 'delivered', map to 'completed'
        // products (order_products) have 'delivered', handled separately later
        const targetStatus = (status === 'after_sale' || status === 'delivered') ? 'completed' : status;

        const updateItemData: any = {
            status: targetStatus
        };
        if (warranty_code !== undefined) {
            updateItemData.warranty_code = warranty_code;
            updateItemData.care_warranty_flow = 'warranty';
        }

        const updateDataWithTimes: any = { ...updateItemData };
        if (status === 'completed' || status === 'after_sale' || status === 'delivered') {
            updateDataWithTimes.completed_at = new Date().toISOString();
        } else if (status === 'in_progress') {
            updateDataWithTimes.started_at = new Date().toISOString();
        }

        // Try V1
        let { data: item, error } = await supabaseAdmin
            .from('order_items')
            .update(updateDataWithTimes)
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error) {
            console.error('Error updating order_items(' + id + '): ', error);
        }

        // Try V2 service
        if (!item) {
            const { data: v2Item, error: v2Error } = await supabaseAdmin
                .from('order_product_services')
                .update(updateDataWithTimes)
                .eq('id', id)
                .select()
                .maybeSingle();

            if (v2Item) {
                item = v2Item;
            } else if (v2Error) {
                console.error('Error updating order_product_services(' + id + '): ', v2Error);
                throw new ApiError('Lỗi cập nhật V2 (Service): ' + v2Error.message, 500);
            }
        }

        // Try V2 product (Doesn't have started_at/completed_at, and uses 'processing' instead of 'in_progress' and 'delivered' for 'after_sale')
        if (!item) {
            let productStatus = status;
            const updateProductData: any = { ...updateItemData };
            
            if (status === 'in_progress') productStatus = 'processing';
            else if (status === 'after_sale' || status === 'delivered') {
                productStatus = 'delivered';
                updateProductData.delivered_at = new Date().toISOString();
            }

            const { data: v2Product, error: v2ProdError } = await supabaseAdmin
                .from('order_products')
                .update({ ...updateProductData, status: productStatus })
                .eq('id', id)
                .select()
                .maybeSingle();

            if (v2Product) {
                item = v2Product;
            } else if (v2ProdError) {
                console.error('Error updating order_products(' + id + '): ', v2ProdError);
                throw new ApiError('Lỗi cập nhật V2 (Product): ' + v2ProdError.message, 500);
            }

            if (!item) {
                throw new ApiError('Không tìm thấy hạng mục sau khi thử tất cả các bảng', 404);
            }
        }

        const { current_phase, phase_stage } = derivePhaseFromStatus(status);
        const phaseTable = entityType === 'order_item' ? 'order_items'
            : entityType === 'order_product_service' ? 'order_product_services'
            : 'order_products';
        await supabaseAdmin.from(phaseTable)
            .update({ current_phase, phase_stage })
            .eq('id', id);

        res.json({
            status: 'success',
            data: item,
            message: 'Đã cập nhật trạng thái hạng mục'
        });

        // Lịch sử Sales Kanban: ghi log chuyển bước (step1-step5 hoặc bất kỳ status)
        if (orderIdForLog && entityType && (oldStatus !== status)) {
            try {
                let logReason = reason || null;
                let logNotes = sanitizeHistoryNotes(notes);
                let logPhotos = normalizeMediaRefs(photos);

                if (!logReason && !logNotes && logPhotos.length === 0 && oldStatus?.startsWith('step')) {
                    const salesStepData = await resolveSalesStepData(entityType, id);
                    const extracted = extractSalesStepLogContent(oldStatus, salesStepData);
                    logReason = extracted.reason || null;
                    logNotes = extracted.notes || null;
                    logPhotos = extracted.photos;
                } else if (logPhotos.length > 0 && !logNotes) {
                    logNotes = summarizeMediaUpload(logPhotos, '');
                }

                await supabaseAdmin.from('order_item_status_log').insert({
                    order_id: orderIdForLog,
                    entity_type: entityType,
                    entity_id: id,
                    from_status: oldStatus,
                    to_status: status,
                    reason: logReason,
                    notes: logNotes || null,
                    photos: logPhotos,
                    created_by: userId ?? null
                });
            } catch (logErr) {
                console.error('order_item_status_log insert error:', logErr);
            }

            // 🔔 WH3: Fire webhook — Đổi trạng thái Kanban phòng ban
            try {
                const { data: orderForWh } = await supabaseAdmin
                    .from('orders')
                    .select('order_code')
                    .eq('id', orderIdForLog)
                    .single();

                fireWebhook('kanban.status_changed', {
                    order_code: orderForWh?.order_code || 'N/A',
                    entity_type: entityType,
                    entity_id: id,
                    from_status: oldStatus,
                    to_status: status,
                });
            } catch (whErr) {
                console.error('WH3 webhook error:', whErr);
            }
        }

        // Trigger manager notification for approval (step4)
        if (status === 'step4') {
            try {
                let orderId = item.order_id;

                // If it's a V2 service, we need to get order_id from order_products
                if (!orderId && item.order_product_id) {
                    const { data: op } = await supabaseAdmin
                        .from('order_products')
                        .select('order_id')
                        .eq('id', item.order_product_id)
                        .single();
                    if (op) orderId = op.order_id;
                }

                if (orderId) {
                    const { data: order } = await supabaseAdmin
                        .from('orders')
                        .select('id, order_code')
                        .eq('id', orderId)
                        .single();

                    if (order) {
                        // Fetch all managers and admins
                        const { data: managers } = await supabaseAdmin
                            .from('users')
                            .select('id')
                            .or('role.eq.manager,role.eq.admin')
                            .eq('status', 'active');

                        if (managers && managers.length > 0) {
                            const itemName = item.item_name || item.product_name || 'hạng mục';
                            const notifications = managers.map(m => ({
                                user_id: m.id,
                                type: 'order_approval_required',
                                title: 'Yêu cầu phê duyệt đơn hàng',
                                content: 'Đơn hàng ' + order.order_code + ' đang chờ phê duyệt: "' + itemName + '"',
                                data: {
                                    order_id: order.id,
                                    order_code: order.order_code,
                                    item_id: item.id
                                },
                                is_read: false
                            }));

                            await supabaseAdmin.from('notifications').insert(notifications);
                        }
                    }
                }
            } catch (notifyError) {
                console.error('Error sending manager notifications:', notifyError);
            }
        }
    } catch (error) {
        next(error);
    }
});

// Technician starts work on item
router.patch('/:id/start', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Try V1
        let { data: item, error } = await supabaseAdmin
            .from('order_items')
            .update({
                status: 'in_progress',
                started_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('*, order:orders(id, order_code, sales_id)')
            .maybeSingle();

        // Try V2 service
        if (!item) {
            const { data: v2Item, error: v2Error } = await supabaseAdmin
                .from('order_product_services')
                .update({
                    status: 'in_progress',
                    started_at: new Date().toISOString()
                })
                .eq('id', id)
                .select('*, order_product:order_products(order:orders(id, order_code, sales_id))')
                .maybeSingle();

            if (v2Item) {
                item = {
                    ...v2Item,
                    order: v2Item.order_product?.order
                };
            } else if (v2Error) {
                throw new ApiError('Lỗi khi cập nhật trạng thái', 500);
            }
        }

        // Try V2 product (Doesn't have started_at)
        if (!item) {
            const { data: v2Product, error: v2ProdError } = await supabaseAdmin
                .from('order_products')
                .update({
                    status: 'processing'
                })
                .eq('id', id)
                .select('order:orders(id, order_code, sales_id)')
                .maybeSingle();

            if (v2ProdError || !v2Product) {
                throw new ApiError('Không tìm thấy hạng mục', 404);
            }
            item = v2Product;
        }

        if (item) {
            // Update parent order status to 'in_progress' if pending/confirmed
            let parentOrder: any = null;
            if (item.order) {
                parentOrder = Array.isArray(item.order) ? item.order[0] : item.order;
            } else if (item.order_id) {
                const { data: ord } = await supabaseAdmin.from('orders').select('id, status').eq('id', item.order_id).single();
                parentOrder = ord;
            }

            if (parentOrder && parentOrder.status !== 'in_progress' && parentOrder.status !== 'completed' && parentOrder.status !== 'cancelled') {
                await supabaseAdmin.from('orders').update({ status: 'in_progress' }).eq('id', parentOrder.id);
            }
        }

        res.json({
            status: 'success',
            data: item,
            message: 'Đã bắt đầu công việc'
        });
    } catch (error) {
        next(error);
    }
});

// Technician completes item - send notification to sales
router.patch('/:id/complete', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const userId = req.user?.id;
        console.log(`[Complete Endpoint] Marking item ${id} as complete. Notes: ${notes}`);

        // Try V1
        let { data: item, error } = await supabaseAdmin
            .from('order_items')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                current_phase: 'after_sale',
                phase_stage: 'after1',
                after_sale_stage: 'after1',
            })
            .eq('id', id)
            .select('*, order:orders(id, order_code, sales_id, customer:customers(name))')
            .maybeSingle();

        let isV2 = false;

        // Try V2 service
        if (!item) {
            isV2 = true;
            const v2UpdateFull: Record<string, unknown> = {
                status: 'completed',
                completed_at: new Date().toISOString(),
                notes: notes || null,
                current_phase: 'after_sale',
                phase_stage: 'after1',
                after_sale_stage: 'after1',
            };
            let { data: v2Item, error: v2Error } = await supabaseAdmin
                .from('order_product_services')
                .update(v2UpdateFull)
                .eq('id', id)
                .select('*, order_product:order_products(order:orders(id, order_code, sales_id, customer:customers(name)))')
                .maybeSingle();

            // Một số DB chưa có after_sale_stage trên order_product_services → retry không cột đó
            if (!v2Item && v2Error) {
                console.error('[CompleteItem] V2 service update failed, retry without after_sale_stage:', v2Error.message);
                const retry = await supabaseAdmin
                    .from('order_product_services')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        notes: notes || null,
                        current_phase: 'after_sale',
                        phase_stage: 'after1',
                    })
                    .eq('id', id)
                    .select('*, order_product:order_products(order:orders(id, order_code, sales_id, customer:customers(name)))')
                    .maybeSingle();
                v2Item = retry.data;
                v2Error = retry.error;
            }

            if (v2Item) {
                item = {
                    ...v2Item,
                    order: Array.isArray(v2Item.order_product?.order)
                        ? v2Item.order_product.order[0]
                        : v2Item.order_product?.order,
                };
                // Đưa product head sang after-sale khi hoàn thành dịch vụ
                const productId = v2Item.order_product_id || v2Item.order_product?.id;
                if (productId) {
                    await supabaseAdmin
                        .from('order_products')
                        .update({
                            status: 'completed',
                            completed_at: new Date().toISOString(),
                            current_phase: 'after_sale',
                            phase_stage: 'after1',
                            after_sale_stage: 'after1',
                        })
                        .eq('id', productId);
                }
            } else if (v2Error) {
                console.error('[CompleteItem] V2 service still failing:', v2Error.message);
            }
        }

        // Try V2 product head
        if (!item) {
            const { data: v2Product, error: v2ProdError } = await supabaseAdmin
                .from('order_products')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    current_phase: 'after_sale',
                    phase_stage: 'after1',
                    after_sale_stage: 'after1',
                })
                .eq('id', id)
                .select('*, order:orders(id, order_code, sales_id, customer:customers(name))')
                .maybeSingle();

            if (v2Product) {
                item = v2Product;
                // For product heads, we don't need isV2 true (it refers to order_product_services progress)
                isV2 = false; 
            } else if (v2ProdError) {
                throw new ApiError('Lỗi cập nhật sản phẩm V2: ' + v2ProdError.message, 500);
            }
        }

        if (!item) {
            throw new ApiError('Không tìm thấy hạng mục', 404);
        }

        // Normalize nested order relation (object | array | missing)
        const nestedOrder = Array.isArray(item.order) ? item.order[0] : item.order;
        if (nestedOrder && !item.order_id) {
            item.order = nestedOrder;
        } else if (!nestedOrder && item.order_id) {
            const { data: ord } = await supabaseAdmin
                .from('orders')
                .select('id, order_code, sales_id, customer:customers(name)')
                .eq('id', item.order_id)
                .maybeSingle();
            if (ord) item.order = ord;
        } else if (nestedOrder) {
            item.order = nestedOrder;
        }

        // 3. Mark all workflow steps for this item as 'completed'
        // This ensures the progress bar and Kanban details are correct
        const stepFilter = isV2 ? { order_product_service_id: id } : { order_item_id: id };
        const { error: stepsUpdateError } = await supabaseAdmin
            .from('order_item_steps')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                notes: notes ? `Hoàn thành hạng mục: ${notes}` : 'Hoàn thành hạng mục'
            })
            .match(stepFilter)
            .neq('status', 'skipped'); // Don't touch skipped steps

        if (stepsUpdateError) {
            console.error('[CompleteItem] Error updating steps:', stepsUpdateError);
        }

        // Add log entry for completion
        const { data: lastStep } = await supabaseAdmin
            .from('order_item_steps')
            .select('*')
            .match(stepFilter)
            .order('step_order', { ascending: false })
            .limit(1)
            .single();

        if (lastStep) {
            await supabaseAdmin.from('order_workflow_step_log').insert({
                order_item_step_id: lastStep.id,
                action: 'completed',
                step_name: lastStep.step_name,
                step_order: lastStep.step_order,
                notes: notes ? `Hoàn thành hạng mục: ${notes}` : 'Hoàn thành hạng mục',
                created_by: userId
            });
        }

        // Create notification for sales user
        if (item.order?.sales_id) {
            await supabaseAdmin
                .from('notifications')
                .insert({
                    user_id: item.order.sales_id,
                    type: 'item_completed',
                    title: 'Dịch vụ đã hoàn thành',
                    content: 'Dịch vụ "' + (item.item_name || item.name || '') + '" trong đơn ' + item.order.order_code + ' đã được hoàn thành',
                    data: {
                        order_id: item.order.id,
                        order_code: item.order.order_code,
                        item_id: item.id,
                        item_name: item.item_name || item.name
                    },
                    is_read: false
                });
        }

        // Check and potentially complete the order
        const orderIdForComplete = item.order?.id || item.order_id;
        const allRelatedCompleted = orderIdForComplete
            ? await checkAndCompleteOrder(orderIdForComplete)
            : false;

        res.json({
            status: 'success',
            data: item,
            message: 'Đã hoàn thành hạng mục',
            allRelatedCompleted
        });
    } catch (error) {
        next(error);
    }
});

// Get order item by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        let { data: item, error } = await supabaseAdmin
            .from('order_items')
            .select('*, technician:users!order_items_technician_id_fkey(id, name, avatar)')
            .eq('id', id)
            .maybeSingle();

        if (!item) {
            const { data: v2Item, error: v2Error } = await supabaseAdmin
                .from('order_product_services')
                .select('*, technician:users!order_product_services_technician_id_fkey(id, name)') // No avatar in users? Relation check.
                .eq('id', id)
                .maybeSingle();

            if (v2Error || !v2Item) {
                throw new ApiError('Không tìm thấy hạng mục', 404);
            }
            item = v2Item;
        }

        res.json({
            status: 'success',
            data: item
        });
    } catch (error) {
        next(error);
    }
});

// Update sales step data (receiver info, technician exchange details, etc.)
router.patch('/:id/sales-step-data', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { sales_step_data } = req.body;

        if (!sales_step_data || typeof sales_step_data !== 'object') {
            throw new ApiError('Dữ liệu không hợp lệ', 400);
        }

        // Try V1 order_items first
        const { data: v1Exists } = await supabaseAdmin
            .from('order_items')
            .select('id, sales_step_data')
            .eq('id', id)
            .maybeSingle();

        if (v1Exists) {
            const merged = { ...(v1Exists.sales_step_data || {}), ...sales_step_data };

            const { data: updated, error } = await supabaseAdmin
                .from('order_items')
                .update({ sales_step_data: merged })
                .eq('id', id)
                .select()
                .single();

            if (error) throw new ApiError('Lỗi cập nhật dữ liệu: ' + error.message, 500);

            return res.json({
                status: 'success',
                data: updated,
                message: 'Đã cập nhật thông tin bước bán hàng'
            });
        }

        // Try V2 order_products directly
        const { data: v2Product } = await supabaseAdmin
            .from('order_products')
            .select('id, sales_step_data')
            .eq('id', id)
            .maybeSingle();

        if (v2Product) {
            const merged = { ...(v2Product.sales_step_data || {}), ...sales_step_data };

            const { data: updated, error } = await supabaseAdmin
                .from('order_products')
                .update({ sales_step_data: merged })
                .eq('id', id)
                .select()
                .single();

            if (error) throw new ApiError('Lỗi cập nhật dữ liệu: ' + error.message, 500);

            try {
                await firePickupInfoWebhook(supabaseAdmin, id, merged);
            } catch (whErr) {
                console.error('pickup_info.saved webhook error:', whErr);
            }

            return res.json({
                status: 'success',
                data: updated,
                message: 'Đã cập nhật thông tin bước bán hàng'
            });
        }

        // Try V2 order_product_services → save on parent order_products
        const { data: v2Service } = await supabaseAdmin
            .from('order_product_services')
            .select('id, order_product_id')
            .eq('id', id)
            .maybeSingle();

        if (v2Service?.order_product_id) {
            const { data: parentProduct } = await supabaseAdmin
                .from('order_products')
                .select('id, sales_step_data')
                .eq('id', v2Service.order_product_id)
                .single();

            if (parentProduct) {
                const merged = { ...(parentProduct.sales_step_data || {}), ...sales_step_data };

                const { data: updated, error } = await supabaseAdmin
                    .from('order_products')
                    .update({ sales_step_data: merged })
                    .eq('id', v2Service.order_product_id)
                    .select()
                    .single();

                if (error) throw new ApiError('Lỗi cập nhật dữ liệu: ' + error.message, 500);

                try {
                    await firePickupInfoWebhook(supabaseAdmin, v2Service.order_product_id, merged);
                } catch (whErr) {
                    console.error('pickup_info.saved webhook error:', whErr);
                }

                return res.json({
                    status: 'success',
                    data: updated,
                    message: 'Đã cập nhật thông tin bước bán hàng'
                });
            }
        }

        throw new ApiError('Không tìm thấy hạng mục', 404);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/order-items/:id/extension-request
 * Tạo yêu cầu gia hạn cho từng hạng mục cụ thể
 */
router.post('/:id/extension-request', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { reason, new_due_at } = req.body;

        if (!reason || typeof reason !== 'string' || !reason.trim()) {
            throw new ApiError('Lý do gia hạn là bắt buộc', 400);
        }

        // Tìm order_id liên quan
        let orderId: string | null = null;
        let itemName = '';
        let order_item_id: string | null = null;
        let order_product_service_id: string | null = null;

        // Thử V1
        const { data: v1 } = await supabaseAdmin
            .from('order_items')
            .select('order_id, item_name')
            .eq('id', id)
            .maybeSingle();

        if (v1) {
            orderId = v1.order_id;
            itemName = v1.item_name;
            order_item_id = id;
        } else {
            // Thử V2 (Service -> Product -> Order)
            const { data: v2, error: v2Err } = await supabaseAdmin
                .from('order_product_services')
                .select('item_name, order_product:order_products(order_id)')
                .eq('id', id)
                .maybeSingle();
            
            if (v2) {
                orderId = (v2.order_product as any)?.order_id;
                itemName = v2.item_name;
                order_product_service_id = id;
            }
        }

        if (!orderId) {
            throw new ApiError('Không tìm thấy hạng mục hoặc thông tin đơn hàng', 404);
        }

        // Tạo yêu cầu trong bảng chung: order_extension_requests
        const { data: row, error } = await supabaseAdmin
            .from('order_extension_requests')
            .insert({
                order_id: orderId,
                order_item_id,
                order_product_service_id,
                requested_by: req.user!.id,
                reason: `${itemName}: ${reason.trim()}`,
                new_due_at: new_due_at || null,
                status: 'requested'
            })
            .select()
            .single();

        if (error) throw new ApiError('Lỗi tạo yêu cầu gia hạn: ' + error.message, 500);

        try {
            await supabaseAdmin.from('order_workflow_step_log').insert({
                entity_id: id,
                order_item_step_id: null,
                action: 'extension_requested',
                step_name: 'Xin gia hạn',
                notes: `${itemName}: ${reason.trim()}${new_due_at ? ' - Hạn mới: ' + new Date(new_due_at).toLocaleDateString('vi-VN') : ''}`,
                created_by: req.user!.id
            });
        } catch (logErr) {
            console.error('workflow log insert error:', logErr);
        }

        // Pause SLA: Set sla_paused_at cho tất cả steps liên quan
        const stepFilter = order_item_id 
            ? { order_item_id }
            : { order_product_service_id };

        await supabaseAdmin
            .from('order_item_steps')
            .update({ sla_paused_at: new Date().toISOString() })
            .match(stepFilter)
            .is('sla_paused_at', null)
            .in('status', ['pending', 'assigned', 'in_progress']);

        // 🔔 WH4: Fire webhook — Kỹ thuật xin gia hạn
        const { data: orderForWh } = await supabaseAdmin.from('orders').select('order_code').eq('id', orderId).single();
        const { data: techUser } = await supabaseAdmin.from('users').select('name').eq('id', req.user!.id).single();
        fireWebhook('extension.request.created', {
            order_code: orderForWh?.order_code || 'N/A',
            technician_name: techUser?.name || 'N/A',
            item_name: itemName,
            reason: reason.trim(),
            new_due_at: new_due_at || null,
        });

        res.status(201).json({
            status: 'success',
            data: row,
            message: 'Đã gửi yêu cầu gia hạn cho hạng mục: ' + itemName,
        });
    } catch (error) {
        next(error);
    }
});

// =====================================================
// ORDER ITEM STEPS ROUTES
// =====================================================

// Get steps for an order item
router.get('/:id/steps', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        let query = supabaseAdmin
            .from('order_item_steps')
            .select(`
    *,
    department: departments(id, name),
        technician: users!order_item_steps_technician_id_fkey(id, name, avatar)
            `)
            .order('step_order', { ascending: true });

        // Check if ID matches order_item or order_product_service
        // Heuristic: Try to find steps by order_item_id first
        const { count: v1Count } = await supabaseAdmin
            .from('order_item_steps')
            .select('id', { count: 'exact', head: true })
            .eq('order_item_id', id);

        if (v1Count && v1Count > 0) {
            query = query.eq('order_item_id', id);
        } else {
            // Assume it is V2 service ID
            query = query.eq('order_product_service_id', id);
        }

        const { data: steps, error } = await query;

        if (error) {
            throw new ApiError('Không thể lấy danh sách bước', 500);
        }

        res.json({
            status: 'success',
            data: steps || []
        });
    } catch (error) {
        next(error);
    }
});

// Assign technician to a step
router.patch('/steps/:stepId/assign', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { stepId } = req.params;
        const { technician_id } = req.body;

        if (!technician_id) {
            throw new ApiError('Vui lòng chọn kỹ thuật viên', 400);
        }

        const { data: step, error } = await supabaseAdmin
            .from('order_item_steps')
            .update({
                technician_id,
                status: 'assigned',
                assigned_at: new Date().toISOString()
            })
            .eq('id', stepId)
            .select('*, department:departments(id, name), technician:users!order_item_steps_technician_id_fkey(id, name)')
            .single();

        if (error) {
            throw new ApiError('Không thể phân công kỹ thuật viên', 500);
        }

        res.json({
            status: 'success',
            data: step,
            message: 'Đã phân công kỹ thuật viên cho bước này'
        });
    } catch (error) {
        next(error);
    }
});

// Start a step
router.patch('/steps/:stepId/start', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { stepId } = req.params;

        const { data: step, error } = await supabaseAdmin
            .from('order_item_steps')
            .update({
                status: 'in_progress',
                started_at: new Date().toISOString()
            })
            .eq('id', stepId)
            .select('*')
            .single();

        if (error) {
            throw new ApiError('Không thể bắt đầu bước', 500);
        }

        res.json({
            status: 'success',
            data: step,
            message: 'Đã bắt đầu thực hiện bước'
        });

        // Update parent status (V1 or V2) and Order status
        (async () => {
            try {
                let orderId: string | null = null;

                if (step.order_product_service_id) {
                    // V2 Service
                    // Update service status if pending/assigned
                    await supabaseAdmin
                        .from('order_product_services')
                        .update({ status: 'in_progress', started_at: new Date().toISOString() })
                        .eq('id', step.order_product_service_id)
                        .in('status', ['pending', 'assigned']);

                    // Get order_id
                    const { data: service } = await supabaseAdmin
                        .from('order_product_services')
                        .select('order_product:order_products(order_id)')
                        .eq('id', step.order_product_service_id)
                        .single();

                    if (service?.order_product) {
                        const op = Array.isArray(service.order_product) ? service.order_product[0] : service.order_product;
                        orderId = op?.order_id;
                    }

                } else if (step.order_item_id) {
                    // V1 Item
                    await supabaseAdmin
                        .from('order_items')
                        .update({ status: 'in_progress', started_at: new Date().toISOString() })
                        .eq('id', step.order_item_id)
                        .in('status', ['pending', 'assigned', 'step1', 'step2', 'step3', 'step4']); // approximate statuses

                    const { data: item } = await supabaseAdmin
                        .from('order_items')
                        .select('order_id')
                        .eq('id', step.order_item_id)
                        .single();

                    orderId = item?.order_id;
                }

                // Update Order Status
                if (orderId) {
                    const { data: order } = await supabaseAdmin
                        .from('orders')
                        .select('status')
                        .eq('id', orderId)
                        .single();

                    if (order && order.status !== 'in_progress' && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'tech_completed') {
                        await supabaseAdmin
                            .from('orders')
                            .update({ status: 'in_progress' })
                            .eq('id', orderId);
                    }
                }
            } catch (err) {
                console.error('Error auto-updating parent status from step start:', err);
            }
        })();
    } catch (error) {
        next(error);
    }
});

// Complete a step: mark step completed, then start next step (pending/assigned) or complete item/service when all done (V1 & V2)
router.patch('/steps/:stepId/complete', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { stepId } = req.params;
        const { notes } = req.body;
        const userId = req.user?.id;

        const { data: step, error } = await supabaseAdmin
            .from('order_item_steps')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                notes: notes || null
            })
            .eq('id', stepId)
            .select('*')
            .single();

        if (error) {
            throw new ApiError('Không thể hoàn thành bước', 500);
        }

        try {
            await supabaseAdmin.from('order_workflow_step_log').insert({
                order_item_step_id: stepId,
                action: 'completed',
                step_name: step?.step_name ?? null,
                step_order: step?.step_order ?? null,
                notes: notes || null,
                created_by: userId ?? null
            });
        } catch (logErr) {
            console.error('order_workflow_step_log insert error:', logErr);
        }

        try {
            const managers = await getManagerRecipients();
            if (step.order_product_service_id) {
                const context = await getServiceNotificationContext(step.order_product_service_id);
                if (context) {
                    const basePayload = buildServiceEventBase(context);
                    for (const manager of managers) {
                        notifyCrmMasterUser('workflow.item.completed_step', {
                            ...basePayload,
                            target_user_id: manager.id,
                            target_role: manager.role || 'manager',
                            channel: 'telegram',
                            item: { ...basePayload.item, step_id: step.id, step_name: step.step_name, step_order: step.step_order, note: notes || null },
                        });
                    }
                }
            } else if (step.order_item_id) {
                const { data: itemForEvent } = await supabaseAdmin
                    .from('order_items')
                    .select('id, item_name, item_code, notes, order:orders(id, order_code, due_at, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id))')
                    .eq('id', step.order_item_id)
                    .maybeSingle();
                const order = Array.isArray((itemForEvent as any)?.order) ? (itemForEvent as any).order[0] : (itemForEvent as any)?.order;
                for (const manager of managers) {
                    notifyCrmMasterUser('workflow.item.completed_step', {
                        target_user_id: manager.id,
                        target_role: manager.role || 'manager',
                        channel: 'telegram',
                        order: order ? { id: order.id, order_code: order.order_code, return_due_at: order.due_at || null } : null,
                        item: {
                            id: step.order_item_id,
                            service_name: (itemForEvent as any)?.item_name || null,
                            product_code: (itemForEvent as any)?.item_code || null,
                            step_id: step.id,
                            step_name: step.step_name,
                            step_order: step.step_order,
                            note: notes || null,
                        },
                        customer: order?.customer || null,
                        links: { crm_url: buildCrmOrderUrl(order?.order_code || order?.id) },
                    });
                }
            }
        } catch (eventErr) {
            console.error('[WorkflowStepComplete] webhook error:', eventErr);
        }

        const isV2 = !!step.order_product_service_id;
        const itemFilter = isV2
            ? { order_product_service_id: step.order_product_service_id }
            : { order_item_id: step.order_item_id };

        const { data: allSteps, error: stepsError } = await supabaseAdmin
            .from('order_item_steps')
            .select('id, step_order, status')
            .match(itemFilter)
            .order('step_order', { ascending: true });

        if (stepsError || !allSteps?.length) {
            return res.json({
                status: 'success',
                data: step,
                message: 'Đã hoàn thành bước',
                allStepsCompleted: true,
                nextStep: null
            });
        }

        const allStepsCompleted = allSteps.every(s => s.status === 'completed' || s.status === 'skipped');

        let nextStep: { id: string; step_order: number } | null = null;

        if (allStepsCompleted) {
            if (isV2 && step.order_product_service_id) {
                await supabaseAdmin
                    .from('order_product_services')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        current_phase: 'workflow',
                        phase_stage: 'done'
                    })
                    .eq('id', step.order_product_service_id);
            } else if (step.order_item_id) {
                await supabaseAdmin
                    .from('order_items')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        current_phase: 'workflow',
                        phase_stage: 'done'
                    })
                    .eq('id', step.order_item_id);
            }

            // Nếu vừa xong hết bước của một item/service, kiểm tra toàn đơn: nếu mọi bước quy trình trong đơn đã xong thì chuyển đơn sang tech_completed
            let orderId: string | null = null;
            if (step.order_item_id) {
                const { data: oi } = await supabaseAdmin.from('order_items').select('order_id').eq('id', step.order_item_id).single();
                orderId = (oi as { order_id?: string } | null)?.order_id ?? null;
            } else if (step.order_product_service_id) {
                const { data: ops } = await supabaseAdmin.from('order_product_services').select('order_product_id').eq('id', step.order_product_service_id).single();
                const opId = (ops as { order_product_id?: string } | null)?.order_product_id;
                if (opId) {
                    const { data: op } = await supabaseAdmin.from('order_products').select('order_id').eq('id', opId).single();
                    orderId = (op as { order_id?: string } | null)?.order_id ?? null;
                }
            }
            if (orderId) {
                const { data: stepsV1 } = await supabaseAdmin.from('order_items').select('id').eq('order_id', orderId);
                const orderItemIds = ((stepsV1 as { id: string }[] | null) || []).map(r => r.id);
                const { data: orderProducts } = await supabaseAdmin.from('order_products').select('id').eq('order_id', orderId);
                const opIds = ((orderProducts as { id: string }[] | null) || []).map(r => r.id);
                const { data: services } = opIds.length ? await supabaseAdmin.from('order_product_services').select('id').in('order_product_id', opIds) : { data: [] };
                const serviceIds = ((services as { id: string }[] | null) || []).map(r => r.id);
                const { data: stepsV1Rows } = orderItemIds.length ? await supabaseAdmin.from('order_item_steps').select('id, status').in('order_item_id', orderItemIds) : { data: [] };
                const { data: stepsV2Rows } = serviceIds.length ? await supabaseAdmin.from('order_item_steps').select('id, status').in('order_product_service_id', serviceIds) : { data: [] };
                const allOrderSteps = [...((stepsV1Rows as { id: string; status: string }[] | null) || []), ...((stepsV2Rows as { id: string; status: string }[] | null) || [])];
                const allDone = allOrderSteps.length > 0 && allOrderSteps.every(s => s.status === 'completed' || s.status === 'skipped');
                if (allDone) {
                    await checkAndCompleteOrder(orderId);
                }
            }
        } else {
            const nextStepRow = allSteps.find(s => s.status !== 'completed' && s.status !== 'skipped');
            if (nextStepRow) {
                nextStep = { id: nextStepRow.id, step_order: nextStepRow.step_order };
            }
        }

        res.json({
            status: 'success',
            data: step,
            message: 'Đã hoàn thành bước',
            allStepsCompleted,
            nextStep
        });
    } catch (error) {
        next(error);
    }
});

// Skip a step (optional step only)
router.patch('/steps/:stepId/skip', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { stepId } = req.params;
        const { notes } = req.body;
        const userId = req.user?.id;

        const { data: step, error } = await supabaseAdmin
            .from('order_item_steps')
            .update({
                status: 'skipped',
                completed_at: new Date().toISOString(),
                notes: notes || 'Bước này đã được bỏ qua'
            })
            .eq('id', stepId)
            .select('*')
            .single();

        if (error) {
            throw new ApiError('Không thể bỏ qua bước', 500);
        }

        try {
            await supabaseAdmin.from('order_workflow_step_log').insert({
                order_item_step_id: stepId,
                action: 'skipped',
                step_name: step?.step_name ?? null,
                step_order: step?.step_order ?? null,
                created_by: userId ?? null
            });
        } catch (logErr) {
            console.error('order_workflow_step_log insert error:', logErr);
        }

        // Sau khi skip, kiểm tra toàn đơn: nếu mọi bước quy trình đã xong thì chuyển đơn sang tech_completed
        let orderId: string | null = null;
        if (step?.order_item_id) {
            const { data: oi } = await supabaseAdmin.from('order_items').select('order_id').eq('id', step.order_item_id).single();
            orderId = (oi as { order_id?: string } | null)?.order_id ?? null;
        } else if (step?.order_product_service_id) {
            const { data: ops } = await supabaseAdmin.from('order_product_services').select('order_product_id').eq('id', step.order_product_service_id).single();
            const opId = (ops as { order_product_id?: string } | null)?.order_product_id;
            if (opId) {
                const { data: op } = await supabaseAdmin.from('order_products').select('order_id').eq('id', opId).single();
                orderId = (op as { order_id?: string } | null)?.order_id ?? null;
            }
        }
        if (orderId) {
            const { data: stepsV1 } = await supabaseAdmin.from('order_items').select('id').eq('order_id', orderId);
            const orderItemIds = ((stepsV1 as { id: string }[] | null) || []).map(r => r.id);
            const { data: orderProducts } = await supabaseAdmin.from('order_products').select('id').eq('order_id', orderId);
            const opIds = ((orderProducts as { id: string }[] | null) || []).map(r => r.id);
            const { data: services } = opIds.length ? await supabaseAdmin.from('order_product_services').select('id').in('order_product_id', opIds) : { data: [] };
            const serviceIds = ((services as { id: string }[] | null) || []).map(r => r.id);
            const { data: stepsV1Rows } = orderItemIds.length ? await supabaseAdmin.from('order_item_steps').select('id, status').in('order_item_id', orderItemIds) : { data: [] };
            const { data: stepsV2Rows } = serviceIds.length ? await supabaseAdmin.from('order_item_steps').select('id, status').in('order_product_service_id', serviceIds) : { data: [] };
            const allOrderSteps = [...((stepsV1Rows as { id: string; status: string }[] | null) || []), ...((stepsV2Rows as { id: string; status: string }[] | null) || [])];
            const allDone = allOrderSteps.length > 0 && allOrderSteps.every(s => s.status === 'completed' || s.status === 'skipped');
            if (allDone) {
                await checkAndCompleteOrder(orderId);
            }
        }

        res.json({
            status: 'success',
            data: step,
            message: 'Đã bỏ qua bước này'
        });
    } catch (error) {
        next(error);
    }
});

type ResolvedOrderEntity = {
    isV1: boolean;
    isV2Service: boolean;
    isV2Product: boolean;
    order_item_id: string | null;
    order_product_id: string | null;
    order_product_service_id: string | null;
};

async function resolveOrderEntityId(
    id: string,
    metadata?: { order_product_id?: string },
): Promise<ResolvedOrderEntity> {
    const [{ data: v1Item }, { data: v2Service }, { data: v2Product }] = await Promise.all([
        supabaseAdmin.from('order_items').select('id').eq('id', id).maybeSingle(),
        supabaseAdmin.from('order_product_services').select('id, order_product_id').eq('id', id).maybeSingle(),
        supabaseAdmin.from('order_products').select('id').eq('id', id).maybeSingle(),
    ]);

    const isV1 = !!v1Item;
    const isV2Service = !!v2Service;
    const isV2Product = !!v2Product;

    if (!isV1 && !isV2Service && !isV2Product) {
        throw new ApiError('Không tìm thấy hạng mục đơn hàng', 404);
    }

    return {
        isV1,
        isV2Service,
        isV2Product,
        order_item_id: isV1 ? id : null,
        order_product_id: isV2Service
            ? v2Service?.order_product_id || metadata?.order_product_id || null
            : isV2Product
              ? id
              : metadata?.order_product_id || null,
        order_product_service_id: isV2Service ? id : null,
    };
}

// =====================================================
// ORDER ITEM ACCESSORIES (Mua phụ kiện)
// =====================================================
const ACCESSORY_STATUSES = ['requested', 'rejected', 'need_buy', 'bought', 'waiting_ship', 'shipped', 'delivered_to_tech', 'done'];

router.patch('/:id/accessory', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { status, notes, metadata } = req.body;

        if (!status || !ACCESSORY_STATUSES.includes(status)) {
            throw new ApiError('Trạng thái không hợp lệ. Chọn: requested, rejected, need_buy, bought, waiting_ship, shipped, delivered_to_tech, done', 400);
        }

        const entity = await resolveOrderEntityId(id, metadata);

        const payload = {
            order_item_id: entity.order_item_id,
            order_product_id: entity.order_product_id,
            order_product_service_id: entity.order_product_service_id,
            status,
            notes: notes || null,
            metadata: metadata || {},
            updated_by: req.user!.id,
        };

        const existingQuery = supabaseAdmin
            .from('order_item_accessories')
            .select('id, status, metadata')
            .order('updated_at', { ascending: false })
            .limit(1);
        let existingResult;
        if (entity.isV1) {
            existingResult = await existingQuery.eq('order_item_id', id).maybeSingle();
        } else if (entity.isV2Service) {
            existingResult = await existingQuery.eq('order_product_service_id', id).maybeSingle();
        } else {
            existingResult = await existingQuery
                .eq('order_product_id', id)
                .is('order_product_service_id', null)
                .maybeSingle();
        }
        const { data: existing } = existingResult;

        if (existing) {
            const oldStatus = (existing as { status?: string }).status;
            const { data: updated, error } = await supabaseAdmin
                .from('order_item_accessories')
                .update({ 
                    order_product_id: payload.order_product_id,
                    status, 
                    notes: notes || null, 
                    metadata: metadata ? { ...(existing.metadata || {}), ...metadata } : (existing.metadata || {}),
                    updated_by: req.user!.id, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw new ApiError('Lỗi cập nhật: ' + error.message, 500);

            if (status !== oldStatus) {
                await logAccessoryStatusChange(
                    {
                        order_item_id: entity.order_item_id,
                        order_product_id: entity.order_product_id,
                        order_product_service_id: entity.order_product_service_id,
                    },
                    oldStatus,
                    status,
                    notes,
                    req.user?.id
                );

                if (status === 'need_buy' || status === 'rejected') {
                    await notifyWorkflowRequestEvent(status === 'need_buy' ? 'accessory.approved' : 'accessory.rejected', {
                        ...updated,
                        order_item_id: entity.order_item_id,
                        order_product_id: payload.order_product_id,
                        order_product_service_id: entity.order_product_service_id,
                        metadata: metadata || existing.metadata || {},
                    }, { old_status: oldStatus || null, new_status: status, notes: notes || null });
                }
            }

            if (status === 'requested' && oldStatus !== 'requested') {
                await notifyWorkflowRequestEvent('accessory.request.created', {
                    ...updated,
                    order_item_id: entity.order_item_id,
                    order_product_id: payload.order_product_id,
                    order_product_service_id: entity.order_product_service_id,
                    metadata: metadata || existing.metadata || {},
                }, { notes: notes || null });
            }

            return res.json({ status: 'success', data: updated, message: 'Đã cập nhật trạng thái mua phụ kiện' });
        }

        const { data: inserted, error } = await supabaseAdmin
            .from('order_item_accessories')
            .insert(payload)
            .select()
            .single();
        if (error) throw new ApiError('Lỗi tạo: ' + error.message, 500);

        if (status === 'requested') {
            const itemName = metadata?.item_name || 'Phụ kiện';
            await logAccessoryStatusChange(
                {
                    order_item_id: entity.order_item_id,
                    order_product_id: payload.order_product_id,
                    order_product_service_id: entity.order_product_service_id,
                },
                undefined,
                status,
                `${itemName}${notes ? ': ' + notes : ''}`,
                req.user?.id
            );

            await notifyWorkflowRequestEvent('accessory.request.created', inserted, { notes: notes || null });
        }

        res.json({
            status: 'success',
            data: inserted,
            message: 'Đã cập nhật trạng thái mua phụ kiện',
        });
    } catch (error) {
        next(error);
    }
});

// =====================================================
// ORDER ITEM PARTNER (Gửi Đối Tác)
// =====================================================
const PARTNER_STATUSES = ['requested', 'rejected', 'ship_to_partner', 'partner_doing', 'ship_back', 'done'];

router.patch('/:id/partner', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { status, notes, metadata } = req.body;

        if (!status || !PARTNER_STATUSES.includes(status)) {
            throw new ApiError('Trạng thái không hợp lệ. Chọn: requested, rejected, ship_to_partner, partner_doing, ship_back, done', 400);
        }

        const entity = await resolveOrderEntityId(id, metadata);

        const payload = {
            order_item_id: entity.order_item_id,
            order_product_id: entity.order_product_id,
            order_product_service_id: entity.order_product_service_id,
            status,
            notes: notes || null,
            metadata: metadata || {},
            updated_by: req.user!.id,
        };

        const existingQuery = supabaseAdmin
            .from('order_item_partner')
            .select('id, status, metadata')
            .order('updated_at', { ascending: false })
            .limit(1);
        let existingResult;
        if (entity.isV1) {
            existingResult = await existingQuery.eq('order_item_id', id).maybeSingle();
        } else if (entity.isV2Service) {
            existingResult = await existingQuery.eq('order_product_service_id', id).maybeSingle();
        } else {
            existingResult = await existingQuery
                .eq('order_product_id', id)
                .is('order_product_service_id', null)
                .maybeSingle();
        }
        const { data: existing } = existingResult;

        if (existing) {
            const oldStatus = (existing as { status?: string }).status;
            const { data: updated, error } = await supabaseAdmin
                .from('order_item_partner')
                .update({ 
                    order_product_id: payload.order_product_id,
                    status, 
                    notes: notes || null, 
                    metadata: metadata ? { ...(existing.metadata || {}), ...metadata } : (existing.metadata || {}),
                    updated_by: req.user!.id, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw new ApiError('Lỗi cập nhật: ' + error.message, 500);

            if (status !== oldStatus) {
                await logPartnerStatusChange(
                    {
                        order_item_id: entity.order_item_id,
                        order_product_id: payload.order_product_id,
                        order_product_service_id: entity.order_product_service_id,
                    },
                    oldStatus,
                    status,
                    notes,
                    req.user?.id
                );

                if (status === 'ship_to_partner' || status === 'rejected') {
                    const event = status === 'ship_to_partner' ? 'partner.approved' : 'partner.rejected';
                    await notifyWorkflowRequestEvent(event, {
                        ...updated,
                        order_item_id: entity.order_item_id,
                        order_product_id: payload.order_product_id,
                        order_product_service_id: entity.order_product_service_id,
                        metadata: metadata || existing.metadata || {},
                    }, { old_status: oldStatus || null, new_status: status, notes: notes || null });
                }
            }

            if (status === 'requested' && oldStatus !== 'requested') {
                await notifyWorkflowRequestEvent('partner.request.created', {
                    ...updated,
                    order_item_id: entity.order_item_id,
                    order_product_id: payload.order_product_id,
                    order_product_service_id: entity.order_product_service_id,
                    metadata: metadata || existing.metadata || {},
                }, { notes: notes || null });
            }

            return res.json({ status: 'success', data: updated, message: 'Đã cập nhật trạng thái gửi đối tác' });
        }

        const { data: inserted, error } = await supabaseAdmin
            .from('order_item_partner')
            .insert(payload)
            .select()
            .single();
        if (error) throw new ApiError('Lỗi tạo: ' + error.message, 500);

        if (status === 'requested') {
            await logPartnerStatusChange(
                {
                    order_item_id: entity.order_item_id,
                    order_product_id: payload.order_product_id,
                    order_product_service_id: entity.order_product_service_id,
                },
                undefined,
                status,
                notes,
                req.user?.id
            );

            await notifyWorkflowRequestEvent('partner.request.created', inserted, { notes: notes || null });
        }

        res.json({
            status: 'success',
            data: inserted,
            message: 'Đã cập nhật trạng thái gửi đối tác',
        });
    } catch (error) {
        next(error);
    }
});

// =====================================================
// NEW ENDPOINTS FOR KANBAN PROCESS CHANGE
// =====================================================

// Fail/Cancel an item with reason
router.patch('/:id/fail', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user?.id;

        if (!reason) {
            throw new ApiError('Vui lòng nhập lý do thất bại/hủy', 400);
        }

        // 1. Determine if V1 or V2
        const { data: v1Item } = await supabaseAdmin.from('order_items').select('id, order_id, item_name, tech_room, order:orders(id, order_code)').eq('id', id).maybeSingle();
        const { data: v2Item } = await supabaseAdmin.from('order_product_services').select('id, item_name, tech_room, order_product:order_products(id, order_id, name, product_code, order:orders(id, order_code))').eq('id', id).maybeSingle();

        let item: any = null;
        let orderId: string | null = null;
        let entityType: 'order_item' | 'order_product_service' | null = null;

        if (v1Item) {
            entityType = 'order_item';
            orderId = v1Item.order_id;
            const { data: updated, error } = await supabaseAdmin
                .from('order_items')
                .update({
                    status: 'cancelled',
                    // notes: reason // Append or set notes? Maybe better to log in status log or append to notes
                })
                .eq('id', id)
                .select()
                .single();
            if (error) throw new ApiError('Lỗi cập nhật: ' + error.message, 500);
            item = updated;
        } else if (v2Item) {
            entityType = 'order_product_service';
            if (v2Item.order_product) {
                const op = Array.isArray(v2Item.order_product) ? v2Item.order_product[0] : v2Item.order_product;
                orderId = op.order_id;
            }
            const { data: updated, error } = await supabaseAdmin
                .from('order_product_services')
                .update({
                    status: 'cancelled',
                    notes: reason // V2 has notes field, we can use it or append
                })
                .eq('id', id)
                .select()
                .single();
            if (error) throw new ApiError('Lỗi cập nhật: ' + error.message, 500);
            item = updated;

            const context = await getServiceNotificationContext(id);
            if (context) {
                const managers = await getManagerRecipients();
                const basePayload = buildServiceEventBase(context);
                for (const manager of managers) {
                    notifyCrmMasterUser('workflow.item.failed', {
                        ...basePayload,
                        target_user_id: manager.id,
                        target_role: manager.role || 'manager',
                        channel: 'telegram',
                        item: { ...basePayload.item, reason },
                        reason,
                    });
                }
            }
        } else {
            throw new ApiError('Không tìm thấy hạng mục', 404);
        }

        // 2. Log status change with reason
        if (orderId && entityType) {
            await supabaseAdmin.from('order_item_status_log').insert({
                order_id: orderId,
                entity_type: entityType,
                entity_id: id,
                from_status: 'unknown', // We didn't fetch old status to save a query, or we can catch it
                to_status: 'cancelled',
                created_by: userId,
                // note: reason // If schema supports it, otherwise rely on item notes
            });
        }

        // 3. Skip all pending steps for this item
        if (entityType === 'order_item') {
            await supabaseAdmin.from('order_item_steps')
                .update({
                    status: 'skipped',
                    notes: 'Hạng mục thất bại/bị hủy: ' + reason,
                    completed_at: new Date().toISOString()
                })
                .eq('order_item_id', id)
                .neq('status', 'completed');
        } else if (entityType === 'order_product_service') {
            await supabaseAdmin.from('order_item_steps')
                .update({
                    status: 'skipped',
                    notes: 'Dịch vụ thất bại/bị hủy: ' + reason,
                    completed_at: new Date().toISOString()
                })
                .eq('order_product_service_id', id)
                .neq('status', 'completed');
        }

        // 4. Log the failure in the workflow log
        const lastStepFilter = entityType === 'order_item' ? { order_item_id: id } : { order_product_service_id: id };
        const { data: lastStep } = await supabaseAdmin
            .from('order_item_steps')
            .select('*')
            .match(lastStepFilter)
            .order('step_order', { ascending: false })
            .limit(1)
            .single();

        if (lastStep) {
            await supabaseAdmin.from('order_workflow_step_log').insert({
                order_item_step_id: lastStep.id,
                action: 'failed',
                step_name: lastStep.step_name,
                step_order: lastStep.step_order,
                notes: 'Hạng mục thất bại/bị hủy: ' + reason,
                created_by: userId
            });
        }

        res.json({
            status: 'success',
            data: item,
            message: 'Đã hủy hạng mục thành công'
        });
    } catch (error) {
        next(error);
    }
});

// Change Room / Process Step with Reason and Deadline
router.patch(['/:id/change-room', '/:id/transfer-room'], authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { targetRoomId, reason, deadline_days, technician_id, note, photos } = req.body;
        const userId = req.user?.id;

        if (!targetRoomId || !reason || !deadline_days) {
            throw new ApiError('Thiếu thông tin: phòng đích, lý do, hoặc hạn hoàn thành', 400);
        }

        // Map targetRoomId to step order (assuming 1=Mạ, 2=Dán đế, 3=Da based on constants.ts TECH_ROOMS)
        let targetStepOrder = 0;
        if (targetRoomId === 'phong_ma') targetStepOrder = 1;
        else if (targetRoomId === 'phong_dan_de') targetStepOrder = 2;
        else if (targetRoomId === 'phong_da') targetStepOrder = 3;

        if (targetStepOrder === 0) {
            throw new ApiError('Phòng đích không hợp lệ', 400);
        }

        // 1. Resolve Item Type
        const { data: v1Item } = await supabaseAdmin.from('order_items').select('id, order_id, item_name, tech_room, order:orders(id, order_code)').eq('id', id).maybeSingle();
        const { data: v2Item } = await supabaseAdmin.from('order_product_services').select('id, item_name, tech_room, order_product:order_products(id, order_id, name, product_code, order:orders(id, order_code))').eq('id', id).maybeSingle();

        let isV1 = !!v1Item;
        let isV2 = !!v2Item;

        if (!isV1 && !isV2) throw new ApiError('Không tìm thấy hạng mục', 404);

        // 2. Fetch all steps for this item with department names
        const itemFilter = isV1 ? { order_item_id: id } : { order_product_service_id: id };
        const { data: steps, error: stepsError } = await supabaseAdmin
            .from('order_item_steps')
            .select('*, department:departments(name)')
            .match(itemFilter)
            .order('step_order', { ascending: true });

        if (stepsError || !steps) throw new ApiError('Lỗi lấy danh sách bước', 500);

        // 3. Forcefully handle Room Transition
        let techName = '';
        if (technician_id) {
            const { data: tech } = await supabaseAdmin.from('users').select('name').eq('id', technician_id).single();
            if (tech) techName = tech.name;
        }

        // History nhẹ: ghi chú ngắn — link Drive chỉ lưu ở cột photos, không nhúng vào notes
        const mediaRefs = normalizeMediaRefs(photos);
        const mediaSummary = summarizeMediaUpload(mediaRefs, 'bằng chứng chuyển phòng');
        const finalNotes = buildLightweightHistoryNote([
            reason,
            note ? `Lưu ý: ${note}` : '',
            deadline_days ? `Hạn: ${deadline_days} ngày` : '',
            techName ? `KTV: ${techName}` : '',
            mediaSummary,
        ]);

        // a. Map targetRoomId to a search pattern for department
        let deptSearch = '';
        if (targetRoomId === 'phong_ma') deptSearch = 'Mạ';
        else if (targetRoomId === 'phong_dan_de') deptSearch = 'Dán đế';
        else if (targetRoomId === 'phong_da') deptSearch = 'Da';

        // b. Fetch all departments to find the ID
        const { data: allDepts } = await supabaseAdmin.from('departments').select('id, name');
        const targetDept = (allDepts || []).find(d => {
            const n = d.name.toLowerCase();
            const searchStr = deptSearch.toLowerCase();
            if (searchStr === 'da') return n.includes('da') && !n.includes('dán');
            return n.includes(searchStr);
        });

        // c. Get Transition details
        const activeItemStep = steps.find(s => ['assigned', 'in_progress', 'started'].includes(s.status));
        const previousTechnicianId = activeItemStep?.technician_id || null;
        const previousTechRoom = isV1 ? (v1Item as any)?.tech_room : (v2Item as any)?.tech_room;
        const fromRoom = getTechRoomDisplayName(previousTechRoom) || (activeItemStep as any)?.department?.name || activeItemStep?.step_name || 'Khởi tạo';
        const toRoom = targetDept?.name || deptSearch;

        // c. Mark ALL currently active/pending steps as 'skipped'
        const pendingSteps = steps.filter(s => ['pending', 'assigned', 'in_progress', 'started'].includes(s.status));
        for (const step of pendingSteps) {
            const { error: skipError } = await supabaseAdmin.from('order_item_steps')
                .update({
                    status: 'skipped',
                    notes: `Chuyển sang ${toRoom}: ${finalNotes}`,
                    completed_at: new Date().toISOString()
                })
                .eq('id', step.id);
            if (skipError) console.error(`[ChangeRoom] Error skipping step ${step.id}:`, skipError);
        }

        // d. Find Target Step or Create New
        let targetStep = steps.find(s => {
            const deptName = (s as any).department?.name?.toLowerCase() || '';
            const searchStr = deptSearch.toLowerCase();
            if (searchStr === 'da') return deptName.includes('da') && !deptName.includes('dán');
            return deptName.includes(searchStr);
        });

        // If not found by dept name, fallback to targetStepOrder if it matches something reasonable
        if (!targetStep) {
            targetStep = steps.find(s => s.step_order === targetStepOrder);
        }

        let activatedStepId = targetStep?.id;

        if (targetStep) {
            const { error: updateError } = await supabaseAdmin
                .from('order_item_steps')
                .update({
                    status: 'assigned',
                    estimated_duration: deadline_days,
                    started_at: null,
                    completed_at: null,
                    technician_id: technician_id || null,
                    notes: finalNotes,
                    department_id: targetDept?.id || targetStep.department_id // Ensure department matches
                })
                .eq('id', targetStep.id);

            if (updateError) throw new ApiError('Lỗi cập nhật bước đích: ' + updateError.message, 500);
        } else {
            // CREATE a new step for this department since the workflow didn't have it
            if (!targetDept) throw new ApiError(`Không tìm thấy bộ phận tương ứng với ${targetRoomId} trong hệ thống`, 404);

            const { data: newStep, error: insertError } = await supabaseAdmin
                .from('order_item_steps')
                .insert({
                    order_item_id: isV1 ? id : null,
                    order_product_service_id: isV2 ? id : null,
                    step_order: targetStepOrder, // Use the suggested order
                    step_name: targetDept.name,
                    department_id: targetDept.id,
                    status: 'assigned',
                    estimated_duration: deadline_days,
                    technician_id: technician_id || null,
                    notes: finalNotes
                })
                .select()
                .single();

            if (insertError) throw new ApiError('Lỗi tạo bước quy trình mới: ' + insertError.message, 500);
            activatedStepId = newStep.id;
        }

        // 4. Also update the PARENT item status and technician
        const parentUpdate: any = { status: 'in_progress', tech_room: targetRoomId };
        if (technician_id) parentUpdate.technician_id = technician_id;

        if (isV1) {
            await supabaseAdmin.from('order_items').update(parentUpdate).eq('id', id);
        } else {
            await supabaseAdmin.from('order_product_services').update(parentUpdate).eq('id', id);

            // Also update junction table for V2 multi-tech support
            if (technician_id) {
                // Delete existing assignments for this service (assuming room change resets assignment or moves to new lead tech)
                await supabaseAdmin.from('order_product_service_technicians').delete().eq('order_product_service_id', id);
                
                // Insert new assignment
                await supabaseAdmin.from('order_product_service_technicians').insert({
                    order_product_service_id: id,
                    technician_id: technician_id,
                    assigned_by: userId,
                    assigned_at: new Date().toISOString(),
                    status: 'assigned'
                });
            }
        }

        // Log the transition / activation
        const { data: finalStep } = await supabaseAdmin.from('order_item_steps').select('*, department:departments(name)').eq('id', activatedStepId).single();

        if (finalStep) {
            await supabaseAdmin.from('order_workflow_step_log').insert({
                order_item_step_id: finalStep.id,
                action: 'assigned',
                step_name: `${fromRoom} ➔ ${toRoom}`,
                step_order: finalStep.step_order,
                notes: finalNotes,
                photos: mediaRefs,
                created_by: userId,
                technician_id: technician_id || null,
                deadline_days: deadline_days || null,
                reason: sanitizeHistoryNotes(reason) || null
            });
        }

        if (isV2 && technician_id) {
            const context = await getServiceNotificationContext(id);
            const { data: technician } = await supabaseAdmin
                .from('users')
                .select('id, name, role, telegram_chat_id')
                .eq('id', technician_id)
                .maybeSingle();

            if (context && technician?.id) {
                const basePayload = buildServiceEventBase(context);
                const directOrder = isV1
                    ? (Array.isArray((v1Item as any)?.order) ? (v1Item as any).order[0] : (v1Item as any)?.order)
                    : (Array.isArray((v2Item as any)?.order_product?.order) ? (v2Item as any).order_product.order[0] : (v2Item as any)?.order_product?.order);
                const directProduct = (v2Item as any)?.order_product;

                notifyCrmMasterUser('workflow.item.room_changed', {
                    ...basePayload,
                    order: {
                        ...(basePayload.order || {}),
                        id: directOrder?.id || context.order?.id || basePayload.order?.id || null,
                        order_code: directOrder?.order_code || context.order?.order_code || basePayload.order?.order_code || null,
                    },
                    target_user_id: technician.id,
                    target_role: 'technician',
                    channel: 'telegram',
                    item: {
                        ...basePayload.item,
                        product_name: directProduct?.name || context.orderProduct?.name || basePayload.item?.product_name || null,
                        product_code: directProduct?.product_code || context.orderProduct?.product_code || basePayload.item?.product_code || null,
                        from_room: fromRoom,
                        room_name: toRoom,
                        reason: reason || null,
                        note: finalNotes || null,
                    },
                    staff: {
                        id: technician.id,
                        name: technician.name,
                        role: technician.role || 'technician',
                        telegram_chat_id: technician.telegram_chat_id || null,
                    },
                });

                if (previousTechnicianId && previousTechnicianId !== technician_id) {
                    for (const manager of await getManagerRecipients()) {
                        notifyCrmMasterUser('workflow.item.technician_changed', {
                            ...basePayload,
                            target_user_id: manager.id,
                            target_role: manager.role || 'manager',
                            channel: 'telegram',
                            item: { ...basePayload.item, from_room: fromRoom, room_name: toRoom, note: finalNotes || null },
                            old_technician_id: previousTechnicianId,
                            new_technician_id: technician_id,
                        });
                    }
                }
            }
        } else {
            const directOrder = isV1
                ? (Array.isArray((v1Item as any)?.order) ? (v1Item as any).order[0] : (v1Item as any)?.order)
                : (Array.isArray((v2Item as any)?.order_product?.order) ? (v2Item as any).order_product.order[0] : (v2Item as any)?.order_product?.order);
            const directProduct = (v2Item as any)?.order_product;
            for (const manager of await getManagerRecipients()) {
                notifyCrmMasterUser('workflow.item.waiting_assignment', {
                    target_user_id: manager.id,
                    target_role: manager.role || 'manager',
                    channel: 'telegram',
                    order: directOrder ? { id: directOrder.id, order_code: directOrder.order_code } : null,
                    item: {
                        id,
                        service_name: (v1Item as any)?.item_name || (v2Item as any)?.item_name || directProduct?.name || null,
                        product_name: directProduct?.name || null,
                        product_code: directProduct?.product_code || null,
                        from_room: fromRoom,
                        room_name: toRoom,
                        room_id: targetDept?.id || null,
                        note: finalNotes || null,
                    },
                    links: { crm_url: buildCrmOrderUrl(directOrder?.order_code || directOrder?.id) },
                });
            }
        }

        res.json({
            status: 'success',
            data: finalStep,
            message: 'Đã chuyển quy trình thành công'
        });

    } catch (error) {
        next(error);
    }
});

// Update after-sale data for item
router.patch('/:id/after-sale-data', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const {
            completion_photos, packaging_photos, delivery_code, delivery_carrier, delivery_type,
            stage, due_at, sales_step_data,
            care_warranty_flow, care_warranty_stage,
            move_notes, move_photos, allow_step_back,
            // Mỗi sản phẩm trong đơn phải điền độc lập — không dùng chung dữ liệu cấp đơn
            aftersale_receiver_name, debt_checked, debt_checked_notes, debt_checked_by_name,
            delivery_creator_name, delivery_shipper_phone, delivery_staff_name, delivery_received_at,
        } = req.body;
        const userId = req.user?.id;

        const updatePayload: any = { updated_at: new Date().toISOString() };
        if (completion_photos !== undefined) updatePayload.completion_photos = Array.isArray(completion_photos) ? completion_photos : [];
        if (packaging_photos !== undefined) updatePayload.packaging_photos = Array.isArray(packaging_photos) ? packaging_photos : [];
        if (delivery_code !== undefined) updatePayload.delivery_code = delivery_code;
        if (delivery_carrier !== undefined) updatePayload.delivery_carrier = delivery_carrier;
        if (delivery_type !== undefined) updatePayload.delivery_type = delivery_type;
        if (stage !== undefined) updatePayload.after_sale_stage = stage;
        if (due_at !== undefined) updatePayload.due_at = due_at ? new Date(due_at).toISOString() : null;
        if (sales_step_data !== undefined) updatePayload.sales_step_data = sales_step_data;
        if (care_warranty_flow !== undefined) updatePayload.care_warranty_flow = care_warranty_flow;
        if (care_warranty_stage !== undefined) updatePayload.care_warranty_stage = care_warranty_stage;
        if (aftersale_receiver_name !== undefined) updatePayload.aftersale_receiver_name = aftersale_receiver_name;
        if (debt_checked !== undefined) updatePayload.debt_checked = !!debt_checked;
        if (debt_checked_notes !== undefined) updatePayload.debt_checked_notes = debt_checked_notes;
        if (debt_checked_by_name !== undefined) updatePayload.debt_checked_by_name = debt_checked_by_name;
        if (delivery_creator_name !== undefined) updatePayload.delivery_creator_name = delivery_creator_name;
        if (delivery_shipper_phone !== undefined) updatePayload.delivery_shipper_phone = delivery_shipper_phone;
        if (delivery_staff_name !== undefined) updatePayload.delivery_staff_name = delivery_staff_name;
        if (delivery_received_at !== undefined) updatePayload.delivery_received_at = delivery_received_at || null;

        const { data: currentItem } = await supabaseAdmin.from('order_items').select('after_sale_stage, phase_stage, order_id, current_phase, care_warranty_flow, care_warranty_stage, completion_photos').eq('id', id).single();
        const oldCareFlow = currentItem?.care_warranty_flow ?? null;
        const oldCareStage = currentItem?.care_warranty_stage ?? null;

        // Vào lại từ đầu 1 chu kỳ Bảo hành/Chăm sóc: gom ghi chú + ảnh cũ vào lịch sử, xoá trắng để điền lại
        const CARE_WARRANTY_ENTRY_STAGES: string[] = [WARRANTY_STAGE_ORDER[0], CARE_STAGE_ORDER[0]];
        let archivedReentryNotes: string | null = null;
        let archivedReentryPhotos: string[] = [];
        const isReenteringCareWarranty = care_warranty_stage !== undefined
            && CARE_WARRANTY_ENTRY_STAGES.includes(care_warranty_stage)
            && care_warranty_stage !== oldCareStage;
        if (isReenteringCareWarranty && currentItem?.order_id) {
            const oldPhotos: string[] = Array.isArray(currentItem.completion_photos) ? currentItem.completion_photos : [];
            const { data: orderRow } = await supabaseAdmin.from('orders').select('notes').eq('id', currentItem.order_id).single();
            const oldOrderNotes: string = orderRow?.notes || '';
            if (oldOrderNotes || oldPhotos.length > 0) {
                archivedReentryNotes = oldOrderNotes || null;
                archivedReentryPhotos = oldPhotos;
                updatePayload.completion_photos = [];
                await supabaseAdmin.from('orders').update({ notes: '' }).eq('id', currentItem.order_id);
            }
        }

        if (care_warranty_flow !== undefined) {
            if (care_warranty_flow === 'warranty') {
                updatePayload.current_phase = 'warranty';
                updatePayload.phase_stage = care_warranty_stage || 'war1';
            } else if (care_warranty_flow === 'care') {
                updatePayload.current_phase = 'care';
                updatePayload.phase_stage = care_warranty_stage || 'care6';
            }
        } else if (care_warranty_stage !== undefined && !care_warranty_flow) {
            const curPhase = currentItem?.current_phase;
            if (curPhase === 'care' || curPhase === 'warranty') {
                updatePayload.phase_stage = care_warranty_stage;
            }
        }

        if (stage !== undefined && care_warranty_flow === undefined) {
            updatePayload.current_phase = 'after_sale';
            updatePayload.phase_stage = stage;
        }
        const oldStage = resolveAfterSaleOldStage(currentItem);

        if (stage !== undefined && stage !== oldStage) {
            const oldIdx = AFTER_SALE_STAGE_ORDER.indexOf(oldStage as any);
            const newIdx = AFTER_SALE_STAGE_ORDER.indexOf(stage as any);
            const isSingleStepBack = allow_step_back && oldIdx >= 0 && newIdx >= 0 && oldIdx - newIdx === 1;
            // phase_stage / after_sale_stage đôi khi lệch còn after1 trong khi UI đã ở Kiểm nợ —
            // cho phép after1 → after2 khi xác nhận kiểm nợ (debt_checked).
            const isDebtCheckAdvance =
                stage === 'after2'
                && (oldStage === 'after1' || oldStage === 'after1_debt')
                && debt_checked === true;
            if (!isSingleStepBack && !isDebtCheckAdvance) {
                assertForwardStageMove(AFTER_SALE_STAGE_ORDER, oldStage, stage);
            }
        }

        const newCareFlowForCheck = care_warranty_flow !== undefined ? care_warranty_flow : oldCareFlow;
        if (
            care_warranty_stage !== undefined
            && care_warranty_stage !== oldCareStage
            && newCareFlowForCheck
            && newCareFlowForCheck === oldCareFlow
        ) {
            const cols = newCareFlowForCheck === 'warranty' ? WARRANTY_STAGE_ORDER : CARE_STAGE_ORDER;
            assertForwardStageMove(cols, oldCareStage, care_warranty_stage);
        }

        const { data: item, error } = await supabaseAdmin
            .from('order_items')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Không thể cập nhật thông tin after-sale cho sản phẩm', 500);
        }

        // Record log if stage changed
        if (stage !== undefined && oldStage !== stage) {
            const stagePhotos = normalizeMediaRefs(move_photos);
            const stageNotes = buildLightweightHistoryNote([
                sanitizeHistoryNotes(move_notes),
                summarizeMediaUpload(stagePhotos, 'after-sale'),
            ]) || null;
            try {
                await supabaseAdmin.from('order_after_sale_stage_log').insert({
                    order_id: item.order_id,
                    entity_type: 'order_item',
                    entity_id: id,
                    from_stage: oldStage,
                    to_stage: stage,
                    created_by: userId,
                    notes: stageNotes,
                    photos: stagePhotos.length ? stagePhotos : null,
                });
            } catch (logErr) {
                try {
                    await supabaseAdmin.from('order_after_sale_stage_log').insert({
                        order_id: item.order_id,
                        entity_type: 'order_item',
                        entity_id: id,
                        from_stage: oldStage,
                        to_stage: stage,
                        created_by: userId,
                    });
                } catch (fallbackErr) {
                    console.error('order_after_sale_stage_log insert error (order_item):', logErr, fallbackErr);
                }
            }
        }

        const newCareFlow = care_warranty_flow !== undefined ? (care_warranty_flow || null) : oldCareFlow;
        const newCareStage = care_warranty_stage !== undefined ? (care_warranty_stage || null) : oldCareStage;
        const careChanged = (care_warranty_flow !== undefined || care_warranty_stage !== undefined)
            && (oldCareFlow !== newCareFlow || oldCareStage !== newCareStage)
            && newCareStage;
        if (careChanged && item.order_id) {
            const flowType = newCareFlow === 'warranty' || ['war1', 'war2', 'war3'].includes(newCareStage)
                ? 'warranty'
                : 'care';
            const careLogPhotos = normalizeMediaRefs(
                archivedReentryPhotos.length ? archivedReentryPhotos : move_photos
            );
            const careLogNotes = buildLightweightHistoryNote([
                sanitizeHistoryNotes(archivedReentryNotes ?? move_notes),
                summarizeMediaUpload(careLogPhotos, flowType === 'warranty' ? 'bảo hành' : 'chăm sóc'),
            ]) || null;
            try {
                await supabaseAdmin.from('order_care_warranty_log').insert({
                    order_id: item.order_id,
                    entity_type: 'order_item',
                    entity_id: id,
                    from_stage: oldCareStage,
                    to_stage: newCareStage,
                    flow_type: flowType,
                    created_by: userId ?? null,
                    notes: careLogNotes,
                    photos: careLogPhotos.length ? careLogPhotos : null,
                });
            } catch (logErr) {
                try {
                    await supabaseAdmin.from('order_care_warranty_log').insert({
                        order_id: item.order_id,
                        from_stage: oldCareStage,
                        to_stage: newCareStage,
                        flow_type: flowType,
                        created_by: userId ?? null,
                        notes: careLogNotes,
                        photos: careLogPhotos.length ? careLogPhotos : null,
                    });
                } catch (fallbackErr) {
                    console.error('order_care_warranty_log insert error (order_item):', logErr, fallbackErr);
                }
            }
        }

        // Set debt_start_at on parent order when item transitions to after1_debt (only if not already set)
        if (stage === 'after1_debt' && item.order_id) {
            try {
                const { data: parentOrder } = await supabaseAdmin
                    .from('orders')
                    .select('debt_start_at')
                    .eq('id', item.order_id)
                    .single();

                if (!parentOrder?.debt_start_at) {
                    await supabaseAdmin
                        .from('orders')
                        .update({ debt_start_at: new Date().toISOString() })
                        .eq('id', item.order_id);
                }
            } catch (debtErr) {
                console.error('Error setting debt_start_at on parent order:', debtErr);
            }
        }

        if (stage === 'after1_debt' && oldStage !== 'after1_debt' && item.order_id) {
            try {
                const { data: orderCtx } = await supabaseAdmin
                    .from('orders')
                    .select('order_code')
                    .eq('id', item.order_id)
                    .maybeSingle();

                const { data: serviceRow } = await supabaseAdmin
                    .from('order_product_services')
                    .select(`
                        id, item_name,
                        sales:order_product_service_sales(
                            sale:users!order_product_service_sales_sale_id_fkey(id, name, telegram_chat_id)
                        )
                    `)
                    .eq('id', item.id)
                    .maybeSingle();

                const assignedSales = serviceRow
                    ? collectAssignedSalesFromServices([serviceRow])
                    : [];

                fireWebhook('sale.commission_ready', {
                    order_id: item.order_id,
                    order_code: (orderCtx as any)?.order_code || 'N/A',
                    item_id: item.id,
                    item_name: item.item_name || item.item_code || 'N/A',
                    stage: 'after1_debt',
                    sales_users: assignedSales,
                    sale_id: assignedSales[0]?.id || null,
                    sale_name: assignedSales.map((s) => s.name).join(', ') || null,
                    tele_id_sale: assignedSales[0]?.telegram_chat_id || null,
                });
            } catch (commissionWhErr) {
                console.error('Error firing sale.commission_ready webhook for order item:', commissionWhErr);
            }
        }

        res.json({
            status: 'success',
            data: item,
            message: 'Đã cập nhật thông tin after-sale cho sản phẩm'
        });
    } catch (error) {
        next(error);
    }
});

// Debug middleware for order-items router
router.use((req, res, next) => {
    console.log(`[Order Items Router] Hit: ${req.method} ${req.url}`);
    next();
});

// Create item-level extension request
router.post('/:id/extension-request', authenticate, async (req: AuthenticatedRequest, res, next) => {
    console.log(`[API] Creating extension request for item: ${req.params.id}`);
    try {
        const { id } = req.params;
        const { reason, new_due_at } = req.body;
        const userId = req.user?.id;

        if (!reason || !new_due_at) {
            throw new ApiError('Thiếu lý do gia hạn hoặc hạn mới', 400);
        }

        const [{ data: v1Item }, { data: v2Item }] = await Promise.all([
            supabaseAdmin.from('order_items').select('id, item_name, order_id').eq('id', id).maybeSingle(),
            // Assuming order_product_services has an item name. Actually we can join with order_products.
            supabaseAdmin.from('order_product_services').select('id, name, order_product:order_products(order_id, name)').eq('id', id).maybeSingle()
        ]);

        if (!v1Item && !v2Item) {
            throw new ApiError('Không tìm thấy hạng mục', 404);
        }

        const isV2 = !!v2Item;
        const v2OrderProduct = v2Item?.order_product ? (Array.isArray(v2Item.order_product) ? v2Item.order_product[0] : v2Item.order_product) : null;
        
        const orderId = isV2 ? v2OrderProduct?.order_id : v1Item!.order_id;
        const itemName = isV2 ? (v2Item.name || v2OrderProduct?.name) : v1Item!.item_name;

        // Append item name to reason to let the manager know which item needs extension
        const finalReason = `[${itemName || 'Linh kiện'}] ${reason}`;

        // Insert new request
        const { data, error } = await supabaseAdmin.from('order_extension_requests').insert({
            order_id: orderId,
            order_item_id: !isV2 ? id : null,
            order_product_service_id: isV2 ? id : null,
            reason: finalReason,
            new_due_at: new Date(new_due_at).toISOString(),
            status: 'requested',
            created_by: userId
        }).select().single();

        if (error) {
            throw new ApiError('Lỗi tạo yêu cầu gia hạn: ' + error.message, 500);
        }

        // Pause SLA: Set sla_paused_at cho tất cả steps liên quan
        const stepFilter = !isV2 
            ? { order_item_id: id }
            : { order_product_service_id: id };

        await supabaseAdmin
            .from('order_item_steps')
            .update({ sla_paused_at: new Date().toISOString() })
            .match(stepFilter)
            .is('sla_paused_at', null)
            .in('status', ['pending', 'assigned', 'in_progress']);

        // 🔔 WH4: Fire webhook — Kỹ thuật xin gia hạn (endpoint #2)
        const { data: orderForWh2 } = await supabaseAdmin.from('orders').select('order_code').eq('id', orderId).single();
        const { data: techUser2 } = await supabaseAdmin.from('users').select('name').eq('id', userId!).single();
        fireWebhook('extension.request.created', {
            order_code: orderForWh2?.order_code || 'N/A',
            technician_name: techUser2?.name || 'N/A',
            item_name: itemName,
            reason,
            new_due_at,
        });

        for (const manager of await getManagerRecipients()) {
            notifyCrmMasterUser('extension.request.created', {
                target_user_id: manager.id,
                target_role: manager.role || 'manager',
                channel: 'telegram',
                order: { id: orderId, order_code: orderForWh2?.order_code || null },
                item: { id, service_name: itemName, reason, deadline_at: new_due_at },
                reason,
                new_deadline: new_due_at,
                requester_id: userId || null,
            });
        }

        try {
            await supabaseAdmin.from('order_workflow_step_log').insert({
                entity_id: id,
                order_item_step_id: null,
                action: 'extension_requested',
                step_name: 'Xin gia hạn',
                notes: `${itemName}: ${reason}${new_due_at ? ' - Hạn mới: ' + new Date(new_due_at).toLocaleDateString('vi-VN') : ''}`,
                created_by: userId
            });
        } catch (logErr) {
            console.error('workflow log insert error:', logErr);
        }

        res.status(201).json({ status: 'success', data });
    } catch (e) {
        next(e);
    }
});

export default router;













