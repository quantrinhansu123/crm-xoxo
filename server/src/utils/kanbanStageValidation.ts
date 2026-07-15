import { ApiError } from '../middleware/errorHandler.js';

export const AFTER_SALE_STAGE_ORDER = [
    'after1',
    'after1_debt',
    'after2',
    'after3',
    'after4',
] as const;

export const WARRANTY_STAGE_ORDER = ['war1', 'war2', 'war3'] as const;
export const CARE_STAGE_ORDER = ['care6', 'care12', 'care-custom'] as const;

export function assertForwardStageMove(
    columnOrder: readonly string[],
    oldStage: string | null | undefined,
    newStage: string,
): void {
    if (!oldStage || oldStage === newStage) return;

    const oldIdx = columnOrder.indexOf(oldStage);
    const newIdx = columnOrder.indexOf(newStage);
    if (oldIdx < 0 || newIdx < 0) return;

    if (newIdx < oldIdx) {
        throw new ApiError('Không được quay ngược quy trình', 400);
    }
    if (newIdx - oldIdx > 1) {
        throw new ApiError('Chỉ được chuyển sang bước liền kề, không được nhảy cóc', 400);
    }
}

