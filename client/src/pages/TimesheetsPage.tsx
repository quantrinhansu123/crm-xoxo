import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search, ChevronLeft, ChevronRight, ChevronDown, Plus, Loader2,
    MoreHorizontal, CheckSquare, Clock, X, Trash2, RefreshCw, Info, Users, CalendarDays
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TimePicker24 } from '@/components/ui/time-picker-24';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { User } from '@/types';
import { useWorkSchedules, type Shift, type WorkSchedule } from '@/hooks/useWorkSchedules';
import { useTimesheets, type Timesheet, type TimesheetStatus } from '@/hooks/useTimesheets';
import { useUsers } from '@/hooks/useUsers';
import { toast } from 'sonner';
import { AttendanceDialog } from '@/components/work-schedule/AttendanceDialog';
import { QuickScheduleConfirmDialog } from '@/components/work-schedule/QuickScheduleConfirmDialog';
import { type DialogData, STATUS_CONFIG, toDateStr } from '@/components/work-schedule/types';

// ── Constants ──────────────────────────────────────────────────
const DAY_LABELS = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
const VN_DAY_SHORT = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const VN_DAY_ABBR = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ── Date helpers ───────────────────────────────────────────────
function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getMondayOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getWeekDates(monday: Date): Date[] {
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        return d;
    });
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatVNDateShort(d: Date): string {
    return `${VN_DAY_SHORT[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function getMonthDates(year: number, month: number): Date[] {
    const dates: Date[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        dates.push(new Date(year, month - 1, d));
    }
    return dates;
}

// ── Shift group data ───────────────────────────────────────────
interface ShiftGroup {
    shiftId: string;
    shiftName: string;
    shiftTime: string;
    shiftColor: string;
    byDate: Record<string, EmployeeCell[]>;
}

interface EmployeeCell {
    userId: string;
    name: string;
    employeeCode?: string;
    status: TimesheetStatus | 'not_checked_past';
    timesheetId?: string;
    checkIn?: string | null;
    checkOut?: string | null;
}


// ══════════════════════════════════════════════════════════════
// ── Main Component ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
export function TimesheetsPage() {
    const navigate = useNavigate();
    const { users, fetchUsers } = useUsers();
    const {
        shifts, schedules, fetchShifts, fetchSchedules,
        createSchedule, createShift, bulkDeleteSchedule
    } = useWorkSchedules();
    const { timesheets, loading: timesheetsLoading, fetchTimesheets, generateTimesheets, approveTimesheets, createTimesheet, deleteTimesheet } = useTimesheets();

    const [currentMonday, setCurrentMonday] = useState(() => getMondayOfWeek(new Date()));
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'shift' | 'employee'>('shift');
    const [periodMode, setPeriodMode] = useState<'weekly' | 'monthly'>('monthly');
    const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());
    const [selectedShiftFilter, setSelectedShiftFilter] = useState<string>('all');
    const today = useMemo(() => new Date(), []);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogData, setDialogData] = useState<DialogData | null>(null);



    // Initial data load
    useEffect(() => { fetchUsers(); fetchShifts(); }, []);

    const weekDates = useMemo(() => getWeekDates(currentMonday), [currentMonday]);
    const weekNum = getWeekNumber(currentMonday);
    const monthNum = currentMonday.getMonth() + 1;
    const yearNum = currentMonday.getFullYear();

    const monthDates = useMemo(() => getMonthDates(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1), [currentMonthDate]);
    const displayMonthLabel = `Tháng ${currentMonthDate.getMonth() + 1}, ${currentMonthDate.getFullYear()}`;

    // Fetch schedules + timesheets when period changes
    useEffect(() => {
        let start: string, end: string;
        if (periodMode === 'monthly') {
            const dates = getMonthDates(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1);
            start = toDateStr(dates[0]);
            end = toDateStr(dates[dates.length - 1]);
        } else {
            start = toDateStr(weekDates[0]);
            end = toDateStr(weekDates[6]);
        }
        fetchSchedules(start, end);
        fetchTimesheets(start, end);
    }, [periodMode, currentMonday, currentMonthDate]);

    // ── Build shift-grouped data ─────────────────────────────
    const shiftGroups: ShiftGroup[] = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const shiftMap: Record<string, {
            shift: Shift | null;
            scheduleEntries: WorkSchedule[];
        }> = {};

        for (const ws of schedules) {
            const sid = ws.shift_id;
            if (!shiftMap[sid]) {
                shiftMap[sid] = { shift: ws.shift || null, scheduleEntries: [] };
            }
            shiftMap[sid].scheduleEntries.push(ws);
        }

        const timesheetIndex: Record<string, Timesheet> = {};
        for (const t of timesheets) {
            const key = `${t.user_id}_${t.shift_id}_${t.schedule_date}`;
            timesheetIndex[key] = t;
        }

        return Object.entries(shiftMap).map(([shiftId, { shift, scheduleEntries }]) => {
            const byDate: ShiftGroup['byDate'] = {};

            for (const ws of scheduleEntries) {
                const dateStr = ws.schedule_date;
                if (!byDate[dateStr]) byDate[dateStr] = [];

                const tsKey = `${ws.user_id}_${ws.shift_id}_${dateStr}`;
                const ts = timesheetIndex[tsKey];

                const rawStatus: TimesheetStatus | 'not_checked_past' = ts?.status || 'not_checked';
                const scheduleDay = new Date(dateStr + 'T00:00:00');
                const isPast = scheduleDay < todayStart;
                
                const isPunchedIn = Boolean(ts?.check_in);
                const isPunchedOut = Boolean(ts?.check_out);
                const hasPartialPunch = (isPunchedIn && !isPunchedOut) || (!isPunchedIn && isPunchedOut);

                let effectiveStatus: TimesheetStatus | 'not_checked_past' = rawStatus;

                if (hasPartialPunch) {
                    // Logic mới: chỉ 1 lần chấm vào hoặc ra thì mới là chấm công thiếu
                    effectiveStatus = 'incomplete';
                } else if (isPast && !isPunchedIn && !isPunchedOut && rawStatus === 'not_checked') {
                    // Logic mới: qua ngày rồi mà không có chấm công nào thì là chưa chấm công màu cam
                    effectiveStatus = 'not_checked_past';
                }

                byDate[dateStr].push({
                    userId: ws.user_id,
                    name: ws.user?.name || '',
                    employeeCode: ws.user?.employee_code || '',
                    status: effectiveStatus,
                    timesheetId: ts?.id,
                    checkIn: ts?.check_in,
                    checkOut: ts?.check_out,
                });
            }

            return {
                shiftId,
                shiftName: shift?.name || 'CA',
                shiftTime: `${shift?.start_time?.slice(0, 5) || '00:00'} - ${shift?.end_time?.slice(0, 5) || '00:00'}`,
                shiftColor: shift?.color || 'blue',
                byDate,
            };
        });
    }, [schedules, timesheets]);

    // ── Build employee stats for employee view ──────────────
    interface EmployeeStats {
        userId: string;
        name: string;
        employeeCode: string;
        salaryType: string;
        onTime: number;
        dayOff: number;
        late: number;
        earlyLeave: number;
        overtime: number;
        hasData: boolean;
    }

    const employeeStats: EmployeeStats[] = useMemo(() => {
        // Get unique employees from schedules
        const empMap: Record<string, EmployeeStats> = {};

        for (const ws of schedules) {
            if (!empMap[ws.user_id]) {
                empMap[ws.user_id] = {
                    userId: ws.user_id,
                    name: ws.user?.name || '',
                    employeeCode: (ws.user as any)?.employee_code || '',
                    salaryType: 'Theo ngày công chuẩn',
                    onTime: 0,
                    dayOff: 0,
                    late: 0,
                    earlyLeave: 0,
                    overtime: 0,
                    hasData: false,
                };
            }
        }

        // Also add users not in schedules
        for (const u of users) {
            if (!empMap[u.id]) {
                empMap[u.id] = {
                    userId: u.id,
                    name: u.name || '',
                    employeeCode: (u as any)?.employee_code || '',
                    salaryType: 'Theo ngày công chuẩn',
                    onTime: 0,
                    dayOff: 0,
                    late: 0,
                    earlyLeave: 0,
                    overtime: 0,
                    hasData: false,
                };
            }
        }

        // Count statuses from timesheets
        for (const t of timesheets) {
            if (!empMap[t.user_id]) continue;
            empMap[t.user_id].hasData = true;
            switch (t.status) {
                case 'on_time': empMap[t.user_id].onTime++; break;
                case 'late_early': empMap[t.user_id].late++; break;
                case 'day_off': empMap[t.user_id].dayOff++; break;
                case 'incomplete': empMap[t.user_id].late++; break;
            }
        }

        let list = Object.values(empMap).sort((a, b) => a.name.localeCompare(b.name));

        // filter by search
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            list = list.filter(e => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q));
        }

        return list;
    }, [schedules, timesheets, users, searchTerm]);

    // Filter by search and shift
    const filteredGroups = useMemo(() => {
        let groups = shiftGroups;
        if (selectedShiftFilter !== 'all') {
            groups = groups.filter(g => g.shiftId === selectedShiftFilter);
        }
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            groups = groups.map(group => {
                const filteredByDate: ShiftGroup['byDate'] = {};
                for (const [dateStr, employees] of Object.entries(group.byDate)) {
                    const filtered = employees.filter(e => e.name.toLowerCase().includes(q));
                    if (filtered.length > 0) filteredByDate[dateStr] = filtered;
                }
                return { ...group, byDate: filteredByDate };
            }).filter(group => Object.keys(group.byDate).length > 0);
        }
        return groups;
    }, [shiftGroups, searchTerm, selectedShiftFilter]);

    // ── Navigation ─────────────────────────────────────────────
    const goToPrevWeek = () => { const prev = new Date(currentMonday); prev.setDate(prev.getDate() - 7); setCurrentMonday(prev); };
    const goToNextWeek = () => { const next = new Date(currentMonday); next.setDate(next.getDate() + 7); setCurrentMonday(next); };
    const goToCurrentWeek = () => setCurrentMonday(getMondayOfWeek(new Date()));
    const goToPrevMonth = () => setCurrentMonthDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; });
    const goToNextMonth = () => setCurrentMonthDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; });
    const goToCurrentMonth = () => setCurrentMonthDate(new Date());

    // ── Cell click → open dialog ──────────────────────────────
    const handleCellClick = (emp: EmployeeCell, date: Date, group: ShiftGroup) => {
        setDialogData({
            employeeName: emp.name,
            employeeCode: emp.employeeCode || '',
            userId: emp.userId,
            date,
            shiftId: group.shiftId,
            shiftName: group.shiftName,
            shiftTime: group.shiftTime,
            status: emp.status,
            timesheetId: emp.timesheetId,
            checkIn: emp.checkIn,
            checkOut: emp.checkOut,
        });
        setDialogOpen(true);
    };

    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [confirmData, setConfirmData] = useState<{
        userId: string;
        employeeName: string;
        shiftId: string;
        shiftName: string;
        date: Date;
    } | null>(null);

    const handleEmptyCellClick = (empName: string, date: Date, group: ShiftGroup) => {
        const user = users.find(u => u.name === empName);
        if (!user) {
            toast.error('Không tìm thấy thông tin nhân viên');
            return;
        }
        setConfirmData({
            userId: user.id,
            employeeName: user.name,
            shiftId: group.shiftId,
            shiftName: group.shiftName,
            date
        });
        setConfirmDialogOpen(true);
    };

    const handleConfirmQuickSchedule = async () => {
        if (!confirmData) return;
        try {
            await createSchedule({
                user_id: confirmData.userId,
                shift_ids: [confirmData.shiftId],
                schedule_date: toDateStr(confirmData.date),
                repeat_weekly: false,
            });
            toast.success(`Đã đặt lịch cho ${confirmData.employeeName}`);
            
            const start = periodMode === 'monthly' ? toDateStr(monthDates[0]) : toDateStr(weekDates[0]);
            const end = periodMode === 'monthly' ? toDateStr(monthDates[monthDates.length - 1]) : toDateStr(weekDates[6]);
            await fetchSchedules(start, end);
            setConfirmDialogOpen(false);
        } catch {
            toast.error('Lỗi khi đặt lịch nhanh');
        }
    };

    const handleSaveSchedule = async (data: any) => {
        await createSchedule(data);
        const start = periodMode === 'monthly' ? toDateStr(monthDates[0]) : toDateStr(weekDates[0]);
        const end = periodMode === 'monthly' ? toDateStr(monthDates[monthDates.length - 1]) : toDateStr(weekDates[6]);
        await fetchSchedules(start, end);
    };

    const handleCreateShift = async (data: any) => {
        await createShift(data);
        await fetchShifts();
    };

    // ── Save handler ──────────────────────────────────────────
    const handleSaveTimesheet = async (payload: {
        user_id: string;
        shift_id: string;
        schedule_date: string;
        check_in?: string;
        check_out?: string;
        status?: TimesheetStatus;
        notes?: string;
    }) => {
        await createTimesheet(payload);
        let start: string, end: string;
        if (periodMode === 'monthly') {
            start = toDateStr(monthDates[0]);
            end = toDateStr(monthDates[monthDates.length - 1]);
        } else {
            start = toDateStr(weekDates[0]);
            end = toDateStr(weekDates[6]);
        }
        await fetchTimesheets(start, end);
    };

    // ── Delete handler ────────────────────────────────────────
    const handleDeleteTimesheet = async (id: string) => {
        await deleteTimesheet(id);
    };

    // ── Generate timesheets from schedules ─────────────────────
    const handleGenerate = async () => {
        try {
            let start: string, end: string;
            if (periodMode === 'monthly') {
                start = toDateStr(monthDates[0]);
                end = toDateStr(monthDates[monthDates.length - 1]);
            } else {
                start = toDateStr(weekDates[0]);
                end = toDateStr(weekDates[6]);
            }
            await generateTimesheets(start, end);
            await fetchTimesheets(start, end);
            toast.success('Đã tạo bảng chấm công từ lịch làm việc!');
        } catch {
            toast.error('Lỗi khi tạo bảng chấm công');
        }
    };

    // ── Approve all ────────────────────────────────────────────
    const handleApproveAll = async () => {
        const ids = timesheets.filter(t => !t.approved_at).map(t => t.id);
        if (ids.length === 0) {
            toast.info('Không có dữ liệu chấm công cần duyệt');
            return;
        }
        try {
            await approveTimesheets(ids);
            let start: string, end: string;
            if (periodMode === 'monthly') {
                start = toDateStr(monthDates[0]);
                end = toDateStr(monthDates[monthDates.length - 1]);
            } else {
                start = toDateStr(weekDates[0]);
                end = toDateStr(weekDates[6]);
            }
            await fetchTimesheets(start, end);
            toast.success(`Đã duyệt ${ids.length} bản ghi chấm công`);
        } catch {
            toast.error('Lỗi khi duyệt chấm công');
        }
    };

    // ── Get all unique employees across all days in a group ────
    const getGroupEmployees = useCallback((group: ShiftGroup): string[] => {
        const nameSet = new Set<string>();
        for (const employees of Object.values(group.byDate)) {
            for (const emp of employees) {
                nameSet.add(emp.name);
            }
        }
        return Array.from(nameSet).sort();
    }, []);

    const goToWorkSchedule = useCallback((userId: string) => {
        navigate(`/work-schedule?userId=${userId}`);
    }, [navigate]);

    if (timesheetsLoading && timesheets.length === 0 && schedules.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* ── Top bar ─────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 border-b border-gray-100 bg-[#fbfcfd] gap-3 flex-shrink-0">
                <div className="flex items-center gap-4 flex-wrap">
                    <h1 className="text-[15px] font-bold text-gray-900 whitespace-nowrap">Bảng chấm công</h1>

                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-gray-400" />
                        <Input
                            className="pl-8 h-[34px] w-[200px] border-gray-200 text-[13px] placeholder:text-gray-400 bg-white rounded-lg shadow-sm focus-visible:ring-1 focus-visible:ring-orange-500"
                            placeholder="Tìm kiếm nhân viên"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                    </div>

                    <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as 'weekly' | 'monthly')}>
                        <SelectTrigger className="h-[34px] w-[130px] text-[13px] border-gray-200 bg-white shadow-sm rounded-lg">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="weekly">Theo tuần</SelectItem>
                            <SelectItem value="monthly">Theo tháng</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={periodMode === 'monthly' ? goToPrevMonth : goToPrevWeek}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-[13px] font-medium text-gray-700 whitespace-nowrap select-none">
                            {periodMode === 'monthly' ? displayMonthLabel : `Tuần ${weekNum} - Th. ${monthNum} ${yearNum}`}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={periodMode === 'monthly' ? goToNextMonth : goToNextWeek}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            className="h-[30px] px-3 text-[12px] font-medium border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 ml-1"
                            onClick={periodMode === 'monthly' ? goToCurrentMonth : goToCurrentWeek}
                        >
                            Chọn
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* View mode toggle */}
                    <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'shift' | 'employee')}>
                        <SelectTrigger className="h-[34px] w-[185px] text-[13px] border-gray-200 bg-white shadow-sm rounded-lg">
                            <div className="flex items-center gap-1.5">
                                {viewMode === 'shift' ? <Clock className="h-3.5 w-3.5 text-gray-500" /> : <Users className="h-3.5 w-3.5 text-gray-500" />}
                                <SelectValue />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="shift">Xem theo ca</SelectItem>
                            <SelectItem value="employee">Xem theo nhân viên</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button
                        onClick={handleApproveAll}
                        className="h-[34px] px-4 text-[12px] font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg shadow-sm gap-1.5"
                    >
                        <CheckSquare className="h-3.5 w-3.5" />
                        Duyệt chấm công
                    </Button>

                    <Button variant="outline" size="icon" className="h-[34px] w-[34px] border-gray-200 rounded-lg shadow-sm">
                        <MoreHorizontal className="h-4 w-4 text-gray-500" />
                    </Button>
                </div>
            </div>

            {/* ── Table ────────────────────────────────────────── */}
            {viewMode === 'shift' ? (
                periodMode === 'monthly' ? (
                /* ── MONTHLY SHIFT VIEW ─── */
                <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse text-left" style={{ minWidth: `${220 + monthDates.length * 38}px` }}>
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-[#f7f8fa]">
                                <th className="px-3 py-2 text-[11px] font-bold text-gray-600 border-b border-gray-200 w-[100px] sticky left-0 bg-[#f7f8fa] z-20 border-r border-r-gray-200">
                                    <div className="flex items-center gap-1.5">
                                        <span>Ca làm việc</span>
                                        <button
                                            onClick={handleGenerate}
                                            className="h-4 w-4 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-300 transition-colors"
                                            title="Tạo chấm công từ lịch làm việc"
                                        >
                                            <Plus className="h-2.5 w-2.5" />
                                        </button>
                                    </div>
                                </th>
                                <th className="px-3 py-2 text-[11px] font-bold text-gray-600 border-b border-gray-200 w-[120px] sticky left-[100px] bg-[#f7f8fa] z-20 border-r border-r-gray-200">
                                    <div className="flex items-center gap-1.5">
                                        <span>Nhân viên</span>
                                        <button className="h-4 w-4 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-300 transition-colors">
                                            <Plus className="h-2.5 w-2.5" />
                                        </button>
                                    </div>
                                </th>
                                {monthDates.map((d, i) => {
                                    const isToday = isSameDay(d, today);
                                    const isSunday = d.getDay() === 0;
                                    return (
                                        <th key={i} className={cn(
                                            "px-0 py-2 text-center border-b border-gray-200 border-r border-gray-100 min-w-[36px] w-[36px]",
                                            isToday && "bg-blue-50/80",
                                            isSunday && !isToday && "bg-red-50/30"
                                        )}>
                                            <div className="flex flex-col items-center leading-none">
                                                <span className={cn("text-[10px] font-semibold", isToday ? "text-blue-600" : isSunday ? "text-red-400" : "text-gray-400")}>
                                                    {VN_DAY_ABBR[d.getDay()]}
                                                </span>
                                                <span className={cn(
                                                    "inline-flex items-center justify-center font-bold text-[11px] w-[22px] h-[22px] rounded-full mt-0.5",
                                                    isToday ? "bg-blue-500 text-white" : isSunday ? "text-red-400" : "text-gray-600"
                                                )}>
                                                    {String(d.getDate()).padStart(2, '0')}
                                                </span>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredGroups.map((group) => {
                                const allEmployeeNames = getGroupEmployees(group);
                                if (allEmployeeNames.length === 0) return null;
                                return (
                                    <Fragment key={group.shiftId}>
                                        {allEmployeeNames.map((empName, empIdx) => (
                                            <tr
                                                key={`${group.shiftId}-${empName}`}
                                                className={cn(
                                                    "hover:bg-gray-50/50 transition-colors",
                                                    empIdx === 0 && "border-t-2 border-t-gray-200"
                                                )}
                                            >
                                                {empIdx === 0 && (
                                                    <td
                                                        className="px-3 py-1.5 sticky left-0 bg-white z-[5] border-r border-gray-200 border-b border-gray-100 align-top"
                                                        rowSpan={allEmployeeNames.length}
                                                    >
                                                        <div className="pt-1">
                                                            <p className="text-[11px] font-extrabold text-gray-800 uppercase tracking-wide leading-tight">
                                                                {group.shiftName}
                                                            </p>
                                                            <p className="text-[10px] text-gray-400 mt-0.5 font-medium">
                                                                {group.shiftTime}
                                                            </p>
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="px-3 py-1.5 sticky left-[100px] bg-white z-[5] border-r border-gray-200 border-b border-gray-100 group/emp">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-[11px] font-bold text-gray-700 uppercase truncate max-w-[80px]" title={empName}>
                                                            {empName}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const user = users.find(u => u.name === empName);
                                                                if (user) goToWorkSchedule(user.id);
                                                            }}
                                                            className="opacity-0 group-hover/emp:opacity-100 shrink-0 h-5 px-1 rounded text-[10px] font-medium text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-0.5"
                                                            title="Sửa lịch làm việc"
                                                        >
                                                            <CalendarDays className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </td>
                                                {monthDates.map((d, dayIdx) => {
                                                    const dateStr = toDateStr(d);
                                                    const isToday = isSameDay(d, today);
                                                    const isSunday = d.getDay() === 0;
                                                    const dayEmployees = group.byDate[dateStr] || [];
                                                    const emp = dayEmployees.find(e => e.name === empName);
                                                    return (
                                                        <td
                                                            key={dayIdx}
                                                            className={cn(
                                                                "group px-0 py-1.5 text-center border border-gray-100 cursor-pointer hover:bg-blue-50/40 transition-colors relative",
                                                                isToday && "bg-blue-50/30",
                                                                isSunday && !isToday && "bg-red-50/20"
                                                            )}
                                                            onClick={() => emp ? handleCellClick(emp, d, group) : handleEmptyCellClick(empName, d, group)}
                                                        >
                                                            {emp && (
                                                                emp.status === 'not_checked' ? (
                                                                    <div className="flex justify-center items-center h-full w-full">
                                                                        <span
                                                                            className="inline-block w-[26px] h-[26px] rounded-[4px] bg-gray-200 hover:ring-1 hover:ring-gray-300/80 transition-shadow"
                                                                            title={`${empName} - ${STATUS_CONFIG[emp.status]?.label || 'N/A'}`}
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex justify-center items-center h-full w-full">
                                                                        <span
                                                                            className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-[4px] hover:ring-1 hover:ring-gray-300/80 hover:bg-white transition-all cursor-pointer"
                                                                            title={`${empName} - ${STATUS_CONFIG[emp.status]?.label || 'N/A'}`}
                                                                        >
                                                                            <span
                                                                                className="w-[8px] h-[8px] rounded-full"
                                                                                style={{ backgroundColor: STATUS_CONFIG[emp.status]?.color || '#d1d5db' }}
                                                                            />
                                                                        </span>
                                                                    </div>
                                                                )
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </Fragment>
                                );
                            })}
                            {filteredGroups.length === 0 && (
                                <tr>
                                    <td colSpan={2 + monthDates.length} className="px-4 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                                                <Clock className="h-6 w-6 text-gray-400" />
                                            </div>
                                            <p className="text-[13px] text-gray-400">Chưa có dữ liệu chấm công trong tháng này</p>
                                            <Button variant="outline" className="h-[32px] px-4 text-[12px] border-gray-200" onClick={handleGenerate}>
                                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                                Tạo từ lịch làm việc
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                ) : (
                /* ── WEEKLY SHIFT VIEW ─── */
                <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse text-left min-w-[1100px]">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-[#f7f8fa]">
                                <th className="px-4 py-3 text-[12px] font-bold text-gray-700 border-b border-gray-200 w-[180px] sticky left-0 bg-[#f7f8fa] z-20">
                                    <div className="flex items-center gap-2">
                                        <span>Ca làm việc</span>
                                        <button
                                            onClick={handleGenerate}
                                            className="h-5 w-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-300 transition-colors"
                                            title="Tạo chấm công từ lịch làm việc"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                    </div>
                                </th>
                                {weekDates.map((d, i) => {
                                    const isToday = isSameDay(d, today);
                                    return (
                                        <th key={i} className={cn("px-2 py-3 text-center border-b border-gray-200 min-w-[120px]", isToday && "bg-orange-50/80")}>
                                            <div className="flex items-center justify-center gap-1.5">
                                                <span className={cn("text-[12px] font-semibold", isToday ? "text-orange-600" : "text-gray-500")}>
                                                    {DAY_LABELS[i]}
                                                </span>
                                                <span className={cn(
                                                    "inline-flex items-center justify-center font-bold text-[12px] min-w-[24px] h-[24px] rounded-full",
                                                    isToday ? "bg-orange-500 text-white" : "text-gray-500"
                                                )}>
                                                    {String(d.getDate()).padStart(2, '0')}
                                                </span>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            {filteredGroups.map((group) => {
                                const allEmployeeNames = getGroupEmployees(group);
                                if (allEmployeeNames.length === 0) return null;

                                return (
                                    <ShiftGroupRows
                                        key={group.shiftId}
                                        group={group}
                                        allEmployeeNames={allEmployeeNames}
                                        weekDates={weekDates}
                                        today={today}
                                        onCellClick={handleCellClick}
                                        onEmptyCellClick={handleEmptyCellClick}
                                        users={users}
                                        onGoToWorkSchedule={goToWorkSchedule}
                                    />
                                );
                            })}

                            {filteredGroups.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                                                <Clock className="h-6 w-6 text-gray-400" />
                                            </div>
                                            <p className="text-[13px] text-gray-400">Chưa có dữ liệu chấm công trong tuần này</p>
                                            <Button variant="outline" className="h-[32px] px-4 text-[12px] border-gray-200" onClick={handleGenerate}>
                                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                                Tạo từ lịch làm việc
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                )
            ) : (
                /* ── EMPLOYEE VIEW ─── */
                <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse text-left">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-[#f7f8fa]">
                                <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[220px]">Nhân viên</th>
                                <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[180px]">Loại lương</th>
                                <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-center">Đi làm</th>
                                <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-center">Nghỉ làm</th>
                                <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-center">Đi muộn</th>
                                <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-center">Về sớm</th>
                                <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-center">Làm thêm</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employeeStats.map(emp => (
                                <tr key={emp.userId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group/emp">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[13px] font-bold text-gray-800 uppercase">{emp.name}</p>
                                                <p className="text-[11px] text-gray-400 mt-0.5">{emp.employeeCode || '---'}</p>
                                            </div>
                                            <button
                                                onClick={() => goToWorkSchedule(emp.userId)}
                                                className="opacity-0 group-hover/emp:opacity-100 shrink-0 h-6 px-1.5 rounded text-[10px] font-medium text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-1"
                                                title="Sửa lịch làm việc"
                                            >
                                                <CalendarDays className="h-3.5 w-3.5" />
                                                <span>Sửa lịch</span>
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-[12px] text-gray-600">{emp.salaryType}</span>
                                    </td>
                                    {emp.hasData ? (
                                        <>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[13px] font-semibold text-green-600">{emp.onTime || '---'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[13px] font-semibold text-gray-500">{emp.dayOff || '---'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[13px] font-semibold text-amber-500">{emp.late || '---'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[13px] font-semibold text-amber-500">{emp.earlyLeave || '---'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-[13px] font-semibold text-blue-600">{emp.overtime || '---'}</span>
                                            </td>
                                        </>
                                    ) : (
                                        <td colSpan={5} className="px-4 py-3">
                                            <span className="text-[12px] text-blue-500">Nhân viên chưa có dữ liệu chấm công</span>
                                        </td>
                                    )}
                                </tr>
                            ))}

                            {employeeStats.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-16 text-center">
                                        <p className="text-[13px] text-gray-400">Không tìm thấy nhân viên</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Footer Legend ──────────────────────────────────── */}
            <div className="flex items-center justify-center gap-6 px-5 py-2.5 border-t border-gray-100 bg-[#fbfcfd] flex-shrink-0">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <div key={key} className="flex items-center gap-1.5">
                        {key === 'not_checked' ? (
                            <span className="h-3.5 w-3.5 rounded-[2px] bg-gray-100 border border-transparent" />
                        ) : (
                            <span className={cn("h-2.5 w-2.5 rounded-full", config.dotClass)} />
                        )}
                        <span className="text-[11px] text-gray-500 font-medium">{config.label}</span>
                    </div>
                ))}
            </div>

            {/* ── Attendance Dialog ──────────────────────────────── */}
            <AttendanceDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                data={dialogData}
                shifts={shifts}
                users={users}
                onSave={handleSaveTimesheet}
                onDelete={handleDeleteTimesheet}
                onSwapComplete={async () => {
                    setDialogOpen(false);
                    let start: string, end: string;
                    if (periodMode === 'monthly') {
                        start = toDateStr(monthDates[0]);
                        end = toDateStr(monthDates[monthDates.length - 1]);
                    } else {
                        start = toDateStr(weekDates[0]);
                        end = toDateStr(weekDates[6]);
                    }
                    await fetchSchedules(start, end);
                    await fetchTimesheets(start, end);
                }}
            />

            <QuickScheduleConfirmDialog
                open={confirmDialogOpen}
                onClose={() => setConfirmDialogOpen(false)}
                onConfirm={handleConfirmQuickSchedule}
                employeeName={confirmData?.employeeName || ''}
                shiftName={confirmData?.shiftName || ''}
                date={confirmData?.date || null}
            />
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// ── Shift Group Rows Component ─────────────────────────────────
// ══════════════════════════════════════════════════════════════
function ShiftGroupRows({
    group,
    allEmployeeNames,
    weekDates,
    today,
    onCellClick,
    onEmptyCellClick,
    users,
    onGoToWorkSchedule,
}: {
    group: ShiftGroup;
    allEmployeeNames: string[];
    weekDates: Date[];
    today: Date;
    onCellClick: (emp: EmployeeCell, date: Date, group: ShiftGroup) => void;
    onEmptyCellClick: (empName: string, date: Date, group: ShiftGroup) => void;
    users: any[];
    onGoToWorkSchedule: (userId: string) => void;
}) {
    return (
        <>
            {/* Shift header row */}
            <tr className="border-t-2 border-gray-200">
                <td
                    className="px-4 py-2 sticky left-0 bg-white z-[5] border-r border-gray-100 align-top"
                    rowSpan={allEmployeeNames.length + 1}
                >
                    <div className="pt-1">
                        <p className="text-[13px] font-extrabold text-gray-800 uppercase tracking-wide">
                            {group.shiftName}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5 font-medium">
                            {group.shiftTime}
                        </p>
                    </div>
                </td>
                {weekDates.map((d, i) => {
                    const isToday = isSameDay(d, today);
                    return (
                        <td key={i} className={cn("border-r border-gray-50 h-0 p-0", isToday && "bg-orange-50/30")} />
                    );
                })}
            </tr>

            {/* Employee rows */}
            {allEmployeeNames.map((empName) => (
                <tr key={`${group.shiftId}-${empName}`} className="hover:bg-gray-50/50 transition-colors">
                    {weekDates.map((d, i) => {
                        const dateStr = toDateStr(d);
                        const isToday = isSameDay(d, today);
                        const dayEmployees = group.byDate[dateStr] || [];
                        const emp = dayEmployees.find(e => e.name === empName);

                        return (
                            <td
                                key={i}
                                className={cn(
                                    "px-2 py-2 border-r border-gray-50 border-b border-b-gray-50 min-h-[56px] cursor-pointer hover:bg-blue-50/40 transition-colors",
                                    isToday && "bg-orange-50/30"
                                )}
                                onClick={() => emp ? onCellClick(emp, d, group) : onEmptyCellClick(empName, d, group)}
                            >
                                {emp ? (
                                    <div className="flex flex-col gap-0.5 group/empname">
                                        <div className="flex items-center gap-0.5">
                                            <span className="text-[12px] font-bold text-gray-800 uppercase leading-tight truncate">
                                                {emp.name}
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const user = users.find(u => u.name === empName);
                                                    if (user) onGoToWorkSchedule(user.id);
                                                }}
                                                className="opacity-0 group-hover/empname:opacity-100 shrink-0 h-4 w-4 rounded text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center"
                                                title="Sửa lịch làm việc"
                                            >
                                                <CalendarDays className="h-3 w-3" />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-gray-300 text-[11px] leading-none">---</span>
                                        </div>
                                        <span
                                            className="text-[10px] font-medium leading-tight"
                                            style={{ color: STATUS_CONFIG[emp.status]?.color || '#d1d5db' }}
                                        >
                                            {STATUS_CONFIG[emp.status]?.label || 'Chưa chấm công'}
                                        </span>
                                    </div>
                                ) : null}
                            </td>
                        );
                    })}
                </tr>
            ))}
        </>
    );
}

