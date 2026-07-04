import React, { memo, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
    Layers, Loader2, ShoppingBag, Tag, FileText, Wrench, User as UserIcon,
    History, Clock, Maximize2, ExternalLink, ChevronRight, ChevronLeft
} from 'lucide-react';
import { WorkflowLogDetailDialog } from '@/components/orders/workflow/WorkflowLogDetailDialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';
import { TECH_ROOMS } from '@/components/orders/constants';
import type { Order, OrderItem } from '@/hooks/useOrders';
import { Button } from '@/components/ui/button';
import { BackwardMoveDialog } from '@/components/orders/BackwardMoveDialog';
import { toast } from 'sonner';
import { getWorkflowRequestLogDisplay, isWorkflowRequestLogAction } from '../workflowRequestLog';
import { useAuth } from '@/contexts/AuthContext';
import { canOperateWorkflow } from '@/lib/sensitivePermissions';
import {
    MobileKanbanColumnTabs,
    buildKanbanDropResult,
    type MobileKanbanColumn,
} from '@/components/kanban/mobileKanban';

interface WorkflowCardProps {
    group: { product: OrderItem | null; services: OrderItem[] };
    index: number;
    roomId: string;
    canDragWorkflow: boolean;
    orderCode: string | undefined;
    getItemCurrentStep: (itemId: string) => any;
    getStepDeadlineDisplay: (itemId: string) => { label: string; dueAt: Date | null };
    handleOpenAccessory: (item: OrderItem) => void;
    handleOpenPartner: (item: OrderItem) => void;
    handleOpenExtension: (item: OrderItem) => void;
    handleOpenAssignDialog: (item: OrderItem) => void;
    handleOpenSaleAssignDialog: (item: OrderItem) => void;
    onCardClick: (group: { product: OrderItem | null; services: OrderItem[] }, roomId: string) => void;
    handleOpenBackwardMove: (group: any) => void;
    orderExtensionRequest?: any;
    isPhoneView?: boolean;
    workflowColumns?: MobileKanbanColumn[];
    onWorkflowMove?: (result: DropResult) => void;
}

