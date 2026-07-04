import { useState, useEffect, useCallback } from 'react';
import { Calendar, Lock, Unlock, RefreshCw, Send, Loader2, Eye, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useKPI, type KPIMonthlyRecord } from '@/hooks/useKPI';
import { KPIMonthlyDetail } from './KPIMonthlyDetail';
import { formatCurrency } from '@/lib/utils';
import { api } from '@/lib/api';

interface KpiAssignment {
    policy_id: string;
    assignment_type: 'primary' | 'secondary';
    compensation_bucket: string;
}

const statusLabels: Record<string, string> = {
    draft: 'Nháp',
    pending: 'Chờ duyệt',
    locked: 'Đã khóa',
};

const statusColors: Record<string, string> = {
    draft: 'secondary',
    pending: 'warning',
    locked: 'success',
};

const rankColors: Record<string, string> = {
    'A+': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'A': 'bg-blue-100 text-blue-800 border-blue-300',
    'B': 'bg-amber-100 text-amber-800 border-amber-300',
    'C': 'bg-orange-100 text-orange-800 border-orange-300',
    'D': 'bg-red-100 text-red-800 border-red-300',
};

function getMonthOptions() {
    const options = [];
    const now = new Date();
    for (let i = 2; i >= -6; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
        options.push({ key, label });
    }
    return options;
}

