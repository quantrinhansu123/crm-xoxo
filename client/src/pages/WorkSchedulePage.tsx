import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    ChevronLeft, ChevronRight, Download, Upload,
    Info, X, Plus, Loader2, Users, Trash2, Check, ChevronsUpDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn, formatNumber } from '@/lib/utils';
import { salaryConfigsApi } from '@/lib/api';
import { useUsers } from '@/hooks/useUsers';
import { useWorkSchedules, type Shift, type WorkSchedule } from '@/hooks/useWorkSchedules';
import { toast } from 'sonner';
import { AddScheduleDialog } from '@/components/work-schedule/AddScheduleDialog';

// ── Constants ──────────────────────────────────────────────────
const DAY_LABELS = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];

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

function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatVNDate(d: Date): string {
    const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return `${dayNames[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ── Employee row data ──────────────────────────────────────────
interface EmployeeRow {
    userId: string;
    name: string;
    employeeCode: string;
    role: string;
    salary: number;
    schedulesByDate: Record<string, WorkSchedule[]>;
}



// ── Main Component ─────────────────────────────────────────────
export function WorkSchedulePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { users, loading: usersLoading, fetchUsers } = useUsers();
    const {
        shifts, schedules, loading: schedulesLoading,
        fetchShifts, fetchSchedules, createSchedule, createShift, deleteSchedule, bulkDeleteSchedule
    } = useWorkSchedules();

    const [currentMonday, setCurrentMonday] = useState(() => getMondayOfWeek(new Date()));
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'employee' | 'shift'>('employee');
    const today = useMemo(() => new Date(), []);
    const initialUserApplied = useRef(false);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogUser, setDialogUser] = useState<{ id: string; name: string } | null>(null);
    const [dialogDate, setDialogDate] = useState<Date | null>(null);

    // Delete confirmation state
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [salaryConfigsByUser, setSalaryConfigsByUser] = useState<Record<string, any>>({});
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    useEffect(() => { fetchUsers(); fetchShifts(); }, []);

    useEffect(() => {
        salaryConfigsApi.getAll()
            .then(res => {
                const configs = res.data?.data?.configs || [];
                setSalaryConfigsByUser(Object.fromEntries(configs.map((config: any) => [config.user_id, config])));
            })
            .catch(() => setSalaryConfigsByUser({}));
    }, []);

    // Pre-select user from URL search params (e.g. ?userId=xxx)
    useEffect(() => {
        if (initialUserApplied.current || users.length === 0) return;
        const userIdParam = searchParams.get('userId');
        if (userIdParam) {
            const exists = users.find(u => u.id === userIdParam && (u.status || 'active') === 'active');
            if (exists) {
                setSelectedUserIds([userIdParam]);
            }
            // Clean up URL param after applying
            searchParams.delete('userId');
            setSearchParams(searchParams, { replace: true });
        }
        initialUserApplied.current = true;
    }, [users, searchParams, setSearchParams]);

    const weekDates = useMemo(() => getWeekDates(currentMonday), [currentMonday]);
    const weekNum = getWeekNumber(currentMonday);
    const monthNum = currentMonday.getMonth() + 1;
    const yearNum = currentMonday.getFullYear();

    useEffect(() => {
        fetchSchedules(toDateStr(weekDates[0]), toDateStr(weekDates[6]));
    }, [currentMonday]);

    // ── Employee view data ─────────────────────────────────────
    const employeeRows: EmployeeRow[] = useMemo(() => {
        const activeUsers = users.filter(u => (u.status || 'active') === 'active');
        const schedulesByUser: Record<string, WorkSchedule[]> = {};
        for (const s of schedules) {
            if (!schedulesByUser[s.user_id]) schedulesByUser[s.user_id] = [];
            schedulesByUser[s.user_id].push(s);
        }
        return activeUsers.map(user => {
            const userSchedules = schedulesByUser[user.id] || [];
            const byDate: Record<string, WorkSchedule[]> = {};
            for (const ws of userSchedules) {
                if (!byDate[ws.schedule_date]) byDate[ws.schedule_date] = [];
                byDate[ws.schedule_date].push(ws);
            }
            return {
                userId: user.id, name: user.name,
                employeeCode: (user as any).employee_code || '',
                role: user.role,
                salary: Number(salaryConfigsByUser[user.id]?.base_amount || (user as any).base_salary || (user as any).baseAmount || (user as any).salary || 0),
                schedulesByDate: byDate,
            };
        });
    }, [users, schedules, salaryConfigsByUser]);

    const filteredRows = useMemo(() => {
        if (selectedUserIds.length === 0) return employeeRows;
        return employeeRows.filter(r => selectedUserIds.includes(r.userId));
    }, [employeeRows, selectedUserIds]);

    const toggleUserSelection = useCallback((userId: string) => {
        setSelectedUserIds(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    }, []);

    const selectAllUsers = useCallback(() => {
        const activeUserIds = users.filter(u => (u.status || 'active') === 'active').map(u => u.id);
        setSelectedUserIds(activeUserIds);
    }, [users]);

    const clearAllUsers = useCallback(() => {
        setSelectedUserIds([]);
    }, []);

    const calcEstimatedSalary = useCallback((row: EmployeeRow) => {
        const totalShifts = Object.values(row.schedulesByDate).reduce((sum, arr) => sum + arr.length, 0);
        if (row.salary > 0 && totalShifts > 0) return Math.round((row.salary / 26) * totalShifts);
        return 0;
    }, []);

    const totalEstimatedSalary = useMemo(
        () => filteredRows.reduce((sum, r) => sum + calcEstimatedSalary(r), 0),
        [filteredRows, calcEstimatedSalary]
    );

    // ── Shift view data ────────────────────────────────────────
    const shiftViewData = useMemo(() => {
        if (viewMode !== 'shift') return [];
        const groupMap: Record<string, { shift: any; byDate: Record<string, WorkSchedule[]> }> = {};
        for (const ws of schedules) {
            const sid = ws.shift_id;
            if (!groupMap[sid]) groupMap[sid] = { shift: ws.shift, byDate: {} };
            const dateStr = ws.schedule_date;
            if (!groupMap[sid].byDate[dateStr]) groupMap[sid].byDate[dateStr] = [];
            groupMap[sid].byDate[dateStr].push(ws);
        }
        return Object.entries(groupMap).map(([shiftId, { shift, byDate }]) => ({
            shiftId,
            shiftName: shift?.name || 'CA',
            shiftTime: `${shift?.start_time?.slice(0, 5) || '00:00'} - ${shift?.end_time?.slice(0, 5) || '00:00'}`,
            shiftColor: shift?.color || 'blue',
            byDate,
        }));
    }, [schedules, viewMode]);

    // ── Navigation ─────────────────────────────────────────────
    const goToPrevWeek = () => { const prev = new Date(currentMonday); prev.setDate(prev.getDate() - 7); setCurrentMonday(prev); };
    const goToNextWeek = () => { const next = new Date(currentMonday); next.setDate(next.getDate() + 7); setCurrentMonday(next); };
    const goToCurrentWeek = () => setCurrentMonday(getMondayOfWeek(new Date()));

    // Existing state for editing
    const [dialogShiftIds, setDialogShiftIds] = useState<string[]>([]);
    const [dialogRepeatWeekly, setDialogRepeatWeekly] = useState(false);
    const [dialogWorkOnHolidays, setDialogWorkOnHolidays] = useState(false);
    const [dialogRepeatDays, setDialogRepeatDays] = useState<number[]>([]);
    const [dialogEndDate, setDialogEndDate] = useState<string>('');
 
    const handleCellClick = (userId: string, userName: string, date: Date, existingSchedules: WorkSchedule[]) => {
        setDialogUser({ id: userId, name: userName });
        setDialogDate(date);
        setDialogShiftIds(existingSchedules.map(s => s.shift_id));
        
        const first = existingSchedules[0];
        setDialogRepeatWeekly(first ? first.repeat_weekly : false);
        setDialogWorkOnHolidays(first ? first.work_on_holidays : false);
        setDialogRepeatDays(first?.repeat_days || []);
        setDialogEndDate(first?.end_date || '');
        
        setDialogOpen(true);
    };

    const handleDeleteSchedule = (e: React.MouseEvent, scheduleId: string) => {
        e.stopPropagation();
        setPendingDeleteId(scheduleId);
        setDeleteConfirmOpen(true);
    };

    const handleDeleteMultiple = async (type: 'single' | 'future' | 'all') => {
        if (!dialogUser || !dialogDate) return;
        
        try {
            await bulkDeleteSchedule({
                user_id: dialogUser.id,
                schedule_date: toDateStr(dialogDate),
                type: type
            });
            toast.success('Đã xóa ca làm việc');
            await fetchSchedules(toDateStr(weekDates[0]), toDateStr(weekDates[6]));
            setDialogOpen(false);
        } catch {
            toast.error('Lỗi khi xóa ca');
        }
    };

    const confirmDelete = async () => {
        if (!pendingDeleteId) return;
        try {
            await deleteSchedule(pendingDeleteId);
            toast.success('Đã xóa ca làm việc');
            await fetchSchedules(toDateStr(weekDates[0]), toDateStr(weekDates[6]));
        } catch { toast.error('Lỗi khi xóa ca'); }
        finally { setDeleteConfirmOpen(false); setPendingDeleteId(null); }
    };

    const handleSaveSchedule = async (data: { user_id: string; shift_ids: string[]; schedule_date: string; repeat_weekly: boolean; repeat_days: number[]; end_date?: string; work_on_holidays: boolean; apply_to_users: string[] }) => {
        await createSchedule(data);
        await fetchSchedules(toDateStr(weekDates[0]), toDateStr(weekDates[6]));
    };

    const handleCreateShift = async (data: { name: string; start_time: string; end_time: string; color: string }) => {
        await createShift(data);
        await fetchShifts();
    };

    const loading = usersLoading || schedulesLoading;
    if (loading && users.length === 0) {
        return (<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);
    }

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* ── Top bar ─────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 border-b border-gray-100 bg-[#fbfcfd] gap-3 flex-shrink-0">
                <div className="flex items-center gap-4 flex-wrap">
                    <h1 className="text-[15px] font-bold text-gray-900 whitespace-nowrap">Lịch làm việc</h1>

                    <Popover open={employeePopoverOpen} onOpenChange={setEmployeePopoverOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={employeePopoverOpen}
                                className="h-[34px] min-w-[200px] max-w-[350px] border-gray-200 text-[13px] bg-white rounded-lg shadow-sm justify-between hover:bg-gray-50"
                            >
                                <span className="flex items-center gap-1.5 truncate">
                                    <Users className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                    {selectedUserIds.length === 0
                                        ? <span className="text-gray-400">Chọn nhân viên...</span>
                                        : <span className="text-gray-700">{selectedUserIds.length} nhân viên</span>
                                    }
                                </span>
                                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-gray-400" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Tìm nhân viên..." />
                                <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-100">
                                    <button onClick={selectAllUsers} className="text-[12px] text-blue-600 hover:text-blue-700 font-medium">Chọn tất cả</button>
                                    <button onClick={clearAllUsers} className="text-[12px] text-gray-400 hover:text-gray-600 font-medium">Bỏ chọn tất cả</button>
                                </div>
                                <CommandList>
                                    <CommandEmpty>Không tìm thấy nhân viên.</CommandEmpty>
                                    <CommandGroup>
                                        {users.filter(u => (u.status || 'active') === 'active').map(user => {
                                            const isSelected = selectedUserIds.includes(user.id);
                                            return (
                                                <CommandItem
                                                    key={user.id}
                                                    value={user.name}
                                                    onSelect={() => toggleUserSelection(user.id)}
                                                    className="cursor-pointer"
                                                >
                                                    <div className={cn(
                                                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                        isSelected ? "bg-primary text-white" : "opacity-50"
                                                    )}>
                                                        {isSelected && <Check className="h-3 w-3" />}
                                                    </div>
                                                    <span className="text-[13px]">{user.name}</span>
                                                </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>

                    {selectedUserIds.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                            {selectedUserIds.slice(0, 3).map(id => {
                                const user = users.find(u => u.id === id);
                                return user ? (
                                    <Badge key={id} variant="secondary" className="h-[26px] text-[11px] font-medium gap-1 px-2 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
                                        {user.name}
                                        <button onClick={() => toggleUserSelection(id)} className="ml-0.5 hover:text-blue-900">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ) : null;
                            })}
                            {selectedUserIds.length > 3 && (
                                <Badge variant="secondary" className="h-[26px] text-[11px] font-medium px-2 bg-gray-100 text-gray-600">
                                    +{selectedUserIds.length - 3}
                                </Badge>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={goToPrevWeek}><ChevronLeft className="h-4 w-4" /></Button>
                        <span className="text-[13px] font-medium text-gray-700 whitespace-nowrap select-none">Tuần {weekNum} - Th. {monthNum} {yearNum}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={goToNextWeek}><ChevronRight className="h-4 w-4" /></Button>
                        <Button variant="outline" className="h-[30px] px-3 text-[12px] font-medium border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 ml-1" onClick={goToCurrentWeek}>Tuần này</Button>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'employee' | 'shift')}>
                        <SelectTrigger className="h-[34px] w-[220px] text-[13px] border-gray-200 bg-white shadow-sm rounded-lg">
                            <div className="flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5 text-gray-500" />
                                <SelectValue />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="employee">Xem theo nhân viên</SelectItem>
                            <SelectItem value="shift">Xem theo ca</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" className="h-[34px] px-3 text-[12px] font-medium border-gray-200 text-gray-600 rounded-lg shadow-sm hover:bg-gray-50 gap-1.5"><Upload className="h-3.5 w-3.5" />Import</Button>
                    <Button variant="outline" className="h-[34px] px-3 text-[12px] font-medium border-gray-200 text-gray-600 rounded-lg shadow-sm hover:bg-gray-50 gap-1.5"><Download className="h-3.5 w-3.5" />Xuất file</Button>
                </div>
            </div>

            {/* ── Table ────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-left min-w-[1100px]">
                    <thead className="bg-[#f2f6ff] sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-700 border-b border-gray-200 w-[200px] sticky left-0 bg-[#f2f6ff] z-20">
                                {viewMode === 'employee' ? 'Nhân viên' : 'Ca làm việc'}
                            </th>
                            {weekDates.map((d, i) => {
                                const isToday = isSameDay(d, today);
                                return (
                                    <th key={i} className={cn("px-2 py-3 text-center border-b border-gray-200 min-w-[120px]", isToday && "bg-blue-50/60")}>
                                        <div className="flex items-center justify-center gap-1.5">
                                            <span className={cn("text-[12px] font-semibold", isToday ? "text-blue-600" : "text-gray-600")}>{DAY_LABELS[i]}</span>
                                            <span className={cn("inline-flex items-center justify-center font-bold text-[12px] min-w-[22px] h-[22px] rounded-full", isToday ? "bg-blue-600 text-white" : "text-gray-500")}>{d.getDate()}</span>
                                        </div>
                                    </th>
                                );
                            })}
                            {viewMode === 'employee' && (
                                <th className="px-4 py-3 text-right border-b border-gray-200 w-[130px] sticky right-0 bg-[#f2f6ff] z-20">
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="text-[12px] font-bold text-gray-700">Lương dự kiến</span>
                                        <Info className="h-3.5 w-3.5 text-gray-400" />
                                    </div>
                                </th>
                            )}
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                        {viewMode === 'employee' ? (
                            <>
                                {/* Total row */}
                                <tr className="bg-gray-50/60">
                                    <td className="px-4 py-2.5 sticky left-0 bg-gray-50/60 z-[5]" />
                                    {weekDates.map((_, i) => (<td key={i} className="px-2 py-2.5 text-center" />))}
                                    <td className="px-4 py-2.5 text-right sticky right-0 bg-gray-50/60 z-[5]">
                                        <span className="text-[13px] font-bold text-blue-700">{formatNumber(totalEstimatedSalary)}</span>
                                    </td>
                                </tr>

                                {/* Employee rows */}
                                {filteredRows.map((row) => {
                                    const salary = calcEstimatedSalary(row);
                                    const totalShifts = Object.values(row.schedulesByDate).reduce((sum, arr) => sum + arr.length, 0);
                                    return (
                                        <tr key={row.userId} className="hover:bg-blue-50/20 transition-colors group">
                                            <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-blue-50/20 z-[5] border-r border-gray-100">
                                                <div>
                                                    <p className="text-[13px] font-bold text-gray-800 uppercase leading-tight">{row.name}</p>
                                                    <p className="text-[11px] text-blue-600 font-medium mt-0.5">{row.employeeCode}</p>
                                                </div>
                                            </td>
                                            {weekDates.map((d, i) => {
                                                const key = toDateStr(d);
                                                const cellSchedules = row.schedulesByDate[key] || [];
                                                const isToday = isSameDay(d, today);
                                                return (
                                                    <td key={i} className={cn("px-1.5 py-3 text-center border-r border-gray-50 align-top cursor-pointer group/cell transition-colors", isToday && "bg-blue-50/30", !isToday && "hover:bg-blue-50/50")} onClick={() => handleCellClick(row.userId, row.name, d, [])}>
                                                        {cellSchedules.length > 0 ? (
                                                            <div className="flex flex-col gap-1 items-center min-h-[40px]">
                                                                {cellSchedules.map(ws => {
                                                                    const colors = getShiftColor(ws.shift?.color || 'blue');
                                                                    return (
                                                                        <div key={ws.id} onClick={(e) => { e.stopPropagation(); handleCellClick(row.userId, row.name, d, [ws]); }} className={cn("relative flex items-center justify-center w-full px-2 py-1.5 rounded-md text-[11px] font-bold border transition-all cursor-pointer hover:shadow-sm group/badge", colors.bg, colors.border, colors.text)}>
                                                                            <span className="truncate">{ws.shift?.name || 'CA'}</span>
                                                                            <button onClick={(e) => handleDeleteSchedule(e, ws.id)} className="absolute -right-1.5 -top-1.5 opacity-0 group-hover/badge:opacity-100 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shrink-0 z-10 shadow-sm" title="Xóa ca này">
                                                                                <X className="h-2.5 w-2.5" />
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                                <button onClick={(e) => { e.stopPropagation(); handleCellClick(row.userId, row.name, d, []); }} className="flex items-center justify-center gap-1 w-full py-1 mt-1 rounded text-[11px] font-medium text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover/cell:opacity-100">
                                                                    <Plus className="h-3 w-3" /> Thêm lịch
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-center h-full min-h-[40px]">
                                                                <span className="text-gray-200 text-lg leading-none">+</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-4 py-3 text-right sticky right-0 bg-white group-hover:bg-blue-50/20 z-[5]">
                                                <p className="text-[13px] font-bold text-green-700">{formatNumber(salary)}</p>
                                                <p className="text-[11px] text-gray-400 mt-0.5">{totalShifts} ca</p>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {filteredRows.length === 0 && (
                                    <tr><td colSpan={9} className="px-4 py-12 text-center text-[13px] text-gray-400">Không tìm thấy nhân viên nào</td></tr>
                                )}
                            </>
                        ) : (
                            /* ── SHIFT VIEW ─────────────────────────────── */
                            <>
                                {shiftViewData.map((group) => {
                                    const maxEmployeesPerDay = weekDates.map(d => (group.byDate[toDateStr(d)] || []).length);
                                    const maxRows = Math.max(1, ...maxEmployeesPerDay);
                                    const colors = getShiftColor(group.shiftColor);

                                    return Array.from({ length: maxRows }, (_, rowIdx) => (
                                        <tr key={`${group.shiftId}-${rowIdx}`} className={cn("transition-colors", rowIdx === 0 && "border-t-2 border-gray-200")}>
                                            {rowIdx === 0 && (
                                                <td className="px-4 py-2 sticky left-0 bg-white z-[5] border-r border-gray-100 align-top" rowSpan={maxRows}>
                                                    <p className={cn("text-[13px] font-bold uppercase", colors.text)}>{group.shiftName}</p>
                                                    <p className="text-[11px] text-gray-400 mt-0.5">{group.shiftTime}</p>
                                                </td>
                                            )}
                                            {weekDates.map((d, dayIdx) => {
                                                const daySchedules = group.byDate[toDateStr(d)] || [];
                                                const ws = daySchedules[rowIdx];
                                                const isToday = isSameDay(d, today);
                                                return (
                                                    <td key={dayIdx} className={cn("px-2 py-1.5 border-r border-gray-50", isToday && "bg-blue-50/30")}>
                                                        {ws ? (
                                                            <span className="text-[12px] font-semibold text-blue-800 uppercase">{ws.user?.name || ''}</span>
                                                        ) : null}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ));
                                })}

                                {shiftViewData.length === 0 && (
                                    <tr><td colSpan={8} className="px-4 py-12 text-center text-[13px] text-gray-400">Chưa có lịch làm việc nào trong tuần này</td></tr>
                                )}
                            </>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Add Schedule Dialog ──────────────────────────── */}
            <AddScheduleDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                selectedUser={dialogUser}
                selectedDate={dialogDate}
                shifts={shifts}
                allUsers={users.filter(u => (u.status || 'active') === 'active').map(u => ({ id: u.id, name: u.name }))}
                initialSelectedShiftIds={dialogShiftIds}
                initialRepeatWeekly={dialogRepeatWeekly}
                initialWorkOnHolidays={dialogWorkOnHolidays}
                initialRepeatDays={dialogRepeatDays}
                initialEndDate={dialogEndDate}
                onSave={handleSaveSchedule}
                onDelete={handleDeleteMultiple}
                onCreateShift={handleCreateShift}
            />

            {/* ── Delete Confirmation Dialog ──────────────────── */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="max-w-[380px]">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">Xóa ca làm việc?</DialogTitle>
                        <DialogDescription className="text-[13px] text-gray-500">
                            Bạn có chắc muốn xóa ca làm việc này? Hành động này không thể hoàn tác.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" className="h-[34px] text-[13px]" onClick={() => setDeleteConfirmOpen(false)}>Hủy</Button>
                        <Button onClick={confirmDelete} className="h-[34px] text-[13px] bg-red-600 hover:bg-red-700 text-white">Xóa</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

