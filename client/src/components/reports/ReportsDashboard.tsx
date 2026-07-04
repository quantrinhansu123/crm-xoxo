import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    Users,
    Wallet,
    TrendingUp,
    TrendingDown,
    Loader2,
    ChevronRight,
} from 'lucide-react';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { reportsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { ReportsDashboard2 } from '@/components/reports/ReportsDashboard2';
import { ChartDateRangeFilter } from '@/components/reports/ChartDateRangeFilter';
import { getChartPresetRange, type ChartRangePreset } from '@/components/reports/chartDateRange';

type GroupBy = 'hour' | 'day' | 'weekday';

interface DashboardData {
    today: {
        customers: {
            total: number;
            newCount: number;
            returningCount: number;
            retailCount: number;
        };
        finance: {
            net: number;
            totalIncome: number;
            totalExpense: number;
            miniBars: { label: string; income: number; expense: number }[];
        };
    };
    charts: {
        rangeLabel: string;
        fromDate: string;
        toDate: string;
        customerVolume: { total: number; series: { label: string; value: number }[] };
        netRevenue: {
            total: number;
            invoiceCount: number;
            returnCount: number;
            series: { label: string; value: number }[];
        };
    };
}

const GROUP_TABS: { value: GroupBy; label: string }[] = [
    { value: 'hour', label: 'Theo giờ' },
    { value: 'day', label: 'Theo ngày' },
    { value: 'weekday', label: 'Theo thứ' },
];

function formatCompact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return String(value);
}

const defaultChartRange = getChartPresetRange('last_month');

