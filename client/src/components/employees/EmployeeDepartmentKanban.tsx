import { useMemo } from 'react';
import { Building2, Crown, Edit, Eye, Phone, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    getEmployeeDepartmentKey,
    isManagerPosition,
    sortEmployeesForKanban,
    UNASSIGNED_DEPARTMENT_ID,
    type KanbanEmployee,
} from './employeeKanbanUtils';

const COLUMN_PALETTES = [
    { header: 'bg-blue-600', ring: 'ring-blue-100' },
    { header: 'bg-violet-600', ring: 'ring-violet-100' },
    { header: 'bg-emerald-600', ring: 'ring-emerald-100' },
    { header: 'bg-rose-600', ring: 'ring-rose-100' },
    { header: 'bg-cyan-600', ring: 'ring-cyan-100' },
    { header: 'bg-orange-600', ring: 'ring-orange-100' },
];

interface DepartmentColumn {
    id: string;
    name: string;
    employees: KanbanEmployee[];
}

interface EmployeeDepartmentKanbanProps {
    employees: KanbanEmployee[];
    departments: { id: string; name: string }[];
    getJobTitleName: (jobTitleId?: string) => string;
    onView: (emp: KanbanEmployee) => void;
    onEdit?: (emp: KanbanEmployee) => void;
    onDelete?: (emp: KanbanEmployee) => void;
}

function EmployeeKanbanCard({
    emp,
    jobTitleName,
    onView,
    onEdit,
    onDelete,
}: {
    emp: KanbanEmployee;
    jobTitleName: string;
    onView: (emp: KanbanEmployee) => void;
    onEdit?: (emp: KanbanEmployee) => void;
    onDelete?: (emp: KanbanEmployee) => void;
}) {
    const isManager = isManagerPosition(emp, jobTitleName);

    return (
        <div
            className={`group flex w-full h-[38px] items-center gap-2 rounded-md border px-2 transition-all hover:shadow-sm ${
                isManager
                    ? 'border-amber-400 bg-gradient-to-r from-amber-50 via-orange-50/80 to-amber-50/50 ring-1 ring-amber-300/40'
                    : 'border-gray-200 bg-white hover:border-blue-200'
            }`}
        >
            <div className="relative shrink-0">
                <Avatar className={`h-7 w-7 ${isManager ? 'ring-1 ring-amber-400' : ''}`}>
                    {emp.avatar && <AvatarImage src={emp.avatar} alt={emp.name} />}
                    <AvatarFallback
                        className={
                            isManager
                                ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white text-[10px] font-bold'
                                : 'bg-slate-100 text-slate-600 text-[10px] font-semibold'
                        }
                    >
                        {emp.name.charAt(0)}
                    </AvatarFallback>
                </Avatar>
                {isManager && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white ring-1 ring-white">
                        <Crown className="h-2 w-2" />
                    </span>
                )}
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                <p
                    className={`shrink-0 max-w-[42%] truncate text-[11px] leading-none ${
                        isManager ? 'font-bold text-amber-950' : 'font-semibold text-gray-900'
                    }`}
                    title={emp.name}
                >
                    {emp.name}
                </p>
                <span className="shrink-0 text-[10px] text-gray-300">·</span>
                <p className="min-w-0 flex-1 truncate text-[10px] leading-none text-gray-500" title={jobTitleName}>
                    {jobTitleName}
                </p>
                {isManager && (
                    <Badge className="shrink-0 h-4 px-1 text-[9px] bg-amber-500 text-white border-0 hover:bg-amber-500">
                        QL
                    </Badge>
                )}
                {emp.phone && (
                    <span
                        className="hidden lg:flex shrink-0 items-center gap-0.5 max-w-[80px] text-[10px] text-gray-400"
                        title={emp.phone}
                    >
                        <Phone className="h-2.5 w-2.5" />
                        <span className="truncate">{emp.phone}</span>
                    </span>
                )}
            </div>

            <div className="flex shrink-0 items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-blue-600" onClick={() => onView(emp)} title="Xem">
                    <Eye className="h-3.5 w-3.5" />
                </Button>
                {onEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-blue-600" onClick={() => onEdit(emp)} title="Sửa">
                        <Edit className="h-3.5 w-3.5" />
                    </Button>
                )}
                {onDelete && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => onDelete(emp)}
                        title="Xóa"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}

