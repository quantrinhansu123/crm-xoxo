import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Eye, Phone, Mail, Shield, Calendar, UserPlus, Loader2, ShoppingCart, FileText, ExternalLink, LayoutGrid, List, Columns3, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

import { EmployeeFormDialog } from '@/components/employees/EmployeeFormDialog';
import { EmployeeScheduleTab } from '@/components/employees/EmployeeScheduleTab';
import { EmployeeSalaryTab } from '@/components/employees/EmployeeSalaryTab';
import { MobileEmployeesList } from '@/components/employees/MobileEmployeesList';
import { EmployeeDepartmentKanban } from '@/components/employees/EmployeeDepartmentKanban';

import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { useUsers } from '@/hooks/useUsers';
import { useDepartments } from '@/hooks/useDepartments';
import { useJobTitles } from '@/hooks/useJobTitles';
import api from '@/lib/api';
import type { User, UserRole } from '@/types';
import { useViewActionForRoles } from '@/hooks/useViewAction';
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog';
import type { Order } from '@/hooks/useOrders';

// Extended employee interface for HR management
interface Employee extends User {
    department?: string;
    joinDate?: string;
    status: 'active' | 'inactive' | 'onleave';
    salary?: number;
    commission?: number;
    bankAccount?: string;
    bankName?: string;
    telegramChatId?: string;
}

const roleLabels: Record<UserRole, string> = {
    admin: 'Admin',
    manager: 'Quản lý',
    accountant: 'Kế toán',
    sale: 'Nhân viên bán hàng',
    technician: 'Nhân viên làm phục vụ',
    cashier: 'Thu ngân',
};

const statusLabels = {
    active: { label: 'Đang làm', variant: 'success' as const },
    inactive: { label: 'Nghỉ việc', variant: 'danger' as const },
    onleave: { label: 'Nghỉ phép', variant: 'warning' as const }
};

const roleOptions: { value: UserRole; label: string }[] = [
    { value: 'accountant', label: 'Kế toán' },
    { value: 'sale', label: 'Nhân viên bán hàng' },
    { value: 'technician', label: 'Nhân viên làm phục vụ' },
    { value: 'manager', label: 'Quản lý' },
    { value: 'cashier', label: 'Thu ngân' },
];


// Order interface for employee orders
interface EmployeeOrder {
    id: string;
    order_code: string;
    status: string;
    total_amount: number;
    created_at: string;
    customer?: {
        name: string;
        phone?: string;
    };
}

const orderStatusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline' }> = {
    pending: { label: 'Chờ xử lý', variant: 'secondary' },
    confirmed: { label: 'Đã xác nhận', variant: 'default' },
    processing: { label: 'Đang thực hiện', variant: 'warning' },
    completed: { label: 'Hoàn thành', variant: 'success' },
    cancelled: { label: 'Đã hủy', variant: 'destructive' },
};

