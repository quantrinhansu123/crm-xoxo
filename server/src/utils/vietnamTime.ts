const TZ = 'Asia/Ho_Chi_Minh';

export function vietnamDateString(date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

export function vietnamTimeLabel(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('vi-VN', {
        timeZone: TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(d);
}

export function vietnamDateTimeLabel(date = new Date()): string {
    return new Intl.DateTimeFormat('vi-VN', {
        timeZone: TZ,
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
}

/** shift.start_time is "HH:mm" or "HH:mm:ss" */
export function shiftStartIso(scheduleDate: string, startTime: string): Date {
    const [h, m] = startTime.split(':').map(Number);
    const hh = String(h).padStart(2, '0');
    const mm = String(m ?? 0).padStart(2, '0');
    return new Date(`${scheduleDate}T${hh}:${mm}:00+07:00`);
}

export function deriveCheckInStatus(checkIn: Date, shiftStart: Date, graceMinutes = 5): string {
    const graceMs = graceMinutes * 60 * 1000;
    if (checkIn.getTime() > shiftStart.getTime() + graceMs) return 'late_early';
    return 'on_time';
}

export function workedMinutes(checkIn: string | null, checkOut: string | null): number | null {
    if (!checkIn || !checkOut) return null;
    const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    if (ms <= 0) return null;
    return Math.floor(ms / 60000);
}

export function formatWorkedDuration(minutes: number | null): string {
    if (minutes == null || minutes < 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}
