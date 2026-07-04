import type { User, UserRole } from '@/types';

export interface ViewDefinition {
    id: string;
    label: string;
    group: string;
    /** Khớp path sau dấu / (ưu tiên prefix dài hơn) */
    pathPrefixes: string[];
}

/** Danh mục màn hình có thể cấp quyền — id khớp sidebar / route */
export const VIEW_DEFINITIONS: ViewDefinition[] = [
    { id: 'dashboard', label: 'Dashboard', group: 'Tổng quan', pathPrefixes: ['dashboard'] },
    { id: 'reports', label: 'Báo cáo', group: 'Tổng quan', pathPrefixes: ['reports'] },
    { id: 'leads', label: 'Leads', group: 'CRM', pathPrefixes: ['leads'] },
    { id: 'customers', label: 'Khách hàng', group: 'CRM', pathPrefixes: ['customers'] },
    {
        id: 'customers/view-phone',
        label: 'Xem SĐT khách hàng',
        group: 'CRM',
        pathPrefixes: [],
    },
    { id: 'interactions', label: 'Tương tác', group: 'CRM', pathPrefixes: ['interactions'] },
    { id: 'orders', label: 'Đơn hàng', group: 'Bán hàng', pathPrefixes: ['orders'] },
    { id: 'requests', label: 'Tất cả yêu cầu', group: 'Bán hàng', pathPrefixes: ['requests'] },
    { id: 'orders/upsell-tickets', label: 'Mục phê duyệt (Upsell)', group: 'Bán hàng', pathPrefixes: ['orders/upsell-tickets'] },
    {
        id: 'orders/upsell-tickets/accessory-price',
        label: 'Xem giá mua phụ kiện (Upsell)',
        group: 'Bán hàng',
        pathPrefixes: [],
    },
    {
        id: 'orders/upsell-tickets/partner-price',
        label: 'Xem giá nhờ đối tác làm (Upsell)',
        group: 'Bán hàng',
        pathPrefixes: [],
    },
    { id: 'invoices', label: 'Hóa đơn', group: 'Bán hàng', pathPrefixes: ['invoices'] },
    { id: 'income', label: 'Phiếu thu', group: 'Sổ quỹ', pathPrefixes: ['income'] },
    { id: 'expense', label: 'Phiếu chi', group: 'Sổ quỹ', pathPrefixes: ['expense'] },
    { id: 'product-list', label: 'Sản phẩm', group: 'Sản phẩm & DV', pathPrefixes: ['product-list', 'products'] },
    { id: 'services', label: 'Dịch vụ', group: 'Sản phẩm & DV', pathPrefixes: ['services'] },
    { id: 'packages', label: 'Gói dịch vụ', group: 'Sản phẩm & DV', pathPrefixes: ['packages'] },
    { id: 'vouchers', label: 'Thẻ/Voucher', group: 'Sản phẩm & DV', pathPrefixes: ['vouchers'] },
    { id: 'product-types', label: 'Loại sản phẩm', group: 'Sản phẩm & DV', pathPrefixes: ['product-types'] },
    { id: 'workflows', label: 'Quy trình', group: 'Kỹ thuật', pathPrefixes: ['workflows'] },
    { id: 'workflow-board', label: 'Bảng quy trình', group: 'Kỹ thuật', pathPrefixes: ['workflow-board'] },
    { id: 'tasks', label: 'Công việc kỹ thuật', group: 'Kỹ thuật', pathPrefixes: ['tasks'] },
    { id: 'departments', label: 'Phòng ban', group: 'Kỹ thuật', pathPrefixes: ['departments'] },
    { id: 'employees', label: 'Danh sách nhân viên', group: 'Nhân sự', pathPrefixes: ['employees'] },
    { id: 'work-schedule', label: 'Lịch làm việc', group: 'Nhân sự', pathPrefixes: ['work-schedule'] },
    { id: 'attendance-mobile', label: 'Chấm công (Mobile)', group: 'Nhân sự', pathPrefixes: ['attendance-mobile'] },
    { id: 'timesheets', label: 'Bảng chấm công', group: 'Nhân sự', pathPrefixes: ['timesheets'] },
    { id: 'leave-requests', label: 'Xin nghỉ / muộn', group: 'Nhân sự', pathPrefixes: ['leave-requests'] },
    { id: 'kpi', label: 'KPI', group: 'Nhân sự', pathPrefixes: ['kpi'] },
    { id: 'commissions', label: 'Bảng hoa hồng', group: 'Nhân sự', pathPrefixes: ['commissions'] },
    { id: 'salary-advances', label: 'Ứng lương', group: 'Nhân sự', pathPrefixes: ['salary-advances'] },
    { id: 'violations', label: 'Vi phạm / Thưởng', group: 'Nhân sự', pathPrefixes: ['violations'] },
    { id: 'salary', label: 'Bảng lương', group: 'Nhân sự', pathPrefixes: ['salary'] },
    { id: 'training', label: 'Đào tạo', group: 'Nhân sự', pathPrefixes: ['training'] },
    { id: 'recruitment', label: 'Tuyển dụng', group: 'Nhân sự', pathPrefixes: ['recruitment'] },
    { id: 'employee-settings', label: 'Thiết lập nhân viên', group: 'Nhân sự', pathPrefixes: ['employee-settings'] },
];

const getMaxPrefixLength = (prefixes: string[]) => Math.max(0, ...prefixes.map((p) => p.length));

