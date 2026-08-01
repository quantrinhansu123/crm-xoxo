import { supabaseAdmin } from '../config/supabase.js';
import { notifyFinanceEvent } from './financeNotifications.js';

export function isPaymentSchemaColumnError(error: { message?: string; code?: string } | null): boolean {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    return (
        error.code === 'PGRST204' ||
        msg.includes('order_product_id') ||
        msg.includes('payment_kind') ||
        msg.includes('could not find') ||
        (msg.includes('column') && msg.includes('payment_records'))
    );
}

type PaymentInsertPayload = {
    order_id: string;
    order_code: string;
    content: string;
    amount: number;
    payment_method: string;
    notes?: string | null;
    transaction_type: string;
    transaction_category: string;
    transaction_status: string;
    created_by: string;
    order_product_id?: string | null;
    payment_kind?: string | null;
    image_url?: string | null;
};

export async function insertPaymentRecord(payload: PaymentInsertPayload) {
    const extendedPayload = {
        ...payload,
        order_product_id: payload.order_product_id ?? null,
        payment_kind: payload.payment_kind ?? 'payment',
    };

    let result = await supabaseAdmin
        .from('payment_records')
        .insert(extendedPayload)
        .select()
        .single();

    if (result.error && isPaymentSchemaColumnError(result.error)) {
        const { order_product_id: _op, payment_kind: _pk, ...legacyPayload } = extendedPayload;
        result = await supabaseAdmin
            .from('payment_records')
            .insert(legacyPayload)
            .select()
            .single();
    }

    return result;
}

export async function fetchOrderPaymentRecords(orderId: string) {
    const extendedSelect =
        '*, created_by_user:users!payment_records_created_by_fkey(id, name, avatar), order_product:order_products(id, product_code, name, images)';

    let result = await supabaseAdmin
        .from('payment_records')
        .select(extendedSelect)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

    if (result.error && isPaymentSchemaColumnError(result.error)) {
        result = await supabaseAdmin
            .from('payment_records')
            .select('*, created_by_user:users!payment_records_created_by_fkey(id, name, avatar)')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });
    }

    return result;
}

export async function sumPaidAmountByProduct(orderIds: string[]): Promise<Record<string, number>> {
    const paidByProduct: Record<string, number> = {};
    if (orderIds.length === 0) return paidByProduct;

    const { data, error } = await supabaseAdmin
        .from('payment_records')
        .select('order_product_id, amount')
        .in('order_id', orderIds)
        .not('order_product_id', 'is', null);

    if (error) {
        if (isPaymentSchemaColumnError(error)) return paidByProduct;
        console.warn('[paymentRecords] sumPaidAmountByProduct:', error.message);
        return paidByProduct;
    }

    for (const pay of data || []) {
        if (!pay.order_product_id) continue;
        paidByProduct[pay.order_product_id] =
            (paidByProduct[pay.order_product_id] || 0) + (Number(pay.amount) || 0);
    }

    return paidByProduct;
}

export type ProductDepositLine = {
    order_product_id: string;
    product_code: string;
    amount: number;
};

type CustomerItemWithServices = {
    services?: Array<{ price?: number; deposit_amount?: number }>;
};

/** Gán deposit_amount cho từng DV khi client chỉ gửi paid_amount tổng */
export function distributeDepositAcrossCustomerItems(
    items: CustomerItemWithServices[],
    totalDeposit: number
): number {
    const allServices: Array<{ svc: { deposit_amount?: number }; price: number }> = [];
    for (const item of items) {
        if (!item.services || !Array.isArray(item.services)) continue;
        for (const svc of item.services) {
            allServices.push({ svc, price: Number(svc.price) || 0 });
        }
    }
    if (allServices.length === 0) return 0;

    const totalPrice = allServices.reduce((s, x) => s + x.price, 0);
    const capped = Math.min(Math.max(0, Number(totalDeposit) || 0), totalPrice);
    let remaining = capped;

    allServices.forEach(({ svc, price }, idx) => {
        const share =
            idx === allServices.length - 1
                ? remaining
                : totalPrice > 0
                  ? Math.floor((capped * price) / totalPrice)
                  : 0;
        remaining -= share;
        svc.deposit_amount = share;
    });

    return capped;
}

