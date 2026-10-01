import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LeadSla = {
    deadline_at?: string | null;
} | null;

interface SLACountdownProps {
    lead: {
        sla?: LeadSla;
    };
    size?: 'sm' | 'md' | 'lg';
    className?: string;
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

export function SLACountdown({ lead, size = 'md', className }: SLACountdownProps) {
    const [now, setNow] = useState(() => new Date());
    const deadlineAt = lead.sla?.deadline_at || '';

    useEffect(() => {
        if (!deadlineAt) return;
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, [deadlineAt]);

    if (!lead.sla || !deadlineAt) return null;

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

    const sizeClasses = {
        sm: 'px-1.5 py-0.5 text-[9px] gap-1',
        md: 'px-2 py-1 text-xs gap-1.5',
        lg: 'px-3 py-1.5 text-[13px] gap-2',
    };

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
