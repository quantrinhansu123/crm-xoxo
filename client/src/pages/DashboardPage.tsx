import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, DollarSign, Lock, Users, ShoppingCart, FileText, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ordersApi, leadsApi, customersApi, transactionsApi, reportsApi } from '@/lib/api';
import { getChartPresetRange } from '@/components/reports/chartDateRange';
import { formatCurrency } from '@/lib/utils';
import type { User } from '@/types';

interface DashboardPageProps {
    currentUser: User;
}

interface StatCardProps {
    title: string;
    value: string;
    change?: number;
    icon: React.ReactNode;
    color: 'blue' | 'green' | 'red' | 'purple' | 'yellow';
    sparklineData?: number[];
}

interface Order {
    id: string;
    order_code: string;
    customer?: { name: string };
    total_amount: number;
    status: string;
}

interface Lead {
    id: string;
    customer_name: string;
    phone: string;
    source: string;
    status: string;
    assigned_user?: { name: string };
}

interface DashboardStats {
    totalOrders: number;
    pendingOrders: number;
    processingOrders: number;
    completedOrders: number;
    totalLeads: number;
    newLeads: number;
    nurturingLeads: number;
    convertedLeads: number;
    totalCustomers: number;
    totalRevenue: number;
    totalExpense: number;
    netProfit: number;
    paidInvoices: number;
}

function localDateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function buildMonthRanges(count: number) {
    const ranges: { label: string; start_date: string; end_date: string }[] = [];
    const today = new Date();

    for (let i = count - 1; i >= 0; i--) {
        const anchor = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        const end = i === 0
            ? today
            : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);

        ranges.push({
            label: `Th${anchor.getMonth() + 1}`,
            start_date: localDateStr(start),
            end_date: localDateStr(end),
        });
    }

    return ranges;
}

interface MonthlyRevenue {
    month: string;
    revenue: number;
    orders: number;
}

