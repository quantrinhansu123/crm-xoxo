import type { Order, OrderItem } from '@/hooks/useOrders';
import type { User } from '@/types';

// Nhóm theo sản phẩm (product + các dịch vụ) cho Kanban Tiến trình/Quy trình
export type WorkflowKanbanGroup = {
    product: OrderItem | null;
    services: OrderItem[];
};

export type TechRoom = 'phong_ma' | 'phong_dan_de' | 'phong_da' | 'done' | 'fail' | 'waiting';

export interface StepDeadlineInfo {
    label: string;
    dueAt: Date | null;
}

export interface CurrentStepInfo {
    id: string;
    step_name: string;
    status: string;
    department?: {
        id: string;
        name: string;
    };
    technician_id?: string;
}

export interface OrderDetailPageProps {
    // Props if needed for future extensibility
}
