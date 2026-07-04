import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, ChevronRight } from 'lucide-react';
import { reportsApi } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { ChartDateRangeFilter } from '@/components/reports/ChartDateRangeFilter';
import { getChartPresetRange, type ChartRangePreset } from '@/components/reports/chartDateRange';

type StaffMetric = 'revenue' | 'quantity' | 'commission';
type ProductCategory = 'service' | 'package' | 'product' | 'account_card';

interface Dashboard2Data {
    topStaff: {
        rangeLabel: string;
        metric: string;
        employees: {
            id: string;
            name: string;
            serviceValue: number;
            salesValue: number;
            quantity: number;
            commission: number;
            total: number;
        }[];
    };
    topProducts: {
        rangeLabel: string;
        category: string;
        items: { code: string; name: string; revenue: number }[];
    };
    upcomingAppointments: {
        id: string;
        customerName: string;
        phone?: string;
        appointmentTime: string;
        assignedName?: string;
    }[];
    recentActivity: {
        id: string;
        orderCode: string;
        amount: number;
        userName: string;
        createdAt: string;
    }[];
}

const defaultStaffRange = getChartPresetRange('today');
const defaultProductsRange = getChartPresetRange('last_month');

const PRODUCT_TABS: { value: ProductCategory; label: string }[] = [
    { value: 'service', label: 'Dịch vụ' },
    { value: 'package', label: 'Gói dịch vụ, liệu trình' },
    { value: 'account_card', label: 'Thẻ tài khoản' },
    { value: 'product', label: 'Sản phẩm' },
];

function formatShortCurrency(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return String(value);
}

