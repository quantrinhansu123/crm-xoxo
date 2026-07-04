import { History } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface KanbanHistoryLogProps {
    logs: any[];
    title: string;
    getStageLabel: (stage: string) => string;
    flowTypeLabels?: Record<string, string>;
}

export function KanbanHistoryLog({ logs, title, getStageLabel, flowTypeLabels }: KanbanHistoryLogProps) {
    return (
        <div className="mt-6 border-t pt-6">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
                <History className="h-4 w-4 text-primary" /> {title}
            </h3>
            {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">Chưa có lịch sử.</p>
            ) : (
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {logs.map((log: any) => (
                        <li key={log.id} className="text-xs flex items-center gap-2 py-1.5 border-b border-dashed last:border-0">
                            <span className="text-muted-foreground shrink-0">{formatDateTime(log.created_at)}</span>
                            <span className="font-medium">{log.created_by_user?.name ?? 'Hệ thống'}</span>
                            <span className="text-muted-foreground">
                                {log.from_stage ? `${getStageLabel(log.from_stage)} → ` : ''}{getStageLabel(log.to_stage)}
                                {flowTypeLabels && log.flow_type && (
                                    <span className="ml-1 text-muted-foreground">
                                        ({flowTypeLabels[log.flow_type] || log.flow_type})
                                    </span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
