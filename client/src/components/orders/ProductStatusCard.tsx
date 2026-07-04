import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, AlertCircle, Loader2, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductStatusCardProps {
    completionPercentage: number;
    overallStatus: string;
    totalSteps: number;
    completedSteps: number;
    totalDurationMinutes?: number;
    estimatedDurationMinutes?: number;
    earliestStartedAt?: string;
    latestCompletedAt?: string;
    className?: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning'; color: string }> = {
    pending: { 
        label: 'Chờ xử lý', 
        variant: 'secondary', 
        color: 'bg-gray-100 text-gray-800' 
    },
    in_progress: { 
        label: 'Đang thực hiện', 
        variant: 'default', 
        color: 'bg-blue-100 text-blue-800' 
    },
    partially_completed: { 
        label: 'Hoàn thành một phần', 
        variant: 'warning', 
        color: 'bg-yellow-100 text-yellow-800' 
    },
    completed: { 
        label: 'Đã hoàn thành', 
        variant: 'success', 
        color: 'bg-green-100 text-green-800' 
    },
    cancelled: { 
        label: 'Đã hủy', 
        variant: 'destructive', 
        color: 'bg-red-100 text-red-800' 
    },
};

export function ProductStatusCard({
    completionPercentage,
    overallStatus,
    totalSteps,
    completedSteps,
    totalDurationMinutes,
    estimatedDurationMinutes,
    earliestStartedAt,
    latestCompletedAt,
    className
}: ProductStatusCardProps) {
    const status = statusConfig[overallStatus] || statusConfig.pending;
    
    const formatDuration = (minutes?: number) => {
        if (!minutes) return 'N/A';
        if (minutes < 60) return `${minutes} phút`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}p` : `${hours}h`;
    };

    const getEfficiencyColor = () => {
        if (!totalDurationMinutes || !estimatedDurationMinutes) return 'text-gray-600';
        const ratio = totalDurationMinutes / estimatedDurationMinutes;
        if (ratio <= 1) return 'text-green-600';
        if (ratio <= 1.2) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getEfficiencyLabel = () => {
        if (!totalDurationMinutes || !estimatedDurationMinutes) return null;
        const ratio = totalDurationMinutes / estimatedDurationMinutes;
        if (ratio <= 1) return 'Đúng tiến độ';
        if (ratio <= 1.2) return 'Chậm một chút';
        return 'Chậm so với ước tính';
    };

    return (
        <Card className={cn('shadow-sm', className)}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Trạng thái tổng thể</CardTitle>
                    <Badge className={cn(status.color, 'gap-1.5')}>
                        {overallStatus === 'in_progress' && <Loader2 className="h-3 w-3 animate-spin" />}
                        {overallStatus === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                        {overallStatus === 'partially_completed' && <AlertCircle className="h-3 w-3" />}
                        {status.label}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tiến độ hoàn thành</span>
                        <span className="font-semibold">{completionPercentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div 
                            className={cn(
                                "h-full transition-all duration-300",
                                completionPercentage === 100 ? "bg-green-500" : 
                                completionPercentage >= 50 ? "bg-blue-500" : 
                                completionPercentage > 0 ? "bg-yellow-500" : "bg-gray-300"
                            )}
                            style={{ width: `${completionPercentage}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{completedSteps} / {totalSteps} bước đã hoàn thành</span>
                    </div>
                </div>

                {/* Time Tracking */}
                {(totalDurationMinutes !== undefined || estimatedDurationMinutes !== undefined) && (
                    <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center gap-2 text-sm">
                            <Timer className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Thời gian thực hiện</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Thực tế</p>
                                <p className="text-sm font-semibold">
                                    {formatDuration(totalDurationMinutes)}
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Ước tính</p>
                                <p className="text-sm font-semibold">
                                    {formatDuration(estimatedDurationMinutes)}
                                </p>
                            </div>
                        </div>
                        {getEfficiencyLabel() && (
                            <p className={cn('text-xs font-medium', getEfficiencyColor())}>
                                {getEfficiencyLabel()}
                            </p>
                        )}
                    </div>
                )}

                {/* Timeline Info */}
                {(earliestStartedAt || latestCompletedAt) && (
                    <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Thời điểm</span>
                        </div>
                        <div className="space-y-1 text-xs">
                            {earliestStartedAt && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Bắt đầu:</span>
                                    <span className="font-medium">
                                        {new Date(earliestStartedAt).toLocaleString('vi-VN')}
                                    </span>
                                </div>
                            )}
                            {latestCompletedAt && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Hoàn thành:</span>
                                    <span className="font-medium">
                                        {new Date(latestCompletedAt).toLocaleString('vi-VN')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
