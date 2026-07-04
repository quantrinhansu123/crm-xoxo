import { Calendar, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
    CHART_RANGE_OPTIONS,
    type ChartRangePreset,
    findMatchingPreset,
    formatDateRangeLabel,
    getChartPresetRange,
} from './chartDateRange';

interface ChartDateRangeFilterProps {
    preset: ChartRangePreset;
    fromDate: string;
    toDate: string;
    onRangeChange: (preset: ChartRangePreset, from: string, to: string) => void;
    loading?: boolean;
    idPrefix?: string;
    className?: string;
}

export function ChartDateRangeFilter({
    preset,
    fromDate,
    toDate,
    onRangeChange,
    loading,
    idPrefix = 'chart',
    className = '',
}: ChartDateRangeFilterProps) {
    const handlePresetChange = (value: string) => {
        const next = value as ChartRangePreset;
        if (next === 'custom') {
            onRangeChange('custom', fromDate, toDate);
            return;
        }
        const range = getChartPresetRange(next);
        onRangeChange(next, range.from, range.to);
    };

    const handleFromChange = (value: string) => {
        onRangeChange(findMatchingPreset(value, toDate), value, toDate);
    };

    const handleToChange = (value: string) => {
        onRangeChange(findMatchingPreset(fromDate, value), fromDate, value);
    };

    const rangeLabel = formatDateRangeLabel(fromDate, toDate);

    return (
        <div className={`flex flex-wrap items-end gap-3 p-3 rounded-lg border bg-muted/30 ${className}`}>
            <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Khoảng thời gian</Label>
                <Select value={preset} onValueChange={handlePresetChange}>
                    <SelectTrigger className="w-40 h-9 bg-background">
                        <Calendar className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CHART_RANGE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex flex-col gap-1">
                <Label htmlFor={`${idPrefix}-from`} className="text-xs text-muted-foreground">
                    Từ ngày
                </Label>
                <input
                    id={`${idPrefix}-from`}
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => handleFromChange(e.target.value)}
                    className="h-9 px-3 rounded-md border border-input bg-background text-sm w-[148px]"
                />
            </div>

            <div className="flex flex-col gap-1">
                <Label htmlFor={`${idPrefix}-to`} className="text-xs text-muted-foreground">
                    Đến ngày
                </Label>
                <input
                    id={`${idPrefix}-to`}
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(e) => handleToChange(e.target.value)}
                    className="h-9 px-3 rounded-md border border-input bg-background text-sm w-[148px]"
                />
            </div>

            {rangeLabel && (
                <span className="text-sm text-muted-foreground pb-2 hidden sm:inline">{rangeLabel}</span>
            )}

            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mb-2" />}
        </div>
    );
}
