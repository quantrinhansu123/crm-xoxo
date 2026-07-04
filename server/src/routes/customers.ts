import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireSale } from '../middleware/auth.js';
import { notifyCrmMaster } from '../utils/webhookNotifier.js';
import { syncInvoiceWithOrder } from '../utils/billingHelper.js';
import { checkAndCompleteOrder } from '../utils/orderHelper.js';
import {
    distributeOrphanDepositToProducts,
    insertPaymentRecord,
    reconcileOrderDeposits,
    sumPaidAmountByProduct,
    sumPaymentTotalsByOrder,
} from '../utils/paymentRecordsHelper.js';

const router = Router();

// Get all customers
router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { type, status, search, page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = supabaseAdmin
            .from('customers')
            .select('*, assigned_user:users!customers_assigned_to_fkey(id, name, email)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (type) query = query.eq('type', type);
        if (status) query = query.eq('status', status);
        if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

        const { data: customers, error, count } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách khách hàng', 500);
        }

        // Lấy thống kê đơn hàng cho tất cả customers
        const customerIds = customers?.map(c => c.id) || [];
        let customersWithStats = customers || [];

        if (customerIds.length > 0) {
            const { data: allOrders } = await supabaseAdmin
                .from('orders')
                .select('customer_id, total_amount, remaining_debt')
                .in('customer_id', customerIds);

            // Tính toán stats cho từng customer
            customersWithStats = customers!.map(customer => {
                const customerOrders = allOrders?.filter(o => o.customer_id === customer.id) || [];
                const totalOrders = customerOrders.length;
                const totalSpent = customerOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
                const totalDebt = customerOrders.reduce((sum, o) => sum + (o.remaining_debt || 0), 0);

                return {
                    ...customer,
                    total_orders: totalOrders,
                    total_spent: totalSpent,
                    total_debt: totalDebt,
                };
            });
        }

        res.json({
            status: 'success',
            data: {
                customers: customersWithStats,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / Number(limit)),
                }
            },
        });
    } catch (error) {
        next(error);
    }
});

