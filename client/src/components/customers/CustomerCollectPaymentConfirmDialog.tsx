import { useEffect, useMemo, useState } from 'react';
import { Loader2, Package, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { customersApi } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { CustomerDebtOrderRow, CustomerDebtProductRow } from './CustomerCollectPaymentDialog';

export type PaymentKind = 'deposit' | 'payment';

export type ConfirmMetaRow = {
    order_product_id: string;
    payment_kind: PaymentKind;
};

const PAYMENT_KINDS = [
    { value: 'deposit' as const, label: 'Tiền cọc' },
    { value: 'payment' as const, label: 'Thanh toán' },
] as const;

function ProductPreview({ product }: { product: CustomerDebtProductRow | undefined }) {
    if (!product) return null;
    return (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            {product.image_url ? (
                <img
                    src={product.image_url}
                    alt={product.product_code}
                    className="h-16 w-16 rounded-md object-cover border shrink-0"
                />
            ) : (
                <div className="h-16 w-16 rounded-md border bg-muted shrink-0 flex items-center justify-center">
                    <Package className="h-6 w-6 text-muted-foreground" />
                </div>
            )}
            <div className="min-w-0">
                <p className="font-semibold text-primary font-mono">{product.product_code}</p>
                <p className="text-sm text-muted-foreground truncate">{product.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Giá trị: {formatCurrency(product.total_amount)}
                    {product.deposit_amount > 0 && (
                        <span className="text-amber-700"> · Cọc: {formatCurrency(product.deposit_amount)}</span>
                    )}
                </p>
            </div>
        </div>
    );
}

interface CustomerCollectPaymentConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onBack: () => void;
    customerId: string;
    customerName: string;
    paymentMethod: 'cash' | 'transfer' | 'zalopay';
    notes: string;
    orders: CustomerDebtOrderRow[];
    amounts: Record<string, number>;
    onSuccess: () => void;
}

export function CustomerCollectPaymentConfirmDialog({
    open,
    onOpenChange,
    onBack,
    customerId,
    customerName,
    paymentMethod,
    notes,
    orders,
    amounts,
    onSuccess,
}: CustomerCollectPaymentConfirmDialogProps) {
    const activeOrders = useMemo(
        () => orders.filter((o) => (amounts[o.id] || 0) > 0),
        [orders, amounts]
    );

    const totalAmount = useMemo(
        () => activeOrders.reduce((s, o) => s + (amounts[o.id] || 0), 0),
        [activeOrders, amounts]
    );

    const [meta, setMeta] = useState<Record<string, ConfirmMetaRow>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        const initial: Record<string, ConfirmMetaRow> = {};
        activeOrders.forEach((o) => {
            const products = o.products || [];
            initial[o.id] = {
                order_product_id: products.length === 1 ? products[0].id : '',
                payment_kind: 'payment',
            };
        });
        setMeta(initial);
    }, [open, activeOrders]);

    const updateMeta = (orderId: string, patch: Partial<ConfirmMetaRow>) => {
        setMeta((prev) => {
            const current = prev[orderId] ?? {
                order_product_id: '',
                payment_kind: 'payment' as PaymentKind,
            };

            return {
                ...prev,
                [orderId]: {
                    ...current,
                    ...patch,
                },
            };
        });
    };

    const handleSubmit = async () => {
        for (const o of activeOrders) {
            const row = meta[o.id];
            if (!row?.order_product_id) {
                toast.error(`Chọn sản phẩm cho đơn ${o.order_code}`);
                return;
            }
        }

        const payload = activeOrders.map((o) => ({
            order_id: o.id,
            amount: amounts[o.id] || 0,
            order_product_id: meta[o.id].order_product_id,
            payment_kind: meta[o.id].payment_kind,
        }));

        setSubmitting(true);
        try {
            await customersApi.collectPayment(customerId, {
                amount: totalAmount,
                payment_method: paymentMethod,
                notes: notes || undefined,
                content: `Thanh toán công nợ - ${customerName}`,
                allocations: payload,
            });
            toast.success('Đã tạo phiếu thu');
            onSuccess();
            onOpenChange(false);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg || 'Lỗi khi ghi nhận thanh toán');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Receipt className="h-5 w-5" />
                        Tạo phiếu thu
                    </DialogTitle>
                    <DialogDescription>
                        Chọn sản phẩm và loại thanh toán cho từng đơn · Tổng:{' '}
                        <strong className="text-green-700">{formatCurrency(totalAmount)}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {activeOrders.map((o) => {
                        const row = meta[o.id];
                        const selectedProduct = o.products?.find((p) => p.id === row?.order_product_id);
                        const payAmount = amounts[o.id] || 0;

                        return (
                            <div key={o.id} className="rounded-xl border p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-primary">{o.order_code}</p>
                                        <p className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</p>
                                    </div>
                                    <p className="text-lg font-bold text-green-700 tabular-nums shrink-0">
                                        {formatCurrency(payAmount)}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Sản phẩm</Label>
                                        <Select
                                            value={row?.order_product_id || undefined}
                                            onValueChange={(v) => updateMeta(o.id, { order_product_id: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Chọn SP" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(o.products || []).length === 0 ? (
                                                    <SelectItem value="__none" disabled>
                                                        Không có SP
                                                    </SelectItem>
                                                ) : (
                                                    (o.products || []).map((p) => (
                                                        <SelectItem key={p.id} value={p.id}>
                                                            {p.product_code} — {p.name}
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Loại thanh toán</Label>
                                        <Select
                                            value={row?.payment_kind || 'payment'}
                                            onValueChange={(v) => updateMeta(o.id, { payment_kind: v as PaymentKind })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PAYMENT_KINDS.map((k) => (
                                                    <SelectItem key={k.value} value={k.value}>
                                                        {k.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {selectedProduct && <ProductPreview product={selectedProduct} />}
                            </div>
                        );
                    })}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
                        Quay lại
                    </Button>
                    <Button type="button" onClick={handleSubmit} disabled={submitting || activeOrders.length === 0}>
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Xác nhận tạo phiếu thu
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
