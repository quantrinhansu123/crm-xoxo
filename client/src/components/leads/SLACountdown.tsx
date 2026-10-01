import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LeadSla = {
    deadline_at?: string | null;
} | null;

interface SLACountdownProps {
    lead: {
        sla?: LeadSla;
        current_deadline_at?: string | null;
        appointment_time?: string | null;
        appointment_scheduled_at?: string | null;
        kanban_column?: string | null;
        last_actor?: string | null;
        sla_status?: string | null;
    };
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    /** Chi tiết lead: hiện "Đã phản hồi" khi không còn deadline. Thẻ Kanban giữ nguyên, không thêm nhãn. */
    showResponded?: boolean;
}

const TEN_MINUTES = 10 * 60;
const FIVE_MINUTES = 5 * 60;

function remainingSeconds(deadlineAt: string, now: Date): number | null {
    const deadline = new Date(deadlineAt);
    if (Number.isNaN(deadline.getTime())) return null;
    return Math.floor((deadline.getTime() - now.getTime()) / 1000);
}

function formatRemaining(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remMinutes = minutes % 60;
        return `${hours}h${String(remMinutes).padStart(2, '0')}p`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function deadlineAtOf(lead: SLACountdownProps['lead']): string {
    return lead.sla?.deadline_at || lead.current_deadline_at || '';
}

function isFutureAppointment(lead: SLACountdownProps['lead']): boolean {
    if (lead.kanban_column === 'APPOINTMENT_SHOP' || lead.kanban_column === 'APPOINTMENT_SHIP') {
        return true;
    }
    const raw = lead.appointment_time || lead.appointment_scheduled_at;
    if (!raw) return false;
    const time = new Date(raw).getTime();
    return !Number.isNaN(time) && time > Date.now();
}

function hasCustomerResponded(lead: SLACountdownProps['lead']): boolean {
    if (lead.sla_status === 'COMPLETED') return true;
    return lead.last_actor === 'lead';
}

export function SLACountdown({ lead, size = 'md', className, showResponded = false }: SLACountdownProps) {
    const [now, setNow] = useState(() => new Date());
    const deadlineAt = deadlineAtOf(lead);
    const futureAppointment = isFutureAppointment(lead);
    const activeDeadline = !futureAppointment && !!deadlineAt && remainingSeconds(deadlineAt, now) != null;

    useEffect(() => {
        if (!activeDeadline) return;
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, [activeDeadline, deadlineAt]);

    const sizeClasses = {
        sm: 'px-1.5 py-0.5 text-[9px] gap-1',
        md: 'px-2 py-1 text-xs gap-1.5',
        lg: 'px-3 py-1.5 text-[13px] gap-2',
    };

    if (futureAppointment || !deadlineAt) {
        if (showResponded && !futureAppointment && hasCustomerResponded(lead)) {
            return (
                <div className={cn(
                    'inline-flex items-center font-bold rounded-lg bg-emerald-100 text-emerald-700',
                    sizeClasses[size],
                    className,
                )}>
                    <span>Đã phản hồi</span>
                </div>
            );
        }
        return null;
    }

    const remaining = remainingSeconds(deadlineAt, now);
    if (remaining == null) return null;

    const overdue = remaining < 0;
    const urgent = !overdue && remaining <= FIVE_MINUTES;
    const warning = !overdue && remaining <= TEN_MINUTES && remaining > FIVE_MINUTES;

    const colorClass = overdue
        ? 'bg-red-800 text-white'
        : urgent
            ? 'bg-red-500 text-white'
            : warning
                ? 'bg-amber-500 text-white'
                : 'bg-emerald-500 text-white';

    return (
        <div className={cn(
            'inline-flex items-center font-bold rounded-lg shadow-sm',
            colorClass,
            urgent && 'animate-pulse',
            sizeClasses[size],
            className,
        )}>
            <Clock className={cn('shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            <span className="tabular-nums">{overdue ? 'Quá hạn' : formatRemaining(remaining)}</span>
        </div>
    );
}