// Customer debt ledger & order balances (KiotViet-style công nợ)
router.get('/:id/debt', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: customer, error: customerError } = await supabaseAdmin
            .from('customers')
            .select('id, name, phone, email')
            .eq('id', id)
            .single();

        if (customerError || !customer) {
            throw new ApiError('Không tìm thấy khách hàng', 404);
        }

        const { data: orders, error: ordersError } = await supabaseAdmin
            .from('orders')
            .select('id, order_code, total_amount, paid_amount, remaining_debt, payment_status, created_at, status')
            .eq('customer_id', id)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: true });

        if (ordersError) {
            throw new ApiError('Lỗi khi lấy đơn hàng', 500);
        }

        const orderList = orders || [];
        const orderIds = orderList.map((o) => o.id);

        // Đồng bộ phiếu thu cọc nếu DV đã có deposit_amount nhưng chưa ghi payment_records
        for (const o of orderList) {
            try {
                await reconcileOrderDeposits({
                    orderId: o.id,
                    orderCode: o.order_code,
                    customerName: customer.name,
                    createdBy: req.user!.id,
                });
            } catch (reconcileErr) {
                console.warn(`[debt] reconcileOrderDeposits ${o.order_code}:`, reconcileErr);
            }
        }

        // Reload orders after reconcile (paid_amount may have changed)
        const { data: ordersRefreshed } = orderIds.length > 0
            ? await supabaseAdmin
                .from('orders')
                .select('id, order_code, total_amount, paid_amount, remaining_debt, payment_status, created_at, status')
                .in('id', orderIds)
                .order('created_at', { ascending: true })
            : { data: [] };
        const orderListFresh = ordersRefreshed || orderList;

        const paymentTotals = orderIds.length > 0
            ? await sumPaymentTotalsByOrder(orderIds)
            : { paidByOrder: {}, depositByOrder: {}, depositByProduct: {}, paidByProduct: {} };

        const depositByOrder: Record<string, number> = {};
        const productsByOrder: Record<string, Array<{
            id: string;
            product_code: string;
            name: string;
            image_url: string | null;
            total_amount: number;
            deposit_amount: number;
            paid_amount: number;
            remaining_debt: number;
        }>> = {};

        if (orderIds.length > 0) {
            const { data: orderProducts } = await supabaseAdmin
                .from('order_products')
                .select('id, order_id, product_code, name, images')
                .in('order_id', orderIds);

            const productIds = (orderProducts || []).map((p) => p.id);
            const productToOrder = new Map((orderProducts || []).map((p) => [p.id, p.order_id]));

            const depositByProduct: Record<string, number> = {};
            const totalByProduct: Record<string, number> = {};
            const paidByProductFromRecords = productIds.length > 0 && orderIds.length > 0
                ? await sumPaidAmountByProduct(orderIds)
                : {};

            if (productIds.length > 0) {
                const { data: services } = await supabaseAdmin
                    .from('order_product_services')
                    .select('order_product_id, deposit_amount, unit_price')
                    .in('order_product_id', productIds);

                for (const svc of services || []) {
                    const orderId = productToOrder.get(svc.order_product_id);
                    if (!orderId) continue;
                    const dep = Number(svc.deposit_amount) || 0;
                    const price = Number(svc.unit_price) || 0;
                    depositByOrder[orderId] = (depositByOrder[orderId] || 0) + dep;
                    depositByProduct[svc.order_product_id] = (depositByProduct[svc.order_product_id] || 0) + dep;
                    totalByProduct[svc.order_product_id] = (totalByProduct[svc.order_product_id] || 0) + price;
                }
            }

            for (const p of orderProducts || []) {
                const orderId = p.order_id;
                if (!productsByOrder[orderId]) productsByOrder[orderId] = [];
                const images = Array.isArray(p.images) ? p.images : [];
                const totalAmount = totalByProduct[p.id] || 0;
                const svcDeposit = depositByProduct[p.id] || 0;
                const payDeposit = paymentTotals.depositByProduct[p.id] || 0;
                const depositAmount = Math.max(svcDeposit, payDeposit);
                const paidAmount = Math.max(
                    paidByProductFromRecords[p.id] || 0,
                    paymentTotals.paidByProduct[p.id] || 0
                );
                const collected = Math.max(paidAmount, depositAmount);
                productsByOrder[orderId].push({
                    id: p.id,
                    product_code: p.product_code,
                    name: p.name || p.product_code,
                    image_url: images[0] || null,
                    total_amount: totalAmount,
                    deposit_amount: depositAmount,
                    paid_amount: paidAmount,
                    remaining_debt: Math.max(0, totalAmount - collected),
                });
            }

            for (const orderId of Object.keys(productsByOrder)) {
                const products = productsByOrder[orderId];
                products.sort((a, b) => a.product_code.localeCompare(b.product_code));

                const productDepositSum = products.reduce((s, p) => s + (p.deposit_amount || 0), 0);
                const orderPayDeposit = paymentTotals.depositByOrder[orderId] || 0;
                const orphanDeposit = Math.max(0, orderPayDeposit - productDepositSum);
                distributeOrphanDepositToProducts(products, orphanDeposit);
            }
        }

        const orderBalances = orderListFresh.map((o) => {
            const total = Number(o.total_amount) || 0;
            const paidFromOrder = Number(o.paid_amount) || 0;
            const paidFromRecords = paymentTotals.paidByOrder[o.id] || 0;
            const paid = Math.max(paidFromOrder, paidFromRecords);
            const products = productsByOrder[o.id] || [];
            const depositTotal = products.reduce((s, p) => s + (p.deposit_amount || 0), 0);
            const collected = Math.max(paid, depositTotal);
            return {
                id: o.id,
                order_code: o.order_code,
                created_at: o.created_at,
                total_amount: total,
                paid_amount: paid,
                deposit_amount: depositTotal,
                remaining_debt: Math.max(0, total - collected),
                payment_status: o.payment_status,
                status: o.status,
                products,
            };
        });

        let paymentRecords: Array<{
            id: string;
            order_id: string;
            order_code: string | null;
            amount: number;
            payment_method: string | null;
            content: string | null;
            created_at: string;
            payment_kind?: string | null;
            transaction_category?: string | null;
        }> = [];

        if (orderIds.length > 0) {
            let payResult: any = await supabaseAdmin
                .from('payment_records')
                .select('id, order_id, order_code, amount, payment_method, content, created_at, payment_kind, transaction_category')
                .in('order_id', orderIds)
                .order('created_at', { ascending: true });

            if (payResult.error) {
                payResult = await supabaseAdmin
                    .from('payment_records')
                    .select('id, order_id, order_code, amount, payment_method, content, created_at, transaction_category')
                    .in('order_id', orderIds)
                    .order('created_at', { ascending: true });
            }

            paymentRecords = (payResult.data || []) as typeof paymentRecords;
        }

        type DebtEvent = { id: string; at: string; code: string; kind: 'sale' | 'payment'; label: string; amount: number };
        const events: DebtEvent[] = [];

        for (const o of orderList) {
            events.push({
                id: `sale-${o.id}`,
                at: o.created_at,
                code: o.order_code,
                kind: 'sale',
                label: 'Bán hàng',
                amount: Number(o.total_amount) || 0,
            });
        }

        for (const p of paymentRecords || []) {
            const isDeposit =
                (p.payment_kind || '').toLowerCase() === 'deposit' ||
                (p.transaction_category || '').toLowerCase().includes('cọc') ||
                (p.content || '').toLowerCase().includes('tiền cọc');
            events.push({
                id: `pay-${p.id}`,
                at: p.created_at,
                code: p.order_code || p.id.slice(0, 8),
                kind: 'payment',
                label: isDeposit ? 'Tiền cọc' : 'Thanh toán',
                amount: -(Number(p.amount) || 0),
            });
        }

        for (const o of orderBalances) {
            const paid = o.paid_amount || 0;
            if (paid <= 0) continue;
            const hasPaymentEvent = (paymentRecords || []).some((p) => p.order_id === o.id);
            if (!hasPaymentEvent) {
                events.push({
                    id: `pay-order-${o.id}`,
                    at: o.created_at,
                    code: o.order_code,
                    kind: 'payment',
                    label: o.deposit_amount >= paid ? 'Tiền cọc' : 'Thanh toán',
                    amount: -paid,
                });
            }
        }

        events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

        let balance = 0;
        const ledger = events.map((ev) => {
            balance += ev.amount;
            return { ...ev, balance };
        });

        const totalDebt = orderBalances.reduce((sum, o) => sum + o.remaining_debt, 0);
        const totalPaid = orderBalances.reduce((sum, o) => sum + o.paid_amount, 0);
        const totalOrderValue = orderBalances.reduce((sum, o) => sum + o.total_amount, 0);
        // Tổng cọc = cộng cọc từng SP (HĐxx.1, HĐxx.2, …) trên mọi đơn
        const totalDeposit = orderBalances.reduce(
            (sum, o) => sum + (o.products || []).reduce((ps, p) => ps + (p.deposit_amount || 0), 0),
            0
        );

        res.json({
            status: 'success',
            data: {
                customer,
                summary: {
                    total_debt: totalDebt,
                    total_paid: totalPaid,
                    total_order_value: totalOrderValue,
                    total_deposit: totalDeposit,
                    open_orders_count: orderBalances.filter((o) => o.remaining_debt > 0).length,
                },
                orders: orderBalances,
                ledger: ledger.reverse(),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Allocate customer payment across multiple orders
router.post('/:id/collect-payment', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { amount, payment_method, notes, content, allocations } = req.body as {
            amount?: number;
            payment_method?: string;
            notes?: string;
            content?: string;
            allocations?: Array<{
                order_id: string;
                amount: number;
                order_product_id?: string;
                payment_kind?: 'deposit' | 'payment';
            }>;
        };

        const totalPay = Number(amount) || 0;
        if (totalPay <= 0) {
            throw new ApiError('Số tiền thanh toán phải lớn hơn 0', 400);
        }
        if (!Array.isArray(allocations) || allocations.length === 0) {
            throw new ApiError('Vui lòng phân bổ thanh toán cho ít nhất một đơn', 400);
        }

        const allocSum = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
        if (allocSum !== totalPay) {
            throw new ApiError(`Tổng phân bổ (${allocSum}) phải bằng số tiền thanh toán (${totalPay})`, 400);
        }

        const { data: customer } = await supabaseAdmin.from('customers').select('id, name').eq('id', id).single();
        if (!customer) throw new ApiError('Không tìm thấy khách hàng', 404);

        const results: any[] = [];

        for (const alloc of allocations) {
            const payAmount = Number(alloc.amount) || 0;
            if (payAmount <= 0) continue;

            const { data: order, error: orderError } = await supabaseAdmin
                .from('orders')
                .select('id, order_code, customer_id, total_amount, paid_amount, remaining_debt')
                .eq('id', alloc.order_id)
                .eq('customer_id', id)
                .single();

            if (orderError || !order) {
                throw new ApiError(`Không tìm thấy đơn ${alloc.order_id}`, 404);
            }

            const paymentKind = alloc.payment_kind === 'deposit' ? 'deposit' : 'payment';
            let productCode: string | null = null;

            if (alloc.order_product_id) {
                const { data: orderProduct } = await supabaseAdmin
                    .from('order_products')
                    .select('id, product_code, order_id')
                    .eq('id', alloc.order_product_id)
                    .eq('order_id', order.id)
                    .single();

                if (!orderProduct) {
                    throw new ApiError(`Sản phẩm không thuộc đơn ${order.order_code}`, 400);
                }
                productCode = orderProduct.product_code;

                const { data: svcRows } = await supabaseAdmin
                    .from('order_product_services')
                    .select('unit_price, deposit_amount')
                    .eq('order_product_id', alloc.order_product_id);

                const productTotal = (svcRows || []).reduce(
                    (s, svc) => s + (Number(svc.unit_price) || 0),
                    0
                );
                const productDeposit = (svcRows || []).reduce(
                    (s, svc) => s + (Number(svc.deposit_amount) || 0),
                    0
                );
                const paidMap = await sumPaidAmountByProduct([order.id]);
                const productPaid = paidMap[alloc.order_product_id] || 0;
                const productRemaining = Math.max(0, productTotal - Math.max(productPaid, productDeposit));

                if (payAmount > productRemaining + 1) {
                    throw new ApiError(
                        `Số tiền vượt quá cần thu SP ${productCode} (còn ${productRemaining.toLocaleString('vi-VN')}đ)`,
                        400
                    );
                }
            } else {
                const remaining = Number(order.remaining_debt) ?? Math.max(0, (order.total_amount || 0) - (order.paid_amount || 0));
                if (payAmount > remaining + 1) {
                    throw new ApiError(`Số tiền vượt quá công nợ đơn ${order.order_code}`, 400);
                }
            }

            const kindLabel = paymentKind === 'deposit' ? 'Tiền cọc' : 'Thanh toán';
            const productSuffix = productCode ? ` - ${productCode}` : '';
            const payContent = content || `${kindLabel} công nợ${productSuffix} - ${customer.name}`;

            const { data: payment, error: paymentError } = await insertPaymentRecord({
                order_id: order.id,
                order_code: order.order_code,
                order_product_id: alloc.order_product_id || null,
                payment_kind: paymentKind,
                content: payContent,
                amount: payAmount,
                payment_method: payment_method || 'cash',
                notes,
                transaction_type: 'income',
                transaction_category: paymentKind === 'deposit' ? 'Tiền cọc' : 'Thanh toán đơn hàng',
                transaction_status: 'approved',
                created_by: req.user!.id,
            });

            if (paymentError) {
                throw new ApiError('Lỗi khi ghi nhận thanh toán: ' + paymentError.message, 500);
            }

            if (paymentKind === 'deposit' && alloc.order_product_id) {
                const { data: svcList } = await supabaseAdmin
                    .from('order_product_services')
                    .select('id, deposit_amount')
                    .eq('order_product_id', alloc.order_product_id)
                    .order('created_at', { ascending: true })
                    .limit(1);

                if (svcList?.length) {
                    const svc = svcList[0];
                    await supabaseAdmin
                        .from('order_product_services')
                        .update({
                            deposit_amount: (Number(svc.deposit_amount) || 0) + payAmount,
                        })
                        .eq('id', svc.id);
                }
            }

            const newPaidAmount = (order.paid_amount || 0) + payAmount;
            const newRemainingDebt = Math.max(0, order.total_amount - newPaidAmount);
            const newPaymentStatus = newRemainingDebt <= 0 ? 'paid' : (newPaidAmount > 0 ? 'partial' : 'unpaid');

            await supabaseAdmin
                .from('orders')
                .update({
                    paid_amount: newPaidAmount,
                    remaining_debt: newRemainingDebt,
                    payment_status: newPaymentStatus,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', order.id);

            await checkAndCompleteOrder(order.id);
            syncInvoiceWithOrder(order.id, payment_method).catch(() => undefined);

            const { data: lastTrans } = await supabaseAdmin
                .from('transactions')
                .select('code')
                .like('code', 'PT%')
                .order('created_at', { ascending: false })
                .limit(1);

            let transCode = 'PT000001';
            if (lastTrans?.length) {
                const lastNum = parseInt(lastTrans[0].code.replace('PT', ''), 10);
                transCode = `PT${String(lastNum + 1).padStart(6, '0')}`;
            }

            await supabaseAdmin.from('transactions').insert({
                code: transCode,
                type: 'income',
                category: 'Thanh toán đơn hàng',
                amount: payAmount,
                payment_method: payment_method || 'cash',
                notes: `${payContent} - ${order.order_code}`,
                date: new Date().toISOString().split('T')[0],
                order_id: order.id,
                order_code: order.order_code,
                status: 'approved',
                created_by: req.user!.id,
                approved_by: req.user!.id,
                approved_at: new Date().toISOString(),
            });

            results.push({ order_id: order.id, order_code: order.order_code, amount: payAmount, payment });
        }

        notifyCrmMaster('customer.payment_collected', { customer_id: id, amount: totalPay, allocations: results });

        res.status(201).json({
            status: 'success',
            data: { payments: results },
            message: 'Đã ghi nhận thanh toán',
        });
    } catch (error) {
        next(error);
    }
});

// Get customer by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: customer, error } = await supabaseAdmin
            .from('customers')
            .select('*, assigned_user:users!customers_assigned_to_fkey(id, name, email)')
            .eq('id', id)
            .single();

        if (error || !customer) {
            throw new ApiError('Không tìm thấy khách hàng', 404);
        }

        // Lấy thống kê
        const { data: stats } = await supabaseAdmin
            .from('orders')
            .select('id, total_amount, remaining_debt')
            .eq('customer_id', id);

        const totalOrders = stats?.length || 0;
        const totalSpent = stats?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;

        res.json({
            status: 'success',
            data: {
                customer: {
                    ...customer,
                    total_orders: totalOrders,
                    total_spent: totalSpent,
                    total_debt: stats?.reduce((sum, o) => sum + (o.remaining_debt || 0), 0) || 0,
                }
            },
        });
    } catch (error) {
        next(error);
    }
});

