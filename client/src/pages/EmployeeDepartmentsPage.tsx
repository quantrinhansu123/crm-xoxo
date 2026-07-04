import { useEffect, useMemo, useState } from 'react';
import { Building2, Crown, Loader2, Plus, Save, UserPlus, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useDepartments, type Department } from '@/hooks/useDepartments';
import { useUsers } from '@/hooks/useUsers';
import { useViewActionForRoles } from '@/hooks/useViewAction';
import { toast } from 'sonner';
import type { User } from '@/types';

interface EmployeeLike extends User {
    departmentId?: string;
    department_id?: string;
}

const MANAGER_ROLES = new Set(['admin', 'manager']);

function normalizeText(value?: string | null) {
    return (value || '').trim().toLowerCase();
}

export function EmployeeDepartmentsPage() {
    const { departments, fetchDepartments, createDepartment, updateDepartment, deleteDepartment, loading: deptLoading } = useDepartments();
    const { users, fetchUsers, updateUser, loading: userLoading } = useUsers();
    const { canEdit, canDelete } = useViewActionForRoles('employees', ['admin', 'manager']);

    const [selectedDeptId, setSelectedDeptId] = useState<string>('');
    const [searchAvailable, setSearchAvailable] = useState('');
    const [searchMembers, setSearchMembers] = useState('');

    const [showDeptDialog, setShowDeptDialog] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
    const [deptName, setDeptName] = useState('');
    const [deptDescription, setDeptDescription] = useState('');
    const [deptStatus, setDeptStatus] = useState<'active' | 'inactive'>('active');
    const [deptManagerId, setDeptManagerId] = useState('none');

    const [savingDept, setSavingDept] = useState(false);
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const [updatingManager, setUpdatingManager] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            await Promise.all([fetchDepartments(), fetchUsers()]);
        };
        loadData();
    }, [fetchDepartments, fetchUsers]);

    useEffect(() => {
        if (!selectedDeptId && departments.length > 0) {
            setSelectedDeptId(departments[0].id);
        }
        if (selectedDeptId && !departments.some((department) => department.id === selectedDeptId)) {
            setSelectedDeptId(departments[0]?.id || '');
        }
    }, [departments, selectedDeptId]);

    const activeUsers = useMemo(
        () => (users as EmployeeLike[]).filter((user) => user.status !== 'inactive'),
        [users],
    );

    const selectedDepartment = useMemo(
        () => departments.find((department) => department.id === selectedDeptId) || null,
        [departments, selectedDeptId],
    );

    const resolveUserDepartmentId = (user: EmployeeLike): string | null => {
        const rawId = (user.departmentId || user.department_id || '').trim();
        if (rawId && departments.some((department) => department.id === rawId)) {
            return rawId;
        }

        const legacy = (user.department || '').trim();
        if (!legacy) return null;

        if (departments.some((department) => department.id === legacy)) {
            return legacy;
        }

        const byName = departments.find((department) => normalizeText(department.name) === normalizeText(legacy));
        return byName?.id || null;
    };

    const members = useMemo(() => {
        if (!selectedDeptId) return [] as EmployeeLike[];
        return activeUsers
            .filter((user) => resolveUserDepartmentId(user) === selectedDeptId)
            .filter((user) => normalizeText(user.name).includes(normalizeText(searchMembers)))
            .sort((first, second) => first.name.localeCompare(second.name, 'vi'));
    }, [activeUsers, selectedDeptId, searchMembers, departments]);

    const availableUsers = useMemo(() => {
        if (!selectedDeptId) return [] as EmployeeLike[];
        return activeUsers
            .filter((user) => resolveUserDepartmentId(user) !== selectedDeptId)
            .filter((user) => normalizeText(user.name).includes(normalizeText(searchAvailable)))
            .sort((first, second) => first.name.localeCompare(second.name, 'vi'));
    }, [activeUsers, selectedDeptId, searchAvailable, departments]);

    const managerCandidates = useMemo(() => {
        return activeUsers
            .filter((user) => MANAGER_ROLES.has(user.role))
            .sort((first, second) => first.name.localeCompare(second.name, 'vi'));
    }, [activeUsers]);

    const openCreateDialog = () => {
        setEditingDepartment(null);
        setDeptName('');
        setDeptDescription('');
        setDeptStatus('active');
        setDeptManagerId('none');
        setShowDeptDialog(true);
    };

    const openEditDialog = (department: Department) => {
        setEditingDepartment(department);
        setDeptName(department.name || '');
        setDeptDescription(department.description || '');
        setDeptStatus(department.status || 'active');
        setDeptManagerId(department.manager_id || 'none');
        setShowDeptDialog(true);
    };

    const reloadAll = async () => {
        await Promise.all([fetchDepartments(), fetchUsers()]);
    };

    const ensureManagerBelongsToDepartment = async (managerId: string, department: Department) => {
        const manager = activeUsers.find((user) => user.id === managerId);
        if (!manager) return;

        const managerDeptId = resolveUserDepartmentId(manager);
        if (managerDeptId === department.id) return;

        await updateUser(manager.id, { departmentId: department.id, department: department.name } as any);
    };

    const handleSaveDepartment = async () => {
        if (!deptName.trim()) {
            toast.error('Vui lòng nhập tên phòng ban');
            return;
        }

        setSavingDept(true);
        try {
            const payload = {
                name: deptName.trim(),
                description: deptDescription.trim() || undefined,
                status: deptStatus,
                manager_id: deptManagerId === 'none' ? null : deptManagerId,
            };

            if (editingDepartment) {
                if (deptManagerId !== 'none') {
                    await ensureManagerBelongsToDepartment(deptManagerId, editingDepartment);
                }
                await updateDepartment(editingDepartment.id, payload);
                toast.success('Đã cập nhật phòng ban');
            } else {
                const createdDepartment = await createDepartment(payload);
                if (deptManagerId !== 'none') {
                    await ensureManagerBelongsToDepartment(deptManagerId, createdDepartment);
                    await updateDepartment(createdDepartment.id, { manager_id: deptManagerId });
                }
                toast.success('Đã tạo phòng ban');
            }

            setShowDeptDialog(false);
            await reloadAll();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Không thể lưu phòng ban';
            toast.error(message);
        } finally {
            setSavingDept(false);
        }
    };

    const handleDeleteDepartment = async (department: Department) => {
        if (!canDelete) return;
        if (!confirm(`Bạn có chắc muốn xóa phòng ban "${department.name}"?`)) return;

        try {
            await deleteDepartment(department.id);
            toast.success('Đã xóa phòng ban');
            await reloadAll();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Không thể xóa phòng ban';
            toast.error(message);
        }
    };

    const handleAssignUser = async (user: EmployeeLike) => {
        if (!selectedDepartment || !canEdit) return;

        setUpdatingUserId(user.id);
        try {
            await updateUser(user.id, {
                departmentId: selectedDepartment.id,
                department: selectedDepartment.name,
            } as any);
            await reloadAll();
            toast.success(`Đã thêm ${user.name} vào ${selectedDepartment.name}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Không thể thêm nhân viên vào phòng';
            toast.error(message);
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleUnassignUser = async (user: EmployeeLike) => {
        if (!selectedDepartment || !canEdit) return;

        setUpdatingUserId(user.id);
        try {
            if (selectedDepartment.manager_id === user.id) {
                const shouldClear = confirm(`${user.name} đang là trưởng phòng. Bỏ khỏi phòng sẽ xóa thiết lập trưởng phòng. Tiếp tục?`);
                if (!shouldClear) return;
                await updateDepartment(selectedDepartment.id, { manager_id: null });
            }

            await updateUser(user.id, {
                departmentId: null,
                department: null,
            } as any);

            await reloadAll();
            toast.success(`Đã bỏ ${user.name} khỏi ${selectedDepartment.name}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Không thể bỏ nhân viên khỏi phòng';
            toast.error(message);
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleChangeManager = async (nextManagerId: string) => {
        if (!selectedDepartment || !canEdit) return;

        setUpdatingManager(true);
        try {
            if (nextManagerId !== 'none') {
                await ensureManagerBelongsToDepartment(nextManagerId, selectedDepartment);
            }

            await updateDepartment(selectedDepartment.id, {
                manager_id: nextManagerId === 'none' ? null : nextManagerId,
            });

            await reloadAll();
            toast.success('Đã cập nhật trưởng phòng');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Không thể cập nhật trưởng phòng';
            toast.error(message);
        } finally {
            setUpdatingManager(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-[17px] font-bold text-gray-900 tracking-tight">Quản lý phòng ban</h1>
                    <p className="text-sm text-muted-foreground">Quản lý danh sách phòng ban, gán nhân sự và thiết lập trưởng phòng.</p>
                </div>
                {canEdit && (
                    <Button onClick={openCreateDialog}>
                        <Plus className="h-4 w-4 mr-2" />
                        Tạo phòng ban
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <Card className="xl:col-span-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Danh sách phòng ban</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {deptLoading ? (
                            <div className="h-32 flex items-center justify-center text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Đang tải phòng ban...
                            </div>
                        ) : departments.length === 0 ? (
                            <div className="h-32 rounded-md border border-dashed flex flex-col items-center justify-center text-muted-foreground text-sm">
                                <Building2 className="h-5 w-5 mb-2" />
                                Chưa có phòng ban nào
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[65vh] overflow-auto pr-1">
                                {departments.map((department) => {
                                    const count = activeUsers.filter((user) => resolveUserDepartmentId(user) === department.id).length;
                                    const isActive = selectedDeptId === department.id;

                                    return (
                                        <div
                                            key={department.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setSelectedDeptId(department.id)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    setSelectedDeptId(department.id);
                                                }
                                            }}
                                            className={`rounded-lg border p-3 cursor-pointer transition ${isActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="font-medium truncate">{department.name}</div>
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        {department.manager?.name ? `Trưởng phòng: ${department.manager.name}` : 'Chưa có trưởng phòng'}
                                                    </div>
                                                </div>
                                                <Badge variant={department.status === 'active' ? 'success' : 'secondary'}>
                                                    {department.status === 'active' ? 'Hoạt động' : 'Ngưng'}
                                                </Badge>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                                <span>{count} nhân sự</span>
                                                <div className="flex items-center gap-2">
                                                    {canEdit && (
                                                        <button
                                                            className="text-blue-600 hover:underline"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                openEditDialog(department);
                                                            }}
                                                        >
                                                            Sửa
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            className="text-red-600 hover:underline"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                handleDeleteDepartment(department);
                                                            }}
                                                        >
                                                            Xóa
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="xl:col-span-8">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{selectedDepartment?.name || 'Chọn phòng ban'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!selectedDepartment ? (
                            <div className="h-48 rounded-md border border-dashed flex items-center justify-center text-muted-foreground text-sm">
                                Chọn một phòng ban để quản lý nhân sự
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Trưởng phòng</Label>
                                        <Select
                                            value={selectedDepartment.manager_id || 'none'}
                                            onValueChange={handleChangeManager}
                                            disabled={!canEdit || updatingManager}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Chọn trưởng phòng" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Chưa có</SelectItem>
                                                {managerCandidates.map((user) => (
                                                    <SelectItem key={user.id} value={user.id}>
                                                        {user.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[11px] text-muted-foreground mt-1">Nếu người được chọn chưa thuộc phòng, hệ thống sẽ tự chuyển vào phòng này.</p>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Mô tả</Label>
                                        <div className="text-sm rounded-md border bg-muted/30 px-3 py-2 min-h-[40px]">
                                            {selectedDepartment.description || 'Không có mô tả'}
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold">Nhân sự trong phòng ({members.length})</h3>
                                        </div>
                                        <Input
                                            placeholder="Tìm nhân sự trong phòng..."
                                            value={searchMembers}
                                            onChange={(event) => setSearchMembers(event.target.value)}
                                        />
                                        <div className="space-y-2 max-h-[45vh] overflow-auto pr-1">
                                            {members.length === 0 ? (
                                                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                                                    Chưa có nhân sự trong phòng
                                                </div>
                                            ) : members.map((user) => {
                                                const isManager = selectedDepartment.manager_id === user.id;

                                                return (
                                                    <div key={user.id} className="rounded-md border px-3 py-2 flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-sm truncate">{user.name}</div>
                                                            <div className="text-xs text-muted-foreground truncate">{user.role}</div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {isManager && (
                                                                <Badge variant="warning" className="text-xs">
                                                                    <Crown className="h-3 w-3 mr-1" />
                                                                    Trưởng phòng
                                                                </Badge>
                                                            )}
                                                            {canEdit && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => handleUnassignUser(user)}
                                                                    disabled={updatingUserId === user.id}
                                                                >
                                                                    {updatingUserId === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold">Nhân sự chưa thuộc phòng này ({availableUsers.length})</h3>
                                        <Input
                                            placeholder="Tìm nhân sự để thêm..."
                                            value={searchAvailable}
                                            onChange={(event) => setSearchAvailable(event.target.value)}
                                        />
                                        <div className="space-y-2 max-h-[45vh] overflow-auto pr-1">
                                            {userLoading ? (
                                                <div className="rounded-md border p-4 text-sm text-muted-foreground text-center">
                                                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                                    Đang tải nhân sự...
                                                </div>
                                            ) : availableUsers.length === 0 ? (
                                                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                                                    Không còn nhân sự phù hợp
                                                </div>
                                            ) : availableUsers.map((user) => (
                                                <div key={user.id} className="rounded-md border px-3 py-2 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-sm truncate">{user.name}</div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {user.role}
                                                            {user.department ? ` • Hiện tại: ${user.department}` : ''}
                                                        </div>
                                                    </div>
                                                    {canEdit && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleAssignUser(user)}
                                                            disabled={updatingUserId === user.id}
                                                        >
                                                            {updatingUserId === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={showDeptDialog} onOpenChange={setShowDeptDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingDepartment ? 'Cập nhật phòng ban' : 'Tạo phòng ban mới'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label>Tên phòng ban *</Label>
                            <Input value={deptName} onChange={(event) => setDeptName(event.target.value)} placeholder="VD: Team Sale 1" />
                        </div>
                        <div>
                            <Label>Mô tả</Label>
                            <Input value={deptDescription} onChange={(event) => setDeptDescription(event.target.value)} placeholder="Mô tả ngắn..." />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Trạng thái</Label>
                                <Select value={deptStatus} onValueChange={(value) => setDeptStatus(value as 'active' | 'inactive')}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Hoạt động</SelectItem>
                                        <SelectItem value="inactive">Ngưng</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Trưởng phòng</Label>
                                <Select value={deptManagerId} onValueChange={setDeptManagerId}>
                                    <SelectTrigger><SelectValue placeholder="Chưa có" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Chưa có</SelectItem>
                                        {managerCandidates.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeptDialog(false)} disabled={savingDept}>Hủy</Button>
                        <Button onClick={handleSaveDepartment} disabled={savingDept}>
                            {savingDept ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Lưu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
