import { Phone, Check, ArrowRightLeft, Users, TrendingUp, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Kanban column configuration with colors based on pipeline_stage
export interface KanbanColumnConfig {
    id: string;
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    textColor: string;
    icon: LucideIcon;
}

export const kanbanColumns: KanbanColumnConfig[] = [
    {
        id: 'xac_dinh_nhu_cau',
        label: 'Xác định nhu cầu',
        color: 'bg-orange-500',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        textColor: 'text-orange-700',
        icon: UserPlus
    },
    {
        id: 'hen_gui_anh',
        label: 'Hẹn gửi ảnh',
        color: 'bg-slate-500',
        bgColor: 'bg-slate-50',
        borderColor: 'border-slate-200',
        textColor: 'text-slate-700',
        icon: Phone
    },
    {
        id: 'dam_phan_gia',
        label: 'Đàm phán giá',
        color: 'bg-purple-500',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
        textColor: 'text-purple-700',
        icon: Users
    },
    {
        id: 'hen_qua_ship',
        label: 'Hẹn qua hoặc ship',
        color: 'bg-slate-500',
        bgColor: 'bg-slate-50',
        borderColor: 'border-slate-200',
        textColor: 'text-slate-700',
        icon: TrendingUp
    },
    {
        id: 'chot_don',
        label: 'Chốt đơn',
        color: 'bg-green-500',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-700',
        icon: Check
    },
    {
        id: 'fail',
        label: 'Fail (khách rời)',
        color: 'bg-red-500',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-700',
        icon: ArrowRightLeft
    }
];

export const sourceLabels: Record<string, { label: string; color: string }> = {
    facebook: { label: 'Facebook', color: 'bg-blue-100 text-blue-700' },
    google: { label: 'Google', color: 'bg-red-100 text-red-700' },
    zalo: { label: 'Zalo', color: 'bg-sky-100 text-sky-700' },
    website: { label: 'Website', color: 'bg-purple-100 text-purple-700' },
    referral: { label: 'Giới thiệu', color: 'bg-green-100 text-green-700' },
    'walk-in': { label: 'Walk-in', color: 'bg-amber-100 text-amber-700' },
    other: { label: 'Khác', color: 'bg-gray-100 text-gray-700' }
};

// Legacy status labels for old data migration
export const legacyStatusLabels: Record<string, string> = {
    new: 'Mới',
    contacted: 'Đã liên hệ',
    qualified: 'Đủ điều kiện',
    nurturing: 'Đang chăm sóc',
    converted: 'Đã chuyển đổi',
    closed: 'Đã chốt',
    lost: 'Mất khách',
};

// Helper to get status label (checks both new kanban columns and legacy labels)
export function getStatusLabel(statusId: string): string {
    const column = kanbanColumns.find(c => c.id === statusId);
    if (column) return column.label;
    if (legacyStatusLabels[statusId]) return legacyStatusLabels[statusId];
    return statusId;
}

export interface CreateLeadFormData {
    name: string;
    phone: string;
    email: string;
    company: string;
    address: string;
    source: string;
    lead_type: string;
    assigned_to: string;
    notes: string;
    fb_thread_id: string;
    link_message: string;
    fb_profile_pic: string;
    fb_link: string;
    dob: string;
    appointment_time: string;
}

export const SLA_CYCLES = [3, 60, 180, 300, 420, 1440, 2880, 3120, 4020, 5160, 6600];

