import { useState, useEffect, useRef } from 'react';
import { UserPlus, Loader2, Camera, Info, Plus, X, Pencil, EyeOff, Eye } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/utils';
import { uploadFile } from '@/lib/supabase';
import { toast } from 'sonner';
import type { UserRole } from '@/types';
import { EmployeeSalaryTab } from './EmployeeSalaryTab';

interface Employee {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: UserRole;
    department?: string;
    departmentId?: string;
    department_id?: string;
    avatar?: string;
    status?: string;
    salary?: number;
    commission?: number;
    bankAccount?: string;
    bankName?: string;
    telegramChatId?: string;
    joinDate?: string;
    employeeCode?: string;
    timekeepingCode?: string;
    dob?: string;
    gender?: string;
    identityCard?: string;
    jobTitleId?: string;
    job_title_id?: string;
    payrollBranchId?: string;
    payroll_branch_id?: string;
    workingBranchId?: string;
    working_branch_id?: string;
    kiotvietAccount?: string;
    facebook?: string;
    address?: string;
    mobileDevice?: string;
    notes?: string;
}

const roleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Quản lý' },
    { value: 'accountant', label: 'Kế toán' },
    { value: 'sale', label: 'Nhân viên bán hàng' },
    { value: 'technician', label: 'Kỹ thuật viên' },
    { value: 'cashier', label: 'Thu ngân' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value?: string | null) => !!value && UUID_RE.test(value);

function resolveDepartmentSelectValue(
    employee: Employee,
    departments: { id: string; name: string }[]
): string {
    if (isUuid(employee.departmentId)) return employee.departmentId!;
    if (isUuid(employee.department_id)) return employee.department_id!;
    if (isUuid(employee.department)) return employee.department!;
    if (employee.department) {
        const match = departments.find(d => d.name === employee.department);
        if (match) return match.id;
    }
    return '';
}

interface SystemUser {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: UserRole;
}

interface EmployeeFormDialogProps {
    open: boolean;
    onClose: () => void;
    employee?: Employee | null;
    departments: { id: string; name: string }[];
    jobTitles: { id: string; name: string }[];
    users: SystemUser[];
    onSubmit: (data: any) => Promise<void>;
    onCreateDepartment?: (data: { name: string; description: string; status: string }) => Promise<{ id: string } | void>;
    onCreateJobTitle?: (data: { name: string; description: string; status: string }) => Promise<{ id: string } | void>;
    onRefreshUsers?: () => void;
}

