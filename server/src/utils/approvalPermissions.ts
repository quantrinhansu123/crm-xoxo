import { ApiError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export function isManagerRole(role?: string): boolean {
    return role === 'admin' || role === 'manager';
}

/** Chặn Sale/KTV duyệt yêu cầu đang chờ trong hàng đợi phê duyệt (status = requested). */
export function assertManagerQueueApproval(
    req: AuthenticatedRequest,
    currentStatus: string,
    newStatus?: string,
): void {
    if (!newStatus || newStatus === currentStatus) return;
    if (isManagerRole(req.user?.role)) return;
    if (currentStatus === 'requested') {
        throw new ApiError('Chỉ quản lý mới được phê duyệt yêu cầu', 403);
    }
}
