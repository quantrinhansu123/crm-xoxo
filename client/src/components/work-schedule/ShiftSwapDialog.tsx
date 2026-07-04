import { useState, useEffect } from 'react';
import { X, CalendarDays, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { type User } from '@/types';
import { type Shift } from '@/hooks/useWorkSchedules';
import { type DialogData, toDateStr } from './types';

export function ShiftSwapDialog({
    open,
    onClose,
    data,
    users,
    shifts,
    onSwapComplete,
}: {
    open: boolean;
    onClose: () => void;
    data: DialogData | null;
    users: User[];
    shifts: Shift[];
    onSwapComplete: () => void;
}) {
    const [targetDate, setTargetDate] = useState('');
    const [targetUserId, setTargetUserId] = useState('');
    const [targetShiftId, setTargetShiftId] = useState('');
    const [saving, setSaving] = useState(false);
    const [busyUserIds, setBusyUserIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (data && open) {
            setTargetDate(toDateStr(data.date));
            setTargetUserId('');
            setTargetShiftId('');
            setBusyUserIds(new Set());
        }
    }, [data, open]);

    // Fetch schedules for the target date to find busy employees
    useEffect(() => {
        if (!targetDate || !open) return;
        (async () => {
            try {
                const res = await api.get('/work-schedules', {
                    params: { start_date: targetDate, end_date: targetDate }
                });
                const schedules = res?.data?.data?.schedules ?? res?.data?.schedules ?? [];
                const ids = new Set<string>(
                    (Array.isArray(schedules) ? schedules : [])
                        .map((s: any) => s.user_id)
                        .filter((id: string) => id !== data?.userId)
                );
                setBusyUserIds(ids);
            } catch {
                setBusyUserIds(new Set());
            }
        })();
    }, [targetDate, open]);

    // Reset target user if they become busy after date change
    useEffect(() => {
        if (targetUserId && busyUserIds.has(targetUserId)) {
            setTargetUserId('');
        }
    }, [busyUserIds]);

    if (!data) return null;

    const availableUsers = users.filter(u => u.id !== data.userId && !busyUserIds.has(u.id));
    const sourceDate = toDateStr(data.date);
    const sourceDateFormatted = `${String(data.date.getDate()).padStart(2, '0')}/${String(data.date.getMonth() + 1).padStart(2, '0')}/${data.date.getFullYear()}`;

    const handleSwap = async () => {
        if (!targetUserId || !targetDate) {
            toast.error('Vui lòng chọn nhân viên để đổi ca');
            return;
        }
        setSaving(true);
        try {
            await api.post('/work-schedules/swap', {
                source_user_id: data.userId,
                source_shift_id: data.shiftId,
                source_date: sourceDate,
                target_user_id: targetUserId,
                target_shift_id: targetShiftId || data.shiftId,
                target_date: targetDate,
            });
            toast.success('Đã đổi ca thành công!');
            onSwapComplete();
            onClose();
        } catch {
            toast.error('Lỗi khi đổi ca');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-[600px] p-0 gap-0 overflow-hidden [&>button]:hidden">
                {/* Header */}
                <div className="px-6 pt-5 pb-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[17px] font-bold text-gray-900">Đổi ca làm việc</h2>
                        <button onClick={onClose} className="h-7 w-7 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                            <X className="h-4 w-4 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* Body — two columns */}
                <div className="px-6 pb-5">
                    <div className="grid grid-cols-2 gap-8">
                        {/* Left — Source Employee */}
                        <div className="space-y-4">
                            <h3 className="text-[13px] font-bold text-gray-800">Nhân viên</h3>

                            <div className="flex items-center gap-3">
                                <span className="text-[13px] text-gray-500 w-[75px] flex-shrink-0">Ngày làm việc</span>
                                <div className="flex items-center gap-1.5 flex-1">
                                    <Input
                                        type="text"
                                        value={sourceDateFormatted}
                                        readOnly
                                        className="h-[34px] flex-1 text-[13px] border-gray-200 bg-gray-50 rounded-lg cursor-not-allowed"
                                    />
                                    <CalendarDays className="h-4 w-4 text-gray-400" />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-[13px] text-gray-500 w-[75px] flex-shrink-0">Nhân viên</span>
                                <Select value={data.userId} disabled>
                                    <SelectTrigger className="h-[34px] flex-1 text-[13px] border-gray-200 bg-gray-50 rounded-lg">
                                        <SelectValue>{data.employeeName}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={data.userId}>{data.employeeName}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-[13px] text-gray-500 w-[75px] flex-shrink-0">Ca</span>
                                <Select value={data.shiftId} disabled>
                                    <SelectTrigger className="h-[34px] flex-1 text-[13px] border-gray-200 bg-gray-50 rounded-lg">
                                        <SelectValue>{data.shiftName}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={data.shiftId}>{data.shiftName}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Right — Target Employee */}
                        <div className="space-y-4">
                            <h3 className="text-[13px] font-bold text-gray-800">Đổi cho nhân viên</h3>

                            <div className="flex items-center gap-3">
                                <span className="text-[13px] text-gray-500 w-[75px] flex-shrink-0">Ngày làm việc</span>
                                <div className="flex items-center gap-1.5 flex-1">
                                    <Input
                                        type="date"
                                        value={targetDate}
                                        onChange={e => setTargetDate(e.target.value)}
                                        className="h-[34px] flex-1 text-[13px] border-gray-200 rounded-lg"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-[13px] text-gray-500 w-[75px] flex-shrink-0">Nhân viên</span>
                                <Select value={targetUserId} onValueChange={setTargetUserId}>
                                    <SelectTrigger className="h-[34px] flex-1 text-[13px] border-gray-200 rounded-lg">
                                        <SelectValue placeholder="Chọn nhân v..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableUsers.map(u => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-[13px] text-gray-500 w-[75px] flex-shrink-0">Ca</span>
                                <Select value={targetShiftId || data.shiftId} onValueChange={setTargetShiftId}>
                                    <SelectTrigger className="h-[34px] flex-1 text-[13px] border-gray-200 rounded-lg">
                                        <SelectValue placeholder="Chọn ca làm..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {shifts.map(s => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-gray-100 bg-gray-50/50">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={saving}
                        className="h-[36px] px-5 text-[13px] border-gray-200"
                    >
                        Bỏ qua
                    </Button>
                    <Button
                        onClick={handleSwap}
                        disabled={saving || !targetUserId}
                        className="h-[36px] px-6 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Lưu
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
