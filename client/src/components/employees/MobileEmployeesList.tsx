import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronRight, Edit, Eye, MoreHorizontal, Trash2 } from 'lucide-react';

export interface MobileEmployee {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    employee_code?: string;
    status?: string;
    avatar?: string;
    job_titles?: { name: string };
    departments?: { name: string };
}

interface MobileEmployeesListProps {
    employees: MobileEmployee[];
    loading: boolean;
    onView?: (employee: MobileEmployee) => void;
    onEdit?: (employee: MobileEmployee) => void;
    onDelete?: (employee: MobileEmployee) => void;
}

const statusConfig: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    onleave: 'bg-yellow-100 text-yellow-800',
};

const statusLabel: Record<string, string> = {
    active: 'Đang làm',
    inactive: 'Nghỉ việc',
    onleave: 'Nghỉ phép',
};

export function MobileEmployeesList({
    employees,
    loading,
    onView,
    onEdit,
    onDelete,
}: MobileEmployeesListProps) {
    if (loading) {
        return (
            <div className="space-y-1">
                {[...Array(5)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                        <CardContent className="h-[38px] bg-muted rounded" />
                    </Card>
                ))}
            </div>
        );
    }

    if (employees.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Không có nhân viên</p>
            </div>
        );
    }

    const hasActions = onView || onEdit || onDelete;

    return (
        <div className="space-y-1">
            {employees.map((employee) => {
                const statusKey = (employee.status || 'active') as keyof typeof statusConfig;

                return (
                    <Card
                        key={employee.id}
                        className="overflow-hidden hover:shadow-sm transition-shadow cursor-pointer"
                        onClick={() => onView?.(employee)}
                    >
                        <CardContent className="px-2 py-1">
                            <div className="flex h-[38px] items-center gap-2">
                                <Avatar className="h-7 w-7 shrink-0">
                                    {employee.avatar && <AvatarImage src={employee.avatar} alt={employee.name} />}
                                    <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                                        {employee.name.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                                    <p className="shrink-0 max-w-[40%] truncate text-[11px] font-semibold" title={employee.name}>
                                        {employee.name}
                                    </p>
                                    {employee.job_titles?.name && (
                                        <>
                                            <span className="shrink-0 text-[10px] text-gray-300">·</span>
                                            <p
                                                className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground"
                                                title={employee.job_titles.name}
                                            >
                                                {employee.job_titles.name}
                                            </p>
                                        </>
                                    )}
                                    <Badge
                                        className={`${statusConfig[statusKey] || statusConfig.active} shrink-0 text-[9px] px-1 py-0 h-4`}
                                        variant="outline"
                                    >
                                        {statusLabel[statusKey] || statusKey}
                                    </Badge>
                                </div>

                                {hasActions ? (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                            {onView && (
                                                <DropdownMenuItem onClick={() => onView(employee)}>
                                                    <Eye className="h-4 w-4 mr-2" />
                                                    Xem
                                                </DropdownMenuItem>
                                            )}
                                            {onEdit && (
                                                <DropdownMenuItem onClick={() => onEdit(employee)}>
                                                    <Edit className="h-4 w-4 mr-2" />
                                                    Sửa
                                                </DropdownMenuItem>
                                            )}
                                            {onDelete && (
                                                <DropdownMenuItem
                                                    className="text-red-600 focus:text-red-600"
                                                    onClick={() => onDelete(employee)}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Xóa
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