export function isDepositPaymentRecord(pay: {
    payment_kind?: string | null;
    transaction_category?: string | null;
    content?: string | null;
}): boolean {
    const kind = (pay.payment_kind || '').toLowerCase();
    if (kind === 'deposit') return true;
    const cat = (pay.transaction_category || '').toLowerCase();
    const content = (pay.content || '').toLowerCase();
    return (
        cat.includes('cọc') ||
        cat.includes('coc') ||
        content.includes('cọc') ||
        content.includes('coc') ||
        content.includes('đặt cọc') ||
        content.includes('dat coc')
    );
}

/** Chia phần cọc chưa gắn SP xuống từng sản phẩm theo tỷ lệ giá trị DV */
export function distributeOrphanDepositToProducts(
    products: Array<{ deposit_amount: number; total_amount: number }>,
    orphanAmount: number
): void {
    const orphan = Math.max(0, Number(orphanAmount) || 0);
    if (orphan <= 0 || products.length === 0) return;

    const totalBase = products.reduce((s, p) => s + (p.total_amount || 0), 0) || products.length;
    let remaining = orphan;

    products.forEach((p, idx) => {
        if (idx === products.length - 1) {
            p.deposit_amount += remaining;
            return;
        }
        const share =
            totalBase > 0
                ? Math.floor((orphan * (p.total_amount || 0)) / totalBase)
                : Math.floor(orphan / products.length);
        p.deposit_amount += share;
        remaining -= share;
    });
}

export async function sumPaymentTotalsByOrder(orderIds: string[]): Promise<{
    paidByOrder: Record<string, number>;
    depositByOrder: Record<string, number>;
    depositByProduct: Record<string, number>;
    paidByProduct: Record<string, number>;
}> {
    const paidByOrder: Record<string, number> = {};
    const depositByOrder: Record<string, number> = {};
    const depositByProduct: Record<string, number> = {};
    const paidByProduct: Record<string, number> = {};

    if (orderIds.length === 0) {
        return { paidByOrder, depositByOrder, depositByProduct, paidByProduct };
    }

    let result: any = await supabaseAdmin
        .from('payment_records')
        .select('order_id, order_product_id, amount, payment_kind, transaction_category, content')
        .in('order_id', orderIds);

    if (result.error && isPaymentSchemaColumnError(result.error)) {
        result = await supabaseAdmin
            .from('payment_records')
            .select('order_id, amount, transaction_category, content')
            .in('order_id', orderIds);
    }

    if (result.error) {
        console.warn('[paymentRecords] sumPaymentTotalsByOrder:', result.error.message);
        return { paidByOrder, depositByOrder, depositByProduct, paidByProduct };
    }

    for (const pay of result.data || []) {
        const orderId = pay.order_id as string;
        const amount = Number(pay.amount) || 0;
        if (!orderId || amount <= 0) continue;

        paidByOrder[orderId] = (paidByOrder[orderId] || 0) + amount;

        const productId = pay.order_product_id as string | undefined;
        if (productId) {
            paidByProduct[productId] = (paidByProduct[productId] || 0) + amount;
        }

        if (isDepositPaymentRecord(pay)) {
            depositByOrder[orderId] = (depositByOrder[orderId] || 0) + amount;
            if (productId) {
                depositByProduct[productId] = (depositByProduct[productId] || 0) + amount;
            }
        }
    }

    return { paidByOrder, depositByOrder, depositByProduct, paidByProduct };
}

