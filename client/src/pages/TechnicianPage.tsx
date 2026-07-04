import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Clock, CheckCircle2, Play, User, Phone, MapPin,
    Calendar, Star, Wrench, Package, AlertCircle, Loader2, XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useTechnicianTasks, type TechnicianTask } from '@/hooks/useTechnicianTasks';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline'; bgColor: string; headerColor: string }> = {
    assigned: { label: 'Đã phân công', variant: 'warning', bgColor: 'bg-orange-50', headerColor: 'bg-orange-500' },
    partially_completed: { label: 'Một phần', variant: 'warning', bgColor: 'bg-yellow-50', headerColor: 'bg-yellow-500' },
    in_progress: { label: 'Đang thực hiện', variant: 'default', bgColor: 'bg-blue-50', headerColor: 'bg-blue-500' },
    completed: { label: 'Hoàn thành', variant: 'success', bgColor: 'bg-green-50', headerColor: 'bg-green-500' },
    cancelled: { label: 'Đã hủy', variant: 'destructive', bgColor: 'bg-red-50', headerColor: 'bg-red-500' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
    low: { label: 'Thấp', color: 'text-gray-500' },
    normal: { label: 'Bình thường', color: 'text-blue-500' },
    high: { label: 'Cao', color: 'text-orange-500' },
    urgent: { label: 'Khẩn cấp', color: 'text-red-500' },
};