// Employee Detail Dialog (modal xem chi tiết)
function EmployeeDetailDialog({
    open,
    onClose,
    employee,
    departments,
    getJobTitleName,
    branches,
    onEdit,
    onDelete,
}: {
    open: boolean;
    onClose: () => void;
    employee: Employee | null;
    departments: { id: string; name: string }[];
    getJobTitleName: (jobTitleId?: string) => string;
    branches: { id: string; name: string }[];
    onEdit?: (emp: Employee) => void;
    onDelete?: (emp: Employee) => void;
}) {
    const [activeTab, setActiveTab] = useState('info');
    const [orders, setOrders] = useState<EmployeeOrder[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [showOrderDetail, setShowOrderDetail] = useState(false);

    // Fetch orders when employee changes or tab switches to orders
    useEffect(() => {
        if (open && employee && activeTab === 'orders') {
            fetchEmployeeOrders();
        }
    }, [open, employee, activeTab]);

    // Reset tab when dialog closes
    useEffect(() => {
        if (!open) {
            setActiveTab('info');
            setOrders([]);
        }
    }, [open]);

    const fetchEmployeeOrders = async () => {
        if (!employee) return;

        setLoadingOrders(true);
        try {
            // Use different query param based on employee role
            const queryParam = employee.role === 'technician'
                ? `technician_id=${employee.id}`
                : `sale_id=${employee.id}`;

            const response = await api.get(`/orders?${queryParam}`);
            // Handle various response formats
            let ordersData = [];
            if (Array.isArray(response.data)) {
                ordersData = response.data;
            } else if (response.data?.data?.orders && Array.isArray(response.data.data.orders)) {
                ordersData = response.data.data.orders;
            } else if (response.data?.orders && Array.isArray(response.data.orders)) {
                ordersData = response.data.orders;
            } else if (response.data?.data && Array.isArray(response.data.data)) {
                ordersData = response.data.data;
            }
            setOrders(ordersData);
        } catch (error) {
            console.error('Error fetching employee orders:', error);
            setOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    };

    if (!employee) return null;

    const getDepartmentName = (deptId?: string) => {
        if (!deptId) return 'Chưa phân bổ';
        const dept = departments.find(d => d.id === deptId);
        return dept?.name || deptId;
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
                <DialogContent className="max-w-4xl w-[min(96vw,56rem)] max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                        <DialogTitle className="text-xl">Chi tiết nhân viên</DialogTitle>
                        <DialogDescription>
                            {employee.name} · {employee.employee_code || '—'}
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0 px-6">
                        <TabsList className="grid w-full grid-cols-2 shrink-0 mt-2">
                            <TabsTrigger value="info" className="gap-2">
                                <FileText className="h-4 w-4" />
                                Thông tin
                            </TabsTrigger>
                            <TabsTrigger value="orders" className="gap-2">
                                <ShoppingCart className="h-4 w-4" />
                                Đơn hàng ({orders.length})
                            </TabsTrigger>
                        </TabsList>

                        {/* Info Tab */}
                        <TabsContent value="info" className="flex-1 overflow-y-auto mt-4">
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-16 w-16">
                                        <AvatarImage src={employee.avatar} />
                                        <AvatarFallback className="text-xl">{employee.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <h3 className="text-xl font-bold">{employee.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant={employee.role === 'manager' ? 'purple' : employee.role === 'sale' ? 'info' : 'secondary'}>
                                                {roleLabels[employee.role]}
                                            </Badge>
                                            <Badge variant={statusLabels[employee.status]?.variant || 'secondary'}>
                                                {statusLabels[employee.status]?.label || employee.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                {/* Info Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Email</p>
                                        <p className="text-sm font-medium flex items-center gap-2">
                                            <Mail className="h-4 w-4 text-muted-foreground" />
                                            {employee.email}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Điện thoại</p>
                                        <p className="text-sm font-medium flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-muted-foreground" />
                                            {employee.phone}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Mã nhân viên</p>
                                        <p className="text-sm font-medium">{employee.employee_code || 'Chưa cập nhật'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Chức danh</p>
                                        <p className="text-sm font-medium">{getJobTitleName(employee.job_title_id)}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Phòng ban</p>
                                        <p className="text-sm font-medium">{getDepartmentName(employee.department)}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Chi nhánh làm việc</p>
                                        <p className="text-sm font-medium">
                                            {branches.find((b) => b.id === employee.working_branch_id)?.name || 'Chưa cập nhật'}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Ngày vào làm</p>
                                        <p className="text-sm font-medium flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-muted-foreground" />
                                            {employee.joinDate || 'Chưa cập nhật'}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Telegram Chat ID</p>
                                        <p className="text-sm font-medium">{employee.telegramChatId || 'Chưa cập nhật'}</p>
                                    </div>
                                </div>

                                {/* Salary Info */}
                                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                                    <h4 className="font-semibold flex items-center gap-2">
                                        <Shield className="h-4 w-4 text-primary" />
                                        Thông tin lương
                                    </h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Lương cơ bản</p>
                                            <p className="text-lg font-bold text-primary">{formatCurrency(employee.salary || 0)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">% Hoa hồng</p>
                                            <p className="text-lg font-bold">{employee.commission || 0}%</p>
                                        </div>
                                    </div>
                                    {(employee.bankName || employee.bankAccount) && (
                                        <div className="pt-2 border-t">
                                            <p className="text-xs text-muted-foreground">Tài khoản ngân hàng</p>
                                            <p className="text-sm font-medium">{employee.bankName || 'N/A'} - {employee.bankAccount || 'N/A'}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* Orders Tab */}
                        <TabsContent value="orders" className="flex-1 overflow-y-auto mt-4">
                            {loadingOrders ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>Nhân viên chưa có đơn hàng nào</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {orders.map((order) => {
                                        const statusInfo = orderStatusLabels[order.status] || { label: order.status, variant: 'secondary' as const };
                                        return (
                                            <div
                                                key={order.id}
                                                className="p-4 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                                                onClick={() => {
                                                    setSelectedOrder(order as unknown as Order);
                                                    setShowOrderDetail(true);
                                                }}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold font-mono">{order.order_code}</span>
                                                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                                                        </div>
                                                        {order.customer && (
                                                            <p className="text-sm text-muted-foreground mt-1">
                                                                KH: {order.customer.name}
                                                                {order.customer.phone && ` - ${order.customer.phone}`}
                                                            </p>
                                                        )}
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {new Date(order.created_at).toLocaleDateString('vi-VN')}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-primary">{formatCurrency(order.total_amount)}</p>
                                                        <p className="text-xs text-muted-foreground mt-1">Click để xem chi tiết</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>

                    <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2 sm:gap-2">
                        {onDelete && (
                            <Button
                                type="button"
                                variant="outline"
                                className="text-red-600 border-red-200 hover:bg-red-50 mr-auto"
                                onClick={() => onDelete(employee)}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Xóa
                            </Button>
                        )}
                        {onEdit && (
                            <Button type="button" variant="outline" onClick={() => onEdit(employee)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Sửa
                            </Button>
                        )}
                        <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Order Detail Dialog */}
            <OrderDetailDialog
                order={selectedOrder}
                open={showOrderDetail}
                onClose={() => {
                    setShowOrderDetail(false);
                    setSelectedOrder(null);
                }}
            />
        </>
    );
}

export function EmployeesPage() {
    const navigate = useNavigate();
    const { canEdit, canDelete } = useViewActionForRoles('employees', ['admin', 'manager']);
    const { users, loading, fetchUsers, createUser, updateUser, deleteUser } = useUsers();
    const { departments, fetchDepartments, createDepartment } = useDepartments();
    const { jobTitles, fetchJobTitles, createJobTitle } = useJobTitles();
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
    const [departmentFilter, setDepartmentFilter] = useState<string>('all');
    const [jobTitleFilter, setJobTitleFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('active');
    const [showForm, setShowForm] = useState(false);
    const [showEmployeeDetailModal, setShowEmployeeDetailModal] = useState(false);
    const [detailModalEmployee, setDetailModalEmployee] = useState<Employee | null>(null);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [detailActiveTab, setDetailActiveTab] = useState('info');
    const [detailOrders, setDetailOrders] = useState<EmployeeOrder[]>([]);
    const [detailOrdersLoading, setDetailOrdersLoading] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [showOrderDetail, setShowOrderDetail] = useState(false);
    const [showDeptDialog, setShowDeptDialog] = useState(false);
    const [showTitleDialog, setShowTitleDialog] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ type: 'deactivate' | 'delete'; employee: Employee } | null>(null);
    const [deptForm, setDeptForm] = useState({ name: '', description: '', status: 'active' as 'active' | 'inactive' });
    const [titleForm, setTitleForm] = useState({ name: '', description: '', status: 'active' as 'active' | 'inactive' });
    const [savingDept, setSavingDept] = useState(false);
    const [savingTitle, setSavingTitle] = useState(false);
    const [columnVisibility, setColumnVisibility] = useState({
        avatar: true,
        code: true,
        timekeepingCode: true,
        name: true,
        phone: true,
        idCard: true,
        debt: true,
        notes: true,
        mobile: false,
        birthday: false,
        gender: false,
        email: false,
        facebook: false,
        address: false,
        account: true,
        password: true,
        position: true,
        department: true,
        role: false,
        joinDate: false,
    });


    // Fetch data on mount
    useEffect(() => {
        fetchUsers();
        fetchDepartments();
        fetchJobTitles();
        fetchBranches();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fetch orders when selected employee changes and Orders tab is active
    useEffect(() => {
        if (selectedEmployee && detailActiveTab === 'orders') {
            fetchSelectedEmployeeOrders();
        }
    }, [selectedEmployee, detailActiveTab]);

    // Reset tab when selected employee changes
    useEffect(() => {
        setDetailActiveTab('info');
        setDetailOrders([]);
    }, [selectedEmployee?.id]);

    const fetchSelectedEmployeeOrders = async () => {
        if (!selectedEmployee) return;
        setDetailOrdersLoading(true);
        try {
            const queryParam = selectedEmployee.role === 'technician'
                ? `technician_id=${selectedEmployee.id}`
                : `sale_id=${selectedEmployee.id}`;
            const response = await api.get(`/orders?${queryParam}`);
            let ordersData: EmployeeOrder[] = [];
            if (Array.isArray(response.data)) {
                ordersData = response.data;
            } else if (response.data?.data?.orders && Array.isArray(response.data.data.orders)) {
                ordersData = response.data.data.orders;
            } else if (response.data?.orders && Array.isArray(response.data.orders)) {
                ordersData = response.data.orders;
            } else if (response.data?.data && Array.isArray(response.data.data)) {
                ordersData = response.data.data;
            }
            setDetailOrders(ordersData);
        } catch (error) {
            console.error('Error fetching employee orders:', error);
            setDetailOrders([]);
        } finally {
            setDetailOrdersLoading(false);
        }
    };

    // Department dialog handlers
    const handleSaveDepartment = async () => {
        if (!deptForm.name.trim()) {
            toast.error('Vui lòng nhập tên phòng ban');
            return;
        }
        setSavingDept(true);
        try {
            await createDepartment({ name: deptForm.name, description: deptForm.description, status: deptForm.status });
            toast.success('Đã tạo phòng ban mới!');
            setShowDeptDialog(false);
            setDeptForm({ name: '', description: '', status: 'active' });
            fetchDepartments();
        } catch (error) {
            toast.error('Lỗi khi tạo phòng ban');
        } finally {
            setSavingDept(false);
        }
    };

    // Job title dialog handlers
    const handleSaveJobTitle = async () => {
        if (!titleForm.name.trim()) {
            toast.error('Vui lòng nhập tên chức danh');
            return;
        }
        setSavingTitle(true);
        try {
            await createJobTitle({ name: titleForm.name, description: titleForm.description, status: titleForm.status });
            toast.success('Đã tạo chức danh mới!');
            setShowTitleDialog(false);
            setTitleForm({ name: '', description: '', status: 'active' });
            fetchJobTitles();
        } catch (error) {
            toast.error('Lỗi khi tạo chức danh');
        } finally {
            setSavingTitle(false);
        }
    };

    const fetchBranches = async () => {
        setLoadingBranches(true);
        try {
            const response = await api.get('/branches');
            const body = response.data;
            const list =
                body?.data?.branches ??
                body?.branches ??
                (Array.isArray(body?.data) ? body.data : null) ??
                (Array.isArray(body) ? body : []);
            setBranches(Array.isArray(list) ? list : []);
        } catch (error: unknown) {
            console.warn('Could not load branches (optional):', error);
            setBranches([]);
        } finally {
            setLoadingBranches(false);
        }
    };

    // Map users to employees
    const employees: Employee[] = users.map(user => ({
        ...user,
        status: (user.status as 'active' | 'inactive' | 'onleave') || 'active',
        department: user.department,
        departmentId: (user as { departmentId?: string; department_id?: string }).departmentId
            ?? (user as { department_id?: string }).department_id,
        joinDate: user.created_at?.split('T')[0],
        salary: user.salary || 0,
        commission: user.commission || 0,
        bankAccount: user.bankAccount,
        bankName: user.bankName,
        telegramChatId: (user as any).telegramChatId,
    }));

    const filteredEmployees = employees.filter(emp => {
        const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (emp.phone || '').includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || emp.status === statusFilter;
        const matchesDepartment =
            departmentFilter === 'all' ||
            (emp as Employee & { departmentId?: string }).departmentId === departmentFilter ||
            emp.department === departmentFilter ||
            departments.find((d) => d.id === departmentFilter)?.name === emp.department;
        const matchesJobTitle =
            jobTitleFilter === 'all' || emp.job_title_id === jobTitleFilter;
        return matchesSearch && matchesStatus && matchesDepartment && matchesJobTitle;
    });

    // Stats
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter(e => e.status === 'active').length;
    const onLeaveEmployees = employees.filter(e => e.status === 'onleave').length;
    const totalSalary = employees.filter(e => e.status === 'active').reduce((sum, e) => sum + (e.salary || 0), 0);

    const handleCreateEmployee = async (data: Partial<Employee>) => {
        try {
            await createUser(data as any);
            toast.success('Đã thêm nhân viên mới!');
        } catch (error) {
            toast.error('Lỗi khi thêm nhân viên');
            throw error;
        }
    };

    const handleUpdateEmployee = async (data: Partial<Employee>) => {
        if (!selectedEmployee) return;
        try {
            await updateUser(selectedEmployee.id, data as any);
            toast.success('Đã cập nhật nhân viên!');
        } catch (error: any) {
            toast.error(error?.message || 'Lỗi khi cập nhật');
            throw error;
        }
    };

    const handleViewEmployee = (emp: Employee) => {
        setDetailModalEmployee(emp);
        setShowEmployeeDetailModal(true);
    };

    const closeEmployeeDetailModal = () => {
        setShowEmployeeDetailModal(false);
        setDetailModalEmployee(null);
    };

    const handleEditEmployee = (emp: Employee) => {
        if (!canEdit) return;
        setSelectedEmployee(emp);
        setShowForm(true);
    };

    const executeDeactivateEmployee = async (emp: Employee) => {
        try {
            await updateUser(emp.id, { status: 'inactive' } as any);
            toast.success('Đã cập nhật trạng thái nghỉ việc');
            await fetchUsers();
            if (selectedEmployee?.id === emp.id) setSelectedEmployee(null);
            if (detailModalEmployee?.id === emp.id) closeEmployeeDetailModal();
        } catch {
            toast.error('Lỗi khi cập nhật trạng thái');
        }
    };

    const executeDeleteEmployee = async (emp: Employee) => {
        try {
            await deleteUser(emp.id);
            toast.success('Đã xóa nhân viên!');
            if (selectedEmployee?.id === emp.id) setSelectedEmployee(null);
            if (detailModalEmployee?.id === emp.id) closeEmployeeDetailModal();
            await fetchUsers();
        } catch {
            toast.error('Lỗi khi xóa');
        }
    };

    const handleDeactivateEmployee = (emp: Employee) => {
        setConfirmAction({ type: 'deactivate', employee: emp });
    };

    const handleDeleteEmployee = (emp: Employee) => {
        if (!canDelete) return;
        setConfirmAction({ type: 'delete', employee: emp });
    };

    const handleConfirmEmployeeAction = async () => {
        if (!confirmAction) return;
        const action = confirmAction;
        setConfirmAction(null);
        if (action.type === 'deactivate') await executeDeactivateEmployee(action.employee);
        else await executeDeleteEmployee(action.employee);
    };

    const getDepartmentName = (deptId?: string) => {
        if (!deptId) return 'Chưa phân bổ';
        const dept = departments.find(d => d.id === deptId);
        return dept?.name || deptId;
    };

    const getJobTitleName = (jobTitleId?: string) => {
        if (!jobTitleId) return 'Chưa cập nhật';
        const jobTitle = jobTitles.find(t => t.id === jobTitleId);
        return jobTitle?.name || jobTitleId;
    };

    if (loading && employees.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-6rem)] flex-col bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="shrink-0 border-b border-gray-200 bg-[#fbfcfd] px-4 py-3 space-y-3">
                <h1 className="text-[17px] font-bold text-gray-900 tracking-tight">Danh sách nhân viên</h1>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1 min-w-[140px]">
                        <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Trạng thái</Label>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-[36px] w-full min-w-[140px] bg-white border-gray-200 text-[13px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="active" className="text-[13px]">Đang làm việc</SelectItem>
                                <SelectItem value="inactive" className="text-[13px]">Đã nghỉ</SelectItem>
                                <SelectItem value="all" className="text-[13px]">Tất cả</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1 min-w-[160px] flex-1 max-w-[220px]">
                        <div className="flex items-center justify-between gap-1">
                            <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Phòng ban</Label>
                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full hover:bg-gray-200" onClick={() => { setDeptForm({ name: '', description: '', status: 'active' }); setShowDeptDialog(true); }}>
                                <Plus className="h-3 w-3 text-gray-600" />
                            </Button>
                        </div>
                        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                            <SelectTrigger className="h-[36px] w-full bg-white border-gray-200 text-[13px]">
                                <SelectValue placeholder="Tất cả phòng ban" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-[13px]">Tất cả phòng ban</SelectItem>
                                {departments.map((d) => (
                                    <SelectItem key={d.id} value={d.id} className="text-[13px]">{d.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1 min-w-[160px] flex-1 max-w-[220px]">
                        <div className="flex items-center justify-between gap-1">
                            <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Chức danh</Label>
                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full hover:bg-gray-200" onClick={() => { setTitleForm({ name: '', description: '', status: 'active' }); setShowTitleDialog(true); }}>
                                <Plus className="h-3 w-3 text-gray-600" />
                            </Button>
                        </div>
                        <Select value={jobTitleFilter} onValueChange={setJobTitleFilter}>
                            <SelectTrigger className="h-[36px] w-full bg-white border-gray-200 text-[13px]">
                                <SelectValue placeholder="Tất cả chức danh" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-[13px]">Tất cả chức danh</SelectItem>
                                {jobTitles.map((jt) => (
                                    <SelectItem key={jt.id} value={jt.id} className="text-[13px]">{jt.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1 flex-1 min-w-[200px] max-w-md">
                        <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tìm kiếm</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                className="w-full pl-9 h-[36px] border-gray-200 text-[13px] bg-white shadow-sm rounded-lg"
                                placeholder="Mã, tên, email, SĐT..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 bg-white min-h-0">
                <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-4 py-2 border-b border-gray-100 bg-white">
                        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
                            <Button
                                type="button"
                                variant={viewMode === 'table' ? 'default' : 'ghost'}
                                size="sm"
                                className={`h-8 px-3 text-[12px] rounded-md ${viewMode === 'table' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                                onClick={() => setViewMode('table')}
                            >
                                <List className="h-4 w-4 mr-1" />
                                Bảng
                            </Button>
                            <Button
                                type="button"
                                variant={viewMode === 'kanban' ? 'default' : 'ghost'}
                                size="sm"
                                className={`h-8 px-3 text-[12px] rounded-md ${viewMode === 'kanban' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                                onClick={() => setViewMode('kanban')}
                            >
                                <LayoutGrid className="h-4 w-4 mr-1" />
                                Kanban
                            </Button>
                        </div>
                        {canEdit && (
                            <Button 
                                variant="outline" 
                                className="h-[36px] px-3.5 text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 text-[13px] font-semibold rounded-lg shadow-sm"
                                onClick={() => { setSelectedEmployee(null); setShowForm(true); }}
                            >
                                <Plus className="h-4 w-4 mr-1.5" />
                                Nhân viên
                            </Button>
                        )}
                        <Button variant="outline" className="h-[36px] px-3.5 border-gray-200 bg-white text-gray-700 text-[13px] font-semibold rounded-lg shadow-sm hover:bg-gray-50 flex items-center">
                            <FileText className="h-[15px] w-[15px] mr-2 text-gray-500" />
                            Duyệt yêu cầu
                        </Button>
                        <Button variant="outline" size="icon" className="h-[36px] w-[36px] border-gray-200 bg-white text-gray-600 rounded-lg shadow-sm hover:bg-gray-50">
                            <span className="leading-none pb-2 text-[18px] font-bold">...</span>
                        </Button>
                        {viewMode === 'table' && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="icon" className="h-[36px] w-[36px] border-gray-200 bg-white text-gray-600 rounded-lg shadow-sm hover:bg-gray-50" title="Ẩn/hiện cột">
                                    <Columns3 className="h-[15px] w-[15px]" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[500px] p-4" align="end">
                                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                                    {[
                                        { id: 'avatar', label: 'Ảnh' },
                                        { id: 'code', label: 'Mã nhân viên' },
                                        { id: 'timekeepingCode', label: 'Mã chấm công' },
                                        { id: 'name', label: 'Tên nhân viên' },
                                        { id: 'phone', label: 'Số điện thoại' },
                                        { id: 'idCard', label: 'Số CMND/CCCD' },
                                        { id: 'debt', label: 'Nợ và tạm ứng' },
                                        { id: 'notes', label: 'Ghi chú' },
                                        { id: 'mobile', label: 'Thiết bị di động' },
                                    ].map((col) => (
                                        <div key={col.id} className="flex items-center gap-3">
                                            <Checkbox 
                                                id={`col-${col.id}`} 
                                                checked={columnVisibility[col.id as keyof typeof columnVisibility]} 
                                                onCheckedChange={(checked) => 
                                                    setColumnVisibility(prev => ({ ...prev, [col.id]: !!checked }))
                                                }
                                            />
                                            <Label htmlFor={`col-${col.id}`} className="text-[13px] font-medium text-gray-700 cursor-pointer">
                                                {col.label}
                                            </Label>
                                        </div>
                                    ))}
                                    {[
                                        { id: 'birthday', label: 'Ngày sinh' },
                                        { id: 'gender', label: 'Giới tính' },
                                        { id: 'email', label: 'Email' },
                                        { id: 'account', label: 'Tên đăng nhập' },
                                        { id: 'password', label: 'Mật khẩu' },
                                        { id: 'facebook', label: 'Facebook' },
                                        { id: 'position', label: 'Vị trí' },
                                        { id: 'address', label: 'Địa chỉ' },
                                        { id: 'department', label: 'Phòng ban' },
                                        { id: 'role', label: 'Chức danh' },
                                        { id: 'joinDate', label: 'Ngày bắt đầu làm việc' },
                                    ].map((col) => (
                                        <div key={col.id} className="flex items-center gap-3">
                                            <Checkbox 
                                                id={`col-${col.id}`} 
                                                checked={columnVisibility[col.id as keyof typeof columnVisibility]} 
                                                onCheckedChange={(checked) => 
                                                    setColumnVisibility(prev => ({ ...prev, [col.id]: !!checked }))
                                                }
                                            />
                                            <Label htmlFor={`col-${col.id}`} className="text-[13px] font-medium text-gray-700 cursor-pointer">
                                                {col.label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                        )}

                    </div>

                {viewMode === 'kanban' ? (
                    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                        <EmployeeDepartmentKanban
                            employees={filteredEmployees}
                            departments={[...departments].sort((a, b) => a.name.localeCompare(b.name, 'vi'))}
                            getJobTitleName={getJobTitleName}
                            onView={handleViewEmployee}
                            onEdit={canEdit ? handleEditEmployee : undefined}
                            onDelete={canDelete ? handleDeleteEmployee : undefined}
                        />
                    </div>
                ) : (
                <>
                {/* Mobile list */}
                <div className="lg:hidden flex-1 overflow-auto p-3">
                    <MobileEmployeesList
                        employees={filteredEmployees.map((emp) => ({
                            id: emp.id,
                            name: emp.name,
                            email: emp.email,
                            phone: emp.phone,
                            employee_code: emp.employee_code,
                            status: emp.status,
                            avatar: emp.avatar,
                            job_titles: emp.job_title_id
                                ? { name: getJobTitleName(emp.job_title_id) }
                                : undefined,
                            departments: emp.department
                                ? { name: getDepartmentName(emp.department) }
                                : undefined,
                        }))}
                        loading={loading}
                        onView={(e) => handleViewEmployee(e as Employee)}
                        onEdit={canEdit ? (e) => handleEditEmployee(e as Employee) : undefined}
                        onDelete={canDelete ? (e) => handleDeleteEmployee(e as Employee) : undefined}
                    />
                </div>

                {/* Table Area */}
                <div className="hidden lg:block flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-[#f2f6ff] sticky top-0 z-10 box-border">
                            <tr>
                                <th className="px-4 py-3 font-semibold text-gray-700 w-10 border-b border-gray-100">
                                    <input type="checkbox" className="w-[14px] h-[14px] rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                </th>
                                {columnVisibility.avatar && <th className="px-2 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 uppercase tracking-widest text-center">Ảnh</th>}
                                {columnVisibility.code && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">MÃ NHÂN VIÊN</th>}
                                {columnVisibility.timekeepingCode && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">MÃ CHẤM CÔNG</th>}
                                {columnVisibility.name && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">TÊN NHÂN VIÊN</th>}
                                {columnVisibility.phone && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">SỐ ĐIỆN THOẠI</th>}
                                {columnVisibility.idCard && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">SỐ CMND/CCCD</th>}
                                {columnVisibility.debt && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-right">NỢ VÀ TẠM ỨNG</th>}
                                {columnVisibility.notes && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">GHI CHÚ</th>}
                                {columnVisibility.mobile && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">THIẾT BỊ DI ĐỘNG</th>}
                                {columnVisibility.birthday && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">NGÀY SINH</th>}
                                {columnVisibility.gender && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">GIỚI TÍNH</th>}
                                {columnVisibility.email && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">EMAIL</th>}
                                {columnVisibility.account && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">TÊN ĐĂNG NHẬP</th>}
                                {columnVisibility.password && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">MẬT KHẨU</th>}
                                {columnVisibility.facebook && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">FACEBOOK</th>}
                                {columnVisibility.address && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">ĐỊA CHỈ</th>}
                                {columnVisibility.position && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">VỊ TRÍ</th>}
                                {columnVisibility.department && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">PHÒNG BAN</th>}
                                {columnVisibility.role && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">CHỨC DANH</th>}
                                {columnVisibility.joinDate && <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">NGÀY VÀO LÀM</th>}
                                <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-center sticky right-0 bg-[#f2f6ff] min-w-[120px]">
                                    THAO TÁC
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {filteredEmployees.map((emp, index) => {
                                const isExpanded = selectedEmployee?.id === emp.id;
                                const totalCols = Object.values(columnVisibility).filter(v => v).length + 2;
                                return (
                                <React.Fragment key={emp.id}>
                                <tr className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`} onClick={(e) => {
                                    if ((e.target as HTMLElement).tagName !== 'INPUT') {
                                        setSelectedEmployee(prev => prev?.id === emp.id ? null : emp);
                                    }
                                }}>
                                    <td className="px-4 py-[13px]">
                                        <input type="checkbox" className="w-[14px] h-[14px] rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" onClick={(e) => e.stopPropagation()} />
                                    </td>
                                    {columnVisibility.avatar && (
                                        <td className="px-2 py-[13px] text-center">
                                            <Avatar className="h-[26px] w-[26px] rounded bg-gray-200 inline-block overflow-hidden">
                                                {emp.avatar ? (
                                                    <img src={emp.avatar} alt="avatar" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100 shadow-inner">
                                                        {emp.name.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                            </Avatar>
                                        </td>
                                    )}
                                    {columnVisibility.code && (
                                        <td className="px-4 py-[13px] text-gray-800 font-medium text-[13px]">
                                            {(emp as any).employee_code || `NV${String(index + 1).padStart(3, '0')}`}
                                        </td>
                                    )}
                                    {columnVisibility.timekeepingCode && (
                                        <td className="px-4 py-[13px] text-gray-800 font-medium text-[13px]">
                                            {(emp as any).attendance_code || (emp as any).employee_code || `NV${String(emp.id || '').slice(0, 6).toUpperCase()}`}
                                        </td>
                                    )}
                                    {columnVisibility.name && (
                                        <td className="px-4 py-[13px] font-medium text-gray-800 text-[13px] uppercase">
                                            {emp.name}
                                        </td>
                                    )}
                                    {columnVisibility.phone && (
                                        <td className="px-4 py-[13px] text-gray-600 text-[13px] font-medium">
                                            {emp.phone || ''}
                                        </td>
                                    )}
                                    {columnVisibility.idCard && (
                                        <td className="px-4 py-[13px] text-gray-600 text-[13px]">
                                            {/* Mock CCCD */}
                                        </td>
                                    )}
                                    {columnVisibility.debt && (
                                        <td className="px-4 py-[13px] text-gray-800 text-[13px] font-medium text-right">
                                            0
                                        </td>
                                    )}
                                    {columnVisibility.notes && (
                                        <td className="px-4 py-[13px] text-gray-600 text-[13px]">
                                        </td>
                                    )}
                                    {columnVisibility.mobile && <td className="px-4 py-[13px] text-gray-600 text-[13px]"></td>}
                                    {columnVisibility.birthday && <td className="px-4 py-[13px] text-gray-600 text-[13px]"></td>}
                                    {columnVisibility.gender && <td className="px-4 py-[13px] text-gray-600 text-[13px]"></td>}
                                    {columnVisibility.email && <td className="px-4 py-[13px] text-gray-600 text-[13px]">{emp.email}</td>}
                                    {columnVisibility.account && (
                                        <td className="px-4 py-[13px] text-gray-600 text-[13px]">
                                            {emp.email}
                                        </td>
                                    )}
                                    {columnVisibility.password && (
                                        <td className="px-4 py-[13px] text-gray-500 text-[13px] font-mono">
                                            ••••••
                                        </td>
                                    )}
                                    {columnVisibility.facebook && <td className="px-4 py-[13px] text-gray-600 text-[13px]"></td>}
                                    {columnVisibility.address && <td className="px-4 py-[13px] text-gray-600 text-[13px]"></td>}
                                    {columnVisibility.position && (
                                        <td className="px-4 py-[13px] text-gray-600 text-[13px]">
                                            {getJobTitleName(emp.job_title_id)}
                                        </td>
                                    )}
                                    {columnVisibility.department && (
                                        <td className="px-4 py-[13px] text-gray-600 text-[13px]">
                                            {getDepartmentName(emp.department)}
                                        </td>
                                    )}
                                    {columnVisibility.role && (
                                        <td className="px-4 py-[13px] text-gray-600 text-[13px]">
                                            {roleLabels[emp.role]}
                                        </td>
                                    )}
                                    {columnVisibility.joinDate && (
                                        <td className="px-4 py-[13px] text-gray-600 text-[13px]">
                                            {emp.joinDate}
                                        </td>
                                    )}
                                    <td
                                        className={`px-2 py-[13px] sticky right-0 border-l border-gray-100 ${isExpanded ? 'bg-blue-50' : 'bg-white'}`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-center gap-0.5">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                                title="Xem"
                                                onClick={() => handleViewEmployee(emp)}
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                                title="Sửa"
                                                onClick={() => handleEditEmployee(emp)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                                title="Xóa"
                                                onClick={() => handleDeleteEmployee(emp)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                                {/* Expandable detail row - appears right below the clicked employee */}
                                {isExpanded && (
                                    <tr className="bg-[#f8faff]">
                                        <td colSpan={totalCols} className="p-0 border-b-2 border-blue-200">
                                            <div className="whitespace-normal">
                                                {/* Detail Header */}
                                                <div className="flex items-center justify-between px-5 py-3 border-b border-blue-100/50 bg-gradient-to-r from-blue-50/80 to-transparent">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-9 w-9 rounded-full border-2 border-blue-200 shadow-sm">
                                                            {emp.avatar ? (
                                                                <img src={emp.avatar} alt="avatar" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <AvatarFallback className="bg-blue-100 text-blue-700 text-sm font-bold">{emp.name.charAt(0)}</AvatarFallback>
                                                            )}
                                                        </Avatar>
                                                        <div>
                                                            <h3 className="text-[15px] font-bold text-gray-900">{emp.name}</h3>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <Badge variant={emp.role === 'manager' ? 'purple' : emp.role === 'sale' ? 'info' : 'secondary'} className="text-[10px] px-1.5 py-0">
                                                                    {roleLabels[emp.role]}
                                                                </Badge>
                                                                <Badge variant={statusLabels[emp.status]?.variant || 'secondary'} className="text-[10px] px-1.5 py-0">
                                                                    {statusLabels[emp.status]?.label || emp.status}
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 text-[12px]"
                                                            onClick={(e) => { e.stopPropagation(); handleEditEmployee(emp); }}
                                                        >
                                                            <Edit className="h-3.5 w-3.5 mr-1" />
                                                            Sửa
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 text-[12px] text-red-600 border-red-200 hover:bg-red-50"
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp); }}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                            Xóa
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600" onClick={(e) => { e.stopPropagation(); setSelectedEmployee(null); }}>
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                {/* Detail Tabs */}
                                                <div className="flex border-b border-gray-100 bg-white px-2">
                                                    <button
                                                        className={`px-4 py-2.5 text-[13px] font-medium transition-colors relative ${detailActiveTab === 'info' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                                                        onClick={(e) => { e.stopPropagation(); setDetailActiveTab('info'); }}
                                                    >
                                                        Thông tin
                                                        {detailActiveTab === 'info' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t" />}
                                                    </button>
                                                    <button
                                                        className={`px-4 py-2.5 text-[13px] font-medium transition-colors relative ${detailActiveTab === 'schedule' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                                                        onClick={(e) => { e.stopPropagation(); setDetailActiveTab('schedule'); }}
                                                    >
                                                        Lịch làm việc
                                                        {detailActiveTab === 'schedule' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t" />}
                                                    </button>
                                                    <button
                                                        className={`px-4 py-2.5 text-[13px] font-medium transition-colors relative ${detailActiveTab === 'salary_setup' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                                                        onClick={(e) => { e.stopPropagation(); setDetailActiveTab('salary_setup'); }}
                                                    >
                                                        Thiết lập lương
                                                        {detailActiveTab === 'salary_setup' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t" />}
                                                    </button>
                                                    <button
                                                        className={`px-4 py-2.5 text-[13px] font-medium transition-colors relative ${detailActiveTab === 'payslip' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                                                        onClick={(e) => { e.stopPropagation(); setDetailActiveTab('payslip'); }}
                                                    >
                                                        Phiếu lương
                                                        {detailActiveTab === 'payslip' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t" />}
                                                    </button>
                                                    <button
                                                        className={`px-4 py-2.5 text-[13px] font-medium transition-colors relative ${detailActiveTab === 'debt' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                                                        onClick={(e) => { e.stopPropagation(); setDetailActiveTab('debt'); }}
                                                    >
                                                        Nợ và tạm ứng
                                                        {detailActiveTab === 'debt' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600 rounded-t" />}
                                                    </button>
                                                </div>

                                                {/* Detail Content */}
                                                <div className="" style={{ height: 'auto' }}>
                                                    {detailActiveTab === 'info' && (
                                                        <div className="p-5">
                                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
                                                                {/* Col 1 */}
                                                                <div className="space-y-4">
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Mã nhân viên</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">{emp.employee_code || 'Chưa cập nhật'}</p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Giới tính</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">{emp.gender || 'Chưa cập nhật'}</p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Ngày bắt đầu làm việc</p>
                                                                        <p className="text-[13px] font-medium text-gray-800 flex items-center gap-1.5">
                                                                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                                            {emp.joinDate || 'Chưa cập nhật'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Số điện thoại</p>
                                                                        <p className="text-[13px] font-medium text-gray-800 flex items-center gap-1.5">
                                                                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                                                                            {emp.phone || 'Chưa cập nhật'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Thiết bị di động</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">{emp.mobile_device || 'Chưa cập nhật'}</p>
                                                                    </div>
                                                                </div>

                                                                {/* Col 2 */}
                                                                <div className="space-y-4">
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Tên nhân viên</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">{emp.name}</p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Số CMND/CCCD</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">{emp.identity_card || 'Chưa cập nhật'}</p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Chi nhánh trả lương</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">
                                                                            {branches.find(b => b.id === emp.payroll_branch_id)?.name || 'Chưa cập nhật'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Email</p>
                                                                        <p className="text-[13px] font-medium text-gray-800 flex items-center gap-1.5">
                                                                            <Mail className="h-3.5 w-3.5 text-gray-400" />
                                                                            {emp.email}
                                                                        </p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Ghi chú</p>
                                                                        <p className="text-[13px] font-medium text-gray-800 line-clamp-2" title={emp.notes || undefined}>{emp.notes || 'Không có'}</p>
                                                                    </div>
                                                                </div>

                                                                {/* Col 3 */}
                                                                <div className="space-y-4">
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Mã chấm công</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">{emp.timekeeping_code || 'Chưa có'}</p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Phòng ban</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">{getDepartmentName(emp.department)}</p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Chi nhánh làm việc</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">
                                                                            {branches.find(b => b.id === emp.working_branch_id)?.name || 'Chưa cập nhật'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Facebook</p>
                                                                        <p className="text-[13px] font-medium text-blue-600 line-clamp-1">{emp.facebook || 'Chưa cập nhật'}</p>
                                                                    </div>
                                                                </div>

                                                                {/* Col 4 */}
                                                                <div className="space-y-4">
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Ngày sinh</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">{emp.dob || 'Chưa cập nhật'}</p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Chức danh</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">
                                                                            {jobTitles.find(t => t.id === emp.job_title_id)?.name || 'Chưa cập nhật'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Tài khoản KiotViet</p>
                                                                        <p className="text-[13px] font-medium text-gray-800">{emp.kiotviet_account || 'Chưa cập nhật'}</p>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Địa chỉ</p>
                                                                        <p className="text-[13px] font-medium text-gray-800 line-clamp-2" title={emp.address || undefined}>{emp.address || 'Chưa cập nhật'}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {/* Actions footer */}
                                                            <div className="mt-6 flex flex-wrap justify-end gap-2">
                                                                <Button
                                                                    variant="outline"
                                                                    className="h-9 px-4 text-[13px] text-gray-700 bg-white border-gray-300 hover:bg-gray-50 font-medium shadow-sm"
                                                                    onClick={(e) => { e.stopPropagation(); handleDeactivateEmployee(emp); }}
                                                                >
                                                                    Ngừng làm việc
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    className="h-9 px-4 text-[13px] font-medium shadow-sm flex items-center gap-1.5"
                                                                    onClick={(e) => { e.stopPropagation(); handleEditEmployee(emp); }}
                                                                >
                                                                    <Edit className="h-3.5 w-3.5" />
                                                                    Sửa
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    className="h-9 px-4 text-[13px] text-red-600 border-red-200 hover:bg-red-50 font-medium shadow-sm flex items-center gap-1.5"
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp); }}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                    Xóa
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {detailActiveTab === 'orders' && (
                                                        <div className="p-5">
                                                            {detailOrdersLoading ? (
                                                                <div className="flex items-center justify-center py-8">
                                                                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                                                                </div>
                                                            ) : detailOrders.length === 0 ? (
                                                                <div className="text-center py-8 text-gray-400">
                                                                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                                    <p className="text-[13px]">Nhân viên chưa có đơn hàng nào</p>
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-2">
                                                                    {detailOrders.map((order) => {
                                                                        const statusInfo = orderStatusLabels[order.status] || { label: order.status, variant: 'secondary' as const };
                                                                        return (
                                                                            <div
                                                                                key={order.id}
                                                                                className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-white hover:border-blue-100 hover:shadow-sm transition-all cursor-pointer"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedOrder(order as unknown as Order);
                                                                                    setShowOrderDetail(true);
                                                                                }}
                                                                            >
                                                                                <div className="flex items-center gap-3">
                                                                                    <span className="font-semibold font-mono text-[13px] text-gray-800">{order.order_code}</span>
                                                                                    <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
                                                                                    {order.customer && (
                                                                                        <span className="text-[12px] text-gray-500">KH: {order.customer.name}</span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex items-center gap-3">
                                                                                    <span className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString('vi-VN')}</span>
                                                                                    <span className="font-bold text-[13px] text-blue-600">{formatCurrency(order.total_amount)}</span>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Tab Lịch làm việc */}
                                                    {detailActiveTab === 'schedule' && emp && (
                                                        <EmployeeScheduleTab employeeId={emp.id} />
                                                    )}

                                                    {/* Tab Thiết lập lương */}
                                                    {detailActiveTab === 'salary_setup' && emp && (
                                                        <EmployeeSalaryTab employeeId={emp.id} />
                                                    )}

                                                    {/* Các sub-tabs đang phát triển */}
                                                    {(detailActiveTab === 'payslip' || detailActiveTab === 'debt') && (
                                                        <div className="p-10 flex flex-col items-center justify-center text-center">
                                                            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                                                                <FileText className="h-6 w-6 text-blue-300" />
                                                            </div>
                                                            <h3 className="text-sm font-medium text-gray-900 mb-1">
                                                                {detailActiveTab === 'payslip' ? 'Phiếu lương' : 'Nợ và tạm ứng'}
                                                            </h3>
                                                            <p className="text-xs text-gray-500">
                                                                Tính năng này đang trong quá trình phát triển và sẽ sớm ra mắt.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </React.Fragment>
                                );
                            })}
                            {filteredEmployees.length === 0 && (
                                <tr>
                                    <td colSpan={Object.values(columnVisibility).filter(v => v).length + 2} className="px-4 py-8 text-center text-[13px] text-gray-500">
                                        Không tìm thấy nhân viên nào
                                    </td>
                                </tr>
                            )}

                        </tbody>
                    </table>
                </div>
                </>
                )}
            </div>
            
            {/* Dialogs */}
            <EmployeeDetailDialog
                open={showEmployeeDetailModal}
                onClose={closeEmployeeDetailModal}
                employee={detailModalEmployee}
                departments={departments}
                getJobTitleName={getJobTitleName}
                branches={branches}
                onEdit={(emp) => {
                    closeEmployeeDetailModal();
                    handleEditEmployee(emp);
                }}
                onDelete={handleDeleteEmployee}
            />
            <EmployeeFormDialog
                open={showForm}
                onClose={() => { setShowForm(false); setSelectedEmployee(null); }}
                employee={selectedEmployee}
                departments={departments}
                jobTitles={jobTitles}
                onSubmit={selectedEmployee ? handleUpdateEmployee : handleCreateEmployee}
                onCreateDepartment={async (data) => {
                    const created = await createDepartment(data as any);
                    await fetchDepartments();
                    return { id: created.id };
                }}
                onCreateJobTitle={async (data) => {
                    const created = await createJobTitle(data as any);
                    await fetchJobTitles();
                    return { id: created.id };
                }}
                users={users.map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role }))}
                onRefreshUsers={() => fetchUsers()}
            />
            {/* Order Detail Dialog */}
            <OrderDetailDialog
                order={selectedOrder}
                open={showOrderDetail}
                onClose={() => {
                    setShowOrderDetail(false);
                    setSelectedOrder(null);
                }}
            />

            <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[17px] font-bold text-gray-900">
                            {confirmAction?.type === 'delete' ? 'Xác nhận xóa nhân viên' : 'Xác nhận ngừng làm việc'}
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-gray-600">
                            {confirmAction?.type === 'delete'
                                ? `Bạn có chắc muốn xóa nhân viên "${confirmAction.employee.name}"? Hành động này không thể hoàn tác.`
                                : `Xác nhận chuyển "${confirmAction?.employee.name}" sang trạng thái ngừng làm việc?`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmAction(null)} className="text-[13px]">
                            Hủy
                        </Button>
                        <Button
                            onClick={handleConfirmEmployeeAction}
                            className={confirmAction?.type === 'delete' ? 'bg-red-600 hover:bg-red-700 text-white text-[13px]' : 'bg-blue-600 hover:bg-blue-700 text-white text-[13px]'}
                        >
                            {confirmAction?.type === 'delete' ? 'Xóa nhân viên' : 'Ngừng làm việc'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog Thêm mới phòng ban */}
            <Dialog open={showDeptDialog} onOpenChange={setShowDeptDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[17px] font-bold">Thêm mới phòng ban</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 py-2">
                        <div className="flex items-center gap-4">
                            <Label className="w-[100px] text-[13px] font-medium text-gray-700 shrink-0">Tên phòng ban</Label>
                            <Input
                                className="flex-1 h-[38px] text-[13px] border-gray-200"
                                value={deptForm.name}
                                onChange={(e) => setDeptForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder=""
                            />
                        </div>
                        <div className="flex items-start gap-4">
                            <Label className="w-[100px] text-[13px] font-medium text-gray-700 shrink-0 pt-2">Mô tả</Label>
                            <textarea
                                className="flex-1 min-h-[72px] px-3 py-2 text-[13px] border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={deptForm.description}
                                onChange={(e) => setDeptForm(prev => ({ ...prev, description: e.target.value }))}
                            />
                        </div>
                        <div className="flex items-center gap-4">
                            <Label className="w-[100px] text-[13px] font-medium text-gray-700 shrink-0">Trạng thái</Label>
                            <div className="flex items-center gap-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="dept-status"
                                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                        checked={deptForm.status === 'active'}
                                        onChange={() => setDeptForm(prev => ({ ...prev, status: 'active' }))}
                                    />
                                    <span className="text-[13px] text-gray-700">Hoạt động</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="dept-status"
                                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                        checked={deptForm.status === 'inactive'}
                                        onChange={() => setDeptForm(prev => ({ ...prev, status: 'inactive' }))}
                                    />
                                    <span className="text-[13px] text-gray-700">Ngừng hoạt động</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => setShowDeptDialog(false)} className="text-[13px]">Bỏ qua</Button>
                        <Button onClick={handleSaveDepartment} disabled={savingDept} className="bg-blue-600 hover:bg-blue-700 text-[13px]">
                            {savingDept ? 'Đang lưu...' : 'Lưu'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog Thêm mới chức danh */}
            <Dialog open={showTitleDialog} onOpenChange={setShowTitleDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[17px] font-bold">Thêm mới chức danh</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 py-2">
                        <div className="flex items-center gap-4">
                            <Label className="w-[100px] text-[13px] font-medium text-gray-700 shrink-0">Tên chức danh</Label>
                            <Input
                                className="flex-1 h-[38px] text-[13px] border-gray-200"
                                value={titleForm.name}
                                onChange={(e) => setTitleForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder=""
                            />
                        </div>
                        <div className="flex items-start gap-4">
                            <Label className="w-[100px] text-[13px] font-medium text-gray-700 shrink-0 pt-2">Mô tả</Label>
                            <textarea
                                className="flex-1 min-h-[72px] px-3 py-2 text-[13px] border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={titleForm.description}
                                onChange={(e) => setTitleForm(prev => ({ ...prev, description: e.target.value }))}
                            />
                        </div>
                        <div className="flex items-center gap-4">
                            <Label className="w-[100px] text-[13px] font-medium text-gray-700 shrink-0">Trạng thái</Label>
                            <div className="flex items-center gap-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="title-status"
                                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                        checked={titleForm.status === 'active'}
                                        onChange={() => setTitleForm(prev => ({ ...prev, status: 'active' }))}
                                    />
                                    <span className="text-[13px] text-gray-700">Hoạt động</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="title-status"
                                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                        checked={titleForm.status === 'inactive'}
                                        onChange={() => setTitleForm(prev => ({ ...prev, status: 'inactive' }))}
                                    />
                                    <span className="text-[13px] text-gray-700">Ngừng hoạt động</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => setShowTitleDialog(false)} className="text-[13px]">Bỏ qua</Button>
                        <Button onClick={handleSaveJobTitle} disabled={savingTitle} className="bg-blue-600 hover:bg-blue-700 text-[13px]">
                            {savingTitle ? 'Đang lưu...' : 'Lưu'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

