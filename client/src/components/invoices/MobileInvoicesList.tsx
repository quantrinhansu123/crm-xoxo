import { Eye, FileText, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

export interface MobileInvoice {
    id: string;
    invoice_code?: string;
    order_id: string;
    customer?: { name?: string; phone?: string };
    order?: { order_code?: string; customer?: { name?: string; phone?: string } };
    total_amount?: number;
    amount?: number;
    payment_method?: string;
    status?: string;
    created_at: string;
}

interface MobileInvoicesListProps {
    invoices: MobileInvoice[];
    loading: boolean;
    onView?: (invoice: MobileInvoice) => void;
    onEdit?: (invoice: MobileInvoice) => void;
    onDelete?: (invoiceId: string) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
    draft: { label: 'Nháp', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    pending: { label: 'Chờ TT', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    paid: { label: 'Đã TT', className: 'bg-green-100 text-green-800 border-green-200' },
    cancelled: { label: 'Đã hủy', className: 'bg-red-100 text-red-800 border-red-200' },
};

const paymentMethodLabel: Record<string, string> = {
    cash: 'Tiền mặt',
    transfer: 'Chuyển khoản',
    zalopay: 'Zalo Pay',
};

function getCustomer(invoice: MobileInvoice) {
    return invoice.customer ?? invoice.order?.customer;
}

export function MobileInvoicesList({ invoices, loading, onView, onEdit, onDelete }: MobileInvoicesListProps) {
    if (loading) {
        return (
            <div className="space-y-1.5">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="animate-pulse border-0 shadow-sm">
                        <CardContent className="h-[72px] rounded-lg bg-muted px-2.5 py-2" />
                    </Card>
                ))}
            </div>
        );
    }

    if (invoices.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-4 py-10">
                <FileText className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">Không có hóa đơn</p>
            </div>
        );
    }

    const hasActions = onView || onEdit || onDelete;

    return (
        <div className="space-y-1.5">
            {invoices.map((invoice) => {
                const customer = getCustomer(invoice);
                const status = statusConfig[invoice.status || 'pending'] ?? statusConfig.pending;
                const canModify = invoice.status !== 'paid' && invoice.status !== 'cancelled';
                const amount = invoice.total_amount ?? invoice.amount ?? 0;
                const code = invoice.invoice_code || `HĐ-${invoice.id.slice(0, 8)}`;
                const orderRef = invoice.order?.order_code;
                const customerName = customer?.name || 'Khách lẻ';
                const payLabel = paymentMethodLabel[invoice.payment_method || 'cash'] || 'Tiền mặt';

                return (
                    <Card
                        key={invoice.id}
                        className="overflow-hidden border shadow-sm transition-shadow active:scale-[0.99]"
                        onClick={() => onView?.(invoice)}
                    >
                        <CardContent className="space-y-1 px-2.5 py-2">
                            <div className="flex h-[17px] items-center gap-1.5">
                                <p className="min-w-0 truncate text-[13px] font-bold leading-none text-foreground">
                                    {code}
                                </p>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'ml-auto h-4 shrink-0 px-1 py-0 text-[9px] font-semibold leading-none',
                                        status.className,
                                    )}
                                >
                                    {status.label}
                                </Badge>
                            </div>

                            <p className="h-[15px] truncate text-[11px] leading-none text-muted-foreground">
                                {orderRef && <span>ĐH {orderRef} · </span>}
                                <span className="font-medium text-foreground">{customerName}</span>
                            </p>

                            <div className="flex h-[20px] items-center gap-1">
                                <p className="min-w-0 flex-1 truncate text-[10px] leading-none text-muted-foreground">
                                    {customer?.phone && <span>{customer.phone} · </span>}
                                    {payLabel} · Ngày tạo {formatDate(invoice.created_at)}
                                </p>
                                <p className="shrink-0 text-[13px] font-bold leading-none text-primary">
                                    {formatCurrency(amount)}
                                </p>
                            </div>

                            {hasActions && (
                                <div
                                    className="flex items-center justify-end gap-1 border-t border-border/60 pt-1.5"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                        {onView && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 gap-1 px-2.5 text-xs"
                                                onClick={() => onView(invoice)}
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                Xem
                                            </Button>
                                        )}
                                        {onEdit && canModify && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 gap-1 border-blue-100 px-2.5 text-xs text-blue-600 hover:bg-blue-50"
                                                onClick={() => onEdit(invoice)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                                Sửa
                                            </Button>
                                        )}
                                        {onDelete && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 gap-1 border-red-100 px-2.5 text-xs text-destructive hover:bg-red-50"
                                                onClick={() => onDelete(invoice.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Xóa
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
