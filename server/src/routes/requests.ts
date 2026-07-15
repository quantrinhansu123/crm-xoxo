import { Router, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyViewAccess } from '../middleware/viewAccess.js';
import { ApiError } from '../middleware/errorHandler.js';
import { fireWebhook, notifyCrmMaster } from '../utils/webhookNotifier.js';
import { buildCrmOrderUrl, buildRequestWorkflowPayload, getManagerRecipients, notifyCrmMasterUser, resolveRequestNotificationContext } from '../utils/n8nCrmEvents.js';
import {
    logAccessoryStatusChange,
    logExtensionStatusChange,
    logPartnerStatusChange,
} from '../utils/workflowRequestLog.js';
import { assertManagerQueueApproval } from '../utils/approvalPermissions.js';
import {
    canAccessAnyViewFromProfile,
    canPerformViewActionFromProfile,
    getUserViewPermissionProfile,
} from '../utils/employeeViewPermissions.js';
import {
    findRequestRowForDelete,
    parseRequestLookupHints,
    type RequestLookupHints,
    type RequestLookupTable,
} from '../utils/requestRowLookup.js';

const router = Router();
console.log('🚀 Requests Router Loaded (delete-fix-v4)');

router.use(authenticate);

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

function buildRequestItemPayload(row: any, notes?: string | null) {
    return {
        id: row.id,
        order_item_id: row.order_item_id || null,
        order_product_id: row.order_product_id || null,
        order_product_service_id: row.order_product_service_id || null,
        status: row.status || null,
        note: notes ?? row.notes ?? null,
    };
}

async function notifyManagersAndActor(event: string, actor: any, row: any, extra: Record<string, any> = {}) {
    const recipients = await getManagerRecipients();
    if (actor?.id && !recipients.some((recipient) => recipient.id === actor.id)) {
        recipients.push(actor);
    }

    for (const recipient of recipients) {
        notifyCrmMasterUser(event, {
            target_user_id: recipient.id,
            target_role: recipient.role || 'manager',
            channel: 'telegram',
            item: buildRequestItemPayload(row, extra.notes),
            staff: actor ? { id: actor.id, name: actor.name, role: actor.role, telegram_chat_id: actor.telegram_chat_id || null } : null,
            links: row.metadata?.order_code ? { crm_url: buildCrmOrderUrl(row.metadata.order_code) } : null,
            ...extra,
        });
    }
}

const ACCESSORY_REQUIRED_FIELDS: Record<string, string[]> = {
    need_buy: ['photos_purchase', 'photos_transfer'],
    bought: ['tracking_number'],
    waiting_ship: ['shipping_cost', 'photos_arrival'],
    shipped: ['photos_item', 'photos_storage']
};

const ACCESSORY_ALLOWED_STATUSES = [
    'requested',
    'rejected',
    'need_buy',
    'bought',
    'waiting_ship',
    'shipped',
    'delivered_to_tech',
    'done',
] as const;

const ACCESSORY_FIELD_LABELS: Record<string, string> = {
    photos_purchase: 'Ảnh mua',
    photos_transfer: 'Ảnh ck',
    tracking_number: 'Mã vận đơn',
    shipping_cost: 'Phí ship',
    photos_arrival: 'Ảnh chụp lúc nhận hàng',
    photos_item: 'Ảnh chụp ảnh hàng',
    photos_storage: 'Ảnh chụp chỗ để'
};

const REQUEST_DELETE_FALLBACK_ROLES = ['admin', 'manager', 'sale', 'technician'];

async function assertCanDeleteRequest(req: AuthenticatedRequest) {
    if (!req.user) {
        throw new ApiError('Chưa đăng nhập', 401);
    }

    const role = (req.user.role || '').toLowerCase();
    const roleAllowed = REQUEST_DELETE_FALLBACK_ROLES.includes(role);
    const profile = await getUserViewPermissionProfile(req.user.id, req.user.role);
    const canRead = canAccessAnyViewFromProfile(profile, req.user.role, ['requests'], roleAllowed);

    if (!canRead) {
        throw new ApiError('Không có quyền truy cập màn hình này', 403);
    }

    const canDelete = canPerformViewActionFromProfile(
        profile,
        req.user.role,
        'requests',
        'delete',
        roleAllowed,
    );

    if (!canDelete) {
        throw new ApiError('Không có quyền thực hiện thao tác này', 403);
    }
}