/** Đồng bộ phiếu thu cọc + paid_amount đơn khi DV đã có deposit_amount nhưng chưa có payment_records */
export async function reconcileOrderDeposits(opts: {
    orderId: string;
    orderCode: string;
    customerName: string;
    paymentMethod?: string;
    createdBy: string;
}): Promise<void> {
    const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id, order_code, paid_amount, total_amount, payment_method')
        .eq('id', opts.orderId)
        .single();

    if (!order) return;

    const { data: products } = await supabaseAdmin
        .from('order_products')
        .select('id, product_code')
        .eq('order_id', opts.orderId);

    const productIds = (products || []).map((p) => p.id);
    if (productIds.length === 0) return;

    const { data: services } = await supabaseAdmin
        .from('order_product_services')
        .select('order_product_id, deposit_amount')
        .in('order_product_id', productIds);

    const depositByProduct: Record<string, number> = {};
    for (const svc of services || []) {
        const dep = Number(svc.deposit_amount) || 0;
        if (dep <= 0) continue;
        depositByProduct[svc.order_product_id] =
            (depositByProduct[svc.order_product_id] || 0) + dep;
    }

    const serviceDepositTotal = Object.values(depositByProduct).reduce((s, v) => s + v, 0);
    if (serviceDepositTotal <= 0) return;

    const { depositByProduct: recordedDepositByProduct } = await sumPaymentTotalsByOrder([opts.orderId]);

    const lines: ProductDepositLine[] = [];
    for (const p of products || []) {
        const expected = depositByProduct[p.id] || 0;
        const recorded = recordedDepositByProduct[p.id] || 0;
        const missing = expected - recorded;
        if (missing > 0) {
            lines.push({
                order_product_id: p.id,
                product_code: p.product_code,
                amount: missing,
            });
        }
    }

    if (lines.length > 0) {
        await recordProductDepositPayments({
            orderId: opts.orderId,
            orderCode: opts.orderCode || order.order_code,
            customerName: opts.customerName,
            paymentMethod: opts.paymentMethod || order.payment_method || 'cash',
            createdBy: opts.createdBy,
            lines,
            notes: 'Đồng bộ tiền cọc từ dịch vụ đơn hàng',
        });
    }

    // Đảm bảo phiếu thu cọc cũng xuất hiện trên sổ quỹ
    await syncOrderPaymentsToCashBook(opts.orderId);

    const orderPaid = Number(order.paid_amount) || 0;
    if (orderPaid < serviceDepositTotal) {
        const remaining = Math.max(0, (Number(order.total_amount) || 0) - serviceDepositTotal);
        await supabaseAdmin
            .from('orders')
            .update({
                paid_amount: serviceDepositTotal,
                remaining_debt: remaining,
                payment_status: remaining <= 0 ? 'paid' : 'partial',
                updated_at: new Date().toISOString(),
            })
            .eq('id', opts.orderId);
    }
}

/** Sinh mã PT/PC an toàn hơn (tránh trùng UNIQUE do race / chỉ lấy 1 bản ghi mới nhất). */
export async function generateNextVoucherCode(type: 'income' | 'expense' = 'income'): Promise<string> {
    const prefix = type === 'income' ? 'PT' : 'PC';
    const { data: transactions } = await supabaseAdmin
        .from('transactions')
        .select('code')
        .like('code', `${prefix}%`)
        .order('created_at', { ascending: false })
        .limit(200);

    let maxNumber = 0;
    for (const trans of transactions || []) {
        const num = parseInt(String(trans.code || '').replace(prefix, ''), 10);
        if (!isNaN(num) && num > maxNumber) maxNumber = num;
    }
    return `${prefix}${String(maxNumber + 1).padStart(6, '0')}`;
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    return error.code === '23505' || msg.includes('duplicate') || msg.includes('unique');
}

