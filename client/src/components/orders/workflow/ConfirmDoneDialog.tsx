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

async function completeOneService(id: string, isV2: boolean, notes: string) {
    if (isV2) {
        try {
            await orderProductsApi.completeService(id, notes);
            return;
        } catch (err: any) {
            // Fallback sang order-items (cùng ID dịch vụ V2)
            if (err?.response?.status !== 404 && err?.response?.status !== 500) throw err;
        }
    }
    await orderItemsApi.complete(id, notes);
}

async function moveProductToAfterSale(productId: string) {
    // Ưu tiên after-sale-data (set after_sale_stage); fallback status delivered
    try {
        await orderProductsApi.updateAfterSaleData(productId, { stage: 'after1' });
        return;
    } catch (err: any) {
        const status = err?.response?.status;
        if (status !== 404 && status !== 400 && status !== 500) throw err;
    }
    await orderProductsApi.updateStatus(productId, 'delivered');
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
        const serviceIds = [...new Set((itemIds || []).filter((id) => id && id !== productId))];
        if (serviceIds.length === 0 && !productId) return;

        setLoading(true);
        try {
            const notes = isV2Service ? 'Hoàn thành dịch vụ' : 'Hoàn thành hạng mục';
            const errors: string[] = [];

            for (const id of serviceIds) {
                try {
                    await completeOneService(id, isV2Service, notes);
                } catch (err: any) {
                    const msg = err?.response?.data?.message || err?.message || `Lỗi hoàn thành ${id}`;
                    errors.push(msg);
                }
            }

            if (productId) {
                try {
                    await moveProductToAfterSale(productId);
                } catch (err: any) {
                    // Nếu đã complete hết dịch vụ thì product có thể đã được server kéo sang after-sale
                    if (serviceIds.length === 0) {
                        throw err;
                    }
                    console.warn('[ConfirmDone] product after-sale update soft-fail:', err);
                }
            }

            if (errors.length > 0 && errors.length === serviceIds.length && !productId) {
                throw new Error(errors[0]);
            }
            if (errors.length > 0 && serviceIds.length > 0 && errors.length === serviceIds.length) {
                // Mọi dịch vụ fail — thử chỉ đưa product sang after-sale
                if (productId) {
                    await moveProductToAfterSale(productId);
                } else {
                    throw new Error(errors[0]);
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
