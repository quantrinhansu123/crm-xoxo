import { Router, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';
import { requireViewAccess } from '../middleware/viewAccess.js';
import { ApiError } from '../middleware/errorHandler.js';
import { fireWebhook } from '../utils/webhookNotifier.js';
import { applyFullOrderUpdate } from '../utils/orderFullUpdate.js';
import { notifyCrmMasterUser } from '../utils/n8nCrmEvents.js';

const router = Router();

const UPSELL_VIEW = 'orders/upsell-tickets';

router.use(authenticate);

// GET /api/upsell-tickets - List tickets
router.get('/', requireViewAccess(UPSELL_VIEW, { fallbackRoles: ['admin', 'manager'] }), requireManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('upsell_tickets')
            .select(`
                *,
                order:orders(id, order_code),
                sales_user:users!upsell_tickets_sales_id_fkey(id, name),
                customer:customers(id, name, phone)
            `)
            .order('created_at', { ascending: false });

        if (error) throw new ApiError('Không thể lấy danh sách ticket', 500);

        res.json({ status: 'success', data: data || [] });
    } catch (e) {
        next(e);
    }
});

// POST /api/upsell-tickets/:id/approve - Approve ticket
router.post(
    '/:id/approve',
    requireViewAccess(UPSELL_VIEW, { fallbackRoles: ['admin', 'manager'], requireAction: 'edit' }),
    requireManager,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id: ticketId } = req.params;
        const userId = req.user!.id;

        // 1. Fetch Ticket
        const { data: ticket, error: ticketFetchError } = await supabaseAdmin
            .from('upsell_tickets')
            .select('*')
            .eq('id', ticketId)
            .single();

        if (ticketFetchError || !ticket) {
            throw new ApiError('Không tìm thấy ticket', 404);
        }

        if (ticket.status !== 'pending') {
            throw new ApiError('Ticket này đã được xử lý', 400);
        }

        const { order_id: id, data: upsellData } = ticket;
        const ticketType = (
            upsellData?.request_type ||
            upsellData?.ticket_type ||
            upsellData?.flow_type ||
            ''
        ).toLowerCase();
        const isOrderEditTicket = ['order_edit', 'edit_order', 'order_update'].includes(ticketType);
        const { customer_items, sale_items } = upsellData;

        if (isOrderEditTicket) {
            const { data: orderForEvent } = await supabaseAdmin
                .from('orders')
                .select('id, order_code, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id)')
                .eq('id', id)
                .maybeSingle();

            const updatePayload = upsellData?.update_payload;
            if (!updatePayload || typeof updatePayload !== 'object') {
                throw new ApiError('Ticket sửa đơn không có dữ liệu cập nhật hợp lệ', 400);
            }

            await applyFullOrderUpdate(id, updatePayload, userId);

            await supabaseAdmin
                .from('upsell_tickets')
                .update({
                    status: 'approved',
                    approved_by: userId,
                    approved_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', ticketId);

            notifyCrmMasterUser('order_edit.approved', {
                target_user_id: ticket.sales_id,
                target_role: 'sale',
                channel: 'telegram',
                order: { id, order_code: orderForEvent?.order_code || null },
                customer: orderForEvent?.customer || null,
                approver_id: userId,
                ticket_id: ticketId,
            });

            res.json({
                status: 'success',
                message: 'Đã duyệt yêu cầu sửa đơn và cập nhật đơn hàng.'
            });
            return;
        }

        // 2. Fetch Order
        const { data: order, error: orderFetchError } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('id', id)
            .single();

        if (orderFetchError || !order) {
            throw new ApiError('Không tìm thấy đơn hàng liên quan', 404);
        }

        if (order.status === 'cancelled') {
            throw new ApiError('Không thể upsell trên đơn hàng đã hủy', 400);
        }

        let totalIncrement = 0;

        // 3. Process Customer Items
        if (customer_items && Array.isArray(customer_items) && customer_items.length > 0) {
            const { count } = await supabaseAdmin
                .from('order_products')
                .select('*', { count: 'exact', head: true })
                .eq('order_id', id);

            let productIdx = (count || 0) + 1;

            for (const item of customer_items) {
                let orderProduct;
                if (item.order_product_id) {
                    const { data: existingProduct } = await supabaseAdmin
                        .from('order_products')
                        .select('*')
                        .eq('id', item.order_product_id)
                        .single();
                    orderProduct = existingProduct;
                } else {
                    const productCode = `${order.order_code}-${productIdx++}`;
                    const { data: newProduct } = await supabaseAdmin
                        .from('order_products')
                        .insert({
                            order_id: id,
                            product_code: productCode,
                            name: item.name,
                            type: item.type,
                            brand: item.brand,
                            color: item.color,
                            size: item.size,
                            material: item.material,
                            condition_before: item.condition_before,
                            images: item.images || [],
                            notes: item.notes,
                            status: 'pending'
                        })
                        .select()
                        .single();
                    orderProduct = newProduct;
                }

                if (orderProduct && item.services && Array.isArray(item.services)) {
                    for (const svc of item.services) {
                        const newPrice = Number(svc.price) || 0;

                        if (svc.id && svc.is_existing) {
                            // Update existing service price
                            const { data: oldSvc } = await supabaseAdmin
                                .from('order_product_services')
                                .select('unit_price')
                                .eq('id', svc.id)
                                .single();

                            if (oldSvc) {
                                totalIncrement += (newPrice - Number(oldSvc.unit_price || 0));
                                await supabaseAdmin
                                    .from('order_product_services')
                                    .update({ unit_price: newPrice })
                                    .eq('id', svc.id);
                            }
                        } else {
                            // Insert new service
                            totalIncrement += newPrice;

                            const hasTechs = svc.technicians && svc.technicians.length > 0;
                            const techId = hasTechs ? svc.technicians[0].technician_id : null;

                            const { data: createdSvc } = await supabaseAdmin
                                .from('order_product_services')
                                .insert({
                                    order_product_id: orderProduct.id,
                                    service_id: svc.type === 'service' ? svc.id : null,
                                    package_id: svc.type === 'package' ? svc.id : null,
                                    item_name: svc.name,
                                    item_type: svc.type,
                                    unit_price: newPrice,
                                    technician_id: techId,
                                    status: hasTechs ? 'assigned' : 'pending',
                                    assigned_at: hasTechs ? new Date().toISOString() : null,
                                })
                                .select()
                                .single();

                            if (createdSvc) {
                                if (hasTechs) {
                                    const techPayload = svc.technicians.map((t: any) => ({
                                        order_product_service_id: createdSvc.id,
                                        technician_id: t.technician_id,
                                        commission: t.commission || 0,
                                        assigned_by: userId,
                                        assigned_at: new Date().toISOString(),
                                        status: 'assigned'
                                    }));
                                    await supabaseAdmin.from('order_product_service_technicians').insert(techPayload);
                                }
                                if (svc.sales && svc.sales.length > 0) {
                                    const salePayload = svc.sales.map((s: any) => ({
                                        order_product_service_id: createdSvc.id,
                                        sale_id: s.sale_id || s.id,
                                        commission: s.commission || 0,
                                        assigned_by: userId,
                                        assigned_at: new Date().toISOString()
                                    }));
                                    await supabaseAdmin.from('order_product_service_sales').insert(salePayload);
                                }
                                if (svc.type === 'service' && svc.id) {
                                    const { data: sData } = await supabaseAdmin.from('services').select('workflow_id').eq('id', svc.id).single();
                                    if (sData?.workflow_id) {
                                        const { data: wSteps } = await supabaseAdmin.from('workflow_steps').select('*').eq('workflow_id', sData.workflow_id).order('step_order', { ascending: true });
                                        if (wSteps) {
                                            const itemSteps = wSteps.map(ws => ({
                                                order_product_service_id: createdSvc.id,
                                                workflow_step_id: ws.id,
                                                step_order: ws.step_order,
                                                step_name: ws.name || `Bước ${ws.step_order}`,
                                                department_id: ws.department_id,
                                                status: 'pending',
                                                estimated_duration: ws.estimated_duration
                                            }));
                                            await supabaseAdmin.from('order_item_steps').insert(itemSteps);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. Process Sale Items
        if (sale_items && Array.isArray(sale_items) && sale_items.length > 0) {
            const baseTime = Date.now().toString().slice(-8);
            for (let idxValue = 0; idxValue < sale_items.length; idxValue++) {
                const itemValue = sale_items[idxValue];
                const qValue = Math.max(1, Number(itemValue.quantity) || 1);
                const pValue = Number(itemValue.unit_price || itemValue.price) || 0;
                const totalValue = pValue * qValue;
                const productId = itemValue.product_id || itemValue.id;

                if (itemValue.id && itemValue.is_existing) {
                    // Update existing retail item
                    const { data: oldItem } = await supabaseAdmin
                        .from('order_items')
                        .select('total_price, quantity')
                        .eq('id', itemValue.id)
                        .single();

                    if (oldItem) {
                        totalIncrement += (totalValue - Number(oldItem.total_price || 0));

                        // Handle stock if quantity changed
                        if (productId && qValue !== Number(oldItem.quantity)) {
                            const diff = qValue - Number(oldItem.quantity);
                            const { data: currentProd } = await supabaseAdmin.from('products').select('stock').eq('id', productId).single();
                            if (currentProd) {
                                await supabaseAdmin.from('products').update({ stock: (currentProd.stock || 0) - diff }).eq('id', productId);
                            }
                        }

                        await supabaseAdmin.from('order_items').update({
                            quantity: qValue,
                            unit_price: pValue,
                            total_price: totalValue,
                            updated_at: new Date().toISOString()
                        }).eq('id', itemValue.id);
                    }
                } else {
                    // New retail item
                    totalIncrement += totalValue;

                    let targetItemId: string | null = null;
                    if (productId) {
                        const { data: existingItem } = await supabaseAdmin
                            .from('order_items')
                            .select('id, quantity, total_price')
                            .eq('order_id', id)
                            .eq('product_id', productId)
                            .eq('unit_price', pValue)
                            .eq('status', 'pending')
                            .maybeSingle();

                        if (existingItem) {
                            targetItemId = existingItem.id;
                            const newQty = (Number(existingItem.quantity) || 0) + qValue;
                            const newTotal = (Number(existingItem.total_price) || 0) + totalValue;
                            await supabaseAdmin.from('order_items').update({
                                quantity: newQty,
                                total_price: newTotal,
                                updated_at: new Date().toISOString()
                            }).eq('id', targetItemId);
                        }
                    }

                    if (!targetItemId) {
                        const { data: newItem } = await supabaseAdmin
                            .from('order_items')
                            .insert({
                                order_id: id,
                                product_id: productId || null,
                                item_type: 'product',
                                item_name: itemValue.name || 'Sản phẩm upsell',
                                quantity: qValue,
                                unit_price: pValue,
                                total_price: totalValue,
                                item_code: `UP${baseTime}${idxValue.toString().padStart(2, '0')}`,
                                status: 'pending'
                            })
                            .select()
                            .single();
                        if (newItem) targetItemId = newItem.id;
                    }

                    if (targetItemId) {
                        const sales = itemValue.sales || [];
                        if (sales.length > 0) {
                            const saleItemAssignments = sales.map((s: any) => ({
                                order_item_id: targetItemId,
                                sale_id: s.sale_id || s.id,
                                commission: s.commission || 0,
                                assigned_by: userId,
                                assigned_at: new Date().toISOString()
                            }));
                            await supabaseAdmin.from('order_item_sales').insert(saleItemAssignments);
                        }
                    }

                    if (productId) {
                        try {
                            const { data: currentProd } = await supabaseAdmin.from('products').select('stock').eq('id', productId).single();
                            if (currentProd) {
                                const newStock = Math.max(0, (currentProd.stock || 0) - qValue);
                                await supabaseAdmin.from('products').update({ stock: newStock }).eq('id', productId);
                            }
                        } catch (err) { console.error('Stock decrement error:', err); }
                    }
                }
            }
        }

        // 5. Update Order Totals
        const updatedSubtotal = (Number(order.subtotal) || 0) + totalIncrement;
        const updatedTotalAmount = (Number(order.total_amount) || 0) + totalIncrement;
        const updatedRemainingDebt = (Number(order.remaining_debt) || 0) + totalIncrement;

        await supabaseAdmin
            .from('orders')
            .update({
                subtotal: updatedSubtotal,
                total_amount: updatedTotalAmount,
                remaining_debt: updatedRemainingDebt,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        // 6. Update Ticket Status
        await supabaseAdmin
            .from('upsell_tickets')
            .update({
                status: 'approved',
                approved_by: userId,
                approved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                total_amount: totalIncrement // Update the actual total amount approved
            })
            .eq('id', ticketId);

        // 🔔 WH2: Fire webhook — Duyệt Upsell thành công
        const { data: saleUser } = await supabaseAdmin.from('users').select('name').eq('id', ticket.sales_id).single();
        fireWebhook('upsell.approved', {
            order_code: order.order_code,
            sale_name: saleUser?.name || 'N/A',
            service_name: (customer_items || []).map((i: any) => i.name).concat((sale_items || []).map((i: any) => i.name)).join(', ') || 'Upsell',
            amount: totalIncrement,
        });

        notifyCrmMasterUser('upsell.approved', {
            target_user_id: ticket.sales_id,
            target_role: 'sale',
            channel: 'telegram',
            order: { id, order_code: order.order_code },
            approver_id: userId,
            ticket_id: ticketId,
        });

        res.json({
            status: 'success',
            message: `Đã duyệt và cập nhật thành công ${totalIncrement.toLocaleString()}đ vào đơn hàng.`
        });

    } catch (error) {
        next(error);
    }
});

// POST /api/upsell-tickets/:id/reject - Reject ticket
router.post(
    '/:id/reject',
    requireViewAccess(UPSELL_VIEW, { fallbackRoles: ['admin', 'manager'], requireAction: 'edit' }),
    requireManager,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { reason } = req.body || {};
        const { data: ticket } = await supabaseAdmin
            .from('upsell_tickets')
            .select('id, order_id, sales_id, data')
            .eq('id', id)
            .maybeSingle();

        const { error } = await supabaseAdmin
            .from('upsell_tickets')
            .update({
                status: 'rejected',
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw new ApiError('Không thể từ chối ticket', 500);

        if (ticket?.sales_id) {
            const ticketType = String(ticket?.data?.request_type || ticket?.data?.ticket_type || ticket?.data?.flow_type || '').toLowerCase();
            const eventName = ['order_edit', 'edit_order', 'order_update'].includes(ticketType)
                ? 'order_edit.rejected'
                : 'upsell.rejected';

            notifyCrmMasterUser(eventName, {
                target_user_id: ticket.sales_id,
                target_role: 'sale',
                channel: 'telegram',
                order: { id: ticket.order_id },
                reason: reason || null,
                ticket_id: ticket.id,
            });
        }

        res.json({ status: 'success', message: 'Đã từ chối yêu cầu upsell' });
    } catch (e) {
        next(e);
    }
});

export const upsellTicketsRouter = router;
