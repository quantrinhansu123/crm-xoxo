import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar,
    ClipboardList,
    Eye,
    EyeOff,
    FileText,
    List,
    Pencil,
    Printer,
    Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Order, OrderItem } from '@/hooks/useOrders';
import { columns } from '@/components/orders/constants';
import { MobileProductPhotos } from './MobileProductPhotos';

interface OrderDetailMobileDetailProps {
    order: Order;
    canEdit: boolean;
    hasPendingEditApproval?: boolean;
    onShowPrintDialog: () => void;
    onShowInvoicePrintDialog: () => void;
    onShowPaymentDialog: () => void;
    onReload: () => void;
    onEditOrder?: () => void;
}

function MobileCard({
    icon: Icon,
    title,
    children,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Card className="w-full min-w-0 overflow-hidden border-0 shadow-sm">
            <CardHeader className="space-y-0 px-3 pb-2 pt-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white shadow-sm">
                        <Icon className="h-3.5 w-3.5 text-slate-600" />
                    </span>
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">{children}</CardContent>
        </Card>
    );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className="mt-1 text-sm font-medium leading-snug">{children}</div>
        </div>
    );
}

function formatShortDateTime(date: string) {
    const d = new Date(date);
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const day = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    return `${time} · ${day}`;
}

function shortenName(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 3) {
        return `${parts[0]} ${parts[1].charAt(0)}. ${parts[parts.length - 1]}`;
    }
    if (parts.length === 2) {
        return `${parts[0]} ${parts[1].charAt(0)}.`;
    }
    return name;
}

function buildItemGroups(items: OrderItem[]) {
    type ItemGroup = { product: OrderItem | null; services: OrderItem[] };
    const groups: ItemGroup[] = [];
    let i = 0;
    while (i < items.length) {
        const item = items[i] as OrderItem & { is_customer_item?: boolean };
        if (item.is_customer_item && item.item_type === 'product') {
            const services: OrderItem[] = [];
            let j = i + 1;
            while (j < items.length) {
                const next = items[j] as OrderItem & { is_customer_item?: boolean };
                if (next.is_customer_item && next.item_type === 'product') break;
                services.push(items[j]);
                j++;
            }
            groups.push({ product: item, services });
            i = j;
        } else {
            groups.push({ product: null, services: [item] });
            i++;
        }
    }
    return groups;
}

function ProductLine({
    name,
    quantity,
    dotColor,
    dueAt,
    conditionBefore,
    showProductMeta = false,
    indent = false,
}: {
    name: string;
    quantity: number;
    dotColor: 'blue' | 'purple';
    dueAt?: string;
    conditionBefore?: string;
    showProductMeta?: boolean;
    indent?: boolean;
}) {
    const isProduct = showProductMeta;

    return (
        <div
            className={cn(
                'flex gap-2 py-1.5 first:pt-0 last:pb-0',
                isProduct
                    ? 'border-b border-blue-100/80 bg-gradient-to-br from-blue-50/80 to-white px-2 py-2'
                    : 'border-t border-slate-100',
                indent && 'ml-2 border-t-0 rounded-md bg-purple-50/40 px-2 py-1.5',
            )}
        >
            <span
                className={cn(
                    'mt-1 h-2 w-2 shrink-0 rounded-full ring-2',
                    dotColor === 'blue' ? 'bg-blue-600' : 'bg-purple-600',
                    dotColor === 'blue' ? 'ring-blue-100' : 'ring-purple-100',
                )}
            />
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                        {isProduct && (
                            <Badge className="mb-0.5 h-4 rounded-full bg-blue-600 px-1.5 text-[9px] font-semibold text-white hover:bg-blue-600">
                                SP
                            </Badge>
                        )}
                        <p
                            className={cn(
                                'line-clamp-2 leading-tight text-slate-900',
                                isProduct ? 'text-[13px] font-bold' : 'text-[11px] font-semibold',
                            )}
                        >
                            {name}
                        </p>
                    </div>
                    <span
                        className={cn(
                            'shrink-0 rounded px-1.5 py-0 text-[10px] font-semibold tabular-nums',
                            isProduct ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700',
                        )}
                    >
                        ×{quantity}
                    </span>
                </div>
                {showProductMeta && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight text-blue-700">
                        <Calendar className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">
                            Hạn: {dueAt ? new Date(dueAt).toLocaleDateString('vi-VN') : '—'}
                            {conditionBefore ? ` · ${conditionBefore}` : ''}
                        </span>
                    </p>
                )}
            </div>
        </div>
    );
}

