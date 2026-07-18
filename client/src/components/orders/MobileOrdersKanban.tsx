import React from 'react';
import type { DropResult } from '@hello-pangea/dnd';
import {
    Calendar,
    CheckCircle2,
    Circle,
    Eye,
    Pencil,
    Trash2,
    User,
    Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, formatDate } from '@/lib/utils';
import type { KanbanColumn } from './constants';
import type { Order, OrderItem } from '@/hooks/useOrders';
import { MobileKanbanMoveBar, type MobileKanbanColumn } from '@/components/kanban/mobileKanban';

interface ProductGroup {
    product: OrderItem | null;
    services: OrderItem[];
}

interface MobileOrdersKanbanProps {
    columns: KanbanColumn[];
    getCardsByStatus: (status: string) => Array<{ order: Order; group: ProductGroup; groupIndex: number }>;
    activeColumnIndex?: number;
    onActiveColumnChange?: (index: number) => void;
    onCardClick: (order: Order, group: ProductGroup) => void;
    onViewOrder: (order: Order, group: ProductGroup) => void;
    onEditOrder?: (order: Order) => void;
    onMarkDone?: (order: Order, group: ProductGroup) => void;
    onDeleteOrder?: (order: Order) => void;
    onStatusMove?: (result: DropResult) => void;
}

const TAB_SHORT_LABELS: Record<string, string> = {
    before_sale: 'Before Sale',
    in_progress: 'Đang TH',
    done: 'Đã HT',
    after_sale: 'After',
    archived: 'Lưu trữ',
    cancelled: 'Hủy',
};

const DONE_HIDDEN_COLUMNS = new Set(['done', 'after_sale', 'archived', 'cancelled']);

function getTechnicianNames(services: OrderItem[]) {
    const names = new Set<string>();
    for (const service of services) {
        if (service.technicians?.length) {
            for (const tech of service.technicians) {
                if (tech.technician?.name) names.add(tech.technician.name);
            }
        } else if (service.technician?.name) {
            names.add(service.technician.name);
        }
    }
    return [...names].join(', ') || 'N/A';
}