export function ReportsDashboard2() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<Dashboard2Data | null>(null);

    const [staffRange, setStaffRange] = useState<ChartRangePreset>('today');
    const [staffFrom, setStaffFrom] = useState(defaultStaffRange.from);
    const [staffTo, setStaffTo] = useState(defaultStaffRange.to);
    const [staffMetric, setStaffMetric] = useState<StaffMetric>('revenue');

    const [productsRange, setProductsRange] = useState<ChartRangePreset>('last_month');
    const [productsFrom, setProductsFrom] = useState(defaultProductsRange.from);
    const [productsTo, setProductsTo] = useState(defaultProductsRange.to);
    const [productCategory, setProductCategory] = useState<ProductCategory>('service');

    const fetchData = useCallback(async () => {
        if (!staffFrom || !staffTo || !productsFrom || !productsTo) return;

        setLoading(true);
        try {
            const params: Record<string, string> = {
                staff_range: staffRange,
                staff_metric: staffMetric,
                staff_from: staffFrom,
                staff_to: staffTo,
                products_range: productsRange,
                products_from: productsFrom,
                products_to: productsTo,
                product_category: productCategory,
            };
            const res = await reportsApi.getDashboard2(params);
            setData(res.data?.data ?? null);
        } catch (e) {
            console.error('Dashboard 2 fetch error:', e);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [
        staffRange,
        staffFrom,
        staffTo,
        staffMetric,
        productsRange,
        productsFrom,
        productsTo,
        productCategory,
    ]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const staffChartData = useMemo(() => {
        const employees = data?.topStaff.employees ?? [];
        return employees.slice(0, 5).map((emp) => {
            let value = emp.total;
            if (staffMetric === 'quantity') value = emp.quantity;
            if (staffMetric === 'commission') value = emp.commission;
            return {
                name: emp.name.length > 18 ? `${emp.name.slice(0, 16)}…` : emp.name,
                fullName: emp.name,
                service: staffMetric === 'revenue' ? emp.serviceValue : 0,
                sales: staffMetric === 'revenue' ? emp.salesValue : 0,
                value,
            };
        });
    }, [data?.topStaff.employees, staffMetric]);

    const maxStaffValue = Math.max(1, ...staffChartData.map((d) => d.value));

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4 pt-2 border-t">
            <h2 className="text-lg font-semibold text-muted-foreground">Dashboard 2</h2>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
                <div className="space-y-4 min-w-0">
                    {/* Top nhân viên */}
                    <Card className="border shadow-sm">
                        <CardHeader className="pb-2">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base font-semibold">
                                        Top nhân viên xuất sắc
                                    </CardTitle>
                                    <Button variant="link" className="px-0 h-auto text-sm text-primary" asChild>
                                        <Link to="/reports">
                                            Chi tiết
                                            <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                                        </Link>
                                    </Button>
                                </div>
                                <ChartDateRangeFilter
                                    idPrefix="staff"
                                    preset={staffRange}
                                    fromDate={staffFrom}
                                    toDate={staffTo}
                                    onRangeChange={(preset, from, to) => {
                                        setStaffRange(preset);
                                        setStaffFrom(from);
                                        setStaffTo(to);
                                    }}
                                    className="p-2 border-0 bg-transparent"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Tabs
                                value={staffMetric}
                                onValueChange={(v) => setStaffMetric(v as StaffMetric)}
                            >
                                <TabsList className="h-9">
                                    <TabsTrigger value="revenue" className="text-xs">
                                        Doanh thu
                                    </TabsTrigger>
                                    <TabsTrigger value="quantity" className="text-xs">
                                        Số lượng
                                    </TabsTrigger>
                                    <TabsTrigger value="commission" className="text-xs">
                                        Hoa hồng
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>

                            {staffChartData.length > 0 ? (
                                <>
                                    <div className="h-56">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                layout="vertical"
                                                data={staffChartData}
                                                margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                                <XAxis
                                                    type="number"
                                                    tickFormatter={formatShortCurrency}
                                                    tick={{ fontSize: 11 }}
                                                />
                                                <YAxis
                                                    type="category"
                                                    dataKey="name"
                                                    width={100}
                                                    tick={{ fontSize: 11 }}
                                                />
                                                <Tooltip
                                                    formatter={(v, name) => {
                                                        const label =
                                                            name === 'service'
                                                                ? 'Làm dịch vụ'
                                                                : name === 'sales'
                                                                  ? 'Tư vấn bán'
                                                                  : staffMetric === 'quantity'
                                                                    ? 'Số lượng'
                                                                    : staffMetric === 'commission'
                                                                      ? 'Hoa hồng'
                                                                      : 'Tổng';
                                                        if (staffMetric === 'revenue') {
                                                            return [formatCurrency(Number(v ?? 0)), label];
                                                        }
                                                        return [v ?? 0, label];
                                                    }}
                                                    labelFormatter={(_, payload) =>
                                                        payload?.[0]?.payload?.fullName ?? ''
                                                    }
                                                />
                                                {staffMetric === 'revenue' ? (
                                                    <>
                                                        <Legend
                                                            wrapperStyle={{ fontSize: 12 }}
                                                            formatter={(v) =>
                                                                v === 'service'
                                                                    ? 'Làm dịch vụ'
                                                                    : 'Tư vấn bán'
                                                            }
                                                        />
                                                        <Bar
                                                            dataKey="service"
                                                            stackId="a"
                                                            fill="#1e40af"
                                                            radius={[0, 0, 0, 0]}
                                                        />
                                                        <Bar
                                                            dataKey="sales"
                                                            stackId="a"
                                                            fill="#93c5fd"
                                                            radius={[0, 4, 4, 0]}
                                                        />
                                                    </>
                                                ) : (
                                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                                                )}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="space-y-2">
                                        {staffChartData.map((row) => (
                                            <div key={row.fullName} className="flex items-center gap-2 text-sm">
                                                <span className="w-28 truncate font-medium">{row.fullName}</span>
                                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden flex">
                                                    {staffMetric === 'revenue' ? (
                                                        <>
                                                            <div
                                                                className="h-full bg-blue-800"
                                                                style={{
                                                                    width: `${(row.service / maxStaffValue) * 100}%`,
                                                                }}
                                                            />
                                                            <div
                                                                className="h-full bg-blue-300"
                                                                style={{
                                                                    width: `${(row.sales / maxStaffValue) * 100}%`,
                                                                }}
                                                            />
                                                        </>
                                                    ) : (
                                                        <div
                                                            className="h-full bg-blue-500 rounded-full"
                                                            style={{
                                                                width: `${(row.value / maxStaffValue) * 100}%`,
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                                <span className="w-20 text-right text-muted-foreground shrink-0">
                                                    {staffMetric === 'quantity'
                                                        ? row.value
                                                        : formatShortCurrency(row.value)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground py-8 text-center">
                                    Chưa có dữ liệu trong kỳ {data?.topStaff.rangeLabel ?? ''}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Top 5 sản phẩm */}
                    <Card className="border shadow-sm">
                        <CardHeader className="pb-2">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <CardTitle className="text-base font-semibold">
                                    Top 5 hàng hoá bán chạy
                                </CardTitle>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select value="net" disabled>
                                        <SelectTrigger className="w-40 h-9">
                                            <SelectValue placeholder="Doanh thu thuần" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="net">Doanh thu thuần</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <ChartDateRangeFilter
                                        idPrefix="products"
                                        preset={productsRange}
                                        fromDate={productsFrom}
                                        toDate={productsTo}
                                        onRangeChange={(preset, from, to) => {
                                            setProductsRange(preset);
                                            setProductsFrom(from);
                                            setProductsTo(to);
                                        }}
                                        className="p-2 border-0 bg-transparent"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Tabs
                                value={productCategory}
                                onValueChange={(v) => setProductCategory(v as ProductCategory)}
                            >
                                <TabsList className="h-auto flex-wrap gap-1">
                                    {PRODUCT_TABS.map((t) => (
                                        <TabsTrigger
                                            key={t.value}
                                            value={t.value}
                                            className="text-xs"
                                        >
                                            {t.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>

                            {(data?.topProducts.items.length ?? 0) > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-muted-foreground">
                                                <th className="py-2 pr-2 w-8">#</th>
                                                <th className="py-2 pr-2 w-24">Mã</th>
                                                <th className="py-2 pr-2">Tên</th>
                                                <th className="py-2 text-right w-28">Doanh thu</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data?.topProducts.items.map((item, idx) => (
                                                <tr key={`${item.code}-${idx}`} className="border-b last:border-0">
                                                    <td className="py-2.5 text-muted-foreground">{idx + 1}</td>
                                                    <td className="py-2.5 font-mono text-xs text-primary">
                                                        {item.code}
                                                    </td>
                                                    <td className="py-2.5 max-w-[280px] truncate" title={item.name}>
                                                        {item.name}
                                                    </td>
                                                    <td className="py-2.5 text-right font-semibold tabular-nums">
                                                        {formatCurrency(item.revenue)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground py-6 text-center">
                                    Chưa có dữ liệu — {data?.topProducts.rangeLabel}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    <Card className="border shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold tracking-wide text-muted-foreground">
                                SẮP ĐẾN HẸN
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {(data?.upcomingAppointments.length ?? 0) === 0 ? (
                                <div className="text-center py-4">
                                    <p className="text-sm text-muted-foreground mb-3">Chưa có lịch hẹn</p>
                                    <Button variant="outline" size="sm" className="gap-1" asChild>
                                        <Link to="/leads">
                                            <Plus className="h-4 w-4" />
                                            Thêm lịch hẹn
                                        </Link>
                                    </Button>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {data?.upcomingAppointments.map((apt) => (
                                        <li key={apt.id} className="text-sm border-b pb-2 last:border-0">
                                            <p className="font-medium">{apt.customerName}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDateTime(apt.appointmentTime)}
                                            </p>
                                            {apt.assignedName && (
                                                <p className="text-xs text-primary mt-0.5">
                                                    {apt.assignedName}
                                                </p>
                                            )}
                                        </li>
                                    ))}
                                    <Button variant="link" className="px-0 h-auto text-sm" asChild>
                                        <Link to="/leads">
                                            <Plus className="h-3.5 w-3.5 mr-1" />
                                            Thêm lịch hẹn
                                        </Link>
                                    </Button>
                                </ul>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold tracking-wide text-muted-foreground">
                                Hoạt động gần đây
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-3 max-h-[360px] overflow-y-auto">
                                {(data?.recentActivity ?? []).map((act) => (
                                    <li key={act.id} className="text-sm">
                                        <p className="font-medium text-foreground">{act.userName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Đơn {act.orderCode} · {formatCurrency(act.amount)}
                                        </p>
                                        <p className="text-xs text-muted-foreground/80">
                                            {formatDateTime(act.createdAt)}
                                        </p>
                                    </li>
                                ))}
                                {(data?.recentActivity.length ?? 0) === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        Chưa có hoạt động
                                    </p>
                                )}
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {loading && (
                <div className="flex justify-center py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            )}
        </div>
    );
}
