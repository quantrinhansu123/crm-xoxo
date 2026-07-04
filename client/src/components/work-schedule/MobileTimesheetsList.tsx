import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MoreHorizontal, Check, X, Clock } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface Timesheet {
    id: string;
    date: string;
    user_id: string;
    check_in_time?: string;
    check_out_time?: string;
    status?: string;
    note?: string;
    users?: {
        name: string;
        email: string;
        avatar?: string;
    };
}

interface MobileTimesheetsListProps {
    timesheets: Timesheet[];
    loading: boolean;
    onView?: (timesheet: Timesheet) => void;
    onApprove?: (timesheetId: string) => void;
    onReject?: (timesheetId: string) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Chờ duyệt', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" /> },
    approved: { label: 'Đã duyệt', color: 'bg-green-100 text-green-800', icon: <Check className="h-3 w-3" /> },
    rejected: { label: 'Từ chối', color: 'bg-red-100 text-red-800', icon: <X className="h-3 w-3" /> },
};

export function MobileTimesheetsList({
    timesheets,
    loading,
    onView,
    onApprove,
    onReject,
}: MobileTimesheetsListProps) {
    if (loading) {
        return (
            <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                        <CardContent className="p-3 h-24 bg-muted rounded" />
                    </Card>
                ))}
            </div>
        );
    }

    if (timesheets.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <p className="text-muted-foreground">Không có bảng chấm công</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {timesheets.map((timesheet) => {
                const status = (timesheet.status || 'pending') as keyof typeof statusConfig;
                const statusInfo = statusConfig[status];
                const date = new Date(timesheet.date);
                const dateStr = date.toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                });

                return (
                    <Card key={timesheet.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <CardContent className="p-3">
                            {/* Header */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Avatar className="h-8 w-8 shrink-0">
                                        {timesheet.users?.avatar && (
                                            <AvatarImage src={timesheet.users.avatar} alt={timesheet.users.name} />
                                        )}
                                        <AvatarFallback className="text-xs">
                                            {timesheet.users?.name.charAt(0) || 'N'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate">{timesheet.users?.name}</p>
                                        <p className="text-xs text-muted-foreground">{dateStr}</p>
                                    </div>
                                </div>
                                <Badge className={statusInfo.color}>
                                    {statusInfo.icon}
                                    <span className="ml-1">{statusInfo.label}</span>
                                </Badge>
                            </div>

                            {/* Time Info */}
                            <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                                <div className="bg-muted p-2 rounded">
                                    <p className="text-muted-foreground">Giờ vào</p>
                                    <p className="font-semibold text-foreground">
                                        {timesheet.check_in_time || 'N/A'}
                                    </p>
                                </div>
                                <div className="bg-muted p-2 rounded">
                                    <p className="text-muted-foreground">Giờ ra</p>
                                    <p className="font-semibold text-foreground">
                                        {timesheet.check_out_time || 'N/A'}
                                    </p>
                                </div>
                            </div>

                            {/* Note */}
                            {timesheet.note && (
                                <div className="mb-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                    {timesheet.note}
                                </div>
                            )}

                            {/* Actions */}
                            {(onView || onApprove || onReject) && (
                                <div className="flex gap-1 pt-2 border-t">
                                    {onView && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onView(timesheet)}
                                            className="flex-1 text-xs h-7"
                                        >
                                            Xem chi tiết
                                        </Button>
                                    )}
                                    {onApprove && status === 'pending' && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => onApprove(timesheet.id)}
                                            className="flex-1 text-xs h-7"
                                        >
                                            Duyệt
                                        </Button>
                                    )}
                                    {onReject && status === 'pending' && (
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => onReject(timesheet.id)}
                                            className="flex-1 text-xs h-7"
                                        >
                                            Từ chối
                                        </Button>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
