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

/** Ưu tiên stage aftersale hợp lệ đã đi xa nhất (tránh phase_stage / after_sale_stage lệch). */
export function resolveAfterSaleOldStage(item: {
    after_sale_stage?: string | null;
    phase_stage?: string | null;
} | null | undefined): string {
    if (!item) return 'after1';
    const order = AFTER_SALE_STAGE_ORDER as readonly string[];
    const candidates = [item.after_sale_stage, item.phase_stage].filter(
        (s): s is string => !!s && order.includes(s),
    );
    if (candidates.length === 0) {
        return item.after_sale_stage || item.phase_stage || 'after1';
    }
    return candidates.reduce((best, s) => (order.indexOf(s) > order.indexOf(best) ? s : best));
}

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
        throw new ApiError(`Không được quay ngược quy trình (${oldStage} → ${newStage})`, 400);
    }
    if (newIdx - oldIdx > 1) {
        throw new ApiError(`Chỉ được chuyển sang bước liền kề, không được nhảy cóc (${oldStage} → ${newStage})`, 400);
    }
}

