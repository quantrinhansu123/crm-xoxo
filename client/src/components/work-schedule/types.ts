import { type TimesheetStatus } from '@/hooks/useTimesheets';

export interface DialogData {
    employeeName: string;
    employeeCode: string;
    userId: string;
    date: Date;
    shiftId: string;
    shiftName: string;
    shiftTime: string;
    status: TimesheetStatus | 'not_checked_past';
    timesheetId?: string;
    checkIn?: string | null;
    checkOut?: string | null;
}

export interface ViolationRow {
    id: string;
    type: string;
    count: number;
    amount: number;
    total: number;
}

export interface RewardRow {
    id: string;
    type: string;
    count: number;
    amount: number;
    total: number;
}

export const VN_DAY_SHORT = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export const STATUS_CONFIG: Record<TimesheetStatus | 'not_checked_past', { label: string; color: string; dotClass: string }> = {
    on_time: { label: 'Đúng giờ', color: '#22c55e', dotClass: 'bg-green-500' },
    late_early: { label: 'Đi muộn / Về sớm', color: '#f59e0b', dotClass: 'bg-amber-500' },
    incomplete: { label: 'Chấm công thiếu', color: '#ef4444', dotClass: 'bg-red-500' },
    not_checked_past: { label: 'Chưa chấm công', color: '#f97316', dotClass: 'bg-orange-500' },
    not_checked: { label: 'Chưa chấm công', color: '#d1d5db', dotClass: 'bg-gray-300' },
    day_off: { label: 'Nghỉ làm', color: '#6b7280', dotClass: 'bg-gray-500' },
};

export const VIOLATION_TYPES = [
    'QUÊN CHẤM CÔNG',
    'ĐI MUỘN',
    'VỀ SỚM',
    'NGHỈ KHÔNG PHÉP',
    'VI PHẠM NỘI QUY',
];

export const REWARD_TYPES = [
    'CHẤM CÔNG ĐẦY ĐỦ',
    'LÀM THÊM GIỜ',
    'THÀNH TÍCH TỐT',
    'HỖ TRỢ ĐỒNG NGHIỆP',
];

export function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatVNDateShort(d: Date): string {
    return `${VN_DAY_SHORT[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
