import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    CheckCircle2, 
    Circle, 
    Clock, 
    ChevronDown, 
    ChevronRight,
    Building2,
    User as UserIcon,
    Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface TimelineStep {
    step_id: string;
    step_order: number;
    step_name: string;
    service_id: string;
    service_name: string;
    department_id?: string;
    department_name?: string;
    technician_id?: string;
    technician_name?: string;
    status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'skipped';
    estimated_duration?: number;
    started_at?: string;
    completed_at?: string;
    notes?: string;
}

interface ProductUnifiedTimelineProps {
    timeline: TimelineStep[];
    services: Array<{
        id: string;
        name: string;
        status: string;
        completion_percentage: number;
    }>;
    groupBy?: 'service' | 'department' | 'time';
    className?: string;
}

type GroupByType = 'service' | 'department' | 'time';

const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    pending: { 
        label: 'Chờ xử lý', 
        icon: <Circle className="h-4 w-4" />, 
        color: 'text-gray-400 border-gray-300' 
    },
    assigned: { 
        label: 'Đã phân công', 
        icon: <Clock className="h-4 w-4" />, 
        color: 'text-blue-400 border-blue-300' 
    },
    in_progress: { 
        label: 'Đang thực hiện', 
        icon: <Clock className="h-4 w-4 animate-spin" />, 
        color: 'text-blue-600 border-blue-500' 
    },
    completed: { 
        label: 'Đã hoàn thành', 
        icon: <CheckCircle2 className="h-4 w-4" />, 
        color: 'text-green-600 border-green-500' 
    },
    skipped: { 
        label: 'Đã bỏ qua', 
        icon: <Circle className="h-4 w-4" />, 
        color: 'text-gray-500 border-gray-400' 
    },
};

