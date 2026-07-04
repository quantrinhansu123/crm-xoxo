import React, { useState, useEffect, useCallback } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import api from '@/lib/api';

// ── Types ──────────────────────────────────────────────
interface Shift {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    color?: string;
    status?: string;
}

interface WorkScheduleEntry {
    id: string;
    user_id: string;
    shift_id: string;
    schedule_date: string; // YYYY-MM-DD
    shift?: Shift;
}

interface Props {
    employeeId: string;
}

// ── Helpers ────────────────────────────────────────────
function getMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(date: Date, n: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function fmt(date: Date): string {
    return date.toISOString().split('T')[0];
}

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

function getWeekLabel(monday: Date): string {
    const month = monday.getMonth() + 1;
    const year = monday.getFullYear();
    // Tính số tuần trong tháng (tuần chứa ngày thứ Hai)
    const firstOfMonth = new Date(year, monday.getMonth(), 1);
    const firstMonday = getMonday(firstOfMonth);
    const weekNum = Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1;
    return `Tuần ${weekNum} · Th. ${month} ${year}`;
}

function isToday(date: Date): boolean {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
}

// ── Component ──────────────────────────────────────────
export function EmployeeScheduleTab({ employeeId }: Props) {
    const [monday, setMonday] = useState(() => getMonday(new Date()));
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [schedules, setSchedules] = useState<WorkScheduleEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Local toggle state: Map<"shiftId|dateStr", boolean>
    const [toggles, setToggles] = useState<Record<string, boolean>>({});
    const [dirty, setDirty] = useState(false);

    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

    // ── Fetch shifts ──
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/work-schedules/shifts?status=active');
                setShifts(res.data?.data?.shifts || []);
            } catch {
                console.error('Failed to load shifts');
            }
        })();
    }, []);

    // ── Fetch schedules for the week ──
    const fetchSchedules = useCallback(async () => {
        setLoading(true);
        try {
            const start = fmt(monday);
            const end = fmt(addDays(monday, 6));
            const res = await api.get(`/work-schedules?start_date=${start}&end_date=${end}&user_id=${employeeId}`);
            const data: WorkScheduleEntry[] = res.data?.data?.schedules || [];
            setSchedules(data);

            // Build toggles from server data
            const t: Record<string, boolean> = {};
            data.forEach(s => {
                t[`${s.shift_id}|${s.schedule_date}`] = true;
            });
            setToggles(t);
            setDirty(false);
        } catch {
            toast.error('Lỗi khi tải lịch làm việc');
        } finally {
            setLoading(false);
        }
    }, [monday, employeeId]);

    useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

    // ── Toggle a cell ──
    const toggle = (shiftId: string, dateStr: string) => {
        const key = `${shiftId}|${dateStr}`;
        setToggles(prev => ({ ...prev, [key]: !prev[key] }));
        setDirty(true);
    };

    // ── Save ──
    const handleSave = async () => {
        setSaving(true);
        try {
            // Determine adds and removes by comparing toggles vs original schedules
            const originalKeys = new Set(schedules.map(s => `${s.shift_id}|${s.schedule_date}`));
            const newKeys = new Set(Object.entries(toggles).filter(([, v]) => v).map(([k]) => k));

            // Keys to add
            const toAdd = [...newKeys].filter(k => !originalKeys.has(k));
            // Keys to remove
            const toRemove = [...originalKeys].filter(k => !newKeys.has(k));

            // Remove entries
            for (const key of toRemove) {
                const [shift_id, schedule_date] = key.split('|');
                await api.post('/work-schedules/bulk-delete', {
                    user_id: employeeId,
                    shift_id,
                    schedule_date,
                });
            }

            // Add entries
            for (const key of toAdd) {
                const [shift_id, schedule_date] = key.split('|');
                await api.post('/work-schedules', {
                    user_id: employeeId,
                    shift_ids: [shift_id],
                    schedule_date,
                });
            }

            toast.success('Đã cập nhật lịch làm việc!');
            await fetchSchedules();
        } catch {
            toast.error('Lỗi khi lưu lịch làm việc');
        } finally {
            setSaving(false);
        }
    };

    // ── Navigation ──
    const goThisWeek = () => setMonday(getMonday(new Date()));
    const goPrev = () => setMonday(prev => addDays(prev, -7));
    const goNext = () => setMonday(prev => addDays(prev, 7));

    return (
        <div className="p-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-gray-600 border border-gray-200 rounded px-3 py-1.5 bg-white">
                        Xem theo bảng
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-[13px] font-semibold text-gray-800 px-2 select-none min-w-[160px] text-center">
                        {getWeekLabel(monday)}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-[12px] h-7 ml-1" onClick={goThisWeek}>
                        Tuần này
                    </Button>
                </div>
            </div>

            {/* Schedule Table */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
            ) : (() => {
                // Chỉ hiển thị ca mà nhân viên được phân trong tuần này
                const assignedShiftIds = new Set(schedules.map(s => s.shift_id));
                const visibleShifts = shifts.filter(s => assignedShiftIds.has(s.id));

                if (visibleShifts.length === 0) {
                    return (
                        <div className="text-center py-10 text-gray-400 text-[13px]">
                            Nhân viên chưa được phân ca trong tuần này.
                        </div>
                    );
                }

                return (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-[160px] border-r border-gray-100">Ca</th>
                                    {weekDates.map((d, i) => {
                                        const dayNum = d.getDate();
                                        const today = isToday(d);
                                        return (
                                            <th key={i} className="text-center px-2 py-2.5 font-medium text-gray-600 border-r border-gray-100 last:border-r-0">
                                                <span className="text-gray-800 font-semibold">{DAY_LABELS[i]}</span>
                                                {' '}
                                                {today ? (
                                                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-[12px] font-bold">
                                                        {dayNum}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">{dayNum}</span>
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {visibleShifts.map(shift => (
                                    <tr key={shift.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50">
                                        <td className="px-4 py-3 border-r border-gray-100">
                                            <div className="font-semibold text-gray-800">{shift.name}</div>
                                            <div className="text-[11px] text-gray-400">{shift.start_time} – {shift.end_time}</div>
                                        </td>
                                        {weekDates.map((d, i) => {
                                            const dateStr = fmt(d);
                                            const key = `${shift.id}|${dateStr}`;
                                            const active = !!toggles[key];
                                            return (
                                                <td
                                                    key={i}
                                                    className="text-center px-2 py-3 border-r border-gray-100 last:border-r-0 cursor-pointer transition-colors hover:bg-blue-50/40"
                                                    onClick={() => toggle(shift.id, dateStr)}
                                                >
                                                    {active && (
                                                        <Check className="h-5 w-5 text-blue-500 mx-auto" strokeWidth={2.5} />
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })()}

            {/* Footer */}
            <div className="mt-4 flex justify-end">
                <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] h-9 px-5 flex items-center gap-1.5"
                    disabled={!dirty || saving}
                    onClick={handleSave}
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Cập nhật
                </Button>
            </div>
        </div>
    );
}