/** Ghi phiếu thu tiền cọc theo từng SP khi tạo/cập nhật đơn */
export async function recordProductDepositPayments(opts: {
    orderId: string;
    orderCode: string;
    customerName: string;
    paymentMethod: string;
    createdBy: string;
    lines: ProductDepositLine[];
    notes?: string;
}): Promise<{ total: number; payments: unknown[] }> {
    const payments: unknown[] = [];
    let total = 0;

    for (const line of opts.lines) {
        const amount = Number(line.amount) || 0;
        if (amount <= 0) continue;

        const content = `Tiền cọc - ${line.product_code} - ${opts.customerName}`;
        const { data, error } = await insertPaymentRecord({
            order_id: opts.orderId,
            order_code: opts.orderCode,
            order_product_id: line.order_product_id,
            payment_kind: 'deposit',
            content,
            amount,
            payment_method: opts.paymentMethod || 'cash',
            notes: opts.notes || null,
            transaction_type: 'income',
            transaction_category: 'Tiền cọc',
            transaction_status: 'approved',
            created_by: opts.createdBy,
        });

        if (error) {
            throw error;
        }

        payments.push(data);
        total += amount;
    }

    return { total, payments };
}

/**
 * Đồng bộ payment_records → sổ quỹ (transactions).
 * Hóa đơn đọc cả 2 bảng; sổ quỹ chỉ đọc transactions — thiếu sync sẽ mất phiếu thu trên sổ quỹ.
 */
export async function syncOrderPaymentsToCashBook(orderId: string): Promise<{ created: number }> {
    if (!orderId) return { created: 0 };

    const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id, order_code')
        .eq('id', orderId)
        .maybeSingle();

    if (!order) return { created: 0 };

    const { data: paymentRows } = await supabaseAdmin
        .from('payment_records')
        .select('id, amount, payment_method, content, notes, created_by, created_at, order_product_id, transaction_category, transaction_status')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

    const payments = (paymentRows || []).filter(
        (p) => (p.transaction_status || 'approved') !== 'cancelled' && Number(p.amount) > 0,
    );

    if (payments.length === 0) return { created: 0 };

    const { data: transactionRows } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, status')
        .eq('order_id', orderId)
        .eq('type', 'income')
        .neq('status', 'cancelled');

    const unusedAmounts = (transactionRows || []).map((t) => Number(t.amount) || 0);

    // Match 1-1 theo số tiền trước
    const unmatchedPayments: typeof payments = [];
    for (const pay of payments) {
        const amount = Number(pay.amount) || 0;
        const idx = unusedAmounts.findIndex((a) => Math.abs(a - amount) < 1);
        if (idx >= 0) {
            unusedAmounts.splice(idx, 1);
        } else {
            unmatchedPayments.push(pay);
        }
    }

    // Trường hợp gộp: nhiều payment_records = 1 phiếu thu tổng trên sổ quỹ
    const unmatchedPayTotal = unmatchedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const unusedTransTotal = unusedAmounts.reduce((s, a) => s + a, 0);
    if (unmatchedPayments.length > 0 && Math.abs(unmatchedPayTotal - unusedTransTotal) < 1) {
        return { created: 0 };
    }

    let created = 0;
    for (const pay of unmatchedPayments) {
        const amount = Number(pay.amount) || 0;
        if (amount <= 0) continue;

        const notes =
            pay.notes ||
            pay.content ||
            `Đồng bộ phiếu thu từ đơn ${order.order_code}`;
        const category =
            pay.transaction_category ||
            (String(pay.content || '').toLowerCase().includes('cọc') ? 'Tiền cọc' : 'Thanh toán đơn hàng');
        const date = pay.created_at
            ? new Date(pay.created_at).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];

        let inserted = false;
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
            const transCode = await generateNextVoucherCode('income');
            const payload: Record<string, unknown> = {
                code: transCode,
                type: 'income',
                category,
                amount,
                payment_method: pay.payment_method || 'cash',
                notes: `${notes}${notes.includes(order.order_code) ? '' : ` - ${order.order_code}`}`,
                date,
                order_id: order.id,
                order_code: order.order_code,
                status: 'approved',
                created_by: pay.created_by,
                approved_by: pay.created_by,
                approved_at: pay.created_at || new Date().toISOString(),
            };
            if (pay.order_product_id) {
                payload.order_product_id = pay.order_product_id;
            }

            const { error } = await supabaseAdmin.from('transactions').insert(payload);
            if (!error) {
                inserted = true;
                created += 1;
            } else if (isUniqueViolation(error)) {
                continue;
            } else if (String(error.message || '').includes('order_product_id')) {
                delete payload.order_product_id;
                const retry = await supabaseAdmin.from('transactions').insert(payload);
                if (!retry.error) {
                    inserted = true;
                    created += 1;
                } else {
                    console.error('[syncOrderPaymentsToCashBook] insert error:', retry.error.message);
                    break;
                }
            } else {
                console.error('[syncOrderPaymentsToCashBook] insert error:', error.message);
                break;
            }
        }
    }

    if (created > 0) {
        console.log(`[syncOrderPaymentsToCashBook] order ${order.order_code}: created ${created} missing income voucher(s)`);
    }

    return { created };
}

