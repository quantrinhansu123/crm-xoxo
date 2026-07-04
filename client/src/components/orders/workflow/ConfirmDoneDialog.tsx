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
    itemIds: string[];
    isV2Service: boolean; // items vs services
    onSuccess: () => void;
}

export function ConfirmDoneDialog({
    open,
    onOpenChange,
    itemIds,
    isV2Service,
    onSuccess,
}: ConfirmDoneDialogProps) {
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!itemIds || itemIds.length === 0) return;
        setLoading(true);
        try {
            // Completing all items in the group
            await Promise.all(itemIds.map(id =>
                orderItemsApi.complete(id, isV2Service ? 'Hoàn thành dịch vụ' : 'Hoàn thành hạng mục')
            ));

            const count = isV2Service ? (itemIds.length > 1 ? itemIds.length - 1 : 1) : itemIds.length;
            const label = isV2Service ? 'dịch vụ' : 'hạng mục';
            toast.success(`Sản phẩm đã hoàn thành ${count} ${label}`);
            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error.message || 'Có lỗi xảy ra khi hoàn thành');
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
