import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { WorkSchedule } from '@/hooks/useWorkSchedules';

interface MobileWorkScheduleCardProps {
    employee: {
        id: string;
        name: string;
        employee_code?: string;
        avatar?: string;
    };
    schedules: WorkSchedule[];
    weekDates: Date[];
    onEdit?: (schedule: WorkSchedule) => void;
    onDelete?: (scheduleId: string) => void;
}

const SHIFT_COLORS: Record<string, { bg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-700' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-700' },
};

const VN_DAY_ABBR = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function getShiftColor(colorKey: string) {
    return SHIFT_COLORS[colorKey] || SHIFT_COLORS.blue;
}

function formatTimeRange(startTime: string, endTime: string): string {
    return `${startTime} - ${endTime}`;
}

export function MobileWorkScheduleCard({
    employee,
    schedules,
    weekDates,
    onEdit,
    onDelete,
}: MobileWorkScheduleCardProps) {
    return (
        <Card className="overflow-hidden">
            <CardHeader className="p-3 pb-2">
                <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                        {employee.avatar && <AvatarImage src={employee.avatar} alt={employee.name} />}
                        <AvatarFallback className="text-xs">{employee.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm truncate">{employee.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{employee.employee_code}</p>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-3 pt-0">
                {/* Week days grid */}
                <div className="grid grid-cols-7 gap-1">
                    {weekDates.map((date, idx) => {
                        const dayAbbr = VN_DAY_ABBR[date.getDay()];
                        const dayNum = date.getDate();
                        const daySchedules = schedules.filter((s) => {
                            const sDate = new Date(s.schedule_date);
                            return (
                                sDate.getFullYear() === date.getFullYear() &&
                                sDate.getMonth() === date.getMonth() &&
                                sDate.getDate() === date.getDate()
                            );
                        });

                        const schedule = daySchedules[0];
                        const shiftColor = schedule ? getShiftColor(schedule.shift?.color || 'blue') : null;

                        return (
                            <button
                                key={idx}
                                onClick={() => schedule && onEdit?.(schedule)}
                                className={`p-1.5 rounded text-xs text-center transition-all ${
                                    schedule
                                        ? `${shiftColor?.bg} ${shiftColor?.text} font-medium cursor-pointer hover:shadow-sm`
                                        : 'text-muted-foreground hover:bg-muted'
                                }`}
                            >
                                <div className="font-bold text-[10px]">{dayAbbr}</div>
                                <div className="text-[10px] leading-tight">{dayNum}</div>
                                {schedule && (
                                    <div className="text-[9px] truncate mt-0.5">
                                        {schedule.shift?.name?.substring(0, 2) || 'Ca'}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Schedule details if available */}
                {schedules.length > 0 && (
                    <div className="mt-3 space-y-1 border-t pt-2">
                        {schedules.slice(0, 3).map((schedule) => (
                            <div key={schedule.id} className="text-xs">
                                <Badge variant="outline" className="text-[10px]">
                                    {new Date(schedule.schedule_date).toLocaleDateString('vi-VN', {
                                        day: '2-digit',
                                        month: '2-digit'
                                    })}: {schedule.shift?.name || 'Ca không tên'} ({formatTimeRange(
                                        schedule.shift?.start_time || '',
                                        schedule.shift?.end_time || ''
                                    )})
                                </Badge>
                            </div>
                        ))}
                        {schedules.length > 3 && (
                            <p className="text-[10px] text-muted-foreground">
                                +{schedules.length - 3} ca khác
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
