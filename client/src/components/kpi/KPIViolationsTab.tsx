import { useState, useEffect } from 'react';
import { Plus, Check, X, Search, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useKPI } from '@/hooks/useKPI';
import { KPIViolationFormDialog } from './KPIViolationFormDialog';
import { formatCurrency } from '@/lib/utils';

const violationTypeLabels: Record<string, string> = {
    discipline: 'Kỷ luật',
    quality: 'Chất lượng',
    process: 'Quy trình',
    other: 'Khác',
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

export function KPIViolationsTab() {
    const { violations, fetchViolations, approveViolation, rejectViolation, loading } = useKPI();

    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [monthKey, setMonthKey] = useState(defaultMonth);
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const monthOptions = getMonthOptions();

    useEffect(() => {
        fetchViolations({
            month_key: monthKey,
            status: statusFilter !== 'all' ? statusFilter : undefined,
            violation_type: typeFilter !== 'all' ? typeFilter : undefined,
        });
    }, [fetchViolations, monthKey, statusFilter, typeFilter]);

    const reload = () => fetchViolations({
        month_key: monthKey,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        violation_type: typeFilter !== 'all' ? typeFilter : undefined,
    });

    const handleApprove = async (id: string) => {
        setActionLoading(id);
        try {
            await approveViolation(id);
            reload();
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (id: string) => {
        setActionLoading(id);
        try {
            await rejectViolation(id);
            reload();
        } finally {
            setActionLoading(null);
        }
    };

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
                            <SelectItem value="all">Tất cả TT</SelectItem>
                            <SelectItem value="pending">Chờ duyệt</SelectItem>
                            <SelectItem value="approved">Đã duyệt</SelectItem>
                            <SelectItem value="rejected">Từ chối</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tất cả loại</SelectItem>
                            <SelectItem value="discipline">Kỷ luật</SelectItem>
                            <SelectItem value="quality">Chất lượng</SelectItem>
                            <SelectItem value="process">Quy trình</SelectItem>
                            <SelectItem value="other">Khác</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={() => setShowForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm vi phạm
                </Button>
            </div>

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50 border-b">
                                <tr>
                                    <th className="p-3 text-left text-sm font-medium text-muted-foreground">Nhân sự</th>
                                    <th className="p-3 text-left text-sm font-medium text-muted-foreground">Vi phạm</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Loại</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Nguồn</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Trừ điểm</th>
                                    <th className="p-3 text-right text-sm font-medium text-muted-foreground">Trừ tiền</th>
                                    <th className="p-3 text-left text-sm font-medium text-muted-foreground">Ghi chú</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Trạng thái</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && violations.length === 0 ? (
                                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Đang tải...</td></tr>
                                ) : violations.length === 0 ? (
                                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Không có vi phạm nào</td></tr>
                                ) : (
                                    violations.map(v => (
                                        <tr key={v.id} className="border-b hover:bg-muted/30 transition-colors">
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-7 w-7">
                                                        <AvatarImage src={v.employee?.avatar} />
                                                        <AvatarFallback className="text-xs">{v.employee?.name?.charAt(0) || '?'}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="text-sm font-medium">{v.employee?.name}</p>
                                                        <p className="text-xs text-muted-foreground">{v.employee?.role}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <p className="text-sm font-medium">{v.rule_name}</p>
                                                {v.rule_code && <p className="text-xs text-muted-foreground">{v.rule_code}</p>}
                                            </td>
                                            <td className="p-3 text-center">
                                                <Badge variant="outline" className="text-xs">
                                                    {violationTypeLabels[v.violation_type] || v.violation_type}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-center">
                                                <Badge variant={v.source_type === 'auto' ? 'success' : 'secondary'} className="text-xs">
                                                    {v.source_type === 'auto' ? 'Tự động' : 'Thủ công'}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-center text-red-600 font-medium">
                                                {Number(v.deduct_kpi_point) > 0 ? `-${v.deduct_kpi_point}` : '-'}
                                            </td>
                                            <td className="p-3 text-right text-red-600 text-sm">
                                                {Number(v.deduct_amount) > 0 ? formatCurrency(v.deduct_amount) : '-'}
                                            </td>
                                            <td className="p-3 text-sm text-muted-foreground max-w-[200px] truncate">
                                                {v.note || '-'}
                                            </td>
                                            <td className="p-3 text-center">
                                                <Badge variant={
                                                    v.status === 'approved' ? 'success' :
                                                    v.status === 'rejected' ? 'danger' : 'warning'
                                                } className="text-xs">
                                                    {v.status === 'approved' ? 'Đã duyệt' :
                                                     v.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                                                </Badge>
                                            </td>
                                            <td className="p-3">
                                                {v.status === 'pending' && (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0 text-emerald-600"
                                                            onClick={() => handleApprove(v.id)}
                                                            disabled={!!actionLoading}
                                                            title="Duyệt"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0 text-red-600"
                                                            onClick={() => handleReject(v.id)}
                                                            disabled={!!actionLoading}
                                                            title="Từ chối"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Form Dialog */}
            <KPIViolationFormDialog
                open={showForm}
                onClose={() => setShowForm(false)}
                onSuccess={() => { setShowForm(false); reload(); }}
                defaultMonthKey={monthKey}
            />
        </div>
    );
}
