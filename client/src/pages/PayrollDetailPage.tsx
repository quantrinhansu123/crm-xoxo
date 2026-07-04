import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Search, Save, CreditCard, Check, MoreHorizontal,
    Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    Trash2, X, Pencil, UserPlus, RefreshCw, Download, ChevronRight as ChevronRightIcon, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { payrollBatchesApi } from '@/lib/api';
import { type SalaryRecord } from '@/hooks/useSalary';
import { formatCurrency } from '@/lib/utils';
import { UpdateBaseSalaryDialog } from '@/components/salary/UpdateBaseSalaryDialog';
import { BusinessCommissionDetailDialog } from '@/components/salary/BusinessCommissionDetailDialog';
import { BonusDetailDialog } from '@/components/salary/BonusDetailDialog';
import { DeductionDetailDialog } from '@/components/salary/DeductionDetailDialog';
import { PersonalPaysheetDialog } from '@/components/salary/PersonalPaysheetDialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ========== STATUS CONFIG ==========
const salaryStatusConfig = {
    draft: { label: 'Đang tạo', color: '#2563eb' },
    pending: { label: 'Tạm tính', color: '#2563eb' },
    approved: { label: 'Đã chốt lương', color: '#16a34a' },
    paid: { label: 'Đã trả', color: '#16a34a' },
    locked: { label: 'Đã khóa kỳ', color: '#6b7280' },
} as const;

type SalaryStatus = keyof typeof salaryStatusConfig;

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
    created_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
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

// ========== DROPDOWN MENU (3-dot) ==========
function MoreActionsMenu({ onReload }: { onReload: () => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <Button
                variant="outline"
                size="icon"
                className="h-[34px] w-[34px] border-gray-200 bg-white"
                onClick={() => setOpen(prev => !prev)}
            >
                <MoreHorizontal className="h-4 w-4" />
            </Button>

            {open && (
                <div className="absolute right-0 top-[38px] w-[240px] bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1">
                    <button
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => { setOpen(false); }}
                    >
                        <UserPlus className="h-4 w-4 text-gray-400" />
                        Thêm nhân viên vào bảng lương
                    </button>
                    <button
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => { setOpen(false); onReload(); }}
                    >
                        <RefreshCw className="h-4 w-4 text-gray-400" />
                        Tải lại bảng lương
                    </button>
                    <button
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => { setOpen(false); }}
                    >
                        <Download className="h-4 w-4 text-gray-400" />
                        Xuất file
                    </button>
                </div>
            )}
        </div>
    );
}

