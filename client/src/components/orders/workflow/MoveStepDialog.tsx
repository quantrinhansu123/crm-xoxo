import { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { orderItemsApi } from '@/lib/api';
import { toast } from 'sonner';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ImageUpload } from '@/components/products/ImageUpload';
import { useAuth } from '@/contexts/AuthContext';
import { Camera, Plus, X } from 'lucide-react';

interface MoveStepDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemId: string;
    targetRoomId: string;
    targetRoomName: string;
    technicians?: any[]; // Pass technicians from parent
    initialTechnicianId?: string; // Add this to support pre-selection
    onSuccess: () => void;
}

export function MoveStepDialog({
    open,
    onOpenChange,
    itemId,
    targetRoomId,
    targetRoomName,
    technicians = [],
    initialTechnicianId,
    onSuccess,
}: MoveStepDialogProps) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin' || user?.role === 'manager';

    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [deadline, setDeadline] = useState<number>(3); // Default 3 days
    const [assignedTechId, setAssignedTechId] = useState<string>('none');
    const [photos, setPhotos] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // Re-initialize assignedTechId when dialog opens or initialTechnicianId changes
    useEffect(() => {
        if (open) {
            setAssignedTechId(initialTechnicianId || 'none');
        }
    }, [open, initialTechnicianId]);

    const handleSubmit = async () => {
        if (!reason.trim()) {
            toast.error('Vui lòng nhập lý do/mục đích');
            return;
        }
        if (deadline <= 0) {
            toast.error('Hạn hoàn thành phải lớn hơn 0');
            return;
        }

        setLoading(true);
        try {
            await orderItemsApi.changeRoom(itemId, {
                targetRoomId,
                reason: reason.trim(),
                deadline_days: deadline,
                technician_id: assignedTechId === 'none' ? null : assignedTechId,
                note: note.trim(),
                photos: photos
            });
            toast.success('Đã chuyển quy trình thành công');
            onSuccess();
            onOpenChange(false);
            resetForm();
        } catch (error: any) {
            toast.error(error.response?.data?.message || error.message || 'Có lỗi xảy ra khi chuyển quy trình');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setReason('');
        setNote('');
        setDeadline(3);
        setAssignedTechId('none');
        setPhotos([]);
    };

    const addPhoto = (url: string | null) => {
        if (url) {
            setPhotos(prev => [...prev, url]);
        }
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            onOpenChange(val);
            if (!val) resetForm();
        }}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Chuyển sang {targetRoomName}</DialogTitle>
                    <DialogDescription>
                        Vui lòng nhập lý do/mục đích và hạn hoàn thành cho bước này.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reason">Lý do / Mục đích <span className="text-red-500">*</span></Label>
                        <Textarea
                            id="reason"
                            placeholder="Ví dụ: Cần mạ lại, chuyển sang dán đế..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="deadline">Hạn hoàn thành (ngày) <span className="text-red-500">*</span></Label>
                        <Input
                            id="deadline"
                            type="number"
                            min="1"
                            value={deadline}
                            onChange={(e) => setDeadline(Number(e.target.value))}
                            disabled={!isAdmin}
                        />
                        {!isAdmin && <p className="text-[10px] text-muted-foreground italic">Admin mới có quyền sửa hạn hoàn thành</p>}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="assign-tech">Giao lại cho ai</Label>
                        <Select value={assignedTechId} onValueChange={setAssignedTechId}>
                            <SelectTrigger id="assign-tech">
                                <SelectValue placeholder="Chọn kỹ thuật viên" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Chưa phân công</SelectItem>
                                {technicians.map((tech) => (
                                    <SelectItem key={tech.id} value={tech.id}>
                                        {tech.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="note">Ghi chú (Note)</Label>
                        <Textarea
                            id="note"
                            placeholder="Lưu ý những gì thì ghi ở đây..."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>Ảnh bằng chứng / Hiện trạng</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {photos.map((photo, idx) => (
                                <div key={idx} className="relative w-20 h-20 group">
                                    <img src={photo} alt={`Evidence ${idx}`} className="w-full h-full object-cover rounded-md border" />
                                    <button
                                        onClick={() => removePhoto(idx)}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                            {photos.length < 5 && (
                                <ImageUpload
                                    value={null}
                                    onChange={addPhoto}
                                    bucket="orders"
                                    folder="workflow-evidence"
                                    className="w-20 h-20"
                                    hideInfo
                                    placeholderIcon={<Camera className="h-5 w-5 text-muted-foreground" />}
                                />
                            )}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        Hủy
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Đang xử lý...' : 'Xác nhận chuyển'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
