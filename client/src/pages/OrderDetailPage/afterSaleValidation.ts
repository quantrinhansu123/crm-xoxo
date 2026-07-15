import type { OrderItem } from '@/hooks/useOrders';
import { toast } from 'sonner';

function parsePhotoList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((url): url is string => typeof url === 'string' && url.length > 0);
    }
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((url): url is string => typeof url === 'string' && url.length > 0);
            }
        } catch {
            return [value];
        }
    }
    return [];
}

export type After1FormOverride = {
    aftersale_receiver_name?: string;
    completion_photos?: string[];
};

/**
 * Ảnh hoàn thiện → Kiểm nợ
 * Mỗi sản phẩm trong cùng đơn phải điền độc lập — nhận dữ liệu từ chính sản phẩm (product/item), không dùng chung cấp đơn.
 */
export function getAfter1ToDebtValidationErrors(
    product: Pick<OrderItem, 'completion_photos' | 'aftersale_receiver_name'> | null | undefined,
    formOverride?: After1FormOverride,
): string[] {
    const errors: string[] = [];
    const receiver = (formOverride?.aftersale_receiver_name ?? (product as any)?.aftersale_receiver_name ?? '').trim();
    const photos = formOverride?.completion_photos ?? parsePhotoList(product?.completion_photos);

    if (!receiver) {
        errors.push('Chọn "Người chụp After"');
    }
    if (photos.length === 0) {
        errors.push('Upload ít nhất một "Ảnh hoàn thiện"');
    }

    return errors;
}

export type After1DebtFormOverride = {
    debt_checked?: boolean;
    debt_checked_by_name?: string;
};

/**
 * Kiểm nợ → Đóng gói & Giao hàng
 * Mỗi sản phẩm trong cùng đơn phải điền độc lập — nhận dữ liệu từ chính sản phẩm (product/item), không dùng chung cấp đơn.
 */
export function getAfter1DebtToAfter2ValidationErrors(
    product: Pick<OrderItem, 'debt_checked' | 'debt_checked_by_name'> | null | undefined,
    formOverride?: After1DebtFormOverride,
): string[] {
    const errors: string[] = [];
    const debtChecked = formOverride?.debt_checked ?? (product as any)?.debt_checked;
    const collector = (formOverride?.debt_checked_by_name ?? (product as any)?.debt_checked_by_name ?? '').trim();

    if (!debtChecked) {
        errors.push('Tick "Xác nhận đã kiểm nợ"');
    }
    if (!collector) {
        errors.push('Chọn "Người thu tiền"');
    }

    return errors;
}

export function showAfterSaleValidationToast(errors: string[]): void {
    if (errors.length === 0) return;

    toast.error('Vui lòng hoàn thành để chuyển bước', {
        description: errors.map((line) => `• ${line}`).join('\n'),
        duration: 6000,
    });
}
