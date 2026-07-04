import { Response, NextFunction } from 'express';
import { ApiError } from './errorHandler.js';
import type { AuthenticatedRequest } from './auth.js';
import {
    canAccessAnyViewFromProfile,
    canAccessViewFromProfile,
    canPerformViewActionFromProfile,
    getUserViewPermissionProfile,
} from '../utils/employeeViewPermissions.js';

type ViewAccessOptions = {
    /** Role được phép khi chưa có phân quyền tùy chỉnh */
    fallbackRoles?: string[];
    /** Yêu cầu quyền sửa/xóa trên màn hình (phê duyệt, cập nhật) */
    requireAction?: 'edit' | 'delete';
};

export function requireViewAccess(viewId: string, options: ViewAccessOptions = {}) {
    const { fallbackRoles = ['admin', 'manager'], requireAction } = options;

    return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                return next(new ApiError('Chưa đăng nhập', 401));
            }

            const profile = await getUserViewPermissionProfile(req.user.id, req.user.role);
            const roleAllowed = fallbackRoles.includes(req.user.role);

            const canRead = canAccessViewFromProfile(profile, req.user.role, viewId, roleAllowed);
            if (!canRead) {
                return next(new ApiError('Không có quyền truy cập màn hình này', 403));
            }

            if (requireAction) {
                const canAct = canPerformViewActionFromProfile(
                    profile,
                    req.user.role,
                    viewId,
                    requireAction,
                    roleAllowed,
                );
                if (!canAct) {
                    return next(new ApiError('Không có quyền thực hiện thao tác này', 403));
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/** Một trong các view được cấp là đủ (dùng khi nhiều màn hình gọi chung API) */
export function requireAnyViewAccess(viewIds: string[], options: ViewAccessOptions = {}) {
    const { fallbackRoles = ['admin', 'manager'], requireAction } = options;

    return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                return next(new ApiError('Chưa đăng nhập', 401));
            }

            const profile = await getUserViewPermissionProfile(req.user.id, req.user.role);
            const roleAllowed = fallbackRoles.includes(req.user.role);

            const canRead = canAccessAnyViewFromProfile(profile, req.user.role, viewIds, roleAllowed);
            if (!canRead) {
                return next(new ApiError('Không có quyền truy cập màn hình này', 403));
            }

            if (requireAction) {
                const canAct = viewIds.some((viewId) =>
                    canPerformViewActionFromProfile(
                        profile,
                        req.user!.role,
                        viewId,
                        requireAction,
                        roleAllowed,
                    ),
                );
                if (!canAct) {
                    return next(new ApiError('Không có quyền thực hiện thao tác này', 403));
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}
