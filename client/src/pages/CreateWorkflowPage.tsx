import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Plus, ArrowRight, Clock, Save,
    Loader2, GripVertical, X, Building2, AlertCircle
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkflows, type CreateWorkflowInput, type UpdateWorkflowInput } from '@/hooks/useWorkflows';
import { useDepartments } from '@/hooks/useDepartments';
import { useAuth } from '@/contexts/AuthContext';

interface StepInput {
    department_id: string;
    department_name?: string;
    name?: string;
    description?: string;
    estimated_duration: number;
    is_required: boolean;
}

export function CreateWorkflowPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEditing = Boolean(id);

    const { user } = useAuth();
    const { getWorkflow, createWorkflow, updateWorkflow } = useWorkflows();
    const { departments, fetchDepartments } = useDepartments();

    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        status: 'active' as 'active' | 'inactive',
    });
    const [formSteps, setFormSteps] = useState<StepInput[]>([]);

    // Fetch departments on mount
    useEffect(() => {
        fetchDepartments();
    }, [fetchDepartments]);

    // Load workflow data if editing
    useEffect(() => {
        if (id) {
            setLoading(true);
            getWorkflow(id).then((workflow) => {
                if (workflow) {
                    setFormData({
                        name: workflow.name,
                        description: workflow.description || '',
                        status: workflow.status,
                    });
                    setFormSteps(workflow.steps.map(s => ({
                        department_id: s.department.id,
                        department_name: s.department.name,
                        name: s.name || '',
                        description: s.description || '',
                        estimated_duration: s.estimated_duration,
                        is_required: s.is_required,
                    })));
                }
                setLoading(false);
            });
        }
    }, [id, getWorkflow]);

    const handleAddStep = () => {
        setFormSteps([...formSteps, {
            department_id: '',
            name: '',
            description: '',
            estimated_duration: 1, // ngày
            is_required: true,
        }]);
    };

    const handleRemoveStep = (index: number) => {
        setFormSteps(formSteps.filter((_, i) => i !== index));
    };

    const handleUpdateStep = (index: number, field: keyof StepInput, value: string | number | boolean) => {
        const updated = [...formSteps];
        const step = { ...updated[index] };

        if (field === 'department_id' && typeof value === 'string') {
            const dept = departments.find(d => d.id === value);
            step.department_id = value;
            step.department_name = dept?.name;
        } else if (field === 'name' && typeof value === 'string') {
            step.name = value;
        } else if (field === 'description' && typeof value === 'string') {
            step.description = value;
        } else if (field === 'estimated_duration' && typeof value === 'number') {
            step.estimated_duration = value;
        } else if (field === 'is_required' && typeof value === 'boolean') {
            step.is_required = value;
        }

        updated[index] = step;
        setFormSteps(updated);
    };

    const handleMoveStep = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === formSteps.length - 1) return;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        const updated = [...formSteps];
        [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
        setFormSteps(updated);
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            toast.error('Vui lòng nhập tên quy trình');
            return;
        }

        const validSteps = formSteps.filter(s => s.department_id);

        if (validSteps.length === 0) {
            toast.error('Vui lòng thêm ít nhất 1 bước');
            return;
        }

        setIsSubmitting(true);
        try {
            if (isEditing && id) {
                const updateData: UpdateWorkflowInput = {
                    name: formData.name,
                    description: formData.description || undefined,
                    status: formData.status,
                    steps: validSteps.map(s => ({
                        department_id: s.department_id,
                        name: s.name || undefined,
                        description: s.description || undefined,
                        estimated_duration: s.estimated_duration,
                        is_required: s.is_required,
                    })),
                };
                await updateWorkflow(id, updateData);
                toast.success('Đã cập nhật quy trình');
            } else {
                const createData: CreateWorkflowInput = {
                    name: formData.name,
                    description: formData.description || undefined,
                    status: formData.status,
                    steps: validSteps.map(s => ({
                        department_id: s.department_id,
                        name: s.name || undefined,
                        description: s.description || undefined,
                        estimated_duration: s.estimated_duration,
                        is_required: s.is_required,
                    })),
                    created_by: user?.id,
                };
                await createWorkflow(createData);
                toast.success('Đã tạo quy trình mới');
            }
            navigate('/workflows');
        } catch {
            toast.error('Có lỗi xảy ra');
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalDuration = formSteps.reduce((sum, s) => sum + s.estimated_duration, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6">
            <Toaster richColors position="top-right" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/workflows')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            {isEditing ? 'Chỉnh sửa quy trình' : 'Tạo quy trình mới'}
                        </h1>
                        <p className="text-gray-500 mt-1">
                            Thiết lập các bước và công việc trong quy trình làm việc
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => navigate('/workflows')}>
                        Hủy
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
                        {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {isEditing ? 'Cập nhật' : 'Tạo quy trình'}
                    </Button>
                </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Basic Info (1/3 width) */}
                <div className="lg:col-span-1">
                    <Card className="sticky top-6">
                        <CardHeader>
                            <CardTitle>Thông tin cơ bản</CardTitle>
                            <CardDescription>Nhập tên và mô tả cho quy trình</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Tên quy trình *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="VD: Quy trình ..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Trạng thái</Label>
                                <Select
                                    value={formData.status}
                                    onValueChange={(v: 'active' | 'inactive') => setFormData(prev => ({ ...prev, status: v }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Đang dùng</SelectItem>
                                        <SelectItem value="inactive">Tạm dừng</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Mô tả</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Mô tả chi tiết về quy trình..."
                                    rows={4}
                                />
                            </div>

                            {/* Summary */}
                            {formSteps.length > 0 && (
                                <div className="pt-4 border-t space-y-2">
                                    <h4 className="text-sm font-medium text-gray-900">Tổng quan</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                                            <p className="text-2xl font-bold text-primary">{formSteps.length}</p>
                                            <p className="text-xs text-gray-500">Số bước</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                                            <p className="text-2xl font-bold text-primary">
                                                {totalDuration.toFixed(1)}
                                            </p>
                                            <p className="text-xs text-gray-500">Ngày</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Steps (2/3 width) */}
                <div className="lg:col-span-2">
                    <Card className="h-full">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Các bước trong quy trình</CardTitle>
                                    <CardDescription>
                                        Thêm các phòng ban và công việc theo thứ tự thực hiện
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-4">
                                    {formSteps.length > 0 && (
                                        <div className="flex items-center gap-1 text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
                                            <Clock className="h-4 w-4" />
                                            <span>{totalDuration.toFixed(1)} ngày</span>
                                        </div>
                                    )}
                                    <Button onClick={handleAddStep} className="gap-2">
                                        <Plus className="h-4 w-4" />
                                        Thêm bước
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {formSteps.length === 0 ? (
                                <div className="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed">
                                    <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
                                    <h3 className="mt-4 text-lg font-medium text-gray-900">Chưa có bước nào</h3>
                                    <p className="mt-2 text-gray-500 max-w-sm mx-auto">
                                        Nhấn "Thêm bước" để bắt đầu thiết lập các bước trong quy trình làm việc
                                    </p>
                                    <Button onClick={handleAddStep} className="mt-4 gap-2">
                                        <Plus className="h-4 w-4" />
                                        Thêm bước đầu tiên
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {formSteps.map((step, index) => (
                                        <div
                                            key={index}
                                            className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl border hover:border-primary/30 transition-colors"
                                        >
                                            {/* Step Order & Controls */}
                                            <div className="flex flex-col items-center gap-1">
                                                <GripVertical className="h-4 w-4 text-gray-400 cursor-grab" />
                                                <span className="flex items-center justify-center w-8 h-8 bg-primary text-white text-sm font-bold rounded-full">
                                                    {index + 1}
                                                </span>
                                                <div className="flex flex-col">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => handleMoveStep(index, 'up')}
                                                        disabled={index === 0}
                                                    >
                                                        <ArrowRight className="h-3 w-3 -rotate-90" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => handleMoveStep(index, 'down')}
                                                        disabled={index === formSteps.length - 1}
                                                    >
                                                        <ArrowRight className="h-3 w-3 rotate-90" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Step Content */}
                                            <div className="flex-1 space-y-3">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs flex items-center gap-1">
                                                            <Building2 className="h-3 w-3" />
                                                            Phòng ban *
                                                        </Label>
                                                        <Select
                                                            value={step.department_id}
                                                            onValueChange={(v) => handleUpdateStep(index, 'department_id', v)}
                                                        >
                                                            <SelectTrigger className="h-9">
                                                                <SelectValue placeholder="Chọn phòng ban" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {departments.map((dept) => (
                                                                    <SelectItem key={dept.id} value={dept.id}>
                                                                        {dept.name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs">Tên bước</Label>
                                                        <Input
                                                            value={step.name || ''}
                                                            onChange={(e) => handleUpdateStep(index, 'name', e.target.value)}
                                                            placeholder=""
                                                            className="h-9"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            Thời gian (ngày)
                                                        </Label>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            step={0.5}
                                                            value={step.estimated_duration}
                                                            onChange={(e) => {
                                                                const days = parseFloat(e.target.value);
                                                                handleUpdateStep(index, 'estimated_duration', Number.isNaN(days) || days < 0 ? 0 : days);
                                                            }}
                                                            className="h-9"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs font-medium text-primary">Công việc của phòng ban *</Label>
                                                    <Textarea
                                                        value={step.description || ''}
                                                        onChange={(e) => handleUpdateStep(index, 'description', e.target.value)}
                                                        placeholder="Mô tả chi tiết công việc phòng ban sẽ thực hiện ở bước này..."
                                                        rows={2}
                                                        className="resize-none"
                                                    />
                                                </div>
                                            </div>

                                            {/* Delete Button */}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                                                onClick={() => handleRemoveStep(index)}
                                            >
                                                <X className="h-5 w-5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
