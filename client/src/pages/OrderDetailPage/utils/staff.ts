import type { OrderItem } from '@/hooks/useOrders';

/** Sale chốt = NV được gán trên từng dịch vụ (không phải NV tạo HĐ) */
export function getAssignedSaleNames(items: OrderItem[]): string {
    const names = new Set<string>();
    for (const item of items) {
        for (const s of (item as any).sales || []) {
            const name = s.sale?.name || s.name;
            if (name?.trim()) names.add(name.trim());
        }
    }
    return Array.from(names).join(', ');
}

/** KTV = tất cả NV kỹ thuật gán trên các dịch vụ của SP */
export function getAssignedTechnicianNames(items: OrderItem[]): string {
    const names = new Set<string>();
    for (const item of items) {
        const techs = (item as any).technicians || [];
        if (techs.length > 0) {
            for (const t of techs) {
                const name = t.technician?.name || t.name;
                if (name?.trim()) names.add(name.trim());
            }
        } else if ((item as any).technician?.name?.trim()) {
            names.add((item as any).technician.name.trim());
        }
    }
    return Array.from(names).join(', ');
}
