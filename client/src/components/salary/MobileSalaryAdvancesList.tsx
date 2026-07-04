import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Clock, Check, X, Trash2, MoreHorizontal, DollarSign, ArrowDownCircle } from 'lucide-react';

interface SalaryAdvance {
    id: string;
    user_id: string;
    amount: number;
    requested_at: string;
    status: 'pending' | 'approved' | 'rejected' | 'deducted';
    approved_by?: string;
    reason?: string;
    users?: { name: string; email: string; avatar?: string };
    approver?: { name: string; email: string };
}

interface MobileSalaryAdvancesListProps {
    advances: SalaryAdvance[];
    loading: boolean;
    onApprove?: (advanceId: string) => void;
    onReject?: (advanceId: string) => void;
    onDelete?: (advanceId: string) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Chờ duyệt', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" /> },
    approved: { label: 'Đã duyệt', color: 'bg-blue-100 text-blue-800', icon: <Check className="h-3 w-3" /> },
    rejected: { label: 'Từ chối', color: 'bg-red-100 text-red-800', icon: <X className="h-3 w-3" /> },
    deducted: { label: 'Đã trừ lương', color: 'bg-green-100 text-green-800', icon: <ArrowDownCircle className="h-3 w-3" /> },
};

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(amount);
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    });
}

export function MobileSalaryAdvancesList({
    advances,
    loading,
    onApprove,
    onReject,
    onDelete,
}: MobileSalaryAdvancesListProps) {
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

    if (advances.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <DollarSign className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                    <p className="text-muted-foreground">Không có yêu cầu ứng lương</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {advances.map((advance) => {
                const statusInfo = statusConfig[advance.status];

                return (
                    <Card key={advance.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <CardContent className="p-3">
                            {/* Header */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Avatar className="h-8 w-8 shrink-0">
                                        {advance.users?.avatar && (
                                            <AvatarImage src={advance.users.avatar} alt={advance.users.name} />
                                        )}
                                        <AvatarFallback className="text-xs">
                                            {advance.users?.name.charAt(0) || 'N'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate">{advance.users?.name}</p>
                                        <p className="text-xs text-muted-foreground">{formatDate(advance.requested_at)}</p>
                                    </div>
                                </div>
                                {(onDelete && advance.status === 'pending') && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() => onDelete(advance.id)}
                                                className="text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Xóa
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>

                            {/* Amount & Status */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div>
                                    <p className="text-xs text-muted-foreground">Số tiền ứng</p>
                                    <p className="font-bold text-primary text-lg">
                                        {formatCurrency(advance.amount)}
                                    </p>
                                </div>
                                <Badge className={statusInfo.color}>
                                    {statusInfo.icon}
                                    <span className="ml-1 text-[11px]">{statusInfo.label}</span>
                                </Badge>
                            </div>

                            {/* Reason */}
                            {advance.reason && (
                                <div className="mb-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                    <p className="line-clamp-2">{advance.reason}</p>
                                </div>
                            )}

                            {/* Approver Info */}
                            {advance.approver && advance.status !== 'pending' && (
                                <div className="mb-2 text-xs text-muted-foreground">
                                    Người duyệt: <span className="font-medium">{advance.approver.name}</span>
                                </div>
                            )}

                            {/* Actions */}
                            {advance.status === 'pending' && (onApprove || onReject) && (
                                <div className="flex gap-1 pt-2 border-t">
                                    {onApprove && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => onApprove(advance.id)}
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
                                            onClick={() => onReject(advance.id)}
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
