import { Ban, CheckCircle2, Clock, HeartHandshake, ShoppingCart, type LucideIcon } from 'lucide-react';
import type { OrderStatus, Package as PackageType, Voucher } from '@/types';
import type { Order } from '@/hooks/useOrders';

export interface KanbanColumn {
    id: OrderStatus;
    title: string;
    icon: LucideIcon;
    color: string;
    bgColor: string;
    borderColor: string;
}

/** Kanban Kỹ thuật: 3 phòng cố định. step_order 1 → Phòng Mạ, 2 → Dán đế, 3 → Phòng Da */
export const TECH_ROOM_IDS = ['phong_ma', 'phong_dan_de', 'phong_da'] as const;
export type TechRoomId = (typeof TECH_ROOM_IDS)[number];
export const TECH_ROOMS: { id: TechRoomId; title: string; stepOrder: number }[] = [
    { id: 'phong_ma', title: 'Phòng Mạ', stepOrder: 1 },
    { id: 'phong_dan_de', title: 'Phòng Dán đế', stepOrder: 2 },
    { id: 'phong_da', title: 'Phòng Da', stepOrder: 3 },
];
export function getTechRoomByStepOrder(stepOrder: number): TechRoomId {
    if (stepOrder <= 1) return 'phong_ma';
    if (stepOrder === 2) return 'phong_dan_de';
    return 'phong_da';
}

/** Ánh xạ tên bộ phận (department) sang phòng – dùng khi bước có department thay vì chỉ step_order */
export function getTechRoomByDepartmentName(departmentName: string | undefined | null): TechRoomId | null {
    if (!departmentName || typeof departmentName !== 'string') return null;
    const n = departmentName.toLowerCase().trim();
    if (n.includes('dán đế') || n.includes('dan de')) return 'phong_dan_de';
    if (n.includes('mạ') || n === 'ma') return 'phong_ma';
    if (n.includes('da') && !n.includes('dán')) return 'phong_da';
    return null;
}

