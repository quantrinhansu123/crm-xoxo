export type ChartRangePreset =
    | 'today'
    | 'yesterday'
    | 'last_week'
    | 'this_month'
    | 'last_month'
    | 'custom';

export const CHART_RANGE_OPTIONS: { value: ChartRangePreset; label: string }[] = [
    { value: 'today', label: 'Hôm nay' },
    { value: 'yesterday', label: 'Hôm qua' },
    { value: 'last_week', label: '7 ngày qua' },
    { value: 'last_month', label: 'Tháng trước' },
    { value: 'this_month', label: 'Tháng này' },
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

function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

/** Mirrors server resolveChartRange for syncing preset → date inputs */
export function getChartPresetRange(preset: ChartRangePreset): { from: string; to: string; label: string } {
    const now = new Date();
    const today = startOfDay(now);

    switch (preset) {
        case 'today':
            return { from: localDateStr(today), to: localDateStr(today), label: 'Hôm nay' };
        case 'yesterday': {
            const y = new Date(today);
            y.setDate(y.getDate() - 1);
            return { from: localDateStr(y), to: localDateStr(y), label: 'Hôm qua' };
        }
        case 'last_week': {
            const from = new Date(today);
            from.setDate(from.getDate() - 6);
            return { from: localDateStr(from), to: localDateStr(today), label: '7 ngày qua' };
        }
        case 'this_month':
            return {
                from: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
                to: localDateStr(today),
                label: 'Tháng này',
            };
        case 'custom':
            return { from: '', to: '', label: 'Tùy chọn' };
        case 'last_month':
        default: {
            const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
            return { from: localDateStr(from), to: localDateStr(to), label: 'Tháng trước' };
        }
    }
}

export function findMatchingPreset(from: string, to: string): ChartRangePreset {
    if (!from || !to) return 'custom';
    for (const opt of CHART_RANGE_OPTIONS) {
        if (opt.value === 'custom') continue;
        const range = getChartPresetRange(opt.value);
        if (range.from === from && range.to === to) return opt.value;
    }
    return 'custom';
}

export function formatDateRangeLabel(from: string, to: string): string {
    if (!from || !to) return '';
    const fmt = (s: string) => {
        const [y, m, d] = s.split('-');
        return `${d}/${m}/${y}`;
    };
    return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}
