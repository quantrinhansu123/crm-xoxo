import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Search, FileText, Loader2, Eye, Pencil, CheckCircle, XCircle, Clock, Calendar } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { invoicesApi, ordersApi } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDate, formatDateTime, cn } from '@/lib/utils';
import { PaymentRecordDialog } from '@/components/orders/PaymentRecordDialog';
import { InvoiceDetailDialog, MobileInvoicesList } from '@/components/invoices';
import type { User } from '@/types';
import type { Invoice } from '@/components/invoices/InvoiceDetailDialog';
import { useViewActionForRoles } from '@/hooks/useViewAction';
import {
    DATE_RANGE_PRESET_OPTIONS,
    detectPresetFromRange,
    getDateRangeForPreset,
    type DateRangePreset,
} from '@/lib/dateRangePresets';

interface Order {
    id: string;
    order_code: string;
    customer?: { id: string; name: string; phone: string };
    total_amount: number;
    status: string;
    remaining_debt?: number;
}

interface InvoicesPageProps {
    currentUser: User;
}

// Create Invoice Dialog
function CreateInvoiceDialog({
    open,
    onClose,
    onSuccess,
    orders
}: {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    orders: Order[];
}) {
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'zalopay'>('cash');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const draftKey = 'draft:create-invoice:v1';
    const isDirty = !!selectedOrderId || paymentMethod !== 'cash' || !!notes.trim();

    const availableOrders = orders.filter(o => o.status === 'completed');
    const selectedOrder = availableOrders.find(o => o.id === selectedOrderId);

    useEffect(() => {
        if (!open) return;
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return;
            const draft = JSON.parse(raw) as { selectedOrderId?: string; paymentMethod?: typeof paymentMethod; notes?: string };
            if (draft.selectedOrderId) setSelectedOrderId(draft.selectedOrderId);
            if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
            if (typeof draft.notes === 'string') setNotes(draft.notes);
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        try {
            const payload = JSON.stringify({ selectedOrderId, paymentMethod, notes });
            localStorage.setItem(draftKey, payload);
        } catch {
            // ignore
        }
    }, [open, selectedOrderId, paymentMethod, notes]);

    const handleSubmit = async () => {
        if (!selectedOrderId) {
            toast.error('Vui lòng chọn đơn hàng');
            return;
        }

        setSubmitting(true);
        try {
            await invoicesApi.create({
                order_id: selectedOrderId,
                payment_method: paymentMethod,
                notes: notes || undefined
            });
            toast.success('Đã tạo hóa đơn thành công!');
            onSuccess();
            onClose();
            setSelectedOrderId('');
            setPaymentMethod('cash');
            setNotes('');
            try {
                localStorage.removeItem(draftKey);
            } catch {
                // ignore
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi tạo hóa đơn');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && isDirty && !submitting) {
                    const ok = window.confirm('Bạn đang tạo hóa đơn dở. Thoát ra sẽ mất dữ liệu (nháp vẫn được lưu). Bạn chắc chắn muốn thoát?');
                    if (!ok) return;
                }
                onClose();
            }}
        >
            <DialogContent
                className="max-w-lg"
                onInteractOutside={(e) => {
                    if (isDirty && !submitting) e.preventDefault();
                }}
                onEscapeKeyDown={(e) => {
                    if (isDirty && !submitting) e.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Tạo hóa đơn mới
                    </DialogTitle>
                    <DialogDescription>
                        Chọn đơn hàng đã hoàn thành để tạo hóa đơn
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Đơn hàng *</Label>
                        <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Chọn đơn hàng..." />
                            </SelectTrigger>
                            <SelectContent>
                                {availableOrders.length === 0 ? (
                                    <div className="p-3 text-center text-muted-foreground text-sm">
                                        Không có đơn hàng hoàn thành
                                    </div>
                                ) : (
                                    availableOrders.map(order => (
                                        <SelectItem key={order.id} value={order.id}>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{order.order_code}</span>
                                                <span className="text-muted-foreground">-</span>
                                                <span>{order.customer?.name}</span>
                                                <span className="text-primary font-semibold">
                                                    {formatCurrency(order.total_amount)}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedOrder && (
                        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Mã đơn:</span>
                                <span className="font-medium">{selectedOrder.order_code}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Khách hàng:</span>
                                <span className="font-medium">{selectedOrder.customer?.name}</span>
                            </div>
                            <div className="flex justify-between text-lg font-bold">
                                <span>Tổng tiền:</span>
                                <span className="text-primary">{formatCurrency(selectedOrder.total_amount)}</span>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Phương thức thanh toán</Label>
                        <Select value={paymentMethod} onValueChange={(v: typeof paymentMethod) => setPaymentMethod(v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cash">Tiền mặt</SelectItem>
                                <SelectItem value="transfer">Chuyển khoản</SelectItem>
                                <SelectItem value="zalopay">Zalo Pay</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Ghi chú</Label>
                        <textarea
                            className="w-full min-h-[80px] px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            placeholder="Nhập ghi chú..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={submitting}>
                        Hủy
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting || !selectedOrderId}>
                        {submitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Đang tạo...
                            </>
                        ) : (
                            <>
                                <FileText className="h-4 w-4 mr-2" />
                                Tạo hóa đơn
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export function InvoicesPage({ currentUser }: InvoicesPageProps) {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [showInvoiceDetail, setShowInvoiceDetail] = useState(false);
    const [showPaymentRecordDialog, setShowPaymentRecordDialog] = useState(false);
    const [paymentRecordData, setPaymentRecordData] = useState<{orderId: string, orderCode: string, remainingDebt: number} | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
    const [stats, setStats] = useState({
        total: 0,
        draft: 0,
        pending: 0,
        paid: 0,
        cancelled: 0,
        salesAmount: 0,
        paidAmount: 0,
    });

    const { canEdit, canDelete } = useViewActionForRoles('invoices', ['manager', 'admin', 'accountant', 'sale']);

    const fetchInvoiceStats = useCallback(async () => {
        try {
            const params: Record<string, string> = {};
            if (fromDate) params.from_date = fromDate;
            if (toDate) params.to_date = toDate;
            const response = await invoicesApi.getStats(params);
            const data = response.data.data;
            if (data) {
                setStats({
                    total: data.total || 0,
                    draft: data.draft || 0,
                    pending: data.pending || 0,
                    paid: data.paid || 0,
                    cancelled: data.cancelled || 0,
                    salesAmount: Number(data.salesAmount || data.totalAmount || 0),
                    paidAmount: Number(data.paidAmount || 0),
                });
            }
        } catch (err) {
            console.error('Failed to load invoice stats', err);
        }
    }, [fromDate, toDate]);

    const fetchInvoices = useCallback(async () => {
        try {
            const params: Record<string, string | number> = { limit: 200 };
            if (statusFilter !== 'all') params.status = statusFilter;
            if (fromDate) params.from_date = fromDate;
            if (toDate) params.to_date = toDate;
            const response = await invoicesApi.getAll(params);
            setInvoices(response.data.data?.invoices || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải danh sách hóa đơn');
        }
    }, [statusFilter, fromDate, toDate]);

    const handleDatePresetChange = (preset: DateRangePreset) => {
        setDatePreset(preset);
        if (preset === 'all') {
            setFromDate('');
            setToDate('');
            return;
        }
        if (preset === 'custom') return;
        const range = getDateRangeForPreset(preset);
        if (range) {
            setFromDate(range.from);
            setToDate(range.to);
        }
    };

    const handleFromDateChange = (value: string) => {
        setFromDate(value);
        setDatePreset(detectPresetFromRange(value, toDate));
    };

    const handleToDateChange = (value: string) => {
        setToDate(value);
        setDatePreset(detectPresetFromRange(fromDate, value));
    };

    const dateRangeFilter = (compact?: boolean) => (
        <div className={cn('flex flex-wrap items-center gap-2', compact && 'text-xs')}>
            <div className="flex items-center gap-1.5">
                <span className={cn('text-muted-foreground whitespace-nowrap', compact ? 'text-[10px]' : 'text-sm')}>Từ</span>
                <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => handleFromDateChange(e.target.value)}
                    className={cn(
                        'rounded-md border border-input bg-background',
                        compact ? 'h-8 px-2 text-xs' : 'h-9 px-3 text-sm',
                    )}
                />
            </div>
            <div className="flex items-center gap-1.5">
                <span className={cn('text-muted-foreground whitespace-nowrap', compact ? 'text-[10px]' : 'text-sm')}>Đến</span>
                <input
                    type="date"
                    value={toDate}
                    onChange={(e) => handleToDateChange(e.target.value)}
                    className={cn(
                        'rounded-md border border-input bg-background',
                        compact ? 'h-8 px-2 text-xs' : 'h-9 px-3 text-sm',
                    )}
                />
            </div>
            <Select value={datePreset} onValueChange={(v) => handleDatePresetChange(v as DateRangePreset)}>
                <SelectTrigger className={cn(compact ? 'h-8 w-[120px] text-xs' : 'h-9 w-[140px]')}>
                    <Calendar className={cn('mr-1.5 shrink-0 text-muted-foreground', compact ? 'h-3 w-3' : 'h-4 w-4')} />
                    <SelectValue placeholder="Lọc nhanh" />
                </SelectTrigger>
                <SelectContent>
                    {DATE_RANGE_PRESET_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );

    const fetchOrders = useCallback(async () => {
        try {
            const response = await ordersApi.getAll({ status: 'completed' });
            setOrders(response.data.data?.orders || []);
        } catch (err) {
            console.error('Error fetching orders:', err);
        }
    }, []);

    const fetchInvoiceDetail = async (invoiceId: string) => {
        setLoadingDetail(true);
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
            setLoadingDetail(false);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchInvoices(), fetchOrders(), fetchInvoiceStats()]);
            setLoading(false);
        };
        loadData();
    }, [fetchInvoices, fetchOrders, fetchInvoiceStats]);

    const refreshInvoices = useCallback(async () => {
        await Promise.all([fetchInvoices(), fetchInvoiceStats()]);
    }, [fetchInvoices, fetchInvoiceStats]);

    const handleStatusChange = async (
        id: string,
        status: string,
        options?: { cancel_related_payments?: boolean },
    ) => {
        try {
            await invoicesApi.updateStatus(id, status, options);
            if (status === 'paid') {
                toast.success('Đã xác nhận thanh toán!');
            } else if (status === 'cancelled') {
                toast.success(
                    options?.cancel_related_payments !== false
                        ? 'Đã hủy hóa đơn và các phiếu thanh toán liên quan'
                        : 'Đã hủy hóa đơn!',
                );
            } else {
                toast.success('Đã cập nhật trạng thái hóa đơn');
            }
            refreshInvoices();
            if (selectedInvoice?.id === id) {
                const detail = await invoicesApi.getById(id);
                if (detail.data.data?.invoice) setSelectedInvoice(detail.data.data.invoice);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật trạng thái');
        }
    };

    const handlePayButtonClick = (invoice: Invoice) => {
        if (!invoice.order) return;
        setPaymentRecordData({
            orderId: invoice.order_id,
            orderCode: invoice.order.order_code,
            remainingDebt: invoice.order.remaining_debt ?? invoice.total_amount
        });
        setShowPaymentRecordDialog(true);
    };

    const handlePaymentSuccess = async () => {
        if (selectedInvoice) {
            await handleStatusChange(selectedInvoice.id, 'paid');
            refreshInvoices();
        }
    };

    const handleDeleteInvoice = async (invoiceId: string) => {
        const inv = invoices.find((i) => i.id === invoiceId);
        if (!inv) return;

        const deleteMessage = inv.order_id
            ? `Bạn có chắc muốn xóa hóa đơn "${inv.invoice_code}"?\n\nSẽ xóa theo:\n• Đơn hàng liên kết\n• Phiếu thu & phiếu chi liên quan\n• Sản phẩm/dịch vụ, quy trình, hoa hồng\n\nHành động này không thể hoàn tác.`
            : `Bạn có chắc muốn xóa hóa đơn "${inv.invoice_code}"? Hành động này không thể hoàn tác.`;

        if (!window.confirm(deleteMessage)) {
            return;
        }

        try {
            await invoicesApi.delete(invoiceId);
            toast.success(inv.order_id ? 'Đã xóa hóa đơn và toàn bộ dữ liệu liên quan' : 'Đã xóa hóa đơn');
            if (selectedInvoice?.id === invoiceId) {
                setShowInvoiceDetail(false);
                setSelectedInvoice(null);
            }
            refreshInvoices();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi xóa hóa đơn');
        }
    };

    const filteredInvoices = useMemo(() => {
        if (!searchQuery) return invoices;
        const query = searchQuery.toLowerCase();
        return invoices.filter(inv =>
            inv.invoice_code.toLowerCase().includes(query) ||
            inv.customer?.name?.toLowerCase().includes(query) ||
            inv.customer?.phone?.includes(query)
        );
    }, [invoices, searchQuery]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <>
            <Toaster position="top-right" richColors />
            <div className="w-full max-w-full space-y-2 overflow-x-hidden animate-fade-in lg:space-y-6">
                <div className="flex items-center gap-2 lg:hidden">
                    <h1 className="min-w-0 flex-1 text-lg font-bold leading-tight text-foreground">Hóa đơn</h1>
                    {canEdit && (
                        <Button
                            size="icon"
                            className="h-8 w-8 shrink-0 rounded-lg"
                            onClick={() => setShowCreateDialog(true)}
                            title="Tạo hóa đơn"
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                <div className="hidden flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:flex">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Hóa đơn</h1>
                        <p className="text-muted-foreground">Quản lý hóa đơn bán hàng</p>
                    </div>
                    {canEdit && (
                        <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto shadow-sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Tạo hóa đơn
                        </Button>
                    )}
                </div>

                <div className="rounded-lg border bg-white px-2.5 py-2 shadow-sm lg:hidden">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] leading-tight">
                        <span className="text-muted-foreground">
                            Tổng <span className="font-bold text-blue-600">{stats.total}</span>
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-muted-foreground">
                            Chờ <span className="font-bold text-amber-600">{stats.pending + stats.draft}</span>
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-muted-foreground">
                            TT <span className="font-bold text-green-600">{stats.paid}</span>
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-muted-foreground">
                            Hủy <span className="font-bold text-red-600">{stats.cancelled}</span>
                        </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between border-t border-border/60 pt-1.5 text-[11px]">
                        <span className="font-medium text-muted-foreground">Doanh số</span>
                        <span className="font-bold text-primary">{formatCurrency(stats.salesAmount)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Đã thu (HĐ đã TT)</span>
                        <span className="font-semibold text-green-700">{formatCurrency(stats.paidAmount)}</span>
                    </div>
                </div>

                <div className="hidden grid-cols-2 gap-3 sm:grid-cols-4 lg:grid lg:grid-cols-5 sm:gap-4">
                    <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-blue-600 font-medium truncate">Tổng cộng</p>
                                <p className="text-2xl font-bold text-blue-700">{stats.total}</p>
                            </div>
                            <FileText className="h-8 w-8 text-blue-400 opacity-50" />
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-amber-600 font-medium truncate">Chờ TT</p>
                                <p className="text-2xl font-bold text-amber-700">{stats.pending + stats.draft}</p>
                            </div>
                            <Clock className="h-8 w-8 text-amber-400 opacity-50" />
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-green-600 font-medium truncate">Đã TT</p>
                                <p className="text-2xl font-bold text-green-700">{stats.paid}</p>
                            </div>
                            <CheckCircle className="h-8 w-8 text-green-400 opacity-50" />
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-red-50 to-red-100/50 border-red-200">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-red-600 font-medium truncate">Đã hủy</p>
                                <p className="text-2xl font-bold text-red-700">{stats.cancelled}</p>
                            </div>
                            <XCircle className="h-8 w-8 text-red-400 opacity-50" />
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-primary/5 to-primary/15 border-primary/20">
                        <CardContent className="p-4">
                                <p className="text-sm text-primary font-medium truncate">Doanh số</p>
                                <p className="text-lg font-bold text-primary truncate">{formatCurrency(stats.salesAmount)}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Đã thu: {formatCurrency(stats.paidAmount)}
                                </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-2 lg:hidden">
                    <div className="flex gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Tìm HĐ, khách..."
                                className="h-8 rounded-lg border-slate-200 pl-8 text-xs"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-8 w-[108px] shrink-0 rounded-lg text-xs">
                                <SelectValue placeholder="TT" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả</SelectItem>
                                <SelectItem value="draft">Nháp</SelectItem>
                                <SelectItem value="pending">Chờ TT</SelectItem>
                                <SelectItem value="paid">Đã TT</SelectItem>
                                <SelectItem value="cancelled">Đã hủy</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {dateRangeFilter(true)}
                    <MobileInvoicesList
                        invoices={filteredInvoices}
                        loading={false}
                        onView={(inv) => fetchInvoiceDetail(inv.id)}
                        onEdit={canEdit ? (inv) => fetchInvoiceDetail(inv.id) : undefined}
                        onDelete={canDelete ? handleDeleteInvoice : undefined}
                    />
                </div>

                <Card className="hidden lg:block">
                    <CardContent className="p-4">
                        <div className="mb-4 space-y-3">
                            <div className="flex flex-col gap-4 sm:flex-row">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Tìm kiếm mã hóa đơn, khách hàng..."
                                        className="pl-9"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-full sm:w-[180px]">
                                        <SelectValue placeholder="Trạng thái" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tất cả trạng thái</SelectItem>
                                        <SelectItem value="draft">Nháp</SelectItem>
                                        <SelectItem value="pending">Chờ thanh toán</SelectItem>
                                        <SelectItem value="paid">Đã thanh toán</SelectItem>
                                        <SelectItem value="cancelled">Đã hủy</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {dateRangeFilter()}
                        </div>

                        <div className="rounded-md border overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr className="border-b">
                                        <th className="p-4 text-left font-medium">Mã hóa đơn</th>
                                        <th className="p-4 text-left font-medium">Khách hàng</th>
                                        <th className="p-4 text-left font-medium">Đơn hàng</th>
                                        <th className="p-4 text-right font-medium">Tổng tiền</th>
                                        <th className="p-4 text-center font-medium">Trạng thái</th>
                                        <th className="p-4 text-center font-medium">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInvoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-muted-foreground italic">
                                                Không có hóa đơn nào
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredInvoices.map((inv) => (
                                            <tr key={inv.id} className="border-b hover:bg-muted/30 transition-colors">
                                                <td className="p-4 font-medium">{inv.invoice_code}</td>
                                                <td className="p-4">
                                                    <div>
                                                        <p className="font-medium">{inv.customer?.name}</p>
                                                        <p className="text-xs text-muted-foreground">{inv.customer?.phone}</p>
                                                    </div>
                                                </td>
                                                <td className="p-4">{inv.order?.order_code || 'N/A'}</td>
                                                <td className="p-4 text-right font-bold text-primary">{formatCurrency(inv.total_amount)}</td>
                                                <td className="p-4 text-center">
                                                    <Badge variant={
                                                        inv.status === 'paid' ? 'success' :
                                                        inv.status === 'pending' ? 'warning' :
                                                        inv.status === 'draft' ? 'secondary' : 'danger'
                                                    }>{
                                                        inv.status === 'paid' ? 'Đã thanh toán' :
                                                        inv.status === 'pending' ? 'Chờ thanh toán' :
                                                        inv.status === 'draft' ? 'Nháp' : 'Đã hủy'
                                                    }</Badge>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Button variant="ghost" size="sm" onClick={() => fetchInvoiceDetail(inv.id)} title="Xem chi tiết">
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        {canEdit && inv.status !== 'paid' && inv.status !== 'cancelled' && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                onClick={() => fetchInvoiceDetail(inv.id)}
                                                                title="Sửa hóa đơn"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                        {canDelete && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                onClick={() => handleDeleteInvoice(inv.id)}
                                                                title="Xóa hóa đơn"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <CreateInvoiceDialog
                open={showCreateDialog}
                onClose={() => setShowCreateDialog(false)}
                onSuccess={refreshInvoices}
                orders={orders}
            />

            <InvoiceDetailDialog
                invoice={selectedInvoice}
                open={showInvoiceDetail}
                onClose={() => setShowInvoiceDetail(false)}
                onStatusChange={handleStatusChange}
                onPayButtonClick={handlePayButtonClick}
                onDelete={canDelete ? handleDeleteInvoice : undefined}
                canEdit={canEdit}
                canDelete={canDelete}
            />

            {paymentRecordData && (
                <PaymentRecordDialog
                    open={showPaymentRecordDialog}
                    onOpenChange={setShowPaymentRecordDialog}
                    orderId={paymentRecordData.orderId}
                    orderCode={paymentRecordData.orderCode}
                    remainingDebt={paymentRecordData.remainingDebt}
                    initialAmount={paymentRecordData.remainingDebt}
                    initialContent="Thanh toán hết"
                    onSuccess={handlePaymentSuccess}
                />
            )}
        </>
    );
}
