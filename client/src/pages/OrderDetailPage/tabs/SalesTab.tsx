import React, { memo, useState } from 'react';
import {
    ArrowLeft, ArrowRight, ShoppingBag, CreditCard,
    Wrench, Clock, CheckCircle, Sparkles, Copy, Bot, History, RotateCw,
    User as UserIcon, Tag, FileText, Package, Truck, Search, Filter, Camera
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type { Order, OrderItem } from '@/hooks/useOrders';
import {
    SALES_STEPS,
    getSalesStatusLabel,
} from '../constants';
import { rejectNonSequentialKanbanMove } from '@/lib/kanbanSequential';

const SALES_COLUMN_IDS = SALES_STEPS.map((s) => s.id);
import {
    getItemTypeLabel,
    getItemTypeColor,
} from '../utils';
import { BackwardMoveDialog } from '@/components/orders/BackwardMoveDialog';
import { ImageIcon } from 'lucide-react';
import { UpsellDialog } from '@/components/orders/UpsellDialog';

interface SalesTabProps {
    order: Order;
    isPhoneView?: boolean;
    salesLogs: any[];
    updateOrderItemStatus: (itemId: string, status: string, reason?: string, photos?: string[]) => Promise<void>;
    updateOrderStatus: (orderId: string, status: string) => Promise<void>;
    reloadOrder: () => Promise<void>;
    fetchKanbanLogs: (orderId: string) => Promise<void>;
    onProductCardClick?: (group: { product: OrderItem | null; services: OrderItem[] }, roomId: string) => void;
    workflowKanbanGroups?: { product: OrderItem | null; services: OrderItem[] }[];
    onTabChange?: (tab: string) => void;
    /** Mở dialog với pending move callback — sau khi user xác nhận, card tự chuyển và dialog tự đóng */
    onOpenProductDialogWithMove?: (group: any, roomId: string, moveCallback: () => Promise<void>) => void;
}

const SalesCard = memo(({
    group,
    index,
    column,
    order,
    onProductCardClick,
    colIdx,
    updateOrderItemStatus,
    fetchKanbanLogs,
    reloadOrder,
    onTabChange,
    salesLogs,
    onBackwardMove,
    onUpsell,
    onOpenProductDialogWithMove,
    isPhoneView = false,
}: {
    group: { product: OrderItem | null; services: OrderItem[] };
    index: number;
    column: typeof SALES_STEPS[number];
    order: Order;
    onProductCardClick?: (group: any, roomId: string) => void;
    colIdx: number;
    salesLogs: any[];
    onBackwardMove?: (group: any, targetStepId: string) => void;
    onUpsell?: (group: any) => void;
    updateOrderItemStatus: (itemId: string, status: string, reason?: string, photos?: string[]) => Promise<void>;
    fetchKanbanLogs: (orderId: string) => Promise<void>;
    reloadOrder: () => Promise<void>;
    onTabChange?: (tab: string) => void;
    onOpenProductDialogWithMove?: (group: any, roomId: string, moveCallback: () => Promise<void>) => void;
    isPhoneView?: boolean;
}) => {
    const leadItem = group.product || group.services[0];
    const isWarranty = leadItem?.care_warranty_flow === 'warranty' || !!leadItem?.warranty_code;
    const draggableId = group.product?.id ?? group.services.map((s: OrderItem) => s.id).join('-');

    const productImage =
        group.product?.image ||
        group.product?.product?.image ||
        group.product?.service?.image ||
        group.services[0]?.image ||
        group.services[0]?.product?.image ||
        group.services[0]?.service?.image;

    const productName = group.product?.item_name || group.services[0]?.item_name || 'Hạng mục';

    const remainingTime = React.useMemo(() => {
        const col = column as any;
        if (!leadItem?.id || !col.id || col.id === 'cancelled' || !col.estimated_minutes) return null;

        // Find most recent log for THIS status entry
        const logs = (salesLogs || []).filter((l: any) => l.entity_id === leadItem.id && l.to_status === col.id);
        if (logs.length === 0) return null;

        const lastLog = [...logs].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        const enterTime = new Date(lastLog.created_at).getTime();

        const limitMs = (col.estimated_minutes as number) * 60 * 1000;
        const now = Date.now();
        const remainingMs = limitMs - (now - enterTime);

        const totalAbsMinutes = Math.floor(Math.abs(remainingMs) / 60000);
        const hours = Math.floor(totalAbsMinutes / 60);
        const minutes = totalAbsMinutes % 60;

        let label = '';
        if (remainingMs > 0) {
            label = `Còn ${hours > 0 ? `${hours}h` : ''}${minutes}m`;
        } else {
            label = `Trễ ${hours > 0 ? `${hours}h` : ''}${minutes}m`;
        }

        return {
            label,
            isOverdue: remainingMs <= 0,
        };
    }, [leadItem?.id, column, salesLogs]);

    return (
        <Draggable key={draggableId} draggableId={draggableId} index={index} isDragDisabled={isPhoneView}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...(isPhoneView ? {} : provided.dragHandleProps)}
                    className={cn(
                        "bg-white rounded-xl shadow-sm p-4 mb-3 border-l-4 transition-all relative",
                        isPhoneView ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                        snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20 scale-105" : "",
                        remainingTime?.isOverdue ? "bg-red-50 border-red-500 ring-2 ring-red-100" :
                            column.id === 'step4' ? "border-red-400 hover:border-red-600" :
                                column.id === 'step5' ? "border-green-400 hover:border-green-600" :
                                    column.id === 'cancelled' ? "border-gray-400 hover:border-gray-600" :
                                        "border-blue-400 hover:border-blue-600"
                    )}
                    onClick={() => onProductCardClick?.(group, column.id)}
                >
                    {remainingTime?.isOverdue && (
                        <div className="absolute top-1.5 right-1.5 bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm z-10 animate-pulse">
                            KPI CHẬM
                        </div>
                    )}
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-400">#{order.order_code}</span>
                            {isWarranty && (
                                <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-[10px] px-1 h-4 hover:bg-orange-100">
                                    BH
                                </Badge>
                            )}
                        </div>
                        <span className="text-xs font-bold text-muted-foreground text-[10px]">
                            #{leadItem?.item_code?.slice(-4) || 'Item'}
                        </span>
                    </div>

                    <div className="space-y-2 mb-3">
                        {productImage && (
                            <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-video w-full max-h-24">
                                <img
                                    src={productImage}
                                    alt={productName}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            </div>
                        )}
                        <h3 className="font-bold text-gray-800 text-[13px] flex items-center gap-1.5 flex-wrap">
                            <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="truncate">{productName}</span>
                        </h3>
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                {group.product && (
                                    <Badge className={cn("text-[10px] px-1 h-4", getItemTypeColor('product'))}>
                                        {getItemTypeLabel('product')}
                                    </Badge>
                                )}
                            </div>
                            {column.id === 'step4' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-5 px-1.5 text-[9px] py-0 font-bold text-violet-600 border-violet-200 bg-violet-50 hover:bg-violet-100 hover:text-violet-700 rounded-lg"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onUpsell) onUpsell(group);
                                    }}
                                >
                                    <Sparkles className="h-2.5 w-2.5 mr-1" />
                                    Upsell
                                </Button>
                            )}
                        </div>
                    </div>

                    {group.services.length > 0 && (
                        <div className="mt-2 space-y-1 pl-1 border-l-2 border-primary/20">
                            {group.services.map((svc: OrderItem) => (
                                <div key={svc.id} className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
                                    <Wrench className="h-3 w-3 shrink-0 text-primary/60" />
                                    <span className="truncate">{svc.item_name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-dashed">
                        {remainingTime && (
                            <div className={cn(
                                "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
                                remainingTime.isOverdue
                                    ? "bg-red-50 text-red-600 border-red-200 animate-pulse"
                                    : "bg-blue-50 text-blue-600 border-blue-200"
                            )}>
                                <Clock className="h-2.5 w-2.5" />
                                <span>{remainingTime.label}</span>
                            </div>
                        )}
                        <div className="flex-1" />
                        <div className={cn('flex items-center gap-1', isPhoneView && 'w-full justify-between')}>
                            {isPhoneView && (
                                <span className="text-[9px] font-bold uppercase text-muted-foreground mr-1">
                                    Chuyển bước
                                </span>
                            )}
                            <Button
                                variant={isPhoneView ? 'outline' : 'ghost'}
                                size={isPhoneView ? 'sm' : 'icon'}
                                className={isPhoneView ? 'h-8 flex-1 text-[10px] gap-1' : 'h-8 w-8 rounded-full'}
                                disabled={colIdx === 0}
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    const prevStepId = SALES_STEPS[colIdx - 1].id;
                                    if (onBackwardMove) {
                                        onBackwardMove(group, prevStepId);
                                    }
                                }}
                            >
                                <ArrowLeft className="h-4 w-4" />
                                {isPhoneView && <span>Lùi</span>}
                            </Button>
                            <Button
                                variant={isPhoneView ? 'default' : 'ghost'}
                                size={isPhoneView ? 'sm' : 'icon'}
                                className={isPhoneView ? 'h-8 flex-1 text-[10px] gap-1' : 'h-8 w-8 rounded-full text-primary hover:bg-primary hover:text-white'}
                                disabled={colIdx === SALES_STEPS.length - 1}
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    const nextStepIdx = colIdx + 1;
                                    const nextStep = SALES_STEPS[nextStepIdx].id;
                                    const itemsToUpdate: OrderItem[] = [];
                                    const leadItem = group.product || group.services[0];
                                    if (leadItem) itemsToUpdate.push(leadItem);

                                    // Step 1 validation
                                    if (column.id === 'step1') {
                                        const firstItem = itemsToUpdate[0];
                                        const stepData = firstItem?.sales_step_data || {};
                                        if (!stepData.step1_receiver_name || !stepData.step1_evidence_photos?.length || !stepData.step1_accessories_checked) {
                                            toast.error('Vui lòng hoàn thành bước 1: NV Sale nhận, ảnh bằng chứng và xác nhận phụ kiện đi kèm');
                                            const moveAction = async () => {
                                                for (const item of itemsToUpdate) {
                                                    await updateOrderItemStatus(item.id, nextStep);
                                                }
                                                toast.success(`Đã chuyển nhóm sang: ${SALES_STEPS[nextStepIdx].label}`);
                                                if (nextStep === 'step5') onTabChange?.('workflow');
                                                if (order?.id) fetchKanbanLogs(order.id);
                                            };
                                            if (onOpenProductDialogWithMove) {
                                                onOpenProductDialogWithMove(group, 'step1', moveAction);
                                            } else {
                                                onProductCardClick?.(group, 'step1');
                                            }
                                            return;
                                        }
                                    }

                                    // Step 2 validation: TAGS + FORM TÚI + SHOESTREE
                                    if (column.id === 'step2') {
                                        const firstItem = itemsToUpdate[0];
                                        const stepData = firstItem?.sales_step_data || {};
                                        if (!stepData.step2_tags_photos?.length || !stepData.step2_form_photos?.length) {
                                            toast.error('Vui lòng tải ảnh bằng chứng TAGS và FORM TÚI/SHOESTREE trước khi chuyển bước 2');
                                            // Mở dialog kèm move callback
                                            const moveAction = async () => {
                                                for (const item of itemsToUpdate) {
                                                    await updateOrderItemStatus(item.id, nextStep);
                                                }
                                                toast.success(`Đã chuyển nhóm sang: ${SALES_STEPS[nextStepIdx].label}`);
                                                if (nextStep === 'step5') onTabChange?.('workflow');
                                                if (order?.id) fetchKanbanLogs(order.id);
                                            };
                                            if (onOpenProductDialogWithMove) {
                                                onOpenProductDialogWithMove(group, 'step2', moveAction);
                                            } else {
                                                onProductCardClick?.(group, 'step2');
                                            }
                                            return;
                                        }
                                    }

                                    try {
                                        for (const item of itemsToUpdate) {
                                            await updateOrderItemStatus(item.id, nextStep);
                                        }
                                        toast.success(`Đã chuyển nhóm sang: ${SALES_STEPS[nextStepIdx].label}`);
                                        if (nextStep === 'step5') {
                                            onTabChange?.('workflow');
                                        }
                                        if (order?.id) fetchKanbanLogs(order.id);
                                    } catch {
                                        reloadOrder();
                                        toast.error('Lỗi khi cập nhật trạng thái');
                                    }
                                }}
                            >
                                {isPhoneView && <span>Tiếp</span>}
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Draggable>
    );
});

