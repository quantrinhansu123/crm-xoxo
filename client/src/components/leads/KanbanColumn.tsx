import { Droppable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import type { Lead } from '@/hooks/useLeads';
import type { KanbanColumnConfig } from './constants';
import { LeadCard } from './LeadCard';
import type { MobileKanbanColumn } from '@/components/kanban/mobileKanban';

interface KanbanColumnProps {
    column: KanbanColumnConfig;
    leads: Lead[];
    onCardClick: (lead: Lead) => void;
    onDeleteLead?: (id: string) => void;
    onLongPressLead?: (lead: Lead) => void;
    stageColumns?: MobileKanbanColumn[];
    onStageChange?: (result: DropResult) => void;
    isPhoneView?: boolean;
}

export function KanbanColumn({
    column,
    leads,
    onCardClick,
    onDeleteLead,
    onLongPressLead,
    stageColumns,
    onStageChange,
    isPhoneView = false,
}: KanbanColumnProps) {
    const Icon = column.icon;

    return (
        <div className="flex flex-col h-full min-w-0">
            {/* Column Header */}
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-lg ${column.bgColor} ${column.borderColor} border border-b-0`}>
                <div className={`p-1.5 rounded-md ${column.color}`}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                </div>
                <h3 className={`font-semibold text-sm ${column.textColor}`}>{column.label}</h3>
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${column.color} text-white`}>
                    {leads.length}
                </span>
            </div>

            {/* Column Body */}
            <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`kanban-column flex-1 p-2 space-y-2 rounded-b-lg border ${column.borderColor} ${snapshot.isDraggingOver ? `${column.bgColor}` : 'bg-slate-50/50'
                            } transition-colors`}
                    >
                        {leads.map((lead, index) => (
                            <LeadCard
                                key={lead.id}
                                lead={lead}
                                index={index}
                                columnId={column.id}
                                stageColumns={stageColumns}
                                onClick={() => onCardClick(lead)}
                                onDelete={onDeleteLead}
                                onLongPress={onLongPressLead}
                                onStageChange={onStageChange}
                                isPhoneView={isPhoneView}
                            />
                        ))}
                        {provided.placeholder}
                        {leads.length === 0 && !snapshot.isDraggingOver && (
                            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground/60 border-2 border-dashed border-slate-200 rounded-lg">
                                Không có lead
                            </div>
                        )}
                    </div>
                )}
            </Droppable>
        </div>
    );
}
