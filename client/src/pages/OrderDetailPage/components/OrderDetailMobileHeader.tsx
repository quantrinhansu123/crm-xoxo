import {
    ArrowLeft,
    CheckCircle2,
    CreditCard,
    Edit,
    FileText,
    MoreVertical,
    Printer,
    Sparkles,
    ThumbsUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CustomerPhone } from '@/components/customers/CustomerPhone';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/utils';
import type { Order } from '@/hooks/useOrders';
import { columns } from '../constants';

interface OrderDetailMobileHeaderProps {
    order: Order;
    canEdit: boolean;
    canApprove: boolean;
    onUpsell: () => void;
    onPrintQr: () => void;
    onPrintInvoice: () => void;
    onEdit: () => void;
    onPayment: () => void;
    onApprove: () => void;
}

function StatCard({
    label,
    value,
    className,
    labelClassName,
}: {
    label: string;
    value: string;
    className: string;
    labelClassName: string;
}) {
    return (
        <div className={`min-w-0 overflow-hidden rounded-lg p-2 ${className}`}>
            <p className={`text-[10px] font-medium ${labelClassName}`}>{label}</p>
            <p className="truncate text-xs font-bold leading-tight">{value}</p>
        </div>
    );
}

export function OrderDetailMobileHeader({
    order,
    canEdit,
    canApprove,
    onUpsell,
    onPrintQr,
    onPrintInvoice,
    onEdit,
    onPayment,
    onApprove,
}: OrderDetailMobileHeaderProps) {
    const navigate = useNavigate();
    const remaining =
        order.remaining_debt ?? Math.max(0, (order.total_amount || 0) - (order.paid_amount || 0));
    const statusTitle = columns.find((c) => c.id === order.status)?.title || order.status;

    const paymentLabel =
        order.payment_status === 'paid'
            ? 'Đã TT'
            : order.payment_status === 'partial'
              ? 'Một phần'
              : 'Chưa TT';

    return (
        <div className="w-full min-w-0 max-w-full md:hidden">
            <div className="rounded-b-2xl bg-gradient-to-b from-slate-800 to-slate-900 px-3 pb-3 pt-2 text-white shadow-md">
                <div className="flex min-w-0 items-start gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-white hover:bg-white/10"
                        onClick={() => navigate(-1)}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h1 className="truncate text-xl font-bold leading-none">{order.order_code}</h1>
                            <Badge className="h-5 shrink-0 border-0 bg-white/20 px-2 text-[10px] font-medium text-white/90 hover:bg-white/20">
                                {statusTitle}
                            </Badge>
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-300">
                            {order.customer?.name || 'Khách lẻ'}
                            {' · '}
                            <CustomerPhone phone={order.customer?.phone} className="inline" />
                        </p>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 text-white hover:bg-white/10"
                            >
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={onUpsell}>
                                <Sparkles className="mr-2 h-4 w-4 text-purple-500" />
                                Upsell
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onPrintQr}>
                                <Printer className="mr-2 h-4 w-4" />
                                In phiếu QR
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onPrintInvoice}>
                                <FileText className="mr-2 h-4 w-4" />
                                In hóa đơn
                            </DropdownMenuItem>
                            {canEdit &&
                                order.status !== 'after_sale' &&
                                order.status !== 'cancelled' && (
                                <DropdownMenuItem onClick={onEdit}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Sửa đơn
                                </DropdownMenuItem>
                            )}
                            {canApprove && (
                                <DropdownMenuItem onClick={onApprove}>
                                    <ThumbsUp className="mr-2 h-4 w-4 text-red-600" />
                                    Phê duyệt
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Khung thống kê + thanh toán */}
                <div className="mt-3 box-border w-full min-w-0 max-w-full rounded-2xl border border-white/15 bg-slate-950/50 p-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] ring-1 ring-inset ring-white/10">
                    <div className="grid min-w-0 grid-cols-2 gap-1.5">
                        <StatCard
                            label="Tổng đơn"
                            value={formatCurrency(order.total_amount || 0)}
                            className="bg-blue-600"
                            labelClassName="text-blue-100"
                        />
                        <StatCard
                            label="Đã TT"
                            value={formatCurrency(order.paid_amount || 0)}
                            className="bg-emerald-600"
                            labelClassName="text-emerald-100"
                        />
                        <StatCard
                            label="Còn nợ"
                            value={formatCurrency(remaining)}
                            className="bg-orange-500"
                            labelClassName="text-orange-100"
                        />
                        <StatCard
                            label="Thanh toán"
                            value={paymentLabel}
                            className="bg-purple-600"
                            labelClassName="text-purple-100"
                        />
                    </div>

                    <Button
                        className={
                            order.payment_status === 'paid'
                                ? 'mt-2 h-9 w-full min-w-0 border border-emerald-400/30 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-950/80'
                                : 'mt-2 h-9 w-full min-w-0 bg-emerald-600 hover:bg-emerald-700'
                        }
                        onClick={onPayment}
                    >
                        {order.payment_status === 'paid' ? (
                            <>
                                <CheckCircle2 className="mr-2 h-4 w-4 shrink-0" />
                                Đã thanh toán
                            </>
                        ) : (
                            <>
                                <CreditCard className="mr-2 h-4 w-4 shrink-0" />
                                Thanh toán
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
