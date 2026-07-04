import { useState, useEffect } from 'react';
import { X, Info, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TimePicker24 } from '@/components/ui/time-picker-24';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { type User } from '@/types';
import { type Shift } from '@/hooks/useWorkSchedules';
import { type TimesheetStatus } from '@/hooks/useTimesheets';
import { 
    type DialogData, 
    type ViolationRow, 
    type RewardRow, 
    STATUS_CONFIG, 
    VIOLATION_TYPES, 
    REWARD_TYPES, 
    toDateStr, 
    formatVNDateShort 
} from './types';
import { ShiftSwapDialog } from './ShiftSwapDialog';

export function AttendanceDialog({
    open,
    onClose,
    data,
    shifts,
    users,
    onSave,
    onDelete,
    onSwapComplete,
}: {
    open: boolean;
    onClose: () => void;
    data: DialogData | null;
    shifts: Shift[];
    users: User[];
    onSave: (payload: {
        user_id: string;
        shift_id: string;
        schedule_date: string;
        check_in?: string;
        check_out?: string;
        status?: TimesheetStatus;
        notes?: string;
    }) => Promise<void>;
    onDelete?: (timesheetId: string) => Promise<void>;
    onSwapComplete: () => void;
}) {
    const [activeTab, setActiveTab] = useState<'attendance' | 'history' | 'violations' | 'rewards'>('attendance');
    const [attendanceType, setAttendanceType] = useState<'working' | 'paid_leave' | 'unpaid_leave'>('working');
    const [checkInEnabled, setCheckInEnabled] = useState(false);
    const [checkOutEnabled, setCheckOutEnabled] = useState(false);
    const [checkInTime, setCheckInTime] = useState('');
    const [checkOutTime, setCheckOutTime] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedShiftId, setSelectedShiftId] = useState('');
    const [saving, setSaving] = useState(false);
    const [swapOpen, setSwapOpen] = useState(false);

    // Overtime & Early Leave (Calculated)
    const [overtimeInEnabled, setOvertimeInEnabled] = useState(false);
    const [overtimeInHours, setOvertimeInHours] = useState(0);
    const [overtimeInMinutes, setOvertimeInMinutes] = useState(0);
    const [earlyOutEnabled, setEarlyOutEnabled] = useState(false);
    const [earlyOutHours, setEarlyOutHours] = useState(0);
    const [earlyOutMinutes, setEarlyOutMinutes] = useState(0);

    // Violations & Rewards
    const [violations, setViolations] = useState<ViolationRow[]>([]);
    const [rewards, setRewards] = useState<RewardRow[]>([]);

    // Reset form when data changes
    useEffect(() => {
        if (data && open) {
            setActiveTab('attendance');
            setAttendanceType(
                data.status === 'day_off' ? 'unpaid_leave' : 'working'
            );
            setCheckInEnabled(!!data.checkIn);
            setCheckOutEnabled(!!data.checkOut);
            setCheckInTime(data.checkIn ? new Date(data.checkIn).toTimeString().slice(0, 5) : '');
            setCheckOutTime(data.checkOut ? new Date(data.checkOut).toTimeString().slice(0, 5) : '');
            setNotes('');
            setSelectedShiftId(data.shiftId);
            setViolations([]);
            setRewards([]);
            
            // Initial calculations
            setOvertimeInEnabled(false);
            setOvertimeInHours(0);
            setOvertimeInMinutes(0);
            setEarlyOutEnabled(false);
            setEarlyOutHours(0);
            setEarlyOutMinutes(0);
        }
    }, [data, open]);

    // ── Auto-calculation logic ───────────────────────────
    const currentShift = shifts.find(s => s.id === selectedShiftId);

    useEffect(() => {
        if (!currentShift || attendanceType !== 'working') return;

        // Calculate Overtime In
        if (checkInEnabled && checkInTime && currentShift.start_time) {
            const shiftStart = currentShift.start_time.slice(0, 5);
            const [sh, sm] = shiftStart.split(':').map(Number);
            const [ch, cm] = checkInTime.split(':').map(Number);
            
            const diff = (sh * 60 + sm) - (ch * 60 + cm);
            if (diff > 0) {
                setOvertimeInEnabled(true);
                setOvertimeInHours(Math.floor(diff / 60));
                setOvertimeInMinutes(diff % 60);
            } else {
                setOvertimeInEnabled(false);
                setOvertimeInHours(0);
                setOvertimeInMinutes(0);
            }
        }

        // Calculate Early Out
        if (checkOutEnabled && checkOutTime && currentShift.end_time) {
            const shiftEnd = currentShift.end_time.slice(0, 5);
            const [eh, em] = shiftEnd.split(':').map(Number);
            const [ch, cm] = checkOutTime.split(':').map(Number);
            
            const diff = (eh * 60 + em) - (ch * 60 + cm);
            if (diff > 0) {
                setEarlyOutEnabled(true);
                setEarlyOutHours(Math.floor(diff / 60));
                setEarlyOutMinutes(diff % 60);
            } else {
                setEarlyOutEnabled(false);
                setEarlyOutHours(0);
                setEarlyOutMinutes(0);
            }
        }
    }, [checkInTime, checkOutTime, checkInEnabled, checkOutEnabled, selectedShiftId, attendanceType, currentShift]);

    if (!data) return null;

    const statusLabel = STATUS_CONFIG[data.status]?.label || 'Chưa chấm công';
    const statusColor = STATUS_CONFIG[data.status]?.color || '#f59e0b';

    const tabs = [
        { key: 'attendance' as const, label: 'Chấm công' },
        { key: 'history' as const, label: 'Lịch sử chấm công' },
        { key: 'violations' as const, label: 'Phạt vi phạm' },
        { key: 'rewards' as const, label: 'Thưởng' },
    ];

    const handleSave = async () => {
        setSaving(true);
        try {
            let status: TimesheetStatus = 'not_checked';
            if (attendanceType === 'paid_leave' || attendanceType === 'unpaid_leave') {
                status = 'day_off';
            } else if (checkInEnabled && checkOutEnabled && checkInTime && checkOutTime) {
                status = 'on_time'; // simplified logic
            } else if (checkInEnabled || checkOutEnabled) {
                status = 'incomplete';
            }

            await onSave({
                user_id: data.userId,
                shift_id: selectedShiftId,
                schedule_date: toDateStr(data.date),
                check_in: checkInEnabled && checkInTime ? `${toDateStr(data.date)}T${checkInTime}:00+07:00` : undefined,
                check_out: checkOutEnabled && checkOutTime ? `${toDateStr(data.date)}T${checkOutTime}:00+07:00` : undefined,
                status,
                notes: notes || undefined,
            });
            toast.success('Đã lưu chấm công!');
            onClose();
        } catch {
            toast.error('Lỗi khi lưu chấm công');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!data.timesheetId || !onDelete) return;
        try {
            await onDelete(data.timesheetId);
            toast.success('Đã hủy chấm công');
            onClose();
        } catch {
            toast.error('Lỗi khi hủy chấm công');
        }
    };

    const addViolation = () => {
        setViolations(prev => [...prev, {
            id: crypto.randomUUID(),
            type: '',
            count: 1,
            amount: 0,
            total: 0,
        }]);
    };

    const removeViolation = (id: string) => {
        setViolations(prev => prev.filter(v => v.id !== id));
    };

    const updateViolation = (id: string, field: keyof ViolationRow, value: string | number) => {
        setViolations(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
    };

    const addReward = () => {
        setRewards(prev => [...prev, {
            id: crypto.randomUUID(),
            type: '',
            count: 1,
            amount: 0,
            total: 0,
        }]);
    };

    const removeReward = (id: string) => {
        setRewards(prev => prev.filter(r => r.id !== id));
    };

    const updateReward = (id: string, field: keyof RewardRow, value: string | number) => {
        setRewards(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    };


    return (<>
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-[680px] p-0 gap-0 overflow-hidden [&>button]:hidden">
                {/* ── Header ─────────────────────────────── */}
                <div className="px-6 pt-5 pb-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[17px] font-bold text-gray-900">Chấm công</h2>
                        <button onClick={onClose} className="h-7 w-7 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                            <X className="h-4 w-4 text-gray-500" />
                        </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[13px] font-semibold text-gray-700">{data.employeeName}</span>
                        {data.employeeCode && (
                            <span className="text-[12px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">{data.employeeCode}</span>
                        )}
                        <span
                            className="text-[12px] font-medium px-2 py-0.5 rounded-full"
                            style={{ color: statusColor, backgroundColor: `${statusColor}15` }}
                        >
                            {statusLabel}
                        </span>
                    </div>
                </div>

                {/* ── Info fields ─────────────────────────── */}
                <div className="px-6 pb-4 space-y-3">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <span className="text-[13px] text-gray-500 w-[65px]">Thời gian</span>
                            <span className="text-[13px] font-semibold text-gray-800">
                                {formatVNDateShort(data.date)}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 flex-1">
                            <span className="text-[13px] text-gray-500 flex items-center gap-1">
                                Ca làm việc
                                <Info className="h-3 w-3 text-gray-400" />
                            </span>
                            <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                                <SelectTrigger className="h-[34px] flex-1 text-[13px] border-gray-200 bg-white rounded-lg">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {shifts.map(s => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name} ({s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <span className="text-[13px] text-gray-500 w-[65px] pt-2">Ghi chú</span>
                        <Textarea
                            className="flex-1 min-h-[60px] text-[13px] border-gray-200 rounded-lg resize-none"
                            placeholder="Nhập ghi chú..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                {/* ── Tabs ────────────────────────────────── */}
                <div className="border-t border-gray-100">
                    <div className="flex px-6">
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    "px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
                                    activeTab === tab.key
                                        ? "border-blue-600 text-blue-600"
                                        : "border-transparent text-gray-500 hover:text-gray-700"
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Tab Content ─────────────────────────── */}
                <div className="px-6 py-4 min-h-[180px] max-h-[320px] overflow-y-auto">
                    {/* ─── Tab: Chấm công ─── */}
                    {activeTab === 'attendance' && (
                        <div className="space-y-4">
                            {/* Attendance type radio */}
                            <div className="flex items-center gap-3">
                                <span className="text-[13px] text-gray-600 font-medium w-[80px]">Chấm công</span>
                                <div className="flex items-center gap-5">
                                    <label className="flex items-center gap-2 cursor-pointer" onClick={() => setAttendanceType('working')}>
                                        <div className={cn(
                                            "w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors",
                                            attendanceType === 'working' ? "border-blue-600" : "border-gray-300"
                                        )}>
                                            {attendanceType === 'working' && <div className="w-[10px] h-[10px] rounded-full bg-blue-600" />}
                                        </div>
                                        <span className="text-[13px] text-gray-700">Đi làm</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer" onClick={() => setAttendanceType('paid_leave')}>
                                        <div className={cn(
                                            "w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors",
                                            attendanceType === 'paid_leave' ? "border-blue-600" : "border-gray-300"
                                        )}>
                                            {attendanceType === 'paid_leave' && <div className="w-[10px] h-[10px] rounded-full bg-blue-600" />}
                                        </div>
                                        <span className="text-[13px] text-gray-700 flex items-center gap-1">
                                            Nghỉ có phép
                                            <Info className="h-3 w-3 text-gray-400" />
                                        </span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer" onClick={() => setAttendanceType('unpaid_leave')}>
                                        <div className={cn(
                                            "w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors",
                                            attendanceType === 'unpaid_leave' ? "border-blue-600" : "border-gray-300"
                                        )}>
                                            {attendanceType === 'unpaid_leave' && <div className="w-[10px] h-[10px] rounded-full bg-blue-600" />}
                                        </div>
                                        <span className="text-[13px] text-gray-700 flex items-center gap-1">
                                            Nghỉ không phép
                                            <Info className="h-3 w-3 text-gray-400" />
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Check-in */}
                            {attendanceType === 'working' && (
                                <div className="space-y-3 pt-1">
                                    <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer w-[80px]" onClick={() => setCheckInEnabled(!checkInEnabled)}>
                                            <div className={cn(
                                                "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                                                checkInEnabled ? "bg-blue-600 border-blue-600" : "border-gray-300"
                                            )}>
                                                {checkInEnabled && (
                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className="text-[13px] text-gray-600">Vào</span>
                                        </label>
                                        <TimePicker24
                                            value={checkInTime}
                                            onChange={setCheckInTime}
                                            disabled={!checkInEnabled}
                                        />

                                        <div className="flex items-center gap-3 ml-0.5">
                                            <span className="text-gray-400 font-bold ml-1">⋮</span>
                                            <label className="flex items-center gap-2 cursor-pointer ml-1" onClick={() => setOvertimeInEnabled(!overtimeInEnabled)}>
                                                <div className={cn(
                                                    "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                                                    overtimeInEnabled ? "bg-blue-600 border-blue-600" : "border-gray-300"
                                                )}>
                                                    {overtimeInEnabled && (
                                                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <span className="text-[13px] text-gray-700 whitespace-nowrap">Làm thêm</span>
                                            </label>
                                            <div className="flex items-center gap-1.5 ml-1">
                                                <Input
                                                    type="number"
                                                    value={overtimeInHours}
                                                    onChange={e => setOvertimeInHours(parseInt(e.target.value) || 0)}
                                                    className="w-14 h-[34px] text-center text-[13px] border-gray-200 rounded-lg"
                                                />
                                                <span className="text-[13px] text-gray-500">giờ</span>
                                                <Input
                                                    type="number"
                                                    value={overtimeInMinutes}
                                                    onChange={e => setOvertimeInMinutes(parseInt(e.target.value) || 0)}
                                                    className="w-14 h-[34px] text-center text-[13px] border-gray-200 rounded-lg"
                                                />
                                                <span className="text-[13px] text-gray-500">phút</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Check-out */}
                                    <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer w-[80px]" onClick={() => setCheckOutEnabled(!checkOutEnabled)}>
                                            <div className={cn(
                                                "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                                                checkOutEnabled ? "bg-blue-600 border-blue-600" : "border-gray-300"
                                            )}>
                                                {checkOutEnabled && (
                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className="text-[13px] text-gray-600">Ra</span>
                                        </label>
                                        <TimePicker24
                                            value={checkOutTime}
                                            onChange={setCheckOutTime}
                                            disabled={!checkOutEnabled}
                                        />

                                        <div className="flex items-center gap-3 ml-0.5">
                                            <span className="text-gray-400 font-bold ml-1">⋮</span>
                                            <label className="flex items-center gap-2 cursor-pointer ml-1" onClick={() => setEarlyOutEnabled(!earlyOutEnabled)}>
                                                <div className={cn(
                                                    "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
                                                    earlyOutEnabled ? "bg-blue-600 border-blue-600" : "border-gray-300"
                                                )}>
                                                    {earlyOutEnabled && (
                                                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <span className="text-[13px] text-gray-700 whitespace-nowrap">Về sớm</span>
                                            </label>
                                            <div className="flex items-center gap-1.5 ml-1">
                                                <Input
                                                    type="number"
                                                    value={earlyOutHours}
                                                    onChange={e => setEarlyOutHours(parseInt(e.target.value) || 0)}
                                                    className="w-14 h-[34px] text-center text-[13px] border-gray-200 rounded-lg"
                                                />
                                                <span className="text-[13px] text-gray-500">giờ</span>
                                                <Input
                                                    type="number"
                                                    value={earlyOutMinutes}
                                                    onChange={e => setEarlyOutMinutes(parseInt(e.target.value) || 0)}
                                                    className="w-14 h-[34px] text-center text-[13px] border-gray-200 rounded-lg"
                                                />
                                                <span className="text-[13px] text-gray-500">phút</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── Tab: Lịch sử ─── */}
                    {activeTab === 'history' && (
                        <div className="space-y-3">
                            <p className="text-[13px] text-gray-400 italic">Chưa có lịch sử thay đổi</p>
                        </div>
                    )}

                    {/* ─── Tab: Vi phạm ─── */}
                    {activeTab === 'violations' && (
                        <div>
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="py-2 text-[12px] font-bold text-gray-600 w-[35%]">Loại vi phạm</th>
                                        <th className="py-2 text-[12px] font-bold text-gray-600 w-[15%] text-center">Số lần</th>
                                        <th className="py-2 text-[12px] font-bold text-gray-600 w-[20%] text-center">Mức phạt</th>
                                        <th className="py-2 text-[12px] font-bold text-gray-600 w-[20%] text-right">Thành tiền</th>
                                        <th className="py-2 w-[10%]" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {violations.map(v => (
                                        <tr key={v.id} className="border-b border-gray-50">
                                            <td className="py-2 pr-2">
                                                <Select value={v.type} onValueChange={(val) => updateViolation(v.id, 'type', val)}>
                                                    <SelectTrigger className="h-[32px] text-[12px] border-gray-200 rounded-lg">
                                                        <SelectValue placeholder="Chọn loại vi phạm" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {VIOLATION_TYPES.map(vt => (
                                                            <SelectItem key={vt} value={vt}>{vt}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="py-2 text-center">
                                                <Input
                                                    type="number"
                                                    className="h-[32px] w-16 text-[12px] text-center border-gray-200 rounded-lg mx-auto"
                                                    value={v.count}
                                                    onChange={e => updateViolation(v.id, 'count', parseInt(e.target.value) || 0)}
                                                    min={1}
                                                />
                                            </td>
                                            <td className="py-2 text-center">
                                                <Input
                                                    type="number"
                                                    className="h-[32px] w-20 text-[12px] text-center border-gray-200 rounded-lg mx-auto"
                                                    value={v.amount}
                                                    onChange={e => updateViolation(v.id, 'amount', parseInt(e.target.value) || 0)}
                                                />
                                            </td>
                                            <td className="py-2 text-right text-[12px] text-gray-700 font-medium">
                                                {(v.count * v.amount).toLocaleString()}
                                            </td>
                                            <td className="py-2 text-center">
                                                <button
                                                    onClick={() => removeViolation(v.id)}
                                                    className="h-6 w-6 rounded hover:bg-red-50 flex items-center justify-center transition-colors"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button
                                onClick={addViolation}
                                className="text-[13px] text-blue-600 hover:text-blue-700 font-medium mt-2 transition-colors"
                            >
                                Thêm vi phạm
                            </button>
                        </div>
                    )}

                    {/* ─── Tab: Thưởng ─── */}
                    {activeTab === 'rewards' && (
                        <div>
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="py-2 text-[12px] font-bold text-gray-600 w-[35%]">Loại thưởng</th>
                                        <th className="py-2 text-[12px] font-bold text-gray-600 w-[15%] text-center">Số lần</th>
                                        <th className="py-2 text-[12px] font-bold text-gray-600 w-[20%] text-center">Mức áp dụng</th>
                                        <th className="py-2 text-[12px] font-bold text-gray-600 w-[20%] text-right">Thành tiền</th>
                                        <th className="py-2 w-[10%]" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rewards.map(r => (
                                        <tr key={r.id} className="border-b border-gray-50">
                                            <td className="py-2 pr-2">
                                                <Select value={r.type} onValueChange={(val) => updateReward(r.id, 'type', val)}>
                                                    <SelectTrigger className="h-[32px] text-[12px] border-gray-200 rounded-lg">
                                                        <SelectValue placeholder="Chọn loại thưởng" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {REWARD_TYPES.map(rt => (
                                                            <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="py-2 text-center">
                                                <Input
                                                    type="number"
                                                    className="h-[32px] w-16 text-[12px] text-center border-gray-200 rounded-lg mx-auto"
                                                    value={r.count}
                                                    onChange={e => updateReward(r.id, 'count', parseInt(e.target.value) || 0)}
                                                    min={1}
                                                />
                                            </td>
                                            <td className="py-2 text-center">
                                                <Input
                                                    type="number"
                                                    className="h-[32px] w-20 text-[12px] text-center border-gray-200 rounded-lg mx-auto"
                                                    value={r.amount}
                                                    onChange={e => updateReward(r.id, 'amount', parseInt(e.target.value) || 0)}
                                                />
                                            </td>
                                            <td className="py-2 text-right text-[12px] text-gray-700 font-medium">
                                                {(r.count * r.amount).toLocaleString()}
                                            </td>
                                            <td className="py-2 text-center">
                                                <button
                                                    onClick={() => removeReward(r.id)}
                                                    className="h-6 w-6 rounded hover:bg-red-50 flex items-center justify-center transition-colors"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button
                                onClick={addReward}
                                className="text-[13px] text-blue-600 hover:text-blue-700 font-medium mt-2 transition-colors"
                            >
                                Thêm thưởng
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Footer ─────────────────────────────── */}
                <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleDelete}
                            disabled={!data.timesheetId}
                            className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            Hủy
                        </button>
                        <button
                            onClick={() => setSwapOpen(true)}
                            className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-blue-600 transition-colors"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Đổi ca
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={saving}
                            className="h-[36px] px-5 text-[13px] border-gray-200"
                        >
                            Bỏ qua
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="h-[36px] px-6 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Lưu
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        {/* Shift Swap Sub-Dialog */}
        <ShiftSwapDialog
            open={swapOpen}
            onClose={() => setSwapOpen(false)}
            data={data}
            users={users}
            shifts={shifts}
            onSwapComplete={onSwapComplete}
        />
    </>);
}
