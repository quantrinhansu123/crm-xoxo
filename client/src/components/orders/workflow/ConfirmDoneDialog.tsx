import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { orderItemsApi, orderProductsApi } from '@/lib/api';
import { toast } from 'sonner';

interface ConfirmDoneDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** ID dịch vụ / hạng mục cần complete (order_items hoặc order_product_services) */
    itemIds: string[];
    /** ID sản phẩm V2 (order_products) — không gọi /order-items/:id/complete */
    productId?: string | null;
    isV2Service: boolean;
    onSuccess: () => void;
}

export function ConfirmDoneDialog({
    open,
    onOpenChange,
    itemIds,
    productId,
    isV2Service,
    onSuccess,
}: ConfirmDoneDialogProps) {
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        const serviceIds = (itemIds || []).filter((id) => id && id !== productId);
        if (serviceIds.length === 0 && !productId) return;

        setLoading(true);
        try {
            // Chỉ complete dịch vụ/hạng mục — product head V2 không tồn tại trên /order-items/:id/complete
            for (const id of serviceIds) {
                await orderItemsApi.complete(
                    id,
                    isV2Service ? 'Hoàn thành dịch vụ' : 'Hoàn thành hạng mục'
                );
            }

            // Đưa sản phẩm V2 vào after-sale (kanban After sale đọc stage trên product head)
            if (productId) {
                try {
                    await orderProductsApi.updateAfterSaleData(productId, {
                        stage: 'after1',
                    });
                } catch (productErr: any) {
                    // Fallback: đánh dấu delivered/completed nếu after-sale-data lỗi
                    const status = productErr?.response?.status;
                    if (status === 404 || status === 400) {
                        await orderProductsApi.updateStatus(productId, 'delivered');
                    } else {
                        throw productErr;
                    }
                }
            }

            const count = serviceIds.length || 1;
            const label = isV2Service ? 'dịch vụ' : 'hạng mục';
            toast.success(`Sản phẩm đã hoàn thành ${count} ${label}`);
            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            const msg =
                error?.response?.data?.message ||
                error?.message ||
                'Có lỗi xảy ra khi hoàn thành';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Xác nhận Hoàn thành</DialogTitle>
                    <DialogDescription>
                        Bạn có chắc chắn muốn đánh dấu hạng mục này là "Hoàn thành" (Done)?
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        Hủy
                    </Button>
                    <Button className="bg-green-600 hover:bg-green-700" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Đang xử lý...' : 'Xác nhận Hoàn thành'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