export function EmployeeDepartmentKanban({
    employees,
    departments,
    getJobTitleName,
    onView,
    onEdit,
    onDelete,
}: EmployeeDepartmentKanbanProps) {
    const columns = useMemo((): DepartmentColumn[] => {
        const byDept = new Map<string, KanbanEmployee[]>();

        for (const emp of employees) {
            const deptKey = getEmployeeDepartmentKey(emp, departments);
            if (!byDept.has(deptKey)) byDept.set(deptKey, []);
            byDept.get(deptKey)!.push(emp);
        }

        const deptColumns: DepartmentColumn[] = departments.map((d) => ({
            id: d.id,
            name: d.name,
            employees: sortEmployeesForKanban(byDept.get(d.id) || [], getJobTitleName),
        }));

        deptColumns.push({
            id: UNASSIGNED_DEPARTMENT_ID,
            name: 'Chưa phân bổ',
            employees: sortEmployeesForKanban(byDept.get(UNASSIGNED_DEPARTMENT_ID) || [], getJobTitleName),
        });

        return deptColumns;
    }, [employees, departments, getJobTitleName]);

    const managerCount = employees.filter((e) => isManagerPosition(e, getJobTitleName(e.job_title_id))).length;
    const staffCount = employees.length - managerCount;

    if (departments.length === 0) {
        return (
            <div className="flex flex-1 items-center justify-center p-12 text-center text-gray-500">
                <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Chưa có phòng ban. Thêm phòng ban để hiển thị Kanban.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-gray-100 bg-[#fbfcfd] text-[12px]">
                <span className="text-gray-500 font-medium">Chú thích:</span>
                <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 px-2 py-0.5 font-medium text-amber-900">
                    <Crown className="h-3.5 w-3.5 text-amber-600" />
                    Quản lý ({managerCount})
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-gray-700">
                    <Users className="h-3.5 w-3.5 text-gray-400" />
                    Nhân viên ({staffCount})
                </span>
            </div>

            <p className="shrink-0 px-4 pb-1 text-[11px] text-gray-400">
                Kéo thanh cuộn ngang (hoặc Shift + con lăn chuột) để xem tất cả phòng ban
            </p>
            <div className="employees-kanban-h-scroll flex-1 min-h-0 px-4 pb-3">
                <div className="flex h-full min-h-[320px] w-max min-w-full items-stretch gap-4 pr-2">
                    {columns.map((col, index) => {
                        const palette = COLUMN_PALETTES[index % COLUMN_PALETTES.length];
                        const managersInCol = col.employees.filter((e) =>
                            isManagerPosition(e, getJobTitleName(e.job_title_id))
                        ).length;

                        return (
                            <div
                                key={col.id}
                                className={`flex h-full max-h-[calc(100vh-13rem)] w-[280px] shrink-0 flex-col rounded-lg border border-gray-200 bg-gray-50/80 shadow-sm ring-1 ${palette.ring}`}
                            >
                                <div className={`rounded-t-lg px-2.5 py-1.5 text-white ${palette.header}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-90" />
                                            <h3 className="font-bold text-[12px] truncate" title={col.name}>
                                                {col.name}
                                            </h3>
                                        </div>
                                        <Badge className="bg-white/20 text-white border-0 text-[10px] shrink-0 h-5">
                                            {col.employees.length}
                                        </Badge>
                                    </div>
                                    {managersInCol > 0 && (
                                        <p className="text-[10px] text-white/85 mt-0.5 pl-5 leading-tight">
                                            {managersInCol} QL · {col.employees.length - managersInCol} NV
                                        </p>
                                    )}
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1 min-h-[80px]">
                                    {col.employees.length === 0 ? (
                                        <p className="py-3 text-center text-[11px] text-gray-400">Chưa có nhân viên</p>
                                    ) : (
                                        col.employees.map((emp) => (
                                            <EmployeeKanbanCard
                                                key={emp.id}
                                                emp={emp}
                                                jobTitleName={getJobTitleName(emp.job_title_id)}
                                                onView={onView}
                                                onEdit={onEdit}
                                                onDelete={onDelete}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