export function ReportsDashboard() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<DashboardData | null>(null);
    const [chartRange, setChartRange] = useState<ChartRangePreset>('last_month');
    const [fromDate, setFromDate] = useState(defaultChartRange.from);
    const [toDate, setToDate] = useState(defaultChartRange.to);
    const [groupBy, setGroupBy] = useState<GroupBy>('day');

    const handleChartRangeChange = (preset: ChartRangePreset, from: string, to: string) => {
        setChartRange(preset);
        setFromDate(from);
        setToDate(to);
    };

    const fetchDashboard = useCallback(async () => {
        if (!fromDate || !toDate) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const params: Record<string, string> = {
                chart_range: chartRange,
                group_by: groupBy,
                from_date: fromDate,
                to_date: toDate,
            };
            const res = await reportsApi.getDashboard(params);
            setData(res.data?.data ?? null);
        } catch (e) {
            console.error('Dashboard fetch error:', e);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [chartRange, fromDate, toDate, groupBy]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const today = data?.today;
    const charts = data?.charts;
    const customerChartData =
        charts?.customerVolume.series.map((s) => ({ name: s.label, value: s.value })) ?? [];
    const revenueChartData =
        charts?.netRevenue.series.map((s) => ({ name: s.label, value: s.value })) ?? [];
    const maxMini = Math.max(
        1,
        ...(today?.finance.miniBars.flatMap((b) => [b.income, b.expense]) ?? [1])
    );

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            Khách hàng hôm nay
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-foreground">
                            {today?.customers.total ?? 0}
                        </p>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                            <div className="rounded-lg bg-emerald-50 px-3 py-2">
                                <p className="text-muted-foreground text-xs">Khách mới</p>
                                <p className="font-semibold text-emerald-700">
                                    {today?.customers.newCount ?? 0}
                                </p>
                            </div>
                            <div className="rounded-lg bg-blue-50 px-3 py-2">
                                <p className="text-muted-foreground text-xs">Khách cũ quay lại</p>
                                <p className="font-semibold text-blue-700">
                                    {today?.customers.returningCount ?? 0}
                                </p>
                            </div>
                            <div className="rounded-lg bg-amber-50 px-3 py-2">
                                <p className="text-muted-foreground text-xs">Khách lẻ</p>
                                <p className="font-semibold text-amber-700">
                                    {today?.customers.retailCount ?? 0}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-emerald-600" />
                            Thu chi hôm nay
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p
                            className={`text-3xl font-bold ${
                                (today?.finance.net ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}
                        >
                            {(today?.finance.net ?? 0) >= 0 ? '+' : ''}
                            {formatCurrency(today?.finance.net ?? 0)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-1.5">
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                                <span className="text-muted-foreground">Tổng thu</span>
                                <span className="font-semibold">
                                    {formatCurrency(today?.finance.totalIncome ?? 0)}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <TrendingDown className="h-4 w-4 text-red-500" />
                                <span className="text-muted-foreground">Tổng chi</span>
                                <span className="font-semibold">
                                    {formatCurrency(today?.finance.totalExpense ?? 0)}
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 flex items-end gap-1 h-10">
                            {(today?.finance.miniBars ?? []).map((bar, i) => (
                                <div
                                    key={i}
                                    className="flex-1 flex flex-col justify-end gap-0.5 h-full"
                                    title={`${bar.label}: Thu ${formatCurrency(bar.income)}, Chi ${formatCurrency(bar.expense)}`}
                                >
                                    <div
                                        className="w-full rounded-t bg-emerald-400"
                                        style={{
                                            height: `${(bar.income / maxMini) * 100}%`,
                                            minHeight: bar.income > 0 ? 2 : 0,
                                        }}
                                    />
                                    <div
                                        className="w-full rounded-t bg-red-300"
                                        style={{
                                            height: `${(bar.expense / maxMini) * 100}%`,
                                            minHeight: bar.expense > 0 ? 2 : 0,
                                        }}
                                    />
                                </div>
                            ))}
                        </div>

                        <Button variant="link" className="px-0 mt-2 h-auto text-primary" asChild>
                            <Link to="/finance">
                                Chi tiết
                                <ChevronRight className="h-4 w-4 ml-0.5" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <ChartDateRangeFilter
                preset={chartRange}
                fromDate={fromDate}
                toDate={toDate}
                onRangeChange={handleChartRangeChange}
                loading={loading && !!data}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <CardTitle className="text-base font-semibold">
                                    Lượng khách hàng
                                </CardTitle>
                                <p className="text-2xl font-bold mt-1">
                                    {charts?.customerVolume.total ?? 0}
                                </p>
                            </div>
                            <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                                <TabsList className="h-8">
                                    {GROUP_TABS.map((t) => (
                                        <TabsTrigger
                                            key={t.value}
                                            value={t.value}
                                            className="text-xs px-2.5 h-7"
                                        >
                                            {t.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64">
                            {customerChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={customerChartData}
                                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fontSize: 11, fill: '#6b7280' }}
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: '#6b7280' }}
                                            allowDecimals={false}
                                        />
                                        <Tooltip
                                            formatter={(v) => [v ?? 0, 'Khách']}
                                            contentStyle={{ borderRadius: 8 }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={{ r: 3, fill: '#3b82f6' }}
                                            activeDot={{ r: 5 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                    Chưa có dữ liệu
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <CardTitle className="text-base font-semibold">
                                    Doanh thu thuần
                                </CardTitle>
                                <p className="text-2xl font-bold mt-1 text-emerald-600">
                                    {formatCurrency(charts?.netRevenue.total ?? 0)}
                                </p>
                                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                                    <span>{charts?.netRevenue.invoiceCount ?? 0} hóa đơn</span>
                                    <span>{charts?.netRevenue.returnCount ?? 0} trả hàng</span>
                                </div>
                            </div>
                            <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                                <TabsList className="h-8">
                                    {GROUP_TABS.map((t) => (
                                        <TabsTrigger
                                            key={t.value}
                                            value={t.value}
                                            className="text-xs px-2.5 h-7"
                                        >
                                            {t.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64">
                            {revenueChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={revenueChartData}
                                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fontSize: 11, fill: '#6b7280' }}
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis
                                            tickFormatter={formatCompact}
                                            tick={{ fontSize: 11, fill: '#6b7280' }}
                                        />
                                        <Tooltip
                                            formatter={(v) => [
                                                formatCurrency(Number(v ?? 0)),
                                                'Doanh thu',
                                            ]}
                                            contentStyle={{ borderRadius: 8 }}
                                        />
                                        <Bar
                                            dataKey="value"
                                            fill="#10b981"
                                            radius={[4, 4, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                    Chưa có dữ liệu
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <ReportsDashboard2 />
        </div>
    );
}
