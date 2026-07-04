import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Save, Loader2, Wrench, GitBranch, Clock, Building2, Plus, ArrowRight, Check, Info
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWorkflows } from '@/hooks/useWorkflows';
import { useProducts } from '@/hooks/useProducts';
import { ImageUpload } from '@/components/products/ImageUpload';
import { formatNumber, parseNumber } from '@/components/products/utils';
import { ProductTypeSelector } from '@/components/products/ProductTypeSelector';

export function CreateServicePage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEditing = Boolean(id);

    const { workflows, fetchWorkflows } = useWorkflows();
    const { services, createService, updateService, fetchServices } = useProducts();

    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        price: 0,
        priceDisplay: '0',
        duration: 60,
        image: null as string | null,
        workflow_id: null as string | null,
        applicable_product_types: [] as string[],
        commission_sale: 0,
        commission_tech: 0,
    });

    // Fetch workflows on mount
    useEffect(() => {
        fetchWorkflows();
        if (!services.length) fetchServices();
    }, [fetchWorkflows, fetchServices, services.length]);

    // Load service data if editing
    useEffect(() => {
        if (id && services.length > 0) {
            setLoading(true);
            const service = services.find(s => s.id === id);
            if (service) {
                setFormData({
                    name: service.name || '',
                    price: service.price || 0,
                    priceDisplay: formatNumber(service.price || 0),
                    duration: service.duration || 60,
                    image: service.image || null,
                    workflow_id: service.workflow_id || null,
                    applicable_product_types: service.applicable_product_types || [],
                    commission_sale: service.commission_sale || 0,
                    commission_tech: service.commission_tech || 0,
                });
            }
            setLoading(false);
        }
    }, [id, services]);

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const numValue = parseNumber(value);
        setFormData(prev => ({
            ...prev,
            price: numValue,
            priceDisplay: numValue === 0 ? '0' : formatNumber(numValue),
        }));
    };

    const handleWorkflowChange = (workflowId: string | null) => {
        setFormData(prev => {
            const updates: any = { workflow_id: workflowId };

            // Auto-fill duration from workflow (quy trình lưu ngày → đổi sang phút cho thời lượng dịch vụ)
            if (workflowId) {
                const workflow = workflows.find(w => w.id === workflowId);
                if (workflow && workflow.steps.length > 0) {
                    const totalDays = workflow.steps.reduce((sum, s) => sum + Number(s.estimated_duration), 0);
                    updates.duration = Math.round(totalDays * 1440);
                }
            }

            return { ...prev, ...updates };
        });
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            toast.error('Vui lòng nhập tên dịch vụ');
            return;
        }
        if (formData.price <= 0) {
            toast.error('Vui lòng nhập giá dịch vụ');
            return;
        }

        setIsSubmitting(true);
        try {
            const data = {
                name: formData.name,
                price: formData.price,
                duration: formData.duration,
                image: formData.image || undefined,
                workflow_id: formData.workflow_id || undefined,
                applicable_product_types: formData.applicable_product_types.length > 0 ? formData.applicable_product_types : undefined,
                commission_sale: formData.commission_sale,
                commission_tech: formData.commission_tech,
                status: 'active' as const,
            };

            if (isEditing && id) {
                await updateService(id, data);
                toast.success('Cập nhật dịch vụ thành công!');
            } else {
                await createService(data);
                toast.success('Tạo dịch vụ thành công!');
            }

            navigate('/services');
        } catch (error) {
            console.error('Error saving service:', error);
            toast.error('Có lỗi xảy ra khi lưu dịch vụ');
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedWorkflow = formData.workflow_id
        ? workflows.find(w => w.id === formData.workflow_id)
        : null;

    const activeWorkflows = workflows.filter(w => w.status === 'active');

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="px-1 pt-0.5 pb-4 space-y-2 animate-fade-in max-w-[1600px] mx-auto">
            <Toaster richColors position="top-right" />

            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/services')}
                        className="hover:bg-muted h-9 w-9"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {isEditing ? 'Sửa dịch vụ' : 'Thêm dịch vụ mới'}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {isEditing ? 'Chỉnh sửa thông tin dịch vụ' : 'Tạo dịch vụ mới với quy trình thực hiện'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => navigate('/services')}>
                        Huỷ
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2 px-6">
                        {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {isEditing ? 'Cập nhật' : 'Tạo mới'}
                    </Button>
                </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Left Column - Basic Info (2/5 width) */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="shadow-sm border-border/60">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Info className="h-5 w-5 text-primary" />
                                Thông tin cơ bản
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Image Upload */}
                            <div className="space-y-3">
                                <Label className="text-sm font-medium">Hình ảnh đại diện</Label>
                                <div className="bg-muted/30 rounded-xl p-4 border border-dashed border-muted-foreground/10">
                                    <ImageUpload
                                        value={formData.image}
                                        onChange={(img) => setFormData(prev => ({ ...prev, image: img }))}
                                        folder="services"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-medium">
                                    Tên dịch vụ <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Ví dụ: Lắp đặt hệ thống lọc nước RO"
                                    className="h-12 text-lg font-medium"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        Giá dịch vụ <span className="text-destructive">*</span>
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            type="text"
                                            value={formData.priceDisplay}
                                            onChange={handlePriceChange}
                                            onFocus={(e) => formData.price === 0 && e.target.select()}
                                            placeholder="0"
                                            className="h-11 pr-12 text-right font-bold text-primary"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                                            VNĐ
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        Thời lượng (phút)
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={formData.duration}
                                            onChange={(e) => setFormData(prev => ({ ...prev, duration: Number(e.target.value) }))}
                                            onFocus={(e) => e.target.select()}
                                            disabled={!!formData.workflow_id}
                                            className="h-11 text-right font-medium"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-medium">Hoa hồng Sale</Label>
                                        <span className="text-xs text-primary font-bold">{formData.commission_sale}%</span>
                                    </div>
                                    <Input
                                        type="number"
                                        value={formData.commission_sale}
                                        onChange={(e) => setFormData(prev => ({ ...prev, commission_sale: Number(e.target.value) }))}
                                        onFocus={(e) => e.target.select()}
                                        className="h-11"
                                        min={0}
                                        max={100}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-medium">Hoa hồng KTV</Label>
                                        <span className="text-xs text-primary font-bold">{formData.commission_tech}%</span>
                                    </div>
                                    <Input
                                        type="number"
                                        value={formData.commission_tech}
                                        onChange={(e) => setFormData(prev => ({ ...prev, commission_tech: Number(e.target.value) }))}
                                        onFocus={(e) => e.target.select()}
                                        className="h-11"
                                        min={0}
                                        max={100}
                                    />
                                </div>
                            </div>

                            {/* Applicable Product Types */}
                            <div className="space-y-3 pt-2">
                                <Label className="text-sm font-medium flex items-center gap-2">
                                    <Building2 className="h-4 w-4" />
                                    Loại sản phẩm áp dụng
                                </Label>
                                <ProductTypeSelector
                                    value={formData.applicable_product_types}
                                    onChange={(types) => setFormData(prev => ({ ...prev, applicable_product_types: types }))}
                                />
                                <p className="text-xs text-muted-foreground italic">
                                    * Chọn các loại sản phẩm có thể áp dụng dịch vụ này (để trống nếu áp dụng tất cả).
                                </p>
                            </div>

                            {/* Workflow Selection */}
                            <div className="space-y-3 pt-4 border-t">
                                <Label className="flex items-center gap-2 text-sm font-medium text-primary">
                                    <GitBranch className="h-4 w-4" />
                                    Quyết định quy trình thực hiện
                                </Label>
                                <Select
                                    value={formData.workflow_id || 'none'}
                                    onValueChange={(v) => handleWorkflowChange(v === 'none' ? null : v)}
                                >
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Chọn quy trình" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">
                                            <span className="text-muted-foreground">Không áp dụng quy trình</span>
                                        </SelectItem>
                                        {activeWorkflows.map(workflow => {
                                            const totalDays = workflow.steps.reduce((sum, s) => sum + Number(s.estimated_duration), 0);
                                            return (
                                                <SelectItem key={workflow.id} value={workflow.id}>
                                                    <div className="flex items-center gap-2">
                                                        <span>{workflow.name}</span>
                                                        <Badge variant="secondary" className="text-xs">
                                                            {workflow.steps.length} bước, {totalDays.toFixed(1)} ngày
                                                        </Badge>
                                                    </div>
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                                {formData.workflow_id && (
                                    <p className="text-xs text-primary flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Thời lượng tự động: {formData.duration} phút
                                    </p>
                                )}
                            </div>

                            {/* Summary Stats */}
                            {selectedWorkflow && (
                                <div className="pt-4 border-t space-y-3">
                                    <h4 className="text-sm font-medium">Tổng quan quy trình</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-primary/5 rounded-xl p-4 text-center border border-primary/10">
                                            <p className="text-3xl font-bold text-primary">{selectedWorkflow.steps.length}</p>
                                            <p className="text-xs text-muted-foreground mt-1">Bước thực hiện</p>
                                        </div>
                                        <div className="bg-primary/5 rounded-xl p-4 text-center border border-primary/10">
                                            <p className="text-3xl font-bold text-primary">{(formData.duration / 1440).toFixed(1)}</p>
                                            <p className="text-xs text-muted-foreground mt-1">Ngày ước tính (từ quy trình)</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Workflow Details (3/5 width) */}
                <div className="lg:col-span-3 overflow-auto">
                    <Card className="h-full shadow-sm border-border/50 flex flex-col">
                        <CardHeader className="pb-3 pt-4 px-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <GitBranch className="h-5 w-5 text-primary" />
                                        Chi tiết quy trình
                                    </CardTitle>
                                    <CardDescription>
                                        Các bước công việc sẽ được thực hiện cho dịch vụ này
                                    </CardDescription>
                                </div>
                                {selectedWorkflow && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(`/workflows/${selectedWorkflow.id}/edit`)}
                                        className="gap-2"
                                    >
                                        Sửa quy trình
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-4">
                            {!selectedWorkflow ? (
                                <div className="text-center py-10 bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/20">
                                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-muted mb-3">
                                        <GitBranch className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-base font-semibold text-foreground">Chưa chọn quy trình</h3>
                                    <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
                                        Chọn quy trình ở bên trái để xem chi tiết các bước
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-4 gap-2"
                                        onClick={() => navigate('/workflows/new')}
                                    >
                                        <Plus className="h-4 w-4" />
                                        Tạo quy trình mới
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-0">
                                    {selectedWorkflow.steps.map((step, index) => (
                                        <div key={step.id} className="relative">
                                            {/* Connector Line */}
                                            {index < selectedWorkflow.steps.length - 1 && (
                                                <div className="absolute left-5 top-14 bottom-0 w-0.5 bg-gradient-to-b from-primary/30 to-primary/10" />
                                            )}

                                            <div className="flex items-start gap-4 p-4 hover:bg-muted/50 rounded-xl transition-colors">
                                                {/* Step Number */}
                                                <div className="relative z-10 flex-shrink-0">
                                                    <span className="flex items-center justify-center w-10 h-10 bg-primary text-white text-sm font-bold rounded-xl shadow-sm">
                                                        {index + 1}
                                                    </span>
                                                </div>

                                                {/* Step Content */}
                                                <div className="flex-1 min-w-0 pt-1">
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Badge variant="outline" className="gap-1.5 px-2.5 py-1">
                                                                <Building2 className="h-3.5 w-3.5" />
                                                                {step.department.name}
                                                            </Badge>
                                                            {step.name && (
                                                                <span className="font-medium text-foreground">{step.name}</span>
                                                            )}
                                                        </div>
                                                        <Badge variant="secondary" className="gap-1 px-2.5 py-1">
                                                            <Clock className="h-3.5 w-3.5" />
                                                            {Number(step.estimated_duration)} ngày
                                                        </Badge>
                                                    </div>
                                                    {step.description && (
                                                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                                                            {step.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Total Duration Footer */}
                                    <div className="flex items-center justify-between gap-2 pt-6 mt-4 border-t">
                                        <span className="text-sm text-muted-foreground">Tổng thời gian thực hiện:</span>
                                        <Badge className="gap-1.5 px-3 py-1.5 text-sm">
                                            <Clock className="h-4 w-4" />
                                            {selectedWorkflow.steps.reduce((sum, s) => sum + Number(s.estimated_duration), 0).toFixed(1)} ngày
                                        </Badge>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
