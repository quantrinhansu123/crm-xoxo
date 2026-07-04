import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Check, X, Upload, FileText, Loader2, RefreshCw, Eye, ExternalLink, Image as ImageIcon, Filter, ChevronDown, ChevronRight, Printer, MoreHorizontal, Download, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { transactionsApi, ordersApi, requestsApi, invoicesApi } from '@/lib/api';
import { formatCurrency, formatDate, cn, normalizeSearchText } from '@/lib/utils';
import type { User } from '@/types';
import { InvoiceDetailDialog } from '@/components/invoices/InvoiceDetailDialog';
import { MobileFinanceList } from '@/components/finance';
import { DELIVERY_CARRIER_OPTIONS } from '@/constants/deliveryCarriers';
import { useViewActionForRoles } from '@/hooks/useViewAction';

interface FinancePageProps {
    currentUser: User;
    initialTab?: 'income' | 'expense';
    onTabChange?: (tab: string) => void;
}

type TransactionType = 'income' | 'expense';
type TransactionStatus = 'pending' | 'approved' | 'cancelled';

interface Transaction {
    id: string;
    code: string;
    type: TransactionType;
    category: string;
    amount: number;
    payment_method: 'cash' | 'transfer' | 'zalopay';
    notes?: string;
    image_url?: string;
    date: string;
    status: TransactionStatus;
    order_id?: string;
    order_code?: string;
    order_product_id?: string;
    order_product?: { id?: string; product_code: string; name?: string | null };
    order?: {
        id: string;
        order_code: string;
        customer: {
            id: string;
            name: string;
            phone: string;
        };
    };
    orders?: any;
    created_by: string;
    created_by_user?: { id: string; name: string; avatar?: string };
    approved_by?: string;
    approved_by_user?: { id: string; name: string };
    created_at: string;
    metadata?: any;
}

const statusLabels: Record<TransactionStatus, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
    pending: { label: 'Chờ duyệt', variant: 'warning' },
    approved: { label: 'Đã duyệt', variant: 'success' },
    cancelled: { label: 'Đã huỷ', variant: 'danger' }
};

const paymentMethodLabels = {
    cash: 'Tiền mặt',
    transfer: 'Chuyển khoản',
    zalopay: 'Zalo Pay'
};

const incomeCategories = [
    'Thanh toán đơn hàng',
    'Đặt cọc',
    'Phí giao hàng',
    'Thu hồi máy',
    'Thu khác',
];

const expenseCategories = [
    'Lương nhân viên',
    'Tiền điện',
    'Tiền nước',
    'Tiền thuê mặt bằng',
    'Mua phụ kiện',
    'Mua vật tư',
    'Chi phí vận hành',
    'Phí ship nhận hàng',
    'Phí ship gửi đối tác',
    'Thanh toán phí đối tác',
    'Chi khác',
];

const expenseCategoriesWithOrder = [
    'Mua phụ kiện',
    'Mua vật tư',
    'Phí ship nhận hàng',
    'Phí ship gửi đối tác',
    'Thanh toán phí đối tác',
    'Chi phí vận hành',
    'Chi khác',
];

interface TransactionFormProps {
    type: TransactionType;
    initialCategory?: string;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
    loading: boolean;
}