export function ProductUnifiedTimeline({
    timeline,
    services,
    groupBy = 'service',
    className
}: ProductUnifiedTimelineProps) {
    const [groupByState, setGroupByState] = useState<GroupByType>(groupBy);
    const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
    const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());

    const toggleService = (serviceId: string) => {
        const newSet = new Set(expandedServices);
        if (newSet.has(serviceId)) {
            newSet.delete(serviceId);
        } else {
            newSet.add(serviceId);
        }
        setExpandedServices(newSet);
    };

    const toggleDepartment = (deptId: string) => {
        const newSet = new Set(expandedDepartments);
        if (newSet.has(deptId)) {
            newSet.delete(deptId);
        } else {
            newSet.add(deptId);
        }
        setExpandedDepartments(newSet);
    };

    const formatDuration = (minutes?: number) => {
        if (!minutes) return null;
        if (minutes < 60) return `${minutes}p`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}p` : `${hours}h`;
    };

    const renderStep = (step: TimelineStep, index: number) => {
        const stepStatus = statusConfig[step.status] || statusConfig.pending;
        const isCompleted = step.status === 'completed' || step.status === 'skipped';
        const isInProgress = step.status === 'in_progress';

        return (
            <div key={step.step_id} className="relative">
                {/* Connector Line */}
                {index < timeline.length - 1 && (
                    <div className={cn(
                        "absolute left-5 top-10 bottom-0 w-0.5",
                        isCompleted ? "bg-green-200" : isInProgress ? "bg-blue-200" : "bg-gray-200"
                    )} />
                )}

                <div className="flex items-start gap-4 pb-4">
                    {/* Step Icon */}
                    <div className={cn(
                        "relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 bg-white",
                        stepStatus.color,
                        isCompleted && "bg-green-50",
                        isInProgress && "bg-blue-50 animate-pulse"
                    )}>
                        {stepStatus.icon}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-semibold text-sm">{step.step_name}</span>
                                    {step.department_name && (
                                        <Badge variant="outline" className="text-xs gap-1">
                                            <Building2 className="h-3 w-3" />
                                            {step.department_name}
                                        </Badge>
                                    )}
                                    {step.technician_name && (
                                        <Badge variant="outline" className="text-xs gap-1">
                                            <UserIcon className="h-3 w-3" />
                                            {step.technician_name}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {step.service_name}
                                </p>
                            </div>
                            <Badge variant="outline" className={cn("text-xs", stepStatus.color)}>
                                {stepStatus.label}
                            </Badge>
                        </div>

                        {/* Time Info */}
                        <div className="mt-2 space-y-1">
                            {step.started_at && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>Bắt đầu: {format(new Date(step.started_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span>
                                </div>
                            )}
                            {step.completed_at && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Hoàn thành: {format(new Date(step.completed_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span>
                                </div>
                            )}
                            {step.estimated_duration && (
                                <div className="text-xs text-muted-foreground">
                                    Ước tính: {formatDuration(step.estimated_duration)} 
                                    {step.started_at && step.completed_at && (
                                        <span className="ml-2">
                                            (Thực tế: {formatDuration(
                                                Math.round((new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) / 60000)
                                            )})
                                        </span>
                                    )}
                                </div>
                            )}
                            {step.notes && (
                                <div className="text-xs text-muted-foreground italic mt-1">
                                    Ghi chú: {step.notes}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderGroupedByService = () => {
        const grouped = timeline.reduce((acc, step) => {
            if (!acc[step.service_id]) {
                acc[step.service_id] = [];
            }
            acc[step.service_id].push(step);
            return acc;
        }, {} as Record<string, TimelineStep[]>);

        return (
            <div className="space-y-4">
                {Object.entries(grouped).map(([serviceId, steps]) => {
                    const service = services.find(s => s.id === serviceId);
                    const isExpanded = expandedServices.has(serviceId);
                    const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);

                    return (
                        <Card key={serviceId} className="overflow-hidden">
                            <CardHeader 
                                className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => toggleService(serviceId)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                            {isExpanded ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <CardTitle className="text-base">{service?.name || 'Dịch vụ'}</CardTitle>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="text-xs">
                                            {service?.completion_percentage || 0}%
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                            {sortedSteps.length} bước
                                        </Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            {isExpanded && (
                                <CardContent className="pt-0">
                                    <div className="pl-6">
                                        {sortedSteps.map((step, idx) => renderStep(step, idx))}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    );
                })}
            </div>
        );
    };

    const renderGroupedByDepartment = () => {
        const grouped = timeline.reduce((acc, step) => {
            const deptId = step.department_id || 'unknown';
            const deptName = step.department_name || 'Chưa phân phòng ban';
            if (!acc[deptId]) {
                acc[deptId] = { name: deptName, steps: [] };
            }
            acc[deptId].steps.push(step);
            return acc;
        }, {} as Record<string, { name: string; steps: TimelineStep[] }>);

        return (
            <div className="space-y-4">
                {Object.entries(grouped).map(([deptId, { name, steps }]) => {
                    const isExpanded = expandedDepartments.has(deptId);
                    const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);

                    return (
                        <Card key={deptId} className="overflow-hidden">
                            <CardHeader 
                                className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => toggleDepartment(deptId)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                            {isExpanded ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                        <CardTitle className="text-base">{name}</CardTitle>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                        {sortedSteps.length} bước
                                    </Badge>
                                </div>
                            </CardHeader>
                            {isExpanded && (
                                <CardContent className="pt-0">
                                    <div className="pl-6">
                                        {sortedSteps.map((step, idx) => renderStep(step, idx))}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    );
                })}
            </div>
        );
    };

    const renderChronological = () => {
        const sorted = [...timeline].sort((a, b) => {
            // Sort by step_order first
            if (a.step_order !== b.step_order) {
                return a.step_order - b.step_order;
            }
            // Then by started_at if available
            if (a.started_at && b.started_at) {
                return new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
            }
            return 0;
        });

        return (
            <div className="space-y-0">
                {sorted.map((step, idx) => renderStep(step, idx))}
            </div>
        );
    };

    return (
        <Card className={cn('shadow-sm', className)}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Timeline Tổng hợp</CardTitle>
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <select
                            value={groupByState}
                            onChange={(e) => setGroupByState(e.target.value as GroupByType)}
                            className="text-sm border rounded px-2 py-1"
                        >
                            <option value="service">Theo dịch vụ</option>
                            <option value="department">Theo phòng ban</option>
                            <option value="time">Theo thời gian</option>
                        </select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {timeline.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <p>Chưa có workflow steps nào</p>
                    </div>
                ) : (
                    <>
                        {groupByState === 'service' && renderGroupedByService()}
                        {groupByState === 'department' && renderGroupedByDepartment()}
                        {groupByState === 'time' && renderChronological()}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