function StatCard({ title, value, change, icon, color, sparklineData }: StatCardProps) {
    const colorClasses = {
        blue: { bg: 'bg-blue-50', icon: 'bg-blue-100 text-blue-600', bar: 'bg-blue-300' },
        green: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', bar: 'bg-emerald-300' },
        red: { bg: 'bg-red-50', icon: 'bg-red-100 text-red-600', bar: 'bg-red-300' },
        purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', bar: 'bg-purple-300' },
        yellow: { bg: 'bg-amber-50', icon: 'bg-amber-100 text-amber-600', bar: 'bg-amber-300' }
    };

    const classes = colorClasses[color];
    const isPositive = change !== undefined && change >= 0;

    return (
        <Card className={`${classes.bg} border-0 hover:shadow-md transition-shadow cursor-pointer`}>
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
                        <p className="text-2xl font-bold text-foreground">{value}</p>
                        {change !== undefined && (
                            <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary" className={isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                                    {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                    {Math.abs(change)}%
                                </Badge>
                                <span className="text-xs text-muted-foreground">so với kỳ trước</span>
                            </div>
                        )}
                    </div>
                    <div className={`p-3 rounded-xl ${classes.icon}`}>
                        {icon}
                    </div>
                </div>

                {sparklineData && (
                    <div className="mt-4 flex items-end gap-1 h-8">
                        {sparklineData.map((val, i) => (
                            <div
                                key={i}
                                className={`flex-1 rounded-t ${classes.bar}`}
                                style={{ height: `${(val / Math.max(...sparklineData)) * 100}%` }}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function DashboardPage({ currentUser }: DashboardPageProps) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<Order[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([]);
    const [stats, setStats] = useState<DashboardStats>({
        totalOrders: 0,
        pendingOrders: 0,
        processingOrders: 0,
        completedOrders: 0,
        totalLeads: 0,
        newLeads: 0,
        nurturingLeads: 0,
        convertedLeads: 0,
        totalCustomers: 0,
        totalRevenue: 0,
        totalExpense: 0,
        netProfit: 0,
        paidInvoices: 0
    });

    const isAccountant = currentUser.role === 'accountant';
    const isManager = currentUser.role === 'manager' || currentUser.role === 'admin';
    const canViewFinance = ['manager', 'admin', 'accountant'].includes(currentUser.role);

    // Fetch dashboard data
    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            const getTotal = (response: { data?: { data?: { pagination?: { total?: number } } } }) =>
                response.data?.data?.pagination?.total ?? 0;

            const thisMonth = getChartPresetRange('this_month');
            const chartMonths = buildMonthRanges(6);

            const [
                ordersRecentRes,
                beforeSaleRes,
                inProgressRes,
                doneRes,
                afterSaleRes,
                leadsRecentRes,
                leadsTotalRes,
                leadsNewRes,
                leadsNurturingPhotoRes,
                leadsNurturingPriceRes,
                leadsConvertedRes,
                customersRes,
                monthFinanceRes,
                dashboardReportRes,
                ...monthChartResList
            ] = await Promise.all([
                ordersApi.getAll({ limit: 5 }),
                ordersApi.getAll({ status: 'before_sale', limit: 1 }),
                ordersApi.getAll({ status: 'in_progress', limit: 1 }),
                ordersApi.getAll({ status: 'done', limit: 1 }),
                ordersApi.getAll({ status: 'after_sale', limit: 1 }),
                leadsApi.getAll({ limit: 5 }),
                leadsApi.getAll({ limit: 1 }),
                leadsApi.getAll({ status: 'xac_dinh_nhu_cau', limit: 1 }),
                leadsApi.getAll({ status: 'hen_gui_anh', limit: 1 }),
                leadsApi.getAll({ status: 'dam_phan_gia', limit: 1 }),
                leadsApi.getAll({ status: 'chot_don', limit: 1 }),
                customersApi.getAll({ limit: 1 }),
                transactionsApi.getSummary({ start_date: thisMonth.from, end_date: thisMonth.to }),
                reportsApi.getDashboard({
                    chart_range: 'this_month',
                    from_date: thisMonth.from,
                    to_date: thisMonth.to,
                    group_by: 'day',
                }),
                ...chartMonths.map((month) =>
                    transactionsApi.getSummary({ start_date: month.start_date, end_date: month.end_date }),
                ),
            ]);

            const ordersData = ordersRecentRes.data.data?.orders || [];
            const leadsData = leadsRecentRes.data.data?.leads || [];
            const monthFinance = monthFinanceRes.data.data;
            const dashboardReport = dashboardReportRes.data?.data;
            const totalRevenue = monthFinance?.totalIncome ?? 0;
            const totalExpense = monthFinance?.totalExpense ?? 0;
            const netProfit = monthFinance?.balance ?? 0;
            const paidInvoices = dashboardReport?.charts?.netRevenue?.invoiceCount
                ?? monthFinance?.incomeCount
                ?? 0;

            const monthlyRevenueData = chartMonths.map((month, index) => ({
                month: month.label,
                revenue: monthChartResList[index]?.data?.data?.totalIncome ?? 0,
                orders: monthChartResList[index]?.data?.data?.incomeCount ?? 0,
            }));

            setOrders(ordersData);
            setLeads(leadsData);
            setMonthlyRevenue(monthlyRevenueData);
            const pendingOrders = getTotal(beforeSaleRes);
            const processingOrders = getTotal(inProgressRes);
            const completedOrders = getTotal(doneRes) + getTotal(afterSaleRes);

            setStats({
                // Đơn đang cần xử lý (không tính đơn đã hoàn thiện / lịch sử)
                totalOrders: pendingOrders + processingOrders,
                pendingOrders,
                processingOrders,
                completedOrders,
                totalLeads: getTotal(leadsTotalRes),
                newLeads: getTotal(leadsNewRes),
                nurturingLeads: getTotal(leadsNurturingPhotoRes) + getTotal(leadsNurturingPriceRes),
                convertedLeads: getTotal(leadsConvertedRes),
                totalCustomers: getTotal(customersRes),
                totalRevenue,
                totalExpense,
                netProfit,
                paidInvoices,
            });
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // Derived stats
    const conversionRate = useMemo(() => {
        if (stats.totalLeads === 0) return 0;
        return Math.round((stats.convertedLeads / stats.totalLeads) * 100);
    }, [stats.convertedLeads, stats.totalLeads]);

    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            before_sale: 'Đơn nháp',
            in_progress: 'Đang làm',
            done: 'Đã hoàn thiện',
            after_sale: 'After Sale',
            cancelled: 'Đã hủy'
        };
        return labels[status] || status;
    };

    const getStatusVariant = (status: string) => {
        const variants: Record<string, 'success' | 'danger' | 'warning' | 'secondary' | 'info' | 'purple'> = {
            before_sale: 'info',
            in_progress: 'warning',
            done: 'purple',
            after_sale: 'success',
            cancelled: 'danger'
        };
        return variants[status] || 'secondary';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
                    <p className="text-muted-foreground">Tổng quan hoạt động kinh doanh</p>
                </div>
                <div className="flex gap-2">
                    {isAccountant && (
                        <Button variant="outline">
                            <Lock className="h-4 w-4 mr-2" />
                            Khóa kỳ
                        </Button>
                    )}
                    {isManager && (
                        <Button>
                            <DollarSign className="h-4 w-4 mr-2" />
                            Xuất báo cáo
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            {canViewFinance ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    <StatCard
                        title="Đơn đang xử lý"
                        value={stats.totalOrders.toString()}
                        icon={<ShoppingCart className="h-6 w-6" />}
                        color="blue"
                    />
                    <StatCard
                        title="Doanh thu tháng này"
                        value={formatCurrency(stats.totalRevenue)}
                        icon={<TrendingUp className="h-6 w-6" />}
                        color="green"
                    />
                    <StatCard
                        title="Chi phí tháng này"
                        value={formatCurrency(stats.totalExpense)}
                        icon={<Wallet className="h-6 w-6" />}
                        color="red"
                    />
                    <StatCard
                        title="Lợi nhuận tháng này"
                        value={formatCurrency(stats.netProfit)}
                        icon={<PiggyBank className="h-6 w-6" />}
                        color="purple"
                    />
                    <StatCard
                        title="Khách hàng"
                        value={stats.totalCustomers.toString()}
                        icon={<Users className="h-6 w-6" />}
                        color="yellow"
                    />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="bg-blue-50 border-0">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">Đơn hàng mới</p>
                                    <p className="text-3xl font-bold text-blue-600">{stats.pendingOrders}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-blue-100">
                                    <ShoppingCart className="h-6 w-6 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-amber-50 border-0">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">Đang xử lý</p>
                                    <p className="text-3xl font-bold text-amber-600">{stats.processingOrders}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-amber-100">
                                    <FileText className="h-6 w-6 text-amber-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-emerald-50 border-0">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">Lead mới</p>
                                    <p className="text-3xl font-bold text-emerald-600">{stats.newLeads}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-emerald-100">
                                    <Users className="h-6 w-6 text-emerald-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-purple-50 border-0">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">Đang chăm sóc</p>
                                    <p className="text-3xl font-bold text-purple-600">{stats.nurturingLeads}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-purple-100">
                                    <Users className="h-6 w-6 text-purple-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Quick Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/orders')}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium text-muted-foreground">Đơn hàng chờ xử lý</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <span className="text-3xl font-bold text-primary">{stats.pendingOrders}</span>
                            <Badge variant="info">Cần xử lý</Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/leads')}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium text-muted-foreground">Lead mới</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <span className="text-3xl font-bold text-emerald-600">{stats.newLeads}</span>
                            <Badge variant="success">+{stats.newLeads} mới</Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium text-muted-foreground">Tỷ lệ chuyển đổi</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <span className="text-3xl font-bold text-foreground">{conversionRate}%</span>
                            <Badge variant={conversionRate >= 30 ? 'success' : conversionRate >= 15 ? 'warning' : 'danger'}>
                                {conversionRate >= 30 ? 'Tốt' : conversionRate >= 15 ? 'Trung bình' : 'Cần cải thiện'}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Orders */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Đơn hàng gần đây</span>
                            <Button variant="link" className="text-primary p-0 h-auto" onClick={() => navigate('/orders')}>
                                Xem tất cả
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {orders.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-30" />
                                <p>Chưa có đơn hàng nào</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {orders.slice(0, 5).map((order) => (
                                    <div
                                        key={order.id}
                                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                                        onClick={() => navigate(`/orders/${order.id}`)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                                                {order.customer?.name?.charAt(0) || 'K'}
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{order.order_code}</p>
                                                <p className="text-xs text-muted-foreground">{order.customer?.name || 'N/A'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-primary">{formatCurrency(order.total_amount)}</p>
                                            <Badge variant={getStatusVariant(order.status)} className="text-xs">
                                                {getStatusLabel(order.status)}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Leads */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Lead mới nhất</span>
                            <Button variant="link" className="text-primary p-0 h-auto" onClick={() => navigate('/leads')}>
                                Xem tất cả
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {leads.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
                                <p>Chưa có lead nào</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {leads.slice(0, 5).map((lead) => (
                                    <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-medium">
                                                {lead.customer_name?.charAt(0) || 'L'}
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{lead.customer_name}</p>
                                                <p className="text-xs text-muted-foreground">{lead.phone}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant="outline" className="mb-1">{lead.source}</Badge>
                                            <p className="text-xs text-muted-foreground">{lead.assigned_user?.name || 'Chưa phân công'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Revenue Chart */}
            {canViewFinance && (
                <Card>
                    <CardHeader>
                        <CardTitle>Doanh thu theo tháng (phiếu thu đã duyệt)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {monthlyRevenue.length > 0 ? (
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthlyRevenue} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="month"
                                            tick={{ fill: '#6b7280', fontSize: 12 }}
                                            axisLine={{ stroke: '#d1d5db' }}
                                            tickLine={{ stroke: '#d1d5db' }}
                                        />
                                        <YAxis
                                            tickFormatter={(value) => {
                                                if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
                                                if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                                                return value.toString();
                                            }}
                                            tick={{ fill: '#6b7280', fontSize: 12 }}
                                            axisLine={{ stroke: '#d1d5db' }}
                                            tickLine={{ stroke: '#d1d5db' }}
                                        />
                                        <Tooltip
                                            formatter={(value: any) => [formatCurrency(value), 'Doanh thu']}
                                            labelFormatter={(label) => `Tháng ${label}`}
                                            contentStyle={{
                                                borderRadius: '12px',
                                                border: '1px solid #e5e7eb',
                                                backgroundColor: '#ffffff',
                                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                            }}
                                            labelStyle={{ color: '#374151', fontWeight: 600 }}
                                        />
                                        <Legend
                                            wrapperStyle={{ color: '#6b7280' }}
                                        />
                                        <Bar
                                            dataKey="revenue"
                                            name="Doanh thu"
                                            fill="#10b981"
                                            radius={[6, 6, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-64 flex items-center justify-center bg-muted/30 rounded-lg border-2 border-dashed border-muted">
                                <div className="text-center text-muted-foreground">
                                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                    <p>Chưa có dữ liệu doanh thu</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function ChartIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 3v18h18" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
        </svg>
    );
}
