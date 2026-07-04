import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Building2, Settings, Loader2, Clock, User, ShoppingBag, CalendarClock, RefreshCw } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDepartments, type Department } from '@/hooks/useDepartments';
import { useUsers } from '@/hooks/useUsers';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

// Kanban step data from API
interface KanbanStep {
    id: string;
    step_name: string;
    step_order: number;
    status: 'pending' | 'assigned' | 'in_progress' | 'completed';
    display_status: 'waiting' | 'assigned' | 'in_progress' | 'completed';
    started_at?: string;
    completed_at?: string;
    estimated_duration?: number;
    technician?: { id: string; name: string; avatar?: string };
    item_name: string;
    product_name?: string;
    order_id: string;
    order_code: string;
    order_due_at?: string;
    order_status: string;
    customer_name: string;
    customer_phone?: string;
    sales_name?: string;
}

interface KanbanDepartment {
    id: string;
    code: string;
    name: string;
    steps: KanbanStep[];
}

export function DepartmentsPage() {
    const navigate = useNavigate();
    const { departments, loading: deptLoading, fetchDepartments, createDepartment, updateDepartment, deleteDepartment } = useDepartments();
    const { users, fetchUsers } = useUsers();

    // Kanban state
    const [kanbanData, setKanbanData] = useState<KanbanDepartment[]>([]);
    const [loadingKanban, setLoadingKanban] = useState(true);

    // Admin dialog state
    const [showAdminDialog, setShowAdminDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [managerId, setManagerId] = useState('');
    const [status, setStatus] = useState<'active' | 'inactive'>('active');

    const fetchKanbanData = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoadingKanban(true);
        try {
            const response = await api.get('/departments/kanban');
            const data = response.data?.data || response.data || [];
            setKanbanData(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching kanban data:', error);
            if (!isBackground) toast.error('Không thể tải dữ liệu Kanban');
        } finally {
            if (!isBackground) setLoadingKanban(false);
        }
    }, []);

    useEffect(() => {
        fetchKanbanData();
        fetchDepartments();
        fetchUsers();

        // Auto_refresh every 30 seconds
        const intervalId = setInterval(() => {
            fetchKanbanData(true);
        }, 30000);

        return () => clearInterval(intervalId);
    }, [fetchKanbanData, fetchDepartments, fetchUsers]);

    // Reset form when dialog opens/closes
    useEffect(() => {
        if (editingDepartment) {
            setName(editingDepartment.name || '');
            setDescription(editingDepartment.description || '');
            setManagerId(editingDepartment.manager_id || '');
            setStatus(editingDepartment.status || 'active');
        } else {
            setName('');
            setDescription('');
            setManagerId('');
            setStatus('active');
        }
    }, [editingDepartment, showEditDialog]);

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error('Vui lòng nhập tên phòng ban');
            return;
        }

        setSubmitting(true);
        try {
            const data = {
                name,
                description: description || undefined,
                manager_id: managerId || undefined,
                status
            };

            if (editingDepartment) {
                await updateDepartment(editingDepartment.id, data);
                toast.success('Đã cập nhật phòng ban!');
            } else {
                await createDepartment(data);
                toast.success('Đã tạo phòng ban mới!');
            }

            setShowEditDialog(false);
            setEditingDepartment(null);
            fetchKanbanData(); // Refresh kanban after changes
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Có lỗi xảy ra';
            toast.error(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (dept: Department) => {
        if (!confirm(`Bạn có chắc muốn xóa phòng ban "${dept.name}"?`)) return;

        try {
            await deleteDepartment(dept.id);
            toast.success('Đã xóa phòng ban!');
            fetchKanbanData(); // Refresh kanban after delete
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Có lỗi xảy ra';
            toast.error(message);
        }
    };

    const handleEditDepartment = (dept: Department) => {
        setEditingDepartment(dept);
        setShowAdminDialog(false);
        setShowEditDialog(true);
    };

    const handleAddDepartment = () => {
        setEditingDepartment(null);
        setShowAdminDialog(false);
        setShowEditDialog(true);
    };

    const getDeadlineInfo = (dueAt?: string) => {
        if (!dueAt) return { label: 'Chưa có', color: 'text-muted-foreground', bgColor: 'bg-muted' };

        const now = new Date();
        const due = new Date(dueAt);
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { label: `Trễ ${Math.abs(diffDays)} ngày`, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' };
        } else if (diffDays <= 1) {
            return { label: 'Hôm nay', color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' };
        } else if (diffDays <= 2) {
            return { label: `Còn ${diffDays} ngày`, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' };
        } else {
            return { label: `Còn ${diffDays} ngày`, color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-200' };
        }
    };

    const getDisplayStatusBadge = (displayStatus: string) => {
        switch (displayStatus) {
            case 'waiting':
                return <Badge variant="outline" className="text-xs bg-slate-50">Chờ thực hiện</Badge>;
            case 'assigned':
                return <Badge variant="secondary" className="text-xs">Đã phân công</Badge>;
            case 'in_progress':
                return <Badge className="text-xs bg-blue-500">Đang làm</Badge>;
            case 'completed':
                return <Badge className="text-xs bg-emerald-500 text-white">Đã hoàn thành</Badge>;
            default:
                return <Badge variant="outline" className="text-xs">{displayStatus}</Badge>;
        }
    };

    const managers = users.filter(u => u.role === 'manager' || u.role === 'admin');

    if (loadingKanban && kanbanData.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="h-full">
            <Toaster position="top-right" richColors />

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <Building2 className="h-7 w-7 text-primary" />
                        Phòng Ban
                    </h1>
                    <p className="text-muted-foreground mt-1">Theo dõi công việc theo từng phòng ban</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchKanbanData(false)}
                        disabled={loadingKanban}
                    >
                        <RefreshCw className={cn("h-4 w-4 mr-1", loadingKanban && "animate-spin")} />
                        Làm mới
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAdminDialog(true)}
                    >
                        <Settings className="h-4 w-4 mr-1" />
                        Quản lý
                    </Button>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 200px)' }}>
                {kanbanData.map((dept) => (
                    <div
                        key={dept.id}
                        className="flex-shrink-0 min-w-[280px] md:min-w-[320px] flex-1 bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200/50"
                    >
                        {/* Column Header */}
                        <div className="p-4 border-b border-gray-100 sticky top-0 bg-white/90 backdrop-blur-sm rounded-t-xl">
                            <div className="flex items-center justify-between">
                                <h2 className="font-bold text-sm uppercase tracking-wide text-gray-700">
                                    {dept.name}
                                </h2>
                                <Badge variant="secondary" className="text-xs font-semibold">
                                    {dept.steps.length}
                                </Badge>
                            </div>
                        </div>

                        {/* Column Content */}
                        <div className="p-3 space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                            {dept.steps.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                        <ShoppingBag className="h-6 w-6 text-gray-400" />
                                    </div>
                                    <p className="text-sm text-muted-foreground">Không có công việc</p>
                                </div>
                            ) : (
                                dept.steps.map((step) => {
                                    const deadline = getDeadlineInfo(step.order_due_at);
                                    const isLate = deadline.label.includes('Trễ');

                                    return (
                                        <Card
                                            key={step.id}
                                            className={cn(
                                                "cursor-pointer hover:shadow-md transition-all duration-200 border-l-4",
                                                isLate ? "border-l-red-500 bg-red-50/50" : "border-l-blue-500"
                                            )}
                                            onClick={() => navigate(`/orders/${step.order_id}`)}
                                        >
                                            <CardContent className="p-3 space-y-2">
                                                {/* Order Code & Status */}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-primary">#{step.order_code}</span>
                                                    {getDisplayStatusBadge(step.display_status)}
                                                </div>

                                                {/* Item/Service Name */}
                                                <div className="space-y-1">
                                                    {step.product_name && (
                                                        <p className="text-sm font-semibold text-gray-900 line-clamp-1 flex items-center gap-1">
                                                            <ShoppingBag className="h-3.5 w-3.5 text-primary shrink-0" />
                                                            {step.product_name}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-muted-foreground line-clamp-1">
                                                        Bước: {step.step_name} ({step.item_name})
                                                    </p>
                                                </div>

                                                {/* Customer */}
                                                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                                    <User className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{step.customer_name || 'N/A'}</span>
                                                </div>

                                                {/* Technician */}
                                                {step.technician && (
                                                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                                        <User className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                                        <span className="truncate">KT: {step.technician.name}</span>
                                                    </div>
                                                )}

                                                {/* Deadline */}
                                                <div className={cn(
                                                    "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border",
                                                    deadline.bgColor, deadline.color
                                                )}>
                                                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="font-medium">{deadline.label}</span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })
                            )}
                        </div>
                    </div>
                ))}

                {kanbanData.length === 0 && (
                    <div className="w-full flex flex-col items-center justify-center py-20">
                        <Building2 className="h-16 w-16 text-gray-300 mb-4" />
                        <p className="text-lg text-muted-foreground">Chưa có phòng ban nào</p>
                        <Button className="mt-4" onClick={handleAddDepartment}>
                            <Plus className="h-4 w-4 mr-1" />
                            Thêm phòng ban
                        </Button>
                    </div>
                )}
            </div>

            {/* Admin Dialog - List departments for management */}
            <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Quản lý phòng ban
                        </DialogTitle>
                        <DialogDescription>
                            Thêm, sửa hoặc xóa phòng ban
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 my-4">
                        {deptLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        ) : departments.length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground">Chưa có phòng ban nào</p>
                        ) : (
                            departments.map((dept) => (
                                <div
                                    key={dept.id}
                                    className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium">{dept.name}</p>
                                        <p className="text-xs text-muted-foreground">{dept.code}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Badge variant={dept.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                                            {dept.status === 'active' ? 'Hoạt động' : 'Không hoạt động'}
                                        </Badge>
                                        <Button variant="ghost" size="icon" onClick={() => handleEditDepartment(dept)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(dept)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <DialogFooter>
                        <Button onClick={handleAddDepartment}>
                            <Plus className="h-4 w-4 mr-1" />
                            Thêm phòng ban
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit/Create Department Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingDepartment ? 'Sửa phòng ban' : 'Thêm phòng ban mới'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingDepartment ? 'Cập nhật thông tin phòng ban' : 'Nhập thông tin phòng ban mới'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Tên phòng ban *</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="VD: Phòng Mạ"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Mô tả</Label>
                            <Input
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Mô tả về phòng ban..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="manager">Quản lý</Label>
                            <Select value={managerId || "none"} onValueChange={(value) => setManagerId(value === "none" ? "" : value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Chọn quản lý..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Không có</SelectItem>
                                    {managers.map((user) => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="status">Trạng thái</Label>
                            <Select value={status} onValueChange={(v: 'active' | 'inactive') => setStatus(v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Hoạt động</SelectItem>
                                    <SelectItem value="inactive">Không hoạt động</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                            Hủy
                        </Button>
                        <Button onClick={handleSubmit} disabled={submitting}>
                            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editingDepartment ? 'Cập nhật' : 'Tạo mới'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
