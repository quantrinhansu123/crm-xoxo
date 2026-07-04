import { useState, useEffect, useMemo } from 'react';
import {
    Plus, Search, ChevronLeft, ChevronRight, Filter,
    Loader2, AlertTriangle, Award, Trash2, Edit, MoreHorizontal,
    TrendingDown, TrendingUp, Scale
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
import { useViolations, VIOLATION_CATEGORIES, REWARD_CATEGORIES, type ViolationReward } from '@/hooks/useViolations';
import { useUsers } from '@/hooks/useUsers';
import { cn } from '@/lib/utils';

// ─── Helpers ────────────────────────────────────────────────────
function fmtMoney(n: number): string {
    return n.toLocaleString('vi-VN') + 'đ';
}

function fmtDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getCategoryLabel(type: string, category: string): string {
    const list = type === 'violation' ? VIOLATION_CATEGORIES : REWARD_CATEGORIES;
    return list.find(c => c.value === category)?.label || category;
}

// ════════════════════════════════════════════════════════════════
// ─── Main Component ────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
export function ViolationsPage() {
    const { user } = useAuth();
    const { records, summary, loading, fetchRecords, createRecord, updateRecord, deleteRecord } = useViolations();
    const { users, fetchUsers } = useUsers();

    // Period
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');

    // Dialog
    const [showFormDialog, setShowFormDialog] = useState(false);
    const [editingRecord, setEditingRecord] = useState<ViolationReward | null>(null);

    // Form
    const [formUserId, setFormUserId] = useState('');
    const [formType, setFormType] = useState<'violation' | 'reward'>('violation');
    const [formCategory, setFormCategory] = useState('');
    const [formAmount, setFormAmount] = useState('');
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formDescription, setFormDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchRecords({ month, year });
        fetchUsers();
    }, [month, year, fetchRecords, fetchUsers]);

    // Navigation
    const goToPrev = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const goToNext = () => {
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    // Filtered
    const filteredRecords = useMemo(() => {
        let list = records;
        if (typeFilter !== 'all') list = list.filter(r => r.type === typeFilter);
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            list = list.filter(r => r.user?.name?.toLowerCase().includes(q) || r.user?.employee_code?.toLowerCase().includes(q));
        }
        return list;
    }, [records, typeFilter, searchTerm]);

    const activeUsers = useMemo(() =>
        users.filter(u => u.status === 'active' && u.role !== 'admin'),
        [users]
    );

    // Categories based on form type
    const categories = formType === 'violation' ? VIOLATION_CATEGORIES : REWARD_CATEGORIES;

    // ── Handlers ─────────────────────────────────────────────────
    const openCreate = (type: 'violation' | 'reward') => {
        setEditingRecord(null);
        setFormType(type);
        setFormUserId('');
        setFormCategory('');
        setFormAmount('');
        setFormDate(new Date().toISOString().split('T')[0]);
        setFormDescription('');
        setShowFormDialog(true);
    };

    const openEdit = (record: ViolationReward) => {
        setEditingRecord(record);
        setFormType(record.type);
        setFormUserId(record.user_id);
        setFormCategory(record.category);
        setFormAmount(String(record.amount));
        setFormDate(record.date);
        setFormDescription(record.description || '');
        setShowFormDialog(true);
    };

    const handleSave = async () => {
        if (!editingRecord && (!formUserId || !formCategory)) {
            toast.error('Vui lòng điền đầy đủ thông tin');
            return;
        }
        setSubmitting(true);
        try {
            if (editingRecord) {
                await updateRecord(editingRecord.id, {
                    type: formType,
                    category: formCategory,
                    amount: Number(formAmount) || 0,
                    date: formDate,
                    description: formDescription,
                });
                toast.success('Đã cập nhật');
            } else {
                await createRecord({
                    user_id: formUserId,
                    type: formType,
                    category: formCategory,
                    amount: Number(formAmount) || 0,
                    date: formDate,
                    month,
                    year,
                    description: formDescription,
                });
                toast.success(formType === 'violation' ? 'Đã ghi nhận vi phạm' : 'Đã ghi nhận thưởng');
            }
            setShowFormDialog(false);
            fetchRecords({ month, year });
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi lưu');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Xóa bản ghi này?')) return;
        try {
            await deleteRecord(id);
            toast.success('Đã xóa');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi xóa');
        }
    };

    if (loading && records.length === 0) {
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
                    <h1 className="text-[15px] font-bold text-gray-900 whitespace-nowrap">Vi phạm / Thưởng</h1>

                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-gray-400" />
                        <Input
                            className="pl-8 h-[34px] w-[200px] border-gray-200 text-[13px] placeholder:text-gray-400 bg-white rounded-lg shadow-sm focus-visible:ring-1 focus-visible:ring-orange-500"
                            placeholder="Tìm nhân viên..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Period */}
                    <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={goToPrev}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-[13px] font-medium text-gray-700 whitespace-nowrap select-none min-w-[100px] text-center">
                            Tháng {month}/{year}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={goToNext}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Type filter */}
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="h-[34px] w-[140px] text-[13px] border-gray-200 bg-white shadow-sm rounded-lg">
                            <div className="flex items-center gap-1.5">
                                <Filter className="h-3.5 w-3.5 text-gray-400" />
                                <SelectValue />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tất cả</SelectItem>
                            <SelectItem value="violation">Vi phạm</SelectItem>
                            <SelectItem value="reward">Thưởng</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => openCreate('violation')}
                        variant="outline"
                        className="h-[34px] px-3 text-[12px] font-medium border-red-200 text-red-600 hover:bg-red-50 rounded-lg gap-1.5"
                    >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Ghi vi phạm
                    </Button>
                    <Button
                        onClick={() => openCreate('reward')}
                        className="h-[34px] px-3 text-[12px] font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg shadow-sm gap-1.5"
                    >
                        <Award className="h-3.5 w-3.5" />
                        Ghi thưởng
                    </Button>
                </div>
            </div>

            {/* ── Summary Cards ─────────────────────────────────── */}
            {summary && (
                <div className="grid grid-cols-3 gap-4 px-6 py-4 bg-[#fbfcfd] border-b border-gray-100">
                    <div className="bg-white rounded-xl border border-red-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-red-400" />
                            <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider">Vi phạm</p>
                        </div>
                        <p className="text-[20px] font-bold text-red-600 mt-1">-{fmtMoney(summary.totalViolations)}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{summary.violationCount} bản ghi</p>
                    </div>
                    <div className="bg-white rounded-xl border border-green-100 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-green-400" />
                            <p className="text-[11px] font-semibold text-green-500 uppercase tracking-wider">Thưởng</p>
                        </div>
                        <p className="text-[20px] font-bold text-green-600 mt-1">+{fmtMoney(summary.totalRewards)}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{summary.rewardCount} bản ghi</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                            <Scale className="h-4 w-4 text-gray-400" />
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Chênh lệch</p>
                        </div>
                        <p className={cn(
                            "text-[20px] font-bold mt-1",
                            summary.net >= 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                            {summary.net >= 0 ? '+' : ''}{fmtMoney(summary.net)}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Table ─────────────────────────────────────────── */}
            <div className="overflow-auto">
                <table className="w-full border-collapse text-left min-w-[900px]">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-[#f7f8fa]">
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[60px] text-center">Loại</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[200px]">Nhân viên</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[130px]">Phân loại</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-right w-[130px]">Số tiền</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[100px]">Ngày</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200">Mô tả</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 w-[120px]">Người tạo</th>
                            <th className="px-4 py-3 text-[12px] font-bold text-gray-600 border-b border-gray-200 text-center w-[80px]"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRecords.map(record => (
                            <tr key={record.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 text-center">
                                    {record.type === 'violation' ? (
                                        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-red-50">
                                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-green-50">
                                            <Award className="h-3.5 w-3.5 text-green-500" />
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-[13px] font-bold text-gray-800">{record.user?.name || '---'}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{record.user?.employee_code || '---'}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={cn(
                                        "inline-flex px-2 py-0.5 rounded text-[11px] font-medium",
                                        record.type === 'violation' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                                    )}>
                                        {getCategoryLabel(record.type, record.category)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <span className={cn(
                                        "text-[14px] font-bold",
                                        record.type === 'violation' ? 'text-red-600' : 'text-green-600'
                                    )}>
                                        {record.type === 'violation' ? '-' : '+'}{fmtMoney(record.amount)}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-[12px] text-gray-500">{fmtDate(record.date)}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-[12px] text-gray-600 line-clamp-2">{record.description || '---'}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-[12px] text-gray-500">{record.creator?.name || '---'}</p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEdit(record)}>
                                                <Edit className="h-3.5 w-3.5 mr-2" /> Sửa
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleDelete(record.id)} className="text-red-600">
                                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Xóa
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </td>
                            </tr>
                        ))}

                        {filteredRecords.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-4 py-16 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                                            <Scale className="h-6 w-6 text-gray-400" />
                                        </div>
                                        <p className="text-[13px] text-gray-400">Chưa có bản ghi vi phạm/thưởng trong tháng này</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Create/Edit Dialog ─────────────────────────────── */}
            <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className={cn(
                            "text-[16px] font-bold flex items-center gap-2",
                            formType === 'violation' ? 'text-red-600' : 'text-green-600'
                        )}>
                            {formType === 'violation' ? <AlertTriangle className="h-5 w-5" /> : <Award className="h-5 w-5" />}
                            {editingRecord ? 'Sửa bản ghi' : formType === 'violation' ? 'Ghi nhận vi phạm' : 'Ghi nhận thưởng'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Type toggle */}
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant={formType === 'violation' ? 'default' : 'outline'}
                                className={cn("flex-1 h-[36px] text-[12px]", formType === 'violation' && 'bg-red-500 hover:bg-red-600')}
                                onClick={() => { setFormType('violation'); setFormCategory(''); }}
                            >
                                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Vi phạm
                            </Button>
                            <Button
                                type="button"
                                variant={formType === 'reward' ? 'default' : 'outline'}
                                className={cn("flex-1 h-[36px] text-[12px]", formType === 'reward' && 'bg-green-500 hover:bg-green-600')}
                                onClick={() => { setFormType('reward'); setFormCategory(''); }}
                            >
                                <Award className="h-3.5 w-3.5 mr-1.5" /> Thưởng
                            </Button>
                        </div>

                        {/* Employee */}
                        {!editingRecord && (
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
                        )}

                        {/* Category */}
                        <div>
                            <Label className="text-[12px] font-semibold text-gray-600 uppercase">Phân loại *</Label>
                            <Select value={formCategory} onValueChange={setFormCategory}>
                                <SelectTrigger className="mt-1.5 h-[38px]">
                                    <SelectValue placeholder="Chọn phân loại..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map(c => (
                                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Amount */}
                        <div>
                            <Label className="text-[12px] font-semibold text-gray-600 uppercase">Số tiền</Label>
                            <Input
                                className="mt-1.5 h-[38px]"
                                type="number"
                                placeholder="VD: 200000"
                                value={formAmount}
                                onChange={e => setFormAmount(e.target.value)}
                            />
                            {formAmount && (
                                <p className={cn(
                                    "text-[11px] mt-1",
                                    formType === 'violation' ? 'text-red-500' : 'text-green-500'
                                )}>
                                    {formType === 'violation' ? '-' : '+'}{fmtMoney(Number(formAmount))}
                                </p>
                            )}
                        </div>

                        {/* Date */}
                        <div>
                            <Label className="text-[12px] font-semibold text-gray-600 uppercase">Ngày</Label>
                            <Input
                                className="mt-1.5 h-[38px]"
                                type="date"
                                value={formDate}
                                onChange={e => setFormDate(e.target.value)}
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <Label className="text-[12px] font-semibold text-gray-600 uppercase">Mô tả</Label>
                            <Textarea
                                className="mt-1.5 min-h-[80px] text-[13px]"
                                placeholder="Nhập mô tả chi tiết..."
                                value={formDescription}
                                onChange={e => setFormDescription(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" className="h-[36px] text-[13px]">Hủy</Button>
                        </DialogClose>
                        <Button
                            onClick={handleSave}
                            disabled={submitting || (!editingRecord && (!formUserId || !formCategory))}
                            className={cn(
                                "h-[36px] text-[13px] text-white",
                                formType === 'violation' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                            )}
                        >
                            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                            {editingRecord ? 'Cập nhật' : 'Ghi nhận'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