// ========== RIGHT SIDE DRAWER ==========
function PayrollInfoDrawer({
    open,
    onClose,
    batch,
}: {
    open: boolean;
    onClose: () => void;
    batch: PayrollBatch;
}) {
    const statusLabel = salaryStatusConfig[batch.status]?.label || batch.status;
    const now = new Date();
    const dateDisplay = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return (
        <>
            {/* Overlay */}
            {open && (
                <div
                    className="fixed inset-0 bg-black/20 z-40 transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Drawer */}
            <div
                className={`fixed top-0 right-0 h-full w-[340px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
                    open ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-[#fbfcfd]">
                    <div className="flex items-center gap-2">
                        <Select defaultValue="info">
                            <SelectTrigger className="h-[32px] w-[100px] text-[13px] border-gray-200 bg-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="info" className="text-[13px]">Thông tin</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[12px] text-gray-400">{dateDisplay}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                    <div className="space-y-4">
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Mã bảng lương :</p>
                            <p className="text-[13px] font-semibold text-gray-800">{batch.code}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Tên bảng lương :</p>
                            <Input
                                defaultValue={batch.name}
                                className="h-[34px] text-[13px] border-gray-200"
                            />
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Kỳ hạn trả :</p>
                            <p className="text-[13px] text-gray-800">{batch.pay_period}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Kỳ làm việc :</p>
                            <p className="text-[13px] text-gray-800">{formatWorkPeriodFull(batch.month, batch.year)}</p>
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Ngày công chuẩn :</p>
                            <Input
                                type="number"
                                defaultValue={(batch as any).standard_work_days || (batch as any).company_policy?.standard_work_days || 26}
                                className="h-[34px] text-[13px] border-gray-200 w-[80px]"
                            />
                        </div>
                        <div>
                            <p className="text-[11px] text-gray-400 mb-1">Trạng thái :</p>
                            <p className="text-[13px] font-medium text-blue-600">{statusLabel}</p>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <p className="text-[11px] text-gray-400 mb-1 flex items-center gap-1">
                            <Pencil className="h-3 w-3" />
                            Ghi chú
                        </p>
                        <textarea
                            className="w-full min-h-[100px] border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                            defaultValue={batch.notes || ''}
                            placeholder="Nhập ghi chú..."
                        />
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
                    <Button className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] h-[40px] rounded-lg">
                        <Save className="h-4 w-4" />
                        Lưu tạm
                    </Button>
                    <Button className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white text-[13px] h-[40px] rounded-lg">
                        <Check className="h-4 w-4" />
                        Chốt lương
                    </Button>
                </div>
            </div>
        </>
    );
}

// ========== MAIN DETAIL PAGE ==========
export function PayrollDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [batch, setBatch] = useState<PayrollBatch | null>(null);
    const [records, setRecords] = useState<SalaryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    
    // For Salary Edit Dialog
    const [editRecord, setEditRecord] = useState<SalaryRecord | null>(null);
    const [commissionRecord, setCommissionRecord] = useState<SalaryRecord | null>(null);
    const [bonusRecord, setBonusRecord] = useState<SalaryRecord | null>(null);
    const [deductionRecord, setDeductionRecord] = useState<SalaryRecord | null>(null);
    const [selectedPaysheetRecord, setSelectedPaysheetRecord] = useState<{ record: SalaryRecord, plCode: string } | null>(null);
    const [isPaysheetDialogOpen, setIsPaysheetDialogOpen] = useState(false);
    const [confirmLockOpen, setConfirmLockOpen] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const fetchData = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const res = await payrollBatchesApi.getById(id);
            setBatch(res.data.data?.batch || null);
            setRecords(res.data.data?.records || []);
        } catch (e) {
            console.error('Error fetching payroll details:', e);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Lock period
    const lockPeriod = useCallback(async () => {
        if (!batch || !id) return;
        try {
            await payrollBatchesApi.updateStatus(id, 'locked');
            setConfirmLockOpen(false);
            fetchData();
        } catch (e) {
            console.error('Error locking period:', e);
        }
    }, [batch, id, fetchData]);

    // Filter by search
    const filteredRecords = searchTerm.trim()
        ? records.filter(r => {
            const name = r.user?.name?.toLowerCase() || '';
            const code = r.id?.toLowerCase() || '';
            return name.includes(searchTerm.toLowerCase()) || code.includes(searchTerm.toLowerCase());
        })
        : records;

    // Pagination
    const totalItems = filteredRecords.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const paginated = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Totals
    const totalBaseSalary = filteredRecords.reduce((s, r) => s + (r.base_salary || 0), 0);
    const totalOvertime = filteredRecords.reduce((s, r) => s + (r.overtime_pay || 0), 0);
    const totalCommission = filteredRecords.reduce((s, r) => s + (r.commission || 0), 0);
    const totalBonus = filteredRecords.reduce((s, r) => s + (r.bonus || 0), 0);
    const totalAdvances = filteredRecords.reduce((s, r) => s + (r.advances || 0), 0);
    // UI deduction visually excludes advances since it has its own column
    const totalDeduction = filteredRecords.reduce((s, r) => s + ((r.deduction || 0) - (r.advances || 0)), 0);
    const totalGross = filteredRecords.reduce((s, r) => s + (r.net_salary || 0), 0);
    const totalPaidEmp = filteredRecords.reduce((s, r) => s + (r.status === 'paid' ? r.net_salary : 0), 0);
    const totalRemaining = totalGross - totalPaidEmp;

    // Selection
    const toggleSelect = (rid: string) => {
        setSelectedIds(prev => prev.includes(rid) ? prev.filter(i => i !== rid) : [...prev, rid]);
    };
    const selectAll = () => {
        if (selectedIds.length === paginated.length && paginated.length > 0) setSelectedIds([]);
        else setSelectedIds(paginated.map(r => r.id));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!batch) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Không tìm thấy bảng lương</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/salary')}>
                    Quay lại
                </Button>
            </div>
        );
    }

    return (
        <div className="relative flex flex-col h-[calc(100vh-6rem)] bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* ===== TOP BAR ===== */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#f2f6ff] flex-shrink-0">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-blue-100"
                        onClick={() => navigate('/salary')}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="text-[15px] font-bold text-gray-900">Cập nhật bảng tính lương</h1>

                    {/* Search */}
                    <div className="relative ml-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-[45%] h-[14px] w-[14px] text-gray-400" />
                        <Input
                            className="w-[280px] pl-[32px] h-[34px] border-gray-200 text-[13px] placeholder:text-gray-400 bg-white shadow-sm rounded-lg"
                            placeholder="Tìm nhân viên theo mã hoặc tên"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>

                    {/* Dropdown filter */}
                    <Select defaultValue="all">
                        <SelectTrigger className="h-[34px] w-[120px] text-[13px] border-gray-200 bg-white shadow-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-[13px]">Tất cả</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        className="h-[34px] px-3 text-[13px] border-gray-200 bg-white gap-1.5"
                    >
                        <Save className="h-3.5 w-3.5" />
                        Lưu tạm
                    </Button>
                    <Button
                        variant="outline"
                        className="h-[34px] px-3 text-[13px] border-gray-200 bg-white gap-1.5"
                    >
                        <CreditCard className="h-3.5 w-3.5" />
                        Thanh toán
                    </Button>
                    <Button
                        className="h-[34px] px-3 text-[13px] bg-blue-600 hover:bg-blue-700 text-white gap-1.5 rounded-lg"
                        disabled={batch.status === 'locked'}
                    >
                        <Check className="h-3.5 w-3.5" />
                        Chốt lương
                    </Button>
                    {batch.status === 'paid' && (
                        <Button
                            className="h-[34px] px-3 text-[13px] bg-gray-600 hover:bg-gray-700 text-white gap-1.5 rounded-lg"
                            onClick={() => setConfirmLockOpen(true)}
                        >
                            <Lock className="h-3.5 w-3.5" />
                            Khóa kỳ
                        </Button>
                    )}
                    {/* 3-dot dropdown menu */}
                    <MoreActionsMenu onReload={fetchData} />
                </div>
            </div>

            {/* ===== TABLE ===== */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead className="bg-[#f2f6ff] sticky top-0 z-10">
                        <tr>
                            <th className="px-2 py-3 w-8 border-b border-gray-200">
                                {/* delete placeholder */}
                            </th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide text-center w-12">STT</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide min-w-[160px]">TÊN NHÂN VIÊN</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide text-right">LƯƠNG CHÍNH</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide text-right">LÀM THÊM</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide text-right">HOA HỒNG</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-blue-600 border-b border-gray-200 tracking-wide text-center">KPI %</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide text-right">THƯỞNG</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-amber-600 border-b border-gray-200 tracking-wide text-right">ỨNG LƯƠNG</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide text-right">GIẢM TRỪ</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide text-right">TỔNG LƯƠNG</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide text-right">ĐÃ TRẢ NV</th>
                            <th className="px-3 py-3 font-bold text-[11px] text-gray-900 border-b border-gray-200 tracking-wide text-right">CÒN CẦN TRẢ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {/* Summary row */}
                        {filteredRecords.length > 0 && (
                            <tr className="bg-white border-b-2 border-gray-200">
                                <td className="px-2 py-2.5"></td>
                                <td className="px-3 py-2.5"></td>
                                <td className="px-3 py-2.5"></td>
                                <td className="px-3 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalBaseSalary)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalOvertime)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalCommission)}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-[13px] text-gray-900">—</td>
                                <td className="px-3 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalBonus)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-[13px] text-amber-600">{formatCurrency(totalAdvances)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalDeduction)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalGross)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalPaidEmp)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-[13px] text-gray-900">{formatCurrency(totalRemaining)}</td>
                            </tr>
                        )}

                        {paginated.length === 0 ? (
                            <tr>
                                <td colSpan={14} className="px-4 py-12 text-center text-[13px] text-gray-400">
                                    {loading ? 'Đang tải...' : 'Không có phiếu lương'}
                                </td>
                            </tr>
                        ) : (
                            paginated.map((record, idx) => {
                                const stt = (currentPage - 1) * pageSize + idx + 1;
    const gross = record.net_salary || 0;
    const paid = record.status === 'paid' ? record.net_salary : 0;
    const remaining = gross - paid;
                                const empCode = record.user?.employee_code || `NV${String(stt).padStart(6, '0')}`;

                                return (
                                    <tr key={record.id} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="px-2 py-[10px]">
                                            <button className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                        <td className="px-3 py-[10px] text-center text-[13px] text-gray-500">{stt}</td>
                                        <td className="px-3 py-[10px]">
                                            <div>
                                                <button
                                                    onClick={() => {
                                                        setSelectedPaysheetRecord({ record, plCode: batch.code });
                                                        setIsPaysheetDialogOpen(true);
                                                    }}
                                                    className="text-[13px] font-semibold text-blue-600 uppercase hover:text-blue-800 hover:underline transition-colors text-left"
                                                >
                                                    {record.user?.name || 'N/A'}
                                                </button>
                                                <p className="text-[11px] text-gray-400">{empCode}</p>
                                            </div>
                                        </td>
                                        <td className="px-3 py-[10px]">
                                            <div 
                                                className="cursor-pointer group relative"
                                                onClick={() => setEditRecord(record)}
                                            >
                                                <Input
                                                    type="text"
                                                    value={formatCurrency(record.base_salary || 0).replace(' ₫', '')}
                                                    className="h-[30px] text-[13px] text-right border-gray-200 bg-white w-[110px] px-2 cursor-pointer group-hover:bg-gray-50 transition-colors pointer-events-none"
                                                    readOnly
                                                />
                                            </div>
                                        </td>
                                        <td className="px-3 py-[10px]">
                                            <Input
                                                type="text"
                                                defaultValue={formatCurrency(record.overtime_pay || 0).replace(' ₫', '')}
                                                className="h-[30px] text-[13px] text-right border-gray-200 bg-white w-[90px] px-2"
                                                readOnly
                                            />
                                        </td>
                                        <td className="px-3 py-[10px]">
                                            <div 
                                                className="cursor-pointer group relative"
                                                onClick={() => setCommissionRecord(record)}
                                            >
                                                <Input
                                                    type="text"
                                                    value={formatCurrency(record.commission || 0).replace(' ₫', '')}
                                                    className="h-[30px] text-[13px] text-right border-gray-200 bg-white w-[90px] px-2 cursor-pointer group-hover:bg-gray-50 transition-colors pointer-events-none"
                                                    readOnly
                                                />
                                            </div>
                                        </td>
                                        <td className="px-3 py-[10px] text-center">
                                            <span className={`text-[12px] font-bold ${
                                                (record.kpi_achievement || 0) >= 100 ? 'text-green-600' :
                                                (record.kpi_achievement || 0) >= 80 ? 'text-blue-600' :
                                                (record.kpi_achievement || 0) >= 50 ? 'text-amber-600' : 'text-gray-400'
                                            }`}>
                                                {record.kpi_achievement ? `${record.kpi_achievement}%` : '—'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-[10px]">
                                            <div 
                                                className="cursor-pointer group relative"
                                                onClick={() => setBonusRecord(record)}
                                            >
                                                <Input
                                                    type="text"
                                                    value={formatCurrency(record.bonus || 0).replace(' ₫', '')}
                                                    className="h-[30px] text-[13px] text-right border-gray-200 bg-white w-[80px] px-2 cursor-pointer group-hover:bg-gray-50 transition-colors pointer-events-none"
                                                    readOnly
                                                />
                                            </div>
                                        </td>
                                        <td className="px-3 py-[10px]">
                                            <Input
                                                type="text"
                                                defaultValue={formatCurrency(record.advances || 0).replace(' ₫', '')}
                                                className="h-[30px] text-[13px] text-right border-amber-200 bg-amber-50 w-[90px] px-2 text-amber-700"
                                                readOnly
                                            />
                                        </td>
                                        <td className="px-3 py-[10px]">
                                            <div 
                                                className="cursor-pointer group relative"
                                                onClick={() => setDeductionRecord(record)}
                                            >
                                                <Input
                                                    type="text"
                                                    value={formatCurrency((record.deduction || 0) - (record.advances || 0)).replace(' ₫', '')}
                                                    className="h-[30px] text-[13px] text-right border-gray-200 bg-white w-[90px] px-2 cursor-pointer group-hover:bg-gray-50 transition-colors pointer-events-none"
                                                    readOnly
                                                />
                                            </div>
                                        </td>
                                        <td className="px-3 py-[10px] text-right text-[13px] font-semibold text-gray-800">
                                            {formatCurrency(gross)}
                                        </td>
                                        <td className="px-3 py-[10px] text-right text-[13px] font-medium text-gray-700">
                                            {formatCurrency(paid)}
                                        </td>
                                        <td className="px-3 py-[10px] text-right text-[13px] font-semibold text-blue-600">
                                            {formatCurrency(remaining)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ===== PAGINATION ===== */}
            {totalItems > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-200 bg-[#fbfcfd] flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
                        <ChevronsLeft className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                        <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={currentPage}
                        onChange={(e) => {
                            const val = Number(e.target.value);
                            if (val >= 1 && val <= totalPages) setCurrentPage(val);
                        }}
                        className="w-[36px] h-[28px] text-center text-[12px] border-gray-200 bg-white px-1"
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                        <ChevronRight className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
                        <ChevronsRight className="h-3 w-3" />
                    </Button>
                    <span className="text-[12px] text-gray-500 ml-1">
                        Hiển thị {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalItems)} Tổng {totalItems} Phiếu lương
                    </span>
                </div>
            )}

            {/* ===== FLOATING BLUE CIRCLE BUTTON (opens drawer) ===== */}
            {!drawerOpen && (
                <button
                    className="fixed right-4 top-1/2 -translate-y-1/2 z-30 w-[36px] h-[36px] bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                    onClick={() => setDrawerOpen(true)}
                    title="Xem thông tin bảng lương"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
            )}

            {/* ===== RIGHT SIDE DRAWER ===== */}
            <PayrollInfoDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                batch={batch}
            />

            <Dialog open={confirmLockOpen} onOpenChange={setConfirmLockOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[17px] font-bold text-gray-900">Khóa kỳ lương?</DialogTitle>
                    </DialogHeader>
                    <div className="text-[13px] text-gray-600">
                        Sau khi khóa, hệ thống không thể chỉnh sửa chấm công, ứng lương hoặc vi phạm trong kỳ này.
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmLockOpen(false)} className="text-[13px]">
                            Hủy
                        </Button>
                        <Button onClick={lockPeriod} className="bg-gray-700 hover:bg-gray-800 text-white text-[13px]">
                            Khóa kỳ
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <UpdateBaseSalaryDialog
                open={!!editRecord}
                onClose={() => setEditRecord(null)}
                record={editRecord}
                onSuccess={() => {
                    fetchData(); // Reload table data after update
                }}
            />

            {/* ===== COMMISSION DETAIL DIALOG ===== */}
            <BusinessCommissionDetailDialog
                open={!!commissionRecord}
                onClose={() => setCommissionRecord(null)}
                record={commissionRecord}
            />

            {/* ===== BONUS DETAIL DIALOG ===== */}
            <BonusDetailDialog
                open={!!bonusRecord}
                onClose={() => setBonusRecord(null)}
                record={bonusRecord}
            />

            <DeductionDetailDialog
                open={!!deductionRecord}
                onClose={() => setDeductionRecord(null)}
                record={deductionRecord}
            />

            {/* ===== PERSONAL PAYSHEET DIALOG ===== */}
            {selectedPaysheetRecord && (
                <PersonalPaysheetDialog
                    open={isPaysheetDialogOpen}
                    onOpenChange={setIsPaysheetDialogOpen}
                    record={selectedPaysheetRecord.record}
                    plCode={selectedPaysheetRecord.plCode}
                    onReload={fetchData}
                />
            )}
        </div>
    );
}
