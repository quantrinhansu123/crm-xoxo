import { useState, useEffect } from 'react';
import { Plus, Loader2, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { type Shift } from '@/hooks/useWorkSchedules';
import { toast } from 'sonner';

const SHIFT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
    cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
};

function getShiftColor(colorKey: string) {
    return SHIFT_COLORS[colorKey] || SHIFT_COLORS.blue;
}

function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatVNDate(d: Date): string {
    const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return `${dayNames[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function AddScheduleDialog({
    open, onClose, selectedUser, selectedDate, shifts, allUsers, initialSelectedShiftIds, initialRepeatWeekly, initialWorkOnHolidays, initialRepeatDays, initialEndDate, onSave, onDelete, onCreateShift,
}: {
    open: boolean;
    onClose: () => void;
    selectedUser: { id: string; name: string } | null;
    selectedDate: Date | null;
    shifts: Shift[];
    allUsers: { id: string; name: string }[];
    initialSelectedShiftIds?: string[];
    initialRepeatWeekly?: boolean;
    initialWorkOnHolidays?: boolean;
    initialRepeatDays?: number[];
    initialEndDate?: string;
    onSave: (data: { user_id: string; shift_ids: string[]; schedule_date: string; repeat_weekly: boolean; repeat_days: number[]; end_date?: string; work_on_holidays: boolean; apply_to_users: string[] }) => Promise<void>;
    onDelete: (type: 'single' | 'future' | 'all') => Promise<void>;
    onCreateShift: (data: { name: string; start_time: string; end_time: string; color: string }) => Promise<void>;
}) {
    const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
    const [repeatWeekly, setRepeatWeekly] = useState(false);
    const [repeatDays, setRepeatDays] = useState<number[]>([]);
    const [endDate, setEndDate] = useState<string>('');
    const [workOnHolidays, setWorkOnHolidays] = useState(false);
    const [applyToOthers, setApplyToOthers] = useState(false);
    const [selectedOtherUsers, setSelectedOtherUsers] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [showNewShift, setShowNewShift] = useState(false);
    const [newShiftName, setNewShiftName] = useState('');
    const [newShiftStart, setNewShiftStart] = useState('09:00');
    const [newShiftEnd, setNewShiftEnd] = useState('21:00');

    useEffect(() => {
        if (open && selectedDate) {
            setSelectedShiftIds(initialSelectedShiftIds || []);
            setRepeatWeekly(initialRepeatWeekly || false);
            setRepeatDays(initialRepeatDays && initialRepeatDays.length > 0 ? initialRepeatDays : [selectedDate.getDay()]);
            setEndDate(initialEndDate || '');
            setWorkOnHolidays(initialWorkOnHolidays || false);
            setApplyToOthers(false);
            setSelectedOtherUsers([]);
            setShowNewShift(false);
            setNewShiftName('');
        }
    }, [open, selectedDate, initialSelectedShiftIds, initialRepeatWeekly, initialWorkOnHolidays, initialRepeatDays, initialEndDate]);

    const toggleShift = (shiftId: string) => {
        setSelectedShiftIds(prev =>
            prev.includes(shiftId) ? prev.filter(id => id !== shiftId) : [...prev, shiftId]
        );
    };

    const toggleOtherUser = (userId: string) => {
        setSelectedOtherUsers(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const toggleRepeatDay = (day: number) => {
        setRepeatDays(prev =>
            prev.includes(day) ? (prev.length > 1 ? prev.filter(d => d !== day) : prev) : [...prev, day].sort()
        );
    };

    const selectAllDays = () => {
        setRepeatDays([1, 2, 3, 4, 5, 6, 0]);
    };

    const handleSave = async () => {
        if (!selectedUser || !selectedDate || selectedShiftIds.length === 0) {
            toast.error('Vui lòng chọn ít nhất một ca làm việc');
            return;
        }
        setSaving(true);
        try {
            await onSave({
                user_id: selectedUser.id,
                shift_ids: selectedShiftIds,
                schedule_date: toDateStr(selectedDate),
                repeat_weekly: repeatWeekly,
                repeat_days: repeatWeekly ? repeatDays : [],
                end_date: repeatWeekly && endDate ? endDate : undefined,
                work_on_holidays: workOnHolidays,
                apply_to_users: applyToOthers ? selectedOtherUsers : [],
            });
            toast.success('Đã lưu lịch làm việc!');
            onClose();
        } catch (error: any) {
            toast.error(error?.message || 'Lỗi khi lưu lịch làm việc');
        } finally {
            setSaving(false);
        }
    };

    const handleCreateShift = async () => {
        if (!newShiftName.trim()) { toast.error('Vui lòng nhập tên ca'); return; }
        try {
            await onCreateShift({ name: newShiftName.trim().toUpperCase(), start_time: newShiftStart, end_time: newShiftEnd, color: 'blue' });
            toast.success('Đã tạo ca mới!');
            setShowNewShift(false);
            setNewShiftName('');
        } catch { toast.error('Lỗi khi tạo ca'); }
    };

    if (!selectedUser || !selectedDate) return null;
    const otherUsers = allUsers.filter(u => u.id !== selectedUser.id);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl p-0">
                <div className="px-6 pt-6 pb-4">
                    <DialogHeader>
                        <DialogTitle className="text-[17px] font-bold text-gray-900">
                            {initialSelectedShiftIds && initialSelectedShiftIds.length > 0 ? 'Cập nhật lịch làm việc' : 'Thêm lịch làm việc'}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-[13px] text-gray-500 mt-1">
                        {selectedUser.name}<span className="mx-2 text-gray-300">|</span>{formatVNDate(selectedDate)}
                    </p>
                </div>

                <div className="px-6 pb-6 space-y-5">
                    {/* Shift selection */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-[13px] font-bold text-gray-700">Chọn ca làm việc</span>
                            {(!initialSelectedShiftIds || initialSelectedShiftIds.length === 0) && (
                                <button onClick={() => setShowNewShift(true)} className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors">
                                    <Plus className="h-3 w-3" />
                                </button>
                            )}
                        </div>

                        {showNewShift && (
                            <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                                <Input placeholder="Tên ca (VD: CA TỐI)" className="h-[34px] text-[13px]" value={newShiftName} onChange={e => setNewShiftName(e.target.value)} />
                                <div className="flex gap-2">
                                    <Input type="time" className="h-[34px] text-[13px] flex-1" value={newShiftStart} onChange={e => setNewShiftStart(e.target.value)} />
                                    <span className="self-center text-gray-400 text-[13px]">-</span>
                                    <Input type="time" className="h-[34px] text-[13px] flex-1" value={newShiftEnd} onChange={e => setNewShiftEnd(e.target.value)} />
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <Button variant="ghost" size="sm" onClick={() => setShowNewShift(false)} className="text-[12px] h-7">Hủy</Button>
                                    <Button size="sm" onClick={handleCreateShift} className="text-[12px] h-7">Tạo ca</Button>
                                </div>
                            </div>
                        )}

                        <div className={cn("border rounded-lg p-4", (initialSelectedShiftIds && initialSelectedShiftIds.length > 0) ? "border-none bg-gray-50/50 p-3" : "border-gray-200")}>
                            {initialSelectedShiftIds && initialSelectedShiftIds.length > 0 ? (
                                <div className="flex flex-col gap-3">
                                    {shifts.filter(s => selectedShiftIds.includes(s.id)).map(shift => {
                                        return (
                                            <div key={shift.id} className="flex flex-col gap-0.5">
                                                <p className="text-[13px] font-medium text-gray-800 uppercase">{shift.name}</p>
                                                <p className="text-[12px] text-gray-500">{shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    {shifts.map(shift => {
                                        const checked = selectedShiftIds.includes(shift.id);
                                        const colors = getShiftColor(shift.color);
                                        return (
                                            <label key={shift.id} className="flex items-start gap-3 cursor-pointer group" onClick={() => toggleShift(shift.id)}>
                                                <div className={cn("mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors", checked ? "bg-blue-600 border-blue-600" : "border-gray-300 group-hover:border-gray-400")}>
                                                    {checked && (<svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>)}
                                                </div>
                                                <div>
                                                    <p className={cn("text-[13px] font-bold", colors.text)}>{shift.name}</p>
                                                    <p className="text-[11px] text-gray-400">{shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)}</p>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Repeat weekly */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[13px] font-bold text-gray-700">Lặp lại hàng tuần</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">Lịch làm việc sẽ được tự động lặp lại vào các ngày trong tuần</p>
                            </div>
                            <Switch checked={repeatWeekly} onCheckedChange={setRepeatWeekly} />
                        </div>

                        {repeatWeekly && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex flex-wrap gap-2 items-center">
                                    {[1, 2, 3, 4, 5, 6, 0].map(day => {
                                        const labels = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                                        const isSelected = repeatDays.includes(day);
                                        return (
                                            <button
                                                key={day}
                                                onClick={() => toggleRepeatDay(day)}
                                                className={cn(
                                                    "h-8 px-3 rounded-md text-[12px] font-medium border transition-all",
                                                    isSelected
                                                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                                                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                                                )}
                                            >
                                                {labels[day]}
                                            </button>
                                        );
                                    })}
                                    <button
                                        onClick={selectAllDays}
                                        className="text-[12px] text-blue-600 font-medium hover:underline ml-1"
                                    >
                                        Chọn tất cả
                                    </button>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="flex-1 space-y-1.5">
                                        <Label className="text-[12px] text-gray-500">Kết thúc</Label>
                                        <div className="relative">
                                            <Input
                                                type="date"
                                                className="h-[36px] text-[13px] border-gray-200"
                                                value={endDate}
                                                onChange={e => setEndDate(e.target.value)}
                                                placeholder="Chưa xác định"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 pt-5">
                                        <label className="flex items-center gap-2 cursor-pointer group" onClick={() => setWorkOnHolidays(!workOnHolidays)}>
                                            <div className={cn(
                                                "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                                                workOnHolidays ? "bg-blue-600 border-blue-600" : "border-gray-300 group-hover:border-gray-400"
                                            )}>
                                                {workOnHolidays && (<svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>)}
                                            </div>
                                            <span className="text-[13px] text-gray-600 select-none">Làm việc cả ngày lễ tết</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Apply to others */}
                    {(!initialSelectedShiftIds || initialSelectedShiftIds.length === 0) && (
                        <div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[13px] font-bold text-gray-700">Thêm lịch tương tự cho nhân viên khác</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">Lịch làm việc sẽ được áp dụng cho các nhân viên được chọn</p>
                                </div>
                                <Switch checked={applyToOthers} onCheckedChange={setApplyToOthers} />
                            </div>
                            {applyToOthers && (
                                <div className="mt-3 max-h-[150px] overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                                    {otherUsers.map(u => {
                                        const isSelected = selectedOtherUsers.includes(u.id);
                                        return (
                                            <label key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer" onClick={() => toggleOtherUser(u.id)}>
                                                <div className={cn("w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors", isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300")}>
                                                    {isSelected && (<svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>)}
                                                </div>
                                                <span className="text-[13px] text-gray-700">{u.name}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex items-center">
                        {initialSelectedShiftIds && initialSelectedShiftIds.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 text-[13px] h-[36px] px-3 gap-1.5 flex items-center font-medium">
                                        <Trash2 className="h-4 w-4" /> Xóa
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[320px] p-2">
                                    <div className="px-2 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                                        Áp dụng thay đổi này cho
                                    </div>
                                    <DropdownMenuItem className="text-[13px] py-2.5 cursor-pointer rounded-md focus:bg-red-50 focus:text-red-600" onClick={() => onDelete('single')}>
                                        Chỉ ngày {formatVNDate(selectedDate || new Date())}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-[13px] py-2.5 cursor-pointer rounded-md focus:bg-red-50 focus:text-red-600" onClick={() => onDelete('future')}>
                                        Từ ngày {formatVNDate(selectedDate || new Date())} trở về sau
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-[13px] py-2.5 cursor-pointer rounded-md focus:bg-red-50 focus:text-red-600" onClick={() => onDelete('all')}>
                                        Tất cả các ngày (từ khi bắt đầu lặp lại)
                                    </DropdownMenuItem>
                                    <div className="px-2 py-2 border-t border-gray-100 mt-1">
                                        <p className="text-[11px] text-amber-600 leading-relaxed font-medium">
                                            Lưu ý: Chỉ áp dụng thay đổi trên các Chi tiết ca làm việc chưa chấm công
                                        </p>
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onClose} disabled={saving} className="h-[36px] px-5 text-[13px]">Bỏ qua</Button>
                        <Button onClick={handleSave} disabled={saving || selectedShiftIds.length === 0} className="h-[36px] px-5 text-[13px] bg-blue-600 hover:bg-blue-700">
                            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            {initialSelectedShiftIds && initialSelectedShiftIds.length > 0 ? 'Cập nhật' : 'Lưu'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
