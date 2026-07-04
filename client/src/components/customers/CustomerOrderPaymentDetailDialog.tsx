import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Package, Receipt, User } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ordersApi } from '@/lib/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import type { CustomerDebtOrderRow, CustomerDebtProductRow } from './CustomerCollectPaymentDialog';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Tiền mặt',
    transfer: 'Chuyển khoản',
    zalopay: 'Zalo Pay',
};

const PAYMENT_KIND_LABELS: Record<string, string> = {
    deposit: 'Tiền cọc',
    payment: 'Thanh toán',
};

type PaymentRecord = {
    id: string;
    order_product_id?: string | null;
    content?: string;
    amount: number;
    payment_method?: string;
    payment_kind?: string | null;
    notes?: string | null;
    created_at: string;
    created_by_user?: { id: string; name: string; avatar?: string };
    order_product?: {
        id: string;
        product_code: string;
        name: string;
        images?: string[];
    } | null;
};

type ProductColumn = {
    key: string;
    product: CustomerDebtProductRow | null;
    label: string;
    image_url: string | null;
    total_amount: number;
    paid_amount: number;
    remaining_debt: number;
    deposit_amount: number;
    payments: PaymentRecord[];
};

function PaymentCard({ payment }: { payment: PaymentRecord }) {
    return (
        <div className="rounded-lg border bg-card p-3 md:p-4 shadow-sm">
            <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{payment.content || 'Thanh toán'}</p>
                    <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5">{formatDateTime(payment.created_at)}</p>
                </div>
                <span className="text-sm md:text-base font-bold text-green-700 tabular-nums shrink-0">
                    {formatCurrency(payment.amount)}
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] md:text-xs h-5 md:h-6">
                    {PAYMENT_METHOD_LABELS[payment.payment_method || ''] || payment.payment_method || '—'}
                </Badge>
                {payment.payment_kind && (
                    <Badge variant={payment.payment_kind === 'deposit' ? 'secondary' : 'outline'} className="text-[10px] md:text-xs h-5 md:h-6">
                        {PAYMENT_KIND_LABELS[payment.payment_kind] || payment.payment_kind}
                    </Badge>
                )}
                {payment.created_by_user?.name && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] md:text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        {payment.created_by_user.name}
                    </span>
                )}
            </div>
            {payment.notes && (
                <p className="mt-2 pt-2 border-t text-xs md:text-sm text-muted-foreground whitespace-pre-wrap">{payment.notes}</p>
            )}
        </div>
    );
}

function getChildProducts(order: CustomerDebtOrderRow): CustomerDebtProductRow[] {
    const products = order.products || [];
    const children = products.filter((p) => p.product_code !== order.order_code);
    if (children.length > 0) {
        return [...children].sort((a, b) => a.product_code.localeCompare(b.product_code));
    }
    return [...products].sort((a, b) => a.product_code.localeCompare(b.product_code));
}

