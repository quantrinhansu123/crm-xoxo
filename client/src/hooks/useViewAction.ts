import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessView, canPerformViewAction } from '@/lib/viewPermissions';
import type { UserRole } from '@/types';

/** Quyền xem / sửa / xóa trên một màn hình (theo phân quyền hoặc role) */
export function useViewAction(viewId: string, roleAllowed = true) {
    const { user } = useAuth();

    return useMemo(() => {
        if (!user) {
            return { canRead: false, canEdit: false, canDelete: false };
        }
        const canRead = canAccessView(user, viewId, roleAllowed);
        return {
            canRead,
            canEdit: canRead && canPerformViewAction(user, viewId, 'edit'),
            canDelete: canRead && canPerformViewAction(user, viewId, 'delete'),
        };
    }, [user, viewId, roleAllowed]);
}

export function useViewActionForRoles(viewId: string, allowedRoles: UserRole[]) {
    const { user } = useAuth();
    const roleAllowed = user ? allowedRoles.includes(user.role) : false;
    return useViewAction(viewId, roleAllowed);
}
