import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import {
    Users,
    Wallet,
    TrendingUp,
    TrendingDown,
    Loader2,
    Calendar,
    ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { reportsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

type AnalysisTab = 'new_old' | 'gender' | 'age';

interface BreakdownRow {
    key: string;
    label: string;
    count: number;
    revenue: number;
    percent: number;
    revenuePercent: number;
    countChange: number;
    revenueChange: number;
}

interface AnalysisData {
    period: { year: number; month: number; label: string; previousLabel: string };
    summary: {
        transactingCustomers: {
            total: number;
            newCount: number;
            returningCount: number;
            changePercent: number;
        };
        netRevenue: { total: number; avgValue: number; changePercent: number };
        sparklineCustomers: number[];
        sparklineRevenue: number[];
    };
    customerVolume: {
        total: number;
        changePercent: number;
        series: { label: string; new: number; returning: number; retail: number }[];
        breakdown: BreakdownRow[];
    };
    revenue: {
        total: number;
        changePercent: number;
        series: { label: string; new: number; returning: number; retail: number }[];
        breakdown: BreakdownRow[];
    };
    segmentBreakdown: { key: string; label: string; count: number; revenue: number }[];
    tab: string;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `Tháng ${i + 1}`,
}));

const SERIES_COLORS = {
    new: '#3b82f6',
    returning: '#22c55e',
    retail: '#f59e0b',
};

function Sparkline({ data, color = 'bg-blue-400' }: { data: number[]; color?: string }) {
    const max = Math.max(1, ...data);
    return (
        <div className="flex items-end gap-0.5 h-8 mt-2">
            {data.map((v, i) => (
                <div
                    key={i}
                    className={`flex-1 rounded-t ${color}`}
                    style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
                />
            ))}
        </div>
    );
}

