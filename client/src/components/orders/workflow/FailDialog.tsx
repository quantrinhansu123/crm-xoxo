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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { orderItemsApi } from '@/lib/api';
import { toast } from 'sonner';

interface FailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemId: string;
    onSuccess: () => void;
}

export function FailDialog({
    open,
    onOpenChange,
    itemId,
    onSuccess,
}: FailDialogProps) {
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!reason.trim()) {
            toast.error('Vui lòng nhập lý do thất bại');
            return;
        }

        setLoading(true);
        try {
            await orderItemsApi.fail(itemId, reason.trim());
            toast.success('Đã ghi nhận thất bại thành công');
            onSuccess();
            onOpenChange(false);
            setReason('');
        } catch (error: any) {
            toast.error(error.message || 'Có lỗi xảy ra');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Xác nhận Thất bại / Hủy</DialogTitle>
                    <DialogDescription>
                        Vui lòng nhập lý do thất bại hoặc hủy bỏ hạng mục này. Hành động này không thể hoàn tác.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="fail-reason">Lý do thất bại <span className="text-red-500">*</span></Label>
                        <Textarea
                            id="fail-reason"
                            placeholder="Ví dụ: Khách hàng hủy, không thể sửa chữa..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        Hủy
                    </Button>
                    <Button variant="destructive" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Đang xử lý...' : 'Xác nhận Thất bại'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
