// Utility functions for OrderDetailPage

export const getItemTypeLabel = (type: string) => {
    switch (type) {
        case 'product': return 'Sản phẩm';
        case 'service': return 'Dịch vụ';
        case 'package': return 'Gói dịch vụ';
        case 'voucher': return 'Voucher';
        default: return type;
    }
};

export const getItemTypeColor = (type: string) => {
    switch (type) {
        case 'product': return 'bg-blue-100 text-blue-700';
        case 'service': return 'bg-purple-100 text-purple-700';
        case 'package': return 'bg-emerald-100 text-emerald-700';
        case 'voucher': return 'bg-amber-100 text-amber-700';
        default: return 'bg-gray-100 text-gray-700';
    }
};

// Loại sản phẩm của khách (Giày, Túi xách, Ví...) - khớp với CreateOrderPage PRODUCT_TYPES
export const getCustomerProductTypeLabel = (value: string | null | undefined) => {
    if (!value) return 'Sản phẩm của khách';
    const labels: Record<string, string> = {
        giày: 'Giày', túi: 'Túi xách', ví: 'Ví', 'thắt lưng': 'Thắt lưng',
        dép: 'Dép', mũ: 'Mũ/Nón', khác: 'Khác'
    };
    return labels[value] || value;
};

export const getStatusVariant = (status: string): 'success' | 'danger' | 'warning' | 'info' | 'purple' => {
    if (status === 'step4') return 'danger';
    if (status === 'step5') return 'success';
    if (status.startsWith('step')) return 'info';

    switch (status) {
        case 'after_sale': return 'success';
        case 'cancelled': return 'danger';
        case 'in_progress': return 'warning';
        case 'done': return 'purple';
        default: return 'info';
    }
};

// SLA display: còn X ngày / trễ X ngày (từ thời điểm due)
export const getSLADisplay = (dueAt: string | Date | null | undefined) => {
    if (!dueAt) return 'N/A';
    const diff = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff < 0 ? `Trễ ${Math.abs(diff)} ngày` : `Còn ${diff} ngày`;
};

// Format elapsed time for timer display
export const formatElapsedTime = (startTime: string | undefined) => {
    if (!startTime) return '--:--:--';
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const elapsed = Math.max(0, now - start);
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
