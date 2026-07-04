import React, { memo, useState } from 'react';
import { Heart, Wrench, History, ShoppingBag, User as UserIcon, Tag, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { rejectNonSequentialKanbanMove, CARE_WARRANTY_COLUMN_IDS } from '@/lib/kanbanSequential';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';
import { ordersApi } from '@/lib/api';
import type { Order, OrderItem } from '@/hooks/useOrders';
import type { WorkflowKanbanGroup } from '../types';
import {
    MobileKanbanColumnTabs,
    MobileKanbanMoveBar,
    type MobileKanbanColumn,
} from '@/components/kanban/mobileKanban';

interface CareTabProps {
    order: Order | null;
    groups: WorkflowKanbanGroup[];
    careLogs: any[];
    updateOrderAfterSale: (patch: Partial<Order>) => void;
    reloadOrder: () => Promise<void>;
    fetchKanbanLogs: (orderId: string) => Promise<void>;
    getCareWarrantyStageLabel: (stage: string) => string;
    onProductCardClick: (group: any, roomId: string) => void;
    onUpdateItemAfterSaleData: (itemId: string, isCustomerItem: boolean, data: any) => Promise<void>;
    isPhoneView?: boolean;
}

const CARE_WAR_COLS = [
    { id: 'war1' as const, title: '1. Tiếp nhận', color: 'border-red-400', flow: 'warranty' as const },
    { id: 'war2' as const, title: '2. Xử lý', color: 'border-red-400', flow: 'warranty' as const },
    { id: 'war3' as const, title: '3. Đã tạo HD Bảo hành', color: 'border-green-400', flow: 'warranty' as const },
    { id: 'care6' as const, title: 'Mốc 6 Tháng', color: 'border-teal-400', flow: 'care' as const },
    { id: 'care12' as const, title: 'Mốc 12 Tháng', color: 'border-teal-400', flow: 'care' as const },
    { id: 'care-custom' as const, title: 'Lịch Riêng', color: 'border-teal-400', flow: 'care' as const },
];

const CareCard = memo(({
    group,
    index,
    col,
    order,
    onProductCardClick,
    isPhoneView = false,
    flowColumns = [],
    onCareMove,
}: {
    group: WorkflowKanbanGroup;
    index: number;
    col: typeof CARE_WAR_COLS[number];
    order: Order;
    onProductCardClick: (group: any, roomId: string) => void;
    isPhoneView?: boolean;
    flowColumns?: MobileKanbanColumn[];
    onCareMove?: (result: DropResult) => void;
}) => {
    const productItem = group.product;
    const productName = productItem?.item_name || 'Sản phẩm';
    const productImage = (productItem as any)?.product?.image || (group.services[0] as any)?.service?.image;
    const draggableId = `${order.id}::${productItem?.id || index}::${col.flow}`;

    return (
        <Draggable key={draggableId} draggableId={draggableId} index={index} isDragDisabled={isPhoneView}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...(isPhoneView ? {} : provided.dragHandleProps)}
                    className={cn(
                        "bg-white rounded-xl shadow-sm p-4 mb-3 border-l-4 transition-all",
                        isPhoneView ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                        snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20 scale-105" : "",
                        col.flow === 'warranty' ? "border-red-400 hover:border-red-600" : "border-teal-400 hover:border-teal-600"
                    )}
                    onClick={() => onProductCardClick(group, col.id)}
                >
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-gray-400">#{order.order_code}</span>
                    </div>

                    <div className="space-y-2 mb-3">
                        {productImage && (
                            <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-video w-full max-h-24 text-center flex items-center justify-center">
                                <img
                                    src={productImage}
                                    alt={productName}
                                    className="max-h-full max-w-full object-contain"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            </div>
                        )}
                        <h3 className="font-bold text-gray-800 text-[13px] flex items-center gap-1.5 flex-wrap">
                            <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="truncate">{productName}</span>
                        </h3>
                        {order.customer?.name && (
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                                <UserIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{order.customer.name}</span>
                            </div>
                        )}
                    </div>

                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Quy trình</p>
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                            {col.flow === 'warranty' ? 'Phòng Bảo hành' : 'Phòng Chăm sóc'}
                        </span>
                        <div className={cn(
                            "h-7 w-7 rounded-full flex items-center justify-center",
                            col.flow === 'warranty' ? "bg-red-50 text-red-500" : "bg-teal-50 text-teal-500"
                        )}>
                            {col.flow === 'warranty' ? <Wrench className="h-3.5 w-3.5" /> : <Heart className="h-3.5 w-3.5" />}
                        </div>
                    </div>
                    {onCareMove && flowColumns.length > 0 && (
                        <MobileKanbanMoveBar
                            columns={flowColumns}
                            currentColumnId={col.id}
                            draggableId={draggableId}
                            onMove={onCareMove}
                            sourceIndex={index}
                            embedded
                        />
                    )}
                </div>
            )}
        </Draggable>
    );
});