function TransactionForm({ type, initialCategory, onClose, onSubmit, loading }: TransactionFormProps) {
    const [category, setCategory] = useState(initialCategory || '');
    const [transportCarrier, setTransportCarrier] = useState('');
    const [customCarrierName, setCustomCarrierName] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'zalopay'>('cash');
    const [notes, setNotes] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [imageUrl, setImageUrl] = useState('');
    const [orderCode, setOrderCode] = useState('');
    const [orderId, setOrderId] = useState<string | undefined>(undefined);
    const [orderProductId, setOrderProductId] = useState<string | undefined>(undefined);
    const [orderProducts, setOrderProducts] = useState<Array<{ id: string; product_code: string; name: string }>>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [orderSuggestions, setOrderSuggestions] = useState<any[]>([]);
    const [searchingOrders, setSearchingOrders] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const isMachineRecoveryIncome = type === 'income' && category === 'Thu hồi máy';
    const showOrderLink =
        type === 'expense'
            ? expenseCategoriesWithOrder.includes(category)
            : ['Thanh toán đơn hàng', 'Đặt cọc', 'Phí giao hàng', 'Thu hồi máy'].includes(category);
    const requireProductOnExpense =
        type === 'expense' && expenseCategoriesWithOrder.includes(category);

    useEffect(() => {
        if (initialCategory) {
            setCategory(initialCategory);
        }
    }, [initialCategory]);

    useEffect(() => {
        const searchOrders = async () => {
            if (orderCode.length < 1 || orderId) {
                if (!orderId) setOrderSuggestions([]);
                return;
            }

            setSearchingOrders(true);
            try {
                // Backend is accent-sensitive, so we map 'HD' to 'HĐ' for the request
                const searchParam = orderCode.replace(/HD/gi, 'HĐ');
                const response = await ordersApi.getAll({ search: searchParam, limit: 15 });

                // Local filtering to avoid "full-text search" results that don't match the code
                // and ensure 'HD' matches 'HĐ' interchangeably.
                const query = normalizeSearchText(orderCode);
                const filtered = (response.data.data?.orders || []).filter((order: any) => {
                    const code = normalizeSearchText(order.order_code || '');
                    return code.includes(query);
                });

                setOrderSuggestions(filtered.slice(0, 5));
            } catch (error) {
                console.error('Error searching orders:', error);
            } finally {
                setSearchingOrders(false);
            }
        };

        const timer = setTimeout(searchOrders, 300);
        return () => clearTimeout(timer);
    }, [orderCode, orderId]);

    useEffect(() => {
        if (!orderId) {
            setOrderProducts([]);
            setOrderProductId(undefined);
            return;
        }

        let cancelled = false;
        setLoadingProducts(true);
        ordersApi
            .getById(orderId)
            .then((res) => {
                if (cancelled) return;
                const order = res.data.data?.order;
                const items = (order?.customer_items || []) as Array<{
                    id: string;
                    product_code: string;
                    name?: string;
                }>;
                const code = order?.order_code || orderCode;
                const children = items.filter((p) => p.product_code !== code);
                const list = (children.length > 0 ? children : items).map((p) => ({
                    id: p.id,
                    product_code: p.product_code,
                    name: p.name || p.product_code,
                }));
                setOrderProducts(list);
                if (list.length === 1) {
                    setOrderProductId(list[0].id);
                }
            })
            .catch(() => {
                if (!cancelled) setOrderProducts([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingProducts(false);
            });

        return () => {
            cancelled = true;
        };
    }, [orderId, orderCode]);

    const categories = type === 'income' ? incomeCategories : expenseCategories;

    const handleSubmit = async () => {
        if (!category || amount <= 0) {
            toast.error('Vui lòng điền đầy đủ thông tin');
            return;
        }

        const resolvedCarrier = transportCarrier === 'Khác'
            ? customCarrierName.trim()
            : transportCarrier.trim();

        if (isMachineRecoveryIncome && !resolvedCarrier) {
            toast.error('Vui lòng chọn hoặc nhập tên đơn vị vận chuyển');
            return;
        }

        if (requireProductOnExpense && orderId && !orderProductId) {
            toast.error('Chọn sản phẩm (VD: HĐ74.1) cho phiếu chi');
            return;
        }

        const selectedProduct = orderProducts.find((p) => p.id === orderProductId);
        const productPrefix = selectedProduct ? `[${selectedProduct.product_code}] ` : '';

        const carrierNote = isMachineRecoveryIncome ? `Đơn vị VC: ${resolvedCarrier}` : '';
        const mergedNotes = [carrierNote, `${productPrefix}${notes.trim()}`.trim()].filter(Boolean).join('. ') || undefined;

        await onSubmit({
            type,
            category,
            amount,
            payment_method: paymentMethod,
            notes: mergedNotes,
            date,
            image_url: imageUrl || undefined,
            order_code: orderCode || undefined,
            order_id: orderId,
            order_product_id: orderProductId,
            metadata: {
                ...(isMachineRecoveryIncome
                    ? { transport_carrier: resolvedCarrier, transport_unit: resolvedCarrier }
                    : {}),
                ...(selectedProduct
                    ? { product_code: selectedProduct.product_code, product_name: selectedProduct.name }
                    : {}),
            },
        });
    };

    // Format currency input
    const formatInputCurrency = (value: number): string => {
        if (value === 0) return '';
        return value.toLocaleString('vi-VN');
    };

    const parseInputCurrency = (value: string): number => {
        const cleaned = value.replace(/[^\d]/g, '');
        return parseInt(cleaned) || 0;
    };

    return (
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    {type === 'income' ? (
                        <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                            <Plus className="h-4 w-4 text-green-600" />
                        </div>
                    ) : (
                        <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-red-600" />
                        </div>
                    )}
                    {isMachineRecoveryIncome ? 'Tạo phiếu thu hồi máy' : `Tạo phiếu ${type === 'income' ? 'thu' : 'chi'}`}
                </DialogTitle>
                <DialogDescription>
                    {isMachineRecoveryIncome
                        ? 'Ghi nhận thu phí/khoản liên quan thu hồi máy từ khách'
                        : `Nhập thông tin phiếu ${type === 'income' ? 'thu' : 'chi'} mới`}
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
                {/* Date */}
                <div className="space-y-2">
                    <Label>Ngày</Label>
                    <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                    />
                </div>

                {/* Category */}
                <div className="space-y-2">
                    <Label>Loại {type === 'income' ? 'thu' : 'chi'} *</Label>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                            <SelectValue placeholder="Chọn loại" />
                        </SelectTrigger>
                        <SelectContent>
                            {categories.map(cat => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {isMachineRecoveryIncome && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <Label>NV vận chuyển *</Label>
                        <p className="text-xs text-muted-foreground">Chọn tên đơn vị (GHTK, Viettel Post...), không phải tên nhân viên</p>
                        <Select
                            value={transportCarrier || undefined}
                            onValueChange={(val) => {
                                setTransportCarrier(val);
                                if (val !== 'Khác') setCustomCarrierName('');
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Chọn đơn vị vận chuyển..." />
                            </SelectTrigger>
                            <SelectContent>
                                {DELIVERY_CARRIER_OPTIONS.map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {transportCarrier === 'Khác' && (
                            <Input
                                placeholder="Nhập tên đơn vị..."
                                value={customCarrierName}
                                onChange={(e) => setCustomCarrierName(e.target.value)}
                            />
                        )}
                    </div>
                )}

                {/* Đơn hàng + sản phẩm (phiếu chi theo SP: HĐ74.1, …) */}
                {showOrderLink && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300 relative">
                        <Label>Mã đơn hàng{type === 'expense' ? ' (HĐ)' : ''}</Label>
                        <div className="relative group/input">
                            <Input
                                placeholder="Nhập mã đơn hàng (VD: HĐ123)"
                                value={orderCode}
                                onChange={(e) => {
                                    setOrderCode(e.target.value.toUpperCase());
                                    setShowSuggestions(true);
                                    setOrderId(undefined);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                className={cn(
                                    "transition-all",
                                    orderId && "border-green-500 bg-green-50/30 focus-visible:ring-green-500"
                                )}
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                {searchingOrders && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                {orderId && <Check className="h-4 w-4 text-green-500" />}
                            </div>
                        </div>

                        {showSuggestions && orderCode.length >= 1 && !orderId && (
                            <div className="absolute z-[100] w-full mt-1 bg-card border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                {searchingOrders ? (
                                    <div className="px-3 py-6 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        <span>Đang tìm kiếm đơn hàng...</span>
                                    </div>
                                ) : orderSuggestions.length > 0 ? (
                                    <>
                                        <div className="px-2 py-1.5 border-b bg-muted/30">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Đơn hàng gợi ý</p>
                                        </div>
                                        <ul className="py-1 max-h-[240px] overflow-y-auto custom-scrollbar">
                                            {orderSuggestions.map((order) => (
                                                <li
                                                    key={order.id}
                                                    className="px-3 py-2.5 text-sm hover:bg-accent cursor-pointer flex justify-between items-center group transition-colors"
                                                    onClick={() => {
                                                        setOrderCode(order.order_code);
                                                        setOrderId(order.id);
                                                        setOrderProductId(undefined);
                                                        setShowSuggestions(false);
                                                    }}
                                                >
                                                    <div className="flex flex-col gap-0.5">
                                                        <p className="font-bold text-foreground group-hover:text-primary transition-colors">{order.order_code}</p>
                                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <span className="max-w-[120px] truncate">{order.customer?.name || 'Ẩn danh'}</span>
                                                            <span>•</span>
                                                            <span>{order.customer?.phone}</span>
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-primary">{formatCurrency(order.total_amount)}</p>
                                                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 uppercase font-bold">
                                                            {order.status}
                                                        </Badge>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                ) : (
                                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                        Không tìm thấy đơn hàng: <span className="font-bold">{orderCode}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {showOrderLink && orderId && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <Label>
                            Sản phẩm {requireProductOnExpense ? '*' : ''}
                            <span className="text-muted-foreground font-normal ml-1">(HĐxx.1, HĐxx.2…)</span>
                        </Label>
                        {loadingProducts ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Đang tải sản phẩm…
                            </div>
                        ) : orderProducts.length === 0 ? (
                            <p className="text-sm text-amber-700">Đơn này chưa có sản phẩm khách gửi.</p>
                        ) : (
                            <Select
                                value={orderProductId || undefined}
                                onValueChange={setOrderProductId}
                            >
                                <SelectTrigger className={cn(orderProductId && 'border-green-500 bg-green-50/30')}>
                                    <SelectValue placeholder="Chọn mã SP (VD: HĐ74.1)" />
                                </SelectTrigger>
                                <SelectContent>
                                    {orderProducts.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.product_code} — {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                )}

                {/* Amount */}
                <div className="space-y-2">
                    <Label>Số tiền *</Label>
                    <div className="relative">
                        <Input
                            type="text"
                            value={formatInputCurrency(amount)}
                            onChange={(e) => setAmount(parseInputCurrency(e.target.value))}
                            className="pr-16"
                            placeholder="0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            VNĐ
                        </span>
                    </div>
                    {amount > 0 && (
                        <p className="text-sm text-muted-foreground">{formatCurrency(amount)}</p>
                    )}
                </div>

                {/* Payment Method */}
                <div className="space-y-2">
                    <Label>Phương thức</Label>
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

                {/* Notes */}
                <div className="space-y-2">
                    <Label>Ghi chú</Label>
                    <textarea
                        className="w-full min-h-[80px] px-3 py-2 text-sm rounded-lg border border-input focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        placeholder="Nhập ghi chú..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </div>

                {/* Image URL */}
                <div className="space-y-2">
                    <Label>Ảnh đính kèm</Label>
                    <div className="flex gap-2">
                        <Input
                            placeholder="URL ảnh hoặc upload..."
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            className="flex-1"
                        />
                        <Button variant="outline" size="icon" disabled>
                            <Upload className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={loading}>Huỷ</Button>
                <Button
                    onClick={handleSubmit}
                    disabled={loading || !category || amount <= 0}
                    className={type === 'income' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Tạo phiếu
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

function TransactionTable({
    transactions,
    canEdit,
    canDelete,
    onDelete,
    onView,
    onCustomerClick,
    onInvoiceClick,
    loading,
}: {
    transactions: Transaction[];
    canEdit: boolean;
    canDelete: boolean;
    onDelete: (id: string) => void;
    onView: (trans: Transaction) => void;
    onCustomerClick: (id: string) => void;
    onInvoiceClick: (code: string) => void;
    loading: boolean;
}) {
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    if (transactions.length === 0) {
        return (
            <div className="py-24 text-center text-muted-foreground flex flex-col items-center justify-center bg-white rounded-lg border-2 border-dashed">
                <FileText className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Chưa có giao dịch nào phù hợp</p>
                <p className="text-sm opacity-60">Hãy thử đổi bộ lọc hoặc thêm phiếu mới</p>
            </div>
        );
    }

    const toggleRow = (id: string) => {
        setExpandedRow(expandedRow === id ? null : id);
    };

    // Convert to mobile-friendly format
    const mobileVouchers = transactions.map(trans => {
        const orderData: any = Array.isArray(trans.orders) ? trans.orders[0] : (trans.orders || trans.order || (trans as any).order);
        const customer = Array.isArray(orderData?.customer) ? orderData.customer[0] : (orderData?.customer || orderData?.customers?.[0] || orderData?.customers);

        return {
            id: trans.id,
            voucher_code: trans.code,
            type: trans.type as 'income' | 'expense',
            amount: trans.amount,
            account_name: customer?.name || trans.metadata?.customer_name,
            description: trans.notes,
            created_at: trans.date,
            created_by: trans.created_by_user,
            status: trans.status,
        };
    });

    return (
        <>
            {/* Mobile view */}
            <div className="lg:hidden">
                <MobileFinanceList
                    vouchers={mobileVouchers}
                    loading={loading}
                    onView={(voucher) => {
                        const trans = transactions.find(t => t.id === voucher.id);
                        if (trans) onView(trans);
                    }}
                    onDelete={canDelete ? onDelete : undefined}
                />
            </div>

            {/* Desktop view - Table */}
            <div className="hidden lg:block overflow-x-auto rounded-lg border bg-card">
                <table className="w-full border-collapse">
                    <thead className="bg-[#f9fafb] border-b">
                        <tr>
                            <th className="p-3 text-left text-[13px] font-bold text-muted-foreground uppercase tracking-wider w-[120px]">Mã phiếu</th>
                            <th className="p-3 text-left text-[13px] font-bold text-muted-foreground uppercase tracking-wider w-[140px]">Thời gian</th>
                            <th className="p-3 text-left text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Người tạo</th>
                            <th className="p-3 text-left text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Loại thu chi</th>
                            <th className="p-3 text-left text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Người nộp/nhận</th>
                            <th className="p-3 text-left text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Mã người NN</th>
                            <th className="p-3 text-left text-[13px] font-bold text-muted-foreground uppercase tracking-wider">SĐT người NN</th>
                            <th className="p-3 text-right text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Số tiền</th>
                            <th className="p-3 text-left text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Ghi chú</th>
                            <th className="p-3 text-left text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map((trans) => {
                            const isExpanded = expandedRow === trans.id;

                            // Extract payer info from linked order → customer data
                            const orderData: any = Array.isArray(trans.orders) ? trans.orders[0] : (trans.orders || trans.order || (trans as any).order);
                            const customer = Array.isArray(orderData?.customer) ? orderData.customer[0] : (orderData?.customer || orderData?.customers?.[0] || orderData?.customers);

                            const payerName = customer?.name || trans.metadata?.customer_name || trans.metadata?.payer_name || (trans.order_id ? `Đơn hàng #${trans.order_code || trans.order_id.slice(0,8)}` : 'N/A');
                            const payerCode = customer?.id ? `KH${customer.id.slice(0, 6).toUpperCase()}` : trans.metadata?.customer_code || 'N/A';
                            const payerPhone = customer?.phone || trans.metadata?.customer_phone || 'N/A';

                            return (
                                <Fragment key={trans.id}>
                                    <tr
                                        className={cn(
                                            "border-b hover:bg-[#f0f7ff] transition-colors cursor-pointer text-sm group",
                                            isExpanded && "bg-[#f0f7ff]"
                                        )}
                                        onClick={() => toggleRow(trans.id)}
                                    >
                                        <td className="p-3 font-bold text-primary flex items-center gap-2">
                                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                            {trans.code}
                                        </td>
                                        <td className="p-3 whitespace-nowrap">{formatDate(trans.date)}</td>
                                        <td className="p-3 text-muted-foreground">{trans.created_by_user?.name || 'N/A'}</td>
                                        <td className="p-3">
                                            <Badge variant="secondary" className="font-normal">{trans.category}</Badge>
                                        </td>
                                        <td className="p-3">
                                            <span
                                                className={cn(
                                                    "font-medium",
                                                    customer?.id ? "text-blue-600 hover:text-blue-700 underline cursor-pointer" : ""
                                                )}
                                                onClick={(e) => {
                                                    if (customer?.id) {
                                                        e.stopPropagation();
                                                        onCustomerClick(customer.id);
                                                    }
                                                }}
                                            >
                                                {payerName}
                                            </span>
                                        </td>
                                        <td className="p-3 text-muted-foreground">{payerCode}</td>
                                        <td className="p-3 text-muted-foreground">{payerPhone}</td>
                                        <td className={cn(
                                            "p-3 text-right font-bold",
                                            trans.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                                        )}>
                                            {formatCurrency(trans.amount)}
                                        </td>
                                        <td className="p-3 max-w-[220px] text-muted-foreground">
                                            {(trans.order_product?.product_code || trans.metadata?.product_code) && (
                                                <p className="font-mono text-xs font-bold text-primary truncate">
                                                    {trans.order_product?.product_code || trans.metadata?.product_code}
                                                    {trans.order_code ? ` · ${trans.order_code}` : ''}
                                                </p>
                                            )}
                                            <p className="truncate italic text-sm">{trans.notes || '---'}</p>
                                        </td>
                                        <td className="p-3">
                                            <Badge variant={statusLabels[trans.status].variant} className="rounded-full px-3">
                                                {statusLabels[trans.status].label}
                                            </Badge>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-[#f8faff] border-b animate-in fade-in slide-in-from-top-1 duration-200">
                                            <td colSpan={10} className="p-6">
                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <p className="text-[12px] font-bold text-muted-foreground uppercase mb-1">Số tiền</p>
                                                            <p className={cn("text-2xl font-black", trans.type === 'income' ? 'text-emerald-600' : 'text-rose-600')}>
                                                                {formatCurrency(trans.amount)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-bold text-muted-foreground uppercase mb-1">Người nộp</p>
                                                            <div className="flex flex-col gap-1">
                                                                <p
                                                                    className={cn(
                                                                        "font-bold text-primary underline cursor-pointer",
                                                                        !customer?.id && "no-underline pointer-events-none"
                                                                    )}
                                                                    onClick={(e) => {
                                                                        if (customer?.id) {
                                                                            e.stopPropagation();
                                                                            onCustomerClick(customer.id);
                                                                        }
                                                                    }}
                                                                >
                                                                    {payerName}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">{payerCode} - {payerPhone}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4">
                                                        <div>
                                                            <p className="text-[12px] font-bold text-muted-foreground uppercase mb-1">Loại thu</p>
                                                            <p className="font-medium">{trans.category}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-bold text-muted-foreground uppercase mb-1">Thời gian</p>
                                                            <p className="font-medium">{formatDate(trans.date)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-bold text-muted-foreground uppercase mb-1">Đối tượng nộp</p>
                                                            <p className="font-medium">Khách hàng</p>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4">
                                                        <div>
                                                            <p className="text-[12px] font-bold text-muted-foreground uppercase mb-1">Nhân viên</p>
                                                            <p className="font-medium">{trans.created_by_user?.name || 'N/A'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[12px] font-bold text-muted-foreground uppercase mb-1">Phương thức</p>
                                                            <p className="font-medium">{paymentMethodLabels[trans.payment_method]}</p>
                                                        </div>
                                                        {(trans.order_code || trans.order_product?.product_code) && (
                                                            <div>
                                                                <p className="text-[12px] font-bold text-muted-foreground uppercase mb-1">Liên kết đơn / SP</p>
                                                                <p className="text-xs text-[#64748b] space-y-0.5">
                                                                    {trans.order_product?.product_code && (
                                                                        <span className="block font-mono font-bold text-primary">
                                                                            SP: {trans.order_product.product_code}
                                                                        </span>
                                                                    )}
                                                                    {trans.order_code && (
                                                                        <span
                                                                            className="font-bold text-blue-600 underline cursor-pointer hover:text-blue-700"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                onInvoiceClick(trans.order_code!);
                                                                            }}
                                                                        >
                                                                            HĐ: {trans.order_code}
                                                                        </span>
                                                                    )}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col justify-end items-end gap-3 pb-2">
                                                        <div className="flex gap-2">
                                                            <Button variant="outline" size="sm" className="h-9 px-4 gap-2 font-bold shadow-sm">
                                                                <Printer className="h-4 w-4" />
                                                                In
                                                            </Button>
                                                            {(canEdit || canDelete) && (
                                                                <>
                                                                    {canEdit && (
                                                                        <Button variant="outline" size="sm" className="h-9 px-4 gap-2 font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-100 shadow-sm">
                                                                            <Edit className="h-4 w-4" />
                                                                            Chỉnh sửa
                                                                        </Button>
                                                                    )}
                                                                    {canDelete && (
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-9 px-4 gap-2 font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-100 shadow-sm"
                                                                            onClick={(e) => { e.stopPropagation(); onDelete(trans.id); }}
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                            Hủy bỏ
                                                                        </Button>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
}



export function FinancePage({ currentUser, initialTab = 'income', onTabChange }: FinancePageProps) {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'income' | 'expense'>(initialTab);
    const incomeActions = useViewActionForRoles('income', ['admin', 'manager', 'accountant', 'sale']);
    const expenseActions = useViewActionForRoles('expense', ['admin', 'manager', 'accountant', 'sale']);
    const [showForm, setShowForm] = useState<TransactionType | null>(null);
    const [formInitialCategory, setFormInitialCategory] = useState<string | undefined>();

    const openCreateForm = (type: TransactionType, category?: string) => {
        setFormInitialCategory(category);
        setShowForm(type);
    };

    const closeCreateForm = () => {
        setShowForm(null);
        setFormInitialCategory(undefined);
    };
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Invoice Detail Modal States
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [showInvoiceDetail, setShowInvoiceDetail] = useState(false);
    const [loadingInvoice, setLoadingInvoice] = useState(false);

    // New Sidebar Filters
    const [fundFilter, setFundFilter] = useState<string>('all');
    const [creatorFilter, setCreatorFilter] = useState('');
    const [employeeFilter, setEmployeeFilter] = useState('');
    const [payerType, setPayerType] = useState('customer');
    const [payerName, setPayerName] = useState('');
    const [payerCode, setPayerCode] = useState('');
    const [payerPhone, setPayerPhone] = useState('');
    const [timeFilter, setTimeFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    // Sync activeTab with initialTab when navigation changes
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    // Handle tab change and notify parent (App.tsx) to update URL
    const handleTabChange = (tab: string) => {
        const typedTab = tab as 'income' | 'expense';
        setActiveTab(typedTab);
        setCategoryFilter('all'); // Reset category when switching tabs to avoid showing 0 counts for mismatched categories
        if (onTabChange) {
            onTabChange(typedTab);
        }
    };

    // Data states
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [summary, setSummary] = useState({
        totalIncome: 0,
        totalExpense: 0,
        balance: 0,
        incomeCount: 0,
        expenseCount: 0,
        pendingIncomeCount: 0,
        pendingExpenseCount: 0,
    });
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

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
            const detailResponse = await invoicesApi.getById(invoiceId);
            setSelectedInvoice(detailResponse.data.data?.invoice);
            fetchTransactions();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật trạng thái hóa đơn');
        }
    };

    const handleOpenInvoiceDetail = async (orderCode: string) => {
        setLoadingInvoice(true);
        try {
            // Find invoice by order code
            const response = await invoicesApi.getAll();
            const invoices = response.data.data?.invoices || [];

            // Search for invoice that matches this order code
            const invoice = invoices.find((inv: any) =>
                inv.order?.order_code === orderCode ||
                inv.invoice_code === orderCode
            );

            if (invoice) {
                // Fetch full details
                const detailResponse = await invoicesApi.getById(invoice.id);
                setSelectedInvoice(detailResponse.data.data?.invoice);
                setShowInvoiceDetail(true);
            } else {
                // If not found in invoices list, it might be an HĐ code directly
                if (orderCode.startsWith('HĐ') || orderCode.startsWith('HD')) {
                    toast.error('Không tìm thấy thông tin hóa đơn này');
                } else {
                    toast.info(`Dữ liệu liên kết là mã đơn hàng: ${orderCode}`);
                }
            }
        } catch (error) {
            console.error('Error fetching invoice for detail:', error);
            toast.error('Không thể mở chi tiết hóa đơn');
        } finally {
            setLoadingInvoice(false);
        }
    };

    const handleCustomerClick = (customerId: string) => {
        navigate(`/customers/${customerId}`);
    };
    const [associatedAccessory, setAssociatedAccessory] = useState<any | null>(null);
    const [fetchingAccessory, setFetchingAccessory] = useState(false);

    // Fetch related accessory or partner data when relevant transaction is selected
    useEffect(() => {
        const fetchRelatedData = async () => {
            const isAcc = selectedTransaction?.category === 'Mua phụ kiện' || selectedTransaction?.category === 'Phí ship nhận hàng';
            const isPartnerShip = selectedTransaction?.category === 'Phí ship gửi đối tác';

            if (!selectedTransaction || (!isAcc && !isPartnerShip)) {
                setAssociatedAccessory(null);
                return;
            }

            // Extract ID from notes like "(Yêu cầu #052fc03c)"
            const match = selectedTransaction.notes?.match(/\(Yêu cầu #([a-f0-9]+)\)/);
            if (!match) return;

            const shortId = match[1];
            setFetchingAccessory(true);
            try {
                if (isAcc) {
                    const res = await requestsApi.getAccessories();
                    const accessories = (res.data.data as any[]) || [];
                    const found = accessories.find((a: any) => a.id.startsWith(shortId));
                    if (found) setAssociatedAccessory(found);
                } else {
                    const res = await requestsApi.getPartners();
                    const partners = (res.data.data as any[]) || [];
                    const found = partners.find((p: any) => p.id.startsWith(shortId));
                    if (found) setAssociatedAccessory(found); // Reusing state name for simplicity as it stores 'request' data
                }
            } catch (err) {
                console.error('Error fetching associated data:', err);
            } finally {
                setFetchingAccessory(false);
            }
        };

        fetchRelatedData();
    }, [selectedTransaction]);

    // Fetch transactions
    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const params: any = {};

            if (statusFilter !== 'all') params.status = statusFilter;
            if (searchTerm) params.search = searchTerm;
            if (fundFilter !== 'all') params.payment_method = fundFilter;
            if (categoryFilter !== 'all') params.category = categoryFilter;

            // Handle Time Filter
            if (timeFilter === 'this_month') {
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                params.start_date = startOfMonth;
            } else if (timeFilter === 'custom') {
                if (startDate) params.start_date = startDate;
                if (endDate) params.end_date = endDate;
            }

            // Parallelize fetching transactions and summary
            // For transactions, we need the type filter
            // For summary, we DON'T want the type filter because we want counts for BOTH tabs
            const [transactionsRes, summaryRes] = await Promise.all([
                transactionsApi.getAll({ ...params, type: activeTab }),
                transactionsApi.getSummary(params)
            ]);

            setTransactions(transactionsRes.data.data?.transactions || []);
            setSummary(summaryRes.data.data || {
                totalIncome: 0,
                totalExpense: 0,
                balance: 0,
                incomeCount: 0,
                expenseCount: 0,
                pendingIncomeCount: 0,
                pendingExpenseCount: 0,
            });
        } catch (error: any) {
            console.error('Error fetching finance data:', error);
            toast.error(error.response?.data?.message || 'Lỗi khi tải dữ liệu');
        } finally {
            setLoading(false);
        }
    }, [activeTab, statusFilter, searchTerm, fundFilter, categoryFilter, timeFilter, startDate, endDate]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    // Create transaction
    const handleCreateTransaction = async (data: any) => {
        setActionLoading(true);
        try {
            // If it's an income related to an order, use ordersApi.createPayment
            // to ensure the order's remaining debt and payment status are updated.
            const isOrderIncome = data.type === 'income' &&
                data.order_id &&
                ['Thanh toán đơn hàng', 'Đặt cọc', 'Phí giao hàng'].includes(data.category);

            if (isOrderIncome) {
                await ordersApi.createPayment(data.order_id, {
                    content: data.category,
                    amount: data.amount,
                    payment_method: data.payment_method,
                    image_url: data.image_url,
                    notes: data.notes,
                });
            } else {
                await transactionsApi.create(data);
            }

            toast.success(`Đã tạo phiếu ${data.type === 'income' ? 'thu' : 'chi'}`);
            closeCreateForm();
            fetchTransactions();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi tạo phiếu');
        } finally {
            setActionLoading(false);
        }
    };


    // Cancel transaction (Update status instead of deleting)
    const handleDelete = async (id: string) => {
        if (!confirm('Bạn có chắc muốn hủy phiếu này?')) return;

        setActionLoading(true);
        try {
            await transactionsApi.updateStatus(id, 'cancelled');
            toast.success('Đã hủy phiếu thành công');
            fetchTransactions();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Lỗi khi hủy phiếu');
        } finally {
            setActionLoading(false);
        }
    };

    const incomeTransactions = transactions.filter(t => t.type === 'income');
    const expenseTransactions = transactions.filter(t => t.type === 'expense');
    const currentTransactions = activeTab === 'income' ? incomeTransactions : expenseTransactions;

    return (
        <div className="flex flex-col gap-4 p-3 lg:flex-row lg:gap-6 lg:p-0 animate-fade-in">
            {/* Sidebar Filter Panel */}
            <div className="hidden w-full shrink-0 space-y-6 lg:block lg:w-[280px]">
                <div className="flex items-center gap-2 mb-4">
                    <Filter className="h-5 w-5 text-blue-600" />
                    <h2 className="text-xl font-bold">Bộ lọc</h2>
                </div>

                <div className="space-y-8 bg-white p-6 rounded-xl border shadow-sm">
                    {/* Time Filter */}
                    <div className="space-y-3">
                        <Label className="text-[12px] font-black uppercase text-slate-400 tracking-wider">Thời gian</Label>
                        <div className="space-y-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="time"
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    checked={timeFilter === 'all'}
                                    onChange={() => setTimeFilter('all')}
                                />
                                <span className="text-sm font-medium group-hover:text-blue-600 transition-colors">Toàn thời gian</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="time"
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    checked={timeFilter === 'this_month'}
                                    onChange={() => setTimeFilter('this_month')}
                                />
                                <span className="text-sm font-medium group-hover:text-blue-600 transition-colors">Tháng này</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="radio"
                                    name="time"
                                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    checked={timeFilter === 'custom'}
                                    onChange={() => setTimeFilter('custom')}
                                />
                                <span className="text-sm font-medium group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                    Lựa chọn khác <CalendarIcon className="h-3 w-3 opacity-50" />
                                </span>
                            </label>
                            {timeFilter === 'custom' && (
                                <div className="pt-2">
                                    <Input
                                        type="date"
                                        className="h-9 mb-2"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                    <Input
                                        type="date"
                                        className="h-9"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="h-[1px] bg-slate-100" />

                    {/* Funds Filter */}
                    <div className="space-y-3">
                        <Label className="text-[12px] font-black uppercase text-slate-400 tracking-wider">Quỹ tiền</Label>
                        <div className="space-y-2">
                            {['all', 'cash', 'transfer', 'zalopay'].map((f) => (
                                <label key={f} className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="radio"
                                        name="fund"
                                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        checked={fundFilter === f}
                                        onChange={() => setFundFilter(f)}
                                    />
                                    <span className="text-sm font-medium group-hover:text-blue-600 transition-colors capitalize">
                                        {f === 'all' ? 'Tất cả' : f === 'cash' ? 'Tiền mặt' : f === 'transfer' ? 'Chuyển khoản' : 'Zalo Pay'}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="h-[1px] bg-slate-100" />

                    {/* Status Filter */}
                    <div className="space-y-3">
                        <Label className="text-[12px] font-black uppercase text-slate-400 tracking-wider">Trạng thái</Label>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-10">
                                <SelectValue placeholder="Tất cả" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả</SelectItem>
                                <SelectItem value="approved">Đã duyệt</SelectItem>
                                <SelectItem value="pending">Chờ duyệt</SelectItem>
                                <SelectItem value="cancelled">Đã hủy</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="h-[1px] bg-slate-100" />

                    {/* Creator / Employee */}
                    <div className="space-y-4">
                        <div className="space-y-2 text-sm">
                            <Label className="text-[12px] font-black uppercase text-slate-400 tracking-wider">Người tạo</Label>
                            <Input placeholder="Tài khoản tạo" className="h-9 font-medium" />
                        </div>
                        <div className="space-y-2 text-sm">
                            <Label className="text-[12px] font-black uppercase text-slate-400 tracking-wider">Nhân viên</Label>
                            <Input placeholder="Chọn nhân viên" className="h-9 font-medium" />
                        </div>
                    </div>

                    <div className="h-[1px] bg-slate-100" />

                    {/* Payer / Receiver Info */}
                    <div className="space-y-3">
                        <Label className="text-[12px] font-black uppercase text-slate-400 tracking-wider">Người nộp/nhận</Label>
                        <Select value={payerType} onValueChange={setPayerType}>
                            <SelectTrigger className="h-9 font-medium">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="customer">Khách hàng</SelectItem>
                                <SelectItem value="supplier">Nhà cung cấp</SelectItem>
                                <SelectItem value="employee">Nhân viên</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="space-y-2 pt-1">
                            <Input placeholder="Tên người nộp/nhận" className="h-9 text-xs" />
                            <Input placeholder="Mã người nộp/nhận" className="h-9 text-xs" />
                            <Input placeholder="Điện thoại" className="h-9 text-xs" />
                        </div>
                    </div>

                    <div className="h-[1px] bg-slate-100" />

                    {/* Category Filter */}
                    <div className="space-y-3">
                        <Label className="text-[12px] font-black uppercase text-slate-400 tracking-wider">Loại thu chi</Label>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Chọn loại thu chi" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả</SelectItem>
                                {activeTab === 'income' ? incomeCategories.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                )) : expenseCategories.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 space-y-4 lg:space-y-6">
                <div className="space-y-3 lg:hidden">
                    <div className="flex items-center justify-between gap-3">
                        <h1 className="text-xl font-black text-slate-900">Sổ quỹ</h1>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="icon" className={activeTab === 'income' ? "h-10 w-10 bg-[#0070f3] hover:bg-blue-700" : "h-10 w-10 bg-rose-600 hover:bg-rose-700"}>
                                    <Plus className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
                                {(activeTab === 'income' ? incomeCategories : expenseCategories).map(cat => (
                                    <DropdownMenuItem key={cat} className="rounded-lg cursor-pointer font-medium py-2" onClick={() => openCreateForm(activeTab, cat)}>
                                        {cat}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                            placeholder="Tìm theo mã phiếu"
                            className="h-10 rounded-xl border border-slate-200 bg-white pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                {/* Header Actions & Search */}
                <div className="hidden flex-col justify-between gap-4 md:flex md:flex-row md:items-center lg:flex">
                    <div className="flex items-center gap-4 flex-1">
                        <h1 className="text-2xl font-black text-slate-900 shrink-0">Sổ quỹ</h1>
                        <div className="relative max-w-lg w-full">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="Tìm theo mã phiếu"
                                className="pl-9 h-11 rounded-full border-2 border-slate-100 hover:border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 transition-all bg-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button className="bg-[#0070f3] hover:bg-blue-700 text-white font-bold gap-2 px-5 rounded-lg shadow-md transition-all active:scale-95">
                                    <Plus className="h-4 w-4" />
                                    Phiếu thu
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
                                {incomeCategories.map(cat => (
                                    <DropdownMenuItem key={cat} className="rounded-lg cursor-pointer font-medium py-2" onClick={() => openCreateForm('income', cat)}>
                                        {cat}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2 px-5 rounded-lg shadow-md transition-all active:scale-95">
                                    <Plus className="h-4 w-4" />
                                    Phiếu chi
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
                                {expenseCategories.map(cat => (
                                    <DropdownMenuItem key={cat} className="rounded-lg cursor-pointer font-medium py-2" onClick={() => openCreateForm('expense', cat)}>
                                        {cat}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button variant="outline" className="gap-2 font-bold px-5 rounded-lg border-2 border-slate-100 hover:bg-slate-50 shadow-sm transition-all active:scale-95">
                            <Download className="h-4 w-4" />
                            Xuất file
                        </Button>
                    </div>
                </div>

                {/* Stats Summary Bar */}
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-blue-50 bg-white p-3 shadow-sm lg:hidden">
                    <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Tổng thu</p>
                        <p className="text-sm font-black text-emerald-600">+{formatCurrency(summary.totalIncome)}</p>
                    </div>
                    <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Tổng chi</p>
                        <p className="text-sm font-black text-rose-600">-{formatCurrency(summary.totalExpense)}</p>
                    </div>
                    <div className="col-span-2 border-t pt-2">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Tồn quỹ</p>
                        <p className="text-lg font-black text-emerald-600">{formatCurrency(summary.balance)}</p>
                    </div>
                </div>

                <div className="hidden flex-wrap items-center justify-end gap-x-12 gap-y-4 bg-white p-5 rounded-xl border shadow-sm border-blue-50 lg:flex">
                    <div className="text-right">
                        <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Quỹ đầu kỳ</p>
                        <p className="text-lg font-black text-slate-700">{formatCurrency(summary.balance - summary.totalIncome + summary.totalExpense)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tổng thu</p>
                        <p className="text-xl font-black text-emerald-600">+{formatCurrency(summary.totalIncome)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tổng chi</p>
                        <p className="text-xl font-black text-rose-600">-{formatCurrency(summary.totalExpense)}</p>
                    </div>
                    <div className="text-right border-l pl-12">
                        <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1 justify-end">
                            Tồn quỹ <Eye className="h-3 w-3 opacity-30 cursor-pointer" />
                        </p>
                        <p className="text-2xl font-black text-emerald-600">{formatCurrency(summary.balance)}</p>
                    </div>
                </div>

                {/* Main Content Card */}
                <Card className="rounded-xl border-none shadow-xl overflow-hidden ring-1 ring-slate-100">
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                        <TabsList className="w-full justify-start rounded-none h-12 bg-white border-b gap-2 px-2 overflow-x-auto lg:h-14 lg:gap-8 lg:px-6">
                            <TabsTrigger
                                value="income"
                                className="h-9 shrink-0 rounded-lg border px-3 text-xs font-bold data-[state=active]:border-blue-600 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600 lg:data-[state=active]:bg-transparent lg:data-[state=active]:border-b-4 lg:rounded-none lg:h-14 lg:px-0 lg:text-[13px] lg:tracking-widest"
                            >
                                Phiếu thu
                                <Badge variant="secondary" className="px-1.5 h-5 bg-blue-100 text-blue-600 font-black border-none rounded-sm">{summary.incomeCount || 0}</Badge>
                            </TabsTrigger>
                            <TabsTrigger
                                value="expense"
                                className="h-9 shrink-0 rounded-lg border px-3 text-xs font-bold data-[state=active]:border-rose-600 data-[state=active]:bg-rose-50 data-[state=active]:text-rose-600 lg:data-[state=active]:bg-transparent lg:data-[state=active]:border-b-4 lg:rounded-none lg:h-14 lg:px-0 lg:text-[13px] lg:tracking-widest"
                            >
                                Phiếu chi
                                <Badge variant="secondary" className="px-1.5 h-5 bg-rose-100 text-rose-600 font-black border-none rounded-sm">{summary.expenseCount || 0}</Badge>
                            </TabsTrigger>
                        </TabsList>

                        <div className="p-0">
                            <TabsContent value="income" className="m-0 focus-visible:ring-0">
                                {loading ? (
                                    <div className="py-24 flex flex-col items-center justify-center gap-4">
                                        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                                        <p className="text-slate-400 font-medium">Đang tải dữ liệu...</p>
                                    </div>
                                ) : (
                                    <TransactionTable
                                        transactions={currentTransactions}
                                        canEdit={incomeActions.canEdit}
                                        canDelete={incomeActions.canDelete}
                                        onDelete={handleDelete}
                                        onView={setSelectedTransaction}
                                        onCustomerClick={handleCustomerClick}
                                        onInvoiceClick={handleOpenInvoiceDetail}
                                        loading={actionLoading}
                                    />
                                )}
                            </TabsContent>

                            <TabsContent value="expense" className="m-0 focus-visible:ring-0">
                                {loading ? (
                                    <div className="py-24 flex flex-col items-center justify-center gap-4">
                                        <Loader2 className="h-10 w-10 animate-spin text-rose-600" />
                                        <p className="text-slate-400 font-medium">Đang tải dữ liệu...</p>
                                    </div>
                                ) : (
                                    <TransactionTable
                                        transactions={currentTransactions}
                                        canEdit={expenseActions.canEdit}
                                        canDelete={expenseActions.canDelete}
                                        onDelete={handleDelete}
                                        onView={setSelectedTransaction}
                                        onCustomerClick={handleCustomerClick}
                                        onInvoiceClick={handleOpenInvoiceDetail}
                                        loading={actionLoading}
                                    />
                                )}
                            </TabsContent>
                        </div>
                    </Tabs>
                </Card>
            </div>

            {/* Create Transaction Dialog */}
            <Dialog open={!!showForm} onOpenChange={(open) => { if (!open) closeCreateForm(); }}>
                {showForm && (
                    <TransactionForm
                        type={showForm}
                        initialCategory={formInitialCategory}
                        onClose={closeCreateForm}
                        onSubmit={handleCreateTransaction}
                        loading={actionLoading}
                    />
                )}
            </Dialog>

            {/* Invoice Detail Dialog */}
            <InvoiceDetailDialog
                invoice={selectedInvoice}
                open={showInvoiceDetail}
                onClose={() => setShowInvoiceDetail(false)}
                onStatusChange={incomeActions.canEdit ? handleInvoiceStatusChange : undefined}
                onPayButtonClick={() => {}}
                canEdit={incomeActions.canEdit}
            />

            {/* Global Loader for Invoice Fetching */}
            {loadingInvoice && (
                <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center backdrop-blur-[2px]">
                    <div className="bg-white p-4 rounded-xl shadow-xl flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <p className="text-sm font-medium">Đang mở chi tiết hóa đơn...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
