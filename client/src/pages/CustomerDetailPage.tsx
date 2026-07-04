import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Phone, Mail, MapPin, Building2, User, ShoppingCart, DollarSign,
    Star, MessageCircle, Loader2, Package, Calendar, Clock, ArrowRight, FileText, Video, Edit, AlertCircle, Scale
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useCustomers } from '@/hooks/useCustomers';
import type { Customer } from '@/hooks/useCustomers';
import { useOrders } from '@/hooks/useOrders';
import { useInteractions } from '@/hooks/useInteractions';
import type { Interaction } from '@/hooks/useInteractions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { customersApi, invoicesApi } from '@/lib/api';
import { InvoiceDetailDialog, type Invoice } from '@/components/invoices/InvoiceDetailDialog';
import { CustomerDebtTab } from '@/components/customers/CustomerDebtTab';
import { useAuth } from '@/contexts/AuthContext';
import { CustomerPhone } from '@/components/customers/CustomerPhone';

// Interaction types
type InteractionType = 'call' | 'email' | 'meeting' | 'message' | 'note' | 'task' | 'purchase';
type InteractionResult = 'successful' | 'no_answer' | 'callback' | 'interested' | 'not_interested' | 'pending' |
    'voicemail' | 'busy' | 'sent' | 'opened' | 'replied' | 'bounced' |
    'cancelled' | 'rescheduled' | 'no_show' | 'read' | 'completed' | 'in_progress' | 'after_sale';

const interactionTypeLabels: Record<InteractionType, { label: string; icon: React.ReactNode; color: string }> = {
    call: { label: 'Cuộc gọi', icon: <Phone className="h-4 w-4" />, color: 'bg-blue-100 text-blue-600' },
    email: { label: 'Email', icon: <Mail className="h-4 w-4" />, color: 'bg-amber-100 text-amber-600' },
    meeting: { label: 'Cuộc họp', icon: <Video className="h-4 w-4" />, color: 'bg-purple-100 text-purple-600' },
    message: { label: 'Tin nhắn', icon: <MessageCircle className="h-4 w-4" />, color: 'bg-emerald-100 text-emerald-600' },
    note: { label: 'Ghi chú', icon: <FileText className="h-4 w-4" />, color: 'bg-gray-100 text-gray-600' },
    task: { label: 'Công việc', icon: <Clock className="h-4 w-4" />, color: 'bg-pink-100 text-pink-600' },
    purchase: { label: 'Mua hàng', icon: <ShoppingCart className="h-4 w-4" />, color: 'bg-green-100 text-green-600' },
};

const resultLabels: Record<InteractionResult, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'info' }> = {
    successful: { label: 'Thành công', variant: 'success' },
    no_answer: { label: 'Không nghe máy', variant: 'secondary' },
    callback: { label: 'Hẹn gọi lại', variant: 'info' },
    voicemail: { label: 'Để lại tin nhắn', variant: 'info' },
    busy: { label: 'Máy bận', variant: 'secondary' },
    interested: { label: 'Quan tâm', variant: 'success' },
    not_interested: { label: 'Không quan tâm', variant: 'danger' },
    pending: { label: 'Đang chờ', variant: 'warning' },
    sent: { label: 'Đã gửi', variant: 'info' },
    opened: { label: 'Đã mở', variant: 'success' },
    replied: { label: 'Đã phản hồi', variant: 'success' },
    bounced: { label: 'Bị trả lại', variant: 'danger' },
    cancelled: { label: 'Đã hủy', variant: 'danger' },
    rescheduled: { label: 'Đã dời lịch', variant: 'warning' },
    no_show: { label: 'Không xuất hiện', variant: 'danger' },
    read: { label: 'Đã đọc', variant: 'success' },
    completed: { label: 'Hoàn thành', variant: 'success' },
    in_progress: { label: 'Đang thực hiện', variant: 'info' },
    after_sale: { label: 'After Sale', variant: 'success' },
};

