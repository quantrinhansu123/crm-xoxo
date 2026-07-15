import { useState, useEffect } from 'react';
import { CheckCircle2, Camera } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ImageUpload } from '@/components/products/ImageUpload';

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
    const [notes, setNotes] = useState<string>('');
    const [photos, setPhotos] = useState<string[]>([]);

    useEffect(() => {
        if (open) {
            setNotes('');
            setPhotos([]);
        }
    }, [open]);

    const handleAddPhoto = (url: string | null) => {
        if (url) {
            setPhotos(prev => [...prev, url]);
        }
    };

    const handleRemovePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const canConfirm = notes.trim().length > 0 && photos.length > 0;

    const handleConfirm = () => {
        if (!canConfirm) return;
        onConfirm(notes.trim(), photos);
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
                        <br />
                        <span className="text-xs text-destructive font-bold">Lưu ý: Ghi chú và Ảnh minh chứng là bắt buộc.</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label>Ảnh / Video minh chứng <span className="text-destructive">*</span></Label>
                        <div className="flex flex-wrap gap-2">
                            {photos.map((url, index) => (
                                <div key={index} className="relative group">
                                    <img
                                        src={url}
                                        alt={`Proof ${index + 1}`}
                                        className="w-20 h-20 object-cover rounded-md border"
                                    />
                                    <button
                                        onClick={() => handleRemovePhoto(index)}
                                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            {photos.length < 5 && (
                                <ImageUpload
                                    value={null}
                                    onChange={handleAddPhoto}
                                    className="w-20 h-20"
                                    hideInfo
                                    placeholderIcon={<Camera className="h-5 w-5" />}
                                />
                            )}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="forward-move-notes">Ghi chú <span className="text-destructive">*</span></Label>
                        <textarea
                            id="forward-move-notes"
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Nhập ghi chú cho lần chuyển bước này..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Hủy</Button>
                    <Button onClick={handleConfirm} disabled={!canConfirm}>
                        Xác nhận chuyển
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
