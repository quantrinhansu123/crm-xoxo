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
import { Loader2 } from 'lucide-react';

interface CancelInvoiceDialogProps {
    open: boolean;
    invoiceCode: string;
    hasPayments?: boolean;
    onClose: () => void;
    onConfirm: (cancelRelatedPayments: boolean) => Promise<void>;
}

export function CancelInvoiceDialog({
    open,
    invoiceCode,
    hasPayments = false,
    onClose,
    onConfirm,
}: CancelInvoiceDialogProps) {
    const [submitting, setSubmitting] = useState(false);

    const handleConfirm = async () => {
        setSubmitting(true);
        try {
            await onConfirm(true);
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Hủy hóa đơn</DialogTitle>
                    <DialogDescription>
                        Bạn có chắc chắn muốn hủy hóa đơn <strong>{invoiceCode}</strong>?
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs leading-snug text-amber-900">
                    {hasPayments
                        ? 'Các phiếu thu liên quan đến đơn hàng này sẽ được hủy tự động. Công nợ khách được tính lại theo phiếu thu và HĐ còn hiệu lực.'
                        : 'Hóa đơn hủy sẽ không còn tính vào doanh thu. Nếu có phiếu thu liên quan, hệ thống cũng sẽ hủy chúng.'}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>
                        Bỏ qua
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={submitting}
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Đồng ý'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
