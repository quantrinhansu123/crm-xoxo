import type { User, UserRole } from '@/types';

export const UNASSIGNED_DEPARTMENT_ID = '__unassigned__';

export interface KanbanEmployee extends User {
    status: 'active' | 'inactive' | 'onleave';
    department?: string;
    departmentId?: string;
    department_id?: string;
}

/** Khóa phòng ban để gom cột Kanban (ưu tiên department_id) */
export function getEmployeeDepartmentKey(
    emp: KanbanEmployee,
    departments: { id: string; name: string }[]
): string {
    const rawId = (emp.departmentId || emp.department_id || '').trim();
    if (rawId && departments.some((d) => d.id === rawId)) {
        return rawId;
    }

    const legacy = (emp.department || '').trim();
    if (!legacy) return UNASSIGNED_DEPARTMENT_ID;

    const byId = departments.find((d) => d.id === legacy);
    if (byId) return byId.id;

    const normalized = legacy.toLowerCase();
    const byName = departments.find((d) => d.name.trim().toLowerCase() === normalized);
    if (byName) return byName.id;

    return UNASSIGNED_DEPARTMENT_ID;
}

/** Quản lý: role manager/admin hoặc chức danh có "quản lý" */
export function isManagerPosition(
    emp: KanbanEmployee,
    jobTitleName?: string
): boolean {
    if (emp.role === 'manager' || emp.role === 'admin') return true;
    const title = (jobTitleName || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
    return (
        title.includes('quan ly') ||
        title.includes('giam doc') ||
        title.includes('truong phong') ||
        title.includes('team lead')
    );
}

export const roleLabels: Record<UserRole, string> = {
    admin: 'Admin',
    manager: 'Quản lý',
    accountant: 'Kế toán',
    sale: 'Nhân viên bán hàng',
    technician: 'Nhân viên làm phục vụ',
    cashier: 'Thu ngân',
};

export function sortEmployeesForKanban(
    list: KanbanEmployee[],
    getJobTitleName: (id?: string) => string
): KanbanEmployee[] {
    return [...list].sort((a, b) => {
        const aMgr = isManagerPosition(a, getJobTitleName(a.job_title_id));
        const bMgr = isManagerPosition(b, getJobTitleName(b.job_title_id));
        if (aMgr !== bMgr) return aMgr ? -1 : 1;
        return a.name.localeCompare(b.name, 'vi');
    });
}
