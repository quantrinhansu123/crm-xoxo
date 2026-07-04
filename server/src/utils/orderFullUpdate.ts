import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { syncInvoiceWithOrder } from './billingHelper.js';

export interface FullOrderUpdatePayload {
    customer_id: string;
    customer_items?: any[];
    sale_items?: any[];
    notes?: string;
    discount?: number;
    discount_type?: string;
    discount_value?: number;
    surcharges?: any[];
    paid_amount?: number;
    payment_method?: string;
}

const ORDER_DEPOSIT_TRANSACTION_NOTE_PREFIX = 'Phiếu thu cọc đơn hàng';
const LEGACY_ORDER_DEPOSIT_NOTE_MARKERS = [
    ORDER_DEPOSIT_TRANSACTION_NOTE_PREFIX,
    'Thanh toán tại chỗ khi tạo đơn',
    'Thanh toán khi cập nhật đơn',
];

async function syncOrderPaymentTransaction(order: any, paidAmountValue: number, paymentMethod: string | undefined, userId: string) {
    const { data: orderTransactions } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, payment_method, status, notes, created_at')
        .eq('order_id', order.id)
        .eq('type', 'income')
        .eq('category', 'Thanh toán đơn hàng')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true })
        .limit(50);

    const existingTransaction = (orderTransactions || []).find((transaction: any) => {
        const notes = String(transaction?.notes || '');
        return LEGACY_ORDER_DEPOSIT_NOTE_MARKERS.some(marker => notes.includes(marker));
    });

    if (paidAmountValue <= 0) {
        if (existingTransaction) {
            const { error } = await supabaseAdmin
                .from('transactions')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existingTransaction.id);
            if (error) console.error('[OrderUpdateFull] Transaction cancellation failed:', error);
        }
        return;
    }

    const transactionPayload = {
        amount: paidAmountValue,
        payment_method: paymentMethod || existingTransaction?.payment_method || 'cash',
        notes: `${ORDER_DEPOSIT_TRANSACTION_NOTE_PREFIX} - ${order.order_code}`,
        updated_at: new Date().toISOString(),
    };

    if (existingTransaction) {
        const { error } = await supabaseAdmin
            .from('transactions')
            .update(transactionPayload)
            .eq('id', existingTransaction.id);
        if (error) console.error('[OrderUpdateFull] Transaction update failed:', error);
        return;
    }

    const { data: lastTrans } = await supabaseAdmin
        .from('transactions')
        .select('code')
        .like('code', 'PT%')
        .order('created_at', { ascending: false })
        .limit(1);
    let tCodeValue = 'PT000001';
    if (lastTrans && lastTrans.length > 0) {
        const lNum = parseInt(lastTrans[0].code.replace('PT', ''), 10);
        tCodeValue = `PT${String(lNum + 1).padStart(6, '0')}`;
    }

    const { error } = await supabaseAdmin.from('transactions').insert({
        code: tCodeValue,
        type: 'income',
        category: 'Thanh toán đơn hàng',
        amount: paidAmountValue,
        payment_method: paymentMethod || 'cash',
        notes: `${ORDER_DEPOSIT_TRANSACTION_NOTE_PREFIX} - ${order.order_code}`,
        date: new Date().toISOString().split('T')[0],
        order_id: order.id,
        order_code: order.order_code,
        status: 'approved',
        created_by: userId,
        approved_by: userId,
        approved_at: new Date().toISOString(),
    });
    if (error) console.error('[OrderUpdateFull] Transaction recording failed:', error);
}