// Create customer
router.post('/', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { name, phone, email, type, company, tax_code, address, source, notes, assigned_to, dob, zalo_user_id, customer_zalo_user_id } = req.body;

        if (!name || !phone) {
            throw new ApiError('Tên và số điện thoại là bắt buộc', 400);
        }

        const { data: customer, error } = await supabaseAdmin
            .from('customers')
            .insert({
                name,
                phone,
                email,
                type: type || 'individual',
                company,
                tax_code,
                address,
                source: source || 'other',
                notes,
                status: 'active',
                assigned_to: assigned_to || req.user!.id,
                created_by: req.user!.id,
                dob: dob || null,
                zalo_user_id: zalo_user_id || customer_zalo_user_id || null,
                customer_zalo_user_id: customer_zalo_user_id || zalo_user_id || null,
            })
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi tạo khách hàng: ' + error.message, 500);
        }

        notifyCrmMaster('customer.created', { customer });

        res.status(201).json({
            status: 'success',
            data: { customer },
        });
    } catch (error) {
        next(error);
    }
});

// Update customer
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const updateFields = req.body;

        const { data: customer, error } = await supabaseAdmin
            .from('customers')
            .update({ ...updateFields, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật khách hàng', 500);
        }

        notifyCrmMaster('customer.updated', { customer });

        res.json({
            status: 'success',
            data: { customer },
        });
    } catch (error) {
        next(error);
    }
});

// Delete customer (soft delete)
router.delete('/:id', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('customers')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            throw new ApiError('Lỗi khi xóa khách hàng', 500);
        }

        res.json({
            status: 'success',
            message: 'Đã vô hiệu hóa khách hàng',
        });
    } catch (error) {
        next(error);
    }
});

export { router as customersRouter };

