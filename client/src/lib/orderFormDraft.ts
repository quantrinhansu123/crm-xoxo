export const CREATE_ORDER_DRAFT_KEY = 'draft:create-order:v1';

export function getEditOrderDraftKey(orderId: string) {
    return `draft:edit-order:${orderId}:v1`;
}

export interface OrderFormDraft {
    step: number;
    customerId: string;
    customerSearch: string;
    products: unknown[];
    currentProductId: string | null;
    notes: string;
    discount: number;
    discountType: 'amount' | 'percent';
    surcharges: unknown[];
    paidAmount: number;
    paymentMethod: 'cash' | 'transfer' | 'zalopay';
    addOnProducts: unknown[];
    confirmedProductIds: string[];
    savedAt: number;
}

export function saveOrderDraft(key: string, draft: OrderFormDraft): void {
    try {
        localStorage.setItem(key, JSON.stringify(draft));
    } catch {
        // ignore quota / private mode
    }
}

export function loadOrderDraft(key: string): OrderFormDraft | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as OrderFormDraft;
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

export function clearOrderDraft(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
}
