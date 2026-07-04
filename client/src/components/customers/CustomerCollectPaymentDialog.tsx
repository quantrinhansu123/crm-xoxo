import { Fragment, useEffect, useMemo, useState } from 'react';
import { Loader2, Wallet, Banknote, Smartphone } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { customersApi } from '@/lib/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { CustomerOrderPaymentDetailDialog } from './CustomerOrderPaymentDetailDialog';

export type CustomerDebtProductRow = {
    id: string;
    product_code: string;
    name: string;
    image_url: string | null;
    total_amount: number;
    deposit_amount: number;
    paid_amount?: number;
    remaining_debt?: number;
};

export interface CustomerDebtOrderRow {
    id: string;
    order_code: string;
    created_at: string;
    total_amount: number;
    paid_amount: number;
    deposit_amount: number;
    remaining_debt: number;
    products?: CustomerDebtProductRow[];
}

type PaymentKind = 'deposit' | 'payment';

type ProductPayRow = {
    key: string;
    orderId: string;
    orderCode: string;
    orderCreatedAt: string;
    product: CustomerDebtProductRow;
    needCollect: number;
};

interface CustomerCollectPaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerId: string;
    customerName: string;
    customerPhone?: string;
    totalDebt: number;
    orders: CustomerDebtOrderRow[];
    onSuccess: () => void;
}

const PAYMENT_METHODS = [
    { value: 'cash', label: 'Tiền mặt', icon: Banknote },
    { value: 'transfer', label: 'Chuyển khoản', icon: Smartphone },
    { value: 'zalopay', label: 'Zalo Pay', icon: Wallet },
] as const;

const PAYMENT_KINDS = [
    { value: 'payment' as const, label: 'Thanh toán' },
    { value: 'deposit' as const, label: 'Tiền cọc' },
] as const;

function formatInputCurrency(value: number): string {
    if (!value) return '';
    return value.toLocaleString('vi-VN');
}

function parseInputCurrency(value: string): number {
    return parseInt(value.replace(/[^\d]/g, ''), 10) || 0;
}

function getChildProducts(order: CustomerDebtOrderRow): CustomerDebtProductRow[] {
    const all = order.products || [];
    const children = all.filter((p) => p.product_code !== order.order_code);
    return children.length > 0 ? children : all;
}

function getProductPaymentPaid(p: CustomerDebtProductRow): number {
    const paid = p.paid_amount || 0;
    const deposit = p.deposit_amount || 0;
    return Math.max(0, paid - deposit);
}

function getProductNeedCollect(p: CustomerDebtProductRow): number {
    const collected = Math.max(p.paid_amount || 0, p.deposit_amount || 0);
    return Math.max(0, (p.total_amount || 0) - collected);
}

function buildProductRows(orders: CustomerDebtOrderRow[]): ProductPayRow[] {
    const sorted = [...orders].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const rows: ProductPayRow[] = [];
    for (const o of sorted) {
        for (const p of getChildProducts(o)) {
            rows.push({
                key: p.id,
                orderId: o.id,
                orderCode: o.order_code,
                orderCreatedAt: o.created_at,
                product: p,
                needCollect: getProductNeedCollect(p),
            });
        }
    }
    return rows;
}