function shortenName(name: string, maxLen = 14) {
    if (name.length <= maxLen) return name;
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        const short = `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
        return short.length <= maxLen ? short : `${parts[0].slice(0, maxLen - 2)}…`;
    }
    return `${name.slice(0, maxLen - 1)}…`;
}

function getDeadlineStatus(dueAt?: string) {
    if (!dueAt) return null;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueAt);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return {
            dateClassName: 'text-red-600 font-semibold',
            badgeClassName: 'bg-red-100 text-red-600 border-red-200',
            label: `Quá ${Math.abs(diffDays)} ngày`,
        };
    }
    if (diffDays === 0) {
        return {
            dateClassName: 'text-red-600 font-semibold',
            badgeClassName: 'bg-red-100 text-red-600 border-red-200',
            label: 'Hôm nay',
        };
    }
    if (diffDays <= 2) {
        return {
            dateClassName: 'text-amber-600 font-semibold',
            badgeClassName: 'bg-amber-100 text-amber-700 border-amber-200',
            label: `Còn ${diffDays} ngày`,
        };
    }
    return {
        dateClassName: 'text-emerald-600 font-semibold',
        badgeClassName: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        label: `Còn ${diffDays} ngày`,
    };
}

function MobileOrderCard({
    order,
    group,
    groupIndex,
    columnId,
    statusColumns,
    onStatusMove,
    onView,
    onEdit,
    onMarkDone,
    onDelete,
}: {
    order: Order;
    group: ProductGroup;
    groupIndex: number;
    columnId: string;
    statusColumns: MobileKanbanColumn[];
    onStatusMove?: (result: DropResult) => void;
    onView: () => void;
    onEdit?: () => void;
    onMarkDone?: () => void;
    onDelete?: () => void;
}) {
    const product = group.product;
    const services = group.services || [];
    const displayName = product?.item_name || services[0]?.item_name || 'N/A';
    const productCode =
        product?.item_code ||
        product?.product?.code ||
        product?.service?.code ||
        services[0]?.item_code ||
        services[0]?.service?.code ||
        order.order_code;

    const productImage =
        product?.product?.image ||
        product?.service?.image ||
        services[0]?.product?.image ||
        services[0]?.service?.image;

    const customerName = order.customer?.name || 'Khách lẻ';
    const customerInitial = customerName.charAt(0).toUpperCase();

    const extraServices = services
        .filter(s => s.item_name && s.item_name !== displayName)
        .map(s => s.item_name.replace(/\s*\(.*?\)\s*/g, ' ').trim());
    const description =
        extraServices.length > 0
            ? `${displayName} (${extraServices.slice(0, 2).join(', ')}${extraServices.length > 2 ? '…' : ''})`
            : displayName;

    const receiveDate = order.confirmed_at || order.created_at;
    const dueAt = product?.due_at || services[0]?.due_at;
    const deadline = getDeadlineStatus(dueAt);
    const technicianName = shortenName(getTechnicianNames(services));
    const saleName = shortenName(order.sales_user?.name || 'N/A');
    const showMarkDone = onMarkDone && !DONE_HIDDEN_COLUMNS.has(columnId);
    const isCompletedColumn = order.status === 'done' || order.status === 'after_sale';
    const isWarranty =
        product?.care_warranty_flow === 'warranty' ||
        !!(product as any)?.warranty_code ||
        services.some(s => s.care_warranty_flow === 'warranty');
    const afterSaleStage =
        (product as any)?.after_sale_stage ||
        (services[0] as any)?.after_sale_stage ||
        null;
    const needsDebtCollection =
        columnId === 'after_sale' &&
        (!afterSaleStage || afterSaleStage === 'after1' || afterSaleStage === 'after1_debt');

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* Header */}
            <div className="flex gap-2.5 border-b border-slate-100 px-3 py-2.5">
                <Avatar className="h-10 w-10 shrink-0 rounded-lg">
                    {productImage ? (
                        <img src={productImage} alt="" className="h-full w-full rounded-lg object-cover" />
                    ) : (
                        <AvatarFallback className="rounded-lg bg-blue-100 text-sm font-semibold text-blue-700">
                            {customerInitial}
                        </AvatarFallback>
                    )}
                </Avatar>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <span className="text-sm font-bold text-foreground">{productCode}</span>
                        {isWarranty && (
                            <Badge className="bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-100 text-[9px] px-1 py-0 h-3.5 shrink-0">
                                BH
                            </Badge>
                        )}
                        {needsDebtCollection && (
                            <Badge
                                className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100 text-[9px] px-1 py-0 h-3.5 shrink-0"
                                title="Cần thu nợ"
                            >
                                TN
                            </Badge>
                        )}
                        <span className="truncate text-sm font-medium text-blue-600">{customerName}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{description}</p>
                </div>
            </div>

            {/* Timeline & personnel */}
            <div className="space-y-2 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {isCompletedColumn ? (
                        <span className="text-muted-foreground">
                            Hoàn thành:{' '}
                            {order.completed_at ? formatDate(order.completed_at) : '—'}
                        </span>
                    ) : (
                        <>
                            <span className="text-muted-foreground">
                                {receiveDate ? formatDate(receiveDate) : '—'}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className={deadline?.dateClassName ?? 'text-muted-foreground'}>
                                {dueAt ? formatDate(dueAt) : '—'}
                            </span>
                            {deadline && (
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'h-5 border px-1.5 text-[10px] font-medium',
                                        deadline.badgeClassName,
                                    )}
                                >
                                    {deadline.label}
                                </Badge>
                            )}
                        </>
                    )}
                </div>

                <div className="grid grid-cols-2 divide-x divide-slate-200 text-xs text-muted-foreground">
                    <div className="flex min-w-0 items-center gap-1 pr-2">
                        <Wrench className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                            <span className="font-medium text-foreground/80">PT:</span> {technicianName}
                        </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1 pl-2">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                            <span className="font-medium text-foreground/80">Sale:</span> {saleName}
                        </span>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className={cn('grid gap-1.5 border-t border-slate-100 p-2', onDelete ? 'grid-cols-4' : 'grid-cols-3')}>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 px-0 text-xs"
                    onClick={(e) => {
                        e.stopPropagation();
                        onView();
                    }}
                >
                    <Eye className="h-3.5 w-3.5" />
                    Xem
                </Button>
                {onEdit ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-0 text-xs"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        Sửa
                    </Button>
                ) : (
                    <Button variant="outline" size="sm" className="h-8 gap-1 px-0 text-xs" disabled>
                        <Pencil className="h-3.5 w-3.5" />
                        Sửa
                    </Button>
                )}
                {showMarkDone ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-0 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                        onClick={(e) => {
                            e.stopPropagation();
                            onMarkDone();
                        }}
                    >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Xong
                    </Button>
                ) : (
                    <Button variant="outline" size="sm" className="h-8 gap-1 px-0 text-xs" disabled>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Xong
                    </Button>
                )}
                {onDelete ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-0 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa
                    </Button>
                ) : null}
            </div>
            {onStatusMove && statusColumns.length > 1 && (
                <MobileKanbanMoveBar
                    columns={statusColumns}
                    currentColumnId={columnId}
                    draggableId={`${order.id}__${groupIndex}`}
                    onMove={onStatusMove}
                    embedded
                    className="px-2 pb-2"
                />
            )}
        </div>
    );
}

export function MobileOrdersKanban({
    columns: columnsList,
    getCardsByStatus,
    activeColumnIndex: controlledIndex,
    onActiveColumnChange,
    onViewOrder,
    onEditOrder,
    onMarkDone,
    onDeleteOrder,
    onStatusMove,
}: MobileOrdersKanbanProps) {
    const [internalIndex, setInternalIndex] = React.useState(0);
    const activeColumnIndex = controlledIndex ?? internalIndex;
    const setActiveColumnIndex = onActiveColumnChange ?? setInternalIndex;

    const activeColumn = columnsList[activeColumnIndex];
    const cards = activeColumn ? getCardsByStatus(activeColumn.id) : [];
    const statusColumns: MobileKanbanColumn[] = columnsList.map((c) => ({
        id: c.id,
        title: c.title,
    }));

    return (
        <div className="space-y-2">
            <div className="mobile-kanban-tabs">
                {columnsList.map((column, index) => {
                    const count = getCardsByStatus(column.id).length;
                    const isActive = index === activeColumnIndex;
                    const ColumnIcon = column.icon ?? Circle;
                    const shortLabel = TAB_SHORT_LABELS[column.id] ?? column.title;

                    return (
                        <button
                            key={column.id}
                            type="button"
                            onClick={() => setActiveColumnIndex(index)}
                            className={`mobile-kanban-tab ${column.color} ${
                                isActive ? `active ${column.bgColor}` : 'border-slate-200 bg-white'
                            }`}
                        >
                            <ColumnIcon className="h-3.5 w-3.5" />
                            <span>{shortLabel}</span>
                            <span
                                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                                    column.id === 'before_sale'
                                        ? 'bg-blue-600'
                                        : column.id === 'in_progress'
                                          ? 'bg-orange-500'
                                          : column.id === 'done'
                                            ? 'bg-emerald-600'
                                            : column.id === 'after_sale'
                                              ? 'bg-teal-600'
                                              : 'bg-rose-500'
                                }`}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="min-h-[120px] space-y-2">
                {cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-12 text-center">
                        <p className="text-sm text-muted-foreground">Không có đơn hàng</p>
                    </div>
                ) : (
                    cards.map((item, idx) => (
                        <MobileOrderCard
                            key={`${item.order.id}-${item.groupIndex}-${idx}`}
                            order={item.order}
                            group={item.group}
                            groupIndex={item.groupIndex}
                            columnId={activeColumn?.id ?? ''}
                            statusColumns={statusColumns}
                            onStatusMove={onStatusMove}
                            onView={() => onViewOrder(item.order, item.group)}
                            onEdit={onEditOrder ? () => onEditOrder(item.order) : undefined}
                            onMarkDone={
                                onMarkDone ? () => onMarkDone(item.order, item.group) : undefined
                            }
                            onDelete={onDeleteOrder ? () => onDeleteOrder(item.order) : undefined}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