export function EmployeeFormDialog({
    open,
    onClose,
    employee,
    departments,
    jobTitles: jobTitlesProp,
    users: usersProp,
    onSubmit,
    onCreateDepartment,
    onCreateJobTitle,
    onRefreshUsers,
}: EmployeeFormDialogProps) {
    const [branches, setBranches] = useState<{ id: string, name: string }[]>([]);

    useEffect(() => {
        if (!open) return;
        api.get('/branches')
            .then((res) => {
                const body = res.data;
                const list =
                    body?.data?.branches ??
                    body?.branches ??
                    (Array.isArray(body) ? body : []);
                setBranches(Array.isArray(list) ? list : []);
            })
            .catch((err) => {
                console.warn('Could not load branches:', err);
                setBranches([]);
            });
    }, [open]);

    // Active tab
    const [activeTab, setActiveTab] = useState<'info' | 'salary'>('info');

    // Basic fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState<UserRole>('sale');
    const [department, setDepartment] = useState('');
    const [salary, setSalary] = useState(0);
    const [commission, setCommission] = useState(0);
    const [bankAccount, setBankAccount] = useState('');
    const [bankName, setBankName] = useState('');
    const [telegramChatId, setTelegramChatId] = useState('');
    const [joinDate, setJoinDate] = useState(new Date().toISOString().split('T')[0]);
    const [submitting, setSubmitting] = useState(false);
    const [avatar, setAvatar] = useState('');
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [salaryType, setSalaryType] = useState('');
    const [salaryTemplate, setSalaryTemplate] = useState('');

    // Extended fields
    const [dob, setDob] = useState('');
    const [gender, setGender] = useState('Nữ');
    const [identityCard, setIdentityCard] = useState('');
    const [jobTitleId, setJobTitleId] = useState('none');
    const [payrollBranchId, setPayrollBranchId] = useState('none');
    const [workingBranchId, setWorkingBranchId] = useState('none');
    const [kiotvietAccount, setKiotvietAccount] = useState('');
    const [facebook, setFacebook] = useState('');
    const [address, setAddress] = useState('');
    const [mobileDevice, setMobileDevice] = useState('');
    const [notes, setNotes] = useState('');

    // Salary tab toggles
    const [allowanceEnabled, setAllowanceEnabled] = useState(false);

    // Inline creation states
    const [showInlineDept, setShowInlineDept] = useState(false);
    const [inlineDeptName, setInlineDeptName] = useState('');
    const [savingInlineDept, setSavingInlineDept] = useState(false);

    const [showInlineTitle, setShowInlineTitle] = useState(false);
    const [inlineTitleName, setInlineTitleName] = useState('');
    const [savingInlineTitle, setSavingInlineTitle] = useState(false);
    const [localJobTitles, setLocalJobTitles] = useState(jobTitlesProp);

    // Account dialog states
    const [showCreateAccountDialog, setShowCreateAccountDialog] = useState(false);
    const [showEditAccountDialog, setShowEditAccountDialog] = useState(false);
    const [acctDisplayName, setAcctDisplayName] = useState('');
    const [acctPhone, setAcctPhone] = useState('');
    const [acctEmail, setAcctEmail] = useState('');
    const [acctUsername, setAcctUsername] = useState('');
    const [acctPassword, setAcctPassword] = useState('');
    const [acctPasswordConfirm, setAcctPasswordConfirm] = useState('');
    const [acctRole, setAcctRole] = useState<UserRole>('sale');
    const [acctShowPassword, setAcctShowPassword] = useState(false);
    const [acctShowPasswordConfirm, setAcctShowPasswordConfirm] = useState(false);
    const [savingAccount, setSavingAccount] = useState(false);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('none');

    const isEditing = !!employee;

    useEffect(() => {
        setLocalJobTitles(jobTitlesProp);
    }, [jobTitlesProp]);

    // Reset form when employee changes
    useEffect(() => {
        if (employee) {
            setName(employee.name || '');
            setEmail(employee.email || '');
            setAvatar(employee.avatar || '');
            setPhone(employee.phone || '');
            setRole(employee.role || 'sale');
            setDepartment(resolveDepartmentSelectValue(employee, departments));
            setSalary(employee.salary || 0);
            setCommission(employee.commission || 0);
            setBankAccount(employee.bankAccount || '');
            setBankName(employee.bankName || '');
            setTelegramChatId(employee.telegramChatId || '');
            setJoinDate(employee.joinDate || new Date().toISOString().split('T')[0]);

            setDob(employee.dob || '');
            setGender(employee.gender || 'Nữ');
            setIdentityCard(employee.identityCard || '');
            setJobTitleId(employee.jobTitleId || employee.job_title_id || 'none');
            setPayrollBranchId(employee.payrollBranchId || employee.payroll_branch_id || 'none');
            setWorkingBranchId(employee.workingBranchId || employee.working_branch_id || 'none');
            setKiotvietAccount(employee.kiotvietAccount || '');
            setFacebook(employee.facebook || '');
            setAddress(employee.address || '');
            setMobileDevice(employee.mobileDevice || '');
            setNotes(employee.notes || '');
            setSelectedAccountId(employee.id || 'none');

            setPassword('');
            setPasswordConfirm('');
        } else {
            setName('');
            setEmail('');
            setPassword('');
            setPasswordConfirm('');
            setAvatar('');
            setPhone('');
            setRole('sale');
            setDepartment('');
            setSalary(0);
            setCommission(0);
            setBankAccount('');
            setBankName('');
            setTelegramChatId('');
            setJoinDate(new Date().toISOString().split('T')[0]);

            setDob('');
            setGender('Nữ');
            setIdentityCard('');
            setJobTitleId('none');
            setPayrollBranchId('none');
            setWorkingBranchId('none');
            setKiotvietAccount('');
            setFacebook('');
            setAddress('');
            setMobileDevice('');
            setNotes('');
            setSelectedAccountId('none');
        }
        setActiveTab('info');
        setShowInlineDept(false);
        setShowInlineTitle(false);
        setInlineDeptName('');
        setInlineTitleName('');
        setShowCreateAccountDialog(false);
        setShowEditAccountDialog(false);
    }, [employee, open, departments]);

    const handleSubmit = async () => {
        if (!name || !email || !phone) {
            toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
            return;
        }

        if (!isEditing) {
            if (!password || password.length < 6) {
                toast.error('Mật khẩu phải có ít nhất 6 ký tự');
                return;
            }
            if (password !== passwordConfirm) {
                toast.error('Mật khẩu nhập lại không khớp');
                return;
            }
        } else if (password) {
            if (password.length < 6) {
                toast.error('Mật khẩu phải có ít nhất 6 ký tự');
                return;
            }
            if (password !== passwordConfirm) {
                toast.error('Mật khẩu nhập lại không khớp');
                return;
            }
        }

        setSubmitting(true);
        try {
            const normalizedDepartment = department && department !== 'none' ? department : '';
            const departmentId = isUuid(normalizedDepartment) ? normalizedDepartment : undefined;
            const departmentName = departmentId
                ? departments.find(d => d.id === departmentId)?.name
                : undefined;

            const submitData: any = {
                name,
                email,
                phone,
                role,
                department: departmentName || undefined,
                departmentId,
                salary,
                commission,
                bankAccount,
                bankName,
                telegramChatId: telegramChatId.trim() || undefined,
                joinDate,
                avatar: avatar || undefined,
                status: employee?.status || 'active',
                dob: dob || undefined,
                gender: gender || undefined,
                identityCard: identityCard || undefined,
                jobTitleId: jobTitleId === 'none' ? undefined : jobTitleId,
                payrollBranchId: payrollBranchId === 'none' ? undefined : payrollBranchId,
                workingBranchId: workingBranchId === 'none' ? undefined : workingBranchId,
                kiotvietAccount: kiotvietAccount || undefined,
                facebook: facebook || undefined,
                address: address || undefined,
                mobileDevice: mobileDevice || undefined,
                notes: notes || undefined
            };

            if (password) {
                submitData.password = password;
            }

            await onSubmit(submitData);
            onClose();
        } catch (error: any) {
            console.error('Error saving employee:', error);
            toast.error(error?.message || 'Lỗi khi lưu nhân viên');
        } finally {
            setSubmitting(false);
        }
    };

    // Inline department creation
    const handleInlineDeptCreate = async () => {
        if (!inlineDeptName.trim()) {
            toast.error('Vui lòng nhập tên phòng ban');
            return;
        }
        setSavingInlineDept(true);
        try {
            if (onCreateDepartment) {
                const created = await onCreateDepartment({ name: inlineDeptName, description: '', status: 'active' });
                if (created?.id) setDepartment(created.id);
            }
            toast.success('Đã tạo phòng ban mới!');
            setInlineDeptName('');
            setShowInlineDept(false);
        } catch {
            toast.error('Lỗi khi tạo phòng ban');
        } finally {
            setSavingInlineDept(false);
        }
    };

    // Inline job title creation
    const handleInlineTitleCreate = async () => {
        if (!inlineTitleName.trim()) {
            toast.error('Vui lòng nhập tên chức danh');
            return;
        }
        setSavingInlineTitle(true);
        try {
            if (onCreateJobTitle) {
                const created = await onCreateJobTitle({ name: inlineTitleName, description: '', status: 'active' });
                if (created?.id) {
                    setJobTitleId(created.id);
                    setLocalJobTitles((prev) => {
                        if (prev.some((jt) => jt.id === created.id)) return prev;
                        return [...prev, { id: created.id, name: inlineTitleName.trim() }];
                    });
                }
            }
            toast.success('Đã tạo chức danh mới!');
            setInlineTitleName('');
            setShowInlineTitle(false);
        } catch {
            toast.error('Lỗi khi tạo chức danh');
        } finally {
            setSavingInlineTitle(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onClose}>
                <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
                    <div className="flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="px-6 pt-5 pb-0">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-[16px]">
                                    <UserPlus className="h-5 w-5 text-blue-600" />
                                    {employee ? 'Cập nhật nhân viên' : 'Thêm nhân viên mới'}
                                    {employee && <span className="text-gray-400 font-normal text-[14px]">| {employee.name}</span>}
                                </DialogTitle>
                                <DialogDescription className="sr-only">Nhập thông tin nhân viên</DialogDescription>
                            </DialogHeader>
                        </div>

                        {/* Tab Headers */}
                        <div className="flex border-b border-gray-200 px-6 mt-3">
                            <button
                                className={`px-5 py-2.5 text-[13px] font-semibold transition-colors relative ${activeTab === 'info'
                                    ? 'text-blue-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                onClick={() => setActiveTab('info')}
                            >
                                Thông tin
                                {activeTab === 'info' && (
                                    <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-blue-600 rounded-t" />
                                )}
                            </button>
                            <button
                                className={`px-5 py-2.5 text-[13px] font-semibold transition-colors relative ${activeTab === 'salary'
                                    ? 'text-blue-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                onClick={() => setActiveTab('salary')}
                            >
                                Thiết lập lương
                                {activeTab === 'salary' && (
                                    <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-blue-600 rounded-t" />
                                )}
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className={`flex-1 overflow-y-auto min-h-0 ${activeTab === 'info' ? 'px-6 pb-4' : ''}`} style={{ maxHeight: 'calc(90vh - 170px)' }}>
                            {/* ========== TAB 1: THÔNG TIN ========== */}
                            {activeTab === 'info' && (
                                <div className="py-5 space-y-6">
                                    {/* Thông tin khởi tạo */}
                                    <div>
                                        <h3 className="text-[13px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                                            <div className="w-1 h-4 bg-blue-500 rounded-full" />
                                            Thông tin khởi tạo
                                        </h3>
                                        <div className="flex gap-6">
                                            {/* Avatar */}
                                            <div className="shrink-0 flex flex-col items-center gap-2">
                                                <div className="relative group">
                                                    <div
                                                        className="w-[80px] h-[80px] rounded-full border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
                                                        onClick={() => avatarInputRef.current?.click()}
                                                    >
                                                        {uploadingAvatar ? (
                                                            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                                        ) : avatar ? (
                                                            <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-0.5">
                                                                <Camera className="w-5 h-5 text-gray-400" />
                                                                <span className="text-[9px] text-gray-400">Tải ảnh</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {avatar && (
                                                        <div
                                                            className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                                            onClick={() => avatarInputRef.current?.click()}
                                                        >
                                                            <Camera className="w-4 h-4 text-white" />
                                                        </div>
                                                    )}
                                                    <input
                                                        ref={avatarInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            if (file.size > 5 * 1024 * 1024) {
                                                                toast.error('Ảnh không được lớn hơn 5MB');
                                                                return;
                                                            }
                                                            setUploadingAvatar(true);
                                                            try {
                                                                const { url, error } = await uploadFile('avatars', 'employees', file);
                                                                if (error) throw error;
                                                                if (url) setAvatar(url);
                                                                toast.success('Đã tải ảnh lên!');
                                                            } catch (err) {
                                                                console.error('Upload avatar error:', err);
                                                                toast.error('Lỗi khi tải ảnh lên');
                                                            } finally {
                                                                setUploadingAvatar(false);
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <button
                                                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                                                    onClick={() => avatarInputRef.current?.click()}
                                                >
                                                    Chọn ảnh
                                                </button>
                                            </div>

                                            {/* Info fields */}
                                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-3">
                                                <div className="space-y-1">
                                                    <Label className="text-[12px] text-gray-500">Mã nhân viên</Label>
                                                    <Input
                                                        value={employee?.employeeCode || ''}
                                                        disabled
                                                        placeholder="Mã tự động sinh"
                                                        className="h-[34px] text-[13px] bg-gray-50"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[12px] text-gray-500">Tên nhân viên *</Label>
                                                    <Input
                                                        value={name}
                                                        onChange={(e) => setName(e.target.value)}
                                                        placeholder="Nhập họ và tên"
                                                        className="h-[34px] text-[13px]"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[12px] text-gray-500">Số điện thoại *</Label>
                                                    <Input
                                                        value={phone}
                                                        onChange={(e) => setPhone(e.target.value)}
                                                        placeholder="0912345678"
                                                        className="h-[34px] text-[13px]"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Thông tin công việc */}
                                    <div>
                                        <h3 className="text-[13px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                                            <div className="w-1 h-4 bg-blue-500 rounded-full" />
                                            Thông tin công việc
                                        </h3>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Ngày bắt đầu làm việc</Label>
                                                <Input
                                                    type="date"
                                                    value={joinDate}
                                                    onChange={(e) => setJoinDate(e.target.value)}
                                                    className="h-[34px] text-[13px]"
                                                />
                                            </div>

                                            {/* Phòng ban with + button */}
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Phòng ban</Label>
                                                <div className="flex items-center gap-1.5">
                                                    <Select value={department} onValueChange={setDepartment}>
                                                        <SelectTrigger className="flex-1 h-[34px] text-[13px]">
                                                            <SelectValue placeholder="Chọn Phòng ban" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">-- Không chọn --</SelectItem>
                                                            {departments.map(d => (
                                                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <button
                                                        type="button"
                                                        className="shrink-0 w-[34px] h-[34px] rounded-md border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition-colors flex items-center justify-center"
                                                        onClick={() => { setShowInlineDept(!showInlineDept); setInlineDeptName(''); }}
                                                        title="Thêm phòng ban mới"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </button>
                                                </div>
                                                {/* Inline dept creation */}
                                                {showInlineDept && (
                                                    <div className="mt-1.5 p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg space-y-2 animate-in slide-in-from-top-1 duration-200">
                                                        <div className="flex items-center gap-2">
                                                            <Input
                                                                value={inlineDeptName}
                                                                onChange={(e) => setInlineDeptName(e.target.value)}
                                                                placeholder="Tên phòng ban mới..."
                                                                className="flex-1 h-[30px] text-[12px] bg-white"
                                                                onKeyDown={(e) => { if (e.key === 'Enter') handleInlineDeptCreate(); }}
                                                                autoFocus
                                                            />
                                                            <Button
                                                                size="sm"
                                                                className="h-[30px] px-3 text-[11px] bg-blue-600 hover:bg-blue-700"
                                                                disabled={savingInlineDept}
                                                                onClick={handleInlineDeptCreate}
                                                            >
                                                                {savingInlineDept ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Thêm'}
                                                            </Button>
                                                            <button
                                                                className="text-gray-400 hover:text-gray-600"
                                                                onClick={() => { setShowInlineDept(false); setInlineDeptName(''); }}
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Chức danh with + button */}
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">
                                                    Chức danh
                                                    <span className="text-gray-400 font-normal ml-1">(chọn hoặc nhấn + thêm mới)</span>
                                                </Label>
                                                <div className="flex items-center gap-1.5">
                                                    <Select value={jobTitleId} onValueChange={setJobTitleId}>
                                                        <SelectTrigger className="flex-1 h-[34px] text-[13px]">
                                                            <SelectValue placeholder="Chọn Chức danh" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">-- Không chọn --</SelectItem>
                                                            {localJobTitles.map(jt => (
                                                                <SelectItem key={jt.id} value={jt.id}>{jt.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <button
                                                        type="button"
                                                        className="shrink-0 w-[34px] h-[34px] rounded-md border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition-colors flex items-center justify-center"
                                                        onClick={() => { setShowInlineTitle(!showInlineTitle); setInlineTitleName(''); }}
                                                        title="Thêm chức danh mới"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </button>
                                                </div>
                                                {/* Inline title creation */}
                                                {showInlineTitle && (
                                                    <div className="mt-1.5 p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg space-y-2 animate-in slide-in-from-top-1 duration-200">
                                                        <div className="flex items-center gap-2">
                                                            <Input
                                                                value={inlineTitleName}
                                                                onChange={(e) => setInlineTitleName(e.target.value)}
                                                                placeholder="Tên chức danh mới..."
                                                                className="flex-1 h-[30px] text-[12px] bg-white"
                                                                onKeyDown={(e) => { if (e.key === 'Enter') handleInlineTitleCreate(); }}
                                                                autoFocus
                                                            />
                                                            <Button
                                                                size="sm"
                                                                className="h-[30px] px-3 text-[11px] bg-blue-600 hover:bg-blue-700"
                                                                disabled={savingInlineTitle}
                                                                onClick={handleInlineTitleCreate}
                                                            >
                                                                {savingInlineTitle ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Thêm'}
                                                            </Button>
                                                            <button
                                                                className="text-gray-400 hover:text-gray-600"
                                                                onClick={() => { setShowInlineTitle(false); setInlineTitleName(''); }}
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Tài khoản đăng nhập with dropdown + edit + add */}
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Tài khoản đăng nhập</Label>
                                                <div className="flex items-center gap-1.5">
                                                    <Select value={selectedAccountId} onValueChange={(v) => {
                                                        setSelectedAccountId(v);
                                                        const u = usersProp.find(u => u.id === v);
                                                        if (u) {
                                                            setEmail(u.email);
                                                            setRole(u.role);
                                                        }
                                                    }}>
                                                        <SelectTrigger className="flex-1 h-[34px] text-[13px]">
                                                            <SelectValue placeholder="Chọn Tài khoản" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">-- Chọn Tài khoản --</SelectItem>
                                                            {usersProp.map(u => (
                                                                <SelectItem key={u.id} value={u.id}>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[13px] font-medium">{u.email}</span>
                                                                        <span className="text-[11px] text-gray-400 uppercase">{u.name}</span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {/* Edit button */}
                                                    <button
                                                        type="button"
                                                        className="shrink-0 w-[34px] h-[34px] rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-blue-600 hover:border-blue-200 transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                                                        onClick={() => {
                                                            const u = usersProp.find(u => u.id === selectedAccountId);
                                                            if (u) {
                                                                setAcctDisplayName(u.name);
                                                                setAcctPhone(u.phone || '');
                                                                setAcctEmail(u.email);
                                                                setAcctUsername(u.email.split('@')[0]);
                                                                setAcctPassword('');
                                                                setAcctPasswordConfirm('');
                                                                setAcctRole(u.role);
                                                                setShowEditAccountDialog(true);
                                                            }
                                                        }}
                                                        disabled={selectedAccountId === 'none'}
                                                        title="Cập nhật tài khoản"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    {/* Add button */}
                                                    <button
                                                        type="button"
                                                        className="shrink-0 w-[34px] h-[34px] rounded-md border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition-colors flex items-center justify-center"
                                                        onClick={() => {
                                                            setAcctDisplayName('');
                                                            setAcctPhone('');
                                                            setAcctEmail('');
                                                            setAcctUsername('');
                                                            setAcctPassword('');
                                                            setAcctPasswordConfirm('');
                                                            setAcctRole('sale');
                                                            setShowCreateAccountDialog(true);
                                                        }}
                                                        title="Tạo tài khoản mới"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Thiết bị di động</Label>
                                                <Input
                                                    value={mobileDevice}
                                                    onChange={(e) => setMobileDevice(e.target.value)}
                                                    placeholder="Thông tin thiết bị"
                                                    className="h-[34px] text-[13px]"
                                                />
                                            </div>
                                            <div className="space-y-1 col-span-2">
                                                <Label className="text-[12px] text-gray-500">Ghi chú</Label>
                                                <Input
                                                    value={notes}
                                                    onChange={(e) => setNotes(e.target.value)}
                                                    placeholder="Ghi chú thêm..."
                                                    className="h-[34px] text-[13px]"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Thông tin cá nhân */}
                                    <div>
                                        <h3 className="text-[13px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                                            <div className="w-1 h-4 bg-blue-500 rounded-full" />
                                            Thông tin cá nhân
                                        </h3>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Số CMND/CCCD</Label>
                                                <Input
                                                    value={identityCard}
                                                    onChange={(e) => setIdentityCard(e.target.value)}
                                                    placeholder="Nhập CMND/CCCD"
                                                    className="h-[34px] text-[13px]"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Ngày sinh</Label>
                                                <Input
                                                    type="date"
                                                    value={dob}
                                                    onChange={(e) => setDob(e.target.value)}
                                                    className="h-[34px] text-[13px]"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Giới tính</Label>
                                                <div className="flex items-center gap-6 h-[34px]">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="gender-radio"
                                                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                                            checked={gender === 'Nam'}
                                                            onChange={() => setGender('Nam')}
                                                        />
                                                        <span className="text-[13px] text-gray-700">Nam</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="gender-radio"
                                                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                                            checked={gender === 'Nữ'}
                                                            onChange={() => setGender('Nữ')}
                                                        />
                                                        <span className="text-[13px] text-gray-700">Nữ</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Thông tin liên hệ */}
                                    <div>
                                        <h3 className="text-[13px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                                            <div className="w-1 h-4 bg-blue-500 rounded-full" />
                                            Thông tin liên hệ
                                        </h3>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Email *</Label>
                                                <Input
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    placeholder="email@company.com"
                                                    disabled={isEditing}
                                                    className="h-[34px] text-[13px]"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">
                                                    Mật khẩu {isEditing ? '' : '*'}
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        type={showPassword ? 'text' : 'password'}
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        placeholder={isEditing ? 'Để trống nếu không đổi' : 'Tối thiểu 6 ký tự'}
                                                        className="h-[34px] text-[13px] pr-9"
                                                        autoComplete="new-password"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                    >
                                                        {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">
                                                    Nhập lại mật khẩu {isEditing ? '' : '*'}
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        type={showPasswordConfirm ? 'text' : 'password'}
                                                        value={passwordConfirm}
                                                        onChange={(e) => setPasswordConfirm(e.target.value)}
                                                        placeholder={isEditing ? 'Để trống nếu không đổi' : 'Nhập lại mật khẩu'}
                                                        className="h-[34px] text-[13px] pr-9"
                                                        autoComplete="new-password"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                        onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                                                    >
                                                        {showPasswordConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Telegram Chat ID</Label>
                                                <Input
                                                    value={telegramChatId}
                                                    onChange={(e) => setTelegramChatId(e.target.value)}
                                                    placeholder="VD: 123456789"
                                                    className="h-[34px] text-[13px]"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Địa chỉ</Label>
                                                <Input
                                                    value={address}
                                                    onChange={(e) => setAddress(e.target.value)}
                                                    placeholder="Nhập địa chỉ"
                                                    className="h-[34px] text-[13px]"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[12px] text-gray-500">Facebook</Label>
                                                <Input
                                                    value={facebook}
                                                    onChange={(e) => setFacebook(e.target.value)}
                                                    placeholder="Nhập tên/URL Facebook"
                                                    className="h-[34px] text-[13px]"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ========== TAB 2: THIẾT LẬP LƯƠNG ========== */}
                            {activeTab === 'salary' && (
                                employee?.id ? (
                                    <EmployeeSalaryTab employeeId={employee.id} />
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 text-center">
                                        <h3 className="text-[14px] font-bold text-gray-800 mb-2">Chưa thể thiết lập lương</h3>
                                        <p className="text-[13px] text-gray-500">Vui lòng lưu thông tin nhân viên (Thêm mới) trước khi thiết lập bảng lương.</p>
                                    </div>
                                )
                            )}
                        </div>

                        {/* Sticky Footer */}
                        {activeTab !== 'salary' && (
                            <div className="shrink-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-end gap-2">
                                <Button variant="outline" onClick={onClose} className="text-[13px] h-[36px] px-5">Bỏ qua</Button>
                                <Button onClick={handleSubmit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-[13px] h-[36px] px-5">
                                    {submitting ? 'Đang lưu...' : 'Lưu'}
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ===== Dialog: Tạo tài khoản người dùng ===== */}
            <Dialog open={showCreateAccountDialog} onOpenChange={setShowCreateAccountDialog}>
                <DialogContent className="max-w-[680px] p-0 gap-0">
                    <div className="px-6 pt-5 pb-4">
                        <DialogHeader>
                            <DialogTitle className="text-[16px] font-bold">Tạo tài khoản người dùng</DialogTitle>
                            <DialogDescription className="sr-only">Tạo tài khoản đăng nhập mới</DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 pb-5 space-y-4">
                        {/* Row 1 */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Tên hiển thị</Label>
                                <Input value={acctDisplayName} onChange={e => setAcctDisplayName(e.target.value)} placeholder="Bắt buộc" className="h-[36px] text-[13px]" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Số điện thoại</Label>
                                <Input value={acctPhone} onChange={e => setAcctPhone(e.target.value)} placeholder="0912 345 678" className="h-[36px] text-[13px]" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Email</Label>
                                <Input value={acctEmail} onChange={e => setAcctEmail(e.target.value)} placeholder="email@gmail.com" className="h-[36px] text-[13px]" />
                            </div>
                        </div>
                        {/* Row 2 */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Tên đăng nhập</Label>
                                <Input value={acctUsername} onChange={e => setAcctUsername(e.target.value)} placeholder="Bắt buộc" className="h-[36px] text-[13px]" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Mật khẩu</Label>
                                <div className="relative">
                                    <Input type={acctShowPassword ? 'text' : 'password'} value={acctPassword} onChange={e => setAcctPassword(e.target.value)} placeholder="Bắt buộc" className="h-[36px] text-[13px] pr-9" />
                                    <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setAcctShowPassword(!acctShowPassword)}>
                                        {acctShowPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Nhập lại mật khẩu</Label>
                                <div className="relative">
                                    <Input type={acctShowPasswordConfirm ? 'text' : 'password'} value={acctPasswordConfirm} onChange={e => setAcctPasswordConfirm(e.target.value)} placeholder="Bắt buộc" className="h-[36px] text-[13px] pr-9" />
                                    <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setAcctShowPasswordConfirm(!acctShowPasswordConfirm)}>
                                        {acctShowPasswordConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        {/* Phân quyền */}
                        <div className="mt-4 p-4 rounded-lg border border-gray-200 bg-gray-50/50 space-y-3">
                            <div>
                                <h4 className="text-[13px] font-bold text-blue-600">Phân quyền</h4>
                                <p className="text-[11px] text-gray-400 mt-0.5">Chọn chi nhánh và phân quyền cho người dùng này</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Vai trò</Label>
                                <Select value={acctRole} onValueChange={(v: UserRole) => setAcctRole(v)}>
                                    <SelectTrigger className="w-[220px] h-[36px] text-[13px] bg-white">
                                        <SelectValue placeholder="Chọn vai trò" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roleOptions.map(r => (
                                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                    <span className="text-[13px] text-gray-700">Xem thông tin chung của hàng hóa, giao dịch, đối tác</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                    <span className="text-[13px] text-gray-700">Xem, chỉnh sửa giao dịch và xem báo cáo cuối ngày của nhân viên khác</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-200 px-6 py-3 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowCreateAccountDialog(false)} className="text-[13px] h-[36px] px-5">Bỏ qua</Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-[13px] h-[36px] px-5"
                            disabled={savingAccount}
                            onClick={async () => {
                                if (!acctDisplayName || !acctEmail || !acctPassword) {
                                    toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
                                    return;
                                }
                                if (acctPassword.length < 6) {
                                    toast.error('Mật khẩu phải có ít nhất 6 ký tự');
                                    return;
                                }
                                if (acctPassword !== acctPasswordConfirm) {
                                    toast.error('Mật khẩu nhập lại không khớp');
                                    return;
                                }
                                setSavingAccount(true);
                                try {
                                    const res = await api.post('/users', {
                                        name: acctDisplayName,
                                        email: acctEmail,
                                        password: acctPassword,
                                        phone: acctPhone || undefined,
                                        role: acctRole,
                                    });
                                    const newUser = (res as any)?.data?.data?.user || (res as any)?.data?.user || res;
                                    toast.success('Đã tạo tài khoản mới!');
                                    setShowCreateAccountDialog(false);
                                    if (newUser?.id) {
                                        setSelectedAccountId(newUser.id);
                                        setEmail(newUser.email);
                                        setRole(newUser.role);
                                    }
                                    onRefreshUsers?.();
                                } catch (err: any) {
                                    toast.error(err?.response?.data?.message || err?.message || 'Lỗi khi tạo tài khoản');
                                } finally {
                                    setSavingAccount(false);
                                }
                            }}
                        >
                            {savingAccount ? 'Đang lưu...' : 'Lưu'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ===== Dialog: Cập nhật người dùng ===== */}
            <Dialog open={showEditAccountDialog} onOpenChange={setShowEditAccountDialog}>
                <DialogContent className="max-w-[680px] p-0 gap-0">
                    <div className="px-6 pt-5 pb-4">
                        <DialogHeader>
                            <DialogTitle className="text-[16px] font-bold">Cập nhật người dùng</DialogTitle>
                            <DialogDescription className="sr-only">Cập nhật thông tin tài khoản</DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="px-6 pb-5 space-y-4">
                        {/* Row 1 */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Tên hiển thị</Label>
                                <Input value={acctDisplayName} onChange={e => setAcctDisplayName(e.target.value)} className="h-[36px] text-[13px]" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Số điện thoại</Label>
                                <Input value={acctPhone} onChange={e => setAcctPhone(e.target.value)} className="h-[36px] text-[13px]" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Email</Label>
                                <Input value={acctEmail} disabled className="h-[36px] text-[13px] bg-gray-50" />
                            </div>
                        </div>
                        {/* Row 2 */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Tên đăng nhập</Label>
                                <Input value={acctUsername} disabled className="h-[36px] text-[13px] bg-gray-50" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Mật khẩu</Label>
                                <div className="relative">
                                    <Input type={acctShowPassword ? 'text' : 'password'} value={acctPassword} onChange={e => setAcctPassword(e.target.value)} placeholder="Bắt buộc" className="h-[36px] text-[13px] pr-9" />
                                    <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setAcctShowPassword(!acctShowPassword)}>
                                        {acctShowPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] text-gray-500">Nhập lại mật khẩu</Label>
                                <div className="relative">
                                    <Input type={acctShowPasswordConfirm ? 'text' : 'password'} value={acctPasswordConfirm} onChange={e => setAcctPasswordConfirm(e.target.value)} placeholder="Bắt buộc" className="h-[36px] text-[13px] pr-9" />
                                    <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setAcctShowPasswordConfirm(!acctShowPasswordConfirm)}>
                                        {acctShowPasswordConfirm ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-200 px-6 py-3 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowEditAccountDialog(false)} className="text-[13px] h-[36px] px-5">Bỏ qua</Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-[13px] h-[36px] px-5"
                            disabled={savingAccount}
                            onClick={async () => {
                                if (!acctDisplayName) {
                                    toast.error('Tên hiển thị không được để trống');
                                    return;
                                }
                                if (acctPassword && acctPassword.length < 6) {
                                    toast.error('Mật khẩu phải có ít nhất 6 ký tự');
                                    return;
                                }
                                if (acctPassword && acctPassword !== acctPasswordConfirm) {
                                    toast.error('Mật khẩu nhập lại không khớp');
                                    return;
                                }
                                setSavingAccount(true);
                                try {
                                    const updateData: any = {
                                        name: acctDisplayName,
                                        phone: acctPhone || undefined,
                                    };
                                    if (acctPassword) {
                                        updateData.password = acctPassword;
                                    }
                                    await api.put(`/users/${selectedAccountId}`, updateData);
                                    toast.success('Đã cập nhật tài khoản!');
                                    setShowEditAccountDialog(false);
                                    onRefreshUsers?.();
                                } catch (err: any) {
                                    toast.error(err?.response?.data?.message || err?.message || 'Lỗi khi cập nhật');
                                } finally {
                                    setSavingAccount(false);
                                }
                            }}
                        >
                            {savingAccount ? 'Đang lưu...' : 'Lưu'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

