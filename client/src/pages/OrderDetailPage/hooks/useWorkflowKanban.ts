import { useMemo, useCallback } from 'react';
import type { Order, OrderItem } from '@/hooks/useOrders';
import type { WorkflowKanbanGroup, TechRoom, StepDeadlineInfo, CurrentStepInfo } from '../types';
import { getTechRoomByStepOrder, getTechRoomByDepartmentName } from '@/components/orders/constants';

export function useWorkflowKanban(
    order: Order | null,
    allWorkflowSteps: any[],
    salesLogs: any[] = []
) {
    // Nhóm theo sản phẩm (product + các dịch vụ) cho Kanban Tiến trình/Quy trình
    const workflowKanbanGroups = useMemo((): WorkflowKanbanGroup[] => {
        const items = order?.items || [];
        const groups: WorkflowKanbanGroup[] = [];

        // Use a Set to track processed IDs to handle flat items correctly
        const processedIds = new Set<string>();

        // 1. Group Customer Items (Products and their nested services)
        items.forEach((item: any, index) => {
            if (item.is_customer_item && item.item_type === 'product' && !processedIds.has(item.id)) {
                processedIds.add(item.id);

                // Find services that belong to this product
                // In flat list, services usually follow the product
                const services: OrderItem[] = [];
                let j = index + 1;
                while (j < items.length) {
                    const next = items[j];
                    // Stop if we hit another customer product
                    if (next.is_customer_item && next.item_type === 'product') break;

                    // If it's a service/package, it belongs to the previous product
                    if (next.item_type === 'service' || next.item_type === 'package') {
                        services.push(next);
                        processedIds.add(next.id);
                    }
                    j++;
                }
                groups.push({ product: item, services });
            }
        });

        // 2. Add remaining items as standalone groups (Sale items or leftover services)
        // Filter to only include customer items (main products/services)
        items.forEach((item) => {
            if (!processedIds.has(item.id) && item.is_customer_item) {
                if (item.item_type === 'product') {
                    groups.push({ product: item, services: [] });
                } else if (item.item_type === 'service' || item.item_type === 'package') {
                    groups.push({ product: null, services: [item] });
                }
                processedIds.add(item.id);
            }
        });

        return groups;
    }, [order?.items]);

    // Current step for an item (in_progress or first pending/assigned) for "Xác nhận hoàn thành bước"
    const getItemCurrentStep = useCallback((itemId: string): CurrentStepInfo | null => {
        const steps = allWorkflowSteps.filter((s: any) => s.item_id === itemId || s.order_item_id === itemId || s.order_product_service_id === itemId);
        const inProgress = steps.find((s: any) => s.status === 'in_progress');
        const activePending = steps
            .filter((s: any) => s.status === 'pending' || s.status === 'assigned')
            .sort((a: any, b: any) => (a.step_order ?? 0) - (b.step_order ?? 0));
        const step = inProgress || activePending[0];
        return step ? { 
            id: step.id, 
            step_name: step.step_name, 
            status: step.status, 
            department: step.department,
            technician_id: step.technician_id 
        } : null;
    }, [allWorkflowSteps]);

    const isItemWaitingForAccessoryOrPartner = useCallback((itemId: string): boolean => {
        const item = order?.items?.find(i => i.id === itemId);
        if (!item) return false;

        const accessoryStatus = (item as any)?.accessory?.status;
        const partnerStatus = (item as any)?.partner?.status;

        return accessoryStatus === 'requested' || partnerStatus === 'requested';
    }, [order?.items]);

    const getStepDeadlineDisplay = useCallback((itemId: string): StepDeadlineInfo => {
        if (isItemWaitingForAccessoryOrPartner(itemId)) {
            return { label: 'Đang chờ duyệt', dueAt: null };
        }

        const steps = allWorkflowSteps.filter((s: any) => s.item_id === itemId || s.order_item_id === itemId || s.order_product_service_id === itemId);

        const inProgress = steps.find((s: any) => s.status === 'in_progress');
        const firstPending = steps.find((s: any) => s.status === 'pending' || s.status === 'assigned');
        const step = inProgress || firstPending;

        let days = step ? (Number(step.estimated_duration) || 0) : 0;
        let baseAt = step?.started_at || step?.created_at || (step as any)?.order_item?.confirmed_at || order?.confirmed_at || order?.created_at;

        // Nếu đang ở cột Chờ phân công: Ưu tiên SLA 2 giờ từ lúc chốt đơn (step5)
        const isWaiting = (steps.length === 0) || (step && step.status === 'pending');
        
        if (isWaiting) {
            days = 2 / 24; // Luôn áp dụng 2 giờ cho cột Chờ phân công

            // Tìm thông tin nhóm để lấy ID sản phẩm cha (nếu có)
            const parentGroup = workflowKanbanGroups.find(g => 
                g.product?.id === itemId || g.services.some(s => s.id === itemId)
            );
            const parentProductId = parentGroup?.product?.id;

            // Tìm log chuyển sang step5 (Chốt đơn) gần nhất cho item này hoặc sản phẩm cha
            const step5Log = [...(salesLogs || [])]
                .filter(l => (l.entity_id === itemId || (parentProductId && l.entity_id === parentProductId)) && l.to_status === 'step5')
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            
            if (step5Log) {
                baseAt = step5Log.created_at;
            } else {
                // Nếu không thấy log step5, ưu tiên dùng created_at của step (vì step được tạo khi vào quy trình)
                // Hoặc nếu mới nhất là một log sales bất kỳ thì lấy mốc đó
                const lastSalesLog = [...(salesLogs || [])]
                    .filter(l => l.entity_id === itemId || (parentProductId && l.entity_id === parentProductId))
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                
                if (lastSalesLog && new Date(lastSalesLog.created_at) > new Date(baseAt || 0)) {
                    baseAt = lastSalesLog.created_at;
                }
            }
        }

        if (!baseAt) {
            return { label: 'Chờ hạn', dueAt: null };
        }

        if (!step && steps.length > 0) {
            // Trường hợp có steps nhưng đều đã hoàn thành/hủy
            const allCompleted = steps.every(s => s.status === 'completed' || s.status === 'skipped');
            if (allCompleted) return { label: 'Đã hoàn thành', dueAt: null };
            return { label: 'N/A', dueAt: null };
        }

        if (days <= 0) return { label: 'Chưa có hạn', dueAt: null };

        const base = new Date(baseAt);
        const dueAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
        
        if (step?.sla_total_paused_minutes) {
            dueAt.setMinutes(dueAt.getMinutes() + step.sla_total_paused_minutes);
        }

        if (step?.sla_paused_at) {
            const pausedAt = new Date(step.sla_paused_at);
            const currentPausedMinutes = Math.max(0, Math.round((Date.now() - pausedAt.getTime()) / 60000));
            dueAt.setMinutes(dueAt.getMinutes() + currentPausedMinutes);
            return { label: '⏸ Đang tạm dừng', dueAt };
        }

        const now = Date.now();
        const diffMs = dueAt.getTime() - now;
        const isLate = diffMs < 0;
        const absDiffMs = Math.abs(diffMs);

        let label = '';
        if (absDiffMs < 3600000) { // < 1 hour
            const mins = Math.round(absDiffMs / 60000);
            label = isLate ? `Trễ ${mins} phút` : `Còn ${mins} phút`;
        } else if (absDiffMs < 86400000) { // < 1 day
            const hours = Math.round(absDiffMs / 3600000);
            label = isLate ? `Trễ ${hours} giờ` : `Còn ${hours} giờ`;
        } else {
            const daysDiff = Math.ceil(absDiffMs / 86400000);
            label = isLate ? `Trễ ${daysDiff} ngày` : `Còn ${daysDiff} ngày`;
        }

        return { label, dueAt };
    }, [allWorkflowSteps, order?.confirmed_at, order?.created_at, salesLogs, workflowKanbanGroups, isItemWaitingForAccessoryOrPartner]);

    // Compute current tech room: ưu tiên department của bước (Bộ phận: Dán đế → Phòng Dán đế), fallback step_order
    const getItemCurrentTechRoom = useCallback((itemId: string): TechRoom => {
        const item = order?.items?.find(i => i.id === itemId);
        if (item?.status === 'cancelled') return 'fail';
        if (item?.status === 'completed' || item?.status === 'done') return 'done';

        const steps = allWorkflowSteps.filter((s: any) => s.item_id === itemId || s.order_item_id === itemId || s.order_product_service_id === itemId);
        if (steps.length === 0) return 'waiting';

        const inProgress = steps.find((s: any) => s.status === 'in_progress');
        const activePending = steps
            .filter((s: any) => s.status === 'pending' || s.status === 'assigned')
            .sort((a: any, b: any) => (a.step_order ?? 0) - (b.step_order ?? 0));

        const step = inProgress || activePending[0];

        if (!step) {
            // Check if all steps are completed or skipped
            const allFinished = steps.every(s => s.status === 'completed' || s.status === 'skipped');
            if (allFinished) return 'done';
            return 'waiting';
        }

        // Nếu mới ở trạng thái pending (chưa phân công), giữ ở cột waiting
        if (step.status === 'pending') return 'waiting';

        const roomByDept = getTechRoomByDepartmentName(step?.department?.name);
        if (roomByDept) return roomByDept;
        const order_val = step?.step_order ?? 1;
        return getTechRoomByStepOrder(order_val);
    }, [allWorkflowSteps, order?.items]);

    // Phòng hiện tại = phòng của dịch vụ đang có bước hiện tại (lead), để card nằm đúng cột với bước đang hiển thị
    const getGroupCurrentTechRoom = useCallback((group: WorkflowKanbanGroup): TechRoom => {
        // 1. Tìm dịch vụ đang có bước hiện tại (in_progress hoặc pending/assigned)
        const activeService = group.services.find((s) => getItemCurrentStep(s.id));
        if (activeService) return getItemCurrentTechRoom(activeService.id);

        // 2. Nếu không có bước nào hiện tại, tìm dịch vụ chưa hoàn thành/huỷ (đang 'waiting')
        const waitingService = group.services.find((s) => {
            const room = getItemCurrentTechRoom(s.id);
            return room !== 'done' && room !== 'fail';
        });
        if (waitingService) return getItemCurrentTechRoom(waitingService.id);

        // 3. Nếu tất cả đã hoàn thành/huỷ, lấy room của dịch vụ cuối cùng (có thể là 'done' hoặc 'fail')
        const leadItem = group.services[group.services.length - 1] ?? group.services[0];
        if (!leadItem) return 'waiting';
        return getItemCurrentTechRoom(leadItem.id);
    }, [getItemCurrentTechRoom, getItemCurrentStep]);

    return {
        workflowKanbanGroups,
        getItemCurrentStep,
        getStepDeadlineDisplay,
        getItemCurrentTechRoom,
        getGroupCurrentTechRoom,
    };
}
