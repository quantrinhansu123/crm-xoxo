import { useState } from 'react';
import { Package, Gift, Sparkles, ShoppingBag, CreditCard, Printer, Wrench, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Order } from '@/hooks/useOrders';
import { columns } from './constants';
import { PrintQRDialog } from './PrintQRDialog';

interface OrderDetailDialogProps {
    order: Order | null;
    open: boolean;
    onClose: () => void;
    onEdit?: (order: Order) => void;
    onPayment?: (order: Order) => void;
}

export function OrderDetailDialog({
    order,
    open,
    onClose,
    onEdit,
    onPayment
}: OrderDetailDialogProps) {
    const [showPrintDialog, setShowPrintDialog] = useState(false);

    if (!order) return null;

    const getItemTypeLabel = (type: string) => {
        switch (type) {
            case 'product': return 'Sản phẩm';
            case 'service': return 'Dịch vụ';
            case 'package': return 'Gói dịch vụ';
            case 'voucher': return 'Voucher';
            default: return type;
        }
    };

    const getItemTypeColor = (type: string) => {
        switch (type) {
            case 'product': return 'bg-blue-100 text-blue-700';
            case 'service': return 'bg-purple-100 text-purple-700';
            case 'package': return 'bg-emerald-100 text-emerald-700';
            case 'voucher': return 'bg-amber-100 text-amber-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onClose}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShoppingBag className="h-5 w-5 text-primary" />
                            <span className="font-bold">{order.order_code}</span>
                            <Badge variant={
                                order.status === 'after_sale' ? 'success' :
                                    order.status === 'cancelled' ? 'danger' :
                                        order.status === 'in_progress' ? 'warning' :
                                            order.status === 'done' ? 'purple' : 'info'
                            }>
                                {columns.find(c => c.id === order.status)?.title}
                            </Badge>
                        </DialogTitle>
                        <DialogDescription>Chi tiết đơn hàng</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4">
                        {/* Customer Info */}
                        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                            <Avatar className="h-12 w-12">
                                <AvatarFallback className="bg-primary text-white">{order.customer?.name?.charAt(0) || 'C'}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                                <p className="font-semibold">{order.customer?.name || 'N/A'}</p>
                                <p className="text-sm text-muted-foreground">{order.customer?.phone || 'Không có SĐT'}</p>
                            </div>
                        </div>

                        {/* Items Table */}
                        {order.items && order.items.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                                    <Package className="h-4 w-4" />
                                    Chi tiết sản phẩm/dịch vụ ({order.items.length})
                                </p>
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50">
                                            <tr>
                                                <th className="text-left p-3 font-medium w-16">Ảnh</th>
                                                <th className="text-left p-3 font-medium">Loại</th>
                                                <th className="text-left p-3 font-medium">Tên</th>
                                                <th className="text-center p-3 font-medium">SL</th>
                                                <th className="text-right p-3 font-medium">Đơn giá</th>
                                                <th className="text-right p-3 font-medium">Thành tiền</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {order.items.map((item, i) => (
                                                <tr key={i} className="hover:bg-muted/30">
                                                    <td className="p-3">
                                                        {item.image ? (
                                                            <img src={item.image} alt={item.item_name} className="w-10 h-10 rounded-lg object-cover border" />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                                                {item.item_type === 'product' ? <ShoppingBag className="h-4 w-4 text-muted-foreground" /> :
                                                                    item.item_type === 'service' ? <Wrench className="h-4 w-4 text-muted-foreground" /> :
                                                                        item.item_type === 'package' ? <Gift className="h-4 w-4 text-muted-foreground" /> :
                                                                            <CreditCard className="h-4 w-4 text-muted-foreground" />}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3">
                                                        <Badge className={getItemTypeColor(item.item_type)}>
                                                            {getItemTypeLabel(item.item_type)}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-3 font-medium">{item.item_name}</td>
                                                    <td className="p-3 text-center">{item.quantity}</td>
                                                    <td className="p-3 text-right text-muted-foreground">
                                                        {formatCurrency(item.unit_price)}
                                                    </td>
                                                    <td className="p-3 text-right font-semibold">
                                                        {formatCurrency(item.total_price)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Order Summary */}
                        <div className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/10 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span>Tạm tính:</span>
                                <span className="font-medium">{formatCurrency(order.subtotal)}</span>
                            </div>
                            {order.discount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                    <span className="flex items-center gap-1">
                                        <Gift className="h-3.5 w-3.5" />
                                        Giảm giá:
                                    </span>
                                    <span className="font-medium">-{formatCurrency(order.discount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-bold pt-2 border-t border-primary/20">
                                <span>Tổng thanh toán:</span>
                                <span className="text-primary">{formatCurrency(order.total_amount)}</span>
                            </div>
                            {order.paid_amount !== undefined && order.paid_amount >= 0 && (
                                <div className="flex justify-between text-sm pt-2 border-t">
                                    <span>Đã thanh toán:</span>
                                    <span className={`font-medium ${order.paid_amount >= order.total_amount ? 'text-green-600' : 'text-amber-600'}`}>
                                        {formatCurrency(order.paid_amount)}
                                        {order.paid_amount < order.total_amount && (
                                            <span className="text-xs ml-1 text-muted-foreground">
                                                (còn {formatCurrency(order.total_amount - order.paid_amount)})
                                            </span>
                                        )}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Ngày tạo</p>
                                <p className="font-medium">{formatDateTime(order.created_at)}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Hoàn thành</p>
                                <p className="font-medium">{order.completed_at ? formatDateTime(order.completed_at) : 'Chưa hoàn thành'}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-muted-foreground">Nhân viên phụ trách</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <Avatar className="h-6 w-6">
                                        <AvatarFallback className="text-xs">{order.sales_user?.name?.charAt(0) || 'N'}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{order.sales_user?.name || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        {order.notes && (
                            <div>
                                <p className="text-sm text-muted-foreground mb-1">Ghi chú</p>
                                <p className="text-sm p-3 bg-muted/50 rounded-lg">{order.notes}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 pt-4 border-t">
                        {order.status !== 'after_sale' && order.status !== 'cancelled' && (
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                    if (onEdit) {
                                        onEdit(order);
                                        onClose();
                                    }
                                }}
                            >
                                <Sparkles className="h-4 w-4 mr-2" />
                                Sửa đơn
                            </Button>
                        )}
                        {onPayment && (
                            (() => {
                                const isPaid = order.remaining_debt !== undefined ? order.remaining_debt <= 0 : order.status === 'after_sale' || order.status === 'done';

                                if (isPaid) {
                                    return (
                                        <Button
                                            className="flex-1 bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                            onClick={() => {
                                                onPayment(order);
                                                onClose();
                                            }}
                                        >
                                            <CheckCircle className="h-4 w-4 mr-2" />
                                            Đã thanh toán
                                        </Button>
                                    );
                                }

                                return (
                                    <Button
                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                        onClick={() => {
                                            onPayment(order);
                                            onClose();
                                        }}
                                    >
                                        <CreditCard className="h-4 w-4 mr-2" />
                                        Thanh toán
                                    </Button>
                                );
                            })()
                        )}
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setShowPrintDialog(true)}
                        >
                            <Printer className="h-4 w-4 mr-2" />
                            In phiếu
                        </Button>
                    </div>
                </DialogContent>
            </Dialog >

            {/* Print QR Dialog */}
            < PrintQRDialog
                order={order}
                open={showPrintDialog}
                onClose={() => setShowPrintDialog(false)
                }
            />
        </>
    );
}

