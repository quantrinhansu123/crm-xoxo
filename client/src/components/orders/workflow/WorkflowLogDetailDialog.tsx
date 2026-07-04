import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from '@/lib/utils';
import { User, Clock, MessageSquare, Wrench, Calendar, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    getWorkflowRequestLogDisplay,
    isWorkflowRequestLogAction,
} from '@/pages/OrderDetailPage/workflowRequestLog';
import {
    getSalesStatusLabel,
    getAfterSaleStageLabel,
    getCareWarrantyStageLabel,
} from '@/pages/OrderDetailPage/constants';
import { enrichSalesTransitionLog } from '@/lib/salesStepLogContent';

interface WorkflowLogDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    log: any;
}

function getLogStepLabel(val: string | null | undefined): string {
    if (!val || val === 'START') return 'Bắt đầu';
    if (val.startsWith('step') || val === 'pending' || val === 'before_sale') return getSalesStatusLabel(val);
    if (val.startsWith('after')) return getAfterSaleStageLabel(val);
    if (val.startsWith('war') || val.startsWith('care')) return getCareWarrantyStageLabel(val);
    return val;
}

function parseAssignmentNotes(notes: string) {
    if (!notes) return { reason: '', note: '', deadline: '', technician: '' };

    const lines = notes.split('\n');
    const reason = lines[0] || '';
    let note = '';
    let deadline = '';
    let technician = '';

    lines.forEach((line, idx) => {
        if (line.startsWith('Lưu ý: ')) note = line.replace('Lưu ý: ', '');
        else if (line.startsWith('Hạn hoàn thành: ')) deadline = line.replace('Hạn hoàn thành: ', '');
        else if (line.startsWith('Kỹ thuật viên: ')) technician = line.replace('Kỹ thuật viên: ', '');
        else if (idx > 0 && !line.startsWith('Ảnh bằng chứng: ')) {
            // giữ nguyên reason dòng đầu
        }
    });

    return { reason, note, deadline, technician };
}