export async function applyFullOrderUpdate(orderId: string, payload: FullOrderUpdatePayload, userId: string) {
    const { customer_id, customer_items, sale_items, notes, discount, discount_type, discount_value, surcharges, paid_amount, payment_method } = payload;

    const { data: existingOrder } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

    if (!existingOrder) {
        throw new ApiError('Không tìm thấy đơn hàng', 404);
    }

    const { data: oldItems } = await supabaseAdmin
        .from('order_items')
        .select('product_id, quantity, item_type')
        .eq('order_id', orderId);

    let subtotal = 0;
    if (customer_items && Array.isArray(customer_items)) {
        for (const item of customer_items) {
            if (item.services && Array.isArray(item.services)) {
                for (const svc of item.services) {
                    subtotal += Number(svc.price) || 0;
                }
            }
            subtotal += Number(item.surcharge_amount) || 0;
        }
    }
    if (sale_items && Array.isArray(sale_items)) {
        for (const item of sale_items) {
            subtotal += (Number(item.quantity) || 1) * (Number(item.unit_price) || 0);
            subtotal += Number(item.surcharge_amount) || 0;
        }
    }

    const discountAmount = Number(discount) || 0;
    const topLevelSurchargeAmount = Array.isArray(surcharges)
        ? surcharges.reduce((sum: number, surcharge: any) => sum + (Number(surcharge?.amount) || 0), 0)
        : 0;
    const paidAmountValue = Number(paid_amount) || 0;
    const totalAmount = Math.max(0, subtotal - discountAmount + topLevelSurchargeAmount);
    const remainingDebt = Math.max(0, totalAmount - paidAmountValue);

    const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .update({
            customer_id,
            subtotal,
            discount: discountAmount,
            discount_type,
            discount_value,
            total_amount: totalAmount,
            notes,
            paid_amount: paidAmountValue,
            remaining_debt: remainingDebt,
            payment_status: remainingDebt <= 0 ? 'paid' : (paidAmountValue > 0 ? 'partial' : 'unpaid'),
            surcharges: surcharges || [],
            surcharges_amount: topLevelSurchargeAmount,
            updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .select()
        .single();

    if (orderError || !order) {
        throw new ApiError('Lỗi khi cập nhật đơn hàng: ' + (orderError?.message || ''), 500);
    }

    if (oldItems) {
        for (const item of oldItems) {
            if (item.product_id && item.item_type === 'product') {
                try {
                    const { data: prod } = await supabaseAdmin.from('products').select('stock').eq('id', item.product_id).single();
                    if (prod) {
                        const newStock = (prod.stock || 0) + (Number(item.quantity) || 0);
                        await supabaseAdmin.from('products').update({ stock: newStock }).eq('id', item.product_id);
                    }
                } catch (err) {
                    console.error('Error restoring stock during update:', err);
                }
            }
        }
    }

    const { data: oldProducts } = await supabaseAdmin.from('order_products').select('id').eq('order_id', orderId);
    if (oldProducts && oldProducts.length > 0) {
        const productIds = oldProducts.map(p => p.id);
        const { data: oldSvcs } = await supabaseAdmin.from('order_product_services').select('id').in('order_product_id', productIds);
        if (oldSvcs && oldSvcs.length > 0) {
            const svcIds = oldSvcs.map(s => s.id);
            await supabaseAdmin.from('order_product_service_technicians').delete().in('order_product_service_id', svcIds);
            await supabaseAdmin.from('order_item_steps').delete().in('order_product_service_id', svcIds);
            await supabaseAdmin.from('order_product_services').delete().in('id', svcIds);
        }
        await supabaseAdmin.from('order_products').delete().eq('order_id', orderId);
    }
    await supabaseAdmin.from('order_items').delete().eq('order_id', orderId);

    if (customer_items && Array.isArray(customer_items)) {
        const orderCode = order.order_code;
        for (let i = 0; i < customer_items.length; i++) {
            const item = customer_items[i];
            const productCode = `${orderCode}-${i + 1}`;

            const { data: orderProduct, error: pError } = await supabaseAdmin
                .from('order_products')
                .insert({
                    order_id: orderId,
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
                    due_at: item.due_at || null,
                    status: 'pending',
                    surcharges: item.surcharges || [],
                    surcharge_amount: Number(item.surcharge_amount) || 0
                })
                .select()
                .single();

            if (pError || !orderProduct) continue;

            if (item.services && Array.isArray(item.services)) {
                for (const svc of item.services) {
                    const hasTechs = svc.technicians && svc.technicians.length > 0;
                    const techId = hasTechs ? svc.technicians[0].technician_id : null;

                    const { data: createdSvc, error: sError } = await supabaseAdmin
                        .from('order_product_services')
                        .insert({
                            order_product_id: orderProduct.id,
                            service_id: svc.type === 'service' ? svc.id : null,
                            package_id: svc.type === 'package' ? svc.id : null,
                            item_name: svc.name,
                            item_type: svc.type,
                            unit_price: Number(svc.price) || 0,
                            deposit_amount: Math.max(0, Number(svc.deposit_amount) || 0),
                            technician_id: techId,
                            status: hasTechs ? 'assigned' : 'pending',
                            assigned_at: hasTechs ? new Date().toISOString() : null,
                        })
                        .select()
                        .single();

                    if (!sError && createdSvc) {
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

                        const hasSales = svc.sales && svc.sales.length > 0;
                        if (hasSales) {
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

    if (sale_items && Array.isArray(sale_items) && sale_items.length > 0) {
        const saleItemsPayload = sale_items.map(a => ({
            order_id: orderId,
            product_id: a.product_id,
            item_type: 'product',
            item_name: a.name,
            quantity: Number(a.quantity) || 1,
            unit_price: Number(a.unit_price) || 0,
            total_price: (Number(a.quantity) || 1) * (Number(a.unit_price) || 0),
            item_code: a.item_code || `IT${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
            surcharges: a.surcharges || [],
            surcharge_amount: Number(a.surcharge_amount) || 0,
            current_phase: 'sales',
            phase_stage: 'step1'
        }));
        const { data: createdItems, error: itemsError } = await supabaseAdmin.from('order_items').insert(saleItemsPayload).select();

        if (!itemsError && createdItems) {
            const saleItemAssignments: any[] = [];
            for (let idx = 0; idx < createdItems.length; idx++) {
                const createdItem = createdItems[idx];
                const originalItem = sale_items[idx];
                const sales = originalItem.sales || [];
                for (const s of sales) {
                    saleItemAssignments.push({
                        order_item_id: createdItem.id,
                        sale_id: s.sale_id || s.id,
                        commission: s.commission || 0,
                        assigned_by: userId,
                        assigned_at: new Date().toISOString()
                    });
                }

                if (createdItem.product_id && createdItem.item_type === 'product') {
                    try {
                        const { data: prod } = await supabaseAdmin.from('products').select('stock').eq('id', createdItem.product_id).single();
                        if (prod) {
                            const newStock = Math.max(0, (prod.stock || 0) - (Number(createdItem.quantity) || 0));
                            await supabaseAdmin.from('products').update({ stock: newStock }).eq('id', createdItem.product_id);
                        }
                    } catch (err) {
                        console.error('Error deducting stock during update:', err);
                    }
                }
            }
            if (saleItemAssignments.length > 0) {
                await supabaseAdmin.from('order_item_sales').insert(saleItemAssignments);
            }
        }
    }

    await syncOrderPaymentTransaction(order, paidAmountValue, payment_method, userId);

    syncInvoiceWithOrder(orderId, payment_method).catch(err => console.error('[OrderUpdate] Failed to sync invoice:', err));

    const { data: updatedOrder } = await supabaseAdmin
        .from('orders')
        .select(`
            *,
            customer:customers(id, name, phone, email),
            sales_user:users!orders_sales_id_fkey(id, name),
            items:order_items(
                id, order_id, product_id, service_id, item_type, item_name, quantity, unit_price, total_price,
                sales:order_item_sales(
                    id, sale_id, commission, assigned_at,
                    sale:users!order_item_sales_sale_id_fkey(id, name, avatar)
                )
            )
        `)
        .eq('id', orderId)
        .single();

    return updatedOrder;
}
