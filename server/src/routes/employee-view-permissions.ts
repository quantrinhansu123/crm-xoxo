import { Router, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
    getUserViewPermissionProfile,
    sanitizeViewActionsInput,
} from '../utils/employeeViewPermissions.js';

const router = Router();

router.use(authenticate);

router.get('/', requireManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { data: users, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id, email, name, role, status')
            .neq('status', 'inactive')
            .order('name', { ascending: true });

        if (usersError) throw usersError;

        const { data: permissions, error: permError } = await supabaseAdmin
            .from('employee_view_permissions')
            .select('user_id, allowed_views, view_actions, updated_at');

        if (permError) throw permError;

        const permMap = new Map((permissions ?? []).map((p) => [p.user_id, p]));

        const rows = (users ?? []).map((u) => {
            const perm = permMap.get(u.id);
            return {
                user_id: u.id,
                email: u.email,
                name: u.name,
                role: u.role,
                status: u.status,
                has_custom_permissions: Boolean(perm),
                allowed_views: perm?.allowed_views ?? null,
                view_actions: perm?.view_actions ?? null,
                updated_at: perm?.updated_at ?? null,
            };
        });

        res.json({ status: 'success', data: { permissions: rows } });
    } catch (error) {
        next(error);
    }
});

router.get('/me', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const profile = await getUserViewPermissionProfile(req.user!.id, req.user!.role);
        res.json({ status: 'success', data: profile });
    } catch (error) {
        next(error);
    }
});

router.put('/:userId', requireManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.params;
        const { allowed_views, view_actions } = req.body as {
            allowed_views?: string[];
            view_actions?: Record<string, { edit?: boolean; delete?: boolean }>;
        };

        if (!Array.isArray(allowed_views)) {
            throw new ApiError('allowed_views phải là mảng', 400);
        }

        const cleaned = [...new Set(allowed_views.map((v) => String(v).trim()).filter(Boolean))];
        const cleanedActions = sanitizeViewActionsInput(cleaned, view_actions);

        const { data: targetUser, error: userError } = await supabaseAdmin
            .from('users')
            .select('id, email, role')
            .eq('id', userId)
            .maybeSingle();

        if (userError) throw userError;
        if (!targetUser) throw new ApiError('Không tìm thấy nhân viên', 404);

        if (targetUser.role === 'admin') {
            throw new ApiError('Không cấu hình quyền xem cho tài khoản admin', 400);
        }

        const now = new Date().toISOString();
        const { data, error } = await supabaseAdmin
            .from('employee_view_permissions')
            .upsert(
                {
                    user_id: userId,
                    allowed_views: cleaned,
                    view_actions: cleanedActions,
                    updated_by: req.user!.id,
                    updated_at: now,
                },
                { onConflict: 'user_id' },
            )
            .select('user_id, allowed_views, view_actions, updated_at')
            .single();

        if (error) throw error;

        res.json({
            status: 'success',
            data: {
                permission: {
                    user_id: data.user_id,
                    email: targetUser.email,
                    allowed_views: data.allowed_views,
                    view_actions: data.view_actions,
                    updated_at: data.updated_at,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

router.delete('/:userId', requireManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.params;
        const { error } = await supabaseAdmin.from('employee_view_permissions').delete().eq('user_id', userId);
        if (error) throw error;
        res.json({ status: 'success', message: 'Đã xóa cấu hình quyền xem' });
    } catch (error) {
        next(error);
    }
});

export { router as employeeViewPermissionsRouter };
export default router;
