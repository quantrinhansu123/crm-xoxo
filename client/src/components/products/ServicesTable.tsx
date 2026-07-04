import { Edit, Trash2, Wrench, GitBranch, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/utils';
import type { Service } from './types';
import { getDepartmentLabel, type DepartmentOption } from './ServiceFormDialog';
import { useWorkflows } from '@/hooks/useWorkflows';

interface ServicesTableProps {
    services: Service[];
    loading: boolean;
    onEdit: (service: Service) => void;
    onDelete: (id: string) => void;
    departments?: DepartmentOption[];
}

export function ServicesTable({ services, loading, onEdit, onDelete, departments = [] }: ServicesTableProps) {
    const { workflows } = useWorkflows();

    const getWorkflowName = (workflowId?: string) => {
        if (!workflowId) return null;
        return workflows.find(w => w.id === workflowId)?.name || null;
    };

    return (
        <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-muted/50 border-b">
                        <tr>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Hình ảnh</th>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Mã</th>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Tên dịch vụ</th>
                            <th className="p-3 text-right text-sm font-medium text-muted-foreground">Giá</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">Thời lượng</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">Quy trình</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">Phòng ban</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">HH Sale</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">HH KTV</th>
                            <th className="p-3 text-right text-sm font-medium text-muted-foreground">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && services.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                                    Đang tải dữ liệu...
                                </td>
                            </tr>
                        ) : services.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                                    Không tìm thấy dịch vụ nào
                                </td>
                            </tr>
                        ) : (
                            services.map((service) => (
                                <tr key={service.id} className="border-b hover:bg-muted/30 transition-colors">
                                    <td className="p-3">
                                        {service.image ? (
                                            <img
                                                src={service.image}
                                                alt={service.name}
                                                className="w-12 h-12 rounded-lg object-cover border shadow-sm"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                                <Wrench className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 font-mono text-sm">{service.code}</td>
                                    <td className="p-3 font-medium">{service.name}</td>
                                    <td className="p-3 text-right font-semibold text-primary">{formatCurrency(service.price)}</td>
                                    <td className="p-3 text-center">{service.duration || 0} phút</td>
                                    <td className="p-3 text-center">
                                        {getWorkflowName(service.workflow_id) ? (
                                            <Badge variant="secondary" className="text-xs gap-1">
                                                <GitBranch className="h-3 w-3" />
                                                {getWorkflowName(service.workflow_id)}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">-</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-center">
                                        {service.department ? (
                                            <Badge variant="outline" className="text-xs">
                                                {getDepartmentLabel(service.department, departments)}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">-</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-center">
                                        <Badge variant="info" className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200">
                                            {service.commission_sale || 0}%
                                        </Badge>
                                    </td>
                                    <td className="p-3 text-center">
                                        <Badge variant="info" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">
                                            {service.commission_tech || 0}%
                                        </Badge>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" onClick={() => onEdit(service)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => onDelete(service.id)} className="text-red-500">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="space-y-2.5 overflow-x-hidden md:hidden">
                {loading && services.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        Đang tải dữ liệu...
                    </div>
                ) : services.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        Không tìm thấy dịch vụ nào
                    </div>
                ) : (
                    services.map((service) => (
                        <div key={service.id} className="w-full space-y-2 rounded-lg border bg-card p-2.5 shadow-sm">
                            <div className="flex items-start gap-2">
                                {service.image ? (
                                    <img
                                        src={service.image}
                                        alt={service.name}
                                        className="h-12 w-12 shrink-0 rounded-lg border object-cover shadow-sm"
                                    />
                                ) : (
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                                        <Wrench className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="line-clamp-2 pr-2 text-[13px] font-medium leading-5">{service.name}</h3>
                                            <p className="font-mono text-xs text-muted-foreground">{service.code}</p>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => onEdit(service)}>
                                                    <Edit className="mr-2 h-4 w-4" />
                                                    Sửa
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onDelete(service.id)} className="text-red-600 focus:text-red-600">
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Xóa
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="text-sm font-bold text-primary">{formatCurrency(service.price)}</span>
                                        <Badge variant="outline" className="text-xs">
                                            {service.duration || 0} phút
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 border-t pt-2">
                                {getWorkflowName(service.workflow_id) && (
                                    <Badge variant="secondary" className="max-w-full gap-1 truncate text-[11px]">
                                        <GitBranch className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{getWorkflowName(service.workflow_id)}</span>
                                    </Badge>
                                )}
                                {service.department && (
                                    <Badge variant="outline" className="text-[11px]">
                                        {getDepartmentLabel(service.department, departments)}
                                    </Badge>
                                )}
                                <Badge variant="info" className="bg-amber-100 text-[11px] text-amber-700 border-amber-200">Sale {service.commission_sale || 0}%</Badge>
                                <Badge variant="info" className="bg-emerald-100 text-[11px] text-emerald-700 border-emerald-200">KTV {service.commission_tech || 0}%</Badge>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