async function resolveRequestRecordId(
    table: RequestLookupTable,
    rawId: string,
    hints?: RequestLookupHints,
): Promise<string | null> {
    const id = rawId.trim();
    if (!id) return null;

    const { data: directRows, error: directError } = await supabaseAdmin
        .from(table)
        .select('id')
        .eq('id', id)
        .limit(1);

    if (directError) {
        throw new ApiError(`Không thể xóa yêu cầu: ${directError.message}`, 500);
    }

    if (directRows?.[0]?.id) {
        return directRows[0].id;
    }

    const resolved = await findRequestRowForDelete(table, id, hints);
    return resolved?.id ?? null;
}

async function deleteRequestRow(
    table: RequestLookupTable,
    id: string,
    notFoundMessage: string,
    hints?: RequestLookupHints,
) {
    const resolvedId = await resolveRequestRecordId(table, id, hints);
    if (!resolvedId) {
        throw new ApiError(notFoundMessage, 404);
    }

    const { error: deleteError } = await supabaseAdmin.from(table).delete().eq('id', resolvedId);

    if (deleteError) {
        throw new ApiError(`Không thể xóa yêu cầu: ${deleteError.message}`, 500);
    }

    const { data: remaining, error: verifyError } = await supabaseAdmin
        .from(table)
        .select('id')
        .eq('id', resolvedId)
        .limit(1);

    if (verifyError) {
        throw new ApiError(`Không thể xóa yêu cầu: ${verifyError.message}`, 500);
    }
    if (remaining?.length) {
        throw new ApiError('Không thể xóa yêu cầu: bản ghi vẫn còn trong hệ thống', 500);
    }

    return { id: resolvedId };
}

router.patch('/accessories/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    console.log('📝 Handling PATCH /api/requests/accessories/' + req.params.id);
    try {
        const { id } = req.params;
        const { status, notes, metadata } = req.body;
        const userId = req.user?.id;

        const { data: current, error: fetchError } = await supabaseAdmin
            .from('order_item_accessories')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !current) {
            throw new ApiError('Không tìm thấy yêu cầu: ' + (fetchError?.message || ''), 404);
        }

        assertManagerQueueApproval(req, current.status, status);

        if (status && !(ACCESSORY_ALLOWED_STATUSES as readonly string[]).includes(status)) {
            throw new ApiError(
                `Trạng thái phụ kiện không hợp lệ: "${status}". Cho phép: ${ACCESSORY_ALLOWED_STATUSES.join(', ')}`,
                400,
            );
        }

        // Validate if changing status
        if (status && status !== current.status && status !== 'rejected' && status !== 'cancelled') {
            const required = ACCESSORY_REQUIRED_FIELDS[current.status];
            if (required) {
                const finalMeta = metadata || current.metadata || {};
                for (const field of required) {
                    const val = finalMeta[field];
                    if (!val || (Array.isArray(val) && val.length === 0)) {
                        const label = ACCESSORY_FIELD_LABELS[field] || field;
                        throw new ApiError(`Không thể chuyển trạng thái. Thiếu thông tin bắt buộc: ${label}`, 400);
                    }
                }
            }
        }

        const { data, error } = await supabaseAdmin
            .from('order_item_accessories')
            .update({
                status: status || undefined,
                notes: notes !== undefined ? notes : undefined,
                metadata: metadata || undefined,
                updated_by: userId,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            console.error('[requests] update accessory failed:', id, { status, error });
            throw new ApiError('Không thể cập nhật yêu cầu: ' + error.message, 500);
        }

        if (status && status !== current.status) {
            await logAccessoryStatusChange(
                {
                    order_item_id: current.order_item_id,
                    order_product_id: current.order_product_id,
                    order_product_service_id: current.order_product_service_id,
                },
                current.status,
                status,
                notes ?? current.notes,
                userId
            );
        }

        if (status && status !== current.status) {
            if (status === 'need_buy' || status === 'rejected') {
                await notifyWorkflowRequestEvent(status === 'need_buy' ? 'accessory.approved' : 'accessory.rejected', data, {
                    old_status: current.status,
                    new_status: status,
                    notes: notes || null,
                });
            }

            if (status === 'delivered_to_tech') {
                const technicianId = (metadata || current.metadata || {})?.technician_id;
                if (technicianId) {
                    notifyCrmMasterUser('accessory.status.changed', {
                        target_user_id: technicianId,
                        target_role: 'technician',
                        channel: 'telegram',
                        item: buildRequestItemPayload(data, notes || null),
                        accessory_id: id,
                        old_status: current.status,
                        new_status: status,
                        metadata: metadata || current.metadata || {},
                    });
                }
            }
        }

        res.json({ status: 'success', data });
    } catch (e) {
        next(e);
    }
});