export const columns: KanbanColumn[] = [
    { id: 'before_sale', title: 'Before Sale', icon: ShoppingCart, color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
    { id: 'in_progress', title: 'Đang thực hiện', icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
    { id: 'done', title: 'Đã hoàn thiện', icon: CheckCircle2, color: 'text-cyan-600', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200' },
    { id: 'after_sale', title: 'After sale', icon: HeartHandshake, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
    { id: 'cancelled', title: 'Đã huỷ', icon: Ban, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' }
];

export function calculateSLAProgress(deadline: string | undefined, createdAt: string): { percentage: number; label: string; color: string } {
    if (!deadline) {
        return { percentage: 0, label: 'N/A', color: 'bg-gray-500' };
    }
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const createdDate = new Date(createdAt);

    const total = deadlineDate.getTime() - createdDate.getTime();
    const elapsed = now.getTime() - createdDate.getTime();
    const percentage = Math.min(100, Math.max(0, (elapsed / total) * 100));

    const hoursLeft = Math.max(0, (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60));

    let label: string;
    let color: string;

    if (hoursLeft <= 0) {
        label = 'Quá hạn';
        color = 'bg-red-500';
    } else if (hoursLeft <= 2) {
        label = `${Math.round(hoursLeft * 60)} phút`;
        color = 'bg-red-500';
    } else if (hoursLeft <= 8) {
        label = `${Math.round(hoursLeft)} giờ`;
        color = 'bg-amber-500';
    } else {
        label = `${Math.round(hoursLeft)} giờ`;
        color = 'bg-emerald-500';
    }

    return { percentage, label, color };
}

export function getItemTypeLabel(type: string): string {
    switch (type) {
        case 'product': return 'SP';
        case 'service': return 'DV';
        case 'package': return 'Gói';
        case 'voucher': return 'VC';
        default: return type;
    }
}

export function getItemTypeColor(type: string): string {
    switch (type) {
        case 'product': return 'bg-blue-100 text-blue-700';
        case 'service': return 'bg-purple-100 text-purple-700';
        case 'package': return 'bg-emerald-100 text-emerald-700';
        case 'voucher': return 'bg-amber-100 text-amber-700';
        default: return 'bg-gray-100 text-gray-700';
    }
}

/** Hạn còn lại phòng: từ order_item_steps (started_at + estimated_duration ngày + sla_total_paused_minutes) */
export function getRoomDeadlineDisplay(
    items: Array<{ order_item_steps?: Array<{ started_at?: string; estimated_duration?: number; status: string; sla_paused_at?: string | null; sla_total_paused_minutes?: number }> }>
): { label: string; color: string } {
    let earliestDueAt: Date | null = null;
    let isPaused = false;

    for (const item of items || []) {
        const steps = item.order_item_steps || [];
        for (const step of steps) {
            if (step.status !== 'in_progress' && step.status !== 'pending' && step.status !== 'assigned') continue;
            const days = Number(step.estimated_duration) || 0;
            const baseAt = step.started_at;
            if (!baseAt || days <= 0) continue;
            
            if (step.sla_paused_at) {
                isPaused = true;
            }

            const base = new Date(baseAt);
            const dueAt = new Date(base);
            dueAt.setDate(dueAt.getDate() + days);
            
            // Cộng thêm thời gian đã pause trước đó
            if (step.sla_total_paused_minutes) {
                dueAt.setMinutes(dueAt.getMinutes() + step.sla_total_paused_minutes);
            }

            // Cộng thêm thời gian đang pause hiện tại
            if (step.sla_paused_at) {
                const pausedAt = new Date(step.sla_paused_at);
                const currentPausedMinutes = Math.max(0, Math.round((Date.now() - pausedAt.getTime()) / 60000));
                dueAt.setMinutes(dueAt.getMinutes() + currentPausedMinutes);
            }

            if (!earliestDueAt || dueAt.getTime() < earliestDueAt.getTime()) {
                earliestDueAt = dueAt;
            }
        }
    }
    
    if (isPaused) return { label: '⏸ Đang tạm dừng', color: 'text-amber-600 font-medium animate-pulse' };
    if (!earliestDueAt) return { label: 'N/A', color: 'text-muted-foreground' };
    
    const diff = Math.ceil((earliestDueAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: `Trễ ${Math.abs(diff)} ngày`, color: 'text-red-600' };
    return { label: `Còn ${diff} ngày`, color: diff <= 2 ? 'text-amber-600' : 'text-emerald-600' };
}

// Shared types for dialogs
export interface TechnicianAssignment {
    technician_id: string;
    technician_name?: string;
    commission_rate: number; // Percentage 0-100
}

export interface PackageServiceAssignment {
    service_id: string;
    service_name: string;
    department?: string;
    technicians?: TechnicianAssignment[]; // Multiple technicians with commission
}

export interface OrderItem {
    type: 'product' | 'service' | 'package';
    item_id: string;
    item_code?: string; // Temporary unique code for QR generation
    is_customer_item?: boolean;
    original_id?: string;
    name: string;
    quantity: number;
    unit_price: number;
    commission_sale?: number; // Sales commission percentage
    commission_tech?: number; // Technician commission percentage
    technicians?: TechnicianAssignment[]; // Multiple technicians with commission
    department?: string; // Department of the service
    package_services?: PackageServiceAssignment[]; // Services in package for technician assignment
    warranty_code?: string | null;
    care_warranty_flow?: string | null;
    care_warranty_stage?: string | null;
}

export interface CreateOrderData {
    customer_id: string;
    items: Array<{
        type: string;
        item_id: string;
        name: string;
        quantity: number;
        unit_price: number;
        technicians?: TechnicianAssignment[];
    }>;
    notes?: string;
    discount?: number;
}

export interface UpdateOrderData {
    items: Array<{
        type: string;
        item_id: string;
        name: string;
        quantity: number;
        unit_price: number;
        technicians?: TechnicianAssignment[];
        is_customer_item?: boolean;
        original_id?: string;
    }>;
    notes?: string;
    discount?: number;
}

export interface OrderDialogProps {
    products: { id: string; name: string; price: number }[];
    services: { id: string; name: string; price: number; department?: string }[];
    packages: PackageType[];
    vouchers: Voucher[];
}

export interface CustomerOption {
    id: string;
    name: string;
    phone: string;
    status?: string;
}
export const ACCESSORY_LABELS: Record<string, string> = {
    requested: 'Chờ duyệt',
    need_buy: 'Cần mua',
    bought: 'Đã mua',
    waiting_ship: 'Chờ ship',
    shipped: 'Ship tới',
    delivered_to_tech: 'Giao KT',
    rejected: 'Bị từ chối',
};

export const PARTNER_LABELS: Record<string, string> = {
    requested: 'Chờ duyệt',
    ship_to_partner: 'Ship Đối tác',
    partner_doing: 'Đối tác làm',
    ship_back: 'Ship về Shop',
    done: 'Done',
    rejected: 'Bị từ chối',
};

export const EXTENSION_LABELS: Record<string, string> = {
    requested: 'Đã yêu cầu',
    manager_approved: 'QL đã duyệt',
    sale_contacted: 'Sale đã liên hệ',
    notified_tech: 'Đã báo KT',
    rejected: 'Bị từ chối',
};

export const REQUEST_SLA: Record<string, number> = {
    // Accessory (in hours)
    need_buy: 24,
    bought: 24,
    waiting_ship: 144, // 6 days
    shipped: 12,

    // Partner (in hours)
    ship_to_partner: 24,
    partner_doing: 0,
    ship_back: 24,

    // Extension
    requested: -3, // warning 3h before
    manager_approved: 1,
    sale_contacted: 1,
    notified_tech: 1,
    rejected: 0,
};

