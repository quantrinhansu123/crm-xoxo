import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Clock, User as UserIcon, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { orderItemsApi } from '@/lib/api';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface WorkflowStep {
    id: string;
    step_name: string;
    step_order: number;
    status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'skipped';
    department?: {
        id: string;
        name: string;
    };
    technician?: {
        id: string;
        name: string;
        avatar?: string;
    };
    started_at?: string;
    completed_at?: string;
    estimated_duration?: number; // ngày
}

interface WorkflowStepsTimelineProps {
    itemId: string;
    mode?: 'simple' | 'detailed';
    onStepCompleted?: () => void;
}

export const WorkflowStepsTimeline: React.FC<WorkflowStepsTimelineProps> = ({ itemId, mode = 'simple', onStepCompleted }) => {
    const { user } = useAuth();
    const [steps, setSteps] = useState<WorkflowStep[]>([]);
    const [loading, setLoading] = useState(true);
    const [completingStepId, setCompletingStepId] = useState<string | null>(null);

    useEffect(() => {
        const fetchSteps = async () => {
            try {
                const response = await orderItemsApi.getSteps(itemId);
                if (response.data && response.data.data) {
                    setSteps(response.data.data as WorkflowStep[]);
                }
            } catch (error) {
                console.error('Error fetching steps:', error);
                toast.error('Không thể tải quy trình');
            } finally {
                setLoading(false);
            }
        };

        if (itemId) {
            fetchSteps();
        }
    }, [itemId]);

    const handleCompleteStep = async (stepId: string) => {
        setCompletingStepId(stepId);
        try {
            await orderItemsApi.completeStep(stepId);
            toast.success('Đã xác nhận hoàn thành bước');
            const response = await orderItemsApi.getSteps(itemId);
            if (response.data?.data) setSteps(response.data.data as WorkflowStep[]);
            onStepCompleted?.();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Không thể hoàn thành bước');
        } finally {
            setCompletingStepId(null);
        }
    };

    if (loading) {
        return <div className="p-4 text-center text-sm text-muted-foreground">Đang tải quy trình...</div>;
    }

    if (!steps || steps.length === 0) {
        return (
            <div className="p-4 text-center text-sm text-muted-foreground border border-dashed rounded-lg bg-gray-50">
                Chưa có quy trình nào được thiết lập cho dịch vụ này.
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Vertical Line */}
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-200" />

            <div className="space-y-6 relative">
                {steps.map((step, index) => {
                    const isCompleted = step.status === 'completed';
                    const isInProgress = step.status === 'in_progress';
                    const isAssigned = step.status === 'assigned';

                    return (
                        <div key={step.id} className="flex gap-4 group">
                            {/* Icon/Status Indicator */}
                            <div className={`
                                relative z-10 flex-none w-8 h-8 rounded-full flex items-center justify-center border-2
                                ${isCompleted ? 'bg-green-100 border-green-500 text-green-600' :
                                    isInProgress ? 'bg-blue-100 border-blue-500 text-blue-600 animate-pulse' :
                                        isAssigned ? 'bg-yellow-100 border-yellow-500 text-yellow-600' :
                                            'bg-gray-50 border-gray-300 text-gray-400'}
                            `}>
                                {isCompleted ? <CheckCircle2 className="w-5 h-5" /> :
                                    isInProgress ? <Clock className="w-5 h-5" /> :
                                        isAssigned ? <UserIcon className="w-5 h-5" /> :
                                            <Circle className="w-5 h-5" />}
                            </div>

                            {/* Content */}
                            <div className={`flex-1 rounded-lg border p-4 transition-all
                                ${isInProgress ? 'bg-white border-blue-300 shadow-md ring-1 ring-blue-100' :
                                    isCompleted ? 'bg-green-50/50 border-green-200' :
                                        'bg-white border-gray-100 hover:border-gray-200'}
                            `}>
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h5 className={`font-semibold ${isCompleted ? 'text-green-800' : isInProgress ? 'text-blue-700' : 'text-gray-900'}`}>
                                            {step.step_name}
                                        </h5>
                                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                                            {step.department?.name || 'Chưa phân bổ'}
                                        </p>
                                    </div>
                                    <Badge variant={
                                        step.status === 'completed' ? 'success' :
                                            step.status === 'in_progress' ? 'info' :
                                                step.status === 'assigned' ? 'warning' : 'outline'
                                    }>
                                        {step.status === 'completed' ? 'Hoàn thành' :
                                            step.status === 'in_progress' ? 'Đang thực hiện' :
                                                step.status === 'assigned' ? 'Đã phân công' : 'Chờ xử lý'}
                                    </Badge>
                                </div>

                                {/* Technician & Time Info */}
                                <div className="grid grid-cols-2 gap-2 text-sm mt-3 pt-3 border-t border-dashed">
                                    <div>
                                        <span className="text-muted-foreground block text-xs">Phụ trách:</span>
                                        <span className="font-medium flex items-center gap-1 text-gray-700">
                                            {step.technician ? (
                                                <>
                                                    <UserIcon className="w-3 h-3" />
                                                    {step.technician.name}
                                                </>
                                            ) : (
                                                <span className="text-gray-400 italic">Chưa chỉ định</span>
                                            )}
                                        </span>
                                    </div>
                                    {step.completed_at && (
                                        <div className="text-right">
                                            <span className="text-muted-foreground block text-xs">Hoàn thành:</span>
                                            <span className="font-medium text-green-700">
                                                {format(new Date(step.completed_at), 'HH:mm dd/MM', { locale: vi })}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Xác nhận hoàn thành bước - for in_progress step when user is assigned technician */}
                                {isInProgress && (step.technician as { id?: string })?.id === user?.id && (
                                    <div className="mt-3 pt-3 border-t border-dashed">
                                        <Button
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700 gap-2"
                                            disabled={!!completingStepId}
                                            onClick={() => handleCompleteStep(step.id)}
                                        >
                                            {completingStepId === step.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <CheckCircle2 className="h-4 w-4" />
                                            )}
                                            Xác nhận hoàn thành bước
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
