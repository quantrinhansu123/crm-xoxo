import { supabaseAdmin } from '../config/supabase.js';
import { syncOrderPayment } from './orderHelper.js';

/**
 * Automatically creates a draft or paid invoice for a newly created order.
 */
export async function autoCreateInvoice(orderId: string, paymentMethod?: string): Promise<void> {
    try {
        console.log(`[BillingHelper] Auto-creating invoice for order: ${orderId}`);

        // 1. Fetch Order details
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, customer_id, subtotal, discount, total_amount, paid_amount, payment_status, order_code, created_by')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            console.error('[BillingHelper] Order not found for auto-invoice:', orderError);
            return;
        }

        // 2. Fetch all Order Items (sale items)
        const { data: saleItems } = await supabaseAdmin
            .from('order_items')
            .select('id')
            .eq('order_id', orderId);

        // 3. Fetch all Order Products
        const { data: orderProducts } = await supabaseAdmin
            .from('order_products')
            .select('id')
            .eq('order_id', orderId);

        // 4. Fetch all Services for those products
        const productIds = orderProducts?.map(p => p.id) || [];
        let orderProductServiceIds: string[] = [];
        
        if (productIds.length > 0) {
            const { data: services } = await supabaseAdmin
                .from('order_product_services')
                .select('id')
                .in('order_product_id', productIds);
            
            if (services) {
                orderProductServiceIds = services.map(s => s.id);
            }
        }

        const orderItemIds = saleItems?.map(i => i.id) || [];

        console.log(`[BillingHelper] Found ${orderItemIds.length} items and ${orderProductServiceIds.length} services to link for order ${order.order_code}`);

        // 5. Generate Invoice Code
        const invoiceCode = `HD${Date.now().toString().slice(-8)}`;

        // Check if fully paid
        const isPaid = order.payment_status === 'paid' || (Number(order.paid_amount) >= Number(order.total_amount) && Number(order.total_amount) > 0);

        // 6. Create Invoice
        const { data: invoice, error: invError } = await supabaseAdmin
            .from('invoices')
            .insert({
                invoice_code: invoiceCode,
                order_id: order.id,
                customer_id: order.customer_id,
                subtotal: Number(order.subtotal) || 0,
                discount: Number(order.discount) || 0,
                total_amount: Number(order.total_amount) || 0,
                payment_method: paymentMethod || 'cash',
                status: isPaid ? 'paid' : 'draft',
                paid_at: isPaid ? new Date().toISOString() : null,
                notes: 'Tự động tạo từ đơn hàng',
                order_item_ids: orderItemIds,
                order_product_service_ids: orderProductServiceIds,
                created_by: order.created_by
            })
            .select()
            .single();

        if (invError) {
            console.error('[BillingHelper] Error creating auto-invoice:', invError);
        } else {
            console.log(`[BillingHelper] Successfully created ${isPaid ? 'PAID' : 'draft'} invoice ${invoiceCode} for order ${order.order_code}`);
            
            // 7. If paid, mark items as paid
            if (isPaid) {
                if (orderItemIds.length > 0) {
                    await supabaseAdmin
                        .from('order_items')
                        .update({ payment_status: 'paid' })
                        .in('id', orderItemIds);
                }
                if (orderProductServiceIds.length > 0) {
                    await supabaseAdmin
                        .from('order_product_services')
                        .update({ payment_status: 'paid' })
                        .in('id', orderProductServiceIds);
                }
            }
        }
    } catch (error) {
        console.error('[BillingHelper] Unexpected error in autoCreateInvoice:', error);
    }
}

/**
 * Processes payment for an invoice: 
 * - Creates an income transaction (Phiếu Thu)
 * - Marks associated items as paid
 * - Syncs order payment status
 */