export function CustomerCollectPaymentDialog({
    open,
    onOpenChange,
    customerId,
    customerName,
    customerPhone,
    totalDebt,
    orders,
    onSuccess,
}: CustomerCollectPaymentDialogProps) {
    const sortedOrders = useMemo(
        () => [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        [orders]
    );

    const productRows = useMemo(() => buildProductRows(orders), [orders]);

    const [paidAt, setPaidAt] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'zalopay'>('cash');
    const [notes, setNotes] = useState('');
    const [totalAmount, setTotalAmount] = useState(0);
    const [rowAmounts, setRowAmounts] = useState<Record<string, number>>({});
    const [paymentKinds, setPaymentKinds] = useState<Record<string, PaymentKind>>({});
    const [submitting, setSubmitting] = useState(false);
    const [detailOrder, setDetailOrder] = useState<CustomerDebtOrderRow | null>(null);

    useEffect(() => {
        if (!open) return;
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setPaidAt(local);
        setPaymentMethod('cash');
        setNotes('');
        setTotalAmount(0);
        const initialAmounts: Record<string, number> = {};
        const initialKinds: Record<string, PaymentKind> = {};
        productRows.forEach((r) => {
            initialAmounts[r.key] = 0;
            initialKinds[r.key] = 'payment';
        });
        setRowAmounts(initialAmounts);
        setPaymentKinds(initialKinds);
    }, [open, productRows]);

    const rowSum = useMemo(
        () => Object.values(rowAmounts).reduce((s, v) => s + (v || 0), 0),
        [rowAmounts]
    );

    const tableTotals = useMemo(() => {
        let invoiceValue = 0;
        let deposit = 0;
        let paymentPaid = 0;
        let needCollect = 0;
        for (const r of productRows) {
            invoiceValue += r.product.total_amount || 0;
            deposit += r.product.deposit_amount || 0;
            paymentPaid += getProductPaymentPaid(r.product);
            needCollect += r.needCollect;
        }
        return { invoiceValue, deposit, paymentPaid, needCollect, payThisTime: rowSum };
    }, [productRows, rowSum]);

    const updateRowAmount = (key: string, val: number) => {
        setRowAmounts((prev) => {
            const next = { ...prev, [key]: val };
            const sum = Object.values(next).reduce((s, v) => s + (v || 0), 0);
            setTotalAmount(sum);
            return next;
        });
    };

    const distributeFromTotal = (total: number) => {
        let left = Math.max(0, total);
        const next: Record<string, number> = {};
        productRows.forEach((r) => {
            next[r.key] = 0;
        });
        for (const r of productRows) {
            if (left <= 0) break;
            if (r.needCollect <= 0) continue;
            const assign = Math.min(left, r.needCollect);
            next[r.key] = assign;
            left -= assign;
        }
        setRowAmounts(next);
        const sum = Object.values(next).reduce((s, v) => s + (v || 0), 0);
        setTotalAmount(sum);
    };

    const handleTotalChange = (value: number) => {
        const capped = Math.min(Math.max(0, value), totalDebt);
        setTotalAmount(capped);
        distributeFromTotal(capped);
    };

    const handleSubmit = async () => {
        const payTotal = rowSum > 0 ? rowSum : totalAmount;
        if (payTotal <= 0) {
            toast.error('Nhập số tiền thanh toán lần này hoặc phân bổ vào từng SP');
            return;
        }
        if (rowSum > 0 && totalAmount > 0 && rowSum !== totalAmount) {
            toast.error(`Tổng phân bổ (${formatCurrency(rowSum)}) phải bằng số tiền lần này (${formatCurrency(totalAmount)})`);
            return;
        }

        const allocations = productRows
            .filter((r) => (rowAmounts[r.key] || 0) > 0)
            .map((r) => ({
                order_id: r.orderId,
                order_product_id: r.product.id,
                amount: rowAmounts[r.key] || 0,
                payment_kind: paymentKinds[r.key] || 'payment',
            }));

        if (allocations.length === 0) {
            toast.error('Phân bổ thanh toán cho ít nhất một sản phẩm');
            return;
        }

        setSubmitting(true);
        try {
            await customersApi.collectPayment(customerId, {
                amount: payTotal,
                payment_method: paymentMethod,
                notes: notes || undefined,
                content: `Thanh toán công nợ - ${customerName}`,
                allocations,
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
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-5xl max-h-[94vh] overflow-y-auto p-0 gap-0">
                    <DialogHeader className="px-6 pt-6 pb-3 border-b">
                        <DialogTitle>Thanh toán</DialogTitle>
                        <DialogDescription>
                            {customerName}
                            {customerPhone ? ` · ${customerPhone}` : ''}
                            {' · '}
                            <span className="font-semibold text-red-600">Nợ hiện tại: {formatCurrency(totalDebt)}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="px-6 py-4 space-y-4">
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                            <div className="lg:col-span-3 space-y-1.5">
                                <Label className="text-xs font-medium">Thời gian</Label>
                                <Input type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                            </div>
                            <div className="lg:col-span-3 space-y-1.5">
                                <Label className="text-xs font-medium">Phương thức</Label>
                                <Select
                                    value={paymentMethod}
                                    onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAYMENT_METHODS.map((m) => (
                                            <SelectItem key={m.value} value={m.value}>
                                                {m.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="lg:col-span-6 space-y-1.5">
                                <Label className="text-xs font-medium text-primary">Số tiền (lần thanh toán này)</Label>
                                <Input
                                    type="text"
                                    className="h-11 text-lg font-semibold text-right border-primary/40"
                                    placeholder="0"
                                    value={formatInputCurrency(totalAmount)}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => handleTotalChange(parseInputCurrency(e.target.value))}
                                />
                                <p className="text-right text-sm">
                                    <span className="text-muted-foreground">Tổng từ các dòng SP: </span>
                                    <strong className="text-green-700 tabular-nums">{formatCurrency(rowSum)}</strong>
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                            <div>
                                <p className="text-[11px] text-muted-foreground uppercase">Tổng giá trị HĐ</p>
                                <p className="font-semibold tabular-nums">{formatCurrency(tableTotals.invoiceValue)}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-muted-foreground uppercase">Tổng cọc</p>
                                <p className="font-semibold tabular-nums text-amber-800">{formatCurrency(tableTotals.deposit)}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-muted-foreground uppercase">Tổng thanh toán</p>
                                <p className="font-semibold tabular-nums text-green-700">{formatCurrency(tableTotals.paymentPaid)}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-muted-foreground uppercase">Tổng cần thu</p>
                                <p className="font-semibold tabular-nums text-red-600">{formatCurrency(tableTotals.needCollect)}</p>
                            </div>
                            <div className="col-span-2 sm:col-span-1 sm:text-right border-t sm:border-t-0 sm:border-l border-primary/15 pt-2 sm:pt-0 sm:pl-3">
                                <p className="text-[11px] text-primary font-medium uppercase">Tổng thanh toán lần này</p>
                                <p className="text-xl font-bold tabular-nums text-green-700">{formatCurrency(tableTotals.payThisTime)}</p>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Ghi chú</Label>
                            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                        </div>

                        <div className="rounded-lg border overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[980px]">
                                    <thead className="bg-muted/60 text-xs uppercase">
                                        <tr>
                                            <th className="p-2.5 text-left font-semibold min-w-[140px]">Mã hóa đơn</th>
                                            <th className="p-2.5 text-right font-semibold">Giá trị HĐ</th>
                                            <th className="p-2.5 text-right font-semibold text-amber-800">Cọc</th>
                                            <th className="p-2.5 text-right font-semibold text-green-700">Thanh toán</th>
                                            <th className="p-2.5 text-right font-semibold">Cần thu</th>
                                            <th className="p-2.5 text-center font-semibold w-28">Loại TT</th>
                                            <th className="p-2.5 text-right font-semibold w-36">Thu lần này</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedOrders.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                                    Chưa có đơn hàng
                                                </td>
                                            </tr>
                                        ) : (
                                            sortedOrders.map((o) => {
                                                const children = getChildProducts(o);
                                                const orderDeposit = children.reduce(
                                                    (s, p) => s + (p.deposit_amount || 0),
                                                    0
                                                );
                                                const orderPaymentPaid = children.reduce(
                                                    (s, p) => s + getProductPaymentPaid(p),
                                                    0
                                                );
                                                const orderNeedCollect = children.reduce(
                                                    (s, p) => s + getProductNeedCollect(p),
                                                    0
                                                );
                                                const childPaySum = children.reduce(
                                                    (s, p) => s + (rowAmounts[p.id] || 0),
                                                    0
                                                );

                                                return (
                                                    <Fragment key={o.id}>
                                                        <tr
                                                            className="border-t bg-muted/40 font-medium"
                                                        >
                                                            <td className="p-2.5">
                                                                <div className="text-primary">{o.order_code}</div>
                                                                <div className="text-[11px] text-muted-foreground font-normal">
                                                                    {formatDateTime(o.created_at)}
                                                                </div>
                                                            </td>
                                                            <td className="p-2.5 text-right tabular-nums">
                                                                {formatCurrency(o.total_amount)}
                                                            </td>
                                                            <td className="p-2.5 text-right tabular-nums text-amber-700">
                                                                {orderDeposit > 0 ? formatCurrency(orderDeposit) : '—'}
                                                            </td>
                                                            <td className="p-2.5 text-right tabular-nums text-green-700">
                                                                {orderPaymentPaid > 0 ? formatCurrency(orderPaymentPaid) : '—'}
                                                            </td>
                                                            <td className="p-2.5 text-right tabular-nums text-red-600">
                                                                {formatCurrency(orderNeedCollect)}
                                                            </td>
                                                            <td className="p-2.5" />
                                                            <td className="p-2.5 text-right tabular-nums text-green-700">
                                                                {childPaySum > 0 ? formatCurrency(childPaySum) : '—'}
                                                            </td>
                                                        </tr>
                                                        {children.map((p) => {
                                                            const need = getProductNeedCollect(p);
                                                            const paymentPaid = getProductPaymentPaid(p);
                                                            const rowKey = p.id;
                                                            return (
                                                                <tr
                                                                    key={rowKey}
                                                                    className="border-t hover:bg-muted/15"
                                                                >
                                                                    <td className="p-2.5 pl-8">
                                                                        <div className="font-mono font-semibold text-primary text-[13px]">
                                                                            {p.product_code}
                                                                        </div>
                                                                        <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                                                            {p.name}
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-2.5 text-right tabular-nums">
                                                                        {formatCurrency(p.total_amount)}
                                                                    </td>
                                                                    <td className="p-2.5 text-right tabular-nums text-amber-700">
                                                                        {p.deposit_amount > 0
                                                                            ? formatCurrency(p.deposit_amount)
                                                                            : '—'}
                                                                    </td>
                                                                    <td className="p-2.5 text-right tabular-nums text-green-700">
                                                                        {(() => {
                                                                            const paid = getProductPaymentPaid(p);
                                                                            return paid > 0 ? formatCurrency(paid) : '—';
                                                                        })()}
                                                                    </td>
                                                                    <td className="p-2.5 text-right tabular-nums font-medium">
                                                                        {need > 0 ? (
                                                                            <span className="text-red-600">
                                                                                {formatCurrency(need)}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-green-600">0</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-2.5">
                                                                        <Select
                                                                            value={paymentKinds[rowKey] || 'payment'}
                                                                            onValueChange={(v) =>
                                                                                setPaymentKinds((prev) => ({
                                                                                    ...prev,
                                                                                    [rowKey]: v as PaymentKind,
                                                                                }))
                                                                            }
                                                                        >
                                                                            <SelectTrigger className="h-8 text-xs">
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
                                                                    </td>
                                                                    <td className="p-2.5">
                                                                        <Input
                                                                            type="text"
                                                                            className={cn(
                                                                                'h-9 text-right',
                                                                                need <= 0 && 'bg-muted/50'
                                                                            )}
                                                                            disabled={need <= 0}
                                                                            value={formatInputCurrency(rowAmounts[rowKey] || 0)}
                                                                            onFocus={(e) => e.target.select()}
                                                                            onChange={(e) => {
                                                                                const val = Math.min(
                                                                                    need,
                                                                                    parseInputCurrency(e.target.value)
                                                                                );
                                                                                updateRowAmount(rowKey, val);
                                                                            }}
                                                                        />
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </Fragment>
                                                );
                                            })
                                        )}
                                    </tbody>
                                    {productRows.length > 0 && (
                                        <tfoot className="bg-slate-100 border-t-2 border-slate-300 text-sm font-bold">
                                            <tr>
                                                <td className="p-3 uppercase text-slate-700">Tổng cộng</td>
                                                <td className="p-3 text-right tabular-nums">
                                                    {formatCurrency(tableTotals.invoiceValue)}
                                                </td>
                                                <td className="p-3 text-right tabular-nums text-amber-800">
                                                    {formatCurrency(tableTotals.deposit)}
                                                </td>
                                                <td className="p-3 text-right tabular-nums text-red-600">
                                                    {formatCurrency(tableTotals.needCollect)}
                                                </td>
                                                <td className="p-3" />
                                                <td className="p-3 text-right tabular-nums text-green-700 text-base">
                                                    {formatCurrency(tableTotals.payThisTime)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm border-t pt-3">
                            <div className="space-y-0.5">
                                <p className="text-muted-foreground">
                                    Tổng phân bổ dòng SP:{' '}
                                    <strong
                                        className={cn(
                                            rowSum > 0 && rowSum === (totalAmount || rowSum)
                                                ? 'text-green-600'
                                                : 'text-red-600'
                                        )}
                                    >
                                        {formatCurrency(rowSum)}
                                    </strong>
                                </p>
                                {totalAmount > 0 && rowSum !== totalAmount && (
                                    <p className="text-xs text-red-600">
                                        Phải khớp số tiền lần này ({formatCurrency(totalAmount)})
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTotalChange(totalDebt)}
                                >
                                    Phân bổ hết nợ
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => distributeFromTotal(totalAmount)}
                                >
                                    Phân bổ theo số tiền trên
                                </Button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Bỏ qua
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting || productRows.length === 0}
                        >
                            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Tạo phiếu thu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <CustomerOrderPaymentDetailDialog
                open={!!detailOrder}
                onOpenChange={(open) => !open && setDetailOrder(null)}
                order={detailOrder}
            />
        </>
    );
}