function ChangeBadge({ value }: { value: number }) {
    const positive = value >= 0;
    return (
        <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                positive ? 'text-emerald-600' : 'text-red-600'
            }`}
        >
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {positive ? '↑' : '↓'} {Math.abs(value).toFixed(2)}%
        </span>
    );
}

function BreakdownTable({
    rows,
    showRevenue,
}: {
    rows: BreakdownRow[];
    showRevenue?: boolean;
}) {
    return (
        <div className="mt-4 space-y-2 text-sm">
            {rows.map((row) => (
                <div key={row.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                            backgroundColor:
                                SERIES_COLORS[row.key as keyof typeof SERIES_COLORS] ?? '#94a3b8',
                        }}
                    />
                    <span className="font-medium min-w-[120px]">{row.label}</span>
                    <span className="text-muted-foreground">
                        {showRevenue ? formatCurrency(row.revenue) : row.count}
                        {showRevenue
                            ? ` (${row.revenuePercent}%)`
                            : ` (${row.percent}%)`}
                    </span>
                    <ChangeBadge value={showRevenue ? row.revenueChange : row.countChange} />
                </div>
            ))}
        </div>
    );
}

export function CustomerAnalysisReport() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [tab, setTab] = useState<AnalysisTab>('new_old');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AnalysisData | null>(null);

    const fetchAnalysis = useCallback(async () => {
        setLoading(true);
        try {
            const res = await reportsApi.getCustomerAnalysis({ year, month, tab });
            setData(res.data?.data ?? null);
        } catch (e) {
            console.error('Customer analysis error:', e);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [year, month, tab]);

    useEffect(() => {
        fetchAnalysis();
    }, [fetchAnalysis]);

    const volumeChartData = useMemo(
        () =>
            data?.customerVolume.series.map((s) => ({
                name: s.label,
                new: s.new,
                returning: s.returning,
                retail: s.retail,
            })) ?? [],
        [data?.customerVolume.series]
    );

    const revenueChartData = useMemo(
        () =>
            data?.revenue.series.map((s) => ({
                name: s.label,
                new: s.new,
                returning: s.returning,
                retail: s.retail,
            })) ?? [],
        [data?.revenue.series]
    );

    const yearOptions = useMemo(() => {
        const y = now.getFullYear();
        return [y, y - 1, y - 2].map((v) => ({ value: String(v), label: String(v) }));
    }, [now]);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold">Phân tích khách hàng</h2>
                    <p className="text-sm text-muted-foreground">
                        So với kỳ trước ({data?.period.previousLabel ?? '—'})
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value="month" disabled>
                        <SelectTrigger className="w-24 h-9">
                            <SelectValue>Tháng</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="month">Tháng</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                        <SelectTrigger className="w-28 h-9">
                            <Calendar className="h-3.5 w-3.5 mr-1" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MONTHS.map((m) => (
                                <SelectItem key={m.value} value={m.value}>
                                    {String(m.value).padStart(2, '0')}/{year}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                        <SelectTrigger className="w-24 h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {yearOptions.map((y) => (
                                <SelectItem key={y.value} value={y.value}>
                                    {y.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardContent className="p-5">
                        <p className="text-sm text-muted-foreground">Khách giao dịch</p>
                        <p className="text-3xl font-bold mt-1">
                            {data?.summary.transactingCustomers.total ?? 0}
                        </p>
                        <div className="flex gap-4 mt-2 text-sm">
                            <span>
                                <span className="text-blue-600 font-medium">
                                    {data?.summary.transactingCustomers.newCount ?? 0}
                                </span>{' '}
                                Khách mới
                            </span>
                            <span>
                                <span className="text-emerald-600 font-medium">
                                    {data?.summary.transactingCustomers.returningCount ?? 0}
                                </span>{' '}
                                Khách cũ quay lại
                            </span>
                        </div>
                        <ChangeBadge
                            value={data?.summary.transactingCustomers.changePercent ?? 0}
                        />
                        <Sparkline
                            data={data?.summary.sparklineCustomers ?? []}
                            color="bg-blue-400"
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <p className="text-sm text-muted-foreground">Doanh thu thuần</p>
                        <p className="text-3xl font-bold mt-1">
                            {formatCurrency(data?.summary.netRevenue.total ?? 0)}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                            Giá trị trung bình{' '}
                            <span className="font-semibold text-foreground">
                                {formatCurrency(data?.summary.netRevenue.avgValue ?? 0)}
                            </span>
                        </p>
                        <ChangeBadge value={data?.summary.netRevenue.changePercent ?? 0} />
                        <Sparkline
                            data={data?.summary.sparklineRevenue ?? []}
                            color="bg-blue-500"
                        />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <CardTitle className="text-base">Khách giao dịch</CardTitle>
                        <Button variant="link" className="h-auto p-0 text-primary">
                            Chi tiết
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <Tabs value={tab} onValueChange={(v) => setTab(v as AnalysisTab)}>
                        <TabsList>
                            <TabsTrigger value="new_old">Cũ/Mới</TabsTrigger>
                            <TabsTrigger value="gender">Giới tính</TabsTrigger>
                            <TabsTrigger value="age">Độ tuổi</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </CardHeader>
                <CardContent>
                    {tab === 'new_old' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                                <div className="flex items-baseline justify-between mb-2">
                                    <h3 className="font-semibold">Lượng khách</h3>
                                    <div className="text-right">
                                        <span className="text-2xl font-bold">
                                            {data?.customerVolume.total ?? 0}
                                        </span>
                                        <div>
                                            <ChangeBadge
                                                value={data?.customerVolume.changePercent ?? 0}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={volumeChartData}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                            <Tooltip />
                                            <Legend />
                                            <Line
                                                type="monotone"
                                                dataKey="new"
                                                name="Khách mới"
                                                stroke={SERIES_COLORS.new}
                                                dot={false}
                                                strokeWidth={2}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="returning"
                                                name="Khách cũ quay lại"
                                                stroke={SERIES_COLORS.returning}
                                                dot={false}
                                                strokeWidth={2}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="retail"
                                                name="Khách lẻ"
                                                stroke={SERIES_COLORS.retail}
                                                dot={false}
                                                strokeWidth={2}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                                <BreakdownTable rows={data?.customerVolume.breakdown ?? []} />
                            </div>
                            <div>
                                <div className="flex items-baseline justify-between mb-2">
                                    <h3 className="font-semibold">Doanh thu thuần</h3>
                                    <div className="text-right">
                                        <span className="text-2xl font-bold">
                                            {formatCurrency(data?.revenue.total ?? 0)}
                                        </span>
                                        <div>
                                            <ChangeBadge
                                                value={data?.revenue.changePercent ?? 0}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={revenueChartData}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                            <YAxis
                                                tick={{ fontSize: 10 }}
                                                tickFormatter={(v) =>
                                                    v >= 1_000_000
                                                        ? `${(v / 1_000_000).toFixed(0)}M`
                                                        : v >= 1_000
                                                          ? `${(v / 1_000).toFixed(0)}K`
                                                          : String(v)
                                                }
                                            />
                                            <Tooltip
                                                formatter={(v) => formatCurrency(Number(v ?? 0))}
                                            />
                                            <Legend />
                                            <Line
                                                type="monotone"
                                                dataKey="new"
                                                name="Khách mới"
                                                stroke={SERIES_COLORS.new}
                                                dot={false}
                                                strokeWidth={2}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="returning"
                                                name="Khách cũ quay lại"
                                                stroke={SERIES_COLORS.returning}
                                                dot={false}
                                                strokeWidth={2}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="retail"
                                                name="Khách lẻ"
                                                stroke={SERIES_COLORS.retail}
                                                dot={false}
                                                strokeWidth={2}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                                <BreakdownTable
                                    rows={data?.revenue.breakdown ?? []}
                                    showRevenue
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {(data?.segmentBreakdown.length ?? 0) === 0 ? (
                                <p className="text-sm text-muted-foreground py-8 text-center">
                                    Chưa có dữ liệu {tab === 'gender' ? 'giới tính' : 'độ tuổi'} trong
                                    kỳ {data?.period.label}
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-muted-foreground">
                                                <th className="py-2">Nhóm</th>
                                                <th className="py-2 text-right">Khách</th>
                                                <th className="py-2 text-right">Doanh thu</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data?.segmentBreakdown.map((row) => (
                                                <tr key={row.key} className="border-b">
                                                    <td className="py-2.5 font-medium">{row.label}</td>
                                                    <td className="py-2.5 text-right">{row.count}</td>
                                                    <td className="py-2.5 text-right">
                                                        {formatCurrency(row.revenue)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