export async function processInvoicePayment(invoiceId: string): Promise<void> {
    try {
        console.log(`[BillingHelper] Processing payment for invoice: ${invoiceId}`);

        // 1. Fetch Invoice details with items
        const { data: invoice, error: invError } = await supabaseAdmin
            .from('invoices')
            .select('*')
            .eq('id', invoiceId)
            .single();

        if (invError || !invoice) {
            console.error('[BillingHelper] Invoice not found:', invError);
            return;
        }

        const { order_id, total_amount, payment_method, order_item_ids, order_product_service_ids, customer_id } = invoice;

        // 1b. Fetch Order to get current debt
        const { data: order } = await supabaseAdmin
            .from('orders')
            .select('id, remaining_debt, order_code')
            .eq('id', order_id)
            .single();
        
        const amountToPay = order?.remaining_debt || 0;
        console.log(`[BillingHelper] Invoice ${invoice.invoice_code} total: ${total_amount}, Order ${order?.order_code} remaining debt: ${amountToPay}`);

        // 2. Create Transaction (Phiếu Thu) - Only if there is still debt to pay
        if (amountToPay > 0) {
            const transactionCode = `PT${Date.now().toString().slice(-8)}`;
            const { error: transError } = await supabaseAdmin
                .from('finance_transactions')
                .insert({
                    code: transactionCode,
                    type: 'income',
                    amount: amountToPay,
                    category: 'Thanh toán đơn hàng',
                    description: `Duyệt thanh toán hóa đơn ${invoice.invoice_code} (Số tiền còn lại)`,
                    customer_id,
                    invoice_id: invoice.id,
                    payment_method: payment_method || 'cash',
                    status: 'approved',
                    created_by: invoice.created_by
                });

            if (transError) {
                console.error('[BillingHelper] Error creating transaction:', transError);
            }

            // 2b. Also create a general Transaction for FinancePage (transactions table)
            try {
                const { data: lastTrans } = await supabaseAdmin
                    .from('transactions')
                    .select('code')
                    .like('code', 'PT%')
                    .order('created_at', { ascending: false })
                    .limit(1);

                let transCode = 'PT000001';
                if (lastTrans && lastTrans.length > 0) {
                    const lastNum = parseInt(lastTrans[0].code.replace('PT', ''), 10);
                    transCode = `PT${String(lastNum + 1).padStart(6, '0')}`;
                }

                await supabaseAdmin
                    .from('transactions')
                    .insert({
                        code: transCode,
                        type: 'income',
                        category: 'Thanh toán đơn hàng',
                        amount: amountToPay,
                        payment_method: payment_method || 'cash',
                        notes: `Duyệt thanh toán hóa đơn ${invoice.invoice_code} - ${order?.order_code}`,
                        date: new Date().toISOString().split('T')[0],
                        order_id,
                        order_code: order?.order_code,
                        status: 'approved',
                        created_by: invoice.created_by,
                        approved_by: invoice.created_by,
                        approved_at: new Date().toISOString(),
                    });
            } catch (err) {
                console.error('[BillingHelper] Error creating general transaction:', err);
            }
        }

        // 3. Mark items as paid
        if (Array.isArray(order_item_ids) && order_item_ids.length > 0) {
            await supabaseAdmin
                .from('order_items')
                .update({ payment_status: 'paid' })
                .in('id', order_item_ids);
        }

        if (Array.isArray(order_product_service_ids) && order_product_service_ids.length > 0) {
            await supabaseAdmin
                .from('order_product_services')
                .update({ payment_status: 'paid' })
                .in('id', order_product_service_ids);
        }

        // 4. Sync Order Payment
        if (order_id) {
            await syncOrderPayment(order_id);
        }

        console.log(`[BillingHelper] Finished processing payment for invoice: ${invoice.invoice_code}`);
    } catch (error) {
        console.error('[BillingHelper] Unexpected error in processInvoicePayment:', error);
    }
}

/**
 * Synchronizes existing invoices with the current order state (totals, payment status, items).
 * Useful when an order is updated after an invoice was already created.
 */
export async function syncInvoiceWithOrder(orderId: string, paymentMethod?: string): Promise<void> {
    try {
        console.log(`[BillingHelper] Syncing invoice for order: ${orderId}`);

        // 1. Fetch Order details
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, customer_id, subtotal, discount, total_amount, paid_amount, payment_status, order_code')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            console.error('[BillingHelper] Order not found for sync-invoice:', orderError);
            return;
        }

        // 2. Find the latest active invoice for this order
        const { id: invoiceId, status: invStatus } = await supabaseAdmin
            .from('invoices')
            .select('id, status')
            .eq('order_id', orderId)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(res => res.data || { id: null, status: null });

        if (!invoiceId) {
            console.log(`[BillingHelper] No active invoice found to sync for order ${order.order_code}`);
            return;
        }

        // 3. Re-collect items and services (same as autoCreateInvoice)
        const { data: saleItems } = await supabaseAdmin.from('order_items').select('id').eq('order_id', orderId);
        const { data: orderProducts } = await supabaseAdmin.from('order_products').select('id').eq('order_id', orderId);
        
        const productIds = orderProducts?.map(p => p.id) || [];
        let orderProductServiceIds: string[] = [];
        if (productIds.length > 0) {
            const { data: services } = await supabaseAdmin.from('order_product_services').select('id').in('order_product_id', productIds);
            if (services) orderProductServiceIds = services.map(s => s.id);
        }
        const orderItemIds = saleItems?.map(i => i.id) || [];

        // Check if fully paid
        const isPaid = order.payment_status === 'paid' || (Number(order.paid_amount) >= Number(order.total_amount) && Number(order.total_amount) > 0);

        // 4. Update Invoice
        const updateData: any = {
            subtotal: Number(order.subtotal) || 0,
            discount: Number(order.discount) || 0,
            total_amount: Number(order.total_amount) || 0,
            order_item_ids: orderItemIds,
            order_product_service_ids: orderProductServiceIds,
            updated_at: new Date().toISOString()
        };

        if (isPaid && invStatus !== 'paid') {
            updateData.status = 'paid';
            updateData.paid_at = new Date().toISOString();
            if (paymentMethod) updateData.payment_method = paymentMethod;
        }

        const { error: updateError } = await supabaseAdmin
            .from('invoices')
            .update(updateData)
            .eq('id', invoiceId);

        if (updateError) {
            console.error('[BillingHelper] Error updating invoice during sync:', updateError);
        } else {
            console.log(`[BillingHelper] Successfully synced invoice ${invoiceId} for order ${order.order_code}. Status: ${updateData.status || invStatus}`);
            
            // 5. If now paid, mark items as paid
            if (isPaid) {
                if (orderItemIds.length > 0) {
                    await supabaseAdmin.from('order_items').update({ payment_status: 'paid' }).in('id', orderItemIds);
                }
                if (orderProductServiceIds.length > 0) {
                    await supabaseAdmin.from('order_product_services').update({ payment_status: 'paid' }).in('id', orderProductServiceIds);
                }
            }
        }
    } catch (error) {
        console.error('[BillingHelper] Unexpected error in syncInvoiceWithOrder:', error);
    }
}