export function WorkflowLogDetailDialog({
    open,
    onOpenChange,
    log,
}: WorkflowLogDetailDialogProps) {
    if (!log) return null;

    const enrichedLog = enrichSalesTransitionLog(
        log,
        log._sales_step_data as Record<string, unknown> | undefined
    ) || log;

    const isRequestLog = isWorkflowRequestLogAction(enrichedLog.action);
    const requestDisplay = isRequestLog ? getWorkflowRequestLogDisplay(enrichedLog.action) : null;
    const isWorkflowStep = !!enrichedLog.order_item_step_id;
    const isTransitionLog = !isRequestLog && !isWorkflowStep
        && (enrichedLog.from_status || enrichedLog.from_stage || enrichedLog.to_status || enrichedLog.to_stage);

    const { reason, note, deadline, technician } = parseAssignmentNotes(enrichedLog.notes || '');

    const transitionFrom = getLogStepLabel(enrichedLog.from_status || enrichedLog.from_stage);
    const transitionTo = getLogStepLabel(enrichedLog.to_status || enrichedLog.to_stage);

    const actionBadge = (() => {
        if (isRequestLog && requestDisplay) return requestDisplay.label;
        if (enrichedLog.action === 'completed') return 'HOÀN THÀNH';
        if (enrichedLog.action === 'failed') return 'THẤT BẠI';
        if (enrichedLog.action === 'skipped') return 'BỎ QUA';
        if (enrichedLog.action === 'backward_move') return 'LÙI BƯỚC';
        if (enrichedLog.action === 'assigned') return 'PHÂN CÔNG';
        if (isTransitionLog) return 'CHUYỂN BƯỚC';
        return (enrichedLog.action || 'CHI TIẾT').toUpperCase();
    })();

    const badgeClass = (() => {
        if (enrichedLog._outcome === 'rejected' || enrichedLog.action?.includes('rejected')) {
            return 'bg-red-100 text-red-700 hover:bg-red-100';
        }
        if (enrichedLog._outcome === 'approved' || enrichedLog.action === 'completed' || enrichedLog.action?.includes('approved')) {
            return 'bg-green-100 text-green-700 hover:bg-green-100';
        }
        if (enrichedLog.action === 'failed') return 'bg-red-100 text-red-700 hover:bg-red-100';
        if (enrichedLog.action === 'skipped') return 'bg-orange-100 text-orange-700 hover:bg-orange-100';
        return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
    })();

    const displayReason = enrichedLog.reason || reason || (enrichedLog.action === 'backward_move' ? 'Lùi bước' : '');
    const displayNote = enrichedLog.notes && !isWorkflowStep ? enrichedLog.notes : note;
    const displayPhotos = Array.isArray(enrichedLog.photos) ? enrichedLog.photos : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-white border-2">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className={cn('text-[10px] font-bold px-2 py-0.5', badgeClass)}>
                            {actionBadge}
                        </Badge>
                        {isWorkflowStep && enrichedLog.step_name && (
                            <span className="text-sm font-bold text-gray-700">{enrichedLog.step_name}</span>
                        )}
                        {isTransitionLog && (
                            <span className="text-sm font-bold text-gray-700">
                                {transitionFrom}
                                <span className="mx-1 text-gray-300">→</span>
                                {transitionTo}
                            </span>
                        )}
                    </div>
                    <DialogTitle className="text-lg font-black tracking-tight flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-gray-400" />
                        Chi tiết lịch sử
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-5 py-2">
                        <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="flex items-center gap-2 text-xs">
                                <User className="h-3.5 w-3.5 text-gray-400" />
                                <span className="text-gray-500">Thực hiện bởi:</span>
                                <span className="font-bold text-gray-800">{enrichedLog.created_by_user?.name || 'Hệ thống'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                                <span className="text-gray-500">Vào lúc:</span>
                                <span className="font-medium text-gray-800">{formatDateTime(enrichedLog.created_at)}</span>
                            </div>
                            {enrichedLog.assigned_tech?.name && (
                                <div className="flex items-center gap-2 text-xs">
                                    <Wrench className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-gray-500">KTV:</span>
                                    <span className="font-medium text-gray-800">{enrichedLog.assigned_tech.name}</span>
                                </div>
                            )}
                            {enrichedLog.deadline_days > 0 && (
                                <div className="flex items-center gap-2 text-xs">
                                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                    <span className="text-gray-500">Hạn:</span>
                                    <span className="font-medium text-gray-800">{enrichedLog.deadline_days} ngày</span>
                                </div>
                            )}
                        </div>

                        {displayReason && (
                            <div className="space-y-1.5">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Lý do</h4>
                                <p className="text-sm font-bold text-gray-800 leading-relaxed px-1">{displayReason}</p>
                            </div>
                        )}

                        {displayNote && displayNote !== displayReason && (
                            <div className="space-y-1.5">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Ghi chú</h4>
                                <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-100 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                    {displayNote}
                                </div>
                            </div>
                        )}

                        {(technician || deadline) && (
                            <div className="grid grid-cols-2 gap-3">
                                {technician && (
                                    <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 space-y-1">
                                        <div className="flex items-center gap-1.5 text-[9px] font-black text-purple-400 uppercase tracking-tight">
                                            <Wrench className="h-3 w-3" /> Kỹ thuật viên
                                        </div>
                                        <div className="text-xs font-bold text-purple-700">{technician}</div>
                                    </div>
                                )}
                                {deadline && (
                                    <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-1">
                                        <div className="flex items-center gap-1.5 text-[9px] font-black text-blue-400 uppercase tracking-tight">
                                            <Calendar className="h-3 w-3" /> Hạn hoàn thành
                                        </div>
                                        <div className="text-xs font-bold text-blue-700">{deadline}</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {displayPhotos.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                                    Ảnh bằng chứng ({displayPhotos.length})
                                </h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {displayPhotos.map((photo: string, idx: number) => (
                                        <a
                                            key={idx}
                                            href={photo}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="aspect-square rounded-xl overflow-hidden border-2 border-white shadow-sm hover:ring-2 hover:ring-primary/20 transition-all bg-gray-50"
                                        >
                                            <img src={photo} alt="" className="w-full h-full object-cover" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!displayReason && !displayNote && displayPhotos.length === 0 && isTransitionLog && (
                            <p className="text-sm text-muted-foreground italic px-1">
                                Không có ghi chú hoặc ảnh đính kèm cho lần chuyển bước này.
                            </p>
                        )}
                    </div>
                </ScrollArea>

                <DialogFooter className="border-t pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto gap-2 font-bold"
                        onClick={() => onOpenChange(false)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Quay lại
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
