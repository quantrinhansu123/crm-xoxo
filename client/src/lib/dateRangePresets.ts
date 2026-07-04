export type DateRangePreset =
    | 'all'
    | 'today'
    | 'yesterday'
    | 'this_week'
    | 'this_month'
    | 'this_year'
    | 'custom';

export const DATE_RANGE_PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
    { value: 'all', label: 'Tất cả' },
    { value: 'today', label: 'Hôm nay' },
    { value: 'yesterday', label: 'Hôm qua' },
    { value: 'this_week', label: 'Tuần này' },
    { value: 'this_month', label: 'Tháng này' },
    { value: 'this_year', label: 'Năm nay' },
    { value: 'custom', label: 'Tùy chọn' },
];

function localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

/** Trả về khoảng ngày (YYYY-MM-DD) theo preset; null = không lọc */
export function getDateRangeForPreset(preset: DateRangePreset): { from: string; to: string } | null {
    if (preset === 'all' || preset === 'custom') return null;

    const now = new Date();
    const today = startOfDay(now);

    switch (preset) {
        case 'today':
            return { from: localDateStr(today), to: localDateStr(today) };
        case 'yesterday': {
            const y = new Date(today);
            y.setDate(y.getDate() - 1);
            return { from: localDateStr(y), to: localDateStr(y) };
        }
        case 'this_week': {
            const day = today.getDay();
            const mondayOffset = day === 0 ? -6 : 1 - day;
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() + mondayOffset);
            return { from: localDateStr(weekStart), to: localDateStr(today) };
        }
        case 'this_month':
            return {
                from: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
                to: localDateStr(today),
            };
        case 'this_year':
            return {
                from: localDateStr(new Date(now.getFullYear(), 0, 1)),
                to: localDateStr(today),
            };
        default:
            return null;
    }
}

export function detectPresetFromRange(from: string, to: string): DateRangePreset {
    if (!from && !to) return 'all';
    if (!from || !to) return 'custom';
    for (const opt of DATE_RANGE_PRESET_OPTIONS) {
        if (opt.value === 'all' || opt.value === 'custom') continue;
        const range = getDateRangeForPreset(opt.value);
        if (range && range.from === from && range.to === to) return opt.value;
    }
    return 'custom';
}
