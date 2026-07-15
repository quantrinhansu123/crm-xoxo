import { CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ForwardMoveDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (notes: string, photos: string[]) => void;
    currentStepLabel?: string;
    targetStepLabel?: string;
    itemName?: string;
}

export function ForwardMoveDialog({
    open,
    onClose,
    onConfirm,
    currentStepLabel,
    targetStepLabel,
    itemName,
}: ForwardMoveDialogProps) {
    const handleConfirm = () => {
        onConfirm('', []);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary">
                        <CheckCircle2 className="h-5 w-5" />
                        Xác nhận chuyển bước
                    </DialogTitle>
                    <DialogDescription>
                        Bạn đang chuyển <span className="font-semibold text-foreground">{itemName}</span>
                        {currentStepLabel && targetStepLabel ? (
                            <>
                                {' '}từ <span className="font-semibold text-foreground">{currentStepLabel}</span>
                                {' '}sang <span className="font-semibold text-foreground">{targetStepLabel}</span>
                            </>
                        ) : null}.
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Hủy</Button>
                    <Button onClick={handleConfirm}>
                        Xác nhận chuyển
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