export function KPIMonthlyTab() {
    const {
        monthlyRecords, monthlySummary, fetchMonthly,
        generateMonthly, recalculateMonthly, lockMonthly,
        batchLock, pushToPayroll, batchPush,
        loading
    } = useKPI();

    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [monthKey, setMonthKey] = useState(defaultMonth);
    const [statusFilter, setStatusFilter] = useState('all');
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [assignments, setAssignments] = useState<Map<string, KpiAssignment>>(new Map());

    const monthOptions = getMonthOptions();

    // Fetch employee KPI assignments for primary/secondary distinction
    const fetchAssignments = useCallback(async () => {
        try {
            const { data } = await api.get('/kpi/employee-assignments');
            const assignmentMap = new Map<string, KpiAssignment>();
            (data.employees || []).forEach((emp: any) => {
                (emp.assignments || []).forEach((a: any) => {
                    assignmentMap.set(`${emp.id}-${a.policy_id}`, {
                        policy_id: a.policy_id,
                        assignment_type: a.assignment_type,
                        compensation_bucket: a.compensation_bucket,
                    });
                });
            });
            setAssignments(assignmentMap);
        } catch (error) {
            console.error('Failed to fetch KPI assignments:', error);
        }
    }, []);

    useEffect(() => {
        fetchMonthly({ month_key: monthKey, status: statusFilter !== 'all' ? statusFilter : undefined });
        fetchAssignments();
    }, [fetchMonthly, monthKey, statusFilter, fetchAssignments]);

    const reload = () => fetchMonthly({ month_key: monthKey, status: statusFilter !== 'all' ? statusFilter : undefined });

    const handleGenerate = async () => {
        setActionLoading('generate');
        try {
            await generateMonthly(monthKey);
            reload();
        } finally {
            setActionLoading(null);
        }
    };

    const handleBatchLock = async () => {
        if (!confirm('Khóa tất cả KPI chưa khóa trong tháng này?')) return;
        setActionLoading('batch-lock');
        try {
            await batchLock(monthKey);
            reload();
        } finally {
            setActionLoading(null);
        }
    };

    const handleBatchPush = async () => {
        if (!confirm('Đẩy tất cả KPI đã khóa sang bảng lương?')) return;
        setActionLoading('batch-push');
        try {
            await batchPush(monthKey);
            reload();
        } finally {
            setActionLoading(null);
        }
    };

    const handleRecalculate = async (id: string) => {
        setActionLoading(id);
        try {
            await recalculateMonthly(id);
            reload();
        } finally {
            setActionLoading(null);
        }
    };

    const handleLock = async (id: string) => {
        setActionLoading(id);
        try {
            await lockMonthly(id);
            reload();
        } finally {
            setActionLoading(null);
        }
    };

    const handlePush = async (id: string) => {
        setActionLoading(id);
        try {
            await pushToPayroll(id);
        } finally {
            setActionLoading(null);
        }
    };

    if (viewingId) {
        return (
            <KPIMonthlyDetail
                id={viewingId}
                onBack={() => { setViewingId(null); reload(); }}
            />
        );
    }

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Select value={monthKey} onValueChange={setMonthKey}>
                        <SelectTrigger className="w-48">
                            <Calendar className="h-4 w-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {monthOptions.map(o => (
                                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tất cả</SelectItem>
                            <SelectItem value="draft">Nháp</SelectItem>
                            <SelectItem value="pending">Chờ duyệt</SelectItem>
                            <SelectItem value="locked">Đã khóa</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleGenerate} disabled={!!actionLoading}>
                        {actionLoading === 'generate' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                        Tạo kỳ KPI
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" disabled={!!actionLoading}>
                                Thao tác <ChevronDown className="h-4 w-4 ml-1" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={handleBatchLock}>
                                <Lock className="h-4 w-4 mr-2" />
                                Khóa tất cả
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleBatchPush}>
                                <Send className="h-4 w-4 mr-2" />
                                Đẩy sang lương (tất cả)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Summary cards */}
            {monthlySummary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Card>
                        <CardContent className="p-3 text-center">
                            <p className="text-xs text-muted-foreground">Tổng</p>
                            <p className="text-xl font-bold">{monthlySummary.total}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-3 text-center">
                            <p className="text-xs text-muted-foreground">Nháp</p>
                            <p className="text-xl font-bold text-gray-600">{monthlySummary.draft}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-3 text-center">
                            <p className="text-xs text-muted-foreground">Chờ duyệt</p>
                            <p className="text-xl font-bold text-amber-600">{monthlySummary.pending}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-3 text-center">
                            <p className="text-xs text-muted-foreground">Đã khóa</p>
                            <p className="text-xl font-bold text-emerald-600">{monthlySummary.locked}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-3 text-center">
                            <p className="text-xs text-muted-foreground">Điểm TB</p>
                            <p className="text-xl font-bold text-blue-600">{monthlySummary.avg_score}</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50 border-b">
                                <tr>
                                    <th className="p-3 text-left text-sm font-medium text-muted-foreground">Nhân sự</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Role</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Điểm</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Xếp loại</th>
                                    <th className="p-3 text-right text-sm font-medium text-muted-foreground">Thưởng</th>
                                    <th className="p-3 text-right text-sm font-medium text-muted-foreground">Phạt</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">HH (%)</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Trạng thái</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && monthlyRecords.length === 0 ? (
                                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Đang tải...</td></tr>
                                ) : monthlyRecords.length === 0 ? (
                                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                                        Chưa có KPI tháng này. Nhấn "Tạo kỳ KPI" để bắt đầu.
                                    </td></tr>
                                ) : (
                                    monthlyRecords.map(record => {
                                        const assignmentKey = `${record.employee_id}-${record.policy_id}`;
                                        const assignment = assignments.get(assignmentKey);
                                        const isSecondary = assignment?.assignment_type === 'secondary';
                                        
                                        return (
                                            <tr key={record.id} className="border-b hover:bg-muted/30 transition-colors">
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarImage src={record.employee?.avatar} />
                                                            <AvatarFallback>{record.employee?.name?.charAt(0) || '?'}</AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-medium text-sm">{record.employee?.name}</p>
                                                                {isSecondary && (
                                                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                                                                        KPI Phụ
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">{record.policy?.code}</p>
                                                            {isSecondary && assignment?.compensation_bucket && (
                                                                <p className="text-[10px] text-muted-foreground">{assignment.compensation_bucket}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            <td className="p-3 text-center">
                                                <Badge variant="outline" className="text-xs">
                                                    {record.employee?.role}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`text-lg font-bold ${
                                                    record.total_score >= 85 ? 'text-emerald-600' :
                                                    record.total_score >= 65 ? 'text-amber-600' : 'text-red-600'
                                                }`}>
                                                    {Number(record.total_score).toFixed(1)}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                {record.rank && (
                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${rankColors[record.rank] || ''}`}>
                                                        {record.rank}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right text-emerald-600 font-medium text-sm">
                                                {Number(record.kpi_bonus_amount) > 0 ? formatCurrency(record.kpi_bonus_amount) : '-'}
                                            </td>
                                            <td className="p-3 text-right text-red-600 font-medium text-sm">
                                                {Number(record.kpi_penalty_amount) > 0 ? formatCurrency(record.kpi_penalty_amount) : '-'}
                                            </td>
                                            <td className="p-3 text-center font-medium text-sm">
                                                {Number(record.kpi_commission_factor)}%
                                            </td>
                                            <td className="p-3 text-center">
                                                <Badge variant={statusColors[record.status] as any}>
                                                    {statusLabels[record.status]}
                                                </Badge>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewingId(record.id)} title="Xem chi tiết">
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </Button>
                                                    {record.status !== 'locked' && (
                                                        <>
                                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleRecalculate(record.id)} disabled={!!actionLoading} title="Tính lại">
                                                                {actionLoading === record.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                                            </Button>
                                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleLock(record.id)} disabled={!!actionLoading} title="Khóa">
                                                                <Lock className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </>
                                                    )}
                                                    {record.status === 'locked' && (
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600" onClick={() => handlePush(record.id)} disabled={!!actionLoading} title="Đẩy sang lương">
                                                            <Send className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
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
