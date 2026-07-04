import { supabaseAdmin } from '../config/supabase.js';

/**
 * Đồng bộ paid_amount / công nợ đơn từ nguồn còn hiệu lực:
 * phiếu thu (payment_records) → phiếu thu/chi (transactions) → hóa đơn status=paid (không tính HĐ đã hủy).
 */
export async function syncOrderPayment(orderId: string): Promise<void> {
    try {
        console.log(`[PaymentSync] Syncing payment for order: ${orderId}`);

        // 1. Fetch Order to get total_amount
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, total_amount')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            console.error('[PaymentSync] Order not found:', orderError);
            return;
        }

        let totalPaid = 0;

        const { data: records, error: recError } = await supabaseAdmin
            .from('payment_records')
            .select('amount')
            .eq('order_id', orderId)
            .eq('transaction_status', 'approved');

        if (recError) {
            console.error('[PaymentSync] payment_records:', recError);
        } else {
            totalPaid = (records || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        }

        if (totalPaid === 0) {
            const { data: trans } = await supabaseAdmin
                .from('transactions')
                .select('amount')
                .eq('order_id', orderId)
                .eq('type', 'income')
                .eq('status', 'approved');
            totalPaid = (trans || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        }

        if (totalPaid === 0) {
            const { data: invoices, error: invError } = await supabaseAdmin
                .from('invoices')
                .select('total_amount')
                .eq('order_id', orderId)
                .eq('status', 'paid');

            if (invError) {
                console.error('[PaymentSync] Error fetching invoices:', invError);
                return;
            }

            totalPaid = (invoices || []).reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
        }

        const remainingDebt = Math.max(0, (order.total_amount || 0) - totalPaid);
        
        // Determine payment status
        let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
        if (totalPaid >= (order.total_amount || 0)) {
            paymentStatus = 'paid';
        } else if (totalPaid > 0) {
            paymentStatus = 'partial';
        }

        // 3. Update Order
        const { error: updateError } = await supabaseAdmin
            .from('orders')
            .update({
                paid_amount: totalPaid,
                remaining_debt: remainingDebt,
                payment_status: paymentStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (updateError) {
            console.error('[PaymentSync] Error updating order:', updateError);
            return;
        }

        console.log(`[PaymentSync] Successfully synced: Paid=${totalPaid}, Status=${paymentStatus}`);

        // 4. Trigger auto-completion check
        await checkAndCompleteOrder(orderId);

    } catch (error) {
        console.error('[PaymentSync] Unexpected error:', error);
    }
}

/**
 * Checks if an order meets the criteria for auto-completion:
 * 1. Fully paid (remaining_debt <= 0)
 * 2. All services/items are completed, cancelled, or skipped.
 *
 * If met, updates order status to 'done'.
 * Returns the final order status.
 */
export async function checkAndCompleteOrder(orderId: string): Promise<string> {
    try {
        // 1. Fetch Order with payment info
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, status, total_amount, paid_amount, remaining_debt')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            console.error('checkAndCompleteOrder: Order not found', orderError);
            return 'unknown';
        }

        const currentStatus = order.status;
        // If already done, cancelled, or after_sale, we generally don't want to revert to done automatically
        // unless we want to allow re-completion from after_sale?
        // Let's assume if it's 'cancelled', we do nothing.
        // If it's 'after_sale', it's technically "more than done", so we leave it.
        // If it's 'done', we leave it.
        if (['done', 'after_sale', 'cancelled'].includes(currentStatus)) {
            return currentStatus;
        }

        // 2. Check Payment Condition
        // Logic: Paid >= Total OR remaining_debt <= 0
        const isPaid = (order.remaining_debt <= 0) || ((order.paid_amount || 0) >= (order.total_amount || 0));

        if (!isPaid) {
            return currentStatus; // Not paid enough, cannot complete
        }

        // 3. Check Services/Items Completion Condition
        // We need to check:
        // - order_items (Sale Items / V1 Service Items)
        // - order_products -> order_product_services (V2 Service Items)

        // Fetch order_items
        const { data: orderItems } = await supabaseAdmin
            .from('order_items')
            .select('id, status, item_type')
            .eq('order_id', orderId);

        // Fetch order_products -> services
        const { data: orderProducts } = await supabaseAdmin
            .from('order_products')
            .select(`
                id,
                services:order_product_services(
                    id, status, item_type,
                    steps:order_item_steps(id, status)
                )
            `)
            .eq('order_id', orderId);

        let allItemsCompleted = true;

        // Check V1 items (order_items)
        if (orderItems && orderItems.length > 0) {
            for (const item of orderItems) {
                // If it's a product, status is usually 'pending' or 'delivered'?
                // For now, let's assume 'completed' means done.
                // But for physical products, maybe 'delivered'?
                // The prompt focuses on "services".
                // Let's stick to the logic: "All services within the order are finished".
                if (item.item_type === 'service' || item.item_type === 'package') {
                    if (!['completed', 'cancelled', 'skipped'].includes(item.status)) {
                        allItemsCompleted = false;
                        break;
                    }
                }
            }
        }

        if (allItemsCompleted && orderProducts && orderProducts.length > 0) {
            for (const p of orderProducts) {
                if (p.services && Array.isArray(p.services)) {
                    for (const s of p.services) {
                        // Check service status
                        if (!['completed', 'cancelled', 'skipped'].includes(s.status)) {
                            // Double check steps if service status is not explicitly completed
                            // (Sometimes service status update lags behind steps?)
                            // But ideally service status IS the source of truth.
                            // Let's rely on service status first.
                            // If service status is 'in_progress' or 'pending', check if all steps are done?
                            // The existing logic updates service status to 'completed' when last step is done.
                            // So safely relying on service status is better.
                            allItemsCompleted = false;
                            break;
                        }

                        // Extra safety: Check steps if available?
                        // If service status says completed, steps should be done.
                        // If service is 'in_progress', but all steps are done (maybe update failed?), we might want to catch that.
                        // But simpler is to assume data consistency from other endpoints.
                    }
                }
                if (!allItemsCompleted) break;
            }
        }

        if (allItemsCompleted) {
            // Both conditions met!
            const { error: updateError } = await supabaseAdmin
                .from('orders')
                .update({
                    status: 'done',
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('checkAndCompleteOrder: Failed to update status', updateError);
                return currentStatus;
            }

            // Guard: only set phase_stage='done' for items still in workflow phase
            // Items in care/warranty/after_sale must not be touched
            try {
                const afterSaleUpdate = { current_phase: 'after_sale', phase_stage: 'after1' };
                const { data: prods } = await supabaseAdmin
                    .from('order_products')
                    .select('id')
                    .eq('order_id', orderId)
                    .eq('current_phase', 'workflow');
                const prodIds = (prods || []).map(p => p.id);
                await Promise.all([
                    supabaseAdmin.from('order_items').update(afterSaleUpdate).eq('order_id', orderId).eq('current_phase', 'workflow'),
                    supabaseAdmin.from('order_products').update(afterSaleUpdate).eq('order_id', orderId).eq('current_phase', 'workflow'),
                    ...(prodIds.length > 0
                        ? [supabaseAdmin.from('order_product_services').update(afterSaleUpdate).in('order_product_id', prodIds).eq('current_phase', 'workflow')]
                        : []
                    ),
                ]);
            } catch (phaseErr) {
                console.error('checkAndCompleteOrder: Failed to move workflow items to after_sale', phaseErr);
            }

            // Record commissions for Sales and Technicians
            await recordCommissions(orderId);

            return 'done';
        }

        return currentStatus;

    } catch (error) {
        console.error('checkAndCompleteOrder: Unexpected error', error);
        return 'unknown';
    }
}

/**
 * Records commissions for an order when it is completed.
 * This handles both Sales and Technicians based on per-service/item assignments.
 */
export async function recordCommissions(orderId: string): Promise<void> {
    try {
        console.log(`[Commission] Starting recording for order: ${orderId}`);

        // 1. Fetch existing commissions for this order to avoid duplicates
        const { data: existingCommissions, error: existingError } = await supabaseAdmin
            .from('commissions')
            .select('user_id, amount, notes, commission_type')
            .eq('order_id', orderId);

        if (existingError) {
            console.error('[Commission] Error fetching existing commissions:', existingError);
            // Continue, but might risk duplicates
        }

        const hasCommission = (userId: string, type: string, notesPart: string) => {
            return (existingCommissions || []).some(c =>
                c.user_id === userId &&
                c.commission_type === type &&
                (c.notes || '').includes(notesPart)
            );
        };

        // 2. Fetch Order details
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select(`
                id, 
                order_code, 
                total_amount, 
                sales_id,
                sales:users!orders_sales_id_fkey(id, name, commission)
            `)
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            console.error('[Commission] Order not found or error:', orderError);
            return;
        }

        // 3. Record Sales & Technician Commissions (V2 Service Items)
        const { data: orderProducts, error: opError } = await supabaseAdmin
            .from('order_products')
            .select(`
                id,
                order_product_services (
                    id,
                    item_name,
                    unit_price,
                    technicians:order_product_service_technicians (
                        technician_id,
                        commission
                    ),
                    sales:order_product_service_sales (
                        sale_id,
                        commission
                    )
                )
            `)
            .eq('order_id', orderId);

        if (opError) {
            console.error('[Commission] Error fetching V2 products:', opError.message);
        } else if (orderProducts) {
            for (const product of orderProducts) {
                const services = product.order_product_services || [];
                for (const service of services as any[]) {
                    const technicians = service.technicians || [];
                    const salesPeople = service.sales || [];
                    const servicePrice = service.unit_price || 0;

                    // A. Record Sales Commissions
                    for (const s of salesPeople) {
                        const note = `Hoa hồng Sales cho dịch vụ ${service.item_name} (Đơn ${order.order_code})`;
                        if (hasCommission(s.sale_id, 'product', note)) continue;

                        const commissionRate = s.commission || 0;
                        if (commissionRate > 0) {
                            const saleAmount = Math.floor((servicePrice * commissionRate) / 100);
                            await supabaseAdmin.from('commissions').insert({
                                user_id: s.sale_id,
                                order_id: order.id,
                                commission_type: 'product',
                                amount: saleAmount,
                                percentage: commissionRate,
                                base_amount: servicePrice,
                                status: 'pending',
                                notes: note
                            });
                        }
                    }

                    // B. Record Technician Commissions
                    for (const tech of technicians) {
                        const note = `Hoa hồng KTV cho dịch vụ ${service.item_name} (Đơn ${order.order_code})`;
                        if (hasCommission(tech.technician_id, 'service', note)) continue;

                        let commissionRate = tech.commission;
                        if (!commissionRate || commissionRate <= 0) {
                            const { data: userData } = await supabaseAdmin
                                .from('users')
                                .select('commission')
                                .eq('id', tech.technician_id)
                                .single();
                            commissionRate = userData?.commission || 0;
                        }

                        if (commissionRate > 0) {
                            const techCommission = Math.floor((servicePrice * commissionRate) / 100);
                            await supabaseAdmin.from('commissions').insert({
                                user_id: tech.technician_id,
                                order_id: order.id,
                                commission_type: 'service',
                                amount: techCommission,
                                percentage: commissionRate,
                                base_amount: servicePrice,
                                status: 'pending',
                                notes: note
                            });
                        }
                    }
                }
            }
        }

        // 5. Record Sales & Technician Commissions (V1 items)
        const { data: orderItems, error: oiError } = await supabaseAdmin
            .from('order_items')
            .select(`
                id, technician_id, commission_tech_amount, commission_tech_rate, total_price, item_name,
                sales:order_item_sales (
                    sale_id,
                    commission
                )
            `)
            .eq('order_id', orderId);

        if (oiError) {
            console.error('[Commission] Error fetching V1 items:', oiError.message);
        } else if (orderItems) {
            for (const item of orderItems) {
                const itemTotalPrice = item.total_price || 0;

                // A. Record Sales Commissions
                const salesPeople = (item as any).sales || [];
                for (const s of salesPeople) {
                    const note = `Hoa hồng Sales cho hạng mục ${item.item_name} (Đơn ${order.order_code} - V1)`;
                    if (hasCommission(s.sale_id, 'product', note)) continue;

                    const commissionRate = s.commission || 0;
                    if (commissionRate > 0) {
                        const saleAmount = Math.floor((itemTotalPrice * commissionRate) / 100);
                        await supabaseAdmin.from('commissions').insert({
                            user_id: s.sale_id,
                            order_id: order.id,
                            commission_type: 'product',
                            amount: saleAmount,
                            percentage: commissionRate,
                            base_amount: itemTotalPrice,
                            status: 'pending',
                            notes: note
                        });
                    }
                }

                // B. Record Technician Commissions
                if (item.technician_id && item.commission_tech_amount > 0) {
                    const note = `Hoa hồng KTV cho hạng mục ${item.item_name} (Đơn ${order.order_code} - V1)`;
                    if (hasCommission(item.technician_id, 'service', note)) continue;

                    const { error: techCommError } = await supabaseAdmin
                        .from('commissions')
                        .insert({
                            user_id: item.technician_id,
                            order_id: order.id,
                            commission_type: 'service',
                            amount: item.commission_tech_amount,
                            percentage: item.commission_tech_rate,
                            base_amount: item.total_price,
                            status: 'pending',
                            notes: note
                        });

                    if (techCommError) {
                        console.error(`[Commission] Error recording V1 tech commission for ${item.technician_id}:`, techCommError.message);
                    } else {
                        console.log(`[Commission] Recorded V1 Tech commission for ${item.technician_id}: ${item.commission_tech_amount}`);
                    }
                }
            }
        }

    } catch (error) {
        console.error('[Commission] Unexpected error in recordCommissions:', error);
    }
}