const SORTED_BY_PREFIX = [...VIEW_DEFINITIONS].sort(
    (a, b) => getMaxPrefixLength(b.pathPrefixes) - getMaxPrefixLength(a.pathPrefixes),
);

export function resolveViewKeyFromPath(pathname: string): string | null {
    const path = pathname.replace(/^\//, '').toLowerCase();
    if (!path || path === 'login') return null;

    for (const view of SORTED_BY_PREFIX) {
        for (const prefix of view.pathPrefixes) {
            const p = prefix.toLowerCase();
            if (path === p || path.startsWith(`${p}/`)) {
                return view.id;
            }
        }
    }
    return null;
}

export function bypassesCustomViewPermissions(role: UserRole): boolean {
    return role === 'admin';
}

export function canAccessView(
    user: Pick<User, 'role' | 'allowed_views' | 'uses_role_defaults'>,
    viewId: string,
    roleAllowed: boolean,
): boolean {
    if (bypassesCustomViewPermissions(user.role)) return true;

    const usesDefaults =
        user.uses_role_defaults === true ||
        (user.uses_role_defaults !== false && (user.allowed_views === undefined || user.allowed_views === null));

    if (usesDefaults) {
        return roleAllowed;
    }

    return (user.allowed_views ?? []).includes(viewId);
}

export function canAccessAnyView(
    user: Pick<User, 'role' | 'allowed_views' | 'uses_role_defaults'>,
    viewIds: string[],
    roleAllowed: boolean,
): boolean {
    return viewIds.some((viewId) => canAccessView(user, viewId, roleAllowed));
}

/** Quyền xem màn hình / capability (vd. xem giá phụ kiện trên Upsell) */
export function hasViewGrant(
    user: Pick<User, 'role' | 'allowed_views'> | null | undefined,
    viewId: string,
): boolean {
    if (!user) return false;
    return canAccessView(user, viewId, false);
}

export function getDefaultHomePath(user: Pick<User, 'role' | 'allowed_views' | 'uses_role_defaults'>): string {
    const usesDefaults =
        user.uses_role_defaults === true ||
        (user.uses_role_defaults !== false && (user.allowed_views === undefined || user.allowed_views === null));
    if (bypassesCustomViewPermissions(user.role) || usesDefaults) {
        return '/dashboard';
    }
    const first = VIEW_DEFINITIONS.find((v) => user.allowed_views!.includes(v.id) && v.pathPrefixes.length > 0);
    return first ? `/${first.pathPrefixes[0]}` : '/login';
}

export const VIEW_GROUPS = [...new Set(VIEW_DEFINITIONS.map((v) => v.group))];

export type ViewActionType = 'edit' | 'delete';

/** Quyền mặc định theo role khi chưa cấu hình phân quyền tùy chỉnh */
const VIEW_ROLE_EDIT: Partial<Record<string, UserRole[]>> = {
    dashboard: ['admin', 'manager', 'accountant', 'sale'],
    leads: ['admin', 'manager', 'sale'],
    customers: ['admin', 'manager', 'sale'],
    orders: ['admin', 'manager', 'accountant', 'sale', 'technician'],
    requests: ['admin', 'manager', 'sale', 'technician'],
    invoices: ['admin', 'manager', 'accountant'],
    income: ['admin', 'manager', 'accountant', 'sale'],
    expense: ['admin', 'manager', 'accountant', 'sale'],
    employees: ['admin', 'manager'],
    'employee-settings': ['admin', 'manager'],
    workflows: ['admin', 'manager', 'technician'],
    'workflow-board': ['admin', 'manager', 'technician'],
    tasks: ['admin', 'manager', 'technician'],
    departments: ['admin', 'manager'],
};

/** Màn hình kỹ thuật: Sale mặc định chỉ xem (không sửa) nếu không được cấp quyền Sửa */
const TECH_VIEWS_RESTRICT_SALE_EDIT = new Set([
    'workflows',
    'workflow-board',
    'tasks',
    'departments',
]);

const VIEW_ROLE_DELETE: Partial<Record<string, UserRole[]>> = {
    leads: ['admin', 'manager'],
    customers: ['admin', 'manager'],
    orders: ['admin', 'manager', 'accountant', 'sale'],
    invoices: ['admin', 'manager', 'accountant'],
    income: ['admin', 'manager', 'accountant'],
    expense: ['admin', 'manager', 'accountant'],
    employees: ['admin', 'manager'],
};

function roleAllowsAction(role: UserRole, viewId: string, action: ViewActionType): boolean {
    if (role === 'admin' || role === 'manager') return true;
    const map = action === 'edit' ? VIEW_ROLE_EDIT : VIEW_ROLE_DELETE;
    const roles = map[viewId];
    if (roles) return roles.includes(role);
    if (action === 'edit' && TECH_VIEWS_RESTRICT_SALE_EDIT.has(viewId)) return false;
    return action === 'edit';
}

export function canPerformViewAction(
    user: Pick<User, 'role' | 'allowed_views' | 'view_actions'>,
    viewId: string,
    action: ViewActionType,
): boolean {
    if (bypassesCustomViewPermissions(user.role)) return true;

    if (user.allowed_views === undefined || user.allowed_views === null) {
        return roleAllowsAction(user.role, viewId, action);
    }

    if (!user.allowed_views.includes(viewId)) return false;

    const flags = user.view_actions?.[viewId];
    if (!flags) return false;
    return action === 'edit' ? Boolean(flags.edit) : Boolean(flags.delete);
}
