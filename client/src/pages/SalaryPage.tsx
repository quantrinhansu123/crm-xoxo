import { useState, useEffect, useMemo, useCallback, Fragment, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search, Download, Calculator, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    RefreshCw, Eye, Trash2, CreditCard, ListPlus, Calendar, X, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { payrollBatchesApi, usersApi } from '@/lib/api';
import { useSalary, type SalaryRecord } from '@/hooks/useSalary';
import { useDepartments } from '@/hooks/useDepartments';
import { formatCurrency } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { PersonalPaysheetDialog } from '@/components/salary/PersonalPaysheetDialog';

// ========== STATUS CONFIG ==========
const salaryStatusConfig = {
    draft: { label: 'Đang tạo', color: '#2563eb' },
    pending: { label: 'Tạm tính', color: '#2563eb' },
    approved: { label: 'Đã chốt lương', color: '#16a34a' },
    paid: { label: 'Đã trả', color: '#16a34a' },
    locked: { label: 'Đã hủy', color: '#dc2626' },
} as const;

type SalaryStatus = keyof typeof salaryStatusConfig;

// ========== HELPERS ==========
function formatPeriod(month: number, year: number): string {
    return `${String(month).padStart(2, '0')}/${year}`;
}

function formatWorkPeriodFull(month: number, year: number): string {
    const lastDay = new Date(year, month, 0).getDate();
    return `01/${String(month).padStart(2, '0')}/${year} - ${lastDay}/${String(month).padStart(2, '0')}/${year}`;
}

function formatDateTime(dateStr?: string): string {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ========== PAYROLL BATCH TYPE ==========
interface PayrollBatch {
    id: string;
    code: string;
    name: string;
    month: number;
    year: number;
    pay_period: string;
    work_period_start: string;
    work_period_end: string;
    total_salary: number;
    total_paid: number;
    total_remaining: number;
    employee_count: number;
    status: SalaryStatus;
    scope: string;
    notes: string | null;
    created_at: string;
    updated_at?: string;
    created_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    creator?: { id: string; name: string };
    approver?: { id: string; name: string };
}

// ========== DEPARTMENT SELECT DIALOG ==========
interface EmployeeItem {
    id: string;
    name: string;
    code?: string;
    department?: string;
}

function DepartmentSelectDialog({
    open,
    onOpenChange,
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (departmentIds: string[]) => void;
}) {
    const { departments, fetchDepartments, loading } = useDepartments();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [allExpanded, setAllExpanded] = useState(true);

    useEffect(() => {
        if (open) {
            fetchDepartments({ status: 'active' });
            setSearch('');
            setSelected([]);
        }
    }, [open]);

    const filtered = useMemo(() => {
        if (!search.trim()) return departments;
        return departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
    }, [departments, search]);

    const allIds = filtered.map(d => d.id);
    const allChecked = allIds.length > 0 && allIds.every(id => selected.includes(id));
    const someChecked = allIds.some(id => selected.includes(id));

    const toggleAll = () => {
        if (allChecked) setSelected([]);
        else setSelected(allIds);
    };

    const toggle = (id: string) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px] p-0 gap-0">
                <DialogHeader className="p-4 border-b flex-row items-center justify-between">
                    <DialogTitle className="text-[15px] font-semibold text-gray-800">Chọn phòng ban</DialogTitle>
                </DialogHeader>
                <div className="p-4 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            className="pl-9 h-9 text-[13px] border-gray-200"
                            placeholder="Tìm phòng ban..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {loading ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                    ) : (
                        <div className="space-y-1 max-h-[300px] overflow-y-auto">
                            {/* All departments row */}
                            <div className="flex items-center gap-3 px-1 py-1.5 cursor-pointer hover:bg-gray-50 rounded" onClick={toggleAll}>
                                <button
                                    className="text-gray-400 hover:text-gray-600"
                                    onClick={e => { e.stopPropagation(); setAllExpanded(v => !v); }}
                                >
                                    <ChevronDown className={`h-4 w-4 transition-transform ${allExpanded ? '' : '-rotate-90'}`} />
                                </button>
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                                    checked={allChecked}
                                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                                    onChange={toggleAll}
                                    onClick={e => e.stopPropagation()}
                                />
                                <span className="text-[13px] text-gray-700">Tất cả phòng ban</span>
                            </div>
                            {allExpanded && filtered.map(dept => (
                                <div
                                    key={dept.id}
                                    className="flex items-center gap-3 px-1 py-1.5 pl-9 cursor-pointer hover:bg-gray-50 rounded"
                                    onClick={() => toggle(dept.id)}
                                >
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                                        checked={selected.includes(dept.id)}
                                        onChange={() => toggle(dept.id)}
                                        onClick={e => e.stopPropagation()}
                                    />
                                    <span className="text-[13px] text-gray-700">{dept.name}</span>
                                </div>
                            ))}
                            <div
                                className="flex items-center gap-3 px-1 py-1.5 pl-9 cursor-pointer hover:bg-gray-50 rounded"
                                onClick={() => toggle('__no_dept__')}
                            >
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                                    checked={selected.includes('__no_dept__')}
                                    onChange={() => toggle('__no_dept__')}
                                    onClick={e => e.stopPropagation()}
                                />
                                <span className="text-[13px] text-gray-700">Không thuộc phòng ban nào</span>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="p-4 border-t gap-2 sm:justify-end bg-gray-50/50">
                    <DialogClose asChild>
                        <Button variant="outline" className="h-9 px-5 text-[13px] font-medium min-w-[80px]">Bỏ qua</Button>
                    </DialogClose>
                    <Button
                        onClick={() => { onConfirm(selected); onOpenChange(false); }}
                        className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium min-w-[80px]"
                    >
                        Lưu
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ========== GENERATE PAYROLL DIALOG ==========
function GeneratePayrollDialog({ open, onOpenChange, onGenerate }: { open: boolean, onOpenChange: (open: boolean) => void, onGenerate: () => void }) {
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const [payPeriod, setPayPeriod] = useState('monthly');
    const [workPeriod, setWorkPeriod] = useState('');
    // Custom date range
    const [customStartDate, setCustomStartDate] = useState(todayStr);
    const [customEndDate, setCustomEndDate] = useState(todayStr);
    const [scope, setScope] = useState('all');
    const [generating, setGenerating] = useState(false);
    const [applyTechKpiPolicy, setApplyTechKpiPolicy] = useState(false);

    // Departments for name lookup
    const { departments, fetchDepartments } = useDepartments();
    useEffect(() => { fetchDepartments(); }, []);

    // Helper: resolve department display name from raw value (could be UUID or name string)
    const resolveDeptName = useCallback((raw: string | undefined): string => {
        if (!raw) return '--';
        // Try to find by id (UUID case)
        const byId = departments.find(d => d.id === raw);
        if (byId) return byId.name;
        // Try to find by name (exact or case-insensitive)
        const byName = departments.find(d => d.name.toLowerCase() === raw.toLowerCase());
        if (byName) return byName.name;
        // Fallback: raw value
        return raw;
    }, [departments]);

    // Employee search
    const [empSearch, setEmpSearch] = useState('');
    const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
    const [empResults, setEmpResults] = useState<EmployeeItem[]>([]);
    const [empSearchLoading, setEmpSearchLoading] = useState(false);
    const [selectedEmployees, setSelectedEmployees] = useState<EmployeeItem[]>([]);
    const empSearchRef = useRef<HTMLDivElement>(null);

    // Department dialog
    const [deptDialogOpen, setDeptDialogOpen] = useState(false);

    const workPeriodOptions = useMemo(() => {
        const currentDate = new Date();
        const options = [];
        for (let i = 0; i < 12; i++) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            const month = date.getMonth() + 1;
            const year = date.getFullYear();
            const lastDay = new Date(year, month, 0).getDate();
            const value = `${String(month).padStart(2, '0')}/${year}`;
            const label = `01/${String(month).padStart(2, '0')}/${year} - ${lastDay}/${String(month).padStart(2, '0')}/${year}`;
            options.push({ value, label });
        }
        return options;
    }, []);

    useEffect(() => {
        if (workPeriodOptions.length > 0 && !workPeriod) {
            setWorkPeriod(workPeriodOptions[0].value);
        }
    }, [workPeriodOptions, workPeriod]);

    useEffect(() => {
        if (open) {
            setApplyTechKpiPolicy(false);
        }
    }, [open]);

    // Search employees
    useEffect(() => {
        if (!empSearch.trim()) {
            setEmpResults([]);
            setEmpDropdownOpen(false);
            return;
        }
        const timer = setTimeout(async () => {
            setEmpSearchLoading(true);
            try {
                const res = await usersApi.getAll({ search: empSearch.trim() });
                const users = res.data.data?.users || [];
                setEmpResults(users.map((u: any) => ({
                    id: u.id,
                    name: u.name,
                    code: u.employeeCode || u.employee_code || u.code,
                    department: u.department,
                })));
                setEmpDropdownOpen(true);
            } catch {
                setEmpResults([]);
            } finally {
                setEmpSearchLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [empSearch]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (empSearchRef.current && !empSearchRef.current.contains(e.target as Node)) {
                setEmpDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selectEmployee = (emp: EmployeeItem) => {
        if (!selectedEmployees.find(e => e.id === emp.id)) {
            setSelectedEmployees(prev => [...prev, emp]);
        }
        setEmpSearch('');
        setEmpDropdownOpen(false);
    };

    const removeEmployee = (id: string) => {
        setSelectedEmployees(prev => prev.filter(e => e.id !== id));
    };

    const handleGenerateClick = async () => {
        if (payPeriod === 'monthly' && !workPeriod) return;

        setGenerating(true);
        try {
            if (payPeriod === 'monthly') {
                const [monthStr, yearStr] = workPeriod.split('/');
                const month = parseInt(monthStr, 10);
                const year = parseInt(yearStr, 10);
                await payrollBatchesApi.generate({
                    month,
                    year,
                    apply_technician_kpi_commission_policy: applyTechKpiPolicy,
                });
            } else {
                // Custom date range — pass as-is or convert
                await payrollBatchesApi.generate({
                    start_date: customStartDate,
                    end_date: customEndDate,
                    apply_technician_kpi_commission_policy: applyTechKpiPolicy,
                } as any);
            }
            onGenerate();
            onOpenChange(false);
        } catch (err: unknown) {
            console.error('Error generating payroll:', err);
        } finally {
            setGenerating(false);
        }
    };

    // Convert dd/MM/yyyy string to input[type=date] value (yyyy-MM-dd)
    const toInputDate = (ddmmyyyy: string) => {
        const [d, m, y] = ddmmyyyy.split('/');
        if (!d || !m || !y) return '';
        return `${y}-${m}-${d}`;
    };
    const fromInputDate = (yyyymmdd: string) => {
        const [y, m, d] = yyyymmdd.split('-');
        if (!y || !m || !d) return '';
        return `${d}/${m}/${y}`;
    };

    return (
        <>
            <DepartmentSelectDialog
                open={deptDialogOpen}
                onOpenChange={setDeptDialogOpen}
                onConfirm={(_ids) => {
                    // Could filter employees by department here if needed
                }}
            />
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[700px] p-0 gap-0">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle className="text-[16px] font-semibold text-gray-800">Thêm bảng tính lương</DialogTitle>
                    </DialogHeader>
                    <div className="p-6 space-y-5">
                        {/* Kỳ hạn trả lương */}
                        <div className="flex items-center">
                            <div className="w-[180px] text-[13px] font-medium text-gray-700">Kỳ hạn trả lương</div>
                            <div className="flex-1">
                                <Select value={payPeriod} onValueChange={setPayPeriod}>
                                    <SelectTrigger className="w-full h-9 text-[13px] border-gray-200">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="monthly" className="text-[13px]">Hàng tháng</SelectItem>
                                        <SelectItem value="custom" className="text-[13px]">Tùy chọn</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Kỳ làm việc */}
                        <div className="flex items-center">
                            <div className="w-[180px] text-[13px] font-medium text-gray-700">Kỳ làm việc</div>
                            <div className="flex-1">
                                {payPeriod === 'monthly' ? (
                                    <Select value={workPeriod} onValueChange={setWorkPeriod}>
                                        <SelectTrigger className="w-full h-9 text-[13px] border-gray-200">
                                            <SelectValue placeholder="Chọn kỳ làm việc" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {workPeriodOptions.map(option => (
                                                <SelectItem key={option.value} value={option.value} className="text-[13px]">
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="date"
                                                value={toInputDate(customStartDate)}
                                                onChange={e => setCustomStartDate(fromInputDate(e.target.value))}
                                                className="w-full h-9 px-3 pr-9 text-[13px] border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700"
                                            />
                                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                        </div>
                                        <span className="text-[13px] text-gray-500 shrink-0">Đến</span>
                                        <div className="relative flex-1">
                                            <input
                                                type="date"
                                                value={toInputDate(customEndDate)}
                                                onChange={e => setCustomEndDate(fromInputDate(e.target.value))}
                                                className="w-full h-9 px-3 pr-9 text-[13px] border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700"
                                            />
                                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Phạm vi áp dụng */}
                        <div className="flex items-start pt-1">
                            <div className="w-[180px] text-[13px] font-medium text-gray-700 mt-1">Phạm vi áp dụng</div>
                            <div className="flex-1 space-y-4">
                                <RadioGroup value={scope} onValueChange={setScope} className="flex items-center space-x-6">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="all" id="scope-all" className="h-4 w-4 text-blue-600" />
                                        <Label htmlFor="scope-all" className="text-[13px] font-normal cursor-pointer">Tất cả nhân viên</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="custom" id="scope-custom" className="h-4 w-4 text-blue-600" />
                                        <Label htmlFor="scope-custom" className="text-[13px] font-normal cursor-pointer">Tùy chọn</Label>
                                    </div>
                                </RadioGroup>

                                {scope === 'custom' && (
                                    <div className="space-y-3">
                                        {/* Search + Department button */}
                                        <div className="flex items-center gap-2" ref={empSearchRef}>
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    className="pl-9 h-9 text-[13px] border-gray-200"
                                                    placeholder="Tìm theo mã, tên nhân viên"
                                                    value={empSearch}
                                                    onChange={e => setEmpSearch(e.target.value)}
                                                    onFocus={() => empResults.length > 0 && setEmpDropdownOpen(true)}
                                                />
                                                {/* Dropdown */}
                                                {empDropdownOpen && (
                                                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                                                        {empSearchLoading ? (
                                                            <div className="flex justify-center py-3">
                                                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                                            </div>
                                                        ) : empResults.length === 0 ? (
                                                            <div className="px-3 py-3 text-[13px] text-gray-500">Không tìm thấy nhân viên</div>
                                                        ) : (
                                                            empResults.map(emp => (
                                                                <div
                                                                    key={emp.id}
                                                                    className="px-3 py-2 cursor-pointer hover:bg-blue-50"
                                                                    onMouseDown={() => selectEmployee(emp)}
                                                                >
                                                                    <p className="text-[13px] font-semibold text-gray-800 uppercase">{emp.name}</p>
                                                                    {emp.code && <p className="text-[12px] text-blue-600">{emp.code}</p>}
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9 border-gray-200 text-gray-600 shrink-0"
                                                onClick={() => setDeptDialogOpen(true)}
                                                title="Chọn theo phòng ban"
                                            >
                                                <ListPlus className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        {/* Selected employees table */}
                                        <div className="border border-gray-200 rounded-md overflow-hidden bg-white">
                                            <table className="w-full">
                                                <thead className="bg-[#f0f4f8]">
                                                    <tr className="border-b border-gray-200">
                                                        <th className="px-3 py-2 text-left text-[13px] font-medium text-gray-700 w-[150px]">Mã nhân viên</th>
                                                        <th className="px-3 py-2 text-left text-[13px] font-medium text-gray-700">Tên nhân viên</th>
                                                        <th className="px-3 py-2 text-left text-[13px] font-medium text-gray-700 w-[150px]">Phòng ban</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedEmployees.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={3} className="px-3 py-8 text-center text-[13px] text-gray-500">
                                                                Chưa có nhân viên nào được chọn
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        selectedEmployees.map(emp => (
                                                            <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                                <td className="px-3 py-2 text-[13px] text-blue-600">{emp.code || '--'}</td>
                                                                <td className="px-3 py-2 text-[13px] text-gray-800 uppercase font-medium">{emp.name}</td>
                                                                <td className="px-3 py-2 text-[13px] text-gray-600 flex items-center justify-between">
                                                                    <span>{resolveDeptName(emp.department)}</span>
                                                                    <button
                                                                        className="ml-2 text-gray-400 hover:text-red-500"
                                                                        onClick={() => removeEmployee(emp.id)}
                                                                    >
                                                                        <X className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Chính sách hoa hồng KTV */}
                        <div className="flex items-start">
                            <div className="w-[180px] text-[13px] font-medium text-gray-700 pt-1">Hoa hồng kỹ thuật</div>
                            <div className="flex-1 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2.5">
                                <div className="flex items-start gap-2">
                                    <Checkbox
                                        id="apply-tech-kpi-policy"
                                        checked={applyTechKpiPolicy}
                                        onCheckedChange={(checked) => setApplyTechKpiPolicy(Boolean(checked))}
                                        className="mt-0.5"
                                    />
                                    <div className="space-y-0.5">
                                        <Label htmlFor="apply-tech-kpi-policy" className="text-[13px] font-medium text-gray-800 cursor-pointer">
                                            Áp dụng chính sách mới
                                        </Label>
                                        <p className="text-[12px] text-gray-600">
                                            Chỉ tính hoa hồng khi đơn đã thanh toán đủ. Công thức KTV:
                                            (Phí dịch vụ - Mua phụ kiện) × KPI ÷ 100.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="p-4 border-t gap-2 sm:justify-end bg-gray-50/50">
                        <DialogClose asChild>
                            <Button variant="outline" className="h-9 px-5 text-[13px] font-medium min-w-[80px]">Bỏ qua</Button>
                        </DialogClose>
                        <Button onClick={handleGenerateClick} disabled={generating} className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium min-w-[80px]">
                            {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Lưu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ========== EXPANDED ROW TABS ==========
type ExpandedTab = 'info' | 'payslips' | 'history';

// ========== PAYSLIP SUB-TABLE ==========
function PayslipTable({ batchId }: { batchId: string }) {
    const [records, setRecords] = useState<SalaryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [selectedPayslipIds, setSelectedPayslipIds] = useState<string[]>([]);
    const [selectedPaysheetRecord, setSelectedPaysheetRecord] = useState<{ record: SalaryRecord, plCode: string } | null>(null);
    const [isPaysheetDialogOpen, setIsPaysheetDialogOpen] = useState(false);
    const pageSize = 10;

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const res = await payrollBatchesApi.getById(batchId);
            setRecords(res.data.data?.records || []);
        } catch (e) {
            console.error('Error fetching payslip records:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
    }, [batchId]);

    const totalItems = records.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const paginated = records.slice((page - 1) * pageSize, page * pageSize);

    const totalSalary = records.reduce((s, r) => s + (r.net_salary ?? 0), 0);
    const totalPaidEmp = records.reduce((s, r) => s + (r.status === 'paid' ? r.net_salary : 0), 0);
    const totalRemaining = totalSalary - totalPaidEmp;

    const togglePayslip = (id: string) => {
        setSelectedPayslipIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };
    const selectAllPayslips = () => {
        if (selectedPayslipIds.length === paginated.length) setSelectedPayslipIds([]);
        else setSelectedPayslipIds(paginated.map(r => r.id));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div>
            {selectedPaysheetRecord && (
                <PersonalPaysheetDialog
                    open={isPaysheetDialogOpen}
                    onOpenChange={setIsPaysheetDialogOpen}
                    record={selectedPaysheetRecord.record}
                    plCode={selectedPaysheetRecord.plCode}
                    onReload={fetchRecords}
                />
            )}
            <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="bg-white border-b border-gray-200">
                    <tr>
                        <th className="px-4 py-2.5 w-10">
                            <input
                                type="checkbox"
                                className="w-[14px] h-[14px] rounded border-gray-300 text-blue-600 cursor-pointer"
                                checked={selectedPayslipIds.length === paginated.length && paginated.length > 0}
                                onChange={selectAllPayslips}
                            />
                        </th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide">MÃ PHIẾU</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide">TÊN NHÂN VIÊN</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide text-right">TỔNG PHÍ DỊCH VỤ</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide text-right">PHỤ KIỆN</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide text-right">KPI%</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide text-right">HOA HỒNG CUỐI</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide text-right">TỔNG LƯƠNG</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide text-right">ĐÃ TRẢ NV</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide text-right">CÒN CẦN TRẢ</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {/* Summary */}
                    {records.length > 0 && (
                        <tr className="bg-white border-b border-gray-200">
                            <td className="px-4 py-2.5" colSpan={7}></td>
                            <td className="px-4 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalSalary)}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalPaidEmp)}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalRemaining)}</td>
                        </tr>
                    )}
                    {paginated.length === 0 ? (
                        <tr>
                            <td colSpan={10} className="px-4 py-8 text-center text-[13px] text-gray-400">
                                Không có phiếu lương
                            </td>
                        </tr>
                    ) : (
                        paginated.map((record, idx) => {
    const gross = record.net_salary ?? 0;
    const paid = record.status === 'paid' ? record.net_salary : 0;
    const remaining = gross - paid;
                            const plCode = `PL${String(totalItems - ((page - 1) * pageSize + idx) + 140).padStart(6, '0')}`;
                            const hasTechAudit = Boolean(record.tech_commission_policy_applied);
                            const serviceFeeText = hasTechAudit ? formatCurrency(Number(record.tech_service_fee_total || 0)) : '--';
                            const accessoryText = hasTechAudit ? formatCurrency(Number(record.tech_accessory_cost_total || 0)) : '--';
                            const kpiText = record.kpi_primary_commission_factor !== undefined && record.kpi_primary_commission_factor !== null
                                ? `${Number(record.kpi_primary_commission_factor).toFixed(2)}%`
                                : '--';
                            const finalCommission = hasTechAudit
                                ? Number(record.tech_commission_final || 0)
                                : Number(record.commission || 0);

                            return (
                                <tr key={record.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-4 py-2.5">
                                        <input
                                            type="checkbox"
                                            className="w-[14px] h-[14px] rounded border-gray-300 text-blue-600 cursor-pointer"
                                            checked={selectedPayslipIds.includes(record.id)}
                                            onChange={() => togglePayslip(record.id)}
                                        />
                                    </td>
                                    <td className="px-4 py-2.5 text-blue-600 font-medium text-[13px]">{plCode}</td>
                                    <td className="px-4 py-2.5 text-gray-800 font-medium text-[13px] uppercase">
                                        <button
                                            onClick={() => {
                                                setSelectedPaysheetRecord({ record, plCode });
                                                setIsPaysheetDialogOpen(true);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                        >
                                            {record.user?.name || 'N/A'}
                                        </button>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-gray-800 text-[13px] font-medium">{serviceFeeText}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-800 text-[13px] font-medium">{accessoryText}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-800 text-[13px] font-medium">{kpiText}</td>
                                    <td className="px-4 py-2.5 text-right text-blue-700 text-[13px] font-semibold">{formatCurrency(finalCommission)}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-800 text-[13px] font-medium">{formatCurrency(gross)}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-800 text-[13px] font-medium">{formatCurrency(paid)}</td>
                                    <td className="px-4 py-2.5 text-right text-gray-800 text-[13px] font-medium">{formatCurrency(remaining)}</td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>

            {/* Pagination */}
            {totalItems > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 text-[12px] text-gray-500">
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === 1} onClick={() => setPage(1)}>
                        <ChevronsLeft className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                        <ChevronsRight className="h-3 w-3" />
                    </Button>
                    <span className="ml-1">Hiển thị {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalItems)} Tổng {totalItems} Phiếu lương</span>
                </div>
            )}

            {/* Bottom action */}
            <div className="flex justify-end px-4 py-3 border-t border-gray-100">
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] h-[34px] px-4 rounded-lg shadow-sm">
                    <CreditCard className="h-4 w-4" />
                    Thanh toán
                </Button>
            </div>
        </div>
    );
}

// ========== PAYMENT HISTORY TABLE ==========
function PaymentHistoryTable() {
    return (
        <div>
            <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="bg-white border-b border-gray-200">
                    <tr>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide">MÃ PHIẾU</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide">TÊN NHÂN VIÊN</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide">THỜI GIAN</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide">NGƯỜI TẠO</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide">PHƯƠNG THỨC</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide">TRẠNG THÁI</th>
                        <th className="px-4 py-2.5 font-bold text-[11px] text-gray-900 tracking-wide text-right">TIỀN CHI</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-gray-400">
                            Không có dữ liệu
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

// ========== EXPANDED ROW DETAIL ==========
function ExpandedRowDetail({ batch, onReload, onViewDetail }: { batch: PayrollBatch; onReload: () => void; onViewDetail: () => void }) {
    const [activeTab, setActiveTab] = useState<ExpandedTab>('info');
    const [recalculating, setRecalculating] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    const tabs: { key: ExpandedTab; label: string }[] = [
        { key: 'info', label: 'Thông tin' },
        { key: 'payslips', label: 'Phiếu lương' },
        { key: 'history', label: 'Lịch sử thanh toán' },
    ];

    const statusLabel = salaryStatusConfig[batch.status]?.label || batch.status;

    const handleDeleteBatch = async () => {
        try {
            await payrollBatchesApi.cancel(batch.id);
            setConfirmDeleteOpen(false);
            onReload();
        } catch (e: any) {
            alert(e.response?.data?.message || 'Có lỗi xảy ra khi xóa');
        }
    };

    return (
        <div className="bg-[#fafbfc] border-b-2 border-gray-200">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-4">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                            activeTab === tab.key
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'info' && (
                <div className="p-5 space-y-6">
                    {/* Row 1 */}
                    <div className="grid grid-cols-4 gap-6">
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Mã:</p>
                            <p className="text-[13px] font-semibold text-gray-800">{batch.code}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Tên:</p>
                            <p className="text-[13px] font-semibold text-blue-600">{batch.name}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Kỳ hạn trả:</p>
                            <p className="text-[13px] text-gray-800">{batch.pay_period}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Kỳ làm việc:</p>
                            <p className="text-[13px] text-gray-800">{formatWorkPeriodFull(batch.month, batch.year)}</p>
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-4 gap-6">
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Ngày tạo:</p>
                            <p className="text-[13px] text-gray-800">{formatDateTime(batch.created_at)}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Người tạo:</p>
                            <p className="text-[13px] text-gray-800">{batch.creator?.name || batch.created_by || 'Auto'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Người lập bảng:</p>
                            <p className="text-[13px] text-gray-800">Auto</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Trạng thái:</p>
                            <p className="text-[13px] font-medium text-blue-600">{statusLabel}</p>
                        </div>
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-4 gap-6">
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Tổng số nhân viên:</p>
                            <p className="text-[13px] font-semibold text-gray-800">{batch.employee_count}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Tổng lương:</p>
                            <p className="text-[13px] font-semibold text-gray-800">{formatCurrency(batch.total_salary)}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Đã trả nhân viên:</p>
                            <p className="text-[13px] font-semibold text-gray-800">{formatCurrency(batch.total_paid)}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Còn cần trả:</p>
                            <p className="text-[13px] font-semibold text-gray-800">{formatCurrency(batch.total_remaining)}</p>
                        </div>
                    </div>

                    {/* Row 4 */}
                    <div className="grid grid-cols-4 gap-6">
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Phạm vi áp dụng:</p>
                            <p className="text-[13px] text-gray-800">{batch.scope || 'Tất cả nhân viên'}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Người chốt lương:</p>
                            <p className="text-[13px] text-gray-800">{batch.approver?.name || batch.approved_by || '--'}</p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-[11px] text-gray-400 mb-1">Ghi chú...</p>
                            <div className="border border-gray-200 rounded-lg bg-white px-3 py-2 min-h-[60px] text-[13px] text-gray-500">
                                {batch.notes || ''}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                        <div className="flex items-center gap-3">
                            <Button 
                                variant="ghost" 
                                className="text-[13px] text-gray-500 hover:text-red-500 gap-1.5 h-[34px] px-3"
                                onClick={() => setConfirmDeleteOpen(true)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Xóa bảng lương
                            </Button>
                            <span className="text-[12px] text-gray-400">
                                Dữ liệu được cập nhật vào: {formatDateTime(batch.updated_at || batch.created_at)} ⓘ
                            </span>
                            <Button
                                variant="outline"
                                className="text-[13px] text-gray-600 gap-1.5 h-[34px] px-3 border-gray-200"
                                disabled={recalculating}
                                onClick={async () => {
                                    setRecalculating(true);
                                    try {
                                        await payrollBatchesApi.recalculate(batch.id);
                                        onReload();
                                    } catch (e: any) {
                                        alert(e.response?.data?.message || 'Có lỗi khi tải lại dữ liệu');
                                    } finally {
                                        setRecalculating(false);
                                    }
                                }}
                            >
                                {recalculating
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <RefreshCw className="h-3.5 w-3.5" />
                                }
                                Tải lại dữ liệu
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white text-[13px] h-[34px] px-4 rounded-lg shadow-sm"
                                onClick={onViewDetail}
                            >
                                <Eye className="h-3.5 w-3.5" />
                                Xem bảng lương
                            </Button>
                            <Button variant="outline" className="gap-1.5 text-[13px] text-gray-600 h-[34px] px-4 border-gray-200">
                                <Download className="h-3.5 w-3.5" />
                                Xuất file
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'payslips' && (
                <PayslipTable batchId={batch.id} />
            )}

            {activeTab === 'history' && (
                <PaymentHistoryTable />
            )}

            <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[17px] font-bold text-gray-900">Xác nhận xóa bảng lương</DialogTitle>
                    </DialogHeader>
                    <div className="text-[13px] text-gray-600">
                        Bạn có chắc chắn muốn xóa bảng lương <span className="font-semibold text-gray-900">{batch.code}</span>? Hành động này không thể hoàn tác.
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)} className="text-[13px]">
                            Hủy
                        </Button>
                        <Button onClick={handleDeleteBatch} className="bg-red-600 hover:bg-red-700 text-white text-[13px]">
                            Xóa bảng lương
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ========== MAIN PAGE ==========
export function SalaryPage() {
    const currentDate = new Date();
    const navigate = useNavigate();

    const [batches, setBatches] = useState<PayrollBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilters, setStatusFilters] = useState<SalaryStatus[]>(['draft', 'pending', 'approved', 'locked']);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
    const [periodFilter, setPeriodFilter] = useState('all');
    const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);

    // Fetch payroll batches
    const fetchBatches = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, any> = {};
            if (periodFilter !== 'all') {
                const [monthStr, yearStr] = periodFilter.split('/');
                params.month = parseInt(monthStr, 10);
                params.year = parseInt(yearStr, 10);
            }
            const res = await payrollBatchesApi.getAll(params);
            setBatches(res.data.data?.batches || []);
        } catch (err: any) {
            // If table doesn't exist, show empty
            if (err.response?.status === 500 && err.response?.data?.message?.includes('does not exist')) {
                setBatches([]);
            } else {
                setError(err.response?.data?.message || 'Lỗi khi tải bảng lương');
            }
        } finally {
            setLoading(false);
        }
    }, [periodFilter]);

    useEffect(() => {
        fetchBatches();
    }, [fetchBatches]);

    // Filter batches client-side
    const filteredBatches = useMemo(() => {
        let result = batches;

        // Status filter
        if (statusFilters.length > 0 && statusFilters.length < Object.keys(salaryStatusConfig).length) {
            result = result.filter(b => statusFilters.includes(b.status));
        }

        // Search filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter(b =>
                b.code.toLowerCase().includes(term) ||
                b.name.toLowerCase().includes(term)
            );
        }

        return result;
    }, [batches, statusFilters, searchTerm]);

    // Pagination
    const totalItems = filteredBatches.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const paginatedBatches = filteredBatches.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    useEffect(() => { setCurrentPage(1); }, [statusFilters, searchTerm, periodFilter]);

    // Summary
    const totalSalary = filteredBatches.reduce((s, b) => s + (b.total_salary || 0), 0);
    const totalPaid = filteredBatches.reduce((s, b) => s + (b.total_paid || 0), 0);
    const totalRemaining = filteredBatches.reduce((s, b) => s + (b.total_remaining || 0), 0);

    // Selection
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };
    const selectAll = () => {
        if (selectedIds.length === paginatedBatches.length && paginatedBatches.length > 0) setSelectedIds([]);
        else setSelectedIds(paginatedBatches.map(b => b.id));
    };

    const toggleStatusFilter = (status: SalaryStatus) => {
        setStatusFilters(prev =>
            prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
        );
    };



    // Period options
    const periodOptions = Array.from({ length: 24 }, (_, i) => {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        return formatPeriod(date.getMonth() + 1, date.getFullYear());
    });

    if (loading && batches.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-6rem)] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* ===== LEFT SIDEBAR ===== */}
            <div className="w-[220px] border-r border-gray-200 bg-[#fbfcfd] flex flex-col p-5 flex-shrink-0">
                <h1 className="text-[17px] font-bold mb-7 text-gray-900 tracking-tight">Bảng lương</h1>

                <div className="space-y-7">
                    {/* Payment Period Filter */}
                    <div className="space-y-3">
                        <h3 className="text-[13px] font-bold text-gray-700">Kỳ hạn trả lương</h3>
                        <Select value={periodFilter} onValueChange={setPeriodFilter}>
                            <SelectTrigger className="w-full h-[38px] bg-white border-gray-200 text-[13px] shadow-sm rounded-lg text-gray-600">
                                <SelectValue placeholder="Chọn kỳ hạn trả lương" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-[13px]">Tất cả kỳ</SelectItem>
                                {periodOptions.map(p => (
                                    <SelectItem key={p} value={p} className="text-[13px]">
                                        Tháng {p}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Status Filter */}
                    <div className="space-y-3">
                        <h3 className="text-[13px] font-bold text-gray-700">Trạng thái</h3>
                        <div className="space-y-2.5">
                            {(Object.entries(salaryStatusConfig) as [SalaryStatus, typeof salaryStatusConfig[SalaryStatus]][]).map(([key, config]) => (
                                <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                                    <Checkbox
                                        checked={statusFilters.includes(key)}
                                        onCheckedChange={() => toggleStatusFilter(key)}
                                        className="h-4 w-4 rounded border-gray-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                    />
                                    <span className={`text-[13px] ${statusFilters.includes(key) ? 'text-blue-600 font-medium' : 'text-gray-700'} group-hover:text-blue-600 transition-colors`}>
                                        {config.label}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== MAIN CONTENT ===== */}
            <div className="flex-1 flex flex-col min-w-0 bg-white">
                <GeneratePayrollDialog 
                    open={isGenerateDialogOpen} 
                    onOpenChange={setIsGenerateDialogOpen}
                    onGenerate={fetchBatches}
                />
                {/* Search Bar & Actions */}
                <div className="flex items-center justify-between p-3 border-b border-gray-100 gap-3 bg-[#fbfcfd]">
                    <div className="flex-1 relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-[45%] h-[15px] w-[15px] text-gray-400" />
                        <Input
                            className="w-full pl-[34px] h-[36px] border-gray-200 text-[13px] placeholder:text-gray-400 bg-white shadow-sm rounded-lg focus-visible:ring-1 focus-visible:ring-blue-500"
                            placeholder="Theo mã, tên bảng lương"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="h-[36px] px-3.5 text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 text-[13px] font-semibold rounded-lg shadow-sm"
                            onClick={() => setIsGenerateDialogOpen(true)}
                        >
                            + Bảng tính lương
                        </Button>
                        <Button
                            variant="outline"
                            className="h-[36px] px-3.5 border-gray-200 bg-white text-gray-700 text-[13px] font-semibold rounded-lg shadow-sm hover:bg-gray-50"
                        >
                            <Download className="h-[15px] w-[15px] mr-1.5 text-gray-500" />
                            Xuất file
                        </Button>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mx-3 mt-2 bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-[#f2f6ff] sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 w-10 border-b border-gray-100">
                                    <input
                                        type="checkbox"
                                        className="w-[14px] h-[14px] rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        checked={selectedIds.length === paginatedBatches.length && paginatedBatches.length > 0}
                                        onChange={selectAll}
                                    />
                                </th>
                                <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">MÃ</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">TÊN</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">KỲ HẠN TRẢ</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">KỲ LÀM VIỆC</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-right">TỔNG LƯƠNG</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-right">ĐÃ TRẢ NHÂN VIÊN</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide text-right">CÒN CẦN TRẢ</th>
                                <th className="px-4 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-100 tracking-wide">TRẠNG THÁI</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {/* Summary row */}
                            {filteredBatches.length > 0 && (
                                <tr className="bg-white border-b-2 border-gray-200">
                                    <td className="px-4 py-3" colSpan={5}></td>
                                    <td className="px-4 py-3 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalSalary)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalPaid)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalRemaining)}</td>
                                    <td className="px-4 py-3"></td>
                                </tr>
                            )}

                            {paginatedBatches.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-[13px] text-gray-500">
                                        {loading ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                                Đang tải...
                                            </div>
                                        ) : (
                                            <div>
                                                <p>Chưa có bảng lương.</p>
                                                <p className="text-[12px] text-gray-400 mt-1">
                                                    Bảng lương sẽ tự động tạo vào chủ nhật cuối cùng của tháng, hoặc nhấn "Bảng tính lương" để tạo thủ công.
                                                </p>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                paginatedBatches.map((batch) => {
                                    const isExpanded = expandedBatchId === batch.id;
                                    const statusInfo = salaryStatusConfig[batch.status] || { label: batch.status, color: '#6b7280' };

                                    return (
                                        <Fragment key={batch.id}>
                                            <tr
                                                className={`cursor-pointer transition-colors ${
                                                    isExpanded ? 'bg-blue-50/50' : 'hover:bg-blue-50/30'
                                                }`}
                                                onClick={(e) => {
                                                    if ((e.target as HTMLElement).tagName !== 'INPUT') {
                                                        setExpandedBatchId(isExpanded ? null : batch.id);
                                                    }
                                                }}
                                            >
                                                <td className="px-4 py-[13px]">
                                                    <input
                                                        type="checkbox"
                                                        className="w-[14px] h-[14px] rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        checked={selectedIds.includes(batch.id)}
                                                        onChange={() => toggleSelect(batch.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </td>
                                                <td className="px-4 py-[13px] text-blue-600 font-medium text-[13px]">{batch.code}</td>
                                                <td className="px-4 py-[13px] text-[13px]">
                                                    <p className="font-semibold text-blue-600">{batch.name}</p>
                                                </td>
                                                <td className="px-4 py-[13px] text-gray-700 text-[13px]">{batch.pay_period}</td>
                                                <td className="px-4 py-[13px] text-gray-700 text-[13px]">
                                                    {formatWorkPeriodFull(batch.month, batch.year)}
                                                </td>
                                                <td className="px-4 py-[13px] text-right text-gray-800 text-[13px] font-medium">
                                                    {formatCurrency(batch.total_salary)}
                                                </td>
                                                <td className="px-4 py-[13px] text-right text-gray-800 text-[13px] font-medium">
                                                    {formatCurrency(batch.total_paid)}
                                                </td>
                                                <td className="px-4 py-[13px] text-right text-gray-800 text-[13px] font-medium">
                                                    {formatCurrency(batch.total_remaining)}
                                                </td>
                                                <td className="px-4 py-[13px] text-[13px]">
                                                    <span className="text-blue-600">{statusInfo.label}</span>
                                                </td>
                                            </tr>

                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={9} className="p-0">
                                                        <ExpandedRowDetail batch={batch} onReload={fetchBatches} onViewDetail={() => navigate(`/salary/${batch.id}`)} />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalItems > 0 && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-[#fbfcfd]">
                        <div className="flex items-center gap-2 text-[13px] text-gray-600">
                            <span>Hiển thị</span>
                            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                                <SelectTrigger className="w-[80px] h-[30px] text-[13px] border-gray-200 bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="15" className="text-[13px]">15 bản ghi</SelectItem>
                                    <SelectItem value="25" className="text-[13px]">25 bản ghi</SelectItem>
                                    <SelectItem value="50" className="text-[13px]">50 bản ghi</SelectItem>
                                    <SelectItem value="100" className="text-[13px]">100 bản ghi</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <Button variant="outline" size="icon" className="h-[30px] w-[30px] border-gray-200" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
                                <ChevronsLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-[30px] w-[30px] border-gray-200" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <div className="flex items-center gap-1 mx-1">
                                <Input
                                    type="number"
                                    min={1}
                                    max={totalPages}
                                    value={currentPage}
                                    onChange={(e) => {
                                        const val = Number(e.target.value);
                                        if (val >= 1 && val <= totalPages) setCurrentPage(val);
                                    }}
                                    className="w-[40px] h-[30px] text-center text-[13px] border-gray-200 bg-white px-1"
                                />
                            </div>
                            <Button variant="outline" size="icon" className="h-[30px] w-[30px] border-gray-200" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-[30px] w-[30px] border-gray-200" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
                                <ChevronsRight className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-[13px] text-gray-500 ml-2">
                                {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)} trong {totalItems} bảng lương
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