export function OrderDetailMobileDetail({
    order,
    canEdit,
    hasPendingEditApproval = false,
    onShowPrintDialog,
    onShowInvoicePrintDialog,
    onReload,
    onEditOrder,
}: OrderDetailMobileDetailProps) {
    const navigate = useNavigate();
    const [showOrderMeta, setShowOrderMeta] = useState(false);
    const statusTitle = columns.find((c) => c.id === order.status)?.title || order.status;
    const statusColumn = columns.find((c) => c.id === order.status);
    const groups = order.items?.length ? buildItemGroups(order.items) : [];

    const canEditOrder =
        canEdit && order.status !== 'after_sale' && order.status !== 'cancelled' && !hasPendingEditApproval;
    const canEditPhotos = canEdit && order.status !== 'cancelled';

    return (
        <div className="w-full min-w-0 max-w-full space-y-2">
            <div className="grid min-w-0 grid-cols-3 gap-1">
                <button
                    type="button"
                    onClick={onShowPrintDialog}
                    className="flex flex-col items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-0.5 py-1.5 active:scale-[0.98]"
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                        <Printer className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-center text-[9px] font-medium leading-tight text-blue-900">
                        In QR
                    </span>
                </button>
                <button
                    type="button"
                    onClick={onShowInvoicePrintDialog}
                    className="flex flex-col items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 px-0.5 py-1.5 active:scale-[0.98]"
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                        <FileText className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-center text-[9px] font-medium leading-tight text-amber-900">
                        In HĐ
                    </span>
                </button>
                <button
                    type="button"
                    disabled={!canEditOrder}
                    onClick={() => {
                        if (!canEditOrder) return;
                        if (onEditOrder) {
                            onEditOrder();
                            return;
                        }
                        navigate(`/orders/${order.id}/edit`);
                    }}
                    className={cn(
                        'flex flex-col items-center gap-1 rounded-lg border px-0.5 py-1.5 active:scale-[0.98]',
                        canEditOrder
                            ? 'border-violet-100 bg-violet-50'
                            : 'border-muted bg-muted/50 opacity-50',
                    )}
                >
                    <span
                        className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-md',
                            canEditOrder ? 'bg-violet-100 text-violet-700' : 'bg-muted text-muted-foreground',
                        )}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </span>
                    <span
                        className={cn(
                            'text-center text-[9px] font-medium leading-tight',
                            canEditOrder ? 'text-violet-900' : 'text-muted-foreground',
                        )}
                    >
                        {hasPendingEditApproval ? 'Chờ duyệt' : 'Sửa đơn'}
                    </span>
                </button>
            </div>

            {hasPendingEditApproval && (
                <MobileCard icon={Receipt} title="Trạng thái duyệt sửa">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        Đơn hàng đang chờ admin/quản lý duyệt yêu cầu sửa.
                    </div>
                </MobileCard>
            )}

            <Card className="w-full min-w-0 overflow-hidden border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 py-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white shadow-sm">
                            <List className="h-3.5 w-3.5 text-slate-600" />
                        </span>
                        Chi tiết đơn hàng
                    </CardTitle>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-slate-500"
                        onClick={() => setShowOrderMeta((v) => !v)}
                        aria-label={showOrderMeta ? 'Thu gọn chi tiết' : 'Xem chi tiết đơn'}
                    >
                        {showOrderMeta ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3 pt-0">
                    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-slate-50/90 px-2.5 py-2">
                        <Badge
                            variant="outline"
                            className={cn(
                                'shrink-0 border-0 text-[10px] font-medium',
                                statusColumn?.bgColor,
                                statusColumn?.color,
                            )}
                        >
                            {statusTitle}
                        </Badge>
                        <span className="min-w-0 truncate text-[11px] font-medium text-slate-600">
                            {shortenName(order.sales_user?.name || 'N/A')}
                        </span>
                    </div>

                    {showOrderMeta && (
                        <div className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2">
                            <MetaCell label="Ngày tạo">
                                {order.created_at ? formatShortDateTime(order.created_at) : '—'}
                            </MetaCell>
                            <MetaCell label="Hoàn thành">
                                {order.completed_at ? formatShortDateTime(order.completed_at) : 'Chưa xong'}
                            </MetaCell>
                            <MetaCell label="Phụ trách">
                                {order.sales_user?.name || 'N/A'}
                            </MetaCell>
                            <MetaCell label="Mã đơn">
                                <span className="font-mono text-xs">{order.order_code}</span>
                            </MetaCell>
                        </div>
                    )}

                {groups.length > 0 && (
                    <div className="space-y-2">
                        {groups.map((group, gi) => {
                            if (group.product) {
                                const product = group.product;
                                const isCustomerProduct = !!(product as OrderItem & { is_customer_item?: boolean })
                                    .is_customer_item;
                                return (
                                    <div
                                        key={gi}
                                        className="overflow-hidden rounded-lg border border-slate-200/90 bg-white"
                                    >
                                        <ProductLine
                                            name={product.item_name}
                                            quantity={product.quantity}
                                            dotColor="blue"
                                            dueAt={(product as any).due_at}
                                            conditionBefore={
                                                (product as any).condition_before ||
                                                (product as any).product_condition_before
                                            }
                                            showProductMeta
                                        />
                                        {isCustomerProduct && (
                                            <div className="px-2 pb-2">
                                                <MobileProductPhotos
                                                    item={product}
                                                    canEdit={canEditPhotos}
                                                    onUpdated={onReload}
                                                />
                                            </div>
                                        )}
                                        {group.services.length > 0 && (
                                            <div className="border-t border-slate-100 bg-slate-50/60 px-2 py-1.5">
                                                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                                                    DV kèm ({group.services.length})
                                                </p>
                                                <div className="space-y-0.5">
                                                    {group.services.map((svc, si) => (
                                                        <ProductLine
                                                            key={si}
                                                            name={svc.item_name}
                                                            quantity={svc.quantity}
                                                            dotColor="purple"
                                                            indent
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            const item = group.services[0];
                            return (
                                <ProductLine
                                    key={gi}
                                    name={item.item_name}
                                    quantity={item.quantity}
                                    dotColor={item.item_type === 'product' ? 'blue' : 'purple'}
                                    dueAt={(item as any).due_at}
                                    conditionBefore={(item as any).condition_before || (item as any).product_condition_before}
                                    showProductMeta={item.item_type === 'product'}
                                />
                            );
                        })}
                    </div>
                )}
                </CardContent>
            </Card>

            {order.notes && (
                <MobileCard icon={ClipboardList} title="Ghi chú">
                    <p className="text-sm leading-relaxed text-muted-foreground">{order.notes}</p>
                </MobileCard>
            )}
        </div>
    );
}
