import { supabaseAdmin } from '../config/supabase.js';

export interface ViewActionFlags {
    edit: boolean;
    delete: boolean;
}

export type ViewActionsMap = Record<string, ViewActionFlags>;

export interface UserViewPermissionProfile {
    allowed_views: string[] | null;
    view_actions: ViewActionsMap | null;
    uses_role_defaults: boolean;
}

function normalizeViewActions(raw: unknown): ViewActionsMap {
    if (!raw || typeof raw !== 'object') return {};
    const out: ViewActionsMap = {};
    for (const [viewId, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        out[viewId] = {
            edit: Boolean(v.edit),
            delete: Boolean(v.delete),
        };
    }
    return out;
}

/** null = chưa cấu hình, dùng quyền theo role */
export async function getUserViewPermissionProfile(
    userId: string,
    role: string,
): Promise<UserViewPermissionProfile> {
    if (role === 'admin') {
        return { allowed_views: null, view_actions: null, uses_role_defaults: true };
    }

    const { data, error } = await supabaseAdmin
        .from('employee_view_permissions')
        .select('allowed_views, view_actions')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        return { allowed_views: null, view_actions: null, uses_role_defaults: true };
    }

    return {
        allowed_views: Array.isArray(data.allowed_views) ? data.allowed_views : [],
        view_actions: normalizeViewActions(data.view_actions),
        uses_role_defaults: false,
    };
}

/** @deprecated dùng getUserViewPermissionProfile */
export async function getAllowedViewsForUser(userId: string, role: string): Promise<string[] | null> {
    const profile = await getUserViewPermissionProfile(userId, role);
    return profile.allowed_views;
}

export function canAccessViewFromProfile(
    profile: UserViewPermissionProfile,
    role: string,
    viewId: string,
    roleAllowed: boolean,
): boolean {
    if (role === 'admin') return true;
    if (!profile.uses_role_defaults && profile.allowed_views !== null) {
        return profile.allowed_views.includes(viewId);
    }
    return roleAllowed;
}

/** Cho phép nếu có ít nhất một view trong danh sách (vd. Upsell + Yêu cầu dùng chung API requests) */
export function canAccessAnyViewFromProfile(
    profile: UserViewPermissionProfile,
    role: string,
    viewIds: string[],
    roleAllowed: boolean,
): boolean {
    return viewIds.some((viewId) => canAccessViewFromProfile(profile, role, viewId, roleAllowed));
}

export function canPerformViewActionFromProfile(
    profile: UserViewPermissionProfile,
    role: string,
    viewId: string,
    action: 'edit' | 'delete',
    roleAllowed: boolean,
): boolean {
    if (role === 'admin' || role === 'manager') return true;

    if (profile.uses_role_defaults) {
        if (!roleAllowed) return false;
        return action === 'edit';
    }

    if (!profile.allowed_views?.includes(viewId)) return false;
    const flags = profile.view_actions?.[viewId];
    if (!flags) return false;
    return action === 'edit' ? Boolean(flags.edit) : Boolean(flags.delete);
}

export function sanitizeViewActionsInput(
    allowedViews: string[],
    viewActions: unknown,
): ViewActionsMap {
    const normalized = normalizeViewActions(viewActions);
    const cleaned: ViewActionsMap = {};
    for (const viewId of allowedViews) {
        const flags = normalized[viewId];
        cleaned[viewId] = {
            edit: Boolean(flags?.edit),
            delete: Boolean(flags?.delete),
        };
    }
    return cleaned;
}
