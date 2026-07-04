import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Phone, Mail, Calendar, ShoppingCart,
    DollarSign, TrendingUp, Loader2, ExternalLink, Briefcase,
    Award, Target, Clock, CreditCard, User, MessageCircle, FileText, Video
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import type { UserRole } from '@/types';
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog';
import type { Order } from '@/hooks/useOrders';
import { useDepartments } from '@/hooks/useDepartments';
import { interactionsApi } from '@/lib/api';
import type { Interaction } from '@/hooks/useInteractions';

interface Employee {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: UserRole;
    avatar?: string;
    department?: string;
    status: 'active' | 'inactive' | 'onleave';
    salary?: number;
    commission?: number;
    bankAccount?: string;
    bankName?: string;
    created_at?: string;
}

interface EmployeeOrder {
    id: string;
    order_code: string;
    status: string;
    total_amount: number;
    created_at: string;
    customer?: {
        name: string;
        phone?: string;
    };
    items?: Array<{
        item_name: string;
        quantity: number;
        total_price: number;
    }>;
}

interface EmployeeStats {
    totalOrders: number;
    totalRevenue: number;
    totalCommission: number;
    completedOrders: number;
    pendingOrders: number;
    avgOrderValue: number;
}

const roleLabels: Record<UserRole, string> = {
    admin: 'Admin',
    manager: 'Quản lý',
    accountant: 'Kế toán',
    sale: 'Sale',
    technician: 'Kỹ thuật',
    cashier: 'Thu ngân',
};

const statusLabels = {
    active: { label: 'Đang làm', variant: 'success' as const },
    inactive: { label: 'Nghỉ việc', variant: 'destructive' as const },
    onleave: { label: 'Nghỉ phép', variant: 'warning' as const }
};

const orderStatusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline' }> = {
    before_sale: { label: 'Đơn nháp', variant: 'secondary' },
    in_progress: { label: 'Đang thực hiện', variant: 'warning' },
    done: { label: 'Đã hoàn thiện', variant: 'default' },
    after_sale: { label: 'After Sale', variant: 'success' },
    cancelled: { label: 'Đã hủy', variant: 'destructive' },
};

