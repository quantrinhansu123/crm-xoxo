import { useRef, useCallback } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { Eye, Trash2, Flame, AlertTriangle, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatTimeAgo, formatDateTime } from '@/lib/utils';
import type { Lead } from '@/hooks/useLeads';
import { sourceLabels } from './constants';
import { SLACountdown } from './SLACountdown';
import { useAuth } from '@/contexts/AuthContext';
import { MobileKanbanMoveBar, type MobileKanbanColumn } from '@/components/kanban/mobileKanban';

interface LeadCardProps {
    lead: Lead;
    index: number;
    columnId: string;
    stageColumns?: MobileKanbanColumn[];
    onClick: () => void;
    onDelete?: (id: string) => void;
    onLongPress?: (lead: Lead) => void;
    onStageChange?: (result: DropResult) => void;
    isPhoneView?: boolean;
}

export function LeadCard({
    lead,
    index,
    columnId,
    stageColumns = [],
    onClick,
    onDelete,
    onLongPress,
    onStageChange,
    isPhoneView = false,
}: LeadCardProps) {
    const { user } = useAuth();
    // Use channel first, fallback to source for legacy data
    const channelKey = lead.channel || lead.source || '';
    const source = sourceLabels[channelKey] || { label: channelKey || 'Khác', color: 'bg-gray-100 text-gray-700' };

    const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

    // Long press detection for mobile
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressTriggered = useRef(false);

    const handleTouchStart = useCallback(() => {
        longPressTriggered.current = false;
        longPressTimer.current = setTimeout(() => {
            longPressTriggered.current = true;
            onLongPress?.(lead);
            // Vibrate if supported
            if (navigator.vibrate) navigator.vibrate(30);
        }, 500);
    }, [lead, onLongPress]);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleTouchMove = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const handleCardClick = useCallback(() => {
        // Don't trigger click if long press was just fired
        if (longPressTriggered.current) {
            longPressTriggered.current = false;
            return;
        }
        onClick();
    }, [onClick]);

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onDelete && window.confirm(`Bạn có chắc chắn muốn xóa lead "${lead.name}"?`)) {
            onDelete(lead.id);
        }
    };

    return (
        <Draggable draggableId={lead.id} index={index} isDragDisabled={isPhoneView}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...(isPhoneView ? {} : provided.dragHandleProps)}
                    className={`kanban-card bg-white rounded-lg border p-3 group ${isPhoneView ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : 'shadow-sm hover:shadow-md'
                        }`}
                    onClick={handleCardClick}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                            <Avatar className="h-10 w-10 shrink-0 border border-secondary/50">
                                {(lead.avatar_url || lead.fb_profile_pic) && (
                                    <AvatarImage src={(lead.avatar_url || lead.fb_profile_pic)!} alt={lead.name} />
                                )}
                                <AvatarFallback className="text-sm bg-primary/5 text-primary font-bold">
                                    {lead.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                                <div className="flex flex-col">
                                    <h3 className="font-bold text-[14px] sm:text-[15px] text-foreground leading-tight tracking-tight" title={lead.name}>
                                        {lead.name}
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                                        {lead.phone}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <SLACountdown lead={lead} size="sm" className="shadow-none" />
                                    {lead.loss_risk?.toLowerCase() === 'high' && (
                                        <div className="inline-flex items-center gap-1 bg-red-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-sm shadow-sm animate-bounce">
                                            <AlertTriangle className="h-2.5 w-2.5" />
                                            NGUY CƠ RỚT KHÁCH
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0 -mt-1 -mr-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClick();
                                }}
                            >
                                <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {isManagerOrAdmin && onDelete && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={handleDelete}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {lead.lead_score !== undefined && lead.lead_score > 0 && (
                            <div className="flex items-center gap-0.5 shrink-0 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100" title={`Heat Score: ${lead.lead_score}`}>
                                <Flame className={`h-3 w-3 ${
                                    lead.lead_score >= 80 ? 'text-red-500 fill-red-500 animate-pulse' :
                                    lead.lead_score >= 60 ? 'text-orange-500 fill-orange-500' :
                                    'text-blue-400 fill-blue-400'
                                }`} />
                                <span className={`text-[10px] font-black ${
                                    lead.lead_score >= 80 ? 'text-red-600' :
                                    lead.lead_score >= 60 ? 'text-orange-600' :
                                    'text-blue-600'
                                }`}>
                                    {lead.lead_score}
                                </span>
                            </div>
                        )}
                        {lead.next_followup_time && (
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
                                new Date(lead.next_followup_time) < new Date() 
                                ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' 
                                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            }`} title="Thời gian chăm sóc tiếp theo">
                                <CalendarClock className="h-2.5 w-2.5" />
                                {formatDateTime(lead.next_followup_time)}
                            </div>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${source.color}`}>
                            {source.label}
                        </span>
                        {lead.company && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 truncate max-w-[120px]">
                                {lead.company}
                            </span>
                        )}
                        {lead.pipeline_stage === 'hen_qua_ship' && (
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                lead.delivery_method === 'direct' 
                                ? 'bg-orange-50 text-orange-600 border-orange-100' 
                                : 'bg-blue-50 text-blue-600 border-blue-100'
                            }`}>
                                {lead.delivery_method === 'direct' ? (
                                    <>Hẹn: {lead.appointment_time ? formatDateTime(lead.appointment_time) : '-'}</>
                                ) : (
                                    <>Ship: {lead.tracking_code || '-'}</>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                        <div className="flex items-center gap-1.5">
                            {lead.assigned_user ? (
                                <>
                                    <Avatar className="h-5 w-5">
                                        <AvatarFallback className="text-[10px] bg-secondary/20">
                                            {lead.assigned_user.name.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="truncate max-w-[80px]">{lead.assigned_user.name}</span>
                                </>
                            ) : (
                                <span className="text-muted-foreground/60">Chưa gán</span>
                            )}
                        </div>
                        <span>{formatTimeAgo(lead.created_at)}</span>
                    </div>
                    {isPhoneView && onStageChange && stageColumns.length > 0 && (
                        <MobileKanbanMoveBar
                            columns={stageColumns}
                            currentColumnId={columnId}
                            draggableId={lead.id}
                            onMove={onStageChange}
                            sourceIndex={index}
                            embedded
                        />
                    )}
                </div>
            )}
        </Draggable>
    );
}