SalesCard.displayName = 'SalesCard';

export function SalesTab({
    order,
    isPhoneView = false,
    salesLogs,
    updateOrderItemStatus,
    updateOrderStatus,
    reloadOrder,
    fetchKanbanLogs,
    onProductCardClick,
    workflowKanbanGroups,
    onTabChange,
    onOpenProductDialogWithMove,
}: SalesTabProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [pendingMove, setPendingMove] = useState<{ group: any; targetStepId: string } | null>(null);
    const [backwardDialogOpen, setBackwardDialogOpen] = useState(false);
    const [viewLogData, setViewLogData] = useState<{ reason?: string; photos?: string[]; itemName?: string } | null>(null);
    const [upsellGroup, setUpsellGroup] = useState<any>(null);
    const [mobileSalesStep, setMobileSalesStep] = useState('step1');

    const displayedLogs = React.useMemo(() => {
        return (salesLogs || []).reduce((acc: any[], log: any) => {
            const existing = acc.find(
                (l: any) => l.from_status === log.from_status &&
                    l.to_status === log.to_status &&
                    l.created_by === log.created_by &&
                    l.entity_id === log.entity_id &&
                    Math.abs(new Date(l.created_at).getTime() - new Date(log.created_at).getTime()) < 2000
            );
            if (!existing) acc.push(log);
            return acc;
        }, []);
    }, [salesLogs]);

    const handleBackwardMoveConfirm = async (reason: string, photos: string[]) => {
        if (!pendingMove) return;
        const { group, targetStepId } = pendingMove;
        const itemsToUpdate: OrderItem[] = [];
        const leadItem = group.product || group.services[0];
        if (leadItem) itemsToUpdate.push(leadItem);

        const stepLabel = SALES_STEPS.find((s: any) => s.id === targetStepId)?.label || targetStepId;

        try {
            for (const item of itemsToUpdate) {
                await updateOrderItemStatus(item.id, targetStepId, reason, photos);
            }
            toast.success(`Đã lùi nhóm về: ${stepLabel}`);
            if (order?.id) fetchKanbanLogs(order.id);
            setPendingMove(null);
            setBackwardDialogOpen(false);
        } catch {
            reloadOrder();
            toast.error('Lỗi khi cập nhật trạng thái');
        }
    };

    const hasSalesItem = workflowKanbanGroups?.some(g => {
        const leadItem = g.product || g.services?.[0];
        return (leadItem as any)?.current_phase === 'sales';
    });



    return (
        <>
            <TabsContent value="sales">
                <div className="space-y-6">
                    {/* Kanban Board Header */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex-1">
                                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                                        <RotateCw className="h-5 w-5 text-primary" />
                                        Quy trình Lên đơn (Sales Kanban)
                                    </CardTitle>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Kiểm tra thông tin → Tư vấn thêm → Chốt gói. Kéo thả thẻ hạng mục vào cột để chuyển bước.
                                    </p>
                                </div>
                                <div className="hidden flex-wrap items-center gap-3 md:flex">
                                    <div className="relative w-64 mr-2">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Tìm theo số HĐ, tên NV, SĐT..."
                                            className="pl-9 h-9 text-xs bg-muted/30 border-none ring-offset-background"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg border border-dashed border-muted-foreground/20">
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white shadow-sm border border-gray-100">
                                            <Package className="h-3.5 w-3.5 text-primary" />
                                            <span className="text-[11px] font-bold text-gray-700">Tổng số sp: {workflowKanbanGroups?.length || 0}</span>
                                        </div>
                                        <div className="h-4 w-px bg-muted-foreground/20 mx-1" />
                                        <span className="text-[11px] font-bold px-2 py-1 rounded bg-blue-100 text-blue-700">1-3: Quy trình Sales</span>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-[11px] font-bold px-2 py-1 rounded bg-red-100 text-red-700">4: Kỹ thuật xét</span>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-[11px] font-bold px-2 py-1 rounded bg-green-100 text-green-700">5: Chốt đơn</span>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="min-w-0 overflow-visible">
                            {/* Kanban Board Layout */}
                            <div className="pb-4 min-w-0">
                                {isPhoneView && (
                                    <div className="mb-4 min-w-0 space-y-3 md:hidden">
                                        <p className="text-[10px] text-muted-foreground px-0.5">
                                            Vuốt ngang để chọn bước →
                                        </p>
                                        <div className="mobile-kanban-tabs -mx-1 px-1">
                                            {SALES_STEPS.map((column, colIdx) => {
                                                const columnGroups =
                                                    workflowKanbanGroups?.filter((group) => {
                                                        const leadItem = group.product || group.services[0];
                                                        if (!leadItem) return false;
                                                        const itemAny = leadItem as { current_phase?: string; phase_stage?: string };
                                                        if (itemAny.current_phase !== 'sales') return false;
                                                        return (itemAny.phase_stage || 'step1') === column.id;
                                                    }) || [];
                                                const isActive = mobileSalesStep === column.id;
                                                return (
                                                    <button
                                                        key={column.id}
                                                        type="button"
                                                        onClick={() => setMobileSalesStep(column.id)}
                                                        className={cn(
                                                            'mobile-kanban-tab',
                                                            isActive
                                                                ? 'active border-primary bg-primary text-primary-foreground'
                                                                : 'border-slate-200 bg-white text-foreground'
                                                        )}
                                                    >
                                                        <span>{colIdx + 1}. {column.title}</span>
                                                        <span
                                                            className={cn(
                                                                'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                                                                isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                                                            )}
                                                        >
                                                            {columnGroups.length}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <DragDropContext
                                            onDragEnd={async (result: DropResult) => {
                                                if (!result.destination || result.destination.droppableId === result.source.droppableId) return;
                                                if (rejectNonSequentialKanbanMove(
                                                    SALES_COLUMN_IDS,
                                                    result.source.droppableId,
                                                    result.destination.droppableId,
                                                    { allowBackward: true }
                                                )) {
                                                    return;
                                                }
                                                const draggableId = result.draggableId;
                                                const newStatus = result.destination.droppableId;
                                                const group = workflowKanbanGroups?.find(
                                                    (g) =>
                                                        (g.product?.id ?? g.services.map((s: OrderItem) => s.id).join('-')) ===
                                                        draggableId,
                                                );
                                                if (!group) return;
                                                const leadItem = group.product || group.services[0];
                                                if (leadItem) {
                                                    try {
                                                        await updateOrderItemStatus(leadItem.id, newStatus);
                                                        if (order?.id) fetchKanbanLogs(order.id);
                                                    } catch {
                                                        reloadOrder();
                                                    }
                                                }
                                            }}
                                        >
                                            <Droppable droppableId={mobileSalesStep}>
                                                {(provided) => {
                                                    const column = SALES_STEPS.find((s) => s.id === mobileSalesStep)!;
                                                    const colIdx = SALES_STEPS.findIndex((s) => s.id === mobileSalesStep);
                                                    const columnGroups =
                                                        workflowKanbanGroups?.filter((group) => {
                                                            const leadItem = group.product || group.services[0];
                                                            if (!leadItem) return false;
                                                            const itemAny = leadItem as { current_phase?: string; phase_stage?: string };
                                                            if (itemAny.current_phase !== 'sales') return false;
                                                            return (itemAny.phase_stage || 'step1') === column.id;
                                                        }) || [];
                                                    return (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.droppableProps}
                                                            className="min-h-[100px] space-y-2 rounded-xl border-2 border-dashed border-muted p-2"
                                                        >
                                                            {columnGroups.map((group, groupIdx) => (
                                                                <SalesCard
                                                                    key={
                                                                        group.product?.id ??
                                                                        group.services.map((s: OrderItem) => s.id).join('-')
                                                                    }
                                                                    group={group}
                                                                    index={groupIdx}
                                                                    column={column}
                                                                    order={order}
                                                                    onProductCardClick={onProductCardClick}
                                                                    colIdx={colIdx}
                                                                    updateOrderItemStatus={updateOrderItemStatus}
                                                                    fetchKanbanLogs={fetchKanbanLogs}
                                                                    reloadOrder={reloadOrder}
                                                                    onTabChange={onTabChange}
                                                                    salesLogs={salesLogs}
                                                                    onBackwardMove={(g, targetStepId) => {
                                                                        setPendingMove({ group: g, targetStepId });
                                                                        setBackwardDialogOpen(true);
                                                                    }}
                                                                    onUpsell={(g) => setUpsellGroup(g)}
                                                                    onOpenProductDialogWithMove={onOpenProductDialogWithMove}
                                                                    isPhoneView
                                                                />
                                                            ))}
                                                            {provided.placeholder}
                                                        </div>
                                                    );
                                                }}
                                            </Droppable>
                                        </DragDropContext>
                                    </div>
                                )}
                            <div className="hidden overflow-x-auto pb-4 md:block">
                                <DragDropContext
                                    onDragEnd={async (result: DropResult) => {
                                        if (!result.destination || result.destination.droppableId === result.source.droppableId) return;
                                        if (rejectNonSequentialKanbanMove(
                                            SALES_COLUMN_IDS,
                                            result.source.droppableId,
                                            result.destination.droppableId,
                                            { allowBackward: true }
                                        )) {
                                            return;
                                        }
                                        const draggableId = result.draggableId;
                                        const newStatus = result.destination.droppableId;
                                        const stepLabel = SALES_STEPS.find((s: any) => s.id === newStatus)?.label || newStatus;

                                        const group = workflowKanbanGroups?.find(g =>
                                            (g.product?.id ?? g.services.map((s: OrderItem) => s.id).join('-')) === draggableId
                                        );

                                        if (group) {
                                            const sourceIdx = SALES_STEPS.findIndex(s => s.id === result.source.droppableId);
                                            const destIdx = SALES_STEPS.findIndex(s => s.id === newStatus);

                                            if (destIdx < sourceIdx) {
                                                // Backward move
                                                setPendingMove({ group, targetStepId: newStatus });
                                                setBackwardDialogOpen(true);
                                                return;
                                            }

                                            const itemsToUpdate: OrderItem[] = [];
                                            const leadItem = group.product || group.services[0];
                                            if (leadItem) itemsToUpdate.push(leadItem);

                                            // Step 1 validation
                                            if (result.source.droppableId === 'step1' && destIdx > sourceIdx) {
                                                const firstItem = itemsToUpdate[0];
                                                const stepData = firstItem?.sales_step_data || {};
                                                if (!stepData.step1_receiver_name || !stepData.step1_evidence_photos?.length || !stepData.step1_accessories_checked) {
                                                    toast.error('Vui lòng hoàn thành bước 1: NV Sale nhận, ảnh bằng chứng và xác nhận phụ kiện đi kèm');
                                                    const moveAction = async () => {
                                                        for (const item of itemsToUpdate) {
                                                            await updateOrderItemStatus(item.id, newStatus);
                                                        }
                                                        toast.success(`Đã chuyển nhóm sang: ${stepLabel}`);
                                                        if (newStatus === 'step5') onTabChange?.('workflow');
                                                        if (order?.id) fetchKanbanLogs(order.id);
                                                    };
                                                    if (onOpenProductDialogWithMove) {
                                                        onOpenProductDialogWithMove(group, 'step1', moveAction);
                                                    } else {
                                                        onProductCardClick?.(group, 'step1');
                                                    }
                                                    return;
                                                }
                                            }

                                            // Step 2 validation: TAGS + FORM TÚI + SHOESTREE
                                            if (result.source.droppableId === 'step2' && destIdx > sourceIdx) {
                                                const firstItem = itemsToUpdate[0];
                                                const stepData = firstItem?.sales_step_data || {};
                                                if (!stepData.step2_tags_photos?.length || !stepData.step2_form_photos?.length) {
                                                    toast.error('Vui lòng tải ảnh bằng chứng TAGS và FORM TÚI/SHOESTREE trước khi chuyển bước 2');
                                                    const moveAction = async () => {
                                                        for (const item of itemsToUpdate) {
                                                            await updateOrderItemStatus(item.id, newStatus);
                                                        }
                                                        toast.success(`Đã chuyển nhóm sang: ${stepLabel}`);
                                                        if (newStatus === 'step5') onTabChange?.('workflow');
                                                        if (order?.id) fetchKanbanLogs(order.id);
                                                    };
                                                    if (onOpenProductDialogWithMove) {
                                                        onOpenProductDialogWithMove(group, 'step2', moveAction);
                                                    } else {
                                                        onProductCardClick?.(group, 'step2');
                                                    }
                                                    return;
                                                }
                                            }

                                            try {
                                                for (const item of itemsToUpdate) {
                                                    await updateOrderItemStatus(item.id, newStatus);
                                                }
                                                toast.success(`Đã chuyển nhóm sang: ${stepLabel}`);
                                                if (newStatus === 'step5') {
                                                    onTabChange?.('workflow');
                                                }
                                                if (order?.id) fetchKanbanLogs(order.id);
                                            } catch (error) {
                                                reloadOrder();
                                                toast.error('Lỗi khi cập nhật trạng thái');
                                            }
                                        }
                                    }}
                                >
                                    <div className="flex min-w-0 flex-col gap-4 md:min-w-[1200px] md:flex-row">
                                        {SALES_STEPS.map((column, colIdx) => {
                                            const columnGroups = workflowKanbanGroups?.filter(group => {
                                                const leadItem = group.product || group.services[0];
                                                if (!leadItem) return false;
                                                const itemAny = leadItem as any;
                                                if (itemAny.current_phase !== 'sales') return false;
                                                if (searchTerm) {
                                                    const term = searchTerm.toLowerCase();
                                                    const matchesSearch =
                                                        leadItem.item_name?.toLowerCase().includes(term) ||
                                                        leadItem.item_code?.toLowerCase().includes(term) ||
                                                        group.services?.some(s => s.item_name?.toLowerCase().includes(term) || s.item_code?.toLowerCase().includes(term)) ||
                                                        order.order_code?.toLowerCase().includes(term) ||
                                                        order.customer?.name?.toLowerCase().includes(term) ||
                                                        order.customer?.phone?.toLowerCase().includes(term) ||
                                                        order.sales_user?.name?.toLowerCase().includes(term);
                                                    if (!matchesSearch) return false;
                                                }
                                                const phaseStage = itemAny.phase_stage || 'step1';
                                                return phaseStage === column.id;
                                            }) || [];

                                            return (
                                                <div key={column.id} className="flex-1 min-w-[220px] flex flex-col">
                                                    <div className="flex justify-between items-center mb-4 px-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                                                                column.id === 'step4' ? "bg-red-500" :
                                                                    column.id === 'step5' ? "bg-green-500" :
                                                                        column.id === 'cancelled' ? "bg-gray-500" :
                                                                            "bg-blue-500"
                                                            )}>
                                                                {column.id === 'cancelled' ? 'X' : colIdx + 1}
                                                            </div>
                                                            <h3 className="font-bold text-xs uppercase tracking-widest text-gray-700">{column.title}</h3>
                                                        </div>
                                                        <span className="bg-gray-200 text-gray-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                                            {columnGroups.length}
                                                        </span>
                                                    </div>

                                                    <Droppable droppableId={column.id}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.droppableProps}
                                                                className={cn(
                                                                    "min-h-[300px] p-2 rounded-xl flex-1 border-2 border-dashed transition-colors",
                                                                    snapshot.isDraggingOver ?
                                                                        (column.id === 'step4' ? "bg-red-50 border-red-300" :
                                                                            column.id === 'step5' ? "bg-green-50 border-green-300" :
                                                                                column.id === 'cancelled' ? "bg-gray-100 border-gray-300" :
                                                                                    "bg-blue-50 border-blue-300") :
                                                                        "bg-gray-100 border-transparent"
                                                                )}
                                                            >
                                                                {columnGroups.map((group, groupIdx) => (
                                                                    <SalesCard
                                                                        key={group.product?.id ?? group.services.map((s: OrderItem) => s.id).join('-')}
                                                                        group={group}
                                                                        index={groupIdx}
                                                                        column={column}
                                                                        order={order}
                                                                        onProductCardClick={onProductCardClick}
                                                                        colIdx={colIdx}
                                                                        updateOrderItemStatus={updateOrderItemStatus}
                                                                        fetchKanbanLogs={fetchKanbanLogs}
                                                                        reloadOrder={reloadOrder}
                                                                        onTabChange={onTabChange}
                                                                        salesLogs={salesLogs}
                                                                        onBackwardMove={(group, targetStepId) => {
                                                                            setPendingMove({ group, targetStepId });
                                                                            setBackwardDialogOpen(true);
                                                                        }}
                                                                        onUpsell={(group) => setUpsellGroup(group)}
                                                                        onOpenProductDialogWithMove={onOpenProductDialogWithMove}
                                                                    />
                                                                ))}
                                                                {provided.placeholder}
                                                                {columnGroups.length === 0 && !snapshot.isDraggingOver && (
                                                                    <div className="flex items-center justify-center h-20 text-muted-foreground text-[10px] italic">
                                                                        Trống
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </Droppable>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </DragDropContext>
                            </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="hidden grid-cols-1 gap-6 lg:grid lg:grid-cols-3">
                        <div className="lg:col-span-2 space-y-6">
                            {/* AI Message Templates */}
                            <Card className="border-blue-100 bg-blue-50/30">
                                <CardHeader className="pb-3 border-b border-blue-100">
                                    <CardTitle className="text-xs font-bold text-blue-800 flex items-center gap-2 tracking-widest uppercase">
                                        <Bot className="h-4 w-4" /> AI Agent: Mẫu tin nhắn chăm sóc
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {[
                                            { id: 'ship', title: '1. Xin địa chỉ Ship', sub: '"Chào anh, đồ đã xong..."', content: `Chào ${order.customer?.name} ạ, giày ${order.items?.[0]?.item_name || 'của mình'} đã xong. Anh/chị cho shop xin địa chỉ ship nhé!` },
                                            { id: 'care', title: '2. HD Bảo quản', sub: '"Shop gửi HDSD..."', content: `Shop gửi ${order.customer?.name} HDSD: Tránh nước, lau bằng khăn mềm định kỳ ạ.` },
                                            { id: 'feedback', title: '3. Xin Feedback', sub: '"Bạn đã nhận được đồ chưa..."', content: `Dạ chào ${order.customer?.name}, mình nhận được đồ chưa ạ? Cho shop xin feedback nhé!` }
                                        ].map((tmp: any) => (
                                            <div
                                                key={tmp.id}
                                                className="bg-white p-4 rounded-xl border border-blue-200 hover:shadow-md transition-all group relative cursor-pointer"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(tmp.content);
                                                    toast.success(`Đã copy mẫu: ${tmp.title}`);
                                                }}
                                            >
                                                <p className="text-[10px] font-black text-blue-600 uppercase mb-1">{tmp.title}</p>
                                                <p className="text-xs text-gray-500 line-clamp-2 italic">{tmp.sub}</p>
                                                <Copy className="absolute bottom-4 right-4 h-3 w-3 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Lịch sử chuyển bước */}
                            <Card className="hidden">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-xs font-bold flex items-center gap-2 tracking-widest uppercase text-gray-500">
                                        <History className="h-4 w-4 text-primary" /> Lịch sử chuyển bước (Lên đơn)
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {displayedLogs.length === 0 ? (
                                        <p className="text-[11px] text-muted-foreground italic py-2">Chưa có lịch sử chuyển bước.</p>
                                    ) : (
                                        <ul className="space-y-2 max-h-48 overflow-y-auto">
                                            {displayedLogs.map((log: any) => (
                                                <li key={log.id} className="text-[11px] flex flex-col gap-1 py-1.5 border-b border-dashed last:border-0">
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-gray-900">{log.created_by_user?.name || 'Hệ thống'}</span>
                                                                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                    {formatDateTime(log.created_at)}
                                                                </span>
                                                            </div>
                                                            <div className="flex gap-1 items-center">
                                                                {(log.reason || (log.photos && log.photos.length > 0)) && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-7 text-[10px] text-primary hover:text-primary hover:bg-primary/10 gap-1"
                                                                        onClick={() => {
                                                                            const groupName = workflowKanbanGroups?.find(g =>
                                                                                g.product?.id === log.entity_id || g.services.some(s => s.id === log.entity_id)
                                                                            )?.product?.item_name || 'Sản phẩm';

                                                                            setViewLogData({
                                                                                reason: log.reason,
                                                                                photos: log.photos || [],
                                                                                itemName: groupName
                                                                            });
                                                                        }}
                                                                    >
                                                                        <ImageIcon className="h-3 w-3" />
                                                                        Xem lý do
                                                                    </Button>
                                                                )}
                                                                {['step1', 'step2', 'step3', 'step4', 'step5'].includes(log.to_status) && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-7 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1"
                                                                        onClick={() => {
                                                                            const targetGroup = workflowKanbanGroups?.find(g =>
                                                                                g.product?.id === log.entity_id || g.services.some(s => s.id === log.entity_id)
                                                                            );
                                                                            if (targetGroup) {
                                                                                onProductCardClick?.(targetGroup, log.to_status);
                                                                            } else {
                                                                                toast.error('Không tìm thấy thông tin sản phẩm tương ứng.');
                                                                            }
                                                                        }}
                                                                    >
                                                                        <FileText className="h-3 w-3" />
                                                                        Xem nội dung
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="text-muted-foreground">
                                                        {log.from_status ? `${getSalesStatusLabel(log.from_status)} → ` : ''}{getSalesStatusLabel(log.to_status)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Right: Quick Tools */}
                        <div className="lg:col-span-1 space-y-4">
                            <Card className="border-purple-100">
                                <CardHeader className="pb-3 bg-purple-50/50">
                                    <CardTitle className="text-[11px] font-bold text-purple-800 tracking-widest uppercase">Công cụ Sales</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-3">
                                    <Button variant="outline" className="w-full justify-start h-12 text-xs font-bold border-gray-200 hover:bg-orange-50 hover:text-orange-700">
                                        <Clock className="h-4 w-4 mr-2 text-orange-500" />
                                        Nhắc việc (Flow-up)
                                    </Button>
                                    <div className="mt-4 pt-4 border-t border-dashed">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">Thông tin sale phụ trách</p>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-9 w-9">
                                                <AvatarFallback className="bg-orange-100 text-orange-600 font-bold text-xs">
                                                    {order.sales_user?.name?.charAt(0) || 'S'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-xs font-bold">{order.sales_user?.name || 'Chưa gán'}</p>
                                                <p className="text-[9px] text-muted-foreground uppercase">Saler Phụ Trách</p>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="pt-6">
                                    <div className="space-y-4">
                                        <div className="pb-4 border-b border-dashed">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Tiến độ tổng thể hạng mục</p>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[11px] font-bold">{order.items?.filter((i: OrderItem) => (i.status || 'step1') === 'step5').length || 0}/{order.items?.length || 0}</span>
                                                <span className="text-[11px] font-bold text-primary">
                                                    {Math.round(((order.items?.filter((i: OrderItem) => (i.status || 'step1') === 'step5').length || 0) / (order.items?.length || 1)) * 100)}%
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                <div
                                                    className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                                    style={{ width: `${((order.items?.filter((i: OrderItem) => (i.status || 'step1') === 'step5').length || 0) / (order.items?.length || 1)) * 100}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="p-4 rounded-xl bg-green-50 border border-green-100">
                                            <p className="text-[10px] font-bold text-green-700 uppercase mb-1">Doanh thu dự kiến</p>
                                            <p className="text-lg font-black text-green-700">{formatCurrency(order.total_amount)}</p>
                                        </div>

                                        {(order.status === 'before_sale' || (order.status as string).startsWith('step')) && (
                                            <Button
                                                className="w-full h-12 font-bold shadow-lg shadow-green-200 bg-green-600 hover:bg-green-700"
                                                disabled={!order.items?.every(i => (i as any).current_phase !== 'sales')}
                                                onClick={async () => {
                                                    try {
                                                        await updateOrderStatus(order.id, 'in_progress');
                                                        toast.success('Đã xác nhận đơn hàng sang Kỹ thuật!');
                                                        await reloadOrder();
                                                    } catch {
                                                        toast.error('Lỗi khi chốt đơn hàng');
                                                    }
                                                }}
                                            >
                                                <CheckCircle className="h-5 w-5 mr-2" />
                                                XÁC NHẬN CHỐT ĐƠN
                                            </Button>
                                        )}

                                        <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                                            <p className="text-[10px] font-bold text-blue-700 uppercase mb-1">Hoa hồng ước tính</p>
                                            <p className="text-lg font-black text-blue-700">{formatCurrency(order.total_amount * 0.05)}</p>
                                            <p className="text-[9px] text-blue-600 mt-1 italic leading-tight">* Tính dựa trên 5% doanh thu tạm tính</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </TabsContent>

            <BackwardMoveDialog
                open={backwardDialogOpen}
                onClose={() => {
                    setBackwardDialogOpen(false);
                    setPendingMove(null);
                }}
                onConfirm={handleBackwardMoveConfirm}
                itemName={pendingMove?.group?.product?.item_name || pendingMove?.group?.services?.[0]?.item_name}
                mode="create"
            />

            <BackwardMoveDialog
                open={!!viewLogData}
                onClose={() => setViewLogData(null)}
                itemName={viewLogData?.itemName}
                mode="view"
                initialData={viewLogData ? {
                    reason: viewLogData.reason || '',
                    photos: viewLogData.photos || []
                } : undefined}
            />

            <UpsellDialog
                open={!!upsellGroup}
                onOpenChange={(open) => !open && setUpsellGroup(null)}
                orderId={order?.id || ''}
                order={order}
                preselectedProduct={upsellGroup?.product ? {
                    id: upsellGroup.product.id,
                    name: upsellGroup.product.item_name,
                    type: upsellGroup.product.product_type || upsellGroup.product.item_type_label || ''
                } : null}
                onSuccess={() => {
                    reloadOrder();
                    setUpsellGroup(null);
                }}
            />
        </>
    );
}



