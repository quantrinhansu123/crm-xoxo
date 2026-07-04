import { useState, useEffect } from 'react';
import { Save, Search, UserCheck, Loader2, Users, X, PlusCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useKPI } from '@/hooks/useKPI';
import type { EmployeeWithAssignments } from '@/hooks/useKPI';

type PendingChange =
    | { type: 'set_primary'; employee_id: string; policy_id: string | null }
    | { type: 'add_secondary'; employee_id: string; policy_id: string; compensation_bucket: string }
    | { type: 'remove_secondary'; assignment_id: string; employee_id: string };

const BUCKET_MAP: Record<string, string> = {
    'KPI_TEAMLEAD_SALE': 'teamlead_sale',
    'KPI_TEAMLEAD_TECH': 'teamlead_tech',
    'KPI_LEAD_KYTHUAT': 'teamlead_tech',
    'KPI_MANAGER_STORE': 'manager_store',
    'KPI_QUANLY_CUAHANG': 'manager_store',
    'KPI_SALE_FULLTIME': 'sale_personal',
    'KPI_SALE_PARTTIME': 'sale_personal',
    'KPI_KYTHUAT_CHINH': 'technician_personal',
    'KPI_KYTHUAT_PARTTIME': 'technician_personal',
    'KPI_MARKETING': 'marketing_personal',
    'KPI_ACCOUNTANT': 'accountant_personal',
};

function deriveCompensationBucket(policyCode: string): string {
    return BUCKET_MAP[policyCode] || 'secondary';
}

function policyMatchesEmployee(policy: any, employeeRole: string): boolean {
    const role = String(employeeRole || '').toLowerCase();
    const policyRole = String(policy.role || '').toLowerCase();
    const policyCode = String(policy.code || '').toUpperCase();

    if (policyRole === 'all' || policyRole === role) return true;
    if (role === 'technician') return policyRole.includes('tech') || policyRole.includes('ky') || policyCode.includes('KYTHUAT') || policyCode.includes('TECH');
    if (role === 'sale') return policyRole.includes('sale') || policyCode.includes('SALE');
    if (role === 'manager') return policyRole.includes('manager') || policyRole.includes('quan') || policyCode.includes('QUAN') || policyCode.includes('MANAGER');
    return false;
}

