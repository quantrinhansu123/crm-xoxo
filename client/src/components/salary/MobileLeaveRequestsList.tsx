import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Clock, Check, X, Calendar } from 'lucide-react';

interface LeaveRequest {
    id: string;
    user_id: string;
    type: 'leave' | 'late';
    sub_type: string;
    start_time: string;
    end_time?: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    approved_by?: string;
    created_at: string;
    users?: { name: string; email: string; avatar?: string };
    approver?: { name: string; email: string };
}

interface MobileLeaveRequestsListProps {
    requests: LeaveRequest[];
    loading: boolean;
    onView?: (request: LeaveRequest) => void;
    onApprove?: (requestId: string) => void;
    onReject?: (requestId: string) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Chờ duyệt', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" /> },
    approved: { label: 'Đã duyệt', color: 'bg-green-100 text-green-800', icon: <Check className="h-3 w-3" /> },
    rejected: { label: 'Từ chối', color: 'bg-red-100 text-red-800', icon: <X className="h-3 w-3" /> },
};

const typeLabels: Record<string, string> = {
    leave: 'Xin nghỉ',
    late: 'Xin muộn',
};

const subTypeLabels: Record<string, string> = {
    annual: 'Phép hàng năm',
    unexpected_leave: 'Nghỉ đột xuất',
    unexpected_late: 'Muộn đột xuất',
    planned_late: 'Xin trước',
};

function formatDateTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function MobileLeaveRequestsList({
    requests,
    loading,
    onView,
    onApprove,
    onReject,
}: MobileLeaveRequestsListProps) {
    if (loading) {
        return (
            <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                        <CardContent className="p-3 h-28 bg-muted rounded" />
                    </Card>
                ))}
            </div>
        );
    }

    if (requests.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <p className="text-muted-foreground">Không có yêu cầu</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {requests.map((request) => {
                const statusInfo = statusConfig[request.status];
                const typeLabel = typeLabels[request.type];
                const subTypeLabel = subTypeLabels[request.sub_type] || request.sub_type;

                return (
                    <Card key={request.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <CardContent className="p-3">
                            {/* Header */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Avatar className="h-8 w-8 shrink-0">
                                        {request.users?.avatar && (
                                            <AvatarImage src={request.users.avatar} alt={request.users.name} />
                                        )}
                                        <AvatarFallback className="text-xs">
                                            {request.users?.name.charAt(0) || 'N'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate">{request.users?.name}</p>
                                        <p className="text-xs text-muted-foreground">{subTypeLabel}</p>
                                    </div>
                                </div>
                                <Badge className={statusInfo.color}>
                                    {statusInfo.icon}
                                    <span className="ml-1 text-[11px]">{statusInfo.label}</span>
                                </Badge>
                            </div>

                            {/* Type Badge */}
                            <div className="mb-2">
                                <Badge variant="outline" className="text-[10px]">
                                    <Calendar className="h-2.5 w-2.5 mr-1" />
                                    {typeLabel}
                                </Badge>
                            </div>

                            {/* Time Period */}
                            <div className="bg-muted p-2 rounded mb-2 text-xs">
                                <p className="text-muted-foreground mb-0.5">Thời gian</p>
                                <p className="font-semibold text-foreground">
                                    {formatDateTime(request.start_time)}
                                </p>
                                {request.end_time && (
                                    <p className="text-muted-foreground text-[11px] mt-0.5">
                                        đến {formatDateTime(request.end_time)}
                                    </p>
                                )}
                            </div>

                            {/* Reason */}
                            {request.reason && (
                                <div className="mb-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                    <p className="text-blue-600 font-medium mb-0.5">Lý do:</p>
                                    <p className="line-clamp-2">{request.reason}</p>
                                </div>
                            )}

                            {/* Approver Info */}
                            {request.approver && request.status !== 'pending' && (
                                <div className="mb-2 text-xs text-muted-foreground">
                                    Người duyệt: <span className="font-medium">{request.approver.name}</span>
                                </div>
                            )}

                            {/* Actions */}
                            {request.status === 'pending' && (onApprove || onReject) && (
                                <div className="flex gap-1 pt-2 border-t">
                                    {onApprove && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => onApprove(request.id)}
                                            className="flex-1 text-xs h-7"
                                        >
                                            <Check className="h-3 w-3 mr-1" />
                                            Duyệt
                                        </Button>
                                    )}
                                    {onReject && (
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => onReject(request.id)}
                                            className="flex-1 text-xs h-7"
                                        >
                                            <X className="h-3 w-3 mr-1" />
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