/** @deprecated Dùng syncOrderPayment — cùng logic đồng bộ công nợ (không tính HĐ/phiếu đã hủy). */
export async function recalcOrderPaymentFromRecords(orderId: string): Promise<void> {
    await syncOrderPayment(orderId);
}

async function cancelActiveTransactions(
    applyFilter: (query: any) => any,
): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await applyFilter(
        supabaseAdmin.from('transactions').update({ status: 'cancelled', updated_at: now }),
    ).in('status', ['approved', 'pending']);

    if (error) {
        console.error('[BillingHelper] cancelActiveTransactions error:', error);
    }
}

/**
 * Hủy phiếu thu/chi liên quan đơn + hoàn trạng thái thanh toán dòng hàng trên hóa đơn.
 */
export async function cancelRelatedPaymentsForInvoice(invoice: {
    id: string;
    invoice_code: string;
    order_id: string;
    order_item_ids?: string[] | null;
    order_product_service_ids?: string[] | null;
    order?: { order_code?: string } | null;
}): Promise<void> {
    const orderId = invoice.order_id;
    let orderCode = (invoice.order as { order_code?: string } | null)?.order_code;
    const invoiceCode = invoice.invoice_code || '';
    const now = new Date().toISOString();

    if (!orderCode && orderId) {
        const { data: orderRow } = await supabaseAdmin
            .from('orders')
            .select('order_code')
            .eq('id', orderId)
            .maybeSingle();
        orderCode = orderRow?.order_code;
    }

    // Phiếu thu ghi trong đơn (payment_records) — cùng phạm vi hiển thị trên chi tiết HĐ
    const { error: paymentRecordsError } = await supabaseAdmin
        .from('payment_records')
        .update({ transaction_status: 'cancelled', updated_at: now })
        .eq('order_id', orderId)
        .eq('transaction_status', 'approved');

    if (paymentRecordsError) {
        console.error('[BillingHelper] cancel payment_records error:', paymentRecordsError);
    }

    // Phiếu thu Số Quỹ (transactions) — hủy theo từng tiêu chí để tránh lỗi .or()
    await cancelActiveTransactions((query) => query.eq('order_id', orderId));

    if (orderCode) {
        await cancelActiveTransactions((query) => query.eq('order_code', orderCode));
        await cancelActiveTransactions((query) => query.ilike('notes', `%${orderCode}%`));
    }

    if (invoiceCode) {
        await cancelActiveTransactions((query) => query.ilike('notes', `%${invoiceCode}%`));
    }

    const { error: financeError } = await supabaseAdmin
        .from('finance_transactions')
        .update({ status: 'cancelled', updated_at: now })
        .eq('invoice_id', invoice.id)
        .in('status', ['approved', 'pending']);

    if (financeError) {
        console.error('[BillingHelper] cancel finance_transactions error:', financeError);
    }

    const itemIds = Array.isArray(invoice.order_item_ids) ? invoice.order_item_ids : [];
    if (itemIds.length > 0) {
        await supabaseAdmin
            .from('order_items')
            .update({ payment_status: 'unpaid' })
            .in('id', itemIds);
    }

    const serviceIds = Array.isArray(invoice.order_product_service_ids) ? invoice.order_product_service_ids : [];
    if (serviceIds.length > 0) {
        await supabaseAdmin
            .from('order_product_services')
            .update({ payment_status: 'unpaid' })
            .in('id', serviceIds);
    }

    console.log(`[BillingHelper] Cancelled related payments for invoice ${invoice.invoice_code}`);
}

export async function processInvoiceCancellation(
    invoiceId: string,
    options: { cancelRelatedPayments?: boolean } = {},
): Promise<void> {
    const { data: invoice, error } = await supabaseAdmin
        .from('invoices')
        .select(
            'id, invoice_code, order_id, status, order_item_ids, order_product_service_ids, order:orders(order_code)',
        )
        .eq('id', invoiceId)
        .single();

    if (error || !invoice) {
        console.error('[BillingHelper] processInvoiceCancellation invoice not found:', error);
        return;
    }

    if (options.cancelRelatedPayments !== false && invoice.order_id) {
        await cancelRelatedPaymentsForInvoice(invoice as Parameters<typeof cancelRelatedPaymentsForInvoice>[0]);
        await syncOrderPayment(invoice.order_id);
    }
}