export function EmployeeDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { departments, fetchDepartments } = useDepartments();

    const [employee, setEmployee] = useState<Employee | null>(null);
    const [orders, setOrders] = useState<EmployeeOrder[]>([]);
    const [stats, setStats] = useState<EmployeeStats>({
        totalOrders: 0,
        totalRevenue: 0,
        totalCommission: 0,
        completedOrders: 0,
        pendingOrders: 0,
        avgOrderValue: 0,
    });
    const [loading, setLoading] = useState(true);
    const [loadingOrders, setLoadingOrders] = useState(false);

    // Filters
    const [period, setPeriod] = useState('month');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // Order detail dialog
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [showOrderDetail, setShowOrderDetail] = useState(false);

    // Interactions history
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [loadingInteractions, setLoadingInteractions] = useState(false);

    // Active tab
    const [activeTab, setActiveTab] = useState('overview');

    // Fetch employee data
    useEffect(() => {
        if (id) {
            fetchEmployeeData();
        }
    }, [id]);

    // Fetch departments
    useEffect(() => {
        fetchDepartments();
    }, []);

    // Get department name from ID
    const getDepartmentName = (departmentId?: string) => {
        if (!departmentId) return 'Chưa phân bổ';
        const dept = departments.find(d => d.id === departmentId);
        return dept?.name || 'Chưa phân bổ';
    };

    // Fetch orders when filters change
    useEffect(() => {
        if (employee && employee.id) {
            if (period !== 'custom' || (fromDate && toDate)) {
                fetchEmployeeOrders();
                fetchEmployeeInteractions();
            }
        }
    }, [employee, period, fromDate, toDate]);

    const fetchEmployeeData = async () => {
        if (!id) return;

        setLoading(true);
        try {
            const response = await api.get(`/users/${id}`);
            // API returns { status: 'success', data: { user: {...} } }
            const userData = response.data?.data?.user || response.data?.data || response.data;
            console.log('Employee data:', userData);
            setEmployee({
                ...userData,
                status: userData.status || 'active',
            });
        } catch (error) {
            console.error('Error fetching employee:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchEmployeeOrders = async () => {
        if (!employee) return;

        setLoadingOrders(true);
        try {
            const queryParam = employee.role === 'technician'
                ? `technician_id=${employee.id}`
                : `sale_id=${employee.id}`;

            let dateParams = '';
            if (period === 'custom' && fromDate && toDate) {
                dateParams = `&from_date=${fromDate}&to_date=${toDate}`;
            } else if (period !== 'all') {
                const now = new Date();
                let startDate: Date;

                switch (period) {
                    case 'week':
                        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case 'quarter':
                        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                        break;
                    case 'year':
                        startDate = new Date(now.getFullYear(), 0, 1);
                        break;
                    default:
                        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                }
                dateParams = `&from_date=${startDate.toISOString().split('T')[0]}`;
            }

            const response = await api.get(`/orders?${queryParam}${dateParams}`);

            let ordersData: EmployeeOrder[] = [];
            if (Array.isArray(response.data)) {
                ordersData = response.data;
            } else if (response.data?.data?.orders && Array.isArray(response.data.data.orders)) {
                ordersData = response.data.data.orders;
            } else if (response.data?.orders && Array.isArray(response.data.orders)) {
                ordersData = response.data.orders;
            } else if (response.data?.data && Array.isArray(response.data.data)) {
                ordersData = response.data.data;
            }

            setOrders(ordersData);

            const completed = ordersData.filter(o => o.status === 'after_sale' || o.status === 'done');
            const pending = ordersData.filter(o => o.status === 'before_sale' || o.status === 'in_progress');
            const totalRevenue = completed.reduce((sum, o) => sum + (o.total_amount || 0), 0);
            const commissionRate = employee.commission || 5;

            setStats({
                totalOrders: ordersData.length,
                totalRevenue,
                totalCommission: Math.floor(totalRevenue * commissionRate / 100),
                completedOrders: completed.length,
                pendingOrders: pending.length,
                avgOrderValue: completed.length > 0 ? Math.floor(totalRevenue / completed.length) : 0,
            });
        } catch (error) {
            console.error('Error fetching employee orders:', error);
            setOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    };

    const fetchEmployeeInteractions = async () => {
        if (!employee) return;

        setLoadingInteractions(true);
        try {
            const response = await interactionsApi.getAll({ created_by: employee.id, limit: 100 });
            const data = response.data?.data?.interactions || [];
            setInteractions(data);
        } catch (error) {
            console.error('Error fetching employee interactions:', error);
            setInteractions([]);
        } finally {
            setLoadingInteractions(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Không tìm thấy nhân viên</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/employees')}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Quay lại
                </Button>
            </div>
        );
    }

    const periodLabels: Record<string, string> = {
        week: 'Tuần này',
        month: 'Tháng này',
        quarter: 'Quý này',
        year: 'Năm nay',
        all: 'Tất cả',
        custom: 'Tùy chọn',
    };

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <Card className="overflow-hidden">
                <div className="relative bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                        {/* Back Button + Avatar + Info */}
                        <div className="flex items-center gap-4 flex-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/employees')}
                                className="shrink-0 hover:bg-background/80"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>

                            <Avatar className="h-16 w-16 border-4 border-background shadow-lg">
                                <AvatarImage src={employee.avatar} />
                                <AvatarFallback className="text-xl bg-primary text-primary-foreground font-bold">
                                    {employee.name?.charAt(0) || '?'}
                                </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0">
                                <h1 className="text-xl md:text-2xl font-bold truncate">
                                    {employee.name || 'Nhân viên'}
                                </h1>
                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    <Badge variant={
                                        employee.role === 'admin' ? 'destructive' :
                                            employee.role === 'manager' ? 'purple' :
                                                employee.role === 'sale' ? 'info' :
                                                    employee.role === 'accountant' ? 'warning' : 'secondary'
                                    }>
                                        {roleLabels[employee.role]}
                                    </Badge>
                                    <Badge variant={statusLabels[employee.status]?.variant || 'secondary'}>
                                        {statusLabels[employee.status]?.label || employee.status}
                                    </Badge>
                                    {employee.department && (
                                        <span className="text-sm text-muted-foreground">
                                            • {getDepartmentName(employee.department)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Time Filter */}
                        <div className="flex flex-wrap gap-2 items-center md:justify-end">
                            <Select value={period} onValueChange={(v) => {
                                setPeriod(v);
                                if (v !== 'custom') {
                                    setFromDate('');
                                    setToDate('');
                                }
                            }}>
                                <SelectTrigger className="w-[140px] bg-background/80 backdrop-blur">
                                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="week">Tuần này</SelectItem>
                                    <SelectItem value="month">Tháng này</SelectItem>
                                    <SelectItem value="quarter">Quý này</SelectItem>
                                    <SelectItem value="year">Năm nay</SelectItem>
                                    <SelectItem value="all">Tất cả</SelectItem>
                                    <SelectItem value="custom">Tùy chọn...</SelectItem>
                                </SelectContent>
                            </Select>

                            {period === 'custom' && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={fromDate}
                                        onChange={(e) => setFromDate(e.target.value)}
                                        className="h-9 px-3 rounded-md border border-input bg-background text-sm"
                                    />
                                    <span className="text-muted-foreground">-</span>
                                    <input
                                        type="date"
                                        value={toDate}
                                        onChange={(e) => setToDate(e.target.value)}
                                        className="h-9 px-3 rounded-md border border-input bg-background text-sm"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Total Orders */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg shadow-blue-500/20">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-blue-100 uppercase tracking-wide">
                                    Đơn hàng
                                </p>
                                <p className="text-3xl font-bold text-white mt-1">
                                    {stats.totalOrders}
                                </p>
                                <p className="text-xs text-blue-100 mt-0.5">
                                    {periodLabels[period]}
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                                <ShoppingCart className="h-6 w-6 text-white" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Revenue */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0 shadow-lg shadow-emerald-500/20">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-emerald-100 uppercase tracking-wide">
                                    Doanh thu
                                </p>
                                <p className="text-2xl font-bold text-white mt-1">
                                    {formatCurrency(stats.totalRevenue)}
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                                <DollarSign className="h-6 w-6 text-white" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Commission */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-violet-500 to-purple-600 text-white border-0 shadow-lg shadow-purple-500/20">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-purple-100 uppercase tracking-wide">
                                    Hoa hồng
                                </p>
                                <p className="text-2xl font-bold text-white mt-1">
                                    {formatCurrency(stats.totalCommission)}
                                </p>
                                <p className="text-xs text-purple-100 mt-0.5">
                                    {employee.commission || 5}%
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                                <Award className="h-6 w-6 text-white" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Completed */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-teal-500 to-green-600 text-white border-0 shadow-lg shadow-green-500/20">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-green-100 uppercase tracking-wide">
                                    Hoàn thành
                                </p>
                                <p className="text-3xl font-bold text-white mt-1">
                                    {stats.completedOrders}
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                                <Target className="h-6 w-6 text-white" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Pending */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0 shadow-lg shadow-amber-500/20">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-amber-100 uppercase tracking-wide">
                                    Đang xử lý
                                </p>
                                <p className="text-3xl font-bold text-white mt-1">
                                    {stats.pendingOrders}
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                                <Clock className="h-6 w-6 text-white" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Average */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-pink-500 to-rose-500 text-white border-0 shadow-lg shadow-pink-500/20">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-pink-100 uppercase tracking-wide">
                                    TB/đơn
                                </p>
                                <p className="text-2xl font-bold text-white mt-1">
                                    {formatCurrency(stats.avgOrderValue)}
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                                <TrendingUp className="h-6 w-6 text-white" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
                    <TabsTrigger value="overview" className="gap-2">
                        <User className="h-4 w-4" />
                        <span>Thông tin</span>
                    </TabsTrigger>
                    <TabsTrigger value="orders" className="gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        <span>Đơn hàng ({orders.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-2">
                        <MessageCircle className="h-4 w-4" />
                        <span>Liên hệ ({interactions.length})</span>
                    </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        {/* Contact Info */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <User className="h-4 w-4 text-primary" />
                                    Thông tin liên hệ
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors">
                                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/30">
                                        <Mail className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Email</p>
                                        <p className="text-sm font-medium truncate">{employee.email || 'Chưa cập nhật'}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors">
                                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0 shadow-md shadow-green-500/30">
                                        <Phone className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Điện thoại</p>
                                        <p className="text-sm font-medium">{employee.phone || 'Chưa cập nhật'}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors">
                                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 shadow-md shadow-purple-500/30">
                                        <Briefcase className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Phòng ban</p>
                                        <p className="text-sm font-medium">{getDepartmentName(employee.department)}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors">
                                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0 shadow-md shadow-amber-500/30">
                                        <Calendar className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-muted-foreground">Ngày vào làm</p>
                                        <p className="text-sm font-medium">
                                            {employee.created_at
                                                ? new Date(employee.created_at).toLocaleDateString('vi-VN')
                                                : 'Chưa cập nhật'
                                            }
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Salary Info */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <CreditCard className="h-4 w-4 text-primary" />
                                    Thông tin lương
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                                        <p className="text-xs text-muted-foreground mb-1">Lương cơ bản</p>
                                        <p className="text-xl font-bold text-primary">
                                            {formatCurrency(employee.salary || 0)}
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-lg bg-muted/50 border border-border">
                                        <p className="text-xs text-muted-foreground mb-1">% Hoa hồng</p>
                                        <p className="text-xl font-bold">
                                            {employee.commission || 0}%
                                        </p>
                                    </div>
                                </div>

                                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                                    <p className="text-xs text-muted-foreground mb-2">Tài khoản ngân hàng</p>
                                    {employee.bankName || employee.bankAccount ? (
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">{employee.bankName || 'N/A'}</p>
                                            <p className="text-sm text-muted-foreground font-mono">
                                                {employee.bankAccount || 'N/A'}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Chưa cập nhật</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Orders Tab */}
                <TabsContent value="orders" className="mt-4">
                    <Card>
                        <CardContent className="p-4">
                            {loadingOrders ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-30" />
                                    <p className="font-medium">Không có đơn hàng</p>
                                    <p className="text-sm mt-1">Không tìm thấy đơn hàng trong khoảng thời gian này</p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {orders.map((order) => {
                                        const statusInfo = orderStatusLabels[order.status] || { label: order.status, variant: 'secondary' as const };
                                        return (
                                            <div
                                                key={order.id}
                                                className="flex items-center justify-between py-3 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/50 -mx-4 px-4 transition-colors"
                                                onClick={() => {
                                                    setSelectedOrder(order as unknown as Order);
                                                    setShowOrderDetail(true);
                                                }}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold font-mono text-sm">{order.order_code}</span>
                                                        <Badge variant={statusInfo.variant} className="text-xs">
                                                            {statusInfo.label}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                                        {order.customer && (
                                                            <span className="truncate max-w-[200px]">
                                                                {order.customer.name}
                                                            </span>
                                                        )}
                                                        <span>•</span>
                                                        <span className="shrink-0">
                                                            {new Date(order.created_at).toLocaleDateString('vi-VN')}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0 ml-4">
                                                    <p className="font-bold text-primary">{formatCurrency(order.total_amount)}</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 justify-end">
                                                        <ExternalLink className="h-3 w-3" />
                                                        Chi tiết
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* History Tab - Interaction History */}
                <TabsContent value="history" className="mt-4">
                    <Card>
                        <CardContent className="p-4">
                            {loadingInteractions ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : interactions.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
                                    <p className="font-medium">Chưa có lịch sử liên hệ</p>
                                    <p className="text-sm mt-1">Nhân viên chưa tạo bản ghi tương tác nào</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {interactions.map((interaction) => {
                                        const typeIcons: Record<string, React.ReactNode> = {
                                            call: <Phone className="h-4 w-4" />,
                                            email: <Mail className="h-4 w-4" />,
                                            meeting: <Video className="h-4 w-4" />,
                                            message: <MessageCircle className="h-4 w-4" />,
                                            note: <FileText className="h-4 w-4" />,
                                        };
                                        const typeColors: Record<string, string> = {
                                            call: 'bg-blue-100 text-blue-600',
                                            email: 'bg-amber-100 text-amber-600',
                                            meeting: 'bg-purple-100 text-purple-600',
                                            message: 'bg-emerald-100 text-emerald-600',
                                            note: 'bg-gray-100 text-gray-600',
                                        };
                                        const typeLabels: Record<string, string> = {
                                            call: 'Cuộc gọi',
                                            email: 'Email',
                                            meeting: 'Cuộc họp',
                                            message: 'Tin nhắn',
                                            note: 'Ghi chú',
                                        };
                                        const target = interaction.customer || interaction.lead;
                                        const targetType = interaction.customer ? 'Khách hàng' : 'Lead';

                                        return (
                                            <div
                                                key={interaction.id}
                                                className="flex gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                                            >
                                                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${typeColors[interaction.type] || 'bg-gray-100 text-gray-600'}`}>
                                                    {typeIcons[interaction.type] || <MessageCircle className="h-4 w-4" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <Badge variant="outline" className="text-xs">
                                                            {typeLabels[interaction.type] || interaction.type}
                                                        </Badge>
                                                        {target && (
                                                            <span className="text-xs text-muted-foreground">
                                                                {targetType}: <span className="font-medium text-foreground">{target.name}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="font-medium truncate">{interaction.subject}</p>
                                                    {interaction.content && (
                                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                                            {interaction.content}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                                        <Clock className="h-3 w-3" />
                                                        <span>
                                                            {new Date(interaction.created_at).toLocaleString('vi-VN')}
                                                        </span>
                                                        {interaction.duration && (
                                                            <>
                                                                <span>•</span>
                                                                <span>{interaction.duration} phút</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Order Detail Dialog */}
            <OrderDetailDialog
                order={selectedOrder}
                open={showOrderDetail}
                onClose={() => {
                    setShowOrderDetail(false);
                    setSelectedOrder(null);
                }}
            />
        </div>
    );
}