CareCard.displayName = 'CareCard';

export function CareTab({
    order,
    groups,
    careLogs,
    updateOrderAfterSale,
    reloadOrder,
    fetchKanbanLogs,
    getCareWarrantyStageLabel,
    onProductCardClick,
    onUpdateItemAfterSaleData,
    isPhoneView = false,
}: CareTabProps) {
    if (!order) return null;

    const [mobileWarCol, setMobileWarCol] = useState('war1');
    const [mobileCareCol, setMobileCareCol] = useState('care6');
    const warrantyColumns: MobileKanbanColumn[] = CARE_WAR_COLS.filter((c) => c.flow === 'warranty').map(
        (c) => ({ id: c.id, title: c.title })
    );
    const careColumns: MobileKanbanColumn[] = CARE_WAR_COLS.filter((c) => c.flow === 'care').map((c) => ({
        id: c.id,
        title: c.title,
    }));
    const orderInCareFlow = groups.some(g => {
        const item = (g.product || g.services?.[0]) as any;
        return item?.current_phase === 'care' || item?.current_phase === 'warranty';
    });

    const handleCareDragEnd = (result: DropResult) => {
        if (!order || !result.destination || result.destination.droppableId === result.source.droppableId) return;
        if (rejectNonSequentialKanbanMove(
            CARE_WARRANTY_COLUMN_IDS,
            result.source.droppableId,
            result.destination.droppableId
        )) {
            return;
        }
        
        const toStage = result.destination.droppableId as string;
        const toFlow = ['war1', 'war2', 'war3'].includes(toStage) ? 'warranty' : 'care';
        
        // Extract original itemId from draggableId (format: orderId::itemId::flow)
        const parts = result.draggableId.split('::');
        if (parts.length < 2) return;
        const itemId = parts[1];
        
        // Find which group/product is being moved
        const group = groups.find(g => g.product?.id === itemId);
        if (!group || !group.product) return;
        
        const isCustomerItem = !!(group.product as any).is_customer_item;

        // Optimistic UI: update local order state immediately so card moves instantly
        if (order.items) {
            const updatedItems = order.items.map((item: any) => {
                if (item.id === itemId || (item.is_customer_item && item.id === group.product?.id)) {
                    return { ...item, care_warranty_flow: toFlow, care_warranty_stage: toStage };
                }
                return item;
            });
            // Mutate order in place for immediate re-render
            (order as any).items = updatedItems;
        }
        
        // Fire API call in background — no await needed for perceived speed
        onUpdateItemAfterSaleData(itemId, isCustomerItem, {
            care_warranty_flow: toFlow,
            care_warranty_stage: toStage
        }).then(() => {
            fetchKanbanLogs(order.id);
            toast.success('Đã chuyển bước Chăm sóc/Bảo hành');
        }).catch((e: any) => {
            toast.error('Lỗi cập nhật — đang khôi phục...');
            reloadOrder(); // Revert on failure
        });
    };

    return (
        <TabsContent value="care">
            <Card className="border-none shadow-none bg-transparent">
                <CardHeader className="px-0">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                                <Heart className="h-6 w-6 text-red-500 fill-red-500" />
                                Chăm sóc & Bảo hành
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Quản lý quy trình hậu mãi và chăm sóc khách hàng định kỳ
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-0">
                    {!orderInCareFlow && (
                        <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl mb-6 flex items-start gap-3">
                            <ShoppingBag className="h-5 w-5 text-amber-500 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-amber-900">Đơn hàng chưa vào quy trình</p>
                                <p className="text-xs text-amber-700">Tại tab After sale, hãy bấm &quot;Khách khen&quot; hoặc &quot;Khách chê&quot; để kích hoạt quy trình này.</p>
                            </div>
                        </div>
                    )}
                    <DragDropContext onDragEnd={handleCareDragEnd}>
                        {isPhoneView && (
                            <div className="space-y-6 mb-6 md:hidden">
                                <div>
                                    <h3 className="font-black text-red-700 mb-3 flex items-center tracking-widest uppercase text-xs">
                                        <Wrench className="mr-2 h-4 w-4" /> Bảo hành
                                    </h3>
                                    <MobileKanbanColumnTabs
                                        columns={warrantyColumns}
                                        activeId={mobileWarCol}
                                        onChange={setMobileWarCol}
                                        getCount={(id) =>
                                            groups.filter((g) => {
                                                const item = (g.product || g.services?.[0]) as any;
                                                return item?.current_phase === 'warranty' && item?.phase_stage === id;
                                            }).length
                                        }
                                        className="mb-3"
                                    />
                                    {CARE_WAR_COLS.filter((c) => c.flow === 'warranty' && c.id === mobileWarCol).map((col) => {
                                        const colGroups = groups.filter((g) => {
                                            const item = (g.product || g.services?.[0]) as any;
                                            return item?.current_phase === 'warranty' && item?.phase_stage === col.id;
                                        });
                                        return (
                                            <Droppable key={col.id} droppableId={col.id}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.droppableProps}
                                                        className={cn(
                                                            'min-h-[120px] p-2 rounded-xl border-2 border-dashed',
                                                            snapshot.isDraggingOver ? 'bg-red-50 border-red-300' : 'bg-gray-100 border-transparent'
                                                        )}
                                                    >
                                                        {colGroups.map((group, index) => (
                                                            <CareCard
                                                                key={group.product?.id || index}
                                                                group={group}
                                                                index={index}
                                                                col={col}
                                                                order={order}
                                                                onProductCardClick={onProductCardClick}
                                                                isPhoneView
                                                                flowColumns={warrantyColumns}
                                                                onCareMove={handleCareDragEnd}
                                                            />
                                                        ))}
                                                        {provided.placeholder}
                                                    </div>
                                                )}
                                            </Droppable>
                                        );
                                    })}
                                </div>
                                <div>
                                    <h3 className="font-black text-teal-700 mb-3 flex items-center tracking-widest uppercase text-xs">
                                        <Heart className="mr-2 h-4 w-4" /> Chăm sóc
                                    </h3>
                                    <MobileKanbanColumnTabs
                                        columns={careColumns}
                                        activeId={mobileCareCol}
                                        onChange={setMobileCareCol}
                                        getCount={(id) =>
                                            groups.filter((g) => {
                                                const item = (g.product || g.services?.[0]) as any;
                                                return item?.current_phase === 'care' && item?.phase_stage === id;
                                            }).length
                                        }
                                        className="mb-3"
                                    />
                                    {CARE_WAR_COLS.filter((c) => c.flow === 'care' && c.id === mobileCareCol).map((col) => {
                                        const colGroups = groups.filter((g) => {
                                            const item = (g.product || g.services?.[0]) as any;
                                            return item?.current_phase === 'care' && item?.phase_stage === col.id;
                                        });
                                        return (
                                            <Droppable key={col.id} droppableId={col.id}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.droppableProps}
                                                        className={cn(
                                                            'min-h-[120px] p-2 rounded-xl border-2 border-dashed',
                                                            snapshot.isDraggingOver ? 'bg-teal-50 border-teal-300' : 'bg-gray-100 border-transparent'
                                                        )}
                                                    >
                                                        {colGroups.map((group, index) => (
                                                            <CareCard
                                                                key={group.product?.id || index}
                                                                group={group}
                                                                index={index}
                                                                col={col}
                                                                order={order}
                                                                onProductCardClick={onProductCardClick}
                                                                isPhoneView
                                                                flowColumns={careColumns}
                                                                onCareMove={handleCareDragEnd}
                                                            />
                                                        ))}
                                                        {provided.placeholder}
                                                    </div>
                                                )}
                                            </Droppable>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className={cn('grid grid-cols-1 lg:grid-cols-2 gap-8', isPhoneView && 'hidden lg:grid')}>
                            {/* Warranty Section */}
                            <div className="flex flex-col min-w-0">
                                <h3 className="font-black text-red-700 mb-4 flex items-center tracking-widest uppercase text-xs">
                                    <Wrench className="mr-2 h-4 w-4" /> BẢO HÀNH (Feedback Chê)
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {CARE_WAR_COLS.filter((c) => c.flow === 'warranty').map((col) => {
                                        const colGroups = groups.filter(g => {
                                            const item = (g.product || g.services?.[0]) as any;
                                            return item?.current_phase === 'warranty' && item?.phase_stage === col.id;
                                        });
                                        const hasActive = colGroups.length > 0;
                                        return (
                                            <div key={col.id} className="flex flex-col min-w-[140px]">
                                                <div className="flex justify-between items-center mb-4 px-2">
                                                    <h4 className="font-bold text-[10px] uppercase tracking-widest text-gray-500">{col.title}</h4>
                                                    {hasActive && <Badge className="bg-red-500 h-2 w-2 p-0 rounded-full" />}
                                                </div>
                                                <Droppable droppableId={col.id}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.droppableProps}
                                                            className={cn(
                                                                "min-h-[200px] p-2 rounded-xl flex-1 border-2 border-dashed transition-colors",
                                                                snapshot.isDraggingOver ? "bg-red-50 border-red-300" : hasActive ? "bg-red-50/30 border-transparent" : "bg-gray-100 border-transparent"
                                                            )}
                                                        >
                                                            {colGroups.map((group, index) => (
                                                                <CareCard
                                                                    key={group.product?.id || index}
                                                                    group={group}
                                                                    index={index}
                                                                    col={col}
                                                                    order={order}
                                                                    onProductCardClick={onProductCardClick}
                                                                />
                                                            ))}
                                                            {provided.placeholder}
                                                        </div>
                                                    )}
                                                </Droppable>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Care Section */}
                            <div className="flex flex-col min-w-0">
                                <h3 className="font-black text-teal-700 mb-4 flex items-center tracking-widest uppercase text-xs">
                                    <Heart className="mr-2 h-4 w-4" /> CHĂM SÓC (Feedback Khen)
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {CARE_WAR_COLS.filter((c) => c.flow === 'care').map((col) => {
                                        const colGroups = groups.filter(g => {
                                            const item = (g.product || g.services?.[0]) as any;
                                            return item?.current_phase === 'care' && item?.phase_stage === col.id;
                                        });
                                        const hasActive = colGroups.length > 0;
                                        return (
                                            <div key={col.id} className="flex flex-col min-w-[140px]">
                                                <div className="flex justify-between items-center mb-4 px-2">
                                                    <h4 className="font-bold text-[10px] uppercase tracking-widest text-gray-500">{col.title}</h4>
                                                    {hasActive && <Badge className="bg-teal-500 h-2 w-2 p-0 rounded-full" />}
                                                </div>
                                                <Droppable droppableId={col.id}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.droppableProps}
                                                            className={cn(
                                                                "min-h-[200px] p-2 rounded-xl flex-1 border-2 border-dashed transition-colors",
                                                                snapshot.isDraggingOver ? "bg-teal-50 border-teal-300" : hasActive ? "bg-teal-50/30 border-transparent" : "bg-gray-100 border-transparent"
                                                            )}
                                                        >
                                                            {colGroups.map((group, index) => (
                                                                <CareCard
                                                                    key={group.product?.id || index}
                                                                    group={group}
                                                                    index={index}
                                                                    col={col}
                                                                    order={order}
                                                                    onProductCardClick={onProductCardClick}
                                                                />
                                                            ))}
                                                            {provided.placeholder}
                                                        </div>
                                                    )}
                                                </Droppable>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </DragDropContext>

                    {/* History Section - Styled */}
                    {order && (
                        <div className="hidden mt-12 bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-6">
                                <History className="h-4 w-4" /> Lịch sử quy trình
                            </h3>
                            {careLogs.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic py-4 text-center bg-white rounded-2xl border border-dashed">Chưa có lịch sử cập nhật.</p>
                            ) : (
                                <div className="relative space-y-4">
                                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-100" />
                                    {careLogs.map((log: any, idx: number) => (
                                        <div key={log.id} className="relative pl-10">
                                            <div className={cn(
                                                "absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ring-4 ring-white",
                                                idx === 0 ? "bg-primary scale-125" : "bg-gray-300"
                                            )} />
                                            <div className="bg-white p-3.5 rounded-2xl border border-gray-50 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="space-y-1">
                                                    <p className="text-xs font-bold text-gray-800">
                                                        {log.from_stage ? `${getCareWarrantyStageLabel(log.from_stage)} → ` : ''}
                                                        <span className="text-primary">{getCareWarrantyStageLabel(log.to_stage)}</span>
                                                    </p>
                                                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                                                        <UserIcon className="h-3 w-3" />
                                                        {log.created_by_user?.name ?? 'Hệ thống'}
                                                        <span className="mx-1">•</span>
                                                        {log.flow_type === 'warranty' ? 'Bảo hành' : 'Chăm sóc'}
                                                    </div>
                                                </div>
                                                <Badge variant="secondary" className="text-[10px] font-black h-6 bg-gray-50 text-gray-400 border-none shrink-0 w-fit">
                                                    {formatDateTime(log.created_at)}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
    );
}

