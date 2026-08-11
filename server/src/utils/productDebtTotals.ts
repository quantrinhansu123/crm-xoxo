/**
 * Tính tổng tiền cần thu theo SP: dịch vụ + phụ thu SP + phần phụ thu cấp đơn (phí gấp/ship…).
 * Đồng bộ logic với ProductDetailDialog (client).
 */

export type SurchargeLike = {
    amount?: number | null;
    value?: number | null;
    isPercent?: boolean | null;
    is_percent?: boolean | null;
};

export type ProductDebtInput = {
    id: string;
    serviceTotal: number;
    productSurchargeAmount?: number | null;
    productSurcharges?: SurchargeLike[] | null;
    isWarranty?: boolean;
};

export function sumSurchargeList(
    list: SurchargeLike[] | null | undefined,
    percentBase: number
): number {
    if (!Array.isArray(list) || list.length === 0) return 0;
    return list.reduce((sum, s) => {
        const explicit = Number(s?.amount);
        if (Number.isFinite(explicit) && explicit > 0) return sum + explicit;
        const value = Number(s?.value || 0);
        const isPercent = Boolean(s?.isPercent ?? s?.is_percent);
        return sum + (isPercent ? Math.round((percentBase * value) / 100) : value);
    }, 0);
}

export function resolveProductSurcharge(
    productSurchargeAmount: number | null | undefined,
    productSurcharges: SurchargeLike[] | null | undefined,
    serviceTotal: number
): number {
    const stored = Number(productSurchargeAmount || 0);
    if (stored > 0) return stored;
    return sumSurchargeList(productSurcharges, serviceTotal);
}

export function resolveOrderLevelSurcharge(order: {
    surcharges_amount?: number | null;
    surcharges?: SurchargeLike[] | null;
    subtotal?: number | null;
    total_amount?: number | null;
    discount?: number | null;
}): number {
    const stored = Number(order.surcharges_amount || 0);
    if (stored > 0) return stored;
    const subtotalForPercent =
        Number(order.subtotal) ||
        Math.max(
            0,
            Number(order.total_amount || 0) - Number(order.surcharges_amount || 0) + Number(order.discount || 0)
        );
    return sumSurchargeList(order.surcharges, subtotalForPercent);
}

export function isWarrantyProduct(row: {
    care_warranty_flow?: string | null;
    current_phase?: string | null;
    care_warranty_stage?: string | null;
    phase_stage?: string | null;
    warranty_code?: string | null;
} | null | undefined): boolean {
    if (!row) return false;
    return (
        row.care_warranty_flow === 'warranty' ||
        row.current_phase === 'warranty' ||
        String(row.care_warranty_stage || row.phase_stage || '').startsWith('war') ||
        String(row.warranty_code || '').startsWith('HDBH')
    );
}

/** Trả về total_amount theo id SP = service + product surcharge + share phụ thu đơn. */
export function enrichProductTotalsWithSurcharges(
    products: ProductDebtInput[],
    orderLevelSurcharge: number
): Record<string, number> {
    const totals: Record<string, number> = {};
    const bases: Array<{ id: string; base: number; isWarranty: boolean }> = [];

    for (const p of products) {
        const productSurcharge = resolveProductSurcharge(
            p.productSurchargeAmount,
            p.productSurcharges,
            p.serviceTotal
        );
        const base = Math.max(0, Number(p.serviceTotal || 0) + productSurcharge);
        const isWarranty = Boolean(p.isWarranty);
        bases.push({ id: p.id, base, isWarranty });
        totals[p.id] = isWarranty ? 0 : base;
    }

    const orderSurcharge = Math.max(0, Number(orderLevelSurcharge) || 0);
    if (orderSurcharge <= 0) return totals;

    const allocTargets = bases.filter((b) => !b.isWarranty);
    if (allocTargets.length === 0) return totals;

    const baseSum = allocTargets.reduce((sum, b) => sum + b.base, 0);
    let allocated = 0;
    allocTargets.forEach((b, idx) => {
        const share =
            idx === allocTargets.length - 1
                ? Math.max(0, orderSurcharge - allocated)
                : baseSum > 0
                  ? Math.round((orderSurcharge * b.base) / baseSum)
                  : 0;
        allocated += share;
        totals[b.id] = (totals[b.id] || 0) + share;
    });

    return totals;
}
