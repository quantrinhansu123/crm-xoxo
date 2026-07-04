import { supabaseAdmin } from '../config/supabase.js';

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

export async function createOrderIncomeTransaction(opts: {
    orderId: string;
    orderCode: string;
    amount: number;
    paymentMethod: string;
    notes: string;
    createdBy: string;
    category?: string;
}): Promise<void> {
    if (opts.amount <= 0) return;

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
        category: opts.category || 'Thanh toán đơn hàng',
        amount: opts.amount,
        payment_method: opts.paymentMethod || 'cash',
        notes: opts.notes,
        date: new Date().toISOString().split('T')[0],
        order_id: opts.orderId,
        order_code: opts.orderCode,
        status: 'approved',
        created_by: opts.createdBy,
        approved_by: opts.createdBy,
        approved_at: new Date().toISOString(),
    });
}
