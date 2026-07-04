import { TECH_ROOM_IDS } from '@/components/orders/constants';
import { toast } from 'sonner';

export const SEQUENTIAL_KANBAN_MOVE_MESSAGE =
    'Chỉ được chuyển sang bước liền kề, không được nhảy cóc';

export const BACKWARD_KANBAN_MOVE_MESSAGE =
    'Không được quay ngược quy trình';

export type KanbanMovePolicy = {
    /** Mặc định false — Sales/Workflow có thể bật để mở dialog lùi bước */
    allowBackward?: boolean;
};

export const ORDER_KANBAN_COLUMN_IDS = [
    'before_sale',
    'in_progress',
    'done',
    'after_sale',
    'cancelled',
] as const;

export const WORKFLOW_KANBAN_COLUMN_IDS = [
    'waiting',
    ...TECH_ROOM_IDS,
    'done',
    'fail',
] as const;

export const AFTER_SALE_COLUMN_IDS = [
    'after1',
    'after1_debt',
    'after2',
    'after3',
    'after4',
] as const;

export const CARE_WARRANTY_COLUMN_IDS = [
    'war1',
    'war2',
    'war3',
    'care6',
    'care12',
    'care-custom',
] as const;

export function isForwardKanbanMove(
    columnIds: readonly string[],
    sourceId: string,
    destId: string
): boolean {
    if (sourceId === destId) return true;
    const sourceIdx = columnIds.indexOf(sourceId);
    const destIdx = columnIds.indexOf(destId);
    if (sourceIdx < 0 || destIdx < 0) return false;
    return destIdx === sourceIdx + 1;
}

/** @deprecated Dùng isForwardKanbanMove */
export function isSequentialKanbanMove(
    columnIds: readonly string[],
    sourceId: string,
    destId: string
): boolean {
    return isForwardKanbanMove(columnIds, sourceId, destId);
}

/** @returns true if move was rejected (caller should return early) */
export function rejectNonSequentialKanbanMove(
    columnIds: readonly string[],
    sourceId: string,
    destId: string,
    policy: KanbanMovePolicy = {}
): boolean {
    if (sourceId === destId) return false;

    const sourceIdx = columnIds.indexOf(sourceId);
    const destIdx = columnIds.indexOf(destId);
    if (sourceIdx < 0 || destIdx < 0) {
        toast.error(SEQUENTIAL_KANBAN_MOVE_MESSAGE);
        return true;
    }

    if (!policy.allowBackward && destIdx < sourceIdx) {
        toast.error(BACKWARD_KANBAN_MOVE_MESSAGE);
        return true;
    }

    if (policy.allowBackward) {
        if (Math.abs(destIdx - sourceIdx) !== 1) {
            toast.error(SEQUENTIAL_KANBAN_MOVE_MESSAGE);
            return true;
        }
        return false;
    }

    if (!isForwardKanbanMove(columnIds, sourceId, destId)) {
        toast.error(
            destIdx < sourceIdx ? BACKWARD_KANBAN_MOVE_MESSAGE : SEQUENTIAL_KANBAN_MOVE_MESSAGE
        );
        return true;
    }

    return false;
}