export function TechnicianPage() {
    const {
        tasks,
        loading,
        stats,
        fetchMyTasks,
        startTask,
        completeTask,
        fetchStats,
    } = useTechnicianTasks();

    const [selectedTask, setSelectedTask] = useState<TechnicianTask | null>(null);
    const [showCompleteDialog, setShowCompleteDialog] = useState(false);
    const [completionNotes, setCompletionNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const navigate = useNavigate();

    // Fetch all tasks for kanban view
    const loadTasks = useCallback(async () => {
        await fetchMyTasks({});
    }, [fetchMyTasks]);

    useEffect(() => {
        loadTasks();
        fetchStats();
    }, [loadTasks, fetchStats]);

    // Handle start task
    const handleStartTask = async (task: TechnicianTask) => {
        try {
            await startTask(task.id);
            toast.success('Đã bắt đầu công việc!');
            if (task.item_code) {
                navigate(`/task/${task.item_code}`);
            } else {
                loadTasks();
            }
        } catch (error) {
            toast.error('Không thể bắt đầu công việc');
        }
    };

    // Handle complete task
    const handleCompleteTask = async () => {
        if (!selectedTask) return;

        setSubmitting(true);
        try {
            await completeTask(selectedTask.id, {
                notes: completionNotes || undefined,
            });
            toast.success('Đã hoàn thành công việc!');
            setShowCompleteDialog(false);
            setSelectedTask(null);
            setCompletionNotes('');
            loadTasks();
            fetchStats();
        } catch (error) {
            toast.error('Không thể hoàn thành công việc');
        } finally {
            setSubmitting(false);
        }
    };

    // Stats cards
    const statsCards = [
        { label: 'Tổng công việc', value: stats?.total || 0, icon: Package, color: 'text-blue-500' },
        { label: 'Đang thực hiện', value: stats?.in_progress || 0, icon: Play, color: 'text-yellow-500' },
        { label: 'Hoàn thành', value: stats?.completed || 0, icon: CheckCircle2, color: 'text-green-500' },
        { label: 'Đánh giá TB', value: (stats?.avg_rating || 0).toFixed(1), icon: Star, color: 'text-amber-500' },
    ];

    // Group tasks by status
    const tasksByStatus = {
        assigned: tasks.filter(t => t.status === 'assigned' || t.status === 'partially_completed'),
        in_progress: tasks.filter(t => t.status === 'in_progress'),
        completed: tasks.filter(t => t.status === 'completed'),
        cancelled: tasks.filter(t => t.status === 'cancelled'),
    };

    const kanbanColumns = ['assigned', 'in_progress', 'completed', 'cancelled'] as const;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Công việc của tôi</h1>
                    <p className="text-muted-foreground">Quản lý và theo dõi công việc được giao</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statsCards.map((stat, index) => (
                    <Card key={index}>
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                                    <p className="text-2xl font-bold">{stat.value}</p>
                                </div>
                                <stat.icon className={cn("h-8 w-8", stat.color)} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Kanban Board */}
            <div className="w-full">
                <div className="flex items-center gap-2 mb-4">
                    <Wrench className="h-5 w-5" />
                    <h2 className="text-lg font-semibold">Bảng công việc</h2>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="w-full overflow-x-auto pb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-[800px] lg:min-w-0">
                            {kanbanColumns.map((status) => (
                                <KanbanColumn
                                    key={status}
                                    status={status}
                                    tasks={tasksByStatus[status]}
                                    onStartTask={handleStartTask}
                                    onCompleteTask={(task) => {
                                        setSelectedTask(task);
                                        setShowCompleteDialog(true);
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Complete Dialog */}
            <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                            Hoàn thành công việc
                        </DialogTitle>
                        <DialogDescription>
                            Xác nhận hoàn thành công việc: {selectedTask?.service_name}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Ghi chú (không bắt buộc)</Label>
                            <Textarea
                                value={completionNotes}
                                onChange={(e) => setCompletionNotes(e.target.value)}
                                placeholder="Ghi chú về công việc đã thực hiện..."
                                rows={3}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>
                            Hủy
                        </Button>
                        <Button onClick={handleCompleteTask} disabled={submitting}>
                            {submitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Đang xử lý...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Hoàn thành
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Kanban Column Component
interface KanbanColumnProps {
    status: string;
    tasks: TechnicianTask[];
    onStartTask: (task: TechnicianTask) => void;
    onCompleteTask: (task: TechnicianTask) => void;
}

function KanbanColumn({ status, tasks, onStartTask, onCompleteTask }: KanbanColumnProps) {
    const config = statusConfig[status] || statusConfig.assigned;

    return (
        <div className={cn("min-w-[200px] flex-1 rounded-lg border", config.bgColor)}>
            {/* Column Header */}
            <div className={cn("px-3 py-2 rounded-t-lg text-white font-medium flex items-center justify-between", config.headerColor)}>
                <span>{config.label}</span>
                <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/30">
                    {tasks.length}
                </Badge>
            </div>

            {/* Column Content */}
            <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                {tasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        Không có công việc
                    </div>
                ) : (
                    tasks.map((task) => (
                        <KanbanTaskCard
                            key={task.id}
                            task={task}
                            onStart={() => onStartTask(task)}
                            onComplete={() => onCompleteTask(task)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

// Kanban Task Card Component
interface KanbanTaskCardProps {
    task: TechnicianTask;
    onStart: () => void;
    onComplete: () => void;
}

function KanbanTaskCard({ task, onStart, onComplete }: KanbanTaskCardProps) {
    const priority = priorityConfig[task.priority] || priorityConfig.normal;
    const navigate = useNavigate();

    const handleCardClick = () => {
        if (task.item_code) {
            navigate(`/task/${task.item_code}`);
        }
    };

    // For V2 products, show product info; for others, show service info
    const isProduct = task.type === 'v2_product';
    const displayName = isProduct ? (task.product_name || task.service_name) : task.service_name;
    const servicesCount = isProduct ? (task.services_count || task.services?.length || 0) : 0;

    return (
        <Card
            className="cursor-pointer hover:shadow-md transition-shadow bg-white"
            onClick={handleCardClick}
        >
            <CardContent className="p-3 space-y-2">
                {/* Product/Service Name & Priority */}
                <div>
                    <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-sm line-clamp-2">{displayName}</h4>
                        <span className={cn("text-xs font-medium shrink-0", priority.color)}>
                            {priority.label}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-xs text-muted-foreground font-mono">
                            {task.task_code || task.item_code}
                        </p>
                        {task.type === 'workflow_step' && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-purple-50 text-purple-700 border-purple-200">
                                Quy trình
                            </Badge>
                        )}
                        {task.type === 'v2_product' && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-green-50 text-green-700 border-green-200">
                                Sản phẩm
                            </Badge>
                        )}
                        {task.type === 'v2_service' && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">
                                Dịch vụ
                            </Badge>
                        )}
                        {isProduct && servicesCount > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-orange-50 text-orange-700 border-orange-200">
                                {servicesCount} dịch vụ
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Services list for products */}
                {isProduct && task.services && task.services.length > 0 && (
                    <div className="text-xs space-y-1">
                        <p className="font-medium text-muted-foreground">Dịch vụ:</p>
                        <div className="space-y-0.5">
                            {task.services.slice(0, 2).map((service) => (
                                <div key={service.id} className="flex items-center gap-1">
                                    <div className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        service.status === 'completed' ? 'bg-green-500' :
                                        service.status === 'in_progress' ? 'bg-blue-500' :
                                        'bg-gray-400'
                                    )} />
                                    <span className="text-muted-foreground truncate">{service.name}</span>
                                </div>
                            ))}
                            {task.services.length > 2 && (
                                <p className="text-muted-foreground pl-2.5">+{task.services.length - 2} dịch vụ khác</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Customer Info */}
                {(task.customer || task.order?.customer) && (
                    <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span className="truncate">{task.customer?.name || task.order?.customer?.name}</span>
                        </div>
                        {(task.customer?.phone || task.order?.customer?.phone) && (
                            <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                <span>{task.customer?.phone || task.order?.customer?.phone}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Schedule */}
                {task.scheduled_date && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>
                            {new Date(task.scheduled_date).toLocaleDateString('vi-VN')}
                            {task.scheduled_time && ` - ${task.scheduled_time}`}
                        </span>
                    </div>
                )}

                {/* Actions */}
                <div className="pt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {(task.status === 'assigned' || task.status === 'partially_completed') && (
                        <Button size="sm" className="w-full h-7 text-xs" onClick={onStart}>
                            <Play className="h-3 w-3 mr-1" />
                            Bắt đầu
                        </Button>
                    )}
                    {task.status === 'in_progress' && (
                        <Button size="sm" variant="success" className="w-full h-7 text-xs" onClick={onComplete}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Hoàn thành
                        </Button>
                    )}
                    {task.status === 'completed' && task.rating && (
                        <div className="flex items-center gap-1 text-amber-500 w-full justify-center">
                            <Star className="h-4 w-4 fill-current" />
                            <span className="font-medium">{task.rating}</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
