// Constants and label mappings for OrderDetailPage

export const ACCESSORY_LABELS: Record<string, string> = {
    need_buy: 'Cần mua',
    bought: 'Đã mua',
    waiting_ship: 'Chờ ship',
    shipped: 'Ship tới',
    delivered_to_tech: 'Giao KT',
};

export const PARTNER_LABELS: Record<string, string> = {
    ship_to_partner: 'Ship ĐT',
    partner_doing: 'ĐT làm',
    ship_back: 'Ship về',
    done: 'Done',
};

export const EXTENSION_LABELS: Record<string, string> = {
    requested: 'Đã yêu cầu',
    sale_contacted: 'Sale đã liên hệ',
    manager_approved: 'QL đã duyệt',
    notified_tech: 'Đã báo KT',
    kpi_recorded: 'Đã ghi KPI',
};

export const SALES_STEPS = [
    { id: 'step1', label: '1. Nhận đồ & Chụp ảnh', title: 'Nhận đồ & Chụp ảnh', color: 'text-blue-500', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', estimated_minutes: 30 },
    { id: 'step2', label: '2. TAGS+FORM TÚI+SHOESTREE', title: 'TAGS+FORM TÚI+SHOESTREE', color: 'text-blue-500', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', estimated_minutes: 20 },
    { id: 'step3', label: '3. Trao đổi KT', title: 'Trao đổi KT', color: 'text-blue-500', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', estimated_minutes: 30 },
    { id: 'step4', label: '4. Chờ kỹ thuật xem xét', title: 'Chờ kỹ thuật xem xét', color: 'text-red-500', bgColor: 'bg-red-50', borderColor: 'border-red-200', isAlert: true, estimated_minutes: 60 },
    { id: 'step5', label: '5. Chốt đơn', title: 'Chốt đơn', color: 'text-green-500', bgColor: 'bg-green-50', borderColor: 'border-green-200', isSuccess: true, estimated_minutes: 240 },
    { id: 'cancelled', label: 'X. Hủy đơn', title: 'Hủy đơn', color: 'text-gray-500', bgColor: 'bg-gray-50', borderColor: 'border-gray-200', isCancelled: true },
];

export const SALES_STATUS_LABELS: Record<string, string> = {
    pending: '1. Nhận đồ & Chụp ảnh',
    before_sale: '1. Nhận đồ & Chụp ảnh',
    step1: '1. Nhận đồ & Chụp ảnh',
    step2: '2. TAGS+FORM TÚI+SHOESTREE',
    step3: '3. Trao đổi KT',
    step4: '4. Chờ kỹ thuật xem xét',
    step5: '5. Chốt đơn',
    assigned: 'Đã phân công',
    in_progress: 'Đang thực hiện',
    completed: 'Hoàn thành',
    cancelled: 'Đã huỷ',
};

export const AFTER_SALE_STAGE_LABELS: Record<string, string> = {
    after1: 'Ảnh hoàn thiện',
    after1_debt: 'Kiểm nợ',
    after2: 'Đóng gói & Giao hàng',
    after3: 'Nhắn HD & Feedback',
    after4: 'Lưu Trữ',
};

export const CARE_WARRANTY_STAGE_LABELS: Record<string, string> = {
    war1: '1. Tiếp nhận',
    war2: '2. Xử lý',
    war3: '3. Đã tạo HD Bảo hành',
    care6: 'Mốc 6 Tháng',
    care12: 'Mốc 12 Tháng',
    'care-custom': 'Lịch Riêng',
};

export const TECH_ROOMS = [
    { id: 'room1', title: 'Phòng Kỹ thuật 1' },
    { id: 'room2', title: 'Phòng Kỹ thuật 2' },
    { id: 'room3', title: 'Phòng Kỹ thuật 3' },
    { id: 'room4', title: 'Phòng Kỹ thuật 4' },
];

export const columns = [
    { id: 'before_sale', title: 'Đang lên đơn' },
    { id: 'in_progress', title: 'Đang thực hiện' },
    { id: 'done', title: 'Hoàn thành' },
    { id: 'after_sale', title: 'After sale' },
    { id: 'cancelled', title: 'Đã huỷ' },
];

export function getSalesStatusLabel(value: string | null | undefined): string {
    if (value == null || value === '') return '—';
    return SALES_STATUS_LABELS[value] ?? value;
}

export function getAfterSaleStageLabel(value: string | null | undefined): string {
    if (value == null || value === '') return '—';
    return AFTER_SALE_STAGE_LABELS[value] ?? value;
}

/** Bước after-sale của 1 dòng (ưu tiên after_sale_stage khi đang aftersale — tránh lệch phase_stage cũ) */
export function getItemAfterSaleStage(item: {
    current_phase?: string | null;
    phase_stage?: string | null;
    after_sale_stage?: string | null;
} | null | undefined): string {
    if (!item) return 'after1';
    const afterStages = new Set(['after1', 'after1_debt', 'after2', 'after3', 'after4']);
    const after = item.after_sale_stage || null;
    const phase = item.phase_stage || null;
    if (item.current_phase === 'after_sale' || (after && afterStages.has(after))) {
        return after || (phase && afterStages.has(phase) ? phase : null) || 'after1';
    }
    if (phase && afterStages.has(phase)) return phase;
    return phase || after || 'after1';
}

/** Bước after-sale của nhóm sản phẩm trên Kanban */
/**
 * Trường cấp đơn được phép PATCH khi lưu form after-sale (không gồm bước SP).
 * Các trường debt_checked/debt_checked_notes/debt_checked_by_name/aftersale_receiver_name/
 * delivery_creator_name/delivery_shipper_phone/delivery_staff_name/delivery_received_at đã
 * chuyển sang lưu độc lập theo từng sản phẩm (item-level) — không còn ở đây để tránh
 * các sản phẩm khác trong cùng đơn bị dùng chung dữ liệu.
 */
export const ORDER_LEVEL_AFTERSALE_PATCH_KEYS = new Set([
    'debt_payment_photos',
    // Đồng bộ xác nhận kiểm nợ cấp đơn (server/legacy gate còn đọc order.debt_checked)
    'debt_checked',
    'debt_checked_notes',
    'debt_checked_by_name',
    'packaging_photos',
    'delivery_carrier',
    'delivery_address',
    'delivery_self_pickup',
    'delivery_type',
    'delivery_code',
    'delivery_fee',
    'aftersale_return_user_name',
    'delivery_notes',
    'hd_sent',
    'hd_sent_photos',
    'feedback_requested',
    'feedback_requested_photos',
    'notes',
    'delivery_payment_method',
]);

export function pickOrderLevelAfterSalePatch(patch: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(patch).filter(([key]) => ORDER_LEVEL_AFTERSALE_PATCH_KEYS.has(key))
    );
}

export function getGroupAfterSaleStage(group: {
    product?: { current_phase?: string | null; phase_stage?: string | null; after_sale_stage?: string | null } | null;
    services?: { current_phase?: string | null; phase_stage?: string | null; after_sale_stage?: string | null }[];
}): string | null {
    const afterStages = new Set(['after1', 'after1_debt', 'after2', 'after3', 'after4']);

    // Luôn lấy stage của đúng product head — không lấy stage service (tránh 1 SP kéo theo SP khác cùng HĐ)
    if (group.product) {
        const phase = group.product.current_phase;
        if (phase === 'care' || phase === 'warranty') return null;

        // An explicit phase is authoritative. Stale after-sale stage columns must
        // not make a Sales/Workflow product appear in two processes at once.
        if (phase && phase !== 'after_sale') return null;

        const after = group.product.after_sale_stage;
        const pStage = group.product.phase_stage;
        const inAfterSale =
            phase === 'after_sale'
            || (!!after && afterStages.has(after))
            || (!!pStage && afterStages.has(pStage));

        return inAfterSale ? getItemAfterSaleStage(group.product) : null;
    }

    const svc = (group.services || []).find((s) => s.current_phase === 'after_sale');
    return svc ? getItemAfterSaleStage(svc) : null;
}

export function getCareWarrantyStageLabel(value: string | null | undefined): string {
    if (value == null || value === '') return '—';
    return CARE_WARRANTY_STAGE_LABELS[value] ?? value;
}
