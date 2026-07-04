import React, { useState } from 'react';
import { FileText, Calculator, XCircle, CheckCircle, Package, Gift, Clock, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { CancelInvoiceDialog } from './CancelInvoiceDialog';

export interface Invoice {
    id: string;
    invoice_code: string;
    order_id: string;
    customer_id: string;
    customer?: { id: string; name: string; phone: string; email?: string };
    order?: { id: string; order_code: string; items?: any[]; remaining_debt?: number };
    subtotal: number;
    discount: number;
    total_amount: number;
    payment_method: string;
    status: string;
    notes?: string;
    paid_at?: string;
    created_at: string;
    created_user?: { id: string; name: string };
    order_item_ids?: string[];
    order_product_service_ids?: string[];
    transactions?: any[];
}

interface InvoiceDetailDialogProps {
    invoice: Invoice | null;
    open: boolean;
    onClose: () => void;
    onStatusChange?: (
        id: string,
        status: string,
        options?: { cancel_related_payments?: boolean },
    ) => void | Promise<void>;
    onPayButtonClick?: (invoice: Invoice) => void;
    onDelete?: (invoiceId: string) => void;
    canEdit?: boolean;
    canDelete?: boolean;
}

function CompactItemRow({
    tag,
    tagClass,
    name,
    sub,
    qty,
    amount,
    amountClass,
    muted,
    rowClass,
}: {
    tag: string;
    tagClass: string;
    name: string;
    sub?: string;
    qty: number | string;
    amount: string;
    amountClass?: string;
    muted?: boolean;
    rowClass?: string;
}) {
    return (
        <div
            className={cn(
                'flex items-center gap-1.5 px-2 py-1.5 text-[11px] leading-tight',
                muted && 'opacity-50',
                rowClass,
            )}
        >
            <span className={cn('shrink-0 rounded px-1 py-px text-[8px] font-bold leading-none', tagClass)}>
                {tag}
            </span>
            <p className="min-w-0 flex-1 truncate">
                <span className="font-medium">{name}</span>
                {sub ? <span className="font-normal text-muted-foreground">{sub}</span> : null}
            </p>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">×{qty}</span>
            <span className={cn('shrink-0 whitespace-nowrap font-bold tabular-nums', amountClass)}>{amount}</span>
        </div>
    );
}

export function InvoiceDetailDialog({
    invoice,
    open,
    onClose,
    onStatusChange,
    onPayButtonClick,
    onDelete,
    canEdit = false,
    canDelete = false,
}: InvoiceDetailDialogProps) {
    const [showCancelDialog, setShowCancelDialog] = useState(false);

    if (!invoice) return null;

    const receipts = invoice.transactions?.filter(t => t.id.startsWith('p-') || t.code?.startsWith('PT')) || [];
    const paidFromReceipts = receipts.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const hasRelatedPayments = paidFromReceipts > 0 || invoice.status === 'paid';
    const expenses = invoice.transactions?.filter(t => t.code?.startsWith('PC')) || [];

    const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'info' }> = {
        draft: { label: 'Nháp', variant: 'secondary' },
        pending: { label: 'Chờ thanh toán', variant: 'warning' },
        paid: { label: 'Đã thanh toán', variant: 'success' },
        cancelled: { label: 'Đã hủy', variant: 'danger' }
    };

    const paymentMethodLabels: Record<string, string> = {
        cash: 'Tiền mặt',
        transfer: 'Chuyển khoản',
        zalopay: 'Zalo Pay'
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="flex max-h-[90vh] w-[calc(100vw-0.5rem)] max-w-[calc(100vw-0.5rem)] flex-col gap-0 overflow-hidden p-0 sm:w-[min(96vw,48rem)] sm:max-w-3xl">
                <DialogHeader className="space-y-1 pr-6">
                    <DialogTitle className="flex flex-wrap items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
                        <FileText className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
                        <span className="font-bold">{invoice.invoice_code}</span>
                        <Badge variant={statusConfig[invoice.status]?.variant || 'secondary'}>
                            {statusConfig[invoice.status]?.label || invoice.status}
                        </Badge>
                    </DialogTitle>
                    <DialogDescription className="hidden sm:block">Chi tiết hóa đơn</DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="mx-3 mt-2 bg-muted/50 p-1 sm:mx-6">
                        <TabsTrigger value="details" className="flex-1 text-xs sm:text-sm">Chi tiết</TabsTrigger>
                        <TabsTrigger value="receipts" className="flex-1 text-xs sm:text-sm">Phiếu thu ({receipts.length})</TabsTrigger>
                        <TabsTrigger value="expenses" className="flex-1 text-xs sm:text-sm">Phiếu chi ({expenses.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="flex-1 space-y-2 overflow-y-auto p-3 pt-2 outline-none sm:space-y-4 sm:p-6">
                        {/* Customer Info */}
                        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 sm:gap-3 sm:p-3">
                            <Avatar className="h-9 w-9 sm:h-12 sm:w-12">
                                <AvatarFallback className="bg-primary text-white">
                                    {invoice.customer?.name?.charAt(0) || 'K'}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold sm:text-base">{invoice.customer?.name || 'N/A'}</p>
                                <p className="truncate text-xs text-muted-foreground sm:text-sm">{invoice.customer?.phone || 'Không có SĐT'}</p>
                            </div>
                        </div>

                        {/* Order Info */}
                        {invoice.order && (
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 py-2 sm:px-3 sm:py-2.5">
                                <p className="min-w-0 truncate text-xs font-medium text-blue-700 sm:text-sm">
                                    Đơn hàng: <span className="font-bold">{invoice.order.order_code}</span>
                                </p>
                                {invoice.order.remaining_debt !== undefined && (
                                    <div className="shrink-0 text-right leading-tight">
                                        <p className="text-[9px] font-semibold uppercase tracking-wide text-blue-500 sm:text-[10px]">
                                            Còn nợ
                                        </p>
                                        <p className="text-xs font-bold text-red-600 sm:text-sm">
                                            {formatCurrency(invoice.order.remaining_debt)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}


                        {/* Items Table */}
                        {invoice.order && (
                            <div className="space-y-2 sm:space-y-4">
                                {(() => {
                                    const saleItems = invoice.order?.items || [];
                                    const products = (invoice.order as any).products || [];

                                    if (saleItems.length === 0 && products.length === 0) return null;

                                    return (
                                        <>
                                            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground sm:text-sm">
                                                <Package className="h-3 w-3 sm:h-4 sm:w-4" />
                                                Chi tiết sản phẩm/dịch vụ
                                            </p>

                                            {/* Mobile: danh sách 1 dòng / mục */}
                                            <div className="divide-y overflow-hidden rounded-lg border lg:hidden">
                                                {products.map((p: any, pIdx: number) => {
                                                    const services = p.services || [];
                                                    const servicesTotal = services.reduce(
                                                        (acc: number, s: any) =>
                                                            acc + Number(s.unit_price) * (s.quantity || 1),
                                                        0,
                                                    );
                                                    const productSurchargesTotal = Number(p.surcharge_amount) || 0;
                                                    const rowTotal = servicesTotal + productSurchargesTotal;

                                                    return (
                                                        <React.Fragment key={`m-p-${pIdx}`}>
                                                            <CompactItemRow
                                                                tag="SP"
                                                                tagClass="bg-blue-600 text-white"
                                                                name={p.name}
                                                                sub={p.product_code ? ` (${p.product_code})` : undefined}
                                                                qty={1}
                                                                amount={formatCurrency(rowTotal)}
                                                                amountClass="text-blue-700"
                                                                rowClass="bg-blue-50/40"
                                                            />
                                                            {services.map((s: any, sIdx: number) => {
                                                                const isPaid =
                                                                    invoice.order_product_service_ids?.includes(s.id);
                                                                const qty = s.quantity || 1;
                                                                const unitPrice = Number(s.unit_price) || 0;
                                                                return (
                                                                    <CompactItemRow
                                                                        key={`m-s-${sIdx}`}
                                                                        tag="DV"
                                                                        tagClass="border border-purple-200 bg-purple-50 text-purple-700"
                                                                        name={s.item_name}
                                                                        qty={qty}
                                                                        amount={formatCurrency(qty * unitPrice)}
                                                                        muted={
                                                                            !isPaid &&
                                                                            !!invoice.order_product_service_ids?.length
                                                                        }
                                                                        rowClass="bg-muted/20 pl-3"
                                                                    />
                                                                );
                                                            })}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                {saleItems.length > 0 && (
                                                    <>
                                                        <div className="bg-emerald-50/60 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                                                            Bán kèm / Voucher
                                                        </div>
                                                        {saleItems.map((item: any, i: number) => {
                                                            const isPaid = invoice.order_item_ids?.includes(item.id);
                                                            const qty = item.quantity || 1;
                                                            const unitPrice = Number(item.unit_price) || 0;
                                                            return (
                                                                <CompactItemRow
                                                                    key={`m-sale-${i}`}
                                                                    tag={item.item_type === 'voucher' ? 'VC' : 'BK'}
                                                                    tagClass="border border-emerald-200 bg-emerald-50 text-emerald-700"
                                                                    name={item.item_name}
                                                                    qty={qty}
                                                                    amount={formatCurrency(qty * unitPrice)}
                                                                    muted={!isPaid && !!invoice.order_item_ids?.length}
                                                                />
                                                            );
                                                        })}
                                                    </>
                                                )}
                                            </div>

                                            <div className="hidden overflow-hidden overflow-x-auto rounded-lg border lg:block">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-muted/50">
                                                        <tr>
                                                            <th className="p-2 text-left font-medium sm:p-3">Tên khoản mục</th>
                                                            <th className="w-10 p-2 text-center font-medium sm:p-3">SL</th>
                                                            <th className="hidden p-2 text-right font-medium sm:table-cell sm:p-3">Đơn giá</th>
                                                            <th className="p-2 text-right font-medium sm:p-3">T.Tiền</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {products.map((p: any, pIdx: number) => {
                                                            const services = p.services || [];
                                                            const servicesTotal = services.reduce((acc: number, s: any) => acc + (Number(s.unit_price) * (s.quantity || 1)), 0);
                                                            const productSurchargesTotal = Number(p.surcharge_amount) || 0;
                                                            const rowTotal = servicesTotal + productSurchargesTotal;

                                                            return (
                                                                <React.Fragment key={`p-${pIdx}`}>
                                                                    <tr className="bg-blue-50/50">
                                                                        <td className="p-2 font-bold text-blue-700 sm:p-3">
                                                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                                                                <Badge className="h-5 w-fit shrink-0 bg-blue-600 px-1.5 text-[9px] sm:text-[10px]">
                                                                                    SP khách
                                                                                </Badge>
                                                                                <span className="text-xs leading-snug sm:text-sm">
                                                                                    {p.name}
                                                                                    <span className="ml-1 font-normal opacity-70">({p.product_code})</span>
                                                                                </span>
                                                                            </div>
                                                                            {p.surcharges && p.surcharges.length > 0 && (
                                                                                <div className="flex flex-wrap gap-1 mt-1 px-1">
                                                                                    {p.surcharges.map((sur: any, idx: number) => {
                                                                                        const amount = sur.isPercent ? (servicesTotal * Number(sur.value) / 100) : Number(sur.value);
                                                                                        return (
                                                                                            <Badge key={idx} variant="outline" className="text-[10px] py-0 h-4 bg-orange-50 text-orange-700 border-orange-200">
                                                                                                +{sur.label} {sur.isPercent ? `(${sur.value}%)` : ''}: {formatCurrency(amount)}
                                                                                            </Badge>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="p-2 text-center sm:p-3">1</td>
                                                                        <td className="hidden p-2 text-right text-muted-foreground sm:table-cell sm:p-3">—</td>
                                                                        <td className="p-2 text-right text-xs font-bold text-blue-700 sm:p-3 sm:text-sm">
                                                                            {formatCurrency(rowTotal)}
                                                                        </td>
                                                                    </tr>
                                                                    {services.map((s: any, sIdx: number) => {
                                                                        const isPaidByThisInvoice = invoice.order_product_service_ids?.includes(s.id);
                                                                        const qty = s.quantity || 1;
                                                                        const unitPrice = Number(s.unit_price) || 0;
                                                                        const totalPrice = qty * unitPrice;

                                                                        return (
                                                                            <tr key={`s-${sIdx}`} className={cn("hover:bg-muted/30", !isPaidByThisInvoice && invoice.order_product_service_ids?.length && "opacity-50")}>
                                                                                <td className="p-2 pl-3 sm:p-3 sm:pl-8">
                                                                                    <div className="flex flex-col gap-0.5">
                                                                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                                                                            <Badge variant="outline" className="h-5 w-fit shrink-0 border-purple-200 bg-purple-50 px-1.5 text-[9px] text-purple-700 sm:text-[10px]">
                                                                                                DV
                                                                                            </Badge>
                                                                                            <span className="text-xs font-medium leading-snug sm:text-sm">{s.item_name}</span>
                                                                                        </div>
                                                                                        {s.surcharges && s.surcharges.length > 0 && (
                                                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                                                {s.surcharges.map((sur: any, idx: number) => {
                                                                                                    const amount = sur.isPercent ? (unitPrice * qty * Number(sur.value) / 100) : Number(sur.value);
                                                                                                    return (
                                                                                                        <Badge key={idx} variant="outline" className="text-[10px] py-0 h-4 bg-orange-50 text-orange-700 border-orange-200">
                                                                                                            +{sur.label} {sur.isPercent ? `(${sur.value}%)` : ''}: {formatCurrency(amount)}
                                                                                                        </Badge>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="p-2 text-center sm:p-3">{qty}</td>
                                                                                <td className="hidden p-2 text-right text-muted-foreground sm:table-cell sm:p-3">{formatCurrency(unitPrice)}</td>
                                                                                <td className="p-2 text-right text-xs font-semibold sm:p-3 sm:text-sm">{formatCurrency(totalPrice)}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </React.Fragment>
                                                            );
                                                        })}

                                                        {saleItems.length > 0 && (
                                                            <>
                                                                <tr className="bg-emerald-50/50">
                                                                    <td colSpan={4} className="p-2 text-xs font-bold text-emerald-700 sm:p-3 sm:text-sm">
                                                                        Sản phẩm bán kèm / Voucher
                                                                    </td>
                                                                </tr>
                                                                {saleItems.map((item: any, i: number) => {
                                                                    const isPaidByThisInvoice = invoice.order_item_ids?.includes(item.id);
                                                                    const qty = item.quantity || 1;
                                                                    const unitPrice = Number(item.unit_price) || 0;
                                                                    const totalPrice = qty * unitPrice;

                                                                    return (
                                                                        <tr key={`sale-${i}`} className={cn("hover:bg-muted/30", !isPaidByThisInvoice && invoice.order_item_ids?.length && "opacity-50")}>
                                                                            <td className="p-2 pl-3 sm:p-3 sm:pl-8">
                                                                                <div className="flex flex-col gap-0.5">
                                                                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                                                                        <Badge className="h-5 w-fit shrink-0 border-emerald-200 bg-emerald-100 px-1.5 text-[9px] text-emerald-700 sm:text-[10px]">
                                                                                            {item.item_type === 'voucher' ? 'VC' : 'SP'}
                                                                                        </Badge>
                                                                                        <span className="text-xs font-medium leading-snug sm:text-sm">{item.item_name}</span>
                                                                                    </div>
                                                                                    {item.surcharges && item.surcharges.length > 0 && (
                                                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                                                            {item.surcharges.map((sur: any, idx: number) => {
                                                                                                const amount = sur.isPercent ? (unitPrice * qty * Number(sur.value) / 100) : Number(sur.value);
                                                                                                return (
                                                                                                    <Badge key={idx} variant="outline" className="text-[10px] py-0 h-4 bg-orange-50 text-orange-700 border-orange-200">
                                                                                                        +{sur.label} {sur.isPercent ? `(${sur.value}%)` : ''}: {formatCurrency(amount)}
                                                                                                    </Badge>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-2 text-center sm:p-3">{qty}</td>
                                                                            <td className="hidden p-2 text-right text-muted-foreground sm:table-cell sm:p-3">{formatCurrency(unitPrice)}</td>
                                                                            <td className="p-2 text-right text-xs font-semibold sm:p-3 sm:text-sm">{formatCurrency(totalPrice)}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Summary */}
                        <div className="space-y-1 rounded-lg border border-primary/10 bg-gradient-to-r from-primary/5 to-primary/10 p-2.5 sm:space-y-2 sm:p-4">
                            <div className="flex justify-between text-xs sm:text-sm">
                                <span>Tạm tính</span>
                                <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
                            </div>
                            {invoice.discount > 0 && (
                                <div className="flex justify-between text-xs text-green-600 sm:text-sm">
                                    <span className="flex items-center gap-1">
                                        <Gift className="h-3 w-3" />
                                        Giảm giá
                                    </span>
                                    <span className="font-medium">-{formatCurrency(invoice.discount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between border-t border-primary/20 pt-1.5 text-sm font-bold sm:pt-2 sm:text-lg">
                                <span>Tổng TT</span>
                                <span className="text-primary">{formatCurrency(invoice.total_amount)}</span>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="grid grid-cols-2 gap-2 text-xs sm:gap-4 sm:text-sm">
                            <div>
                                <p className="text-muted-foreground">Ngày tạo</p>
                                <p className="font-medium">{formatDateTime(invoice.created_at)}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Người tạo</p>
                                <p className="font-medium">{invoice.created_user?.name || 'N/A'}</p>
                            </div>
                        </div>

                        {/* Notes */}
                        {invoice.notes && (
                            <div>
                                <p className="text-sm text-muted-foreground mb-1">Ghi chú</p>
                                <p className="text-sm p-3 bg-muted/50 rounded-lg">{invoice.notes}</p>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="receipts" className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 outline-none text-sm leading-relaxed">
                        <div className="space-y-3">
                            {receipts.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Calculator className="h-12 w-12 mx-auto mb-4 opacity-30" />
                                    <p>Chưa có phiếu thu nào cho hóa đơn này</p>
                                </div>
                            ) : (
                                receipts.map((trans: any, i: number) => (
                                    <div key={i} className="p-4 rounded-xl border bg-card hover:border-primary/30 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-green-100 text-green-700 border-green-200">
                                                    {trans.code || 'PT...'}
                                                </Badge>
                                                <span className="text-sm font-medium text-muted-foreground">
                                                    {formatDateTime(trans.created_at)}
                                                </span>
                                            </div>
                                            <span className="text-lg font-bold text-primary">
                                                {formatCurrency(trans.amount)}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <p className="text-muted-foreground text-xs uppercase font-bold tracking-tight">Phương thức</p>
                                                <p className="font-medium">{paymentMethodLabels[trans.payment_method] || trans.payment_method || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground text-xs uppercase font-bold tracking-tight">Trạng thái</p>
                                                <Badge
                                                    variant={trans.status === 'approved' ? 'success' : 'secondary'}
                                                    className={cn(
                                                        "text-[10px] py-0 h-4",
                                                        trans.status === 'approved' ? "bg-green-50 text-green-700 border-green-200" : ""
                                                    )}
                                                >
                                                    {trans.status === 'approved' ? 'Đã duyệt' : trans.status}
                                                </Badge>
                                            </div>
                                        </div>
                                        {trans.description && (
                                            <div className="mt-2 pt-2 border-t text-xs text-muted-foreground italic">
                                                {trans.description}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="expenses" className="flex-1 overflow-y-auto p-6 pt-2 space-y-4 outline-none text-sm leading-relaxed">
                        <div className="space-y-3">
                            {expenses.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Calculator className="h-12 w-12 mx-auto mb-4 opacity-30" />
                                    <p>Chưa có phiếu chi nào cho hóa đơn này</p>
                                </div>
                            ) : (
                                expenses.map((trans: any, i: number) => (
                                    <div key={i} className="p-4 rounded-xl border bg-card hover:border-red-300 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-red-100 text-red-700 border-red-200">
                                                    {trans.code || 'PC...'}
                                                </Badge>
                                                <span className="text-sm font-medium text-muted-foreground">
                                                    {formatDateTime(trans.created_at)}
                                                </span>
                                            </div>
                                            <span className="text-lg font-bold text-red-600">
                                                -{formatCurrency(trans.amount)}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <p className="text-muted-foreground text-xs uppercase font-bold tracking-tight">Phương thức</p>
                                                <p className="font-medium">{paymentMethodLabels[trans.payment_method] || trans.payment_method || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground text-xs uppercase font-bold tracking-tight">Trạng thái</p>
                                                <Badge
                                                    variant={trans.status === 'approved' ? 'success' : 'secondary'}
                                                    className={cn(
                                                        "text-[10px] py-0 h-4",
                                                        trans.status === 'approved' ? "bg-green-50 text-green-700 border-green-200" : ""
                                                    )}
                                                >
                                                    {trans.status === 'approved' ? 'Đã duyệt' : trans.status}
                                                </Badge>
                                            </div>
                                        </div>
                                        {trans.description && (
                                            <div className="mt-2 pt-2 border-t text-xs text-muted-foreground italic">
                                                {trans.description}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </TabsContent>
                </Tabs>

                {/* Actions */}
                {(canEdit || canDelete) && (
                    <div className="flex flex-nowrap items-center justify-end gap-1 border-t px-3 py-2 sm:gap-2 sm:px-6 sm:pb-4">
                        {canDelete && onDelete && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 shrink-0 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                                onClick={() => onDelete(invoice.id)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Xóa
                            </Button>
                        )}
                        {canEdit && invoice.status !== 'cancelled' && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 shrink-0 gap-1 border-red-200 px-2 text-xs text-red-600 hover:bg-red-50"
                                    onClick={() => setShowCancelDialog(true)}
                                >
                                    <XCircle className="h-3.5 w-3.5" />
                                    {invoice.status === 'paid' ? 'Hủy bỏ' : 'Hủy'}
                                </Button>
                                {invoice.status !== 'paid' && (
                                    <Button
                                        size="sm"
                                        className="h-7 shrink-0 gap-1 bg-green-600 px-2 text-xs hover:bg-green-700"
                                        onClick={() => {
                                            onPayButtonClick?.(invoice);
                                            onClose();
                                        }}
                                    >
                                        <CheckCircle className="h-3.5 w-3.5" />
                                        Thanh toán
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </DialogContent>

            <CancelInvoiceDialog
                open={showCancelDialog}
                invoiceCode={invoice.invoice_code}
                hasPayments={hasRelatedPayments}
                onClose={() => setShowCancelDialog(false)}
                onConfirm={async (cancelRelatedPayments) => {
                    await onStatusChange?.(invoice.id, 'cancelled', {
                        cancel_related_payments: cancelRelatedPayments,
                    });
                    onClose();
                }}
            />
        </Dialog>
    );
}
