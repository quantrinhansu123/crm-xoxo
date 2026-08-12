import type { OrderItem } from '@/hooks/useOrders';
import { toast } from 'sonner';

export function parsePhotoList(value: unknown): string[] {
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

/** Giữ ảnh/người chụp đã lưu ở bước trước nếu form hiện tại chưa điền lại. */
export function resolveAfter1CompletionData(
    product: Pick<OrderItem, 'completion_photos' | 'aftersale_receiver_name'> | null | undefined,
    formOverride?: After1FormOverride,
): { photos: string[]; receiver: string } {
    const formPhotos = formOverride?.completion_photos;
    const photos =
        formPhotos && formPhotos.length > 0
            ? formPhotos
            : parsePhotoList(product?.completion_photos);
    const receiver = (
        formOverride?.aftersale_receiver_name?.trim()
        || (product as any)?.aftersale_receiver_name?.trim()
        || ''
    );
    return { photos, receiver };
}

/**
 * Ảnh hoàn thiện → Kiểm nợ
 * Mỗi sản phẩm trong cùng đơn phải điền độc lập — nhận dữ liệu từ chính sản phẩm (product/item), không dùng chung cấp đơn.
 */
export function getAfter1ToDebtValidationErrors(
    product: Pick<OrderItem, 'completion_photos' | 'aftersale_receiver_name'> | null | undefined,
    formOverride?: After1FormOverride,
): string[] {
    const errors: string[] = [];
    const { photos, receiver } = resolveAfter1CompletionData(product, formOverride);

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
 * Bắt buộc tick "Xác nhận đã kiểm nợ" trước khi chuyển bước.
 */
export function getAfter1DebtToAfter2ValidationErrors(
    product?: Pick<OrderItem, 'debt_checked' | 'debt_checked_by_name'> | null,
    formOverride?: After1DebtFormOverride,
): string[] {
    const errors: string[] = [];
    const debtChecked = formOverride?.debt_checked ?? !!(product as any)?.debt_checked;
    if (!debtChecked) {
        errors.push('Tick "Xác nhận đã kiểm nợ"');
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

export type After2DeliveryForm = {
    delivery_type?: 'ship' | 'pickup' | string | null;
    delivery_creator_name?: string | null;
    delivery_shipper_phone?: string | null;
    delivery_staff_name?: string | null;
    delivery_carrier?: string | null;
    delivery_received_at?: string | null;
};

/** Validate giao hàng bước after2 — chỉ bắt field của phương thức đang chọn (ship hoặc khách đến lấy). */
export function getAfter2DeliveryValidationErrors(
    data: After2DeliveryForm,
    orderDeliveryType?: string | null,
): string[] {
    const isPickup = (data.delivery_type || orderDeliveryType) === 'pickup';
    const errors: string[] = [];

    if (!String(data.delivery_shipper_phone || '').trim()) {
        errors.push(isPickup ? 'Nhập SĐT liên hệ' : 'Nhập SDT ship lấy hàng');
    }
    if (!String(data.delivery_received_at || '').trim()) {
        errors.push(isPickup ? 'Chọn thời gian nhận đồ' : 'Chọn thời gian khách nhận');
    }
    if (isPickup) {
        if (!String(data.delivery_staff_name || '').trim()) {
            errors.push('Chọn NV giao đồ');
        }
    } else {
        if (!String(data.delivery_creator_name || '').trim()) {
            errors.push('Chọn NV tạo đơn');
        }
        if (!String(data.delivery_carrier || '').trim()) {
            errors.push('Chọn NV vận chuyển / đơn vị');
        }
    }
    return errors;
}

export function isAfter2DeliveryFormComplete(
    data: After2DeliveryForm,
    orderDeliveryType?: string | null,
): boolean {
    return getAfter2DeliveryValidationErrors(data, orderDeliveryType).length === 0;
}
