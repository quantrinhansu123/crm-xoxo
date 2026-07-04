import { X, ChevronRight } from 'lucide-react';
import type { Lead } from '@/hooks/useLeads';
import { kanbanColumns } from './constants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface MobileStageBottomSheetProps {
    open: boolean;
    lead: Lead | null;
    onClose: () => void;
    onSelectStage: (lead: Lead, stageId: string) => void;
}

export function MobileStageBottomSheet({ open, lead, onClose, onSelectStage }: MobileStageBottomSheetProps) {
    if (!open || !lead) return null;

    const currentStage = (lead as any).pipeline_stage || lead.status || 'xac_dinh_nhu_cau';

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-black/40 animate-fade-in"
                onClick={onClose}
            />

            {/* Bottom Sheet */}
            <div className="fixed inset-x-0 bottom-0 z-50 mobile-bottom-sheet">
                <div className="bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-hidden">
                    {/* Handle bar */}
                    <div className="flex justify-center pt-3 pb-1">
                        <div className="w-10 h-1 rounded-full bg-slate-300" />
                    </div>

                    {/* Header with lead info */}
                    <div className="px-5 pb-3 pt-1 border-b border-slate-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <Avatar className="h-10 w-10 shrink-0 border border-secondary/50">
                                    {(lead.avatar_url || lead.fb_profile_pic) && (
                                        <AvatarImage src={(lead.avatar_url || lead.fb_profile_pic)!} alt={lead.name} />
                                    )}
                                    <AvatarFallback className="text-sm bg-primary/5 text-primary font-bold">
                                        {lead.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-[15px] text-foreground truncate">{lead.name}</h3>
                                    <p className="text-xs text-muted-foreground">Chuyển trạng thái</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-slate-100 transition-colors -mr-1"
                            >
                                <X className="h-5 w-5 text-muted-foreground" />
                            </button>
                        </div>
                    </div>

                    {/* Stage options */}
                    <div className="py-2 overflow-y-auto max-h-[60vh]">
                        {kanbanColumns.map((column) => {
                            const Icon = column.icon;
                            const isCurrent = column.id === currentStage;

                            return (
                                <button
                                    key={column.id}
                                    disabled={isCurrent}
                                    onClick={() => {
                                        onSelectStage(lead, column.id);
                                        onClose();
                                    }}
                                    className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left ${
                                        isCurrent
                                            ? 'bg-slate-50 cursor-default'
                                            : 'hover:bg-slate-50 active:bg-slate-100'
                                    }`}
                                >
                                    <div className={`p-2 rounded-lg ${column.color} shrink-0`}>
                                        <Icon className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-semibold text-sm ${isCurrent ? 'text-muted-foreground' : 'text-foreground'}`}>
                                            {column.label}
                                        </p>
                                        {isCurrent && (
                                            <p className="text-[11px] text-muted-foreground mt-0.5">Trạng thái hiện tại</p>
                                        )}
                                    </div>
                                    {isCurrent ? (
                                        <div className="shrink-0 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase">
                                            Hiện tại
                                        </div>
                                    ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
}
