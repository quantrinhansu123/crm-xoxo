import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus, Search, Edit, Trash2, Eye, Phone, Mail, MapPin,
    Building2, User, ShoppingCart, DollarSign,
    Star, MessageCircle, Loader2, Package, Calendar, Clock, ArrowRight, FileText, Video,
    ListFilter,
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useCustomers } from '@/hooks/useCustomers';
import type { Customer } from '@/hooks/useCustomers';
import { useEmployees } from '@/hooks/useEmployees';
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
import { formatCurrency, formatDate } from '@/lib/utils';
import { CreateCustomerDialog } from '@/components/customers/CreateCustomerDialog';
import { MobileCustomersList } from '@/components/customers';
import { CustomerPhone } from '@/components/customers/CustomerPhone';

// Customer types imported from hook

const sourceOptions = ['Website', 'Facebook', 'Zalo', 'Giới thiệu', 'Cold Call', 'Event', 'Khác'];

// Interaction types
type InteractionType = 'call' | 'email' | 'meeting' | 'message' | 'note' | 'task';
type InteractionResult = 'successful' | 'no_answer' | 'callback' | 'interested' | 'not_interested' | 'pending' |
    'voicemail' | 'busy' | 'sent' | 'opened' | 'replied' | 'bounced' |
    'cancelled' | 'rescheduled' | 'no_show' | 'read' | 'completed' | 'in_progress';

const interactionTypeLabels: Record<InteractionType, { label: string; icon: React.ReactNode; color: string }> = {
    call: { label: 'Cuộc gọi', icon: <Phone className="h-4 w-4" />, color: 'bg-blue-100 text-blue-600' },
    email: { label: 'Email', icon: <Mail className="h-4 w-4" />, color: 'bg-amber-100 text-amber-600' },
    meeting: { label: 'Cuộc họp', icon: <Video className="h-4 w-4" />, color: 'bg-purple-100 text-purple-600' },
    message: { label: 'Tin nhắn', icon: <MessageCircle className="h-4 w-4" />, color: 'bg-emerald-100 text-emerald-600' },
    note: { label: 'Ghi chú', icon: <FileText className="h-4 w-4" />, color: 'bg-gray-100 text-gray-600' },
    task: { label: 'Công việc', icon: <Clock className="h-4 w-4" />, color: 'bg-pink-100 text-pink-600' },
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
};

