import type { User } from '@/types';
import { canAccessView, canPerformViewAction, hasViewGrant } from '@/lib/viewPermissions';

const ACCESSORY_PRICE_VIEW = 'orders/upsell-tickets/accessory-price';
const PARTNER_PRICE_VIEW = 'orders/upsell-tickets/partner-price';
const CUSTOMER_PHONE_VIEW = 'customers/view-phone';

const PHONE_VIEW_ROLES = ['admin', 'manager', 'sale'] as const;

export function canViewCustomerPhone(user: Pick<User, 'role' | 'allowed_views' | 'uses_role_defaults'> | null | undefined): boolean {
    if (!user) return false;
    const roleAllowed = (PHONE_VIEW_ROLES as readonly string[]).includes(user.role);
    return canAccessView(user, CUSTOMER_PHONE_VIEW, roleAllowed);
}

const ACCESSORY_PRICE_ROLES = ['admin', 'manager', 'technician', 'accountant'] as const;
const PARTNER_PRICE_ROLES = ['admin', 'manager', 'technician', 'accountant'] as const;

export function canViewAccessoryPurchasePrice(
    user: Pick<User, 'role' | 'allowed_views' | 'uses_role_defaults'> | null | undefined,
): boolean {
    if (!user) return false;
    const roleAllowed = (ACCESSORY_PRICE_ROLES as readonly string[]).includes(user.role);
    return canAccessView(user, ACCESSORY_PRICE_VIEW, roleAllowed);
}

export function canViewPartnerFeePrice(
    user: Pick<User, 'role' | 'allowed_views' | 'uses_role_defaults'> | null | undefined,
): boolean {
    if (!user) return false;
    const roleAllowed = (PARTNER_PRICE_ROLES as readonly string[]).includes(user.role);
    return canAccessView(user, PARTNER_PRICE_VIEW, roleAllowed);
}

/** Phê duyệt trong Mục phê duyệt (Upsell, Sửa đơn, PK, ĐT, Gia hạn, Nghỉ/Muộn, Thu Chi) */
export function canApproveInApprovalCenter(
    user: Pick<User, 'role'> | null | undefined,
): boolean {
    return user?.role === 'admin' || user?.role === 'manager';
}

/** Thao tác Kanban / form kỹ thuật (kéo thả, mua PK, gửi ĐT, …) — Sale mặc định chỉ xem */
export function canOperateWorkflow(
    user: Pick<User, 'role' | 'allowed_views' | 'uses_role_defaults' | 'view_actions'> | null | undefined,
): boolean {
    if (!user) return false;
    const roleAllowed = ['admin', 'manager', 'technician'].includes(user.role);
    const canRead = canAccessView(user, 'workflows', roleAllowed || user.role === 'sale');
    return canRead && canPerformViewAction(user, 'workflows', 'edit');
}

export function maskPhone(phone: string | undefined | null): string {
    if (!phone?.trim()) return '—';
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) return '****';
    if (digits.length <= 7) return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
    return `${digits.slice(0, 3)}***${digits.slice(-3)}`;
}

export function formatCustomerPhone(
    phone: string | undefined | null,
    canView: boolean,
): string {
    if (!phone?.trim()) return 'Không có SĐT';
    return canView ? phone : maskPhone(phone);
}

const SENSITIVE_PRICE_FIELD_PATTERN = /cost|price|amount|fee|ship/i;

export function isSensitivePriceField(fieldName: string): boolean {
    return SENSITIVE_PRICE_FIELD_PATTERN.test(fieldName);
}
