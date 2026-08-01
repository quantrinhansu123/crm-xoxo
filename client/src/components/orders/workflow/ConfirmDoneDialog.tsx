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
    /** ID dịch vụ / hạng mục (order_items hoặc order_product_services) */
    itemIds: string[];
    /** ID sản phẩm V2 (order_products) */
    productId?: string | null;
    isV2Service: boolean;
    onSuccess: () => void;
}

function errMsg(err: any, fallback: string) {
    return err?.response?.data?.message || err?.message || fallback;
}

/** Hoàn thành 1 dịch vụ — thử nhiều API để tránh 404 trên môi trường lệch version */
async function completeOneService(id: string, isV2: boolean, notes: string) {
    const attempts: Array<() => Promise<unknown>> = [];

    if (isV2) {
        attempts.push(() => orderProductsApi.completeService(id, notes));
    }
    attempts.push(() => orderItemsApi.complete(id, notes));
    // updateStatus luôn có trên server cũ/mới và hỗ trợ V1 + V2 service + V2 product
    attempts.push(() => orderItemsApi.updateStatus(id, 'completed', notes));

    let lastErr: any;
    for (const run of attempts) {
        try {
            await run();
            return;
        } catch (err: any) {
            lastErr = err;
            const status = err?.response?.status;
            // Thử API kế tiếp khi 404/400/500; lỗi khác (401/403) dừng ngay
            if (status && ![400, 404, 500].includes(status)) throw err;
        }
    }
    throw lastErr || new Error('Không thể hoàn thành hạng mục');
}

/** Đưa product head vào After sale (after1) */
async function moveProductToAfterSale(productId: string) {
    const attempts: Array<() => Promise<unknown>> = [
        // delivered: set current_phase/after_sale_stage, không bị chặn nhảy bước after4→after1
        () => orderProductsApi.updateStatus(productId, 'delivered'),
        () => orderProductsApi.updateAfterSaleData(productId, { stage: 'after1', allow_step_back: true } as any),
        () => orderItemsApi.updateStatus(productId, 'delivered'),
        () => orderItemsApi.complete(productId, 'Hoàn thành sản phẩm'),
    ];

    let lastErr: any;
    for (const run of attempts) {
        try {
            await run();
            return;
        } catch (err: any) {
            lastErr = err;
            const status = err?.response?.status;
            if (status && ![400, 404, 500].includes(status)) throw err;
        }
    }
    throw lastErr || new Error('Không thể chuyển sản phẩm sang After sale');
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
                    errors.push(errMsg(err, `Lỗi hoàn thành ${id}`));
                }
            }

            if (productId) {
                try {
                    await moveProductToAfterSale(productId);
                } catch (err: any) {
                    // Nếu mọi dịch vụ đã complete, server có thể đã kéo product — chỉ fail cứng khi không có service nào thành công
                    if (serviceIds.length === 0 || errors.length === serviceIds.length) {
                        throw err;
                    }
                    console.warn('[ConfirmDone] product after-sale soft-fail:', err);
                }
            } else if (errors.length === serviceIds.length && serviceIds.length > 0) {
                throw new Error(errors[0]);
            }

            const okCount = Math.max(1, serviceIds.length - errors.length);
            const label = isV2Service ? 'dịch vụ' : 'hạng mục';
            toast.success(`Sản phẩm đã hoàn thành ${okCount} ${label}`);
            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            toast.error(errMsg(error, 'Có lỗi xảy ra khi hoàn thành'));
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
