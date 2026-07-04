import type { DropResult } from '@hello-pangea/dnd';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface MobileKanbanColumn {
    id: string;
    title: string;
}

export function buildKanbanDropResult(
    draggableId: string,
    sourceId: string,
    destId: string,
    sourceIndex = 0,
    destIndex = 0
): DropResult {
    return {
        draggableId,
        type: 'DEFAULT',
        source: { droppableId: sourceId, index: sourceIndex },
        destination: { droppableId: destId, index: destIndex },
        reason: 'DROP',
        mode: 'FLUID',
        combine: null,
    };
}

export function MobileKanbanColumnTabs({
    columns,
    activeId,
    onChange,
    getCount,
    hint = 'Vuốt ngang để chọn cột →',
    className,
}: {
    columns: MobileKanbanColumn[];
    activeId: string;
    onChange: (id: string) => void;
    getCount?: (id: string) => number;
    hint?: string;
    className?: string;
}) {
    return (
        <div className={cn('min-w-0 space-y-2', className)}>
            {hint ? <p className="text-[10px] text-muted-foreground px-0.5">{hint}</p> : null}
            <div className="mobile-kanban-tabs -mx-1 px-1">
                {columns.map((col) => {
                    const isActive = activeId === col.id;
                    const count = getCount?.(col.id);
                    return (
                        <button
                            key={col.id}
                            type="button"
                            onClick={() => onChange(col.id)}
                            className={cn(
                                'mobile-kanban-tab',
                                isActive
                                    ? 'active border-primary bg-primary text-primary-foreground'
                                    : 'border-slate-200 bg-white text-foreground'
                            )}
                        >
                            <span>{col.title}</span>
                            {count != null && (
                                <span
                                    className={cn(
                                        'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                                        isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                                    )}
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** Nút Lùi / Tiếp + dropdown chọn cột */
export function MobileKanbanMoveBar({
    columns,
    currentColumnId,
    draggableId,
    onMove,
    disabled = false,
    disabledMessage = 'Bạn không có quyền chuyển bước',
    sourceIndex = 0,
    className,
    /** true = luôn hiện (parent đã bọc md:hidden), không thêm md:hidden */
    embedded = false,
    /** true = hiện dropdown chọn cột bất kỳ (nhảy cóc), dùng cho tab Quy trình */
    allowColumnJump = false,
    /** false = ẩn nút lùi bước (after-sale, care, …) */
    allowBackward = false,
}: {
    columns: MobileKanbanColumn[];
    currentColumnId: string;
    draggableId: string;
    onMove: (result: DropResult) => void;
    disabled?: boolean;
    disabledMessage?: string;
    sourceIndex?: number;
    className?: string;
    embedded?: boolean;
    allowColumnJump?: boolean;
    allowBackward?: boolean;
}) {
    const idx = columns.findIndex((c) => c.id === currentColumnId);
    const prev = idx > 0 ? columns[idx - 1] : null;
    const next = idx >= 0 && idx < columns.length - 1 ? columns[idx + 1] : null;
    const others = allowColumnJump ? columns.filter((c) => c.id !== currentColumnId) : [];

    const fire = (destId: string) => {
        if (destId === currentColumnId) return;
        if (disabled) {
            toast.error(disabledMessage);
            return;
        }
        onMove(buildKanbanDropResult(draggableId, currentColumnId, destId, sourceIndex, 0));
    };

    if (columns.length <= 1) return null;

    return (
        <div
            className={cn(
                'mt-3 flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5',
                !embedded && 'md:hidden',
                className
            )}
            onClick={(e) => e.stopPropagation()}
        >
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
                Chuyển trạng thái
            </p>
            <div className="flex gap-2">
                {allowBackward && prev && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 min-w-0 flex-1 px-2 text-[11px] border-primary/30"
                        onClick={() => fire(prev.id)}
                    >
                        <ChevronLeft className="h-4 w-4 shrink-0" />
                        <span className="truncate">{prev.title}</span>
                    </Button>
                )}
                {next && (
                    <Button
                        type="button"
                        size="sm"
                        className="h-9 min-w-0 flex-1 px-2 text-[11px]"
                        onClick={() => fire(next.id)}
                    >
                        <span className="truncate">{next.title}</span>
                        <ChevronRight className="h-4 w-4 shrink-0" />
                    </Button>
                )}
            </div>
            {others.length > 0 && (
                <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-[12px] text-foreground"
                    defaultValue=""
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v) fire(v);
                        e.target.value = '';
                    }}
                >
                    <option value="" disabled>
                        Chọn phòng khác…
                    </option>
                    {others.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.title}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}