function ProductDebtColumn({ column }: { column: ProductColumn }) {
    const { product, label, image_url, total_amount, paid_amount, remaining_debt, deposit_amount, payments } = column;

    return (
        <div
            className={cn(
                'flex flex-col rounded-xl border bg-muted/15 overflow-hidden',
                'w-full md:flex-shrink-0 md:w-[320px] lg:w-[340px] md:h-full md:min-h-0'
            )}
        >
            <div className="p-3 md:p-5 border-b bg-card shrink-0">
                <div className="flex gap-3 md:flex-col md:gap-3">
                    <div className="h-[72px] w-[72px] md:h-[180px] md:w-full shrink-0 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                        {image_url ? (
                            <img src={image_url} alt={label} className="h-full w-full object-cover" />
                        ) : (
                            <Package className="h-8 w-8 md:h-12 md:w-12 text-muted-foreground/50" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-mono font-bold text-primary text-sm md:text-base">{label}</p>
                        {product?.name && product.name !== label && (
                            <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-2">{product.name}</p>
                        )}
                        <div className="mt-2 pt-2 border-t grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs md:text-sm md:grid-cols-1 md:gap-y-2">
                            <div className="flex justify-between gap-2 md:gap-3">
                                <span className="text-muted-foreground">Tổng tiền</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(total_amount)}</span>
                            </div>
                            {deposit_amount > 0 && (
                                <div className="flex justify-between gap-2 md:gap-3">
                                    <span className="text-muted-foreground">Đã cọc</span>
                                    <span className="font-medium tabular-nums text-amber-700">{formatCurrency(deposit_amount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between gap-2 md:gap-3">
                                <span className="text-muted-foreground">Đã thu</span>
                                <span className="font-medium tabular-nums text-green-700">{formatCurrency(paid_amount)}</span>
                            </div>
                            <div className="flex justify-between gap-2 md:gap-3 font-semibold col-span-2 md:col-span-1 md:text-base">
                                <span>Còn lại</span>
                                <span className={cn('tabular-nums', remaining_debt > 0 ? 'text-red-600' : 'text-green-600')}>
                                    {formatCurrency(remaining_debt)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="p-3 md:p-4 space-y-2 md:space-y-3 md:flex-1 md:overflow-y-auto md:min-h-[100px]">
                {payments.length === 0 ? (
                    <p className="text-xs md:text-sm text-center text-muted-foreground py-4 md:py-10">Chưa có phiếu thu</p>
                ) : (
                    payments.map((p) => <PaymentCard key={p.id} payment={p} />)
                )}
            </div>
            <div className="px-3 py-2 md:px-4 md:py-3 border-t text-[11px] md:text-xs text-muted-foreground text-center shrink-0 bg-card/50">
                {payments.length} phiếu thu
            </div>
        </div>
    );
}

interface CustomerOrderPaymentDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    order: CustomerDebtOrderRow | null;
}

export function CustomerOrderPaymentDetailDialog({
    open,
    onOpenChange,
    order,
}: CustomerOrderPaymentDetailDialogProps) {
    const [loading, setLoading] = useState(false);
    const [payments, setPayments] = useState<PaymentRecord[]>([]);

    const loadPayments = useCallback(async () => {
        if (!order) return;
        setLoading(true);
        try {
            const res = await ordersApi.getPayments(order.id);
            setPayments(res.data.data?.payments ?? []);
        } catch {
            toast.error('Không tải được lịch sử thanh toán');
            setPayments([]);
        } finally {
            setLoading(false);
        }
    }, [order]);

    useEffect(() => {
        if (open && order) {
            void loadPayments();
        } else if (!open) {
            setPayments([]);
        }
    }, [open, order, loadPayments]);

    const columns = useMemo((): ProductColumn[] => {
        if (!order) return [];

        const childProducts = getChildProducts(order);

        return childProducts.map((product) => {
            const productPayments = payments.filter((p) => p.order_product_id === product.id);
            const paidFromRecords = productPayments.reduce((s, p) => s + p.amount, 0);
            const paid = product.paid_amount ?? paidFromRecords;
            const collected = Math.max(paid, product.deposit_amount || 0);
            const remaining = Math.max(0, product.total_amount - collected);

            return {
                key: product.id,
                product,
                label: product.product_code,
                image_url: product.image_url,
                total_amount: product.total_amount,
                paid_amount: paid,
                remaining_debt: remaining,
                deposit_amount: product.deposit_amount,
                payments: productPayments,
            };
        });
    }, [order, payments]);

    const unassignedPayments = useMemo(
        () => payments.filter((p) => !p.order_product_id),
        [payments]
    );

    const unassignedTotal = useMemo(
        () => unassignedPayments.reduce((s, p) => s + p.amount, 0),
        [unassignedPayments]
    );

    const orderSummary = useMemo(() => {
        if (!order) return null;
        return {
            total: order.total_amount,
            paid: order.paid_amount,
            remaining: order.remaining_debt,
            deposit: order.deposit_amount,
        };
    }, [order]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    'flex flex-col gap-0 p-0 overflow-hidden',
                    'fixed inset-0 left-0 top-0 translate-x-0 translate-y-0',
                    'w-full max-w-full h-[100dvh] max-h-[100dvh] rounded-none border-0',
                    'md:inset-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%]',
                    'md:w-[96vw] md:max-w-[96vw] md:h-[92vh] md:max-h-[92vh] md:rounded-xl md:border'
                )}
            >
                <DialogHeader className="px-4 pt-4 pb-3 md:px-8 md:pt-6 md:pb-4 border-b shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-base md:text-xl pr-6">
                        <Receipt className="h-5 w-5 md:h-6 md:w-6 shrink-0" />
                        <span className="truncate">Phiếu thu — {order?.order_code}</span>
                    </DialogTitle>
                    {orderSummary && order && (
                        <DialogDescription asChild>
                            <div className="space-y-2 pt-1.5 md:pt-2">
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs md:flex md:flex-wrap md:gap-x-6 md:gap-y-2 md:text-base">
                                    <span>
                                        Tổng HĐ: <strong className="tabular-nums">{formatCurrency(orderSummary.total)}</strong>
                                    </span>
                                    <span>
                                        Đã thu: <strong className="text-green-700 tabular-nums">{formatCurrency(orderSummary.paid)}</strong>
                                    </span>
                                    <span>
                                        Còn nợ:{' '}
                                        <strong className={cn('tabular-nums', orderSummary.remaining > 0 ? 'text-red-600' : 'text-green-600')}>
                                            {formatCurrency(orderSummary.remaining)}
                                        </strong>
                                    </span>
                                    {orderSummary.deposit > 0 && (
                                        <span>
                                            Tổng cọc: <strong className="text-amber-700 tabular-nums">{formatCurrency(orderSummary.deposit)}</strong>
                                        </span>
                                    )}
                                    <span className="text-muted-foreground col-span-2 md:col-span-1">{columns.length} SP con</span>
                                </div>
                                {unassignedTotal > 0 && (
                                    <p className="text-[11px] md:text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-snug">
                                        Phiếu thu chưa gắn SP: <strong>{formatCurrency(unassignedTotal)}</strong>
                                        {' '}({unassignedPayments.length} phiếu)
                                    </p>
                                )}
                            </div>
                        </DialogDescription>
                    )}
                </DialogHeader>

                <div className="flex-1 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden px-3 py-3 md:px-6 md:py-5 min-h-0">
                    {loading ? (
                        <div className="flex justify-center py-16 md:py-24">
                            <Loader2 className="h-8 w-8 md:h-10 md:w-10 animate-spin text-primary" />
                        </div>
                    ) : columns.length === 0 ? (
                        <div className="text-center py-16 md:py-24 text-muted-foreground">
                            <Receipt className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm md:text-base">Đơn {order?.order_code} chưa có SP con</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 md:flex-row md:gap-4 md:h-full md:min-h-0 md:pb-1 md:min-w-min md:items-stretch">
                            {columns.map((col) => (
                                <ProductDebtColumn key={col.key} column={col} />
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
