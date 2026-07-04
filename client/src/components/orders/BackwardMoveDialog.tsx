import { useState, useEffect } from 'react';
import { AlertTriangle, ImageIcon, Camera } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUpload } from '@/components/products/ImageUpload';

const REASONS = [
    "Không có shoetree",
    "Không có lót fom",
    "Đưa thiếu phụ kiện của khách",
    "Khác"
];

interface BackwardMoveDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm?: (reason: string, photos: string[], notes?: string) => void;
    currentStep?: string;
    targetStep?: string;
    itemName?: string;
    mode?: 'create' | 'view';
    initialData?: {
        reason: string;
        photos: string[];
        notes?: string;
        created_at?: string;
        created_by_name?: string;
    };
}

export function BackwardMoveDialog({
    open,
    onClose,
    onConfirm,
    currentStep,
    targetStep,
    itemName,
    mode = 'create',
    initialData
}: BackwardMoveDialogProps) {
    const [reason, setReason] = useState<string>('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [notes, setNotes] = useState<string>('');

    useEffect(() => {
        if (open) {
            if (mode === 'view' && initialData) {
                setReason(initialData.reason || '');
                setPhotos(initialData.photos || []);
                setNotes(initialData.notes || '');
            } else {
                setReason('');
                setPhotos([]);
                setNotes('');
            }
        }
    }, [open, mode, initialData]);

    const handleConfirm = () => {
        if (!reason || photos.length === 0) return;
        onConfirm?.(reason, photos, notes);
        onClose();
    };

    const handleAddPhoto = (url: string | null) => {
        if (url) {
            setPhotos(prev => [...prev, url]);
        }
    };

    const handleRemovePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const canConfirm = reason && photos.length > 0;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        {mode === 'create' ? (
                            <>
                                <AlertTriangle className="h-5 w-5" />
                                Xác nhận lùi bước
                            </>
                        ) : (
                            <>
                                <ImageIcon className="h-5 w-5 text-primary" />
                                Chi tiết lùi bước
                            </>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'create' ? (
                            <>
                                Bạn đang chuyển sản phẩm <span className="font-semibold text-foreground">{itemName}</span> ngược về bước trước đó.
                                <br />
                                <span className="text-xs text-destructive font-bold">Lưu ý: Lý do và Ảnh minh chứng là bắt buộc.</span>
                            </>
                        ) : (
                            <>
                                Thông tin chi tiết về việc lùi bước sản phẩm <span className="font-semibold text-foreground">{itemName}</span>.
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reason">Lý do lùi bước <span className="text-destructive">*</span></Label>
                        {mode === 'create' ? (
                            <Select value={reason} onValueChange={setReason}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Chọn lý do..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {REASONS.map((r) => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <div className="p-3 bg-muted rounded-md text-sm italic">
                                "{reason || 'Không có lý do'}"
                            </div>
                        )}
                    </div>

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
                                    {mode === 'create' && (
                                        <button
                                            onClick={() => handleRemovePhoto(index)}
                                            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <AlertTriangle className="h-3 w-3 rotate-45" />
                                        </button>
                                    )}
                                </div>
                            ))}
                            {mode === 'create' && photos.length < 5 && (
                                <ImageUpload
                                    value={null}
                                    onChange={handleAddPhoto}
                                    className="w-20 h-20"
                                    hideInfo
                                    placeholderIcon={<Camera className="h-5 w-5" />}
                                />
                            )}
                            {mode === 'view' && photos.length === 0 && (
                                <span className="text-sm text-muted-foreground italic">Không có ảnh minh chứng</span>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="notes">Ghi chú (Note)</Label>
                        {mode === 'create' ? (
                            <textarea
                                id="notes"
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Nhập thêm ghi chú nếu có..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        ) : (
                            notes && (
                                <div className="p-3 bg-muted rounded-md text-sm">
                                    {notes}
                                </div>
                            )
                        )}
                    </div>

                    {mode === 'view' && initialData?.created_at && (
                        <div className="text-xs text-muted-foreground mt-2 text-right">
                            Ghi nhận bởi <span className="font-medium">{initialData.created_by_name || 'Hệ thống'}</span> lúc {new Date(initialData.created_at).toLocaleString('vi-VN')}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {mode === 'create' ? 'Hủy' : 'Đóng'}
                    </Button>
                    {mode === 'create' && (
                        <Button 
                            variant="destructive" 
                            onClick={handleConfirm}
                            disabled={!canConfirm}
                        >
                            Xác nhận chuyển
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