const resultOptionsByType: Record<InteractionType, InteractionResult[]> = {
    call: ['successful', 'no_answer', 'callback', 'voicemail', 'busy', 'not_interested'],
    email: ['sent', 'opened', 'replied', 'bounced', 'pending'],
    meeting: ['successful', 'cancelled', 'rescheduled', 'no_show', 'pending'],
    message: ['sent', 'read', 'replied', 'pending'],
    note: ['pending'],
    task: ['completed', 'in_progress', 'pending', 'cancelled'],
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

    // Reset result when type changes if current result is not valid for new type
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
            // Reset form
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

// Customer Detail Dialog
function CustomerDetailDialog({
    open,
    onClose,
    customer,
    onContactClick
}: {
    open: boolean;
    onClose: () => void;
    customer: Customer | null;
    onContactClick: () => void;
}) {
    const { orders, loading: ordersLoading, fetchOrders } = useOrders();
    const { interactions, loading: interactionsLoading, fetchInteractions } = useInteractions();

    // Fetch customer's orders and interactions when dialog opens
    useEffect(() => {
        if (open && customer) {
            fetchOrders({ customer_id: customer.id });
            fetchInteractions({ customer_id: customer.id });
        }
    }, [open, customer, fetchOrders, fetchInteractions]);

    if (!customer) return null;

    const customerOrders = orders.filter(o => o.customer_id === customer.id);
    const customerInteractions = interactions.filter(i => i.customer_id === customer.id);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Chi tiết khách hàng</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="info">
                    <TabsList className="mb-4">
                        <TabsTrigger value="info">Thông tin</TabsTrigger>
                        <TabsTrigger value="orders">Đơn hàng</TabsTrigger>
                        <TabsTrigger value="history">Lịch sử</TabsTrigger>
                    </TabsList>

                    <TabsContent value="info" className="space-y-4">
                        {/* Header */}
                        <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
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
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {customer.tags && customer.tags.map(tag => (
                                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Contact Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Email</p>
                                <p className="font-medium flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    {customer.email || '-'}
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Điện thoại</p>
                                <p className="font-medium flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <CustomerPhone phone={customer.phone} linkable />
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Ngày sinh</p>
                                <p className="font-medium flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    {customer.dob ? formatDate(customer.dob) : '-'}
                                </p>
                            </div>
                            <div className="space-y-1 col-span-2">
                                <p className="text-xs text-muted-foreground">Địa chỉ</p>
                                <p className="font-medium flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    {customer.address || '-'}
                                </p>
                            </div>
                            {customer.type === 'company' && (
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Mã số thuế</p>
                                    <p className="font-medium">{customer.tax_code || '-'}</p>
                                </div>
                            )}
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Nguồn</p>
                                <p className="font-medium">{customer.source || '-'}</p>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-primary">{customer.total_orders || 0}</p>
                                <p className="text-xs text-muted-foreground">Đơn hàng</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(customer.total_spent || 0)}</p>
                                <p className="text-xs text-muted-foreground">Tổng chi tiêu</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold">{customer.last_contact ? formatDate(customer.last_contact) : '-'}</p>
                                <p className="text-xs text-muted-foreground">Liên hệ gần nhất</p>
                            </div>
                        </div>

                        {/* Assigned */}
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                                <p className="text-xs text-muted-foreground">Nhân viên phụ trách</p>
                                <p className="font-medium">{customer.assigned_user?.name || '-'}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">Ngày tạo</p>
                                <p className="font-medium">{formatDate(customer.created_at)}</p>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="orders" className="space-y-4">
                        {/* Orders Summary */}
                        {customerOrders.length > 0 && (
                            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10">
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-primary">{customerOrders.length}</p>
                                    <p className="text-xs text-muted-foreground">Tổng đơn</p>
                                </div>
                                <div className="text-center border-x">
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
                            <div className="text-center py-8">
                                <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
                                <p className="text-muted-foreground">Chưa có đơn hàng nào</p>
                            </div>
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
                                            <div className="flex-1 bg-muted/30 border rounded-lg p-4 hover:shadow-md transition-shadow">
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

                                                {/* Items Detail Table */}
                                                {order.items && order.items.length > 0 && (
                                                    <div className="mb-3">
                                                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                                            <Package className="h-3 w-3" />
                                                            Chi tiết sản phẩm/dịch vụ ({order.items.length})
                                                        </p>
                                                        <div className="bg-white rounded-lg border overflow-hidden">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-muted/50">
                                                                    <tr>
                                                                        <th className="text-left py-2 px-3 font-medium">Tên SP/DV</th>
                                                                        <th className="text-center py-2 px-2 font-medium w-16">SL</th>
                                                                        <th className="text-right py-2 px-2 font-medium w-24">Đơn giá</th>
                                                                        <th className="text-right py-2 px-3 font-medium w-28">Thành tiền</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y">
                                                                    {order.items.map((item, i) => (
                                                                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                                                                            <td className="py-2 px-3">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <span className={`w-1.5 h-1.5 rounded-full ${item.item_type === 'service' ? 'bg-purple-500' : 'bg-blue-500'}`}></span>
                                                                                    <span className="font-medium">{item.item_name}</span>
                                                                                </div>
                                                                                <span className="text-muted-foreground text-[10px] ml-3">
                                                                                    {item.item_type === 'service' ? 'Dịch vụ' : 'Sản phẩm'}
                                                                                </span>
                                                                            </td>
                                                                            <td className="py-2 px-2 text-center">{item.quantity}</td>
                                                                            <td className="py-2 px-2 text-right text-muted-foreground">{formatCurrency(item.unit_price)}</td>
                                                                            <td className="py-2 px-3 text-right font-medium text-primary">{formatCurrency(item.total_price)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Summary Footer */}
                                                <div className="pt-3 border-t space-y-1.5">
                                                    {/* Subtotal & Discount */}
                                                    {order.discount && order.discount > 0 && (
                                                        <>
                                                            <div className="flex items-center justify-between text-sm">
                                                                <span className="text-muted-foreground">Tạm tính:</span>
                                                                <span>{formatCurrency(order.subtotal || order.total_amount + order.discount)}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between text-sm">
                                                                <span className="text-red-500">Giảm giá:</span>
                                                                <span className="text-red-500">-{formatCurrency(order.discount)}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                    {/* Total */}
                                                    <div className="flex items-center justify-between pt-2 border-t border-dashed">
                                                        <span className="font-semibold">Tổng thanh toán:</span>
                                                        <span className="text-xl font-bold text-primary">{formatCurrency(order.total_amount)}</span>
                                                    </div>
                                                    {/* Payment info */}
                                                    {order.paid_amount !== undefined && order.paid_amount > 0 && (
                                                        <div className="flex items-center justify-between pt-2 mt-2 rounded-lg bg-emerald-50 px-3 py-2">
                                                            <span className="text-sm text-emerald-700 flex items-center gap-1">
                                                                <DollarSign className="h-4 w-4" />
                                                                Đã thanh toán:
                                                            </span>
                                                            <span className="font-bold text-emerald-600">{formatCurrency(order.paid_amount)}</span>
                                                        </div>
                                                    )}
                                                    {/* Notes */}
                                                    {order.notes && (
                                                        <div className="mt-2 p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                                                            <span className="font-medium">Ghi chú:</span> {order.notes}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="history" className="space-y-4">
                        {interactionsLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : customerInteractions.length === 0 ? (
                            <div className="text-center py-8">
                                <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
                                <p className="text-muted-foreground">Chưa có lịch sử tương tác</p>
                            </div>
                        ) : (
                            <div className="relative">
                                {customerInteractions.map((interaction, index) => {
                                    const typeInfo = interactionTypeLabels[interaction.type as InteractionType];
                                    const resultInfo = interaction.result ? resultLabels[interaction.result as InteractionResult] : null;
                                    const date = new Date(interaction.created_at);
                                    const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                    const dateStr = formatDate(interaction.created_at);

                                    return (
                                        <div key={interaction.id} className="flex gap-4 pb-6 relative">
                                            {/* Timeline line */}
                                            {index < customerInteractions.length - 1 && (
                                                <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-muted" />
                                            )}

                                            {/* Icon */}
                                            <div className={`z-10 h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${typeInfo?.color || 'bg-gray-100 text-gray-600'}`}>
                                                {typeInfo?.icon || <FileText className="h-4 w-4" />}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 bg-muted/30 border rounded-lg p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                                            <Badge variant="outline">{typeInfo?.label || interaction.type}</Badge>
                                                            {resultInfo && (
                                                                <Badge variant={resultInfo.variant}>{resultInfo.label}</Badge>
                                                            )}
                                                            {interaction.duration && (
                                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {interaction.duration} phút
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h4 className="font-semibold">{interaction.subject}</h4>
                                                    </div>
                                                    <div className="text-right text-xs text-muted-foreground">
                                                        <p>{dateStr}</p>
                                                        <p>{timeStr}</p>
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                {interaction.content && (
                                                    <p className="text-sm text-muted-foreground mb-3">{interaction.content}</p>
                                                )}

                                                {/* Next Action */}
                                                {interaction.next_action && (
                                                    <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg text-sm mb-3">
                                                        <ArrowRight className="h-4 w-4 text-amber-600" />
                                                        <span className="text-amber-800">
                                                            <strong>Tiếp theo:</strong> {interaction.next_action}
                                                            {interaction.next_action_date && ` (${formatDate(interaction.next_action_date)})`}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Footer */}
                                                <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                                                    <span>Bởi: {interaction.created_user?.name || 'Hệ thống'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>Đóng</Button>
                    <Button className="gap-2" onClick={onContactClick}>
                        <MessageCircle className="h-4 w-4" />
                        Liên hệ
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function CustomersPage() {
    const navigate = useNavigate();
    const { customers, loading, error, fetchCustomers, createCustomer, updateCustomer, deleteCustomer } = useCustomers();
    const { employees, fetchEmployees } = useEmployees();
    const { createInteraction, fetchInteractions } = useInteractions();

    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);
    const [showContactDialog, setShowContactDialog] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    // Fetch data on mount
    useEffect(() => {
        fetchCustomers();
        fetchEmployees();
    }, [fetchCustomers, fetchEmployees]);

    const filteredCustomers = customers.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.code && c.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
            c.phone.includes(searchTerm) ||
            (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesType = typeFilter === 'all' || c.type === typeFilter;
        const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
        return matchesSearch && matchesType && matchesStatus;
    });

    // CRUD handlers
    const handleCreateCustomer = async (data: Partial<Customer>) => {
        try {
            await createCustomer(data);
            toast.success('Đã thêm khách hàng mới!');
            await fetchCustomers();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi tạo khách hàng';
            toast.error(message);
            throw error;
        }
    };

    const handleUpdateCustomer = async (data: Partial<Customer>) => {
        if (!selectedCustomer) return;
        try {
            await updateCustomer(selectedCustomer.id, data);
            toast.success('Đã cập nhật khách hàng!');
            await fetchCustomers();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi cập nhật khách hàng';
            toast.error(message);
            throw error;
        }
    };

    const handleDeleteCustomer = async (id: string) => {
        if (!confirm('Xác nhận xóa khách hàng này?')) return;
        try {
            await deleteCustomer(id);
            toast.success('Đã xóa khách hàng!');
            await fetchCustomers();
        } catch {
            toast.error('Lỗi khi xóa khách hàng');
        }
    };

    const handleCreateInteraction = async (data: Partial<Interaction>) => {
        try {
            await createInteraction(data);
            toast.success('Đã tạo tương tác mới!');
            setShowContactDialog(false);
            await fetchInteractions();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Lỗi khi tạo tương tác';
            toast.error(message);
            throw error;
        }
    };

    // Stats
    const totalCustomers = customers.length;
    const activeCustomers = customers.filter(c => c.status === 'active').length;
    const totalSpent = customers.reduce((sum, c) => sum + (c.total_spent || 0), 0);
    const avgSpent = totalCustomers > 0 ? totalSpent / totalCustomers : 0;

    if (loading && customers.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-100">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <>
            <Toaster position="top-right" richColors />
            <div className="animate-fade-in space-y-3 p-3 md:space-y-6 md:p-0">
                {/* ——— Mobile ——— */}
                <div className="space-y-3 md:hidden">
                    <div className="rounded-xl bg-muted/60 p-2">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 shrink-0 border-slate-200 bg-white shadow-sm"
                                title="Bộ lọc"
                                type="button"
                            >
                                <ListFilter className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <div className="relative min-w-0 flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Tìm tên, mã, SĐT"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="h-10 border-slate-200 bg-white pl-9 shadow-sm"
                                />
                            </div>
                            <Button
                                size="icon"
                                className="h-10 w-10 shrink-0 shadow-sm"
                                onClick={() => {
                                    setSelectedCustomer(null);
                                    setShowForm(true);
                                }}
                                title="Thêm khách hàng"
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="relative overflow-hidden rounded-xl bg-blue-600 p-3 text-white shadow-sm">
                            <User className="absolute right-2 top-2 h-4 w-4 opacity-40" />
                            <p className="text-[11px] font-medium opacity-90">Tổng KH</p>
                            <p className="text-xl font-bold">{totalCustomers}</p>
                        </div>
                        <div className="relative overflow-hidden rounded-xl bg-purple-600 p-3 text-white shadow-sm">
                            <Star className="absolute right-2 top-2 h-4 w-4 opacity-40" />
                            <p className="text-[11px] font-medium opacity-90">Đang hoạt động</p>
                            <p className="text-xl font-bold">{activeCustomers}</p>
                        </div>
                        <div className="relative overflow-hidden rounded-xl bg-emerald-600 p-3 text-white shadow-sm">
                            <DollarSign className="absolute right-2 top-2 h-4 w-4 opacity-40" />
                            <p className="text-[11px] font-medium opacity-90">Tổng doanh thu</p>
                            <p className="text-base font-bold leading-tight">{formatCurrency(totalSpent)}</p>
                        </div>
                        <div className="relative overflow-hidden rounded-xl bg-orange-500 p-3 text-white shadow-sm">
                            <ShoppingCart className="absolute right-2 top-2 h-4 w-4 opacity-40" />
                            <p className="text-[11px] font-medium opacity-90">Chi tiêu TB/KH</p>
                            <p className="text-base font-bold leading-tight">{formatCurrency(avgSpent)}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="h-10 border-slate-200 bg-white shadow-sm">
                                <SelectValue placeholder="Loại KH" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả</SelectItem>
                                <SelectItem value="individual">Cá nhân</SelectItem>
                                <SelectItem value="company">Doanh nghiệp</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-10 border-slate-200 bg-white shadow-sm">
                                <SelectValue placeholder="Trạng thái" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả</SelectItem>
                                <SelectItem value="active">Hoạt động</SelectItem>
                                <SelectItem value="inactive">Không hoạt động</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    <MobileCustomersList
                        customers={filteredCustomers}
                        loading={loading}
                        onView={(c) => navigate(`/customers/${c.id}`)}
                        onEdit={(c) => {
                            setSelectedCustomer(c);
                            setShowForm(true);
                        }}
                    />
                </div>

                {/* ——— Desktop ——— */}
                <div className="hidden md:flex md:flex-col md:gap-6">
                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Khách hàng</h1>
                        <p className="text-muted-foreground">Quản lý thông tin khách hàng</p>
                    </div>
                    <Button onClick={() => { setSelectedCustomer(null); setShowForm(true); }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Thêm khách hàng
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-linear-to-br from-blue-50 to-blue-100 border-0">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Tổng khách hàng</p>
                                    <p className="text-2xl font-bold text-blue-600">{totalCustomers}</p>
                                </div>
                                <User className="h-8 w-8 text-blue-500/50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-linear-to-br from-purple-50 to-purple-100 border-0">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Đang hoạt động</p>
                                    <p className="text-2xl font-bold text-purple-600">{activeCustomers}</p>
                                </div>
                                <Star className="h-8 w-8 text-purple-500/50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-linear-to-br from-emerald-50 to-emerald-100 border-0">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Tổng doanh thu</p>
                                    <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalSpent)}</p>
                                </div>
                                <DollarSign className="h-8 w-8 text-emerald-500/50" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-linear-to-br from-amber-50 to-amber-100 border-0">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Chi tiêu TB/KH</p>
                                    <p className="text-2xl font-bold text-amber-600">{formatCurrency(avgSpent)}</p>
                                </div>
                                <ShoppingCart className="h-8 w-8 text-amber-500/50" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                        {error}
                    </div>
                )}

                {/* Filters */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Tìm theo tên, mã, SĐT, email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="w-full sm:w-40">
                                    <SelectValue placeholder="Loại KH" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tất cả</SelectItem>
                                    <SelectItem value="individual">Cá nhân</SelectItem>
                                    <SelectItem value="company">Doanh nghiệp</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full sm:w-40">
                                    <SelectValue placeholder="Trạng thái" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tất cả</SelectItem>
                                    <SelectItem value="active">Hoạt động</SelectItem>
                                    <SelectItem value="inactive">Không hoạt động</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Customer List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Danh sách khách hàng ({filteredCustomers.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-muted/50 border-y">
                                    <tr>
                                        <th className="p-3 text-left text-sm font-medium text-muted-foreground">Khách hàng</th>
                                        <th className="p-3 text-left text-sm font-medium text-muted-foreground">Liên hệ</th>
                                        <th className="p-3 text-left text-sm font-medium text-muted-foreground">Nguồn</th>
                                        <th className="p-3 text-right text-sm font-medium text-muted-foreground">Đơn hàng</th>
                                        <th className="p-3 text-right text-sm font-medium text-muted-foreground">Tổng chi tiêu</th>
                                        <th className="p-3 text-center text-sm font-medium text-muted-foreground">Trạng thái</th>
                                        <th className="p-3 text-right text-sm font-medium text-muted-foreground">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCustomers.map((customer) => (
                                        <tr key={customer.id} className="border-b hover:bg-muted/30 transition-colors">
                                            <td className="p-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-10 w-10">
                                                        <AvatarFallback className={customer.type === 'company' ? 'bg-blue-100 text-blue-600' : ''}>
                                                            {customer.type === 'company' ? <Building2 className="h-5 w-5" /> : customer.name.charAt(0)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="font-medium">{customer.name}</p>
                                                        <p className="text-xs text-muted-foreground">{customer.code || '-'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <p className="text-sm">{customer.email || '-'}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    <CustomerPhone phone={customer.phone} />
                                                </p>
                                            </td>
                                            <td className="p-3">
                                                <Badge variant="outline">{customer.source || '-'}</Badge>
                                            </td>
                                            <td className="p-3 text-right">{customer.total_orders || 0}</td>
                                            <td className="p-3 text-right font-semibold text-emerald-600">
                                                {formatCurrency(customer.total_spent || 0)}
                                            </td>
                                            <td className="p-3 text-center">
                                                <Badge variant={customer.status === 'active' ? 'success' : 'secondary'}>
                                                    {customer.status === 'active' ? 'Hoạt động' : 'Không hoạt động'}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => navigate(`/customers/${customer.id}`)}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => { setSelectedCustomer(customer); setShowForm(true); }}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-red-500 hover:bg-red-50"
                                                        onClick={() => handleDeleteCustomer(customer.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {filteredCustomers.length === 0 && (
                            <div className="p-8 text-center text-muted-foreground">
                                Không tìm thấy khách hàng nào
                            </div>
                        )}
                    </CardContent>
                </Card>
                </div>

                {/* Dialogs */}
                <CreateCustomerDialog
                    open={showForm}
                    onClose={() => { setShowForm(false); setSelectedCustomer(null); }}
                    customer={selectedCustomer}
                    onSubmit={selectedCustomer ? handleUpdateCustomer : handleCreateCustomer}
                    employees={employees}
                />
                <InteractionFormDialog
                    open={showContactDialog}
                    onClose={() => { setShowContactDialog(false); }}
                    onSubmit={handleCreateInteraction}
                    preselectedCustomerId={selectedCustomer?.id}
                />
            </div>
        </>
    );
}
