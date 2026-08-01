import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Package, Gift, ShoppingBag, CreditCard, Printer,
    Wrench, User as UserIcon, FileText, Clock, CheckCircle,
    Sparkles, X, Calendar, Pencil, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { orderProductsApi } from '@/lib/api';
import { ProductStatusCard } from '@/components/orders/ProductStatusCard';
import { columns } from '@/components/orders/constants';
import type { Order, OrderItem } from '@/hooks/useOrders';
import {
    getItemTypeLabel,
    getItemTypeColor,
    getCustomerProductTypeLabel,
    getStatusVariant,
    getProductItemNotes,
} from '../utils';
import { CustomerPhone } from '@/components/customers/CustomerPhone';
import { OrderDetailMobileDetail } from '../components/OrderDetailMobileDetail';
import { OrderItemPhotos, isCustomerProductItem } from '../components/OrderItemPhotos';

interface DetailTabProps {
    order: Order;
    productStatusSummary: any;
    isPhoneView?: boolean;
    canEdit?: boolean;
    hasPendingEditApproval?: boolean;
    onReload?: () => void;
    onShowPrintDialog: () => void;
    onShowInvoicePrintDialog: () => void;
    onShowPaymentDialog: () => void;
    onEditOrder?: () => void;
}

export function DetailTab({
    order,
    productStatusSummary,
    isPhoneView = false,
    canEdit = true,
    hasPendingEditApproval = false,
    onReload,
    onShowPrintDialog,
    onShowInvoicePrintDialog,
    onShowPaymentDialog,
    onEditOrder,
}: DetailTabProps) {
    const navigate = useNavigate();
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const canEditPhotos = canEdit && order.status !== 'cancelled';
    const customerProductsWithNotes = (order.items || []).filter(
        (item) => item.item_type === 'product' && item.is_customer_item && getProductItemNotes(item),
    );

    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    const openNoteEditor = (item: OrderItem) => {
        setEditingNoteId(item.id);
        setNoteDraft(getProductItemNotes(item));
    };

    const cancelNoteEdit = () => {
        setEditingNoteId(null);
        setNoteDraft('');
    };

    const saveNote = async (item: OrderItem) => {
        setSavingNote(true);
        try {
            if (item.item_type === 'product') {
                await orderProductsApi.update(item.id, { notes: noteDraft });
            } else {
                await orderProductsApi.updateServiceNotes(item.id, noteDraft);
            }
            toast.success('Đã lưu ghi chú');
            setEditingNoteId(null);
            setNoteDraft('');
            onReload?.();
        } catch {
            toast.error('Không thể lưu ghi chú');
        } finally {
            setSavingNote(false);
        }
    };

    const renderItemNote = (item: OrderItem) => {
        if (editingNoteId === item.id) {
            return (
                <div className="flex flex-col gap-1.5">
                    <Textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Nhập ghi chú..."
                        className="min-h-[60px] text-sm"
                        autoFocus
                    />
                    <div className="flex items-center gap-1.5">
                        <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            disabled={savingNote}
                            onClick={() => saveNote(item)}
                        >
                            {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Lưu'}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            disabled={savingNote}
                            onClick={cancelNoteEdit}
                        >
                            Hủy
                        </Button>
                    </div>
                </div>
            );
        }

        const noteText = getProductItemNotes(item);
        if (noteText) {
            return (
                <div className="group flex items-start gap-1.5 text-sm text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/60" />
                    <span className="italic leading-relaxed whitespace-pre-wrap">{noteText}</span>
                    {canEditPhotos && (
                        <button
                            type="button"
                            onClick={() => openNoteEditor(item)}
                            className="shrink-0 opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                            title="Sửa ghi chú"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            );
        }

        if (!canEditPhotos) return null;
        return (
            <button
                type="button"
                onClick={() => openNoteEditor(item)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
            >
                <Pencil className="h-3.5 w-3.5" /> Thêm ghi chú
            </button>
        );
    };

    return (
        <TabsContent value="detail" className="mt-0 min-w-0 max-w-full px-3 pb-4 pt-3 md:px-0 md:pb-0 md:pt-4">
            {isPhoneView && (
                <OrderDetailMobileDetail
                    order={order}
                    canEdit={canEdit}
                    hasPendingEditApproval={hasPendingEditApproval}
                    onReload={() => onReload?.()}
                    onShowPrintDialog={onShowPrintDialog}
                    onShowInvoicePrintDialog={onShowInvoicePrintDialog}
                    onShowPaymentDialog={onShowPaymentDialog}
                    onEditOrder={onEditOrder}
                />
            )}

            <div
                className={cn(
                    'grid grid-cols-1 gap-4 md:gap-6',
                    isPhoneView ? 'hidden md:grid' : 'lg:grid-cols-3',
                )}
            >
                {/* Left Column - Order Items (2/3) */}
                <div className={cn('space-y-4 md:space-y-6', !isPhoneView && 'lg:col-span-2')}>
                    {/* Customer Info */}
                    <Card>
                        <CardHeader className="pb-3 md:pb-4">
                            <CardTitle className="text-base md:text-lg font-bold flex items-center gap-2">
                                <UserIcon className="h-5 w-5 text-primary" />
                                Thông tin khách hàng
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 md:pt-6">
                            <div className="flex items-center gap-3 md:gap-4">
                                <Avatar className={cn(isPhoneView ? 'h-10 w-10' : 'h-14 w-14')}>
                                    <AvatarFallback className="bg-primary text-white text-lg">
                                        {order.customer?.name?.charAt(0) || 'C'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <p className="font-bold text-xl">{order.customer?.name || 'N/A'}</p>
                                    <p className="text-muted-foreground text-base">
                                        <CustomerPhone phone={order.customer?.phone} />
                                    </p>
                                </div>
                                {order.customer && (
                                    <Button variant="outline" size="sm" onClick={() => navigate(`/customers?id=${order.customer?.id}`)}>
                                        Xem hồ sơ
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Items Table */}
                    {order.items && order.items.length > 0 && (() => {
                        type ItemGroup = { product: OrderItem | null; services: OrderItem[] };
                        const groups: ItemGroup[] = [];
                        let i = 0;
                        while (i < order.items!.length) {
                            const item = order.items![i] as OrderItem & { is_customer_item?: boolean };
                            if (item.is_customer_item && item.item_type === 'product') {
                                const services: OrderItem[] = [];
                                let j = i + 1;
                                while (j < order.items!.length) {
                                    const next = order.items![j] as OrderItem & { is_customer_item?: boolean };
                                    if (next.is_customer_item && next.item_type === 'product') break;
                                    services.push(order.items![j]);
                                    j++;
                                }
                                groups.push({ product: item, services });
                                i = j;
                            } else {
                                groups.push({ product: null, services: [item] });
                                i++;
                            }
                        }
                        if (groups.length === 0) return null;
                        return (
                            <Card>
                                <CardHeader className="pb-4">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                                            <Package className="h-5 w-5 text-primary" />
                                            Chi tiết sản phẩm/dịch vụ
                                        </CardTitle>
                                        <span className="text-sm font-semibold text-muted-foreground">
                                            {order.items!.length} mục
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {isPhoneView && (
                                        <div className="space-y-3 p-4 md:hidden">
                                            {order.items!.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="rounded-lg border bg-muted/20 p-3.5"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="text-base font-bold leading-tight">{item.item_name}</p>
                                                        <Badge className={cn('shrink-0 text-xs', getItemTypeColor(item.item_type))}>
                                                            {getItemTypeLabel(item.item_type)}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                                                        <span>SL: {item.quantity}</span>
                                                        <span className="font-semibold text-foreground">
                                                            {formatCurrency((item.total_price || 0) + (item.surcharge_amount || 0))}
                                                        </span>
                                                    </div>
                                                    {(((item as any).due_at) || ((item as any).condition_before) || ((item as any).product_condition_before)) && (
                                                        <div className="mt-1.5 space-y-1">
                                                            {(item as any).due_at && (
                                                                <div className="flex items-center gap-1 text-xs text-blue-700 font-medium">
                                                                    <Calendar className="h-4 w-4 shrink-0" />
                                                                    <span>Hạn trả đồ: {formatDateTime((item as any).due_at)}</span>
                                                                </div>
                                                            )}
                                                            {((item as any).condition_before || (item as any).product_condition_before) && (
                                                                <div className="flex items-start gap-1 text-sm text-muted-foreground font-medium">
                                                                    <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                                                                    <span className="leading-tight">
                                                                        Tình trạng ban đầu: {(item as any).condition_before || (item as any).product_condition_before}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="hidden overflow-x-auto md:block">
                                        <table className="w-full text-sm table-fixed">
                                            <thead className="bg-muted/40">
                                                <tr className="border-b">
                                                    <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground w-[112px] min-w-[112px]">Ảnh</th>
                                                    <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground">Loại</th>
                                                    <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground">Tên</th>
                                                    <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground w-[150px]">Tình trạng</th>
                                                    <th className="text-left px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground w-[150px]">Ghi chú</th>
                                                    <th className="text-center px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground w-14">SL</th>
                                                    <th className="text-right px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground">Đơn giá</th>
                                                    <th className="text-right px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground">Thành tiền</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/70">
                                                {groups.map((group, gi) => {
                                                    if (group.product) {
                                                        const product = group.product;
                                                        const productSurcharge = (product as any).surcharge_amount || 0;
                                                        const servicesTotal = group.services.reduce((sum, s) => sum + (s.total_price || 0), 0);
                                                        const groupTotal = servicesTotal + productSurcharge;
                                                        return (
                                                            <React.Fragment key={gi}>
                                                                <tr className="bg-primary/[0.04] hover:bg-primary/[0.07] border-l-[3px] border-l-primary transition-colors">
                                                                    <td className="p-4 align-top w-[112px] min-w-[112px]">
                                                                        {isCustomerProductItem(product) ? (
                                                                            <OrderItemPhotos
                                                                                item={product}
                                                                                canEdit={canEditPhotos}
                                                                                onUpdated={() => onReload?.()}
                                                                                variant="table"
                                                                            />
                                                                        ) : (product.product?.image || (product as any).product?.image) ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setImagePreviewUrl((product.product?.image || (product as any).product?.image) as string)}
                                                                                className="w-14 h-14 shrink-0 rounded-xl overflow-hidden border-2 border-primary/10 bg-muted flex items-center justify-center shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                                                                            >
                                                                                <img src={(product.product?.image || (product as any).product?.image) as string} alt={product.item_name} className="w-full h-full object-contain" />
                                                                            </button>
                                                                        ) : (
                                                                            <div className="w-14 h-14 shrink-0 rounded-xl border-2 border-primary/10 bg-muted flex items-center justify-center shadow-sm">
                                                                                <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-4 align-top">
                                                                        <Badge className={getItemTypeColor('product')}>
                                                                            {getCustomerProductTypeLabel((product as any).product_type)}
                                                                        </Badge>
                                                                    </td>
                                                                    <td className="p-4 font-semibold align-top">
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            <span className="text-base font-bold text-foreground">{product.item_name}</span>
                                                                        </div>
                                                                        {/* Per-product due date */}
                                                                        {(product as any).due_at && (
                                                                            <div className="mt-1">
                                                                                <Badge variant="outline" className="text-xs py-1 px-2 h-auto bg-blue-50 text-blue-700 border-blue-200 gap-1 font-medium">
                                                                                    <Calendar className="h-2.5 w-2.5" />
                                                                                    Hạn trả: {formatDateTime((product as any).due_at)}
                                                                                </Badge>
                                                                            </div>
                                                                        )}
                                                                        {/* Per-product surcharges */}
                                                                        {(product as any).surcharges && (product as any).surcharges.length > 0 && (
                                                                            <div className="mt-1 space-y-0.5">
                                                                                {(product as any).surcharges.map((s: any, idx: number) => {
                                                                                    const surchargeAmount = s.isPercent
                                                                                        ? Math.round(servicesTotal * (s.value || 0) / 100)
                                                                                        : (s.value || 0);
                                                                                    return (
                                                                                        <div key={idx} className="flex items-center gap-1.5">
                                                                                            <Badge variant="outline" className="text-xs py-1 px-2 h-auto bg-orange-50/80 text-orange-700 border-0 rounded-full font-medium">
                                                                                                +{s.label}{s.isPercent ? ` (${s.value}%)` : ''}: {formatCurrency(surchargeAmount)}
                                                                                            </Badge>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                        {(product as any).sales?.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                                {(product as any).sales.map((s: any, idx: number) => (
                                                                                    <Badge key={idx} variant="outline" className="text-xs py-1 h-6 px-2 bg-amber-50/80 text-amber-700 border-0 rounded-full font-medium">
                                                                                        Sale: {s.sale?.name || s.name} ({s.commission}%)
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-4 align-top">
                                                                        {(product as any).product_condition_before && (
                                                                            <div className="flex items-start gap-1.5 text-sm text-muted-foreground font-medium">
                                                                                <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600/70" />
                                                                                <span className="whitespace-pre-wrap leading-relaxed">
                                                                                    {(product as any).product_condition_before}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-4 align-top">
                                                                        {isCustomerProductItem(product) && renderItemNote(product)}
                                                                    </td>
                                                                    <td className="p-4 text-center align-top tabular-nums font-bold">{product.quantity}</td>
                                                                    <td className="p-4 text-right align-top text-sm italic text-muted-foreground/70">gộp dịch vụ</td>
                                                                    <td className="p-4 text-right font-bold align-top">
                                                                        <div className="text-primary tabular-nums text-lg font-bold">{formatCurrency(groupTotal)}</div>
                                                                        {productSurcharge > 0 && (
                                                                            <div className="text-xs text-orange-600 font-normal mt-0.5 tabular-nums">
                                                                                (phụ phí: +{formatCurrency(productSurcharge)})
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                                {group.services.map((svc, si) => (
                                                                    <tr key={`${gi}-s-${si}`} className="hover:bg-muted/30 transition-colors">
                                                                        <td className="py-3 pl-8 pr-4 w-[72px] border-l-2 border-border/60">
                                                                            {(svc.service?.image || svc.product?.image || (svc as any).product?.image) ? (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setImagePreviewUrl((svc.service?.image || svc.product?.image || (svc as any).product?.image) as string)}
                                                                                    className="w-9 h-9 shrink-0 rounded-lg overflow-hidden border bg-muted flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                                                                                >
                                                                                    <img src={(svc.service?.image || svc.product?.image || (svc as any).product?.image) as string} alt={svc.item_name} className="w-full h-full object-contain" />
                                                                                </button>
                                                                            ) : (
                                                                                <div className="w-9 h-9 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                                                                                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="py-3 pl-4 pr-4">
                                                                            <Badge className={getItemTypeColor(svc.item_type)}>
                                                                                {getItemTypeLabel(svc.item_type)}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="py-3 pl-4 pr-4 text-foreground">
                                                                            <div className="text-base font-semibold">{svc.item_name}</div>
                                                                            {svc.surcharges && svc.surcharges.length > 0 && (
                                                                                <div className="flex flex-wrap gap-1 mt-1">
                                                                                    {svc.surcharges.map((s: any, idx: number) => (
                                                                                        <Badge key={idx} variant="outline" className="text-[11px] py-0 h-5 px-2 bg-orange-50/80 text-orange-700 border-0 rounded-full font-medium">
                                                                                            +{s.label}: {s.isPercent ? `${s.value}%` : formatCurrency(s.value)}
                                                                                        </Badge>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                            {((svc as any).technicians?.length > 0 || (svc as any).technician) && (
                                                                                <div className="flex flex-wrap gap-1 mt-1">
                                                                                    {(svc as any).technicians?.length > 0 ? (svc as any).technicians.map((t: any, idx: number) => (
                                                                                        <Badge key={idx} variant="outline" className="text-[11px] py-0 h-5 px-2 bg-blue-50/80 text-blue-700 border-0 rounded-full font-medium">
                                                                                            KT: {t.technician?.name || t.name} ({t.commission}%)
                                                                                        </Badge>
                                                                                    )) : (svc as any).technician && (
                                                                                        <Badge variant="outline" className="text-[11px] py-0 h-5 px-2 bg-blue-50/80 text-blue-700 border-0 rounded-full font-medium">
                                                                                            KT: {(svc as any).technician.name} ({(svc as any).commission || 0}%)
                                                                                        </Badge>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                            {(svc as any).sales?.length > 0 && (
                                                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                                                    {(svc as any).sales.map((s: any, idx: number) => (
                                                                                        <Badge key={idx} variant="outline" className="text-xs py-1 h-6 px-2 bg-amber-50/80 text-amber-700 border-0 rounded-full font-medium">
                                                                                            Sale: {s.sale?.name || s.name} ({s.commission}%)
                                                                                        </Badge>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="py-2 pl-2 pr-3 align-top" />
                                                                        <td className="py-2 pl-2 pr-3 align-top">{renderItemNote(svc)}</td>
                                                                        <td className="py-2 pl-2 pr-3 text-center tabular-nums">{svc.quantity}</td>
                                                                        <td className="py-2 pl-2 pr-3 text-right text-muted-foreground tabular-nums">{formatCurrency(svc.unit_price)}</td>
                                                                        <td className="py-2 pl-2 pr-3 text-right font-semibold tabular-nums">{formatCurrency((svc.total_price || 0) + (svc.surcharge_amount || 0))}</td>
                                                                    </tr>
                                                                ))}
                                                            </React.Fragment>
                                                        );
                                                    }
                                                    const item = group.services[0];
                                                    return (
                                                        <tr key={gi} className="hover:bg-muted/30 transition-colors">
                                                            <td className="p-3 w-[112px] min-w-[112px] align-top">
                                                                {isCustomerProductItem(item) ? (
                                                                    <OrderItemPhotos
                                                                        item={item}
                                                                        canEdit={canEditPhotos}
                                                                        onUpdated={() => onReload?.()}
                                                                        variant="table"
                                                                    />
                                                                ) : (item.product?.image || item.service?.image) ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setImagePreviewUrl((item.product?.image || item.service?.image) as string)}
                                                                        className="w-12 h-12 shrink-0 rounded-xl overflow-hidden border bg-muted flex items-center justify-center shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                                                                    >
                                                                        <img src={item.product?.image || item.service?.image as string} alt={item.item_name} className="w-full h-full object-contain" />
                                                                    </button>
                                                                ) : (
                                                                    <div className="w-12 h-12 shrink-0 rounded-xl bg-muted flex items-center justify-center shadow-sm">
                                                                        {item.item_type === 'product' ? <ShoppingBag className="h-5 w-5 text-muted-foreground" /> :
                                                                            item.item_type === 'service' ? <Wrench className="h-5 w-5 text-muted-foreground" /> :
                                                                                item.item_type === 'package' ? <Gift className="h-5 w-5 text-muted-foreground" /> :
                                                                                    <CreditCard className="h-5 w-5 text-muted-foreground" />}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="p-3">
                                                                <Badge className={getItemTypeColor(item.item_type)}>
                                                                    {getItemTypeLabel(item.item_type)}
                                                                </Badge>
                                                            </td>
                                                            <td className="p-3 font-semibold">
                                                                <div className="text-base text-foreground">{item.item_name}</div>
                                                                {((item as any).technicians?.length > 0 || (item as any).technician) && (
                                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                                        {(item as any).technicians?.length > 0 ? (item as any).technicians.map((t: any, idx: number) => (
                                                                            <Badge key={idx} variant="outline" className="text-[11px] py-0 h-5 px-2 bg-blue-50/80 text-blue-700 border-0 rounded-full font-medium">
                                                                                KT: {t.technician?.name || t.name} ({t.commission}%)
                                                                            </Badge>
                                                                        )) : (item as any).technician && (
                                                                            <Badge variant="outline" className="text-[11px] py-0 h-5 px-2 bg-blue-50/80 text-blue-700 border-0 rounded-full font-medium">
                                                                                KT: {(item as any).technician.name} ({(item as any).commission || 0}%)
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {(item as any).sales?.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                                                        {(item as any).sales.map((s: any, idx: number) => (
                                                                            <Badge key={idx} variant="outline" className="text-xs py-1 h-6 px-2 bg-amber-50/80 text-amber-700 border-0 rounded-full font-medium">
                                                                                Sale: {s.sale?.name || s.name} ({s.commission}%)
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {item.surcharges && item.surcharges.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                                        {item.surcharges.map((s: any, idx: number) => (
                                                                            <Badge key={idx} variant="outline" className="text-[11px] py-0 h-5 px-2 bg-orange-50/80 text-orange-700 border-0 rounded-full font-medium">
                                                                                +{s.label}: {s.isPercent ? `${s.value}%` : formatCurrency(s.value)}
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="p-3 align-top" />
                                                            <td className="p-3 align-top">
                                                                {(item as any).is_customer_item && renderItemNote(item)}
                                                            </td>
                                                            <td className="p-3 text-center tabular-nums font-medium">{item.quantity}</td>
                                                            <td className="p-3 text-right text-muted-foreground tabular-nums">{formatCurrency(item.unit_price)}</td>
                                                            <td className="p-3 text-right font-bold text-primary tabular-nums text-base">{formatCurrency((item.total_price || 0) + (item.surcharge_amount || 0))}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })()}

                    {/* Dialog xem ảnh sản phẩm/dịch vụ */}
                    <Dialog open={!!imagePreviewUrl} onOpenChange={(open) => !open && setImagePreviewUrl(null)}>
                        <DialogContent className="max-w-4xl p-0 overflow-hidden">
                            <div className="relative">
                                {imagePreviewUrl && (
                                    <img src={imagePreviewUrl} alt="Xem ảnh" className="w-full h-auto max-h-[85vh] object-contain" />
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 rounded-full bg-black/50 hover:bg-black/70 text-white"
                                    onClick={() => setImagePreviewUrl(null)}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Product notes */}
                    {customerProductsWithNotes.length > 0 && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-primary" />
                                    Ghi chú sản phẩm
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {customerProductsWithNotes.map((item) => (
                                    <div key={item.id} className="rounded-lg bg-muted/50 p-4">
                                        <p className="text-xs font-semibold text-foreground mb-1">{item.item_name}</p>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap italic">
                                            {getProductItemNotes(item)}
                                        </p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    {/* Order notes */}
                    {order.notes && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-primary" />
                                    Ghi chú đơn hàng
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm bg-muted/50 p-4 rounded-lg whitespace-pre-wrap">{order.notes}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Right Column - Summary (1/3) */}
                <div className={cn('space-y-3 md:space-y-4', !isPhoneView && 'lg:col-span-1')}>
                    {/* Order Summary */}
                    <Card className="border-primary/20">
                        <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10">
                            <CardTitle className="text-base">Tổng đơn hàng</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-4">
                            <div className="flex justify-between text-sm">
                                <span>Tạm tính:</span>
                                <span className="font-medium">{formatCurrency(order.subtotal)}</span>
                            </div>
                            {order.discount > 0 && (
                                <div className="flex justify-between text-sm text-red-600">
                                    <span className="flex items-center gap-1">
                                        <Gift className="h-3.5 w-3.5" />
                                        Giảm giá{order.discount_type === 'percent' && order.discount_value ? ` (${order.discount_value}%)` : ''}:
                                    </span>
                                    <span className="font-medium">-{formatCurrency(order.discount)}</span>
                                </div>
                            )}
                            {/* Surcharges */}
                            {order.surcharges && Array.isArray(order.surcharges) && order.surcharges.length > 0 && (
                                <>
                                    {order.surcharges.map((surcharge: any, i: number) => (
                                        <div key={i} className="flex justify-between text-sm text-orange-600">
                                            <span className="flex items-center gap-1">
                                                {surcharge.label}{surcharge.is_percent ? ` (${surcharge.value}%)` : ''}:
                                            </span>
                                            <span className="font-medium">+{formatCurrency(surcharge.amount || 0)}</span>
                                        </div>
                                    ))}
                                </>
                            )}
                            {(order.surcharges_amount ?? 0) > 0 && (
                                <div className="flex justify-between text-sm text-orange-600 pt-1 border-t border-dashed">
                                    <span>Tổng phụ phí:</span>
                                    <span className="font-medium">+{formatCurrency(order.surcharges_amount ?? 0)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-xl font-bold pt-3 border-t">
                                <span>Tổng:</span>
                                <span className="text-primary">{formatCurrency(order.total_amount)}</span>
                            </div>

                            {/* Payment Info */}
                            <div className="pt-3 border-t space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>Đã thanh toán:</span>
                                    <span className={`font-medium ${(order.paid_amount || 0) >= order.total_amount ? 'text-green-600' : 'text-blue-600'}`}>
                                        {formatCurrency(order.paid_amount || 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span>Còn nợ:</span>
                                    <span className={`font-medium ${(order.remaining_debt || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {formatCurrency(order.remaining_debt || (order.total_amount - (order.paid_amount || 0)))}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span>Trạng thái TT:</span>
                                    <Badge
                                        className={
                                            order.payment_status === 'paid' ? 'bg-green-500' :
                                                order.payment_status === 'partial' ? 'bg-yellow-500' :
                                                    'bg-red-500'
                                        }
                                    >
                                        {order.payment_status === 'paid' ? 'Đã thanh toán' :
                                            order.payment_status === 'partial' ? 'Thanh toán một phần' :
                                                'Chưa thanh toán'}
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Order Status */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-primary" />
                                Trạng thái
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-center py-4">
                                <Badge
                                    variant={getStatusVariant(order.status) as 'success' | 'danger' | 'warning' | 'info' | 'purple'}
                                    className="text-base px-4 py-2"
                                >
                                    {columns.find(c => c.id === order.status)?.title}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Order Details */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-primary" />
                                Thông tin đơn hàng
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ngày tạo</p>
                                <p className="font-medium flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    {formatDateTime(order.created_at)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Hoàn thành</p>
                                <p className="font-medium">
                                    {order.completed_at ? formatDateTime(order.completed_at) : 'Chưa hoàn thành'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Nhân viên phụ trách</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="text-xs">{order.sales_user?.name?.charAt(0) || 'N'}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{order.sales_user?.name || 'N/A'}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Product Status Summary for Customer Items */}
                    {productStatusSummary && (
                        <>
                            <ProductStatusCard
                                completionPercentage={productStatusSummary.completion_percentage || 0}
                                overallStatus={productStatusSummary.overall_status || 'pending'}
                                totalSteps={productStatusSummary.total_steps || 0}
                                completedSteps={productStatusSummary.completed_steps || 0}
                                totalDurationMinutes={productStatusSummary.total_duration_minutes}
                                estimatedDurationMinutes={productStatusSummary.estimated_duration_minutes}
                                earliestStartedAt={productStatusSummary.earliest_started_at}
                                latestCompletedAt={productStatusSummary.latest_completed_at}
                            />
                        </>
                    )}

                    {/* Quick Actions */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Thao tác nhanh</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {hasPendingEditApproval && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                    Đơn hàng đang chờ quản lý/admin duyệt yêu cầu sửa.
                                </div>
                            )}
                            <Button
                                variant="outline"
                                className="w-full justify-start"
                                onClick={onShowPrintDialog}
                            >
                                <Printer className="h-4 w-4 mr-2" />
                                In phiếu QR
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full justify-start"
                                onClick={onShowInvoicePrintDialog}
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                In hóa đơn
                            </Button>
                            {order.status !== 'after_sale' && order.status !== 'cancelled' && (
                                <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    disabled={hasPendingEditApproval}
                                    onClick={() => {
                                        if (onEditOrder) {
                                            onEditOrder();
                                            return;
                                        }
                                        navigate(`/orders/${order.id}/edit`);
                                    }}
                                >
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    {hasPendingEditApproval ? 'Đang chờ duyệt sửa đơn' : 'Chỉnh sửa đơn hàng'}
                                </Button>
                            )}
                            {order.status === 'in_progress' && (
                                <Button
                                    className="w-full justify-start bg-green-600 hover:bg-green-700"
                                    onClick={onShowPaymentDialog}
                                >
                                    <CreditCard className="h-4 w-4 mr-2" />
                                    Thanh toán ngay
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

        </TabsContent>
    );
}
