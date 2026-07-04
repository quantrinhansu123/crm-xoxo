import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import {
    RefreshCcw, Camera, Upload, ThumbsUp, ThumbsDown, Bot, Copy, History, ShoppingBag,
    Tag, FileText, Wrench, User as UserIcon, Package, Truck, Clock, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';
import { ordersApi, orderProductsApi, orderItemsApi } from '@/lib/api';
import type { Order, OrderItem } from '@/hooks/useOrders';

import type { WorkflowKanbanGroup } from '../types';
import { getGroupAfterSaleStage } from '../constants';
import {
    getAfter1DebtToAfter2ValidationErrors,
    getAfter1ToDebtValidationErrors,
    showAfterSaleValidationToast,
} from '../afterSaleValidation';
import {
    MobileKanbanColumnTabs,
    MobileKanbanMoveBar,
    buildKanbanDropResult,
    type MobileKanbanColumn,
} from '@/components/kanban/mobileKanban';
import { rejectNonSequentialKanbanMove, AFTER_SALE_COLUMN_IDS } from '@/lib/kanbanSequential';

interface AftersaleTabProps {
    order: Order | null;
    groups: WorkflowKanbanGroup[];
    aftersaleLogs: any[];
    updateOrderAfterSale: (patch: Partial<Order>) => void;
    reloadOrder: () => Promise<void>;
    fetchKanbanLogs: (orderId: string) => Promise<void>;
    setActiveTab: (tab: string) => void;
    getSLADisplay: (dueAt: string | Date | null | undefined) => string;
    getAfterSaleStageLabel: (stage: string) => string;
    getGroupCurrentTechRoom: (group: any) => string;
    // Dialog control props
    onProductCardClick: (group: any, roomId: string) => void;
    /** Mở dialog với pending move callback — sau khi user xác nhận, card tự chuyển và dialog tự đóng */
    onOpenProductDialogWithMove?: (group: any, roomId: string, moveCallback: () => Promise<void>) => void;
    isPhoneView?: boolean;
}

const AFTER_COLS = [
    { id: 'after1', title: 'Ảnh hoàn thiện', color: 'text-purple-700', slaDurationMs: 60 * 60 * 1000 },           // 60 phút
    { id: 'after1_debt', title: 'Kiểm nợ', color: 'text-purple-700', slaDurationMs: 10 * 24 * 60 * 60 * 1000 },   // 10 ngày
    { id: 'after2', title: 'Đóng gói & Giao hàng', color: 'text-purple-700', slaDurationMs: 4 * 24 * 60 * 60 * 1000 }, // 4 ngày
    { id: 'after3', title: 'Nhắn HD Bảo Quản & Feedback', color: 'text-purple-700', slaDurationMs: 5 * 24 * 60 * 60 * 1000 }, // 5 ngày
    { id: 'after4', title: 'Lưu Trữ', color: 'text-green-700', slaDurationMs: null },
] as const;

type AfterColId = typeof AFTER_COLS[number]['id'];

/** Nhãn ngắn cho tab mobile */
const AFTER_COL_TAB_LABELS: Record<AfterColId, string> = {
    after1: 'Ảnh HT',
    after1_debt: 'Kiểm nợ',
    after2: 'Đóng gói',
    after3: 'Feedback',
    after4: 'Lưu trữ',
};

function useSLACountdown(
    stageId: AfterColId,
    slaDurationMs: number | null,
    aftersaleLogs: any[],
    fallbackDate: string | undefined
): { remainingMs: number | null; enteredAt: Date | null } {
    const [now, setNow] = useState(() => Date.now());

    const enteredAt = React.useMemo(() => {
        if (!slaDurationMs) return null;
        const matchingLog = aftersaleLogs
            .filter((l: any) => l.to_stage === stageId)
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (matchingLog) return new Date(matchingLog.created_at);
        if (fallbackDate) return new Date(fallbackDate);
        return null;
    }, [stageId, slaDurationMs, aftersaleLogs, fallbackDate]);

    useEffect(() => {
        if (!slaDurationMs || !enteredAt) return;
        const interval = setInterval(() => setNow(Date.now()), stageId === 'after1' ? 1000 : 60000);
        return () => clearInterval(interval);
    }, [slaDurationMs, enteredAt, stageId]);

    if (!slaDurationMs || !enteredAt) return { remainingMs: null, enteredAt: null };
    return { remainingMs: enteredAt.getTime() + slaDurationMs - now, enteredAt };
}

function formatSLACountdown(remainingMs: number, stageId: AfterColId): { text: string; isLate: boolean } {
    const isLate = remainingMs < 0;
    const abs = Math.abs(remainingMs);

    if (stageId === 'after1') {
        const totalSecs = Math.floor(abs / 1000);
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        const formatted = `${h > 0 ? h + 'g ' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return { text: isLate ? `Trễ ${formatted}` : `Còn ${formatted}`, isLate };
    }

    const totalMins = Math.floor(abs / 60000);
    const days = Math.floor(totalMins / 1440);
    const hours = Math.floor((totalMins % 1440) / 60);
    const mins = totalMins % 60;

    let parts = '';
    if (days > 0) parts += `${days}n `;
    if (hours > 0) parts += `${hours}g `;
    if (days === 0 && mins > 0) parts += `${mins}ph`;
    parts = parts.trim() || '0ph';

    return { text: isLate ? `Trễ ${parts}` : `Còn ${parts}`, isLate };
}

const AftersaleCard = memo(({
    group,
    index,
    col,
    order,
    aftersaleLogs,
    onProductCardClick,
    getSLADisplay,
    onFeedbackAction,
    isPhoneView = false,
    afterColumns = [],
    onAfterSaleMove,
}: {
    group: WorkflowKanbanGroup;
    index: number;
    col: typeof AFTER_COLS[number];
    order: Order;
    aftersaleLogs: any[];
    onProductCardClick: (group: any, roomId: string) => void;
    getSLADisplay: (dueAt: string | Date | null | undefined) => string;
    onFeedbackAction?: (group: WorkflowKanbanGroup, flow: 'care' | 'warranty') => void;
    isPhoneView?: boolean;
    afterColumns?: MobileKanbanColumn[];
    onAfterSaleMove?: (result: DropResult) => void;
}) => {
    const product = group.product;
    const draggableId = product?.id || `group-${index}`;
    const productName = product?.item_name || 'Khách';
    const productItem = product as any;
    const productImage = product?.image || productItem?.product?.image || productItem?.service?.image;

    const { remainingMs } = useSLACountdown(col.id, col.slaDurationMs, aftersaleLogs, order.updated_at);
    const slaDisplay = remainingMs !== null ? formatSLACountdown(remainingMs, col.id) : null;
    const isLate = slaDisplay?.isLate ?? (product?.due_at && new Date(product.due_at) < new Date());

    const colIdx = afterColumns.findIndex((c) => c.id === col.id);
    const nextCol =
        colIdx >= 0 && colIdx < afterColumns.length - 1 ? afterColumns[colIdx + 1] : null;

    const tryMove = (destId: string) => {
        if (!onAfterSaleMove || destId === col.id) return;
        onAfterSaleMove(buildKanbanDropResult(draggableId, col.id, destId, index, 0));
    };

    const stepActionButton = (className?: string) => {
        if (col.id === 'after1') {
            return (
                <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-8 text-[10px] font-bold border-purple-200 text-purple-700', className)}
                    onClick={(e) => { e.stopPropagation(); onProductCardClick(group, 'after1'); }}
                >
                    <Camera className="h-3 w-3 mr-1 shrink-0" /> Ảnh HT
                </Button>
            );
        }
        if (col.id === 'after1_debt') {
            return (
                <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-8 text-[10px] font-bold border-purple-200 text-purple-700', className)}
                    onClick={(e) => { e.stopPropagation(); onProductCardClick(group, 'after1_debt'); }}
                >
                    <FileText className="h-3 w-3 mr-1 shrink-0" /> Kiểm nợ
                </Button>
            );
        }
        if (col.id === 'after2') {
            const accessoriesReturned = !!(productItem?.sales_step_data?.after2_accessories_returned_checked);
            return (
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        'h-8 text-[10px] font-bold',
                        accessoriesReturned
                            ? 'border-emerald-200 text-emerald-700'
                            : 'border-amber-300 text-amber-800 bg-amber-50',
                        className
                    )}
                    onClick={(e) => { e.stopPropagation(); onProductCardClick(group, 'after2'); }}
                >
                    <Upload className="h-3 w-3 mr-1 shrink-0" />
                    {accessoriesReturned ? 'Đã trả PK' : 'Trả phụ kiện'}
                </Button>
            );
        }
        return null;
    };

    return (
        <Draggable key={draggableId} draggableId={draggableId} index={index} isDragDisabled={isPhoneView}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...(isPhoneView ? {} : provided.dragHandleProps)}
                    className={cn(
                        "bg-white rounded-xl shadow-sm mb-3 border-l-4 transition-all",
                        isPhoneView ? "cursor-pointer p-3" : "cursor-grab active:cursor-grabbing p-4",
                        snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20 scale-105" : "",
                        isLate ? "border-red-500 bg-red-50/30" : "border-purple-400 hover:border-purple-600"
                    )}
                    onClick={() => onProductCardClick(group, col.id)}
                >
                    <div className="flex justify-between items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-400">#{order.order_code}</span>
                        {slaDisplay && (
                            <span className={cn(
                                "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                                slaDisplay.isLate
                                    ? "bg-red-100 text-red-600"
                                    : remainingMs! < (col.slaDurationMs! * 0.2)
                                        ? "bg-orange-100 text-orange-600"
                                        : "bg-green-100 text-green-700"
                            )}>
                                {slaDisplay.isLate
                                    ? <AlertCircle className="h-2.5 w-2.5" />
                                    : <Clock className="h-2.5 w-2.5" />}
                                {slaDisplay.text}
                            </span>
                        )}
                    </div>

                    {isPhoneView ? (
                        <>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                {productImage ? (
                                    <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 h-20">
                                        <img
                                            src={productImage}
                                            alt={productName}
                                            className="h-full w-full object-cover"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed bg-gray-50 text-[10px] text-muted-foreground">
                                        Không ảnh
                                    </div>
                                )}
                                <div className="min-w-0 flex flex-col justify-center gap-1">
                                    <h3 className="font-bold text-gray-800 text-[12px] flex items-start gap-1 line-clamp-2">
                                        <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                                        <span>{productName}</span>
                                    </h3>
                                    {order.customer?.name && (
                                        <div className="flex items-center gap-1 text-[10px] text-gray-600">
                                            <UserIcon className="h-3 w-3 shrink-0" />
                                            <span className="truncate">{order.customer.name}</span>
                                        </div>
                                    )}
                                    <Badge variant="secondary" className="w-fit text-[9px] font-bold text-purple-600 bg-purple-50 h-5">
                                        {order.sales_user?.name || 'Sale'}
                                    </Badge>
                                </div>
                            </div>

                            {group.services.length > 0 && (
                                <>
                                    <p className="text-[9px] font-semibold text-gray-400 uppercase mb-1">Dịch vụ</p>
                                    <ul className="grid grid-cols-2 gap-1 mb-2">
                                        {group.services.map((svc) => (
                                            <li key={svc.id} className="rounded px-1.5 py-1 bg-gray-50">
                                                <div className="flex items-center gap-1 text-[10px] font-medium text-gray-700">
                                                    <Wrench className="h-2.5 w-2.5 shrink-0 text-primary/60" />
                                                    <span className="line-clamp-2 leading-tight">{svc.item_name}</span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}

                            {col.id === 'after3' && onFeedbackAction ? (
                                <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] font-bold border-green-200 text-green-700"
                                        onClick={(e) => { e.stopPropagation(); onFeedbackAction(group, 'care'); }}
                                    >
                                        <ThumbsUp className="h-3 w-3 mr-1" /> Khen
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px] font-bold border-red-200 text-red-700"
                                        onClick={(e) => { e.stopPropagation(); onFeedbackAction(group, 'warranty'); }}
                                    >
                                        <ThumbsDown className="h-3 w-3 mr-1" /> Chê
                                    </Button>
                                </div>
                            ) : (
                                <div className="mt-1 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    {stepActionButton('min-w-0 flex-1 px-1 text-[9px]')}
                                    {nextCol && col.id !== 'after3' && (
                                        <Button
                                            size="sm"
                                            className="h-8 min-w-0 flex-1 px-1 text-[9px] font-bold"
                                            onClick={() => tryMove(nextCol.id)}
                                        >
                                            <span className="truncate">{nextCol.title} →</span>
                                        </Button>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
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
                        {order.customer?.name && (
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                                <UserIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="truncate">{order.customer.name}</span>
                            </div>
                        )}
                    </div>

                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Dịch vụ</p>
                    <ul className="space-y-1">
                        {group.services.map((svc) => (
                            <li key={svc.id} className="rounded-md px-2 py-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700">
                                    <Wrench className="h-3 w-3 shrink-0 text-primary/60" />
                                    <span className="truncate">{svc.item_name}</span>
                                </div>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                        <Badge variant="secondary" className="text-[10px] font-bold text-purple-500 bg-purple-50 uppercase h-5">
                            {order.sales_user?.name || 'Sale'}
                        </Badge>
                    </div>

                    {col.id === 'after1' && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full h-8 text-[11px] font-bold border-purple-200 hover:bg-purple-50 text-purple-700"
                            onClick={(e) => { e.stopPropagation(); onProductCardClick(group, 'after1'); }}
                        >
                            <Camera className="h-3.5 w-3.5 mr-1.5" /> Ảnh hoàn thiện
                        </Button>
                    )}
                    {col.id === 'after1_debt' && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full h-8 text-[11px] font-bold border-purple-200 hover:bg-purple-50 text-purple-700"
                            onClick={(e) => { e.stopPropagation(); onProductCardClick(group, 'after1_debt'); }}
                        >
                            <FileText className="h-3.5 w-3.5 mr-1.5" /> Kiểm nợ
                        </Button>
                    )}
                    {col.id === 'after2' && (
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                'mt-2 w-full h-8 text-[11px] font-bold px-1',
                                productItem?.sales_step_data?.after2_accessories_returned_checked
                                    ? 'border-emerald-200 hover:bg-emerald-50 text-emerald-700'
                                    : 'border-amber-300 hover:bg-amber-50 text-amber-800 bg-amber-50/80'
                            )}
                            onClick={(e) => { e.stopPropagation(); onProductCardClick(group, 'after2'); }}
                        >
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                            {productItem?.sales_step_data?.after2_accessories_returned_checked
                                ? 'Đã trả đủ phụ kiện'
                                : 'Xác nhận trả phụ kiện'}
                        </Button>
                    )}
                    {col.id === 'after3' && onFeedbackAction && (
                        <div className="mt-2 flex gap-2 w-full">
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-8 text-[11px] font-bold border-green-200 hover:bg-green-50 text-green-700 px-1"
                                onClick={(e) => { e.stopPropagation(); onFeedbackAction(group, 'care'); }}
                            >
                                <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Khen (Lưu trữ)
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-8 text-[11px] font-bold border-red-200 hover:bg-red-50 text-red-700 px-1"
                                onClick={(e) => { e.stopPropagation(); onFeedbackAction(group, 'warranty'); }}
                            >
                                <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Chê (Bảo hành)
                            </Button>
                        </div>
                    )}
                    {onAfterSaleMove && afterColumns.length > 0 && col.id !== 'after3' && (
                        <MobileKanbanMoveBar
                            columns={afterColumns}
                            currentColumnId={col.id}
                            draggableId={draggableId}
                            onMove={onAfterSaleMove}
                            sourceIndex={index}
                            embedded
                        />
                    )}
                        </>
                    )}
                </div>
            )}
        </Draggable>
    );
});

AftersaleCard.displayName = 'AftersaleCard';

export function AftersaleTab({
    order,
    groups,
    aftersaleLogs,
    updateOrderAfterSale,
    reloadOrder,
    fetchKanbanLogs,
    setActiveTab,
    getSLADisplay,
    getAfterSaleStageLabel,
    getGroupCurrentTechRoom,
    onProductCardClick,
    onOpenProductDialogWithMove,
    isPhoneView = false,
}: AftersaleTabProps) {
    if (!order) return null;

    const [mobileAfterCol, setMobileAfterCol] = useState<string>('after1');
    const mobileScrollRef = useRef<HTMLDivElement>(null);
    const mobileAfterInitializedRef = useRef(false);
    const afterColumns: MobileKanbanColumn[] = AFTER_COLS.map((c) => ({
        id: c.id,
        title: AFTER_COL_TAB_LABELS[c.id],
    }));

    const scrollToAfterColumn = useCallback((colId: string) => {
        setMobileAfterCol(colId);
        const container = mobileScrollRef.current;
        if (!container) return;
        const el = container.querySelector<HTMLElement>(`[data-kanban-col="${colId}"]`);
        if (el) {
            container.scrollTo({ left: el.offsetLeft - container.offsetLeft, behavior: 'smooth' });
        }
    }, []);

    useEffect(() => {
        const container = mobileScrollRef.current;
        if (!container) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                        const colId = (entry.target as HTMLElement).dataset.kanbanCol;
                        if (colId) setMobileAfterCol(colId);
                    }
                }
            },
            { root: container, threshold: 0.55 }
        );

        container.querySelectorAll('[data-kanban-col]').forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [groups]);

    const getColGroupCount = useCallback(
        (id: string) => groups.filter((g) => getGroupAfterSaleStage(g) === id).length,
        [groups]
    );

    useEffect(() => {
        if (mobileAfterInitializedRef.current) return;
        if (!groups.length) return;

        mobileAfterInitializedRef.current = true;
        if (getColGroupCount(mobileAfterCol) > 0) return;
        const firstWithCards = AFTER_COLS.find((c) => getColGroupCount(c.id) > 0);
        if (firstWithCards) scrollToAfterColumn(firstWithCards.id);
    }, [groups, mobileAfterCol, getColGroupCount, scrollToAfterColumn]);

    const handleFeedbackAction = (group: WorkflowKanbanGroup, flow: 'care' | 'warranty') => {
        if (!order || !group.product) return;
        const itemId = group.product.id;
        const isCustomerItem = !!group.product.is_customer_item;
        
        const payload = { 
            stage: 'after4', 
            care_warranty_flow: flow, 
            care_warranty_stage: flow === 'care' ? 'care6' : 'war1' 
        };

        const apiPromise = isCustomerItem
            ? orderProductsApi.updateAfterSaleData(itemId, payload)
            : orderItemsApi.updateAfterSaleData(itemId, payload);

        toast.success(`Đã chuyển sản phẩm sang ${flow === 'care' ? 'Lưu trữ' : 'Bảo hành'}`);

        apiPromise.then(() => {
            reloadOrder();
            fetchKanbanLogs(order.id);
        }).catch((e: any) => {
            reloadOrder();
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
        });
    };

    const handleAfterSaleDragEnd = (result: DropResult) => {
        if (!order || !result.destination || result.destination.droppableId === result.source.droppableId) return;
        if (rejectNonSequentialKanbanMove(
            AFTER_SALE_COLUMN_IDS,
            result.source.droppableId,
            result.destination.droppableId
        )) {
            return;
        }
        const newStage = result.destination.droppableId as string;
        const itemId = result.draggableId;

        // Find the group/product being dragged
        const draggedGroup = groups.find(g => g.product?.id === itemId);
        if (!draggedGroup || !draggedGroup.product) return;

        const isCustomerItem = !!draggedGroup.product.is_customer_item;

        if (result.source.droppableId === 'after1' && newStage === 'after1_debt') {
            const validationErrors = getAfter1ToDebtValidationErrors(order, draggedGroup.product);

            if (validationErrors.length > 0) {
                showAfterSaleValidationToast(validationErrors);
                // Mở dialog kèm move callback — sau khi confirm thành công sẽ tự chuyển bước
                const moveAction = async () => {
                    const api = isCustomerItem
                        ? orderProductsApi.updateAfterSaleData(itemId, { stage: newStage })
                        : orderItemsApi.updateAfterSaleData(itemId, { stage: newStage });
                    await api;
                    if (order.status !== 'after_sale') {
                        ordersApi.updateStatus(order.id, 'after_sale').catch(console.error);
                    }
                    reloadOrder();
                    fetchKanbanLogs(order.id);
                    toast.success(`Đã chuyển sản phẩm "${draggedGroup.product?.item_name}" sang bước mới`);
                };
                if (onOpenProductDialogWithMove) {
                    onOpenProductDialogWithMove(draggedGroup, 'after1', moveAction);
                } else {
                    onProductCardClick(draggedGroup, 'after1');
                }
                return;
            }
        }

        if (result.source.droppableId === 'after1_debt' && newStage === 'after2') {
            const validationErrors = getAfter1DebtToAfter2ValidationErrors(order);

            if (validationErrors.length > 0) {
                showAfterSaleValidationToast(validationErrors);
                // Mở dialog kèm move callback
                const moveAction = async () => {
                    const api = isCustomerItem
                        ? orderProductsApi.updateAfterSaleData(itemId, { stage: newStage })
                        : orderItemsApi.updateAfterSaleData(itemId, { stage: newStage });
                    await api;
                    if (order.status !== 'after_sale') {
                        ordersApi.updateStatus(order.id, 'after_sale').catch(console.error);
                    }
                    reloadOrder();
                    fetchKanbanLogs(order.id);
                    toast.success(`Đã chuyển sản phẩm "${draggedGroup.product?.item_name}" sang bước mới`);
                };
                if (onOpenProductDialogWithMove) {
                    onOpenProductDialogWithMove(draggedGroup, 'after1_debt', moveAction);
                } else {
                    onProductCardClick(draggedGroup, 'after1_debt');
                }
                return;
            }
        }

        // Add validation for transition from after2 to after3
        if (result.source.droppableId === 'after2' && newStage === 'after3') {
            const arePhotosOk = draggedGroup.product.packaging_photos && draggedGroup.product.packaging_photos.length > 0;
            const accessoriesReturned = !!(draggedGroup.product as any)?.sales_step_data?.after2_accessories_returned_checked;
            const isPickup = order.delivery_type === 'pickup';
            const areFieldsOk = order.delivery_creator_name && order.delivery_shipper_phone &&
                order.delivery_received_at &&
                (isPickup ? order.delivery_staff_name : order.delivery_carrier);
            
            if (!areFieldsOk || !arePhotosOk || !accessoriesReturned) {
                let errorMsg = "Vui lòng hoàn thành các yêu cầu sau để chuyển bước:";
                if (!accessoriesReturned) errorMsg += '\n- Tick "Xác nhận trả đủ đồ phụ kiện cho khách"';
                if (!areFieldsOk) {
                    errorMsg += isPickup
                        ? "\n- Nhập đầy đủ: NV Tạo đơn, SĐT Liên hệ, NV Giao đồ và Thời gian nhận đồ"
                        : "\n- Nhập đầy đủ: NV Tạo đơn, SĐT ship, NV vận chuyển (đơn vị) và Thời gian khách nhận";
                }
                if (!arePhotosOk) errorMsg += "\n- Cần ít nhất một \"Ảnh đóng gói/trả đồ\"";
                
                toast.error(errorMsg, { duration: 5000 });
                // Mở dialog kèm move callback
                const moveAction = async () => {
                    const api = isCustomerItem
                        ? orderProductsApi.updateAfterSaleData(itemId, { stage: newStage })
                        : orderItemsApi.updateAfterSaleData(itemId, { stage: newStage });
                    await api;
                    if (order.status !== 'after_sale') {
                        ordersApi.updateStatus(order.id, 'after_sale').catch(console.error);
                    }
                    reloadOrder();
                    fetchKanbanLogs(order.id);
                    toast.success(`Đã chuyển sản phẩm "${draggedGroup.product?.item_name}" sang bước mới`);
                };
                if (onOpenProductDialogWithMove) {
                    onOpenProductDialogWithMove(draggedGroup, 'after2', moveAction);
                } else {
                    onProductCardClick(draggedGroup, 'after2');
                }
                return;
            }
        }

        const apiPromise = isCustomerItem
            ? orderProductsApi.updateAfterSaleData(itemId, { stage: newStage })
            : orderItemsApi.updateAfterSaleData(itemId, { stage: newStage });

        apiPromise
            .then(() => {
                if (order.status !== 'after_sale') {
                    ordersApi.updateStatus(order.id, 'after_sale').catch(console.error);
                }
                return reloadOrder();
            })
            .then(() => fetchKanbanLogs(order.id))
            .then(() => {
                toast.success(`Đã chuyển "${draggedGroup.product?.item_name}" sang ${getAfterSaleStageLabel(newStage)}`);
            })
            .catch((e: any) => {
                reloadOrder();
                toast.error(e?.response?.data?.message || 'Lỗi cập nhật');
            });
    };

    return (
        <TabsContent value="aftersale">
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <RefreshCcw className="h-5 w-5 text-primary" />
                            After sale – Quy trình sau kỹ thuật
                        </CardTitle>
                        <p className="hidden text-sm text-muted-foreground md:block">
                            Ảnh → Kiểm nợ → Đóng gói & Giao hàng → Nhắn HD & Feedback → Lưu trữ. Chỉ chuyển tiến từng bước, không kéo ngược.
                        </p>
                        <p className="text-xs text-muted-foreground md:hidden">
                            Vuốt ngang: Ảnh hoàn thiện → Kiểm nợ → Đóng gói → Feedback → Lưu trữ
                        </p>
                    </CardHeader>
                    <CardContent className="min-w-0 overflow-visible">
                        <DragDropContext onDragEnd={handleAfterSaleDragEnd}>
                            {/* Mobile: 5 cột nằm ngang — vuốt trái/phải */}
                            <div className="mb-4 min-w-0 space-y-2 md:hidden">
                                <MobileKanbanColumnTabs
                                    columns={afterColumns}
                                    activeId={mobileAfterCol}
                                    onChange={scrollToAfterColumn}
                                    getCount={getColGroupCount}
                                    hint="Vuốt ngang giữa các cột hoặc chọn tab phía trên"
                                />
                                <div
                                    ref={mobileScrollRef}
                                    className="flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-visible overscroll-x-contain overscroll-y-auto pb-2 no-scrollbar -mx-1 px-1 [touch-action:pan-x_pan-y]"
                                >
                                    {AFTER_COLS.map((col) => {
                                        const colGroups = groups.filter(
                                            (g) => getGroupAfterSaleStage(g) === col.id
                                        );
                                        return (
                                            <div
                                                key={col.id}
                                                data-kanban-col={col.id}
                                                className="flex w-[calc(100vw-2.5rem)] max-w-[360px] shrink-0 snap-start flex-col min-h-[300px]"
                                            >
                                                <div className="mb-2 flex items-center justify-between px-1">
                                                    <h2 className={cn('text-xs font-bold uppercase tracking-wide', col.color)}>
                                                        {col.title}
                                                    </h2>
                                                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                                                        {colGroups.length}
                                                    </span>
                                                </div>
                                                <Droppable droppableId={col.id}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.droppableProps}
                                                            className={cn(
                                                                'min-h-[220px] flex-1 rounded-xl border-2 border-dashed p-2 transition-colors',
                                                                snapshot.isDraggingOver
                                                                    ? 'border-purple-300 bg-purple-50'
                                                                    : 'border-transparent bg-gray-100'
                                                            )}
                                                        >
                                                            {colGroups.map((group, index) => (
                                                                <AftersaleCard
                                                                    key={group.product?.id || `group-${index}`}
                                                                    group={group}
                                                                    index={index}
                                                                    col={col}
                                                                    order={order}
                                                                    aftersaleLogs={aftersaleLogs}
                                                                    onProductCardClick={onProductCardClick}
                                                                    getSLADisplay={getSLADisplay}
                                                                    onFeedbackAction={handleFeedbackAction}
                                                                    isPhoneView
                                                                    afterColumns={afterColumns}
                                                                    onAfterSaleMove={handleAfterSaleDragEnd}
                                                                />
                                                            ))}
                                                            {provided.placeholder}
                                                            {colGroups.length === 0 && !snapshot.isDraggingOver && (
                                                                <div className="flex h-24 items-center justify-center text-xs italic text-muted-foreground">
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
                            </div>
                            <div className="hidden gap-4 pb-4 md:grid md:grid-cols-5">
                                {AFTER_COLS.map((col) => {
                                    const colGroups = groups.filter(
                                        (g) => getGroupAfterSaleStage(g) === col.id
                                    );
                                    return (
                                        <div key={col.id} className="flex flex-col min-w-[220px]">
                                            <div className="flex justify-between items-center mb-4 px-2">
                                                <h2 className={cn("font-bold uppercase text-xs tracking-widest", col.color)}>
                                                    {col.title}
                                                </h2>
                                                <span className="bg-gray-200 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                                                    {colGroups.length}
                                                </span>
                                            </div>
                                            <Droppable droppableId={col.id}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.droppableProps}
                                                        className={cn(
                                                            "min-h-[300px] p-2 rounded-xl flex-1 border-2 border-dashed transition-colors",
                                                            snapshot.isDraggingOver ? "bg-purple-50 border-purple-300" : "bg-gray-100 border-transparent"
                                                        )}
                                                    >
                                                        {colGroups.map((group, index) => (
                                                            <AftersaleCard
                                                                key={group.product?.id || `group-${index}`}
                                                                group={group}
                                                                index={index}
                                                                col={col}
                                                                order={order}
                                                                aftersaleLogs={aftersaleLogs}
                                                                onProductCardClick={onProductCardClick}
                                                                getSLADisplay={getSLADisplay}
                                                                onFeedbackAction={handleFeedbackAction}
                                                            />
                                                        ))}
                                                        {provided.placeholder}
                                                        {colGroups.length === 0 && !snapshot.isDraggingOver && (
                                                            <div className="flex items-center justify-center h-20 text-muted-foreground text-xs italic">
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

                        {/* Nhắn HD & Feedback */}
                        {order && groups.some((g) => getGroupAfterSaleStage(g) === 'after3') && (
                            <div className="mt-6 p-6 bg-purple-50 rounded-2xl border border-purple-100 space-y-6">
                                <div>
                                    <h3 className="text-xs font-bold text-purple-800 uppercase mb-3 tracking-widest">Đã nhắn HD Bảo Quản & Xin feedback</h3>
                                    <div className="flex flex-wrap gap-6">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={!!(order as any).hd_sent}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    updateOrderAfterSale({ hd_sent: checked });
                                                    toast.success(checked ? 'Đã đánh dấu nhắn HD' : 'Đã bỏ đánh dấu');
                                                    ordersApi.patch(order.id, { hd_sent: checked }).catch((err: any) => {
                                                        reloadOrder();
                                                        toast.error(err?.response?.data?.message || 'Lỗi cập nhật');
                                                    });
                                                }}
                                                className="rounded h-4 w-4"
                                            />
                                            <span className="text-sm font-medium">Đã nhắn hướng dẫn bảo quản</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={!!(order as any).feedback_requested}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    updateOrderAfterSale({ feedback_requested: checked });
                                                    toast.success(checked ? 'Đã đánh dấu xin feedback' : 'Đã bỏ đánh dấu');
                                                    ordersApi.patch(order.id, { feedback_requested: checked }).catch((err: any) => {
                                                        reloadOrder();
                                                        toast.error(err?.response?.data?.message || 'Lỗi cập nhật');
                                                    });
                                                }}
                                                className="rounded h-4 w-4"
                                            />
                                            <span className="text-sm font-medium">Đã xin feedback khách</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tin nhắn mẫu */}
                        <div className="mt-6 p-5 bg-purple-50 border border-purple-100 rounded-xl">
                            <h3 className="text-xs font-bold text-purple-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Bot className="h-4 w-4" /> Tin nhắn mẫu cho Sale (Facebook Inbox)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {[
                                    { id: 'ship', title: '1. Xin địa chỉ Ship', getText: () => `Chào ${order.customer?.name || 'anh/chị'} ạ, giày đã xong. Anh/chị cho shop xin địa chỉ ship nhé!` },
                                    { id: 'care', title: '2. HD Bảo quản', getText: () => `Shop gửi ${order.customer?.name || 'anh/chị'} HDSD: Tránh nước, lau bằng khăn mềm định kỳ ạ.` },
                                    { id: 'feedback', title: '3. Xin Feedback', getText: () => `Dạ chào ${order.customer?.name || 'anh/chị'}, mình nhận được giày chưa ạ? Cho shop xin feedback nhé!` },
                                ].map((tmp) => (
                                    <Button
                                        key={tmp.id}
                                        variant="outline"
                                        className="h-auto py-3 px-4 justify-start text-left border-purple-200 hover:bg-white hover:shadow-md"
                                        onClick={() => {
                                            const text = tmp.getText();
                                            navigator.clipboard.writeText(text);
                                            toast.success('Đã copy tin nhắn mẫu!');
                                        }}
                                    >
                                        <Copy className="mr-2 h-4 w-4 shrink-0 text-purple-500" />
                                        <span className="text-xs font-bold text-purple-700">{tmp.title}</span>
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Lịch sử chuyển giai đoạn After sale */}
                        <div className="hidden mt-6 border-t pt-6">
                            <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
                                <History className="h-4 w-4 text-primary" /> Lịch sử chuyển bước (After sale)
                            </h3>
                            {aftersaleLogs.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic py-2">Chưa có lịch sử.</p>
                            ) : (
                                <ul className="space-y-2 max-h-64 overflow-y-auto">
                                    {aftersaleLogs.map((log: any) => {
                                        // aftersale logs are order-level; try to find a matching group,
                                        // fallback to first group in any phase since items may have moved on
                                        const aftersaleGroups = groups.filter(g => {
                                            const item = (g.product || g.services?.[0]) as any;
                                            return item?.current_phase === 'after_sale';
                                        });
                                        const matchedGroup =
                                            aftersaleGroups.find((g) => getGroupAfterSaleStage(g) === log.to_stage) ||
                                            aftersaleGroups[0] ||
                                            groups[0] ||
                                            null;
                                        return (
                                            <li key={log.id} className="text-xs flex items-center gap-2 py-1.5 border-b border-dashed last:border-0 flex-wrap">
                                                <span className="text-muted-foreground shrink-0">{formatDateTime(log.created_at)}</span>
                                                <span className="font-medium">{log.created_by_user?.name ?? 'Hệ thống'}</span>
                                                <span className="text-muted-foreground flex-1">
                                                    {log.from_stage ? `${getAfterSaleStageLabel(log.from_stage)} → ` : ''}{getAfterSaleStageLabel(log.to_stage)}
                                                </span>
                                                {matchedGroup && log.to_stage && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 px-2 text-[10px] font-bold text-purple-600 hover:text-purple-700 hover:bg-purple-50 gap-1 shrink-0"
                                                        onClick={() => onProductCardClick(matchedGroup, log.to_stage)}
                                                    >
                                                        <FileText className="h-3 w-3" />
                                                        Xem chi tiết
                                                    </Button>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
    );
}

