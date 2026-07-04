import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus, Edit, Trash2, GitBranch, Eye,
    Loader2, MoreVertical, Clock, Search,
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useWorkflows, type Workflow } from '@/hooks/useWorkflows';

export function WorkflowsPage() {
    const navigate = useNavigate();
    const { workflows, loading, deleteWorkflow } = useWorkflows();

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewWorkflow, setViewWorkflow] = useState<Workflow | null>(null);

    const getTotalDays = (workflow: Workflow) =>
        workflow.steps.reduce((sum, s) => sum + Number(s.estimated_duration), 0).toFixed(1);

    const filteredWorkflows = workflows.filter(w => {
        const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            w.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleOpenDelete = (workflow: Workflow) => {
        setViewWorkflow(null);
        setSelectedWorkflow(workflow);
        setIsDeleteDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!selectedWorkflow) return;

        setIsSubmitting(true);
        try {
            await deleteWorkflow(selectedWorkflow.id);
            toast.success('Đã xóa quy trình');
            setIsDeleteDialogOpen(false);
        } catch {
            toast.error('Không thể xóa quy trình đang được sử dụng');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-3 p-3 md:space-y-6 md:p-6">
            <Toaster richColors position="top-right" />

            {/* Header + filters — một dòng */}
            <div className="flex items-center gap-1.5 md:gap-3">
                <div className="hidden min-w-0 shrink-0 md:block">
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý Quy trình</h1>
                    <p className="mt-1 text-gray-500">Thiết lập quy trình làm việc cho các dịch vụ</p>
                </div>
                <h1 className="shrink-0 text-base font-bold text-gray-900 md:hidden">Quy trình</h1>
                <div className="relative min-w-0 flex-1 md:max-w-md">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 md:left-3 md:h-4 md:w-4" />
                    <Input
                        placeholder="Tìm kiếm..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 pl-8 text-xs md:h-10 md:pl-10 md:text-sm"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-[76px] shrink-0 px-2 text-xs md:h-10 md:w-[150px] md:px-3 md:text-sm">
                        <SelectValue placeholder="TT" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Tất cả</SelectItem>
                        <SelectItem value="active">Đang dùng</SelectItem>
                        <SelectItem value="inactive">Tạm dừng</SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    onClick={() => navigate('/workflows/new')}
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-lg md:hidden"
                    title="Tạo quy trình"
                >
                    <Plus className="h-4 w-4" />
                </Button>
                <Button
                    onClick={() => navigate('/workflows/new')}
                    className="hidden shrink-0 gap-2 md:inline-flex"
                >
                    <Plus className="h-4 w-4" />
                    Tạo quy trình
                </Button>
            </div>

            {/* Workflows Grid */}
            {filteredWorkflows.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
                    <GitBranch className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-4 text-lg font-medium text-gray-900">Chưa có quy trình nào</h3>
                    <p className="mt-2 text-gray-500">Bắt đầu tạo quy trình làm việc đầu tiên</p>
                    <Button onClick={() => navigate('/workflows/new')} className="mt-4 gap-2">
                        <Plus className="h-4 w-4" />
                        Tạo quy trình
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                    {filteredWorkflows.map((workflow) => (
                        <div
                            key={workflow.id}
                            className="rounded-xl border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md md:cursor-pointer md:p-5"
                            onClick={() => {
                                if (window.matchMedia('(min-width: 768px)').matches) {
                                    navigate(`/workflows/${workflow.id}/edit`);
                                }
                            }}
                        >
                            {/* Card Header */}
                            <div className="mb-0 flex items-start justify-between gap-2 md:mb-4">
                                <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
                                    <div className="shrink-0 rounded-lg bg-primary/10 p-1.5 md:p-2">
                                        <GitBranch className="h-4 w-4 text-primary md:h-5 md:w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="truncate text-sm font-semibold text-gray-900 md:text-base">
                                            {workflow.name}
                                        </h3>
                                        <p className="hidden truncate text-[11px] text-gray-500 md:block md:text-sm">
                                            {workflow.code}
                                        </p>
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        asChild
                                        onClick={(e) => e.stopPropagation()}
                                        className="hidden md:inline-flex"
                                    >
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/workflows/${workflow.id}/edit`);
                                        }}>
                                            <Edit className="h-4 w-4 mr-2" />
                                            Chỉnh sửa
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenDelete(workflow);
                                            }}
                                            className="text-red-600"
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Xóa
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* Description — desktop only */}
                            {workflow.description && (
                                <p className="mb-4 hidden line-clamp-2 text-sm text-gray-600 md:block">
                                    {workflow.description}
                                </p>
                            )}

                            {/* Steps — desktop only */}
                            <div className="mb-2 hidden space-y-1 md:mb-4 md:block md:space-y-2">
                                <p className="text-[10px] font-medium uppercase text-gray-500 md:text-xs">
                                    {workflow.steps.length} bước
                                </p>
                                <div className="space-y-1 md:space-y-1.5">
                                    {workflow.steps.slice(0, 3).map((step, index) => (
                                        <div
                                            key={step.id}
                                            className="flex items-center gap-1.5 md:items-start md:gap-2"
                                        >
                                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary md:mt-0.5 md:h-5 md:w-5 md:text-xs">
                                                {index + 1}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <span className="truncate text-[11px] font-medium text-gray-700 md:text-xs">
                                                    {step.name || step.department.name}
                                                </span>
                                                {step.description && (
                                                    <p className="mt-0.5 hidden truncate text-xs text-gray-500 md:block">
                                                        {step.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {workflow.steps.length > 3 && (
                                        <p className="hidden pl-7 text-xs text-gray-500 md:block">
                                            +{workflow.steps.length - 3} bước khác...
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="hidden items-center justify-between gap-2 border-t pt-2 md:flex md:pt-3">
                                <Badge
                                    variant={workflow.status === 'active' ? 'default' : 'secondary'}
                                    className="h-5 px-1.5 text-[10px] md:h-auto md:px-2.5 md:text-xs"
                                >
                                    {workflow.status === 'active' ? 'Đang dùng' : 'Tạm dừng'}
                                </Badge>
                                <div
                                    className="flex min-w-0 items-center gap-0.5 text-[10px] text-gray-500 md:gap-1 md:text-xs"
                                    title="Hạn hoàn thành dịch vụ"
                                >
                                    <Clock className="h-3 w-3 shrink-0" />
                                    <span className="hidden sm:inline">Hạn hoàn thành:</span>
                                    <span className="sm:hidden">Hạn:</span>
                                    <span className="shrink-0 font-medium">
                                        {getTotalDays(workflow)} ngày
                                    </span>
                                </div>
                            </div>

                            {/* Mobile actions */}
                            <div
                                className="mt-1.5 flex items-center justify-end gap-1 md:hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 px-2.5 text-xs"
                                    onClick={() => setViewWorkflow(workflow)}
                                >
                                    <Eye className="h-3.5 w-3.5" />
                                    Xem
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 px-2.5 text-xs"
                                    onClick={() => navigate(`/workflows/${workflow.id}/edit`)}
                                >
                                    <Edit className="h-3.5 w-3.5" />
                                    Sửa
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 border-red-100 px-2.5 text-xs text-destructive hover:bg-red-50"
                                    onClick={() => handleOpenDelete(workflow)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Xóa
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* View workflow detail (mobile) */}
            <Dialog
                open={!!viewWorkflow}
                onOpenChange={(open) => {
                    if (!open) setViewWorkflow(null);
                }}
            >
                <DialogContent className="flex max-h-[90vh] w-[calc(100vw-0.5rem)] max-w-[calc(100vw-0.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
                    {viewWorkflow && (
                        <>
                            <DialogHeader className="space-y-1 border-b px-4 py-3 text-left">
                                <DialogTitle className="text-base leading-tight">
                                    {viewWorkflow.name}
                                </DialogTitle>
                                <DialogDescription className="text-xs">
                                    {viewWorkflow.code}
                                </DialogDescription>
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <Badge
                                        variant={viewWorkflow.status === 'active' ? 'default' : 'secondary'}
                                        className="h-5 text-[10px]"
                                    >
                                        {viewWorkflow.status === 'active' ? 'Đang dùng' : 'Tạm dừng'}
                                    </Badge>
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        Hạn: {getTotalDays(viewWorkflow)} ngày
                                    </span>
                                </div>
                            </DialogHeader>

                            <div className="flex-1 overflow-y-auto px-4 py-3">
                                {viewWorkflow.description && (
                                    <p className="mb-3 text-sm text-gray-600">{viewWorkflow.description}</p>
                                )}
                                <p className="mb-2 text-[10px] font-medium uppercase text-gray-500">
                                    {viewWorkflow.steps.length} bước
                                </p>
                                <div className="space-y-2">
                                    {viewWorkflow.steps.map((step, index) => (
                                        <div key={step.id} className="flex items-start gap-2">
                                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                                {index + 1}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-gray-900">
                                                    {step.name || step.department.name}
                                                </p>
                                                {step.description && (
                                                    <p className="mt-0.5 text-xs text-gray-500">
                                                        {step.description}
                                                    </p>
                                                )}
                                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                    {step.department.name}
                                                    {step.estimated_duration != null &&
                                                        ` · ${Number(step.estimated_duration).toFixed(1)} ngày`}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <DialogFooter className="flex flex-row justify-end gap-1 border-t px-3 py-2 sm:gap-2 sm:px-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1 px-2.5 text-xs"
                                    onClick={() => {
                                        setViewWorkflow(null);
                                        navigate(`/workflows/${viewWorkflow.id}/edit`);
                                    }}
                                >
                                    <Edit className="h-3.5 w-3.5" />
                                    Sửa
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1 border-red-100 px-2.5 text-xs text-destructive hover:bg-red-50"
                                    onClick={() => handleOpenDelete(viewWorkflow)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Xóa
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Xác nhận xóa</DialogTitle>
                        <DialogDescription>
                            Bạn có chắc muốn xóa quy trình "{selectedWorkflow?.name}"?
                            Hành động này không thể hoàn tác.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                            Hủy
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Xóa
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