router.patch('/partners/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { status, notes, metadata } = req.body;
        const userId = req.user?.id;

        const { data: current, error: fetchError } = await supabaseAdmin
            .from('order_item_partner')
            .select('id, status, notes, metadata, order_item_id, order_product_id, order_product_service_id')
            .eq('id', id)
            .single();

        if (fetchError || !current) {
            throw new ApiError('Không tìm thấy yêu cầu gửi đối tác', 404);
        }

        assertManagerQueueApproval(req, current.status, status);

        const { data, error } = await supabaseAdmin
            .from('order_item_partner')
            .update({
                status: status || undefined,
                notes: notes !== undefined ? notes : undefined,
                metadata: metadata || undefined,
                updated_by: userId,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            throw new ApiError('Không thể cập nhật yêu cầu đối tác: ' + error.message, 500);
        }

        if (status && status !== current.status) {
            await logPartnerStatusChange(
                {
                    order_item_id: current.order_item_id,
                    order_product_id: current.order_product_id,
                    order_product_service_id: current.order_product_service_id,
                },
                current.status,
                status,
                notes ?? current.notes,
                userId
            );
        }

        if (status && status !== current.status) {
            if (status === 'ship_to_partner' || status === 'rejected') {
                await notifyWorkflowRequestEvent(status === 'ship_to_partner' ? 'partner.approved' : 'partner.rejected', data, {
                    old_status: current.status,
                    new_status: status,
                    notes: notes || null,
                });
            }
        }

        res.json({ status: 'success', data });
    } catch (e) {
        next(e);
    }
});

router.delete('/accessories/:id', async (req: AuthenticatedRequest, res, next) => {
    try {
        await assertCanDeleteRequest(req);
        const { id } = req.params;
        const hints = parseRequestLookupHints(req.query as Record<string, unknown>);
        await deleteRequestRow('order_item_accessories', id, 'Không tìm thấy yêu cầu mua phụ kiện', hints);
        res.json({ status: 'success', message: 'Đã xóa yêu cầu mua phụ kiện' });
    } catch (e) {
        next(e);
    }
});

router.delete('/partners/:id', async (req: AuthenticatedRequest, res, next) => {
    try {
        await assertCanDeleteRequest(req);
        const { id } = req.params;
        const hints = parseRequestLookupHints(req.query as Record<string, unknown>);
        await deleteRequestRow('order_item_partner', id, 'Không tìm thấy yêu cầu gửi đối tác', hints);
        res.json({ status: 'success', message: 'Đã xóa yêu cầu gửi đối tác' });
    } catch (e) {
        next(e);
    }
});

router.get('/test', (req, res) => res.json({ status: 'ok', msg: 'Requests router is working' }));

router.use(
    requireAnyViewAccess(['requests', 'orders/upsell-tickets'], {
        fallbackRoles: ['admin', 'manager', 'sale', 'technician'],
    }),
);

