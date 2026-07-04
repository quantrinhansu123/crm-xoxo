import { useMemo } from 'react';
import {
    Bell,
    Calendar,
    LocateFixed,
    Clock3,
    ArrowRightLeft,
    Loader2,
    MapPin,
    RefreshCw,
    AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileAttendance } from '@/hooks/useMobileAttendance';
import { getClientOfficeGeofence } from '@/lib/attendanceConfig';
import { GeoLocationError } from '@/lib/geolocation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TZ = 'Asia/Ho_Chi_Minh';

function formatCheckInTime(iso: string | null | undefined): string {
    if (!iso) return '--:--';
    return new Intl.DateTimeFormat('vi-VN', {
        timeZone: TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(iso));
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(-2)
        .map((p) => p[0])
        .join('')
        .toUpperCase();
}

function buildWeekCells(reference = new Date()) {
    const day = reference.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(reference);
    monday.setDate(reference.getDate() + mondayOffset);

    const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    return labels.map((label, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateNum = new Intl.DateTimeFormat('en', { timeZone: TZ, day: 'numeric' }).format(d);
        const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
        const isToday =
            iso === new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(reference);
        return { label, dateNum: Number(dateNum), iso, isToday };
    });
}

export function AttendanceMobilePage() {
    const { user } = useAuth();
    const office = getClientOfficeGeofence();
    const { today, loading, punching, location, refreshLocation, punch, fetchToday } =
        useMobileAttendance();

    const weekCells = useMemo(() => buildWeekCells(), []);
    const timesheet = today?.timesheet;
    const hasCheckIn = Boolean(timesheet?.check_in);
    const hasCheckOut = Boolean(timesheet?.check_out);

    const statusLabel = hasCheckOut
        ? 'Đã check-out'
        : hasCheckIn
            ? 'Đã check-in'
            : 'Chưa chấm công';

    const statusClass = hasCheckOut
        ? 'bg-slate-100 text-slate-700'
        : hasCheckIn
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-amber-100 text-amber-800';

    const statusDot = hasCheckOut
        ? 'bg-slate-500'
        : hasCheckIn
            ? 'bg-emerald-700'
            : 'bg-amber-600';

    const handlePunch = async (action: 'check_in' | 'check_out') => {
        try {
            await punch(action);
            toast.success(action === 'check_in' ? 'Check-in thành công' : 'Check-out thành công');
            await refreshLocation();
        } catch (err: unknown) {
            const ax = err as { response?: { data?: { message?: string } } };
            const msg =
                ax.response?.data?.message ??
                (err instanceof GeoLocationError ? err.message : 'Không thể chấm công');
            toast.error(msg);
        }
    };

    const locationTitle =
        location.address?.split(',')[0]?.trim() ||
        (location.withinGeofence ? office.name : 'Vị trí GPS');
    const locationSubtitle =
        location.address ||
        (location.latitude
            ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
            : office.address);

    return (
        <div className="min-h-[calc(100vh-4rem)] sm:min-h-[calc(100vh-8rem)] bg-[#f4f5f6] sm:bg-slate-100 sm:p-6">
            <div className="w-full min-h-[calc(100vh-4rem)] sm:min-h-0 sm:max-w-[390px] sm:mx-auto sm:rounded-[34px] bg-[#f4f5f6] sm:shadow-[0_20px_50px_rgba(2,6,23,0.18)] overflow-hidden sm:border sm:border-white">
                <div className="px-5 pt-4 pb-10 bg-[#003e36] text-white rounded-b-[36px]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-11 w-11 border border-white/30">
                                <AvatarImage src={user?.avatar} alt={user?.name} />
                                <AvatarFallback>{user?.name ? initials(user.name) : '?'}</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="text-sm text-emerald-100/90">Xin chào,</p>
                                <p className="text-[30px] leading-[1.1] font-semibold">{user?.name ?? '—'}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="h-10 w-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center"
                            aria-label="Thông báo"
                        >
                            <Bell className="h-5 w-5 text-emerald-100" />
                        </button>
                    </div>
                </div>

                <div className="px-4 -mt-7 space-y-3 pb-4">
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                <span>Trạng thái hôm nay</span>
                                <button
                                    type="button"
                                    onClick={() => fetchToday()}
                                    className="text-slate-400 hover:text-slate-600"
                                    aria-label="Làm mới"
                                >
                                    <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                                </button>
                            </div>
                            <div className="mt-6 text-center">
                                {loading ? (
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-400" />
                                ) : (
                                    <>
                                        <span
                                            className={cn(
                                                'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                                                statusClass,
                                            )}
                                        >
                                            <span className={cn('mr-1.5 h-2 w-2 rounded-full', statusDot)} />
                                            {statusLabel}
                                        </span>
                                        <p className="mt-3 text-[48px] leading-none font-bold text-slate-900">
                                            {formatCheckInTime(timesheet?.check_in)}
                                        </p>
                                        <p className="mt-2 text-slate-500">{today?.date_label ?? '—'}</p>
                                        {today?.shift && (
                                            <p className="mt-1 text-xs text-slate-400">
                                                Ca {today.shift.name} ({today.shift.start_time}–{today.shift.end_time})
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="mt-6 grid grid-cols-2 gap-2">
                                <Button
                                    className="h-12 rounded-xl bg-[#003e36] hover:bg-[#00352f]"
                                    disabled={punching || loading || !today?.can_check_in}
                                    onClick={() => handlePunch('check_in')}
                                >
                                    {punching ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                                    )}
                                    CHECK IN
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-12 rounded-xl border-amber-800 text-amber-800 hover:bg-amber-50"
                                    disabled={punching || loading || !today?.can_check_out}
                                    onClick={() => handlePunch('check_out')}
                                >
                                    {punching ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <ArrowRightLeft className="h-4 w-4 mr-2" />
                                    )}
                                    CHECK-OUT
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex gap-3 min-w-0">
                                    <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center">
                                        {location.loading ? (
                                            <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                                        ) : location.error ? (
                                            <AlertCircle className="h-5 w-5 text-amber-600" />
                                        ) : (
                                            <LocateFixed
                                                className={cn(
                                                    'h-5 w-5',
                                                    location.withinGeofence ? 'text-emerald-600' : 'text-amber-600',
                                                )}
                                            />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                            Vị trí hiện tại
                                        </p>
                                        {location.loading ? (
                                            <p className="text-sm text-slate-500 mt-1">Đang lấy GPS…</p>
                                        ) : location.error ? (
                                            <>
                                                <p className="text-sm font-medium text-amber-800 mt-1">{location.error}</p>
                                                <Button
                                                    variant="link"
                                                    className="h-auto p-0 text-xs text-[#003e36]"
                                                    onClick={() => refreshLocation()}
                                                >
                                                    Thử lại
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-lg leading-[1.2] font-semibold text-slate-900 truncate">
                                                    {locationTitle}
                                                </p>
                                                <p className="text-sm text-slate-500 line-clamp-2">{locationSubtitle}</p>
                                                {location.accuracyM > 0 && (
                                                    <p className="text-[11px] text-slate-400 mt-1">
                                                        Độ chính xác ~{Math.round(location.accuracyM)}m
                                                        {location.withinGeofence ? ' · Trong phạm vi' : ' · Ngoài phạm vi'}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                                        GPS
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => refreshLocation()}
                                        className="text-slate-400 hover:text-slate-600"
                                        aria-label="Cập nhật vị trí"
                                    >
                                        <RefreshCw className={cn('h-3.5 w-3.5', location.loading && 'animate-spin')} />
                                    </button>
                                </div>
                            </div>
                            {!location.loading && !location.error && !location.withinGeofence && (
                                <p className="mt-3 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 flex gap-2">
                                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                                    Bạn đang cách {office.name} hơn {office.radiusM}m. Check-in có thể bị từ chối.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-3">
                        <Card className="border-0 shadow-sm">
                            <CardContent className="p-4">
                                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                    <Calendar className="h-4 w-4" />
                                    Lịch làm việc
                                </p>
                                <p className="mt-3 text-xs font-semibold text-slate-700">
                                    {today?.schedule_date
                                        ? new Intl.DateTimeFormat('vi-VN', { timeZone: TZ }).format(
                                              new Date(`${today.schedule_date}T12:00:00+07:00`),
                                          )
                                        : '—'}
                                </p>
                                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
                                    {weekCells.map((c) => (
                                        <span key={c.label}>{c.label}</span>
                                    ))}
                                </div>
                                <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs">
                                    {weekCells.map((c) => (
                                        <span
                                            key={c.iso}
                                            className={cn(
                                                'h-6 w-6 mx-auto rounded-full flex items-center justify-center text-slate-500',
                                                c.isToday && 'bg-[#002f2a] text-white font-semibold',
                                            )}
                                        >
                                            {c.dateNum}
                                        </span>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-0 shadow-sm">
                            <CardContent className="p-4">
                                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                    <Clock3 className="h-4 w-4" />
                                    Tổng thời gian
                                </p>
                                <p className="mt-10 text-3xl font-bold text-slate-900">
                                    {today?.worked_duration ?? '—'}
                                </p>
                                <p className="mt-1 text-sm text-slate-500">Hôm nay</p>
                                {timesheet?.check_out && (
                                    <p className="mt-2 text-xs text-slate-400">
                                        Ra: {formatCheckInTime(timesheet.check_out)}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
