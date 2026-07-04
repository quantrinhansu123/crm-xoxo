import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, Eye, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface Voucher {
    id: string;
    voucher_code?: string;
    voucher_name?: string;
    type: 'income' | 'expense';
    amount: number;
    account_name?: string;
    description?: string;
    created_at: string;
    created_by?: { name: string };
    status?: string;
}

interface MobileFinanceListProps {
    vouchers: Voucher[];
    loading: boolean;
    onView?: (voucher: Voucher) => void;
    onDelete?: (voucherId: string) => void;
}

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

export function MobileFinanceList({
    vouchers,
    loading,
    onView,
    onDelete,
}: MobileFinanceListProps) {
    if (loading) {
        return (
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                        <CardContent className="p-3 h-20 bg-muted rounded" />
                    </Card>
                ))}
            </div>
        );
    }

    if (vouchers.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <p className="text-muted-foreground">Không có ghi chép</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {vouchers.map((voucher) => {
                const isIncome = voucher.type === 'income';
                const TypeIcon = isIncome ? ArrowDownLeft : ArrowUpRight;

                return (
                    <Card key={voucher.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                                {/* Left side - Icon + Info */}
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <div className={`p-2 rounded-lg shrink-0 ${
                                        isIncome
                                            ? 'bg-green-100 text-green-600'
                                            : 'bg-red-100 text-red-600'
                                    }`}>
                                        <TypeIcon className="h-4 w-4" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="font-semibold text-sm truncate">
                                                {voucher.voucher_code || voucher.voucher_name || 'N/A'}
                                            </p>
                                            <Badge className={isIncome ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} variant="outline">
                                                {isIncome ? 'Thu' : 'Chi'}
                                            </Badge>
                                        </div>

                                        {voucher.account_name && (
                                            <p className="text-xs text-muted-foreground truncate">{voucher.account_name}</p>
                                        )}

                                        {voucher.description && (
                                            <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{voucher.description}</p>
                                        )}

                                        <p className="text-xs text-muted-foreground mt-1">
                                            {formatDate(voucher.created_at)}
                                            {voucher.created_by && ` - ${voucher.created_by.name}`}
                                        </p>
                                    </div>
                                </div>

                                {/* Right side - Amount + Menu */}
                                <div className="flex flex-col items-end gap-1">
                                    <p className={`font-bold text-sm ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                        {isIncome ? '+' : '-'}{formatCurrency(voucher.amount)}
                                    </p>

                                    {(onView || onDelete) && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {onView && (
                                                    <DropdownMenuItem onClick={() => onView(voucher)}>
                                                        <Eye className="h-4 w-4 mr-2" />
                                                        Xem
                                                    </DropdownMenuItem>
                                                )}
                                                {onDelete && (
                                                    <DropdownMenuItem
                                                        onClick={() => onDelete(voucher.id)}
                                                        className="text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Xóa
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
