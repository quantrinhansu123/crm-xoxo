import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Lead } from '@/hooks/useLeads';

interface LeadFailDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Lead>) => Promise<void>;
    lead: Lead | null;
}

const FAIL_REASONS = [
    { id: 'tai_chinh', label: '1. KHÁCH KO ĐỦ TÀI CHÍNH' },
    { id: 'lam_phien', label: '2. KHÁCH KÊU LÀM PHIỀN' },
    { id: 'cham_du_vong', label: '3. ĐÃ CHĂM ĐỦ VÒNG KHÁCH KO CHỐT' },
    { id: 'khac', label: '4. LÝ DO KHÁC' },
];

export function LeadFailDialog({ open, onClose, onSubmit, lead }: LeadFailDialogProps) {
    const [reasonId, setReasonId] = useState<string>('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setReasonId('');
            setNote('');
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!lead || !reasonId) return;
        
        setIsSubmitting(true);
        try {
            const selectedReason = FAIL_REASONS.find(r => r.id === reasonId);
            const fullReason = selectedReason?.id === 'khac' 
                ? `Lý do khác: ${note}` 
                : selectedReason?.label || '';

            const data: Partial<Lead> = {
                pipeline_stage: 'fail',
                status: 'fail',
                loss_risk: fullReason, // Use loss_risk or notes to store failure reason
                notes: note ? `${fullReason}\nNote: ${note}` : fullReason
            };

            await onSubmit(data);
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-red-600 flex items-center gap-2">
                        Lý do chuyển trạng thái Fail
                    </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label>Chọn lý do</Label>
                        <Select value={reasonId} onValueChange={setReasonId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Chọn lý do khách rời" />
                            </SelectTrigger>
                            <SelectContent>
                                {FAIL_REASONS.map(reason => (
                                    <SelectItem key={reason.id} value={reason.id}>
                                        {reason.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {(reasonId === 'khac' || reasonId !== '') && (
                        <div className="grid gap-2 animate-in fade-in slide-in-from-top-1">
                            <Label htmlFor="failNote">
                                {reasonId === 'khac' ? 'Ghi rõ lý do khác' : 'Ghi chú thêm (tùy chọn)'}
                            </Label>
                            <Textarea
                                id="failNote"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Nhập nội dung ghi chú..."
                                className="min-h-[100px]"
                            />
                        </div>
                    )}
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting || !reasonId || (reasonId === 'khac' && !note.trim())}
                        variant="destructive"
                    >
                        {isSubmitting ? 'Đang lưu...' : 'Xác nhận Fail'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
