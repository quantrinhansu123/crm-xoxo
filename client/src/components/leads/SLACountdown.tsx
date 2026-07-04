import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Zap, AlertCircle } from 'lucide-react';
import { SLA_CYCLES } from './constants';
import { cn } from '@/lib/utils';

interface SLACountdownProps {
    lead: {
        id: string;
        pipeline_stage?: string;
        assigned_to?: string | null;
        current_deadline_at?: string;
        current_rule_index?: number;
        sla_state?: string;
        created_at?: string;
    };
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function SLACountdown({ lead, size = 'md', className }: SLACountdownProps) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const slaData = useMemo(() => {
        // Only show for assigned leads that are not chot_don, huy, fail, FINISHED, RECLAIMED, STOPPED
        const endStages = ['chot_don', 'huy', 'fail'];
        const endStates = ['FINISHED', 'RECLAIMED', 'STOPPED'];
        
        if (!lead.assigned_to || 
            endStages.includes(lead.pipeline_stage || '') || 
            endStates.includes(lead.sla_state || '')) {
            return null;
        }

        if (lead.sla_state === 'PAUSED_APPOINTMENT') {
            return {
                remainingTime: '--:--',
                label: 'Lịch hẹn',
                colorClass: 'bg-blue-500 text-white',
                isBlinking: false,
                isSpeedRule: false
            };
        }

        if (!lead.current_deadline_at) return null;

        const deadline = new Date(lead.current_deadline_at);
        const ruleIndex = lead.current_rule_index || 0;
        const currentMilestone = SLA_CYCLES[ruleIndex] || 3;
        const isSpeedRule = ruleIndex === 0;

        // Customer age: < 24h = new customer (no night pause)
        const isNew = lead.created_at 
            ? (now.getTime() - new Date(lead.created_at).getTime()) < 24 * 60 * 60 * 1000 
            : true;

        const getVirtualSecsLeft = (nowTime: Date, deadTime: Date, isCustomerNew: boolean) => {
            if (nowTime.getTime() >= deadTime.getTime()) {
                return Math.floor((deadTime.getTime() - nowTime.getTime()) / 1000);
            }
            if (isCustomerNew) {
                return Math.floor((deadTime.getTime() - nowTime.getTime()) / 1000);
            }

            const tStart = nowTime.getTime();
            const tEnd = deadTime.getTime();
            let totalPausedMs = 0;

            // Tìm t 00:00 VN gần nhất trước đó
            let currentMidnight = new Date(nowTime);
            currentMidnight.setUTCHours(17, 0, 0, 0); // 17:00 UTC = 00:00 VN hôm sau
            if (currentMidnight.getTime() > tStart) {
                currentMidnight.setUTCDate(currentMidnight.getUTCDate() - 1);
            }

            while (currentMidnight.getTime() < tEnd) {
                const pauseStart = currentMidnight.getTime(); // 00:00 VN
                const pauseEnd = pauseStart + 390 * 60000; // 06:30 VN

                const overlapStart = Math.max(tStart, pauseStart);
                const overlapEnd = Math.min(tEnd, pauseEnd);

                if (overlapStart < overlapEnd) {
                    totalPausedMs += (overlapEnd - overlapStart);
                }

                currentMidnight.setUTCDate(currentMidnight.getUTCDate() + 1); // Quét ngày tiếp theo
            }

            return Math.floor((tEnd - tStart - totalPausedMs) / 1000);
        };

        const remainingSec = getVirtualSecsLeft(now, deadline, isNew);
        const totalSec = currentMilestone * 60;
        
        let label = isSpeedRule ? 'Sale cần rep' : 'Đợi khách';

        let colorClass = 'bg-emerald-500 text-white';
        let isBlinking = false;

        if (remainingSec <= 0) {
            colorClass = 'bg-red-600 text-white';
            isBlinking = true;
        } else {
            const ratio = remainingSec / totalSec;
            if (ratio <= 0.5) {
                // Warning phase
                colorClass = 'bg-amber-500 text-white';
                
                // Alert threshold phase (bắt đầu nhấp nháy đỏ)
                let warnThresholdSec = 45 * 60; // 45 phút = 2700 giây cho tất cả mốc dài
                if (currentMilestone <= 3) warnThresholdSec = 90; // 90 giây cho mốc 3 phút

                if (remainingSec <= warnThresholdSec) {
                    colorClass = 'bg-red-500 text-white';
                    isBlinking = true;
                }
            }
        }

        const formatTime = (seconds: number) => {
            const absSec = Math.abs(seconds);
            const h = Math.floor(absSec / 3600);
            const m = Math.floor((absSec % 3600) / 60);
            const s = Math.floor(absSec % 60);
            
            const prefix = seconds < 0 ? '-' : '';
            if (h > 0) return `${prefix}${h}h${m}p`;
            return `${prefix}${m}:${s.toString().padStart(2, '0')}`;
        };

        return {
            remainingTime: formatTime(remainingSec),
            label,
            colorClass,
            isBlinking,
            isOverdue: remainingSec <= 0,
            isSpeedRule
        };
    }, [lead, now]);

    if (!slaData) return null;

    const sizeClasses = {
        sm: 'px-1.5 py-0.5 text-[9px] gap-1',
        md: 'px-2 py-1 text-xs gap-1.5',
        lg: 'px-3 py-1.5 text-[13px] gap-2'
    };

    return (
        <div className={cn(
            "inline-flex items-center font-bold rounded-lg shadow-sm transition-all duration-300",
            slaData.colorClass,
            slaData.isBlinking && "animate-pulse ring-2 ring-red-300 ring-offset-1",
            sizeClasses[size],
            className
        )}>
            {slaData.isSpeedRule ? (
                <Zap className={cn("shrink-0", size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            ) : (
                <Clock className={cn("shrink-0", size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            )}
            
            <span className="tabular-nums">
                {slaData.remainingTime}
            </span>
            
            <span className="opacity-90 font-medium border-l border-white/30 pl-1.5 ml-0.5 uppercase tracking-tighter">
                {slaData.label}
            </span>
        </div>
    );
}