const resultOptionsByType: Record<InteractionType, InteractionResult[]> = {
    call: ['successful', 'no_answer', 'callback', 'voicemail', 'busy', 'not_interested'],
    email: ['sent', 'opened', 'replied', 'bounced', 'pending'],
    meeting: ['successful', 'cancelled', 'rescheduled', 'no_show', 'pending'],
    message: ['sent', 'read', 'replied', 'pending'],
    note: ['pending'],
    task: ['completed', 'in_progress', 'pending', 'cancelled'],
    purchase: ['completed', 'pending', 'cancelled'],
};

// Interaction Form Dialog
function InteractionFormDialog({
    open,
    onClose,
    onSubmit,
    preselectedCustomerId
}: {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Interaction>) => Promise<void>;
    preselectedCustomerId?: string;
}) {
    const [type, setType] = useState<InteractionType>('call');
    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');
    const [result, setResult] = useState<InteractionResult>('pending');
    const [duration, setDuration] = useState(0);
    const [nextAction, setNextAction] = useState('');
    const [nextActionDate, setNextActionDate] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const validResults = resultOptionsByType[type];
        if (!validResults.includes(result)) {
            setResult(validResults[0] || 'pending');
        }
    }, [type, result]);

    const handleSubmit = async () => {
        if (!preselectedCustomerId || !subject) {
            toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit({
                customer_id: preselectedCustomerId,
                type,
                subject,
                content: content || undefined,
                result: result || undefined,
                duration: (type === 'call' || type === 'meeting') && duration > 0 ? duration : undefined,
                next_action: nextAction || undefined,
                next_action_date: nextActionDate || undefined,
            });
            setSubject('');
            setContent('');
            setDuration(0);
            setNextAction('');
            setNextActionDate('');
            onClose();
        } catch {
            // Error handled in parent
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageCircle className="h-5 w-5 text-primary" />
                        Thêm tương tác mới
                    </DialogTitle>
                    <DialogDescription>Ghi nhận tương tác với khách hàng</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Type Selection */}
                    <div className="space-y-2">
                        <Label>Loại tương tác *</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {(Object.keys(interactionTypeLabels) as InteractionType[]).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setType(t)}
                                    className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-colors ${type === t ? 'bg-primary text-white border-primary' : 'hover:bg-muted'
                                        }`}
                                >
                                    {interactionTypeLabels[t].icon}
                                    {interactionTypeLabels[t].label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Subject */}
                    <div className="space-y-2">
                        <Label>Tiêu đề *</Label>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Nhập tiêu đề tương tác" />
                    </div>

                    {/* Content */}
                    <div className="space-y-2">
                        <Label>Nội dung</Label>
                        <textarea
                            className="w-full min-h-25 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Mô tả chi tiết nội dung tương tác..."
                        />
                    </div>

                    {/* Result & Duration */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Kết quả</Label>
                            <Select value={result} onValueChange={(v) => setResult(v as InteractionResult)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {resultOptionsByType[type].map(r => (
                                        <SelectItem key={r} value={r}>{resultLabels[r].label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {(type === 'call' || type === 'meeting') && (
                            <div className="space-y-2">
                                <Label>Thời lượng (phút)</Label>
                                <Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                            </div>
                        )}
                    </div>

                    {/* Next Action */}
                    <div className="space-y-3 pt-4 border-t">
                        <Label className="text-base font-semibold">Hành động tiếp theo</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Công việc</Label>
                                <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Mô tả công việc" />
                            </div>
                            <div className="space-y-2">
                                <Label>Ngày thực hiện</Label>
                                <Input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Huỷ</Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Đang lưu...
                            </>
                        ) : 'Lưu'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function CustomerDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { createInteraction, fetchInteractions, interactions, loading: interactionsLoading } = useInteractions();
    const { orders, loading: ordersLoading, fetchOrders } = useOrders();

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);
    const [showContactDialog, setShowContactDialog] = useState(false);

    const { user } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [showInvoiceDetail, setShowInvoiceDetail] = useState(false);
    const [loadingInvoice, setLoadingInvoice] = useState(false);
    const [leadInteractions, setLeadInteractions] = useState<Interaction[]>([]);

    // Fetch customer data
    useEffect(() => {
        const fetchCustomer = async () => {
            if (!id) return;
            setLoading(true);
            try {
                const response = await customersApi.getById(id);
                setCustomer(response.data.data?.customer);
            } catch (error) {
                toast.error('Không thể tải thông tin khách hàng');
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchCustomer();
    }, [id]);

    // Fetch orders and interactions (customer + lead)
    useEffect(() => {
        if (id) {
            fetchOrders({ customer_id: id });
            fetchInteractions({ customer_id: id });
            fetchInvoices();
        }
    }, [id, fetchOrders, fetchInteractions]);

    const fetchInvoices = async () => {
        if (!id) return;
        try {
            const response = await invoicesApi.getAll({ customer_id: id });
            setInvoices(response.data.data?.invoices || []);
        } catch (error) {
            console.error('Error fetching invoices:', error);
        }
    };

    const handleInvoiceStatusChange = async (
        invoiceId: string,
        status: string,
        options?: { cancel_related_payments?: boolean },
    ) => {
        try {
            await invoicesApi.updateStatus(invoiceId, status, options);
            if (status === 'cancelled') {
                toast.success(
                    options?.cancel_related_payments !== false
                        ? 'Đã hủy hóa đơn và các phiếu thanh toán liên quan'
                        : 'Đã hủy hóa đơn!',
                );
            } else {
                toast.success('Đã cập nhật trạng thái hóa đơn');
            }
            await fetchInvoices();
            const response = await invoicesApi.getById(invoiceId);
            if (response.data.data?.invoice) setSelectedInvoice(response.data.data.invoice);
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật trạng thái hóa đơn');
        }
    };

    const handleViewInvoice = async (invoiceId: string) => {
        setLoadingInvoice(true);
        try {
            const response = await invoicesApi.getById(invoiceId);
            const invoice = response.data.data?.invoice;
            if (invoice) {
                setSelectedInvoice(invoice);
                setShowInvoiceDetail(true);
            }
        } catch (err: any) {
            toast.error('Lỗi khi tải chi tiết hóa đơn');
        } finally {
            setLoadingInvoice(false);
        }
    };

    // Fetch lead interactions if customer came from lead
    useEffect(() => {
        const fetchLeadHistory = async () => {
            if (customer?.lead_id) {
                try {
                    const { interactionsApi } = await import('@/lib/api');
                    const response = await interactionsApi.getAll({ lead_id: customer.lead_id });
                    setLeadInteractions(response.data.data?.interactions || []);
                } catch (error) {
                    console.error('Error fetching lead interactions:', error);
                }
            }
        };
        fetchLeadHistory();
    }, [customer?.lead_id]);

    const handleCreateInteraction = async (data: Partial<Interaction>) => {
        try {
            await createInteraction(data);
            toast.success('Đã tạo tương tác mới!');
            setShowContactDialog(false);
            if (id) fetchInteractions({ customer_id: id });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi tạo tương tác';
            toast.error(message);
            throw error;
        }
    };

    const customerOrders = orders.filter(o => o.customer_id === id);

    // Combine customer interactions + lead interactions + orders into unified timeline
    const customerInteractions = interactions.filter(i => i.customer_id === id);
    const allInteractions = [...customerInteractions, ...leadInteractions];
    
    // Calculate total debt for all orders
    const totalDebt = customerOrders.reduce((sum, o) => sum + (Number((o as any).remaining_debt) || 0), 0);

    // Convert orders to timeline items
    interface TimelineItem {
        id: string;
        type: InteractionType;
        subject: string;
        content?: string;
        result?: string;
        duration?: number;
        next_action?: string;
        next_action_date?: string;
        created_at: string;
        created_user?: { id: string; name: string };
        order_code?: string;
        total_amount?: number;
        isFromLead?: boolean;
        invoice_id?: string;
        invoice_code?: string;
    }

    const orderTimelineItems: TimelineItem[] = customerOrders.map(order => {
        const orderInvoice = invoices.find(inv => inv.order_id === order.id);
        return {
            id: `order-${order.id}`,
            type: 'purchase' as InteractionType,
            subject: orderInvoice ? orderInvoice.invoice_code : `Đơn hàng ${order.order_code}`,
            content: `${order.items?.length || 0} sản phẩm/dịch vụ - Tổng: ${formatCurrency(order.total_amount)}`,
            result: order.status === 'after_sale' ? 'after_sale' :
                order.status === 'cancelled' ? 'cancelled' : 'pending',
            created_at: order.created_at,
            created_user: order.sales_user,
            order_code: order.order_code,
            total_amount: order.total_amount,
            invoice_id: orderInvoice?.id,
            invoice_code: orderInvoice?.invoice_code,
        };
    });

    const interactionTimelineItems: TimelineItem[] = allInteractions.map(i => ({
        ...i,
        type: i.type as InteractionType,
        isFromLead: !!i.lead_id && !i.customer_id,
    }));

    // Combine and sort by date (newest first)
    const unifiedTimeline: TimelineItem[] = [...orderTimelineItems, ...interactionTimelineItems]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-100">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="flex flex-col items-center justify-center min-h-100 gap-4">
                <p className="text-muted-foreground">Không tìm thấy khách hàng</p>
                <Button onClick={() => navigate('/customers')}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Quay lại
                </Button>
            </div>
        );
    }

    return (
        <>
            <Toaster position="top-right" richColors />
            <div className="space-y-6 animate-fade-in">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/customers')} className="-ml-2 shrink-0">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">{customer.name}</h1>
                            <p className="text-muted-foreground text-sm sm:text-base">{customer.code || customer.name}</p>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button variant="outline" onClick={() => navigate(`/customers?edit=${customer.id}`)} className="flex-1 sm:flex-none">
                            <Edit className="h-4 w-4 mr-2" />
                            Sửa
                        </Button>
                        <Button onClick={() => setShowContactDialog(true)} className="flex-1 sm:flex-none">
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Liên hệ
                        </Button>
                    </div>
                </div>

                {/* Main Content - 2 Column Layout */}
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Left Column - Customer Info */}
                    <div className="lg:col-span-1 space-y-4">
                        {/* Customer Card */}
                        <Card>
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4 mb-4">
                                    <Avatar className="h-16 w-16">
                                        <AvatarFallback className="text-xl bg-primary text-white">
                                            {customer.type === 'company' ? <Building2 className="h-8 w-8" /> : customer.name.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-xl font-bold">{customer.name}</h3>
                                            <Badge variant={customer.status === 'active' ? 'success' : 'secondary'}>
                                                {customer.status === 'active' ? 'Hoạt động' : 'Không hoạt động'}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{customer.code || '-'}</p>
                                    </div>
                                </div>

                                {/* Contact Info */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">{customer.email || '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Phone className="h-4 w-4 text-muted-foreground" />
                                        <CustomerPhone phone={customer.phone} className="text-sm" linkable />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <MapPin className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">{customer.address || '-'}</span>
                                    </div>
                                    {customer.type === 'company' && customer.tax_code && (
                                        <div className="flex items-center gap-3">
                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm">MST: {customer.tax_code}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Tags */}
                                {customer.tags && customer.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-4 pt-4 border-t">
                                        {customer.tags.map(tag => (
                                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Stats Card */}
                        <Card>
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50">
                                    <div className="flex items-center gap-2">
                                        <ShoppingCart className="h-5 w-5 text-blue-600" />
                                        <span className="text-sm text-muted-foreground">Đơn hàng</span>
                                    </div>
                                    <span className="text-xl font-bold text-blue-600">{customer.total_orders || 0}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50">
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-5 w-5 text-emerald-600" />
                                        <span className="text-sm text-muted-foreground">Tổng chi tiêu</span>
                                    </div>
                                    <span className="text-xl font-bold text-emerald-600">{formatCurrency(customer.total_spent || 0)}</span>
                                </div>
                                <div className={cn(
                                    "flex items-center justify-between p-3 rounded-lg",
                                    totalDebt > 0 ? "bg-red-50" : "bg-emerald-50/50"
                                )}>
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className={cn(
                                            "h-5 w-5",
                                            totalDebt > 0 ? "text-red-600" : "text-emerald-600"
                                        )} />
                                        <span className="text-sm text-muted-foreground">Tổng nợ hiện tại</span>
                                    </div>
                                    <span className={cn(
                                        "text-xl font-bold",
                                        totalDebt > 0 ? "text-red-600" : "text-emerald-600"
                                    )}>
                                        {formatCurrency(totalDebt)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-5 w-5 text-amber-600" />
                                        <span className="text-sm text-muted-foreground">Liên hệ gần nhất</span>
                                    </div>
                                    <span className="font-medium text-amber-700">
                                        {customer.last_contact ? formatDate(customer.last_contact) : '-'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Assigned Info */}
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Nhân viên phụ trách</p>
                                        <p className="font-medium">{customer.assigned_user?.name || '-'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground">Nguồn</p>
                                        <Badge variant="outline">{customer.source || '-'}</Badge>
                                    </div>
                                </div>
                                <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                                    Ngày tạo: {formatDate(customer.created_at)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column - Orders & History */}
                    <div className="lg:col-span-2">
                        <Tabs defaultValue="orders" className="w-full">
                            <TabsList className="mb-4">
                                <TabsTrigger value="orders" className="gap-2">
                                    <ShoppingCart className="h-4 w-4" />
                                    Đơn hàng ({customerOrders.length})
                                </TabsTrigger>
                                <TabsTrigger value="history" className="gap-2">
                                    <Calendar className="h-4 w-4" />
                                    Lịch sử ({unifiedTimeline.length})
                                </TabsTrigger>
                                <TabsTrigger value="debt" className="gap-2">
                                    <Scale className="h-4 w-4" />
                                    Công nợ
                                </TabsTrigger>
                            </TabsList>

                            {/* Orders Tab */}
                            <TabsContent value="orders" className="space-y-4">
                                {/* Orders Summary */}
                                {customerOrders.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10">
                                        <div className="text-center sm:border-r border-b sm:border-b-0 pb-2 sm:pb-0">
                                            <p className="text-2xl font-bold text-primary">{customerOrders.length}</p>
                                            <p className="text-xs text-muted-foreground">Tổng đơn</p>
                                        </div>
                                        <div className="text-center sm:border-r border-b sm:border-b-0 pb-2 sm:pb-0">
                                            <p className="text-2xl font-bold text-emerald-600">
                                                {customerOrders.filter(o => o.status === 'after_sale').length}
                                            </p>
                                            <p className="text-xs text-muted-foreground">Hoàn thành</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-2xl font-bold text-primary">
                                                {formatCurrency(customerOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0))}
                                            </p>
                                            <p className="text-xs text-muted-foreground">Tổng giá trị</p>
                                        </div>
                                    </div>
                                )}

                                {ordersLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    </div>
                                ) : customerOrders.length === 0 ? (
                                    <Card>
                                        <CardContent className="flex flex-col items-center justify-center py-12">
                                            <Package className="h-12 w-12 text-muted-foreground/50 mb-2" />
                                            <p className="text-muted-foreground">Chưa có đơn hàng nào</p>
                                            <Button className="mt-4" onClick={() => navigate('/orders/new')}>
                                                Tạo đơn hàng
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="relative">
                                        {customerOrders.map((order, index) => {
                                            const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
                                                before_sale: { label: 'Đơn nháp', color: 'text-blue-600', bgColor: 'bg-blue-100' },
                                                in_progress: { label: 'Đang thực hiện', color: 'text-amber-600', bgColor: 'bg-amber-100' },
                                                done: { label: 'Đã hoàn thiện', color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
                                                after_sale: { label: 'After Sale', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
                                                cancelled: { label: 'Đã hủy', color: 'text-red-600', bgColor: 'bg-red-100' },
                                            };
                                            const status = statusConfig[order.status] || statusConfig.pending;
                                            const date = new Date(order.created_at);
                                            const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                            const dateStr = formatDate(order.created_at);

                                            return (
                                                <div key={order.id} className="flex gap-4 pb-6 relative">
                                                    {/* Timeline line */}
                                                    {index < customerOrders.length - 1 && (
                                                        <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-muted" />
                                                    )}

                                                    {/* Status Icon */}
                                                    <div className={`z-10 h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${status.bgColor} ${status.color}`}>
                                                        <ShoppingCart className="h-5 w-5" />
                                                    </div>

                                                    {/* Order Card */}
                                                    <Card
                                                        className="flex-1 cursor-pointer hover:shadow-md transition-shadow"
                                                        onClick={() => navigate(`/orders/${order.id}`)}
                                                    >
                                                        <CardContent className="p-4">
                                                            {/* Header */}
                                                            <div className="flex items-start justify-between mb-3">
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-bold text-primary">{order.order_code}</span>
                                                                        <Badge variant={
                                                                            order.status === 'after_sale' ? 'success' :
                                                                                order.status === 'cancelled' ? 'danger' :
                                                                                    order.status === 'in_progress' ? 'warning' :
                                                                                        order.status === 'done' ? 'info' : 'secondary'
                                                                        }>
                                                                            {status.label}
                                                                        </Badge>
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        NV phụ trách: {order.sales_user?.name || '-'}
                                                                    </p>
                                                                </div>
                                                                <div className="text-right text-xs text-muted-foreground">
                                                                    <p>{dateStr}</p>
                                                                    <p>{timeStr}</p>
                                                                </div>
                                                            </div>

                                                            {/* Items count */}
                                                            {order.items && order.items.length > 0 && (
                                                                <p className="text-sm text-muted-foreground mb-2">
                                                                    {order.items.length} sản phẩm/dịch vụ
                                                                </p>
                                                            )}

                                                            {/* Total & Payment Status */}
                                                            <div className="flex items-center justify-between pt-2 border-t">
                                                                <div className="flex flex-col">
                                                                    <span className="text-lg font-bold text-primary">{formatCurrency(order.total_amount)}</span>
                                                                    {(order as any).remaining_debt > 0 ? (
                                                                        <span className="text-[10px] font-bold text-red-600 uppercase tracking-tight">
                                                                            Còn nợ: {formatCurrency((order as any).remaining_debt)}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight">
                                                                            Đã thanh toán đủ
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {(() => {
                                                                    const orderInvoice = invoices.find(inv => inv.order_id === order.id);
                                                                    if (orderInvoice) {
                                                                        return (
                                                                            <Button
                                                                                variant="ghost" 
                                                                                size="sm"
                                                                                className="h-8 text-primary hover:text-primary hover:bg-primary/5 gap-1"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleViewInvoice(orderInvoice.id);
                                                                                }}
                                                                                disabled={loadingInvoice}
                                                                            >
                                                                                <FileText className="h-3.5 w-3.5" />
                                                                                Xem hóa đơn
                                                                            </Button>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </TabsContent>

                            {/* History Tab */}
                            <TabsContent value="history" className="space-y-4">
                                {interactionsLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    </div>
                                ) : unifiedTimeline.length === 0 ? (
                                    <Card>
                                        <CardContent className="flex flex-col items-center justify-center py-12">
                                            <Calendar className="h-12 w-12 text-muted-foreground/50 mb-2" />
                                            <p className="text-muted-foreground">Chưa có lịch sử hoạt động</p>
                                            <Button className="mt-4" onClick={() => setShowContactDialog(true)}>
                                                Thêm tương tác
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="relative">
                                        {unifiedTimeline.map((item, index) => {
                                            const typeInfo = interactionTypeLabels[item.type];
                                            const resultInfo = item.result ? resultLabels[item.result as InteractionResult] : null;
                                            const date = new Date(item.created_at);
                                            const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                            const dateStr = formatDate(item.created_at);
                                            const isPurchase = item.type === 'purchase';
                                            const orderId = isPurchase ? item.id.replace('order-', '') : null;

                                            return (
                                                <div key={item.id} className="flex gap-4 pb-6 relative">
                                                    {/* Timeline line */}
                                                    {index < unifiedTimeline.length - 1 && (
                                                        <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-muted" />
                                                    )}

                                                    {/* Icon */}
                                                    <div className={`z-10 h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${typeInfo?.color || 'bg-gray-100 text-gray-600'}`}>
                                                        {typeInfo?.icon || <FileText className="h-4 w-4" />}
                                                    </div>

                                                    {/* Content */}
                                                    <Card
                                                        className={`flex-1 ${isPurchase ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                                                        onClick={() => isPurchase && orderId && navigate(`/orders/${orderId}`)}
                                                    >
                                                        <CardContent className="p-4">
                                                            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                                                <div>
                                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                        <Badge variant="outline">{typeInfo?.label || item.type}</Badge>
                                                                        {resultInfo && (
                                                                            <Badge variant={resultInfo.variant}>{resultInfo.label}</Badge>
                                                                        )}
                                                                        {item.isFromLead && (
                                                                            <Badge variant="secondary" className="text-xs">Từ Lead</Badge>
                                                                        )}
                                                                        {item.duration && (
                                                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                                <Clock className="h-3 w-3" />
                                                                                {item.duration} phút
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <h4 className="font-semibold">{item.subject}</h4>
                                                                </div>
                                                                <div className="text-right text-xs text-muted-foreground">
                                                                    <p>{dateStr}</p>
                                                                    <p>{timeStr}</p>
                                                                </div>
                                                            </div>

                                                            {/* Content */}
                                                            {item.content && (
                                                                <p className="text-sm text-muted-foreground mb-3">{item.content}</p>
                                                            )}

                                                            {/* Purchase total */}
                                                            {isPurchase && item.total_amount && (
                                                                <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg text-sm mb-3">
                                                                    <span className="text-green-700 font-medium">Tổng đơn hàng:</span>
                                                                    <span className="text-green-700 font-bold">{formatCurrency(item.total_amount)}</span>
                                                                </div>
                                                            )}

                                                            {/* Next Action */}
                                                            {item.next_action && (
                                                                <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg text-sm mb-3">
                                                                    <ArrowRight className="h-4 w-4 text-amber-600" />
                                                                    <span className="text-amber-800">
                                                                        <strong>Tiếp theo:</strong> {item.next_action}
                                                                        {item.next_action_date && ` (${formatDate(item.next_action_date)})`}
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {/* Footer */}
                                                            <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                                                                {isPurchase ? (
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <span className="text-primary flex items-center gap-1">
                                                                            Xem chi tiết <ArrowRight className="h-3 w-3" />
                                                                        </span>
                                                                        {item.invoice_id && (
                                                                            <Button 
                                                                                variant="link" 
                                                                                size="sm" 
                                                                                className="h-auto p-0 text-xs font-semibold h-4"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleViewInvoice(item.invoice_id!);
                                                                                }}
                                                                            >
                                                                                <FileText className="h-3 w-3 mr-1" />
                                                                                Xem hóa đơn {item.invoice_code}
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span>Bởi: {item.created_user?.name || 'Hệ thống'}</span>
                                                                )}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="debt">
                                <CustomerDebtTab
                                    customerId={customer.id}
                                    customerName={customer.name}
                                    customerPhone={customer.phone}
                                />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>

            {/* Interaction Form Dialog */}
            <InteractionFormDialog
                open={showContactDialog}
                onClose={() => setShowContactDialog(false)}
                onSubmit={handleCreateInteraction}
                preselectedCustomerId={customer.id}
            />

            {/* Invoice Detail Dialog */}
            <InvoiceDetailDialog
                invoice={selectedInvoice}
                open={showInvoiceDetail}
                onClose={() => setShowInvoiceDetail(false)}
                onStatusChange={
                    ['manager', 'admin', 'accountant'].includes(user?.role || '')
                        ? handleInvoiceStatusChange
                        : undefined
                }
                canEdit={['manager', 'admin', 'accountant'].includes(user?.role || '')}
            />
        </>
    );
}
