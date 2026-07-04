import { ArrowLeft, Printer, Edit, CreditCard, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Order } from '@/hooks/useOrders';
import { getStatusVariant } from '../utils';
import { getSalesStatusLabel } from '../constants';

interface OrderHeaderProps {
    order: Order;
    onPrint: () => void;
    onEdit: () => void;
    onPayment: () => void;
    onApprove: () => void;
    approving: boolean;
    canApprove: boolean;
}

export function OrderHeader({
    order,
    onPrint,
    onEdit,
    onPayment,
    onApprove,
    approving,
    canApprove,
}: OrderHeaderProps) {
    const navigate = useNavigate();

    return (
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/orders')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        Đơn hàng #{order.order_code}
                        <Badge variant={getStatusVariant(order.status)}>
                            {getSalesStatusLabel(order.status)}
                        </Badge>
                    </h1>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onPrint}>
                    <Printer className="h-4 w-4 mr-2" />
                    In QR
                </Button>
                {order.status !== 'done' && order.status !== 'cancelled' && (
                    <Button variant="outline" size="sm" onClick={onEdit}>
                        <Edit className="h-4 w-4 mr-2" />
                        Sửa
                    </Button>
                )}
                <Button variant="outline" size="sm" onClick={onPayment}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Thanh toán
                </Button>
                {canApprove && (
                    <Button
                        variant="default"
                        size="sm"
                        onClick={onApprove}
                        disabled={approving}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Phê duyệt
                    </Button>
                )}
            </div>
        </div>
    );
}