export async function createOrderIncomeTransaction(opts: {
    orderId: string;
    orderCode: string;
    amount: number;
    paymentMethod: string;
    notes: string;
    createdBy: string;
    createdByName?: string;
    category?: string;
    orderProductId?: string | null;
    date?: string;
    imageUrl?: string | null;
}): Promise<{ id?: string; code?: string } | null> {
    if (opts.amount <= 0) return null;

    let transaction: { id: string; code: string } | null = null;
    let lastError: { message?: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
        const transCode = await generateNextVoucherCode('income');
        const payload: Record<string, unknown> = {
            code: transCode,
            type: 'income',
            category: opts.category || 'Thanh toán đơn hàng',
            amount: opts.amount,
            payment_method: opts.paymentMethod || 'cash',
            notes: opts.notes,
            date: opts.date || new Date().toISOString().split('T')[0],
            order_id: opts.orderId,
            order_code: opts.orderCode,
            status: 'approved',
            created_by: opts.createdBy,
            approved_by: opts.createdBy,
            approved_at: new Date().toISOString(),
        };
        if (opts.imageUrl) payload.image_url = opts.imageUrl;
        if (opts.orderProductId) payload.order_product_id = opts.orderProductId;

        const { data, error } = await supabaseAdmin
            .from('transactions')
            .insert(payload)
            .select('id, code')
            .single();

        if (!error && data) {
            transaction = data;
            break;
        }

        lastError = error;
        if (error && String(error.message || '').includes('order_product_id') && payload.order_product_id) {
            delete payload.order_product_id;
            const retry = await supabaseAdmin.from('transactions').insert(payload).select('id, code').single();
            if (!retry.error && retry.data) {
                transaction = retry.data;
                break;
            }
            lastError = retry.error;
        }
        if (!isUniqueViolation(error)) break;
    }

    if (!transaction) {
        console.error('[createOrderIncomeTransaction] insert error:', lastError?.message);
        return null;
    }

    let actorName = opts.createdByName || null;
    let actorRole = 'sale';
    if (!actorName && opts.createdBy) {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('id, name, role')
            .eq('id', opts.createdBy)
            .maybeSingle();
        actorName = user?.name || null;
        actorRole = user?.role || 'sale';
    }

    notifyFinanceEvent({
        event: 'receipt.created',
        title: 'Phiếu thu mới',
        message: `${actorName || 'Hệ thống'} đã tạo phiếu thu ${transaction.code}`,
        actor: { id: opts.createdBy, name: actorName || 'Hệ thống', role: actorRole },
        recipientUserIds: [opts.createdBy],
        data: {
            transaction_id: transaction.id,
            receipt_id: transaction.id,
            code: transaction.code,
            voucher_code: transaction.code,
            type: 'income',
            category: opts.category || 'Thanh toán đơn hàng',
            amount: opts.amount,
            payment_method: opts.paymentMethod || 'cash',
            status: 'approved',
            order_id: opts.orderId,
            order_code: opts.orderCode,
            notes: opts.notes,
            content: opts.notes,
            reason: opts.notes,
            created_by: opts.createdBy,
            created_by_name: actorName,
            collector_name: actorName,
            received_by_name: actorName,
        },
    });

    return transaction;
}