// GET /api/requests/accessories - Danh sách yêu cầu Mua phụ kiện (V1 + V2)
router.get('/accessories', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('order_item_accessories')
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
            .order('created_at', { ascending: false });

        if (error) throw new ApiError('Không thể lấy danh sách yêu cầu mua phụ kiện', 500);

        res.json({ status: 'success', data: data || [] });
    } catch (e) {
        next(e);
    }
});

// GET /api/requests/partners - Danh sách yêu cầu Gửi Đối Tác (V1 + V2)
router.get('/partners', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('order_item_partner')
            .select(`
                *,
                order_item:order_items(
                    id, 
                    item_name, 
                    item_code, 
                    order:orders(id, order_code)
                ),
                technician:users(id, name),
                order_product:order_products(id, name, product_code, images, order:orders(id, order_code)),
                order_product_service:order_product_services(
                    id, 
                    order_product_id,
                    order_product:order_products(id, name, product_code, images, order:orders(id, order_code))
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw new ApiError('Không thể lấy danh sách yêu cầu gửi đối tác', 500);

        res.json({ status: 'success', data: data || [] });
    } catch (e) {
        next(e);
    }
});

// GET /api/requests/extensions - Danh sách yêu cầu Xin gia hạn
router.get('/extensions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('order_extension_requests')
            .select(`
                id,
                order_id,
                order_item_id,
                order_product_id,
                order_product_service_id,
                requested_by,
                reason,
                status,
                customer_result,
                new_due_at,
                valid_reason,
                kpi_impact,
                approved_by,
                approved_at,
                created_at,
                updated_at,
                order:orders(id, order_code, order_products(id, images)),
                order_item:order_items(id, item_name, item_code, product:products(id, image)),
                order_product:order_products(id, name, product_code, images),
                order_product_service:order_product_services(id, item_name, order_product:order_products(id, name, product_code, images))
            `)
            .order('created_at', { ascending: false });

        if (error) throw new ApiError('Không thể lấy danh sách yêu cầu gia hạn: ' + error.message, 500);

        res.json({ status: 'success', data: data || [] });
    } catch (e) {
        next(e);
    }
});

// PATCH /api/requests/extensions/:id - Cập nhật yêu cầu gia hạn cụ thể
router.patch('/extensions/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { status, customer_result, new_due_at, valid_reason, kpi_impact } = req.body;
        const userId = req.user?.id;

        const { data: current, error: fetchError } = await supabaseAdmin
            .from('order_extension_requests')
            .select('id, status, reason, order_id, requested_by, order_item_id, order_product_service_id')
            .eq('id', id)
            .single();

        if (fetchError || !current) {
            throw new ApiError('Không tìm thấy yêu cầu gia hạn', 404);
        }

        assertManagerQueueApproval(req, current.status, status);

        const updatePayload: Record<string, any> = {
            status: status || undefined,
            customer_result: customer_result !== undefined ? customer_result : undefined,
            new_due_at: new_due_at || undefined,
            valid_reason: typeof valid_reason === 'boolean' ? valid_reason : undefined,
            kpi_impact: typeof kpi_impact === 'boolean' ? kpi_impact : undefined,
            updated_at: new Date().toISOString()
        };

        // Set approved_by/approved_at when manager approves (both KPI paths)
        if (status === 'manager_approved' && userId) {
            updatePayload.approved_by = userId;
            updatePayload.approved_at = new Date().toISOString();
        }

        const { data, error } = await supabaseAdmin
            .from('order_extension_requests')
            .update(updatePayload)
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            throw new ApiError('Không thể cập nhật yêu cầu gia hạn: ' + error.message, 500);
        }

        if (status && status !== current.status) {
            const noteText =
                customer_result ||
                (status === 'rejected' ? 'QL từ chối yêu cầu gia hạn' : 'QL đã xử lý yêu cầu gia hạn');
            await logExtensionStatusChange(
                {
                    order_item_id: current.order_item_id,
                    order_product_service_id: current.order_product_service_id,
                },
                current.status,
                status,
                noteText,
                userId
            );
        }

        // When extension approved, propagate new_due_at to orders.due_at and respective item/product
        if (data && new_due_at && status && !['rejected', 'declined'].includes(status)) {
            const orderId = data.order_id;
            if (orderId) {
                await supabaseAdmin
                    .from('orders')
                    .update({ due_at: new_due_at })
                    .eq('id', orderId);
            }
            // Propagate due_at to order_items or order_products
            if (data.order_item_id) {
                await supabaseAdmin
                    .from('order_items')
                    .update({ due_at: new_due_at })
                    .eq('id', data.order_item_id);
            } else if (data.order_product_service_id) {
                const { data: svc } = await supabaseAdmin
                    .from('order_product_services')
                    .select('order_product_id')
                    .eq('id', data.order_product_service_id)
                    .single();
                if (svc?.order_product_id) {
                    await supabaseAdmin
                        .from('order_products')
                        .update({ due_at: new_due_at })
                        .eq('id', svc.order_product_id);
                }
            }
        }

        // Resume SLA khi extension được xử lý xong
        if (data && status && (status === 'notified_tech' || status === 'rejected')) {
            const itemId = data.order_item_id || data.order_product_service_id;
            if (itemId) {
                const stepFilter = data.order_item_id 
                    ? { order_item_id: itemId }
                    : { order_product_service_id: itemId };
                
                // Fetch steps đang pause
                const { data: pausedSteps } = await supabaseAdmin
                    .from('order_item_steps')
                    .select('id, sla_paused_at, sla_total_paused_minutes')
                    .match(stepFilter)
                    .not('sla_paused_at', 'is', null);
                
                if (pausedSteps && pausedSteps.length > 0) {
                    const now = new Date();
                    for (const step of pausedSteps) {
                        if (!step.sla_paused_at) continue;
                        const pausedAt = new Date(step.sla_paused_at);
                        const pausedMinutes = Math.round((now.getTime() - pausedAt.getTime()) / 60000);
                        
                        await supabaseAdmin
                            .from('order_item_steps')
                            .update({
                                sla_paused_at: null,
                                sla_total_paused_minutes: (step.sla_total_paused_minutes || 0) + Math.max(0, pausedMinutes)
                            })
                            .eq('id', step.id);
                    }
                }
            }
        }

        // 🔔 WH5: Fire webhook — Gia hạn (status change)
        if (status) {
            fireWebhook('extension.status.changed', {
                extension_id: id,
                new_status: status,
                customer_result: customer_result || null,
                kpi_impact: typeof kpi_impact === 'boolean' ? kpi_impact : null,
            });
        }

        if (status === 'manager_approved' && data?.requested_by) {
            notifyCrmMasterUser('extension.approved', {
                target_user_id: data.requested_by,
                target_role: 'sale',
                channel: 'telegram',
                order: { id: data.order_id },
                new_deadline: data.new_due_at || new_due_at || null,
                approver_id: userId || null,
                extension_id: id,
            });
        }

        if (status === 'rejected' && data?.requested_by) {
            notifyCrmMasterUser('extension.rejected', {
                target_user_id: data.requested_by,
                target_role: 'sale',
                channel: 'telegram',
                order: { id: data.order_id },
                customer_result: customer_result || null,
                approver_id: userId || null,
                extension_id: id,
            });
        }

        res.json({ status: 'success', data });
    } catch (e) {
        next(e);
    }
});

router.delete('/extensions/:id', async (req: AuthenticatedRequest, res, next) => {
    try {
        await assertCanDeleteRequest(req);
        const { id } = req.params;
        const hints = parseRequestLookupHints(req.query as Record<string, unknown>);
        await deleteRequestRow('order_extension_requests', id, 'Không tìm thấy yêu cầu gia hạn', hints);
        res.json({ status: 'success', message: 'Đã xóa yêu cầu gia hạn' });
    } catch (e) {
        next(e);
    }
});

export const requestsRouter = router;
