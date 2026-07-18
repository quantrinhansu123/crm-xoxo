import { Draggable } from '@hello-pangea/dnd';
import { Calendar, Trash2, User, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { Order, OrderItem } from '@/hooks/useOrders';
import { columns, getRoomDeadlineDisplay } from './constants';
import { formatDate } from '@/lib/utils';

export interface ProductGroup {
    product: OrderItem | null;
    services: OrderItem[];
}

interface OrderCardProps {
    draggableId: string;
    order: Order;
    productGroup: ProductGroup;
    columnId: string;
    index: number;
    onClick: () => void;
    draggable?: boolean;
    onDelete?: (order: Order) => void;
}

export function OrderCard({ draggableId, order, productGroup, columnId, index, onClick, draggable = true, onDelete }: OrderCardProps) {
    const { product, services } = productGroup;

    const effectiveProduct = product;
    const effectiveServices = services;

    const productImage =
        effectiveProduct?.product?.image ||
        effectiveProduct?.service?.image ||
        effectiveServices[0]?.product?.image ||
        effectiveServices[0]?.service?.image;

    const productCode =
        effectiveProduct?.item_code ||
        effectiveProduct?.product?.code ||
        effectiveProduct?.service?.code ||
        effectiveServices[0]?.item_code ||
        effectiveServices[0]?.service?.code ||
        order?.order_code ||
        'N/A';

    const isWarranty =
        productGroup.product?.care_warranty_flow === 'warranty' ||
        !!productGroup.product?.warranty_code ||
        productGroup.services?.some(s => s.care_warranty_flow === 'warranty');

    // Cần thu nợ (TN): After sale nhưng chưa qua bước Kiểm nợ (after1 / after1_debt)
    // Chỉ lấy after_sale_stage — không fallback phase_stage (có thể là war*/care* của chu kỳ khác)
    const afterSaleStage = (productGroup.product as any)?.after_sale_stage
        || (productGroup.services?.[0] as any)?.after_sale_stage
        || null;
    const needsDebtCollection =
        columnId === 'after_sale' &&
        (!afterSaleStage || afterSaleStage === 'after1' || afterSaleStage === 'after1_debt');

    const technicianNames = (() => {
        const names = new Set<string>();
        for (const s of effectiveServices) {
            if (s.technicians?.length) {
                for (const t of s.technicians) {
                    if (t.technician?.name) names.add(t.technician.name);
                }
            } else if (s.technician?.name) {
                names.add(s.technician.name);
            }
        }
        return names.size > 0 ? [...names].join(', ') : 'N/A';
    })();

    const roomDeadline = getRoomDeadlineDisplay(effectiveServices);
    const showRoomDeadline =
        order.status !== 'after_sale' &&
        order.status !== 'done' &&
        order.status !== 'cancelled' &&
        roomDeadline.label !== 'N/A';

    const receiveDate = order.confirmed_at || order.created_at;
    const dueDate = (effectiveProduct as any)?.due_at;

    const displayName = effectiveProduct?.item_name || effectiveServices[0]?.item_name || 'N/A';
    const displayServices = effectiveServices
        .filter(s => s.item_name !== displayName)
        .map(s => ({
            ...s,
            item_name: s.item_name.replace(/\s*\(.*?\)\s*/g, ' ').trim()
        }));

    const deadlineStatus = (() => {
        if (!dueDate) return null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        let color = '';
        if (diffDays < 0) color = 'text-red-600 font-bold';
        else if (diffDays === 0) color = 'text-red-600 font-bold';
        else if (diffDays === 1) color = 'text-yellow-600 font-bold';
        else if (diffDays === 2) color = 'text-green-600 font-bold';

        const remainingLabel = diffDays < 0
            ? ` (Quá ${Math.abs(diffDays)} ngày)`
            : diffDays === 0
                ? ' (Hôm nay)'
                : ` (Còn ${diffDays} ngày)`;

        return { color, remainingLabel };
    })();

    const renderCard = (provided?: any, isDragging = false) => (
        <div
            ref={provided?.innerRef}
            {...(provided?.draggableProps ?? {})}
            {...(provided?.dragHandleProps ?? {})}
            onClick={onClick}
            className={`kanban-card p-3 rounded-xl bg-white border shadow-sm cursor-pointer text-sm ${isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}`}
        >
                    <div className="flex gap-2 mb-2">
                        <Avatar className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-muted">
                            {productImage ? (
                                <img
                                    src={productImage}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <AvatarFallback className="rounded-lg text-xs bg-primary/10 text-primary">
                                    {displayName.charAt(0) || 'SP'}
                                </AvatarFallback>
                            )}
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-muted-foreground block truncate">
                                    {productCode}
                                </span>
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
                            </div>
                            <div className="text-[10px] text-primary font-medium mt-0.5 truncate" title={order.customer?.name}>
                                {order.customer?.name || 'N/A'}
                            </div>
                            <div className="font-semibold text-xs text-foreground truncate mt-0.5" title={displayName}>
                                {displayName}
                            </div>
                        </div>
                        {onDelete && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Xóa đơn hàng"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(order);
                                }}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>

                    {/* Dịch vụ sử dụng */}
                    <div className="flex flex-wrap gap-1 mb-2">
                        {displayServices.length > 0 ? (
                            displayServices
                                .slice(0, 3).map((s, i) => (
                                    <Badge
                                        key={i}
                                        variant="outline"
                                        className="text-[10px] truncate max-w-[120px]"
                                    >
                                        {s.item_name}
                                    </Badge>
                                ))
                        ) : null}
                        {displayServices.length > 3 && (
                            <Badge variant="secondary" className="text-[10px]">
                                +{displayServices.length - 3}
                            </Badge>
                        )}
                    </div>

                    {/* Ngày nhận - Ngày hẹn trả / Ngày hoàn thành */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex items-center gap-1 flex-wrap">
                            {order.status === 'done' || order.status === 'after_sale' ? (
                                <span>
                                    Hoàn thành: {order.completed_at ? formatDate(order.completed_at) : 'N/A'}
                                </span>
                            ) : (
                                <>
                                    {receiveDate ? formatDate(receiveDate) : 'N/A'} -
                                    <span className={deadlineStatus?.color || ''}>
                                        {dueDate ? formatDate(dueDate) : 'N/A'}
                                        {deadlineStatus?.remainingLabel}
                                    </span>
                                </>
                            )}
                        </span>
                    </div>

                    {/* Hạn phòng */}
                    {showRoomDeadline && (
                        <div className={`text-xs font-medium mb-2 ${roomDeadline.color}`}>
                            Hạn phòng: {roomDeadline.label}
                        </div>
                    )}

                    {/* Footer: Kỹ thuật và Sale - mỗi dòng riêng, nhiều KTV có thể wrap */}
                    <div className="space-y-1.5 pt-2 border-t text-xs text-muted-foreground">
                        <div className="flex items-start gap-1 min-w-0">
                            <Wrench className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="break-words line-clamp-2">{technicianNames}</span>
                        </div>
                        <div className="flex items-center gap-1 truncate">
                            <User className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{order.sales_user?.name || 'N/A'}</span>
                        </div>
                    </div>
        </div>
    );

    if (!draggable) {
        return renderCard();
    }

    return (
        <Draggable draggableId={draggableId} index={index}>
            {(provided, snapshot) => renderCard(provided, snapshot.isDragging)}
        </Draggable>
    );
}