const WorkflowCard = memo(({
    group,
    index,
    roomId,
    canDragWorkflow,
    orderCode,
    getItemCurrentStep,
    getStepDeadlineDisplay,
    handleOpenAccessory,
    handleOpenPartner,
    handleOpenExtension,
    handleOpenAssignDialog,
    handleOpenSaleAssignDialog,
    onCardClick,
    handleOpenBackwardMove,
    orderExtensionRequest,
    isPhoneView = false,
    workflowColumns = [],
    onWorkflowMove,
}: WorkflowCardProps) => {
    const productName = group.product?.item_name ?? group.services[0]?.item_name ?? '—';
    const productItem = group.product as any;
    const productImages = productItem?.product_images ?? (productItem?.product?.image ? [productItem.product.image] : []);
    const hasProductDetails = group.product && (productItem?.product_type || productItem?.product_brand || productItem?.product_color || productItem?.product_size || productItem?.product_material || productItem?.product_condition_before || productItem?.product_notes);
    const cardKey = group.product?.id ?? group.services.map((s) => s.id).join('-');

    const leadItem = group.services.find((s) => getItemCurrentStep(s.id)) ?? group.services[0];
    const workflowActionItem = group.product || leadItem;
    // Isolation logic: only use orderExtensionRequest if it's truly global (no item IDs)
    const extensionRequest = productItem?.extension_request || (leadItem as any)?.extension_request || orderExtensionRequest;
    const stepDeadline = leadItem ? getStepDeadlineDisplay(leadItem.id) : { label: 'N/A', dueAt: null };
    const itemLate = stepDeadline.dueAt ? stepDeadline.dueAt < new Date() : false;
    const currentStep = leadItem ? getItemCurrentStep(leadItem.id) : null;
    const isSlaPaused = stepDeadline.label === 'Đang chờ duyệt' || stepDeadline.label === '⏸ Đang tạm dừng';

    const colIdx = workflowColumns.findIndex((c) => c.id === roomId);
    const prevCol = colIdx > 0 ? workflowColumns[colIdx - 1] : null;
    const nextCol =
        colIdx >= 0 && colIdx < workflowColumns.length - 1 ? workflowColumns[colIdx + 1] : null;

    const tryMoveTo = (destId: string) => {
        if (!onWorkflowMove || destId === roomId) return;
        if (!canDragWorkflow || isSlaPaused) {
            toast.error(
                isSlaPaused
                    ? 'Đang chờ duyệt — không thể chuyển bước'
                    : 'Chỉ Sale/Quản lý mới chuyển bước trên Kanban'
            );
            return;
        }
        onWorkflowMove(buildKanbanDropResult(cardKey, roomId, destId, index, 0));
    };

    const isCardDragDisabled =
        !canDragWorkflow || roomId === 'done' || roomId === 'fail' || isSlaPaused || isPhoneView;

    return (
        <Draggable key={cardKey} draggableId={cardKey} index={index} isDragDisabled={isCardDragDisabled}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...(isPhoneView ? {} : provided.dragHandleProps)}
                    className={cn(
                        "bg-white rounded-xl shadow-sm p-3 mb-3 border-l-4 transition-all sm:p-4",
                        isCardDragDisabled && !isPhoneView ? "cursor-not-allowed opacity-75" : isPhoneView ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                        snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20 scale-105" : "",
                        itemLate && roomId !== 'done' ? (
                            (extensionRequest?.status === 'pending' || extensionRequest?.status === 'requested') ? "border-amber-400 bg-amber-50/50 border-dashed" : "border-red-500 bg-red-50/30"
                        ) :
                            isSlaPaused ? "border-purple-400 bg-purple-50/50" :
                            roomId === 'done' ? "border-green-500" :
                                roomId === 'fail' ? "border-red-400" : "border-blue-400"
                    )}
                    onClick={() => onCardClick(group, roomId)}
                >
                    <div className="flex min-w-0 justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-gray-400">#{orderCode ?? cardKey?.slice(0, 8)}</span>
                    </div>

                    <div className="min-w-0 space-y-2 mb-3">
                        {productImages?.length > 0 && (
                            <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-video w-full max-h-24 sm:max-h-28">
                                <img src={productImages[0]} alt={productName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                        )}
                        <h3 className="font-bold text-gray-800 text-[13px] flex min-w-0 items-center gap-1.5 flex-wrap">
                            <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 truncate">{productName}</span>
                            {extensionRequest && (
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-[9px] py-0 h-3.5 gap-1 shrink-0",
                                        (extensionRequest.status === 'pending' || extensionRequest.status === 'requested') ? "bg-amber-50 text-amber-600 border-amber-200 animate-pulse" :
                                            extensionRequest.status === 'manager_approved' ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                                                "bg-blue-50 text-blue-600 border-blue-200"
                                    )}
                                >
                                    <Clock className="h-2 w-2" />
                                    {(extensionRequest.status === 'pending' || extensionRequest.status === 'requested') ? 'Chờ gia hạn' : 'Đã gia hạn'}
                                </Badge>
                            )}
                            {group.product?.due_at && (
                                <Badge variant="outline" className="text-[9px] py-0 h-3.5 bg-orange-50 text-orange-600 border-orange-200 gap-1 shrink-0">
                                    <Clock className="h-2 w-2" />
                                    {new Date(group.product.due_at).toLocaleDateString('vi-VN')}
                                </Badge>
                            )}
                        </h3>
                        {hasProductDetails && (
                            <div className="grid grid-cols-1 gap-1 text-[11px] text-gray-600">
                                {productItem?.product_type && (
                                    <div className="flex min-w-0 items-center gap-1.5"><Tag className="h-3 w-3 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate">Loại: {productItem.product_type}</span></div>
                                )}
                                {productItem?.product_brand && (
                                    <div className="flex min-w-0 items-center gap-1.5"><Tag className="h-3 w-3 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate">Hãng: {productItem.product_brand}</span></div>
                                )}
                                {productItem?.product_notes && (
                                    <div className="flex min-w-0 items-center gap-1.5"><FileText className="h-3 w-3 shrink-0 text-muted-foreground" /><span className="min-w-0 line-clamp-1">Ghi chú: {productItem.product_notes}</span></div>
                                )}
                            </div>
                        )}
                    </div>

                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Dịch vụ</p>
                    <ul className="space-y-1">
                        {group.services.map((svc) => {
                            const isLeadService = leadItem?.id === svc.id;
                            const svcTechnicians = (svc as any).technicians;
                            const svcTechSingle = (svc as any).technician;
                            const techNames = svcTechnicians?.length > 0
                                ? svcTechnicians.map((t: any) => t.technician?.name).filter(Boolean).join(', ') || '—'
                                : svcTechSingle?.name || '—';
                            return (
                                <li key={svc.id} className={cn("min-w-0 rounded-md px-2 py-1", isLeadService ? "bg-primary/5 border border-primary/20" : "")}>
                                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-gray-700">
                                        <Wrench className="h-3 w-3 shrink-0 text-primary/60" />
                                        <span className="min-w-0 truncate">{svc.item_name}</span>
                                    </div>
                                    <div
                                        className="flex min-w-0 items-center gap-1.5 text-[10px] text-gray-500 mt-0.5 cursor-pointer hover:text-primary transition-colors"
                                        title="Nhấn để phân công/đổi kỹ thuật viên"
                                        onClick={(e) => { e.stopPropagation(); handleOpenAssignDialog(svc); }}
                                    >
                                        <UserIcon className="h-2.5 w-2.5 shrink-0" />
                                        <span className="min-w-0 truncate">KT: {techNames}</span>
                                    </div>
                                    <div
                                        className="flex min-w-0 items-center gap-1.5 text-[10px] text-amber-500 mt-0.5 cursor-pointer hover:text-amber-600 transition-colors"
                                        title="Nhấn để phân công/đổi kinh doanh"
                                        onClick={(e) => { e.stopPropagation(); handleOpenSaleAssignDialog(svc); }}
                                    >
                                        <Tag className="h-2.5 w-2.5 shrink-0" />
                                        <span className="min-w-0 truncate">Sale: {(svc as any).sales?.length > 0 ? (svc as any).sales.map((s: any) => s.sale?.name || (s as any).name).join(', ') : '—'}</span>
                                    </div>
                                    {isLeadService && currentStep && (
                                        <div className="mt-1.5 pt-1.5 border-t border-primary/10">
                                            <p className="text-[10px] text-primary font-semibold">Bước: {currentStep.step_name}</p>
                                            <p className="text-[10px] text-muted-foreground">{currentStep.status === 'in_progress' ? 'Đang thực hiện' : currentStep.status === 'assigned' ? 'Đã phân công' : currentStep.status}</p>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    {roomId !== 'done' && roomId !== 'fail' && (
                        <>
                            <div className="mt-2 flex items-center justify-between text-[11px]">
                                <span className="text-gray-500">Hết hạn bước:</span>
                                <div className="flex items-center gap-1">
                                    <span className={cn("font-semibold", 
                                        isSlaPaused ? "text-purple-600" :
                                        itemLate ? "text-red-600" : stepDeadline.dueAt ? "text-emerald-600" : "text-gray-400")}>
                                        {stepDeadline.label}
                                    </span>
                                    {isSlaPaused && (
                                        <Clock className="h-3 w-3 text-purple-500 animate-pulse" />
                                    )}
                                    {extensionRequest?.status === 'manager_approved' && (
                                        <History className="h-3 w-3 text-emerald-500" />
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 pt-2 border-t border-gray-100 grid grid-cols-3 gap-1">
                                <button
                                    type="button"
                                    disabled={!canDragWorkflow}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const targetItem = group.product || leadItem;
                                        if (!canDragWorkflow || !targetItem) return;
                                        handleOpenAccessory(targetItem);
                                    }}
                                    className={cn(
                                        "inline-flex items-center justify-center p-1 px-1 rounded-md text-[9px] font-bold transition-all h-7",
                                        !canDragWorkflow && "opacity-50 cursor-not-allowed",
                                        (workflowActionItem as any)?.accessory?.status === 'requested' ? "bg-amber-50 text-amber-600 border-amber-200 animate-pulse" :
                                            "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                    )}
                                >
                                    <span className="truncate">
                                        {(workflowActionItem as any)?.accessory?.status === 'requested' ? 'Đang chờ PK' :
                                            'Mua PK'}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    disabled={!canDragWorkflow}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const targetItem = group.product || leadItem;
                                        if (!canDragWorkflow || !targetItem) return;
                                        handleOpenPartner(targetItem);
                                    }}
                                    className={cn(
                                        "inline-flex items-center justify-center p-1 px-1 rounded-md text-[9px] font-bold transition-all h-7",
                                        !canDragWorkflow && "opacity-50 cursor-not-allowed",
                                        (workflowActionItem as any)?.partner?.status === 'requested' ? "bg-amber-50 text-amber-600 border-amber-200 animate-pulse" :
                                            "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                    )}
                                >
                                    <span className="truncate">
                                        {(workflowActionItem as any)?.partner?.status === 'requested' ? 'Đang chờ ĐT' :
                                            'Gửi ĐT'}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    disabled={!canDragWorkflow}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!canDragWorkflow || !leadItem) return;
                                        handleOpenExtension(leadItem);
                                    }}
                                    className={cn(
                                        "inline-flex items-center justify-center p-1 px-1 rounded-md text-[9px] font-bold transition-all h-7",
                                        !canDragWorkflow && "opacity-50 cursor-not-allowed",
                                        (extensionRequest?.status === 'pending' || extensionRequest?.status === 'requested') ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 animate-pulse" :
                                            extensionRequest?.status === 'manager_approved' ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" :
                                                "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                    )}
                                >
                                    <span className="truncate">
                                        {(extensionRequest?.status === 'pending' || extensionRequest?.status === 'requested') ? 'Đang xin GH' :
                                            extensionRequest?.status === 'manager_approved' ? 'Xem hạn mới' :
                                                'Gia hạn'}
                                    </span>
                                </button>
                                {onWorkflowMove && (prevCol || nextCol) && (
                                    <div
                                        className="col-span-3 mt-2 hidden max-md:block"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-primary">
                                                Chuyển trạng thái
                                            </p>
                                            <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    disabled={!prevCol || !canDragWorkflow || isSlaPaused}
                                                    className="h-10 w-11 rounded-lg border-primary/25 bg-white text-primary disabled:opacity-40"
                                                    aria-label={prevCol ? `Về ${prevCol.title}` : 'Không có bước trước'}
                                                    onClick={() => prevCol && tryMoveTo(prevCol.id)}
                                                >
                                                    <ChevronLeft className="h-4 w-4" />
                                                </Button>
                                                <select
                                                    className="h-10 min-w-0 rounded-lg border border-input bg-white px-3 text-center text-xs font-semibold text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                                                    defaultValue=""
                                                    disabled={!canDragWorkflow || isSlaPaused}
                                                    aria-label="Chọn phòng chuyển trạng thái"
                                                    onChange={(e) => {
                                                        const destId = e.target.value;
                                                        if (destId) tryMoveTo(destId);
                                                        e.target.value = '';
                                                    }}
                                                >
                                                    <option value="" disabled>
                                                        Chọn phòng khác...
                                                    </option>
                                                    {workflowColumns
                                                        .filter((column) => column.id !== roomId)
                                                        .map((column) => (
                                                            <option key={column.id} value={column.id}>
                                                                {column.title}
                                                            </option>
                                                        ))}
                                                </select>
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    disabled={!nextCol || !canDragWorkflow || isSlaPaused}
                                                    className="h-10 w-11 rounded-lg shadow-sm disabled:opacity-40"
                                                    aria-label={nextCol ? `Sang ${nextCol.title}` : 'Không có bước sau'}
                                                    onClick={() => nextCol && tryMoveTo(nextCol.id)}
                                                >
                                                    <ChevronRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <div className="mt-1.5 grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2 text-[10px] text-muted-foreground">
                                                <span className="truncate text-center">{prevCol ? prevCol.title : '—'}</span>
                                                <span className="truncate text-center font-medium text-primary">{roomId === 'done' || roomId === 'fail' ? 'Đã kết thúc' : 'Đang ở bước này'}</span>
                                                <span className="truncate text-center">{nextCol ? nextCol.title : '—'}</span>
                                            </div>
                                        </div>
                                        {roomId === 'waiting' && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={!canDragWorkflow}
                                                className="mt-2 h-9 w-full gap-1 text-[11px] border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!canDragWorkflow) return;
                                                    handleOpenBackwardMove(group);
                                                }}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                                Trả về Sales
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </Draggable>
    );
});

WorkflowCard.displayName = 'WorkflowCard';

interface WorkflowColumnProps {
    room: { id: string; title: string };
    groups: { product: OrderItem | null; services: OrderItem[] }[];
    canDragWorkflow: boolean;
    orderCode: string | undefined;
    getItemCurrentStep: (itemId: string) => any;
    getStepDeadlineDisplay: (itemId: string) => { label: string; dueAt: Date | null };
    handleOpenAccessory: (item: OrderItem) => void;
    handleOpenPartner: (item: OrderItem) => void;
    handleOpenExtension: (item: OrderItem) => void;
    handleOpenAssignDialog: (item: OrderItem) => void;
    handleOpenSaleAssignDialog: (item: OrderItem) => void;
    onCardClick: (group: { product: OrderItem | null; services: OrderItem[] }, roomId: string) => void;
    handleOpenBackwardMove: (group: any) => void;
    orderExtensionRequest?: any;
    workflowColumns?: MobileKanbanColumn[];
    onWorkflowMove?: (result: DropResult) => void;
}

const WorkflowColumn = ({
    room,
    groups,
    canDragWorkflow,
    orderCode,
    getItemCurrentStep,
    getStepDeadlineDisplay,
    handleOpenAccessory,
    handleOpenPartner,
    handleOpenExtension,
    handleOpenAssignDialog,
    handleOpenSaleAssignDialog,
    onCardClick,
    handleOpenBackwardMove,
    orderExtensionRequest,
    workflowColumns = [],
    onWorkflowMove,
}: WorkflowColumnProps) => {
    return (
        <div className="flex flex-col min-w-[240px]">
            <div className="flex justify-between items-center mb-4 px-2">
                <h2 className={cn(
                    "font-bold uppercase text-xs tracking-widest",
                    room.id === 'done' ? "text-green-600" :
                        room.id === 'fail' ? "text-red-500" : "text-blue-700"
                )}>
                    {room.title}
                </h2>
                <span className="bg-gray-200 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                    {groups.length}
                </span>
            </div>

            <Droppable droppableId={room.id}>
                {(provided, snapshot) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                            "min-h-[300px] p-2 rounded-xl flex-1 border-2 border-dashed transition-colors",
                            snapshot.isDraggingOver ? "bg-blue-50 border-blue-300" : "bg-gray-100 border-transparent"
                        )}
                    >
                        {groups.map((group, index) => (
                            <WorkflowCard
                                key={group.product?.id ?? group.services.map((s) => s.id).join('-')}
                                group={group}
                                index={index}
                                roomId={room.id}
                                canDragWorkflow={canDragWorkflow}
                                orderCode={orderCode}
                                getItemCurrentStep={getItemCurrentStep}
                                getStepDeadlineDisplay={getStepDeadlineDisplay}
                                handleOpenAccessory={handleOpenAccessory}
                                handleOpenPartner={handleOpenPartner}
                                handleOpenExtension={handleOpenExtension}
                                handleOpenAssignDialog={handleOpenAssignDialog}
                                handleOpenSaleAssignDialog={handleOpenSaleAssignDialog}
                                onCardClick={onCardClick}
                                handleOpenBackwardMove={handleOpenBackwardMove}
                                orderExtensionRequest={orderExtensionRequest}
                                workflowColumns={workflowColumns}
                                onWorkflowMove={onWorkflowMove}
                            />
                        ))}
                        {provided.placeholder}
                        {groups.length === 0 && !snapshot.isDraggingOver && (
                            <div className="flex items-center justify-center h-20 text-muted-foreground text-xs italic">
                                Trống
                            </div>
                        )}
                    </div>
                )}
            </Droppable>
        </div>
    );
};

interface WorkflowTabProps {
    order: Order | null;
    isPhoneView?: boolean;
    stepsLoading: boolean;
    allWorkflowSteps: any[];
    workflowKanbanGroups: { product: OrderItem | null; services: OrderItem[] }[];
    workflowLogs: any[];
    salesLogs: any[];
    onWorkflowDragEnd: (result: DropResult) => void;
    getGroupCurrentTechRoom: (group: any) => string;
    getItemCurrentStep: (itemId: string) => any;
    getStepDeadlineDisplay: (itemId: string) => { label: string; dueAt: Date | null };
    handleOpenAccessory: (item: OrderItem) => void;
    handleOpenPartner: (item: OrderItem) => void;
    handleOpenExtension: (item: OrderItem) => void;
    handleOpenAssignDialog: (item: OrderItem) => void;
    handleOpenSaleAssignDialog: (item: OrderItem) => void;
    onProductCardClick: (group: { product: OrderItem | null; services: OrderItem[] }, roomId: string) => void;
    updateOrderItemStatus: (id: string, status: string, reason?: string, photos?: string[], notes?: string) => Promise<void>;
    fetchKanbanLogs: (orderId: string) => Promise<void>;
}

export function WorkflowTab({
    order,
    isPhoneView = false,
    stepsLoading,
    allWorkflowSteps,
    workflowKanbanGroups,
    workflowLogs,
    salesLogs,
    onWorkflowDragEnd,
    getGroupCurrentTechRoom,
    getItemCurrentStep,
    getStepDeadlineDisplay,
    handleOpenAccessory,
    handleOpenPartner,
    handleOpenExtension,
    handleOpenAssignDialog,
    handleOpenSaleAssignDialog,
    onProductCardClick,
    updateOrderItemStatus,
    fetchKanbanLogs
}: WorkflowTabProps) {
    const { user } = useAuth();
    const [selectedLogDetail, setSelectedLogDetail] = useState<any>(null);
    const [showLogDetailDialog, setShowLogDetailDialog] = useState(false);
    const [showBackwardMoveDialog, setShowBackwardMoveDialog] = useState(false);
    const [backwardMoveGroup, setBackwardMoveGroup] = useState<any>(null);
    const [viewLogData, setViewLogData] = useState<any>(null);
    const [mobileRoomId, setMobileRoomId] = useState('waiting');
    const mobileScrollRef = useRef<HTMLDivElement>(null);
    const mobileRoomInitializedRef = useRef(false);

    const canDragWorkflow = canOperateWorkflow(user);

    const scrollToWorkflowRoom = useCallback((roomId: string) => {
        setMobileRoomId(roomId);
        const container = mobileScrollRef.current;
        if (!container) return;
        const el = container.querySelector<HTMLElement>(`[data-kanban-col="${roomId}"]`);
        if (el) {
            container.scrollTo({ left: el.offsetLeft - container.offsetLeft, behavior: 'smooth' });
        }
    }, []);

    const handleOpenBackwardMove = (group: any) => {
        setBackwardMoveGroup(group);
        setShowBackwardMoveDialog(true);
    };

    const handleBackwardMoveConfirm = async (reason: string, photos: string[], notes?: string) => {
        if (!backwardMoveGroup || !order?.id) return;
        const itemId = backwardMoveGroup.product?.id || backwardMoveGroup.services?.[0]?.id;
        if (!itemId) return;

        try {
            await updateOrderItemStatus(itemId, 'step4', reason, photos, notes);
            toast.success('Đã chuyển sản phẩm về Sales');
            await fetchKanbanLogs(order.id);
        } catch (error) {
            console.error('Backward move error:', error);
        }
    };

    const displayLogs = useMemo(() => {
        const STEPS_AFTER_STEP4 = ['step5', 'in_progress', 'done'];
        const logs = [
            ...workflowLogs.filter((l: any) => 
                l.action === 'assigned' || l.action === 'failed' || isWorkflowRequestLogAction(l.action)
            ),
            ...salesLogs.filter((l: any) =>
                l.to_status === 'step4' &&
                STEPS_AFTER_STEP4.includes(l.from_status)
            ).map((l: any) => {
                const item = order?.items?.find((i: any) => i.id === l.entity_id);
                return {
                    ...l,
                    action: 'backward_move',
                    step_name: 'Trả về Sales',
                    product_info: item ? `${item.item_code} - ${item.item_name}` : ''
                };
            })
        ];
        const sorted = logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Annotate each _requested log with its outcome
        // Strategy 1: find corresponding _approved/_rejected log in the list (new data)
        // Strategy 2: fall back to current item.accessory/partner.status from order.items (old data)
        const REQUEST_TYPE_MAP: Record<string, string> = {
            'accessory_requested': 'accessory',
            'partner_requested': 'partner',
            'extension_requested': 'extension',
        };
        return sorted.map((log: any) => {
            if (log.action && log.action.endsWith('_requested') && REQUEST_TYPE_MAP[log.action]) {
                const type = REQUEST_TYPE_MAP[log.action];
                // Strategy 1: look for a matching log entry
                const approvedLog = sorted.find((l: any) => l.action === `${type}_approved` && l.entity_id === log.entity_id);
                const rejectedLog = sorted.find((l: any) => l.action === `${type}_rejected` && l.entity_id === log.entity_id);
                if (approvedLog || rejectedLog) {
                    return {
                        ...log,
                        _outcome: rejectedLog ? 'rejected' : 'approved'
                    };
                }
                // Strategy 2: look at current accessory/partner status on the order item
                const item = order?.items?.find((i: any) => i.id === log.entity_id);
                if (item) {
                    if (type === 'accessory') {
                        const accStatus = (item as any).accessory?.status;
                        if (accStatus === 'rejected' || accStatus === 'cancelled') return { ...log, _outcome: 'rejected' };
                        if (accStatus && accStatus !== 'requested') return { ...log, _outcome: 'approved' };
                    } else if (type === 'partner') {
                        const partnerStatus = (item as any).partner?.status;
                        if (partnerStatus === 'rejected' || partnerStatus === 'cancelled') return { ...log, _outcome: 'rejected' };
                        if (partnerStatus && partnerStatus !== 'requested') return { ...log, _outcome: 'approved' };
                    } else if (type === 'extension') {
                        const extStatus = (item as any).extension_request?.status;
                        if (extStatus === 'rejected') return { ...log, _outcome: 'rejected' };
                        if (extStatus === 'manager_approved' || extStatus === 'notified_tech') return { ...log, _outcome: 'approved' };
                    }
                }
                return { ...log, _outcome: 'pending' };
            }
            return log;
        });
    }, [workflowLogs, salesLogs, order]);

    // if (order?.status === 'done') return null;
    // We now allow viewing workflow history even for completed orders.

    const rooms = useMemo(() => [
        { id: 'waiting', title: 'Chờ phân công' },
        ...TECH_ROOMS,
        { id: 'done', title: 'Hoàn thành' },
        { id: 'fail', title: 'Thất bại' }
    ], []);

    const filteredGroups = useMemo(() => {
        return workflowKanbanGroups.filter(g => {
            const leadItem = g.product || g.services?.[0];
            return (leadItem as any)?.current_phase === 'workflow';
        });
    }, [workflowKanbanGroups]);

    const groupsByRoom = useMemo(() => {
        const map: Record<string, typeof workflowKanbanGroups> = {};
        rooms.forEach(r => { map[r.id] = []; });
        filteredGroups.forEach(g => {
            const roomId = getGroupCurrentTechRoom(g);
            if (map[roomId]) map[roomId].push(g);
        });
        return map;
    }, [filteredGroups, getGroupCurrentTechRoom, rooms]);

    const workflowColumns = useMemo(
        (): MobileKanbanColumn[] => rooms.map((r) => ({ id: r.id, title: r.title })),
        [rooms]
    );

    // Mobile: chỉ tự chọn cột có card lần đầu, không ép người dùng quay lại khi bấm cột rỗng.
    useEffect(() => {
        if (mobileRoomInitializedRef.current) return;
        if (!filteredGroups.length) return;

        mobileRoomInitializedRef.current = true;
        if ((groupsByRoom[mobileRoomId] || []).length > 0) return;
        const firstWithCards = rooms.find((r) => (groupsByRoom[r.id] || []).length > 0);
        if (firstWithCards) scrollToWorkflowRoom(firstWithCards.id);
    }, [filteredGroups.length, groupsByRoom, mobileRoomId, rooms, scrollToWorkflowRoom]);

    useEffect(() => {
        const container = mobileScrollRef.current;
        if (!container) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                        const roomId = (entry.target as HTMLElement).dataset.kanbanCol;
                        if (roomId) setMobileRoomId(roomId);
                    }
                }
            },
            { root: container, threshold: 0.55 }
        );

        container.querySelectorAll('[data-kanban-col]').forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [filteredGroups, groupsByRoom]);

    const handleWorkflowMove = (result: DropResult) => {
        if (!canDragWorkflow) {
            toast.error('Chỉ Sale/Quản lý mới chuyển bước trên Kanban');
            return;
        }
        if (!result.destination) return;
        onWorkflowDragEnd(result);
    };

    return (
        <TabsContent value="workflow">
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                            <Layers className="h-4 w-4 text-primary md:h-5 md:w-5" />
                            <span className="md:hidden">Quy trình</span>
                            <span className="hidden md:inline">Tiến trình / Quy trình – 3 phòng</span>
                        </CardTitle>
                        <p className="hidden text-sm text-muted-foreground md:block">
                            Dịch vụ theo quy trình gồm các phòng Mạ, Dán đế, Da. Sau khi KTV xác nhận hoàn thành bước, dịch vụ sẽ được chuyển sang phòng tiếp theo.
                        </p>
                    </CardHeader>
                    <CardContent className="min-w-0 overflow-visible">
                        {stepsLoading && !order?.items?.length ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <span className="ml-3 text-muted-foreground">Đang tải...</span>
                            </div>
                        ) : !order?.items?.length ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>Đơn hàng chưa có hạng mục nào.</p>
                            </div>
                        ) : (
                            <div className="pb-4">
                                {/* Mobile: cột ngang + vuốt + nút chuyển trạng thái trên card */}
                                <div className="mb-4 min-w-0 space-y-2 md:hidden">
                                    <MobileKanbanColumnTabs
                                        columns={workflowColumns}
                                        activeId={mobileRoomId}
                                        onChange={scrollToWorkflowRoom}
                                        getCount={(id) => (groupsByRoom[id] || []).length}
                                        hint="Vuốt ngang giữa các cột hoặc chọn tab →"
                                    />
                                    <DragDropContext onDragEnd={handleWorkflowMove}>
                                        <div
                                            ref={mobileScrollRef}
                                            className="kanban-scroll-container no-scrollbar -mx-1 px-1 touch-pan-x"
                                        >
                                            {rooms.map((room) => {
                                                const mobileGroups = groupsByRoom[room.id] || [];
                                                return (
                                                    <div
                                                        key={room.id}
                                                        data-kanban-col={room.id}
                                                        className="flex min-h-[280px] flex-col"
                                                    >
                                                        <div className="mb-2 flex items-center justify-between px-1">
                                                            <h2
                                                                className={cn(
                                                                    'text-xs font-bold uppercase tracking-wide',
                                                                    room.id === 'done'
                                                                        ? 'text-green-600'
                                                                        : room.id === 'fail'
                                                                          ? 'text-red-500'
                                                                          : 'text-blue-700'
                                                                )}
                                                            >
                                                                {room.title}
                                                            </h2>
                                                            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                                                                {mobileGroups.length}
                                                            </span>
                                                        </div>
                                                        <Droppable droppableId={room.id}>
                                                            {(provided, snapshot) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.droppableProps}
                                                                    className={cn(
                                                                        'min-h-[220px] flex-1 rounded-xl border-2 border-dashed p-2 transition-colors',
                                                                        snapshot.isDraggingOver
                                                                            ? 'border-primary/40 bg-primary/5'
                                                                            : 'border-transparent bg-gray-100'
                                                                    )}
                                                                >
                                                                    {mobileGroups.map((group, index) => (
                                                                        <WorkflowCard
                                                                            key={
                                                                                group.product?.id ??
                                                                                group.services.map((s) => s.id).join('-')
                                                                            }
                                                                            group={group}
                                                                            index={index}
                                                                            roomId={room.id}
                                                                            canDragWorkflow={canDragWorkflow}
                                                                            orderCode={order?.order_code}
                                                                            getItemCurrentStep={getItemCurrentStep}
                                                                            getStepDeadlineDisplay={getStepDeadlineDisplay}
                                                                            handleOpenAccessory={handleOpenAccessory}
                                                                            handleOpenPartner={handleOpenPartner}
                                                                            handleOpenExtension={handleOpenExtension}
                                                                            handleOpenAssignDialog={handleOpenAssignDialog}
                                                                            handleOpenSaleAssignDialog={handleOpenSaleAssignDialog}
                                                                            onCardClick={onProductCardClick}
                                                                            handleOpenBackwardMove={handleOpenBackwardMove}
                                                                            orderExtensionRequest={order?.extension_request}
                                                                            isPhoneView
                                                                            workflowColumns={workflowColumns}
                                                                            onWorkflowMove={handleWorkflowMove}
                                                                        />
                                                                    ))}
                                                                    {provided.placeholder}
                                                                    {mobileGroups.length === 0 && !snapshot.isDraggingOver && (
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
                                    </DragDropContext>
                                </div>
                                <DragDropContext onDragEnd={(result) => {
                                    if (!canDragWorkflow) return;
                                    if (!result.destination) return;
                                    onWorkflowDragEnd(result);
                                }}>
                                    <div className="hidden gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-6 md:min-w-[1200px]">
                                        {rooms.map((room) => (
                                            <WorkflowColumn
                                                key={room.id}
                                                room={room}
                                                groups={groupsByRoom[room.id] || []}
                                                canDragWorkflow={canDragWorkflow}
                                                orderCode={order?.order_code}
                                                getItemCurrentStep={getItemCurrentStep}
                                                getStepDeadlineDisplay={getStepDeadlineDisplay}
                                                handleOpenAccessory={handleOpenAccessory}
                                                handleOpenPartner={handleOpenPartner}
                                                handleOpenExtension={handleOpenExtension}
                                                handleOpenAssignDialog={handleOpenAssignDialog}
                                                handleOpenSaleAssignDialog={handleOpenSaleAssignDialog}
                                                onCardClick={onProductCardClick}
                                                handleOpenBackwardMove={handleOpenBackwardMove}
                                                orderExtensionRequest={order?.extension_request}
                                                workflowColumns={workflowColumns}
                                                onWorkflowMove={handleWorkflowMove}
                                            />
                                        ))}
                                    </div>
                                </DragDropContext>
                                {allWorkflowSteps.length > 0 && (
                                    <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm text-muted-foreground">
                                                {allWorkflowSteps.filter((s: any) => s.status === 'completed').length} / {allWorkflowSteps.length} bước hoàn thành
                                            </span>
                                        </div>
                                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500"
                                                style={{
                                                    width: allWorkflowSteps.length
                                                        ? `${(allWorkflowSteps.filter((s: any) => s.status === 'completed').length / allWorkflowSteps.length) * 100}%`
                                                        : '0%'
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="hidden mt-6 border-t pt-6">
                                    <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
                                        <History className="h-4 w-4 text-primary" /> Lịch sử chuyển bước (Quy trình)
                                    </h3>
                                    {displayLogs.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic py-2">Chưa có lịch sử dời phòng.</p>
                                    ) : (
                                        <ul className="space-y-2 max-h-48 overflow-y-auto">
                                            {displayLogs.map((log: any) => (
                                                <li key={log.id} className="text-xs py-2 border-b border-dashed last:border-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-muted-foreground shrink-0">{formatDateTime(log.created_at)}</span>
                                                        <span className="font-bold text-primary/80">{log.created_by_user?.name ?? 'Hệ thống'}</span>
                                                        <span className="text-muted-foreground">
                                                            {log.action === 'backward_move' ? (
                                                                <span className="text-orange-600 font-bold">
                                                                    {log.product_info}: {log.step_name}
                                                                </span>
                                                            ) : isWorkflowRequestLogAction(log.action) ? (
                                                                (() => {
                                                                    const display = getWorkflowRequestLogDisplay(log.action);
                                                                    if (!display) return null;
                                                                    const detail = log.reason || log.notes;
                                                                    const isRequested = log.action.endsWith('_requested');
                                                                    const outcome = log._outcome as 'approved' | 'rejected' | 'pending' | undefined;
                                                                    return (
                                                                    <span className={cn('font-medium inline-flex items-center gap-1.5 flex-wrap', display.listClass)}>
                                                                            {display.label}
                                                                            {detail ? `: ${detail}` : ''}
                                                                            {isRequested && outcome === 'approved' && (
                                                                                <span className="inline-flex items-center text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200 rounded px-1.5 py-0">Đã duyệt</span>
                                                                            )}
                                                                            {isRequested && outcome === 'rejected' && (
                                                                                <span className="inline-flex items-center text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200 rounded px-1.5 py-0">Bị từ chối</span>
                                                                            )}
                                                                            {isRequested && outcome === 'pending' && (
                                                                                <span className="inline-flex items-center text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0">Đang chờ</span>
                                                                            )}
                                                                        </span>
                                                                    );
                                                                })()
                                                            ) : log.order_item_step_id ? (
                                                                <span className={log.action === 'failed' ? "text-red-500" : "text-blue-700 font-medium"}>
                                                                    {log.action === 'failed' && <span className="mr-1 font-bold">THẤT BẠI:</span>}
                                                                    {log.step_name}
                                                                </span>
                                                            ) : (
                                                                `${log.from_status || log.from_stage || 'START'} → ${log.to_status || log.to_stage}`
                                                            )}
                                                        </span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 px-2 ml-auto text-[10px] text-primary hover:bg-primary/10 font-bold border border-primary/20 rounded-md"
                                                            onClick={() => {
                                                                if (log.action === 'backward_move') {
                                                                    // Set data for BackwardMoveDialog view mode
                                                                    const groupName = workflowKanbanGroups?.find(g =>
                                                                        g.product?.id === log.entity_id || g.services.some(s => s.id === log.entity_id)
                                                                    )?.product?.item_name || 'Sản phẩm';

                                                                    setViewLogData({
                                                                        reason: log.reason,
                                                                        photos: log.photos || [],
                                                                        notes: log.notes,
                                                                        itemName: groupName
                                                                    });
                                                                } else {
                                                                    setSelectedLogDetail(log);
                                                                    setShowLogDetailDialog(true);
                                                                }
                                                            }}
                                                        >
                                                            <Maximize2 className="h-3 w-3 mr-1" />
                                                            Chi tiết
                                                        </Button>
                                                    </div>

                                                    {log.action === 'assigned' && (
                                                        <div className="mt-1.5 ml-1 space-y-1 bg-blue-50/50 p-2 rounded-lg border border-blue-50">
                                                            {log.reason && (
                                                                <div className="flex gap-2">
                                                                    <span className="font-semibold text-gray-500 min-w-[65px]">Lý do:</span>
                                                                    <span className="text-gray-700">{log.reason}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex gap-2">
                                                                <span className="font-semibold text-gray-500 min-w-[65px]">KTV:</span>
                                                                <span className="font-medium text-blue-700">{log.assigned_tech?.name || 'Chưa phân công'}</span>
                                                            </div>
                                                            {log.deadline_days > 0 && (
                                                                <div className="flex gap-2">
                                                                    <span className="font-semibold text-gray-500 min-w-[65px]">Hạn:</span>
                                                                    <span className="text-gray-700">{log.deadline_days} ngày</span>
                                                                </div>
                                                            )}
                                                            {log.notes && (
                                                                <div className="flex gap-2 mt-1 pt-1 border-t border-blue-100/50">
                                                                    <span className="font-semibold text-gray-500 min-w-[65px]">Ghi chú:</span>
                                                                    <span className="text-gray-700 italic">{log.notes}</span>
                                                                </div>
                                                            )}
                                                            {log.photos && log.photos.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-blue-100/50">
                                                                    {log.photos.map((url: string, idx: number) => (
                                                                        <a key={idx} href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                                                            <img src={url} alt={`Evidence ${idx}`} className="h-8 w-8 object-cover rounded shadow-sm border border-gray-200" />
                                                                        </a>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {log.action === 'failed' && log.notes && (
                                                        <div className="mt-1.5 ml-1 bg-red-50 p-2 rounded-lg border border-red-100 text-red-700 italic flex flex-col gap-1">
                                                            <span>{log.notes}</span>
                                                            {log.photos && log.photos.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-red-100">
                                                                    {log.photos.map((url: string, idx: number) => (
                                                                        <a key={idx} href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                                                            <img src={url} alt={`Evidence ${idx}`} className="h-8 w-8 object-cover rounded shadow-sm border border-red-200" />
                                                                        </a>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {isWorkflowRequestLogAction(log.action) && log.action.endsWith('_rejected') && (
                                                        <div className="mt-1.5 ml-1 bg-red-50 p-2 rounded-lg border border-red-200 flex flex-col gap-1">
                                                            <div className="flex items-center gap-1.5 font-semibold text-red-700 text-[11px]">
                                                                <span>Không được duyệt</span>
                                                            </div>
                                                            {(log.reason || log.notes) && (
                                                                <div className="flex gap-2 text-[11px]">
                                                                    <span className="font-semibold text-gray-500 min-w-[50px]">Lý do:</span>
                                                                    <span className="text-red-700 italic">{log.reason || log.notes}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <WorkflowLogDetailDialog
                    open={showLogDetailDialog}
                    onOpenChange={setShowLogDetailDialog}
                    log={selectedLogDetail}
                />

                <BackwardMoveDialog
                    open={showBackwardMoveDialog}
                    onClose={() => {
                        setShowBackwardMoveDialog(false);
                        setBackwardMoveGroup(null);
                    }}
                    onConfirm={handleBackwardMoveConfirm}
                    itemName={backwardMoveGroup?.product?.item_name || backwardMoveGroup?.services?.[0]?.item_name}
                    mode="create"
                />

                <BackwardMoveDialog
                    open={!!viewLogData}
                    onClose={() => setViewLogData(null)}
                    itemName={viewLogData?.itemName}
                    mode="view"
                    initialData={viewLogData ? {
                        reason: viewLogData.reason,
                        photos: viewLogData.photos,
                        notes: viewLogData.notes
                    } : undefined}
                />
            </div>
        </TabsContent>
    );
}

