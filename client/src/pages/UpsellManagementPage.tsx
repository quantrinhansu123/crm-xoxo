import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Sparkles,
    Loader2,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Eye,
    MessageSquare,
    User,
    Calendar,
    DollarSign,
    Package,
    Wrench,
    Truck,
    Clock,
    AlertCircle,
    ChevronRight,
    Search,
    Banknote,
    Pencil
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ordersApi, upsellTicketsApi, requestsApi, leaveRequestsApi, transactionsApi, usersApi } from '@/lib/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { canApproveInApprovalCenter, canViewAccessoryPurchasePrice, canViewPartnerFeePrice } from '@/lib/sensitivePermissions';

const parseMoneyAmount = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const digits = value.replace(/\D/g, '');
        if (!digits) return null;
        return Number(digits);
    }
    return null;
};

const formatMoneyOrDash = (amount: number | null) => (amount != null ? formatCurrency(amount) : '—');

export function UpsellManagementPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('upsell');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    // Data states
    const [upsellTickets, setUpsellTickets] = useState<any[]>([]);
    const [accessoryRequests, setAccessoryRequests] = useState<any[]>([]);
    const [partnerRequests, setPartnerRequests] = useState<any[]>([]);
    const [extensionRequests, setExtensionRequests] = useState<any[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
    const [pendingVouchers, setPendingVouchers] = useState<any[]>([]);
    const [totalAccessoriesCount, setTotalAccessoriesCount] = useState(0);
    const [usersMap, setUsersMap] = useState<Record<string, string>>({});

    // UI States
    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    const [selectedOrderBefore, setSelectedOrderBefore] = useState<any>(null);
    const [loadingOrderBefore, setLoadingOrderBefore] = useState(false);
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const [rejectItem, setRejectItem] = useState<{ id: string; type: 'upsell' | 'order_edit' | 'accessory' | 'partner' | 'extension' | 'leave' | 'voucher' } | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const canViewAccessoryPrice = canViewAccessoryPurchasePrice(user);
    const canViewPartnerPrice = canViewPartnerFeePrice(user);
    const canApprove = canApproveInApprovalCenter(user);

    const loadData = async () => {
        setLoading(true);
        try {
            const [upsellRes, accRes, partRes, extRes, leaveRes, voucherRes] = await Promise.all([
                upsellTicketsApi.getAll(),
                requestsApi.getAccessories(),
                requestsApi.getPartners(),
                requestsApi.getExtensions(),
                leaveRequestsApi.getAll({ role: user?.role }),
                transactionsApi.getAll({ status: 'pending' }),
            ]);

            setUpsellTickets(upsellRes.data?.data?.filter((t: any) => t.status === 'pending') || []);
            setAccessoryRequests(accRes.data?.data?.filter((a: any) => a.status === 'requested') || []);
            setPartnerRequests(partRes.data?.data?.filter((p: any) => p.status === 'requested') || []);
            setExtensionRequests(extRes.data?.data?.filter((e: any) => e.status === 'requested') || []);
            setLeaveRequests(leaveRes.data?.filter((l: any) => l.status === 'pending') || []);
            setPendingVouchers(voucherRes.data?.data?.transactions || []);
            setTotalAccessoriesCount(accRes.data?.data?.length || 0);

            const map: Record<string, string> = {};
            try {
                const usersRes = await usersApi.getAll();
                ((usersRes.data as any)?.data?.users || []).forEach((u: any) => {
                    if (u.id) map[u.id] = u.name || u.id;
                });
            } catch {
                // Sale không gọi được danh sách toàn bộ NV — vẫn hiển thị tab phê duyệt
            }
            setUsersMap(map);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Không thể tải danh sách phê duyệt');
        } finally {
            setLoading(false);
        }
    };

    const getOrderCode = (req: any) => {
        if (!req) return '—';
        return req.order?.order_code ||
            req.order_code ||
            req.metadata?.order_code ||
            req.order_item?.order?.order_code ||
            req.order_product?.order?.order_code ||
            req.order_product_service?.order_product?.order?.order_code ||
            '—';
    };

    const getOrderId = (req: any) => {
        if (!req) return '';
        return req.order_id ||
            req.order?.id ||
            req.order_item?.order?.id ||
            req.order_product?.order?.id ||
            req.order_product_service?.order_product?.order?.id ||
            req.metadata?.order_id;
    };

    const getAccessoryPrice = (req: any) => parseMoneyAmount(req?.metadata?.price_estimate);

    const getPartnerPrice = (req: any) => {
        return (
            parseMoneyAmount(req?.metadata?.partner_fee_amount) ??
            parseMoneyAmount(req?.metadata?.price_estimate) ??
            parseMoneyAmount(req?.partner_fee_amount) ??
            parseMoneyAmount(req?.price_estimate)
        );
    };

    const getTicketType = (ticket: any) => {
        const type = ticket?.ticket_type ||
            ticket?.type ||
            ticket?.request_type ||
            ticket?.data?.ticket_type ||
            ticket?.data?.request_type ||
            ticket?.data?.flow_type ||
            ticket?.data?.flow;
        return typeof type === 'string' ? type : '';
    };

    const isOrderEditTicket = (ticket: any) => {
        const normalizedType = getTicketType(ticket).toLowerCase();
        return normalizedType === 'order_edit' ||
            normalizedType === 'edit_order' ||
            normalizedType === 'order_update';
    };

    const getOrderEditPayload = (ticket: any) => ticket?.data?.update_payload || ticket?.data?.preview || ticket?.data || {};

    const getOrderTotal = (order: any) => Number(order?.total_amount) || 0;

    const getOrderEditTotal = (ticket: any) => {
        const payload = getOrderEditPayload(ticket);
        return Number(payload?.total_amount) || Number(payload?.preview?.total_amount_after) || Number(payload?.preview?.total_amount) || Number(ticket?.total_amount) || 0;
    };

    const getItemTotal = (item: any) => {
        const servicesTotal = Array.isArray(item?.services)
            ? item.services.reduce((sum: number, service: any) => sum + (Number(service?.price ?? service?.unit_price) || 0), 0)
            : 0;
        return Number(item?.total_price) || ((Number(item?.quantity) || 1) * (Number(item?.unit_price) || 0)) || servicesTotal || 0;
    };

    const getDisplayName = (item: any) => item?.name || item?.item_name || item?.product?.name || item?.service?.name || item?.package?.name || '—';

    const openOrderEditReview = async (ticket: any) => {
        setSelectedTicket(ticket);
        setSelectedOrderBefore(null);
        const orderId = getOrderId(ticket);
        if (!orderId) return;

        setLoadingOrderBefore(true);
        try {
            const response = await ordersApi.getById(orderId);
            setSelectedOrderBefore(response.data?.data?.order || null);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Không thể tải thông tin đơn trước khi sửa');
        } finally {
            setLoadingOrderBefore(false);
        }
    };

    const closeDetailDialog = () => {
        setSelectedTicket(null);
        setSelectedOrderBefore(null);
        setLoadingOrderBefore(false);
    };

    const handleApprovalError = (error: any, fallback: string) => {
        const message = error.response?.data?.message || fallback;
        toast.error(message);
        if (/đã được xử lý/i.test(message)) {
            closeDetailDialog();
            loadData();
        }
    };

    const orderEditTickets = upsellTickets.filter((ticket) => isOrderEditTicket(ticket));
    const upsellOnlyTickets = upsellTickets.filter((ticket) => !isOrderEditTicket(ticket));
    const totalPendingCount =
        upsellOnlyTickets.length +
        orderEditTickets.length +
        accessoryRequests.length +
        partnerRequests.length +
        extensionRequests.length +
        pendingVouchers.length;

    useEffect(() => {
        loadData();
    }, []);

    // Handlers
    const handleApproveUpsell = async (id: string) => {
        setProcessing(true);
        try {
            await upsellTicketsApi.approve(id);
            toast.success('Đã duyệt yêu cầu Upsell');
            closeDetailDialog();
            loadData();
        } catch (error: any) {
            handleApprovalError(error, 'Lỗi khi duyệt');
        } finally {
            setProcessing(false);
        }
    };

    const handleApproveOrderEdit = async (id: string) => {
        setProcessing(true);
        try {
            await upsellTicketsApi.approve(id);
            toast.success('Đã duyệt yêu cầu Sửa đơn');
            closeDetailDialog();
            loadData();
        } catch (error: any) {
            handleApprovalError(error, 'Lỗi khi duyệt');
        } finally {
            setProcessing(false);
        }
    };

    const handleApproveAccessory = async (id: string) => {
        setProcessing(true);
        try {
            await requestsApi.updateAccessory(id, { status: 'need_buy' });
            toast.success('Đã duyệt yêu cầu mua phụ kiện');
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi duyệt');
        } finally {
            setProcessing(false);
        }
    };

    const handleApprovePartner = async (id: string) => {
        setProcessing(true);
        try {
            await requestsApi.updatePartner(id, { status: 'ship_to_partner' });
            toast.success('Đã duyệt yêu cầu gửi đối tác');
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi duyệt');
        } finally {
            setProcessing(false);
        }
    };

    const handleApproveExtension = async (id: string, new_due_at?: string, kpiImpact?: boolean) => {
        setProcessing(true);
        try {
            await requestsApi.updateExtension(id, {
                status: 'manager_approved',
                new_due_at,
                kpi_impact: typeof kpiImpact === 'boolean' ? kpiImpact : false
            });
            toast.success(kpiImpact ? 'Đã duyệt gia hạn (trừ KPI)' : 'Đã duyệt gia hạn (không trừ KPI)');
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi duyệt');
        } finally {
            setProcessing(false);
        }
    };

    const handleApproveLeave = async (id: string) => {
        if (!user) return;
        setProcessing(true);
        try {
            await leaveRequestsApi.updateStatus(id, 'approved', user.id);
            toast.success('Đã duyệt yêu cầu nghỉ/muộn');
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi duyệt');
        } finally {
            setProcessing(false);
        }
    };

    const handleApproveVoucher = async (id: string) => {
        setProcessing(true);
        try {
            await transactionsApi.updateStatus(id, 'approved');
            toast.success('Đã duyệt phiếu thu/chi');
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi duyệt');
        } finally {
            setProcessing(false);
        }
    };

    const onRejectClick = (id: string, type: 'upsell' | 'order_edit' | 'accessory' | 'partner' | 'extension' | 'leave' | 'voucher') => {
        setRejectItem({ id, type });
        setRejectionReason('');
        setShowRejectDialog(true);
    };

    const handleConfirmReject = async () => {
        if (!rejectItem) return;
        if (!rejectionReason.trim()) {
            toast.error('Vui lòng nhập lý do từ chôi');
            return;
        }

        setProcessing(true);
        try {
            switch (rejectItem.type) {
                case 'upsell':
                case 'order_edit':
                    await upsellTicketsApi.reject(rejectItem.id);
                    break;
                case 'accessory':
                    await requestsApi.updateAccessory(rejectItem.id, { status: 'rejected', notes: rejectionReason });
                    break;
                case 'partner':
                    await requestsApi.updatePartner(rejectItem.id, { status: 'rejected', notes: rejectionReason });
                    break;
                case 'extension':
                    await requestsApi.updateExtension(rejectItem.id, { status: 'rejected', customer_result: rejectionReason });
                    break;
                case 'leave':
                    await leaveRequestsApi.updateStatus(rejectItem.id, 'rejected', user!.id);
                    break;
                case 'voucher':
                    await transactionsApi.updateStatus(rejectItem.id, 'cancelled');
                    break;
            }
            toast.success('Đã từ chối yêu cầu');
            setShowRejectDialog(false);
            if (rejectItem.type === 'upsell' || rejectItem.type === 'order_edit') {
                closeDetailDialog();
            }
            loadData();
        } catch (error: any) {
            const message = error.response?.data?.message || 'Lỗi khi từ chối';
            toast.error(message);
            if (/đã được xử lý/i.test(message)) {
                setShowRejectDialog(false);
                closeDetailDialog();
                loadData();
            }
        } finally {
            setProcessing(false);
        }
    };

    const emptyState = (title: string, desc: string, icon: React.ReactNode) => (
        <Card className="border-dashed py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
                <div className="bg-slate-100 p-4 rounded-full mb-4">
                    {icon}
                </div>
                <h3 className="text-lg font-medium text-slate-900">{title}</h3>
                <p className="text-slate-500 max-w-sm">{desc}</p>
            </CardContent>
        </Card>
    );

    const ProductImage = ({ src, alt, className }: { src?: string; alt?: string; className?: string }) => {
        if (!src) return (
            <div className={cn("bg-slate-100 flex items-center justify-center rounded-xl border border-slate-200", className)}>
                <Package className="h-6 w-6 text-slate-300" />
            </div>
        );
        return (
            <div className={cn("relative group overflow-hidden rounded-xl border border-slate-200", className)}>
                <img 
                    src={src} 
                    alt={alt || "Sản phẩm"} 
                    className="w-full h-full object-cover cursor-zoom-in hover:scale-110 transition-transform duration-500"
                    onClick={() => window.open(src, '_blank')}
                />
                <div className="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-colors pointer-events-none" />
            </div>
        );
    };

    const getFirstImage = (value: any): string | undefined => {
        if (!value) return undefined;
        if (Array.isArray(value)) return value.find(Boolean) || undefined;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return undefined;
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try {
                    return getFirstImage(JSON.parse(trimmed));
                } catch {
                    return trimmed;
                }
            }
            return trimmed;
        }
        if (typeof value === 'object') {
            return getFirstImage(value.images) ||
                getFirstImage(value.product_images) ||
                getFirstImage(value.image) ||
                getFirstImage(value.url) ||
                getFirstImage(value.src);
        }
        return undefined;
    };

    const getItemImage = (req: any) => {
        if (!req) return undefined;
        const orderProduct = req.order_product_service?.order_product || req.order_product;
        const orderItem = req.order_item;

        return getFirstImage(orderItem?.product_images) ||
            getFirstImage(orderItem?.images) ||
            getFirstImage(orderItem?.image) ||
            getFirstImage(orderItem?.product?.image) ||
            getFirstImage(orderItem?.product?.images) ||
            getFirstImage(orderItem?.completion_photos) ||
            getFirstImage(orderProduct?.product_images) ||
            getFirstImage(orderProduct?.images) ||
            getFirstImage(orderProduct?.image) ||
            getFirstImage(req.order?.order_products?.[0]) ||
            getFirstImage(req.metadata?.product_images) ||
            getFirstImage(req.metadata?.photos);
    };

    const OrderSnapshot = ({ title, order, customerItems = [], saleItems = [], totalAmount, accent }: { title: string; order?: any; customerItems?: any[]; saleItems?: any[]; totalAmount: number; accent: 'slate' | 'fuchsia' }) => (
        <Card className={cn('border shadow-sm overflow-hidden', accent === 'fuchsia' ? 'border-fuchsia-100' : 'border-slate-200')}>
            <CardHeader className={cn('py-3 px-4 border-b', accent === 'fuchsia' ? 'bg-fuchsia-50' : 'bg-white')}>
                <CardTitle className="text-sm font-black text-slate-800">{title}</CardTitle>
                <CardDescription className="text-xs">
                    {order?.order_code || getOrderCode(selectedTicket)} · {order?.customer?.name || selectedTicket?.customer?.name || '—'}
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4 bg-white">
                <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Tạm tính</p>
                        <p className="font-bold text-slate-700">{formatCurrency(Number(order?.subtotal_amount) || totalAmount)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Tổng tiền</p>
                        <p className={cn('font-black', accent === 'fuchsia' ? 'text-fuchsia-700' : 'text-slate-900')}>{formatCurrency(totalAmount)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Giảm giá</p>
                        <p className="font-bold text-slate-700">{formatCurrency(Number(order?.discount) || Number(order?.discount_amount) || 0)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Đã thanh toán</p>
                        <p className="font-bold text-slate-700">{formatCurrency(Number(order?.paid_amount) || 0)}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Sản phẩm khách gửi</p>
                    {customerItems.length > 0 ? customerItems.map((item: any, index: number) => (
                        <div key={item?.id || index} className="rounded-lg border border-slate-100 p-2 text-xs">
                            <div className="font-bold text-slate-700">{getDisplayName(item)}</div>
                            {Array.isArray(item?.services) && item.services.length > 0 && (
                                <div className="mt-1 space-y-1 text-slate-500">
                                    {item.services.map((service: any, serviceIndex: number) => (
                                        <div key={service?.id || serviceIndex} className="flex justify-between gap-2">
                                            <span className="truncate">{service?.name || service?.item_name || 'Dịch vụ'}</span>
                                            <span className="font-bold">{formatCurrency(Number(service?.price ?? service?.unit_price) || 0)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )) : <p className="text-xs text-slate-400 italic">Không có</p>}
                </div>

                <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Sản phẩm bán thêm</p>
                    {saleItems.length > 0 ? saleItems.map((item: any, index: number) => (
                        <div key={item?.id || index} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-2 text-xs">
                            <div>
                                <p className="font-bold text-slate-700">{getDisplayName(item)}</p>
                                <p className="text-slate-400">SL: {Number(item?.quantity) || 1}</p>
                            </div>
                            <p className="font-black text-slate-700">{formatCurrency(getItemTotal(item))}</p>
                        </div>
                    )) : <p className="text-xs text-slate-400 italic">Không có</p>}
                </div>
            </CardContent>
        </Card>
    );

    if (user && !canApprove) {
        return null;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <CheckCircle2 className="h-7 w-7 text-indigo-600" />
                        Mục phê duyệt
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Trung tâm phê duyệt tập trung cho các yêu cầu Upsell, Sửa đơn, Phụ kiện, Đối tác, Gia hạn và Nghỉ/Muộn.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Tải lại ({totalPendingCount})
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-slate-100 p-1 h-12 w-full justify-start overflow-x-auto no-scrollbar md:w-auto md:overflow-visible rounded-xl mb-4">
                    <TabsTrigger value="upsell" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Sparkles className="h-4 w-4" />
                        Duyệt Upsell
                        {upsellOnlyTickets.length > 0 && <Badge variant="secondary" className="ml-1 bg-indigo-100 text-indigo-700">{upsellOnlyTickets.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="order-edit" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Pencil className="h-4 w-4" />
                        Sửa đơn
                        {orderEditTickets.length > 0 && <Badge variant="secondary" className="ml-1 bg-fuchsia-100 text-fuchsia-700">{orderEditTickets.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="accessory" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Package className="h-4 w-4" />
                        Phụ kiện
                        {accessoryRequests.length > 0 && <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700">{accessoryRequests.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="partner" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Truck className="h-4 w-4" />
                        Đối tác
                        {partnerRequests.length > 0 && <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-700">{partnerRequests.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="extension" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Clock className="h-4 w-4" />
                        Gia hạn
                        {extensionRequests.length > 0 && <Badge variant="secondary" className="ml-1 bg-purple-100 text-purple-700">{extensionRequests.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="leave" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Calendar className="h-4 w-4" />
                        Nghỉ/Muộn
                        {leaveRequests.length > 0 && <Badge variant="secondary" className="ml-1 bg-rose-100 text-rose-700">{leaveRequests.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="voucher" className="gap-2 px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Banknote className="h-4 w-4" />
                        Thu Chi
                        {pendingVouchers.length > 0 && <Badge variant="secondary" className="ml-1 bg-green-100 text-green-700">{pendingVouchers.length}</Badge>}
                    </TabsTrigger>
                </TabsList>

                {/* Upsell Tab */}
                <TabsContent value="upsell" className="mt-0">
                    <div className="grid gap-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
                        ) : upsellOnlyTickets.length === 0 ? (
                            emptyState("Chưa có yêu cầu Upsell", "Tất cả các yêu cầu thêm dịch vụ/sản phẩm mới sẽ hiện ở đây.", <Sparkles className="h-8 w-8 text-slate-400" />)
                        ) : (
                            upsellOnlyTickets.map((ticket) => (
                                <Card key={ticket.id} className="overflow-hidden hover:shadow-md transition-shadow border-indigo-100">
                                    <div className="flex flex-col md:flex-row">
                                        <div className="flex-1 p-5">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-lg text-indigo-700 text-sm">Ticket #{ticket.id.slice(0, 8)}</span>
                                                        <Badge className="bg-amber-50 text-amber-600 border-amber-200 uppercase text-[10px]">Chờ duyệt</Badge>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                                        <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateTime(ticket.created_at)}</div>
                                                        <div className="flex items-center gap-1"><User className="h-3 w-3" /> Sale: {ticket.sales_user?.name || '—'}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Tổng giá trị</span>
                                                    <span className="text-xl font-black text-indigo-600">{formatCurrency(ticket.total_amount)}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-4 py-3 bg-slate-50/50 px-3 rounded-lg border border-slate-100 mb-4">
                                                <div className="flex items-center gap-2"><Package className="h-3.5 w-3.5 text-slate-400" /> <span className="text-xs font-medium">Đơn hàng: </span> <Button variant="link" className="p-0 h-auto text-indigo-600 font-bold text-xs" onClick={() => navigate(`/orders/${getOrderId(ticket)}`)}>{getOrderCode(ticket)}</Button></div>
                                                <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-slate-400" /> <span className="text-xs font-medium">Khách hàng: </span> <span className="text-xs font-bold">{ticket.customer?.name || '—'}</span></div>
                                            </div>
                                            <Button variant="outline" size="sm" className="h-8 text-xs font-bold gap-1 rounded-lg" onClick={() => setSelectedTicket(ticket)}><Eye className="h-3.5 w-3.5" /> Xem chi tiết hạng mục</Button>
                                        </div>
                                        <div className="bg-slate-50 md:w-32 border-l border-slate-100 p-4 flex flex-col justify-center gap-2">
                                            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-9 text-xs font-bold" onClick={() => handleApproveUpsell(ticket.id)} disabled={processing}>Duyệt</Button>
                                            <Button variant="outline" className="w-full text-red-600 border-red-200 h-9 text-xs font-bold" onClick={() => onRejectClick(ticket.id, 'upsell')} disabled={processing}>Từ chối</Button>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* Order Edit Tab */}
                <TabsContent value="order-edit" className="mt-0">
                    <div className="grid gap-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-600" /></div>
                        ) : orderEditTickets.length === 0 ? (
                            emptyState("Chưa có yêu cầu Sửa đơn", "Các ticket chỉnh sửa đơn hàng cần quản lý duyệt sẽ hiển thị tại đây.", <Pencil className="h-8 w-8 text-slate-400" />)
                        ) : (
                            orderEditTickets.map((ticket) => (
                                <Card key={ticket.id} className="overflow-hidden hover:shadow-md transition-shadow border-fuchsia-100">
                                    <div className="flex flex-col md:flex-row">
                                        <div className="flex-1 p-5">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-lg text-fuchsia-700 text-sm">Ticket #{ticket.id.slice(0, 8)}</span>
                                                        <Badge className="bg-amber-50 text-amber-600 border-amber-200 uppercase text-[10px]">Chờ duyệt</Badge>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                                        <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateTime(ticket.created_at)}</div>
                                                        <div className="flex items-center gap-1"><User className="h-3 w-3" /> Sale: {ticket.sales_user?.name || '—'}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Giá trị mới</span>
                                                    <span className="text-xl font-black text-fuchsia-600">
                                                        {formatCurrency(
                                                            Number(ticket.data?.total_amount_after) ||
                                                            Number(ticket.data?.preview?.total_amount_after) ||
                                                            Number(ticket.data?.total_amount) ||
                                                            Number(ticket.total_amount) ||
                                                            0
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="space-y-2 py-3 bg-slate-50/60 px-3 rounded-lg border border-slate-100 mb-4">
                                                <div className="flex items-center gap-2">
                                                    <Package className="h-3.5 w-3.5 text-slate-400" />
                                                    <span className="text-xs font-medium">Đơn hàng: </span>
                                                    <Button variant="link" className="p-0 h-auto text-fuchsia-600 font-bold text-xs" onClick={() => navigate(`/orders/${getOrderId(ticket)}`)}>
                                                        {getOrderCode(ticket)}
                                                    </Button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <User className="h-3.5 w-3.5 text-slate-400" />
                                                    <span className="text-xs font-medium">Khách hàng: </span>
                                                    <span className="text-xs font-bold">{ticket.customer?.name || '—'}</span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <MessageSquare className="h-3.5 w-3.5 text-slate-400 mt-0.5" />
                                                    <div className="text-xs text-slate-600 italic line-clamp-2">
                                                        {ticket.notes || ticket.data?.notes || ticket.data?.reason || 'Yêu cầu sửa nội dung đơn hàng'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 md:w-32 border-l border-slate-100 p-4 flex flex-col justify-center gap-2">
                                            <Button className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 h-9 text-xs font-bold" onClick={() => openOrderEditReview(ticket)} disabled={processing}>Duyệt</Button>
                                            <Button variant="outline" className="w-full text-red-600 border-red-200 h-9 text-xs font-bold" onClick={() => onRejectClick(ticket.id, 'order_edit')} disabled={processing}>Từ chối</Button>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* Accessory Tab */}
                <TabsContent value="accessory" className="mt-0">
                    <div className="grid gap-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
                        ) : accessoryRequests.length === 0 ? (
                            emptyState("Chưa có yêu cầu Phụ kiện", "Kỹ thuật chưa gửi yêu cầu mua linh kiện/phụ kiện mới.", <Package className="h-8 w-8 text-slate-400" />)
                        ) : (
                            accessoryRequests.map((req) => (
                                <Card key={req.id} className="overflow-hidden hover:shadow-md transition-shadow border-blue-100">
                                    <div className="flex flex-col md:flex-row">
                                        <div className="p-4 md:p-5 flex gap-4 flex-1">
                                            <div className="shrink-0">
                                                <ProductImage 
                                                    src={getItemImage(req)} 
                                                    className="h-24 w-24 md:h-28 md:w-28" 
                                                />
                                                {req.metadata?.photos?.length > 1 && (
                                                    <p className="text-[10px] text-center mt-1 text-slate-400 font-bold">+{req.metadata.photos.length - 1} ảnh khác</p>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="space-y-1">
                                                        <h3 className="font-bold text-base text-slate-800 line-clamp-1">{req.metadata?.item_name || 'Phụ kiện không tên'}</h3>
                                                        <div className="flex items-center gap-3 text-xs text-slate-500">
                                                            <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateTime(req.created_at)}</div>
                                                            <div className="flex items-center gap-1"><User className="h-3 w-3" /> KT: {req.technician?.name || '—'}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Giá</span>
                                                        {canViewAccessoryPrice ? (
                                                            <span className="text-lg font-black text-blue-600">
                                                                {formatMoneyOrDash(getAccessoryPrice(req))}
                                                            </span>
                                                        ) : (
                                                            <span className="text-sm font-bold text-slate-400">Không có quyền xem</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-2 bg-blue-50/30 px-3 rounded-lg border border-blue-50 mb-3">
                                                    <div><p className="text-[10px] font-bold text-slate-400 uppercase">Số lượng</p><p className="text-sm font-black text-slate-700">{req.metadata?.quantity || '1'}</p></div>
                                                    <div><p className="text-[10px] font-bold text-slate-400 uppercase">Đơn hàng</p><Button variant="link" className="p-0 h-auto text-blue-600 font-bold text-xs" onClick={() => navigate(`/orders/${getOrderId(req)}`)}>{getOrderCode(req)}</Button></div>
                                                    <div className="col-span-2 md:col-span-1"><p className="text-[10px] font-bold text-slate-400 uppercase">Ghi chú KT</p><p className="text-xs text-slate-600 italic line-clamp-1">{req.notes || 'Không có'}</p></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 md:w-32 border-l border-slate-100 p-4 flex flex-col justify-center gap-2">
                                            <Button className="w-full bg-blue-600 hover:bg-blue-700 h-9 text-xs font-bold" onClick={() => handleApproveAccessory(req.id)} disabled={processing}>Duyệt</Button>
                                            <Button variant="outline" className="w-full text-red-600 border-red-200 h-9 text-xs font-bold" onClick={() => onRejectClick(req.id, 'accessory')} disabled={processing}>Từ chối</Button>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* Partner Tab */}
                <TabsContent value="partner" className="mt-0">
                    <div className="grid gap-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></div>
                        ) : partnerRequests.length === 0 ? (
                            emptyState("Chưa có yêu cầu Đối tác", "Kỹ thuật chưa gửi yêu cầu gia công ngoài.", <Truck className="h-8 w-8 text-slate-400" />)
                        ) : (
                            partnerRequests.map((req) => (
                                <Card key={req.id} className="overflow-hidden hover:shadow-md transition-shadow border-amber-100">
                                    <div className="flex flex-col md:flex-row">
                                        <div className="p-4 md:p-5 flex gap-4 flex-1">
                                            <ProductImage 
                                                src={getItemImage(req)} 
                                                className="h-24 w-24 md:h-28 md:w-28 shrink-0" 
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="space-y-1">
                                                        <h3 className="font-bold text-base text-slate-800 line-clamp-1">{req.order_item?.item_name || 'Hạng mục gửi đối tác'}</h3>
                                                        <div className="flex items-center gap-3 text-xs text-slate-500">
                                                            <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateTime(req.created_at)}</div>
                                                            <div className="flex items-center gap-1"><User className="h-3 w-3" /> KT: {req.technician?.name || '—'}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Trạng thái</span>
                                                        <Badge className="bg-amber-50 text-amber-600 border-amber-200">Chờ duyệt</Badge>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-2 bg-amber-50/30 px-3 rounded-lg border border-amber-100 mb-3">
                                                    <div><p className="text-[10px] font-bold text-slate-400 uppercase">Đơn hàng</p><Button variant="link" className="p-0 h-auto text-amber-600 font-bold text-xs" onClick={() => navigate(`/orders/${getOrderId(req)}`)}>{getOrderCode(req)}</Button></div>
                                                    <div><p className="text-[10px] font-bold text-slate-400 uppercase">Lý do / Mô tả</p><p className="text-xs text-slate-600 italic line-clamp-2">{req.notes || 'Không có ghi chú'}</p></div>
                                                    <div className="col-span-2 md:col-span-1">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Giá tiền nhờ đối tác làm</p>
                                                        {canViewPartnerPrice ? (
                                                            <p className="text-sm font-black text-amber-600">{formatMoneyOrDash(getPartnerPrice(req))}</p>
                                                        ) : (
                                                            <p className="text-xs font-bold text-slate-400">Không có quyền xem</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 md:w-32 border-l border-slate-100 p-4 flex flex-col justify-center gap-2">
                                            <Button className="w-full bg-amber-600 hover:bg-amber-700 h-9 text-xs font-bold shadow-sm" onClick={() => handleApprovePartner(req.id)} disabled={processing}>Duyệt</Button>
                                            <Button variant="outline" className="w-full text-red-600 border-red-200 h-9 text-xs font-bold" onClick={() => onRejectClick(req.id, 'partner')} disabled={processing}>Từ chối</Button>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* Extension Tab */}
                <TabsContent value="extension" className="mt-0">
                    <div className="grid gap-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>
                        ) : extensionRequests.length === 0 ? (
                            emptyState("Chưa có yêu cầu Gia hạn", "Toàn bộ yêu cầu gia hạn đã được xử lý.", <Clock className="h-8 w-8 text-slate-400" />)
                        ) : (
                            extensionRequests.map((req) => (
                                <Card key={req.id} className="overflow-hidden hover:shadow-md transition-shadow border-purple-100">
                                    <div className="flex flex-col md:flex-row">
                                        <div className="p-4 md:p-5 flex gap-4 flex-1">
                                            <ProductImage 
                                                src={getItemImage(req)} 
                                                className="h-24 w-24 md:h-28 md:w-28 shrink-0" 
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="space-y-1">
                                                        <h3 className="font-bold text-base text-slate-800 line-clamp-1">{req.order_item?.item_name || 'Hạng mục gia hạn'}</h3>
                                                        <div className="flex items-center gap-3 text-xs text-slate-500">
                                                            <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateTime(req.created_at)}</div>
                                                            <div className="flex items-center gap-1"><User className="h-3 w-3" /> KT: {req.requested_by_user?.name || usersMap[req.requested_by] || '—'}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Hạn mới đề xuất</span>
                                                        <span className="text-base font-black text-purple-600">{formatDateTime(req.new_due_at)}</span>
                                                    </div>
                                                </div>
                                                <div className="py-2 bg-purple-50/30 px-3 rounded-lg border border-purple-100 mb-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Badge variant="outline" className="bg-white text-indigo-700 text-[10px] h-5 cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${getOrderId(req)}`)}>Đơn: {getOrderCode(req)}</Badge>
                                                        <Badge variant="outline" className="bg-white text-emerald-700 text-[10px] h-5">Hạn hiện tại: {formatDateTime(req.order_item?.due_at)}</Badge>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <AlertCircle className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                                                        <p className="text-xs text-slate-600 leading-relaxed"><span className="font-bold">Lý do xin gia hạn:</span> {req.reason}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 md:w-52 border-l border-slate-100 p-4 flex flex-col justify-center gap-2">
                                            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-9 text-xs font-bold shadow-sm" onClick={() => handleApproveExtension(req.id, req.new_due_at, false)} disabled={processing}>Duyệt không trừ KPI</Button>
                                            <Button className="w-full bg-purple-600 hover:bg-purple-700 h-9 text-xs font-bold shadow-sm" onClick={() => handleApproveExtension(req.id, req.new_due_at, true)} disabled={processing}>Duyệt trừ KPI</Button>
                                            <Button variant="outline" className="w-full text-red-600 border-red-200 h-9 text-xs font-bold" onClick={() => onRejectClick(req.id, 'extension')} disabled={processing}>Từ chối</Button>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* Leave Requests Tab */}
                <TabsContent value="leave" className="mt-0">
                    <div className="grid gap-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-rose-600" /></div>
                        ) : leaveRequests.length === 0 ? (
                            emptyState("Chưa có yêu cầu Nghỉ/Muộn", "Tất cả yêu cầu xin nghỉ hoặc đi muộn đã được xử lý.", <Calendar className="h-8 w-8 text-slate-400" />)
                        ) : (
                            leaveRequests.map((req) => (
                                <Card key={req.id} className="overflow-hidden hover:shadow-md transition-shadow border-rose-100">
                                    <div className="flex flex-col md:flex-row">
                                        <div className="flex-1 p-5">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="space-y-1">
                                                    <h3 className="font-bold text-base text-slate-800">{req.type === 'leave' ? 'Yêu cầu xin nghỉ' : 'Yêu cầu xin đi muộn'}</h3>
                                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                                        <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateTime(req.created_at)}</div>
                                                        <div className="flex items-center gap-1"><User className="h-3 w-3" /> NV: {req.users?.name || '—'}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <Badge className={req.type === 'leave' ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-blue-50 text-blue-600 border-blue-200'}>
                                                        {req.sub_type === 'annual' ? 'Nghỉ phép' :
                                                            req.sub_type === 'unexpected_leave' ? 'Nghỉ đột xuất' :
                                                                req.sub_type === 'planned_late' ? 'Muộn có kế hoạch' : 'Muộn đột xuất'}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-3 bg-rose-50/30 px-3 rounded-lg border border-rose-100 mb-3">
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Thời gian</p>
                                                    <p className="text-xs font-medium text-slate-700">
                                                        Từ: {new Date(req.start_time).toLocaleString('vi-VN')}
                                                        {req.end_time && <span><br />Đến: {new Date(req.end_time).toLocaleString('vi-VN')}</span>}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Lý do</p>
                                                    <p className="text-xs text-slate-600 italic line-clamp-2">{req.reason || 'Không có lý do'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 md:w-32 border-l border-slate-100 p-4 flex flex-col justify-center gap-2">
                                            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-9 text-xs font-bold" onClick={() => handleApproveLeave(req.id)} disabled={processing}>Duyệt</Button>
                                            <Button variant="outline" className="w-full text-rose-600 border-rose-200 h-9 text-xs font-bold" onClick={() => onRejectClick(req.id, 'leave')} disabled={processing}>Từ chối</Button>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                {/* Vouchers Tab */}
                <TabsContent value="voucher" className="mt-0">
                    <div className="grid gap-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
                        ) : pendingVouchers.length === 0 ? (
                            emptyState("Chưa có phiếu Thu/Chi", "Tất cả các phiếu thu/chi đã được xử lý hoặc chưa được tạo.", <Banknote className="h-8 w-8 text-slate-400" />)
                        ) : (
                            pendingVouchers.map((voucher) => (
                                <Card key={voucher.id} className={cn(
                                    "overflow-hidden hover:shadow-md transition-shadow",
                                    voucher.type === 'income' ? "border-emerald-100" : "border-rose-100"
                                )}>
                                    <div className="flex flex-col md:flex-row">
                                        <div className="flex-1 p-5">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-base text-slate-800">{voucher.code}</h3>
                                                        <Badge className={cn(
                                                            "uppercase text-[10px]",
                                                            voucher.type === 'income' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
                                                        )}>
                                                            {voucher.type === 'income' ? 'Phiếu thu' : 'Phiếu chi'}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                                        <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(voucher.date).toLocaleDateString('vi-VN')}</div>
                                                        <div className="flex items-center gap-1"><User className="h-3 w-3" /> Tạo bởi: {voucher.created_by_user?.name || '—'}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Số tiền</span>
                                                    <span className={cn(
                                                        "text-xl font-black",
                                                        voucher.type === 'income' ? "text-emerald-600" : "text-rose-600"
                                                    )}>
                                                        {voucher.type === 'income' ? '+' : '-'}{formatCurrency(voucher.amount)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-3 bg-slate-50 px-3 rounded-lg border border-slate-100 mb-3">
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Hạng mục</p>
                                                    <p className="text-sm font-black text-slate-700">{voucher.category}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Phương thức</p>
                                                    <p className="text-sm font-bold text-slate-700 capitalize">
                                                        {voucher.payment_method === 'cash' ? 'Tiền mặt' :
                                                         voucher.payment_method === 'transfer' ? 'Chuyển khoản' : 'Zalo Pay'}
                                                    </p>
                                                </div>
                                                <div className="col-span-2 md:col-span-1">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Đơn hàng</p>
                                                    <p className="text-sm font-bold text-indigo-600">{voucher.order_code || '—'}</p>
                                                </div>
                                            </div>

                                            {voucher.notes && (
                                                <div className="flex gap-2 mb-3">
                                                    <MessageSquare className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                                    <p className="text-xs text-slate-600 italic line-clamp-2">{voucher.notes}</p>
                                                </div>
                                            )}

                                            {voucher.image_url && (
                                                <div className="mt-2">
                                                    <img
                                                        src={voucher.image_url}
                                                        alt="Minh chứng"
                                                        className="h-12 w-20 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                                        onClick={() => window.open(voucher.image_url, '_blank')}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-slate-50 md:w-32 border-l border-slate-100 p-4 flex flex-col justify-center gap-2">
                                            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-9 text-xs font-bold" onClick={() => handleApproveVoucher(voucher.id)} disabled={processing}>Duyệt</Button>
                                            <Button variant="outline" className="w-full text-rose-600 border-rose-200 h-9 text-xs font-bold" onClick={() => onRejectClick(voucher.id, 'voucher')} disabled={processing}>Từ chối</Button>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Upsell / Order Edit Detail Dialog */}
            <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && closeDetailDialog()}>
                <DialogContent className={cn("max-h-[85vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl", isOrderEditTicket(selectedTicket) ? "max-w-5xl" : "max-w-2xl")}>
                    <DialogHeader className={cn("px-6 py-4 text-white", isOrderEditTicket(selectedTicket) ? "bg-fuchsia-600" : "bg-indigo-600")}>
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="h-5 w-5" />
                            {isOrderEditTicket(selectedTicket) ? 'Duyệt yêu cầu Sửa đơn' : 'Chi tiết hạng mục Upsell'}
                        </DialogTitle>
                        <DialogDescription className={isOrderEditTicket(selectedTicket) ? "text-fuchsia-100" : "text-indigo-100"}>
                            {isOrderEditTicket(selectedTicket)
                                ? `Xem thông tin đơn trước và sau khi sửa trước khi phê duyệt ${getOrderCode(selectedTicket)}`
                                : `Chi tiết các thay đổi được yêu cầu cho đơn hàng ${getOrderCode(selectedTicket)}`}
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="flex-1 p-6 bg-slate-50">
                        {isOrderEditTicket(selectedTicket) ? (() => {
                            const payload = getOrderEditPayload(selectedTicket);
                            const beforeCustomerItems = selectedOrderBefore?.customer_items || [];
                            const beforeSaleItems = selectedOrderBefore?.sale_items || [];
                            const afterCustomerItems = payload?.customer_items || [];
                            const afterSaleItems = payload?.sale_items || [];
                            const beforeTotal = getOrderTotal(selectedOrderBefore);
                            const afterTotal = getOrderEditTotal(selectedTicket);

                            return (
                                <div className="space-y-5">
                                    {loadingOrderBefore ? (
                                        <div className="flex items-center justify-center py-16 text-sm font-bold text-slate-500">
                                            <Loader2 className="h-5 w-5 animate-spin mr-2 text-fuchsia-600" />
                                            Đang tải thông tin đơn trước khi sửa...
                                        </div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                <OrderSnapshot
                                                    title="Đơn trước khi sửa"
                                                    order={selectedOrderBefore}
                                                    customerItems={beforeCustomerItems}
                                                    saleItems={beforeSaleItems}
                                                    totalAmount={beforeTotal}
                                                    accent="slate"
                                                />
                                                <OrderSnapshot
                                                    title="Đơn sau khi sửa"
                                                    order={{ ...selectedOrderBefore, ...payload, total_amount: afterTotal }}
                                                    customerItems={afterCustomerItems}
                                                    saleItems={afterSaleItems}
                                                    totalAmount={afterTotal}
                                                    accent="fuchsia"
                                                />
                                            </div>
                                            <div className="bg-white rounded-xl border border-fuchsia-100 p-4 flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-black text-slate-800">Chênh lệch tổng tiền</p>
                                                    <p className="text-xs text-slate-500">Sau sửa - trước sửa</p>
                                                </div>
                                                <p className={cn("text-2xl font-black", afterTotal - beforeTotal >= 0 ? "text-emerald-600" : "text-red-600")}>
                                                    {afterTotal - beforeTotal >= 0 ? '+' : ''}{formatCurrency(afterTotal - beforeTotal)}
                                                </p>
                                            </div>
                                            {selectedTicket?.notes && (
                                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-900">
                                                    <span className="font-bold">Ghi chú yêu cầu: </span>{selectedTicket.notes}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })() : (
                        <div className="space-y-6">
                            {/* Customer Items */}
                            {selectedTicket?.data?.customer_items?.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                        <Wrench className="h-4 w-4" />
                                        Sản phẩm khách gửi & Dịch vụ
                                    </h3>
                                    <div className="space-y-3">
                                        {selectedTicket.data.customer_items.map((item: any, idx: number) => (
                                            <Card key={idx} className="border-none shadow-sm overflow-hidden bg-white">
                                                <div className="bg-slate-100/50 px-3 py-1.5 border-b text-[10px] font-bold text-slate-500 uppercase">
                                                    Hạng mục #{idx + 1}: {item.name} ({item.type})
                                                </div>
                                                <CardContent className="p-3">
                                                    <div className="space-y-2">
                                                        {item.services.map((svc: any, sIdx: number) => (
                                                            <div key={sIdx} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                                                                <span className="font-medium">{svc.name}</span>
                                                                <span className="font-bold text-indigo-600">{formatCurrency(svc.price)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Sale Items */}
                            {selectedTicket?.data?.sale_items?.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                        <Package className="h-4 w-4" />
                                        Sản phẩm bán thêm (Retail)
                                    </h3>
                                    <Card className="border-none shadow-sm overflow-hidden bg-white">
                                        <CardContent className="p-0">
                                            <div className="divide-y divide-slate-50">
                                                {selectedTicket.data.sale_items.map((item: any, idx: number) => (
                                                    <div key={idx} className="p-4 flex items-center justify-between">
                                                        <div className="space-y-1">
                                                            <p className="text-sm font-bold">{item.name}</p>
                                                            <p className="text-xs text-slate-500">Số lượng: {item.quantity}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs text-slate-400">Đơn giá: {formatCurrency(item.unit_price)}</p>
                                                            <p className="text-sm font-bold text-emerald-600">{formatCurrency(item.unit_price * item.quantity)}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                                <span className="text-sm font-bold text-indigo-900 uppercase tracking-tight">Tổng số tiền tăng thêm:</span>
                                <span className="text-2xl font-black text-indigo-700">{formatCurrency(selectedTicket?.total_amount)}</span>
                            </div>
                        </div>
                        )}
                    </ScrollArea>

                    <DialogFooter className="px-6 py-4 bg-white border-t gap-3 flex sm:justify-end">
                        <Button variant="outline" onClick={closeDetailDialog}>Đóng</Button>
                        <Button variant="outline" className="text-red-600 border-red-200" onClick={() => onRejectClick(selectedTicket.id, isOrderEditTicket(selectedTicket) ? 'order_edit' : 'upsell')} disabled={processing}>Từ chối</Button>
                        <Button className="bg-emerald-600 hover:bg-emerald-700 font-bold" onClick={() => isOrderEditTicket(selectedTicket) ? handleApproveOrderEdit(selectedTicket.id) : handleApproveUpsell(selectedTicket.id)} disabled={processing || loadingOrderBefore}>
                            {isOrderEditTicket(selectedTicket) ? 'Phê duyệt & Áp dụng sửa đơn' : 'Phê duyệt & Cập nhật đơn hàng'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Reason Dialog */}
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                    <DialogHeader className="p-6 pb-4 bg-red-50/50 border-b">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2 text-red-700">
                            <XCircle className="w-6 h-6" />
                            Từ chối yêu cầu
                        </DialogTitle>
                        <DialogDescription>Nhập lý do tại sao bạn không chấp thuận yêu cầu này.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Lý do từ chối *</Label>
                            <Textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Ví dụ: Giá nhập quá cao, Không cần thiết cho đơn hàng này..."
                                className="min-h-[120px] rounded-xl focus:ring-red-500/20 border-slate-200"
                            />
                        </div>
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 flex gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-amber-800">Thông báo từ chối và lý do sẽ được gửi trực tiếp đến nhân viên liên quan và hiển thị tại chi tiết đơn hàng.</p>
                        </div>
                    </div>
                    <DialogFooter className="p-6 pt-2 bg-slate-50 border-t gap-3 flex sm:justify-end">
                        <Button variant="ghost" onClick={() => setShowRejectDialog(false)} disabled={processing}>Hủy</Button>
                        <Button className="bg-red-600 hover:bg-red-700 font-bold px-6" onClick={handleConfirmReject} disabled={processing}>
                            {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Xác nhận từ chối
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