export function KPIAssignmentsTab() {
    const {
        employeeAssignments,
        availablePolicies,
        fetchEmployeeAssignments,
        batchAssignPolicies,
        removeAssignment,
        loading,
    } = useKPI();

    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
    const [addingSecondaryFor, setAddingSecondaryFor] = useState<string | null>(null);
    const [selectedSecondaryPolicy, setSelectedSecondaryPolicy] = useState<string>('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchEmployeeAssignments();
    }, [fetchEmployeeAssignments]);

    const handlePrimaryChange = (employeeId: string, policyId: string) => {
        setPendingChanges(prev => [
            ...prev.filter(c => !(c.type === 'set_primary' && c.employee_id === employeeId)),
            { type: 'set_primary', employee_id: employeeId, policy_id: policyId === 'none' ? null : policyId },
        ]);
    };

    const handleAddSecondary = (employeeId: string) => {
        if (!selectedSecondaryPolicy) return;
        // Get policy code to derive correct compensation bucket
        const policy = availablePolicies.find((p: any) => p.id === selectedSecondaryPolicy);
        const compensationBucket = policy ? deriveCompensationBucket(policy.code) : 'secondary';
        setPendingChanges(prev => [
            ...prev,
            { type: 'add_secondary', employee_id: employeeId, policy_id: selectedSecondaryPolicy, compensation_bucket: compensationBucket },
        ]);
        setAddingSecondaryFor(null);
        setSelectedSecondaryPolicy('');
    };

    const handleRemoveSecondary = (assignmentId: string, employeeId: string) => {
        setPendingChanges(prev => [
            ...prev,
            { type: 'remove_secondary', assignment_id: assignmentId, employee_id: employeeId },
        ]);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const primaryChanges = pendingChanges.filter(c => c.type === 'set_primary') as Array<{ type: 'set_primary'; employee_id: string; policy_id: string | null }>;

            const assignPrimaryChanges = primaryChanges.filter(c => c.policy_id !== null) as Array<{ type: 'set_primary'; employee_id: string; policy_id: string }>;
            const unassignPrimaryChanges = primaryChanges.filter(c => c.policy_id === null);

            if (assignPrimaryChanges.length > 0) {
                await batchAssignPolicies(assignPrimaryChanges.map(c => ({ employee_id: c.employee_id, policy_id: c.policy_id })));
            }

            for (const change of unassignPrimaryChanges) {
                const emp = employeeAssignments.find((e: EmployeeWithAssignments) => e.id === change.employee_id);
                const primaryAssignment = emp?.assignments?.find((a: any) => a.assignment_type === 'primary');
                if (primaryAssignment) {
                    await removeAssignment(primaryAssignment.id);
                }
            }

            const addChanges = pendingChanges.filter(c => c.type === 'add_secondary') as Array<{ type: 'add_secondary'; employee_id: string; policy_id: string; compensation_bucket: string }>;
            for (const change of addChanges) {
                await batchAssignPolicies([{ employee_id: change.employee_id, policy_id: change.policy_id, assignment_type: 'secondary', compensation_bucket: change.compensation_bucket } as any]);
            }

            const removeChanges = pendingChanges.filter(c => c.type === 'remove_secondary') as Array<{ type: 'remove_secondary'; assignment_id: string; employee_id: string }>;
            for (const change of removeChanges) {
                await removeAssignment(change.assignment_id);
            }

            setPendingChanges([]);
            await fetchEmployeeAssignments();
        } finally {
            setSaving(false);
        }
    };

    const filteredEmployees = employeeAssignments.filter((emp: EmployeeWithAssignments) => {
        const matchesSearch =
            emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || emp.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const getPrimaryPolicyId = (emp: EmployeeWithAssignments): string => {
        const pendingPrimary = pendingChanges.find(c => c.type === 'set_primary' && c.employee_id === emp.id) as { type: 'set_primary'; employee_id: string; policy_id: string | null } | undefined;
        if (pendingPrimary !== undefined) {
            return pendingPrimary.policy_id ?? 'none';
        }
        const primaryAssignment = emp.assignments?.find(a => a.assignment_type === 'primary');
        if (primaryAssignment) return primaryAssignment.policy_id;
        return emp.kpi_policy_id ?? 'none';
    };

    const getPrimaryPolicyName = (emp: EmployeeWithAssignments): string | null => {
        const primaryAssignment = emp.assignments?.find(a => a.assignment_type === 'primary');
        if (primaryAssignment?.policy?.name) return primaryAssignment.policy.name;
        if (emp.kpi_policy?.name) return emp.kpi_policy.name;
        return null;
    };

    const getSecondaryAssignments = (emp: EmployeeWithAssignments) => {
        const removed = new Set(
            (pendingChanges.filter(c => c.type === 'remove_secondary') as Array<{ type: 'remove_secondary'; assignment_id: string; employee_id: string }>)
                .filter(c => c.employee_id === emp.id)
                .map(c => c.assignment_id),
        );
        const existing = (emp.assignments ?? []).filter(a => a.assignment_type === 'secondary' && !removed.has(a.id));
        const pending = (pendingChanges.filter(c => c.type === 'add_secondary' && c.employee_id === emp.id) as Array<{ type: 'add_secondary'; employee_id: string; policy_id: string; compensation_bucket: string }>).map(c => {
            const policy = availablePolicies.find((p: any) => p.id === c.policy_id);
            return {
                id: `pending-${c.policy_id}`,
                policy_id: c.policy_id,
                assignment_type: 'secondary' as const,
                isPending: true,
                policy: policy ? { id: policy.id, code: policy.code, name: policy.name, role: policy.role } : undefined,
            };
        });
        return [...existing, ...pending];
    };

    const hasPendingPrimaryChange = (empId: string) =>
        pendingChanges.some(c => c.type === 'set_primary' && c.employee_id === empId);

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <UserCheck className="h-5 w-4" />
                                Gán chính sách KPI
                            </CardTitle>
                            <CardDescription>
                                Thiết lập chính sách KPI chính và phụ cho từng nhân viên để hệ thống tự động tính điểm hàng tháng
                            </CardDescription>
                        </div>
                        <Button
                            disabled={pendingChanges.length === 0 || saving}
                            onClick={handleSave}
                            className="w-full md:w-auto"
                        >
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {pendingChanges.length > 0 ? `Lưu (${pendingChanges.length}) thay đổi` : 'Lưu thay đổi'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Tìm theo tên hoặc email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-full md:w-[200px]">
                                <Users className="mr-2 h-4 w-4 opacity-50" />
                                <SelectValue placeholder="Lọc theo Role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tất cả Role</SelectItem>
                                <SelectItem value="sale">Sale</SelectItem>
                                <SelectItem value="technician">Kỹ thuật</SelectItem>
                                <SelectItem value="manager">Quản lý</SelectItem>
                                <SelectItem value="accountant">Kế toán</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="border rounded-md overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-b">
                                <tr>
                                    <th className="text-left p-3 font-medium">Nhân viên</th>
                                    <th className="text-left p-3 font-medium">Phòng ban / Role</th>
                                    <th className="text-left p-3 font-medium w-[240px]">KPI Chính</th>
                                    <th className="text-left p-3 font-medium w-[400px]">KPI Phụ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading && filteredEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                            Đang tải danh sách...
                                        </td>
                                    </tr>
                                ) : filteredEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                            Không tìm thấy nhân viên nào
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEmployees.map((emp: EmployeeWithAssignments) => {
                                        const currentPrimaryId = getPrimaryPolicyId(emp);
                                        const secondaryAssignments = getSecondaryAssignments(emp);
                                        const assignedSecondaryIds = new Set(secondaryAssignments.map(a => a.policy_id));
                                        const availableSecondaryPolicies = availablePolicies.filter((p: any) =>
                                            (policyMatchesEmployee(p, emp.role) || String(p.role || '').toLowerCase() === 'manager') &&
                                            p.id !== currentPrimaryId &&
                                            !assignedSecondaryIds.has(p.id),
                                        );
                                        const primaryName = getPrimaryPolicyName(emp);

                                        return (
                                            <tr key={emp.id} className="hover:bg-muted/30 transition-colors align-top">
                                                <td className="p-3">
                                                    <div className="font-medium text-foreground">{emp.name}</div>
                                                    <div className="text-xs text-muted-foreground">{emp.email}</div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex flex-col gap-1">
                                                        <Badge variant="outline" className="w-fit text-[10px] uppercase">
                                                            {emp.role}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">{emp.department || 'Chưa rõ'}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <Select
                                                        value={currentPrimaryId}
                                                        onValueChange={(val) => handlePrimaryChange(emp.id, val)}
                                                    >
                                                        <SelectTrigger className={hasPendingPrimaryChange(emp.id) ? 'border-amber-500 ring-1 ring-amber-500' : ''}>
                                                            <SelectValue placeholder="Chọn chính sách...">
                                                                {currentPrimaryId === 'none'
                                                                    ? '-- Không gán --'
                                                                    : (primaryName ?? availablePolicies.find((p: any) => p.id === currentPrimaryId)?.name ?? 'Chọn chính sách...')}
                                                            </SelectValue>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">-- Không gán --</SelectItem>
                                                            {availablePolicies
                                                                .filter((p: any) => policyMatchesEmployee(p, emp.role))
                                                                .map((policy: any) => (
                                                                    <SelectItem key={policy.id} value={policy.id}>
                                                                        {policy.name} ({policy.code})
                                                                    </SelectItem>
                                                                ))}
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="p-3 min-w-[400px]">
                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                        {secondaryAssignments.map(sa => (
                                                            <span
                                                                key={sa.id}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                                            >
                                                                {sa.policy?.name ?? sa.policy_id}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (sa.id.startsWith('pending-')) {
                                                                            setPendingChanges(prev =>
                                                                                prev.filter(c => !(c.type === 'add_secondary' && c.employee_id === emp.id && c.policy_id === sa.policy_id)),
                                                                            );
                                                                        } else {
                                                                            handleRemoveSecondary(sa.id, emp.id);
                                                                        }
                                                                    }}
                                                                    className="ml-0.5 hover:text-blue-600 dark:hover:text-blue-300 cursor-pointer"
                                                                    aria-label="Xóa KPI phụ"
                                                                >
                                                                    <X className="h-3 w-3" />
                                                                </button>
                                                            </span>
                                                        ))}
                                                    </div>

                                                    {addingSecondaryFor === emp.id ? (
                                                        <div className="flex flex-wrap items-center gap-2 w-full justify-start">
                                                            <Select
                                                                value={selectedSecondaryPolicy}
                                                                onValueChange={setSelectedSecondaryPolicy}
                                                            >
                                                                <SelectTrigger className="h-8 text-xs w-[180px]">
                                                                    <SelectValue placeholder="Chọn KPI phụ..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {availableSecondaryPolicies.length === 0 ? (
                                                                        <SelectItem value="__empty__" disabled>
                                                                            Không còn chính sách nào
                                                                        </SelectItem>
                                                                    ) : (
                                                                        availableSecondaryPolicies.map((p: any) => (
                                                                            <SelectItem key={p.id} value={p.id}>
                                                                                {p.name} ({p.code})
                                                                            </SelectItem>
                                                                        ))
                                                                    )}
                                                                </SelectContent>
                                                            </Select>
                                                            <Button
                                                                size="sm"
                                                                className="h-8 text-xs"
                                                                onClick={() => handleAddSecondary(emp.id)}
                                                                disabled={!selectedSecondaryPolicy || selectedSecondaryPolicy === '__empty__'}
                                                            >
                                                                Thêm
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 text-xs"
                                                                onClick={() => {
                                                                    setAddingSecondaryFor(null);
                                                                    setSelectedSecondaryPolicy('');
                                                                }}
                                                            >
                                                                Hủy
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setAddingSecondaryFor(emp.id);
                                                                setSelectedSecondaryPolicy('');
                                                            }}
                                                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                                        >
                                                            <PlusCircle className="h-3.5 w-3.5" />
                                                            Thêm KPI phụ
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
