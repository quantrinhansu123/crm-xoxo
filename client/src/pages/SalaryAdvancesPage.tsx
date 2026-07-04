import { useState, useEffect, useMemo } from 'react';
import {
    Plus, Search, ChevronLeft, ChevronRight, Check, X,
    Loader2, DollarSign, Clock, CheckCircle, ArrowDownCircle,
    AlertTriangle, MoreHorizontal, Trash2, Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSalaryAdvances, type SalaryAdvance } from '@/hooks/useSalaryAdvances';
import { useUsers } from '@/hooks/useUsers';
import { cn } from '@/lib/utils';

// ─── Status Config ──────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    pending: { label: 'Chờ duyệt', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: <Clock className="h-3.5 w-3.5" /> },
    approved: { label: 'Đã duyệt', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    rejected: { label: 'Từ chối', color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: <X className="h-3.5 w-3.5" /> },
    deducted: { label: 'Đã trừ lương', color: 'text-green-600', bg: 'bg-green-50 border-green-200', icon: <ArrowDownCircle className="h-3.5 w-3.5" /> },
};

// ─── Format helpers ─────────────────────────────────────────────
function fmtMoney(n: number): string {
    return n.toLocaleString('vi-VN') + 'đ';
}

function fmtDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ════════════════════════════════════════════════════════════════
// ─── Main Component ────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
export function SalaryAdvancesPage() {
    const { user } = useAuth();
    const { advances, summary, loading, fetchAdvances, createAdvance, approveAdvance, rejectAdvance, deleteAdvance } = useSalaryAdvances();
    const { users, fetchUsers } = useUsers();

    // Period
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Dialog
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const [selectedAdvance, setSelectedAdvance] = useState<SalaryAdvance | null>(null);

    // Form state
    const [formUserId, setFormUserId] = useState('');
    const [formAmount, setFormAmount] = useState('');
    const [formReason, setFormReason] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const isAdmin = user?.role === 'admin' || user?.role === 'manager';

    useEffect(() => {
        fetchAdvances({ month, year });
        fetchUsers();
    }, [month, year, fetchAdvances, fetchUsers]);

    // Navigation
    const goToPrevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const goToNextMonth = () => {
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    // Filtered list
    const filteredAdvances = useMemo(() => {
        let list = advances;
        if (statusFilter !== 'all') {
            list = list.filter(a => a.status === statusFilter);
        }
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            list = list.filter(a => a.user?.name?.toLowerCase().includes(q) || a.user?.employee_code?.toLowerCase().includes(q));
        }
        return list;
    }, [advances, statusFilter, searchTerm]);

    // Active employees only
    const activeUsers = useMemo(() =>
        users.filter(u => u.status === 'active' && u.role !== 'admin'),
        [users]
    );

    // ── Handlers ─────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!formUserId || !formAmount) {
            toast.error('Vui lòng điền đầy đủ thông tin');
            return;
        }
        setSubmitting(true);
        try {
            await createAdvance({
                user_id: formUserId,
                amount: Number(formAmount),
                month,
                year,
                reason: formReason,
                notes: formNotes,
            });
            toast.success('Đã tạo yêu cầu ứng lương');
            setShowCreateDialog(false);
            resetForm();
            fetchAdvances({ month, year });
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi tạo yêu cầu');
        } finally {
            setSubmitting(false);
        }
    };

    const handleApprove = async (id: string) => {
        try {
            await approveAdvance(id);
            toast.success('Đã duyệt ứng lương');
            fetchAdvances({ month, year });
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi duyệt');
        }
    };

    const handleReject = async () => {
        if (!selectedAdvance) return;
        try {
            await rejectAdvance(selectedAdvance.id, rejectionReason);
            toast.success('Đã từ chối ứng lương');
            setShowRejectDialog(false);
            setSelectedAdvance(null);
            setRejectionReason('');
            fetchAdvances({ month, year });
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi từ chối');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Xóa yêu cầu ứng lương này?')) return;
        try {
            await deleteAdvance(id);
            toast.success('Đã xóa yêu cầu');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi xóa');
        }
    };

    const resetForm = () => {
        setFormUserId('');
        setFormAmount('');
        setFormReason('');
        setFormNotes('');
    };

    if (loading && advances.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* ── Header ────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#fbfcfd] gap-3">
                <div className="flex items-center gap-4 flex-wrap">
                    <h1 className="text-[15px] font-bold text-gray-900 whitespace-nowrap">Ứng lương</h1>

                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-gray-400" />
                        <Input
                            className="pl-8 h-[34px] w-[200px] border-gray-200 text-[13px] placeholder:text-gray-400 bg-white rounded-lg shadow-sm focus-visible:ring-1 focus-visible:ring-orange-500"
                            placeholder="Tìm nhân viên..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Period navigation */}
                    <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={goToPrevMonth}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-[13px] font-medium text-gray-700 whitespace-nowrap select-none min-w-[100px] text-center">
                            Tháng {month}/{year}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={goToNextMonth}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Status filter */}
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-[34px] w-[140px] text-[13px] border-gray-200 bg-white shadow-sm rounded-lg">
                            <div className="flex items-center gap-1.5">
                                <Filter className="h-3.5 w-3.5 text-gray-400" />
                                <SelectValue placeholder="Trạng thái" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tất cả</SelectItem>
                            <SelectItem value="pending">Chờ duyệt</SelectItem>
                            <SelectItem value="approved">Đã duyệt</SelectItem>
                            <SelectItem value="rejected">Từ chối</SelectItem>
                            <SelectItem value="deducted">Đã trừ lương</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button
                    onClick={() => { resetForm(); setShowCreateDialog(true); }}
                    className="h-[34px] px-4 text-[12px] font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg shadow-sm gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Tạo yêu cầu
                </Button>
            </div>

            {/* ── Summary Cards ─────────────────────────────────── */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4 bg-[#fbfcfd] border-b border-gray-100">
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tổng ứng lương</p>
                        <p className="text-[20px] font-bold text-gray-900 mt-1">{fmtMoney(summary.total)}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{summary.count} yêu cầu</p>
                    </div>
                    <div className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm">
                        <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider">Chờ duyệt</p>
                        <p className="text-[20px] font-bold text-amber-600 mt-1">{fmtMoney(summary.pending)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
                        <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">Đã duyệt</p>
                        <p className="text-[20px] font-bold text-blue-600 mt-1">{fmtMoney(summary.approved)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm">
                        <p className="text-[11px] font-semibold text-green-500 uppercase tracking-wider">Đã trừ lương</p>
                        <p className="text-[20px] font-bold text-green-600 mt-1">{fmtMoney(summary.deducted)}</p>
                    </div>
                </div>
            )}

            {/* ── Table ─────────────────────────────────────────── */}
            <div className="overflow-auto">
                <table className="w-full border-collapse text-left min-w-[900px]">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-[#f7f8fa]">
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[220px]">Nhân viên</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-right w-[150px]">Số tiền</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[200px]">Lý do</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-center w-[120px]">Trạng thái</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[140px]">Ngày tạo</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[140px]">Người duyệt</th>
                            {isAdmin && (
                                <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-center w-[100px]">Thao tác</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAdvances.map(advance => {
                            const statusCfg = STATUS_CONFIG[advance.status] || STATUS_CONFIG.pending;
                            return (
                                <tr key={advance.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                    <td className="px-4 py-3">
                                        <p className="text-[13px] font-bold text-gray-800">{advance.user?.name || '---'}</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">{advance.user?.employee_code || advance.user?.email || '---'}</p>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className="text-[14px] font-bold text-orange-600">{fmtMoney(advance.amount)}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-[12px] text-gray-600 line-clamp-2">{advance.reason || '---'}</p>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={cn(
                                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
                                            statusCfg.bg, statusCfg.color
                                        )}>
                                            {statusCfg.icon}
                                            {statusCfg.label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-[12px] text-gray-500">{fmtDate(advance.created_at)}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-[12px] text-gray-500">
                                            {advance.approver?.name || (advance.approved_at ? 'Đã duyệt' : '---')}
                                        </p>
                                        {advance.approved_at && (
                                            <p className="text-[10px] text-gray-400">{fmtDateTime(advance.approved_at)}</p>
                                        )}
                                    </td>
                                    {isAdmin && (
                                        <td className="px-4 py-3 text-center">
                                            {advance.status === 'pending' ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-green-600 hover:bg-green-50"
                                                        onClick={() => handleApprove(advance.id)}
                                                        title="Duyệt"
                                                    >
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-red-500 hover:bg-red-50"
                                                        onClick={() => { setSelectedAdvance(advance); setShowRejectDialog(true); }}
                                                        title="Từ chối"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-gray-400 hover:bg-gray-100"
                                                        onClick={() => handleDelete(advance.id)}
                                                        title="Xóa"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleDelete(advance.id)} className="text-red-600">
                                                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Xóa
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}

                        {filteredAdvances.length === 0 && (
                            <tr>
                                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-16 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                                            <DollarSign className="h-6 w-6 text-gray-400" />
                                        </div>
                                        <p className="text-[13px] text-gray-400">
                                            {searchTerm || statusFilter !== 'all' ? 'Không tìm thấy kết quả' : 'Chưa có yêu cầu ứng lương trong tháng này'}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Create Dialog ──────────────────────────────────── */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="text-[16px] font-bold">Tạo yêu cầu ứng lương</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div>
                            <Label className="text-[12px] font-semibold text-gray-600 uppercase">Nhân viên *</Label>
                            <Select value={formUserId} onValueChange={setFormUserId}>
                                <SelectTrigger className="mt-1.5 h-[38px]">
                                    <SelectValue placeholder="Chọn nhân viên..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {activeUsers.map(u => (
                                        <SelectItem key={u.id} value={u.id}>
                                            {u.name} ({u.employee_code || u.role})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="text-[12px] font-semibold text-gray-600 uppercase">Số tiền *</Label>
                            <Input
                                className="mt-1.5 h-[38px]"
                                type="number"
                                placeholder="VD: 5000000"
                                value={formAmount}
                                onChange={e => setFormAmount(e.target.value)}
                            />
                            {formAmount && (
                                <p className="text-[11px] text-gray-400 mt-1">{fmtMoney(Number(formAmount))}</p>
                            )}
                        </div>

                        <div>
                            <Label className="text-[12px] font-semibold text-gray-600 uppercase">Kỳ ứng lương</Label>
                            <p className="text-[13px] font-medium text-gray-700 mt-1">Tháng {month}/{year}</p>
                        </div>

                        <div>
                            <Label className="text-[12px] font-semibold text-gray-600 uppercase">Lý do</Label>
                            <Textarea
                                className="mt-1.5 min-h-[80px] text-[13px]"
                                placeholder="Nhập lý do ứng lương..."
                                value={formReason}
                                onChange={e => setFormReason(e.target.value)}
                            />
                        </div>

                        <div>
                            <Label className="text-[12px] font-semibold text-gray-600 uppercase">Ghi chú</Label>
                            <Textarea
                                className="mt-1.5 min-h-[60px] text-[13px]"
                                placeholder="Ghi chú thêm (tùy chọn)..."
                                value={formNotes}
                                onChange={e => setFormNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" className="h-[36px] text-[13px]">Hủy</Button>
                        </DialogClose>
                        <Button
                            onClick={handleCreate}
                            disabled={submitting || !formUserId || !formAmount}
                            className="h-[36px] text-[13px] bg-orange-500 hover:bg-orange-600 text-white"
                        >
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                            Tạo yêu cầu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Reject Dialog ──────────────────────────────────── */}
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-[16px] font-bold text-red-600 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Từ chối ứng lương
                        </DialogTitle>
                    </DialogHeader>

                    {selectedAdvance && (
                        <div className="py-2 space-y-3">
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-[12px] text-gray-500">Nhân viên</p>
                                <p className="text-[13px] font-bold text-gray-800">{selectedAdvance.user?.name}</p>
                                <p className="text-[12px] text-gray-500 mt-1">Số tiền</p>
                                <p className="text-[14px] font-bold text-orange-600">{fmtMoney(selectedAdvance.amount)}</p>
                            </div>

                            <div>
                                <Label className="text-[12px] font-semibold text-gray-600 uppercase">Lý do từ chối</Label>
                                <Textarea
                                    className="mt-1.5 min-h-[80px] text-[13px]"
                                    placeholder="Nhập lý do từ chối..."
                                    value={rejectionReason}
                                    onChange={e => setRejectionReason(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" className="h-[36px] text-[13px]">Hủy</Button>
                        </DialogClose>
                        <Button
                            onClick={handleReject}
                            className="h-[36px] text-[13px] bg-red-500 hover:bg-red-600 text-white"
                        >
                            Từ chối
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
