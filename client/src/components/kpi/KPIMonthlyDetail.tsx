import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Lock, Send, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useKPI } from '@/hooks/useKPI';
import { formatCurrency } from '@/lib/utils';

const violationTypeLabels: Record<string, string> = {
    discipline: 'Kỷ luật',
    quality: 'Chất lượng',
    process: 'Quy trình',
    other: 'Khác',
};

const groupLabels: Record<string, string> = {
    output: 'Kết quả',
    process: 'Quy trình',
    discipline: 'Kỷ luật',
    quality: 'Chất lượng',
};

const rankColors: Record<string, string> = {
    'A+': 'bg-emerald-100 text-emerald-800',
    'A': 'bg-blue-100 text-blue-800',
    'B': 'bg-amber-100 text-amber-800',
    'C': 'bg-orange-100 text-orange-800',
    'D': 'bg-red-100 text-red-800',
};

interface Props {
    id: string;
    onBack: () => void;
}

export function KPIMonthlyDetail({ id, onBack }: Props) {
    const { selectedMonthly, fetchMonthlyDetail, recalculateMonthly, lockMonthly, pushToPayroll, updateMonthly, loading } = useKPI();
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [editingItems, setEditingItems] = useState<Record<string, { actual_value?: number; manual_adjustment?: number; note?: string }>>({});

    useEffect(() => {
        fetchMonthlyDetail(id);
    }, [fetchMonthlyDetail, id]);

    const record = selectedMonthly;
    const items = record?.items || [];
    const violations = record?.violations || [];

    // Group items
    const groupedItems = items.reduce((acc: Record<string, any[]>, item) => {
        const group = item.metric_group || 'output';
        if (!acc[group]) acc[group] = [];
        acc[group].push(item);
        return acc;
    }, {});

    const handleSaveManual = async () => {
        const changedItems = Object.entries(editingItems).map(([itemId, changes]) => ({
            id: itemId,
            ...changes,
        }));
        if (changedItems.length === 0) return;

        setActionLoading('save');
        try {
            await updateMonthly(id, { items: changedItems });
            setEditingItems({});
            fetchMonthlyDetail(id);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRecalculate = async () => {
        setActionLoading('recalculate');
        try {
            await recalculateMonthly(id);
            fetchMonthlyDetail(id);
        } finally {
            setActionLoading(null);
        }
    };

    const handleLock = async () => {
        if (!confirm('Khóa KPI này? Sau khi khóa sẽ không thể sửa trực tiếp.')) return;
        setActionLoading('lock');
        try {
            await lockMonthly(id);
            fetchMonthlyDetail(id);
        } finally {
            setActionLoading(null);
        }
    };

    const handlePush = async () => {
        setActionLoading('push');
        try {
            await pushToPayroll(id);
        } finally {
            setActionLoading(null);
        }
    };

    const isLocked = record?.status === 'locked';

    if (!record && loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Quay lại
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={record?.employee?.avatar} />
                            <AvatarFallback>{record?.employee?.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <h2 className="text-lg font-bold">{record?.employee?.name}</h2>
                            <p className="text-sm text-muted-foreground">
                                {record?.policy?.name} | Tháng: {record?.month_key}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isLocked && (
                        <>
                            {Object.keys(editingItems).length > 0 && (
                                <Button variant="outline" onClick={handleSaveManual} disabled={!!actionLoading}>
                                    Lưu thay đổi
                                </Button>
                            )}
                            <Button variant="outline" onClick={handleRecalculate} disabled={!!actionLoading}>
                                {actionLoading === 'recalculate' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                                Tính lại
                            </Button>
                            <Button onClick={handleLock} disabled={!!actionLoading}>
                                <Lock className="h-4 w-4 mr-2" />
                                Khóa KPI
                            </Button>
                        </>
                    )}
                    {isLocked && (
                        <Button onClick={handlePush} disabled={!!actionLoading}>
                            <Send className="h-4 w-4 mr-2" />
                            Đẩy sang lương
                        </Button>
                    )}
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Card>
                    <CardContent className="p-3 text-center">
                        <p className="text-xs text-muted-foreground">Tổng điểm</p>
                        <p className="text-2xl font-bold">{Number(record?.total_score || 0).toFixed(1)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-3 text-center">
                        <p className="text-xs text-muted-foreground">Xếp loại</p>
                        <span className={`inline-block mt-1 px-3 py-1 rounded-full text-lg font-bold ${rankColors[record?.rank || ''] || 'bg-gray-100'}`}>
                            {record?.rank || '-'}
                        </span>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-3 text-center">
                        <p className="text-xs text-muted-foreground">Thưởng KPI</p>
                        <p className="text-lg font-bold text-emerald-600">{formatCurrency(record?.kpi_bonus_amount || 0)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-3 text-center">
                        <p className="text-xs text-muted-foreground">Phạt KPI</p>
                        <p className="text-lg font-bold text-red-600">{formatCurrency(record?.kpi_penalty_amount || 0)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-3 text-center">
                        <p className="text-xs text-muted-foreground">Hệ số HH (%)</p>
                        <p className="text-lg font-bold">{Number(record?.kpi_commission_factor || 100)}%</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-3 text-center">
                        <p className="text-xs text-muted-foreground">Trạng thái</p>
                        <Badge variant={isLocked ? 'success' : 'secondary'} className="mt-1">
                            {isLocked ? 'Đã khóa' : record?.status === 'pending' ? 'Chờ duyệt' : 'Nháp'}
                        </Badge>
                    </CardContent>
                </Card>
            </div>

            {/* Detail items by group */}
            {['output', 'process', 'discipline', 'quality'].map(group => {
                const groupItems = groupedItems[group];
                if (!groupItems || groupItems.length === 0) return null;

                return (
                    <Card key={group}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">{groupLabels[group]}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full">
                                <thead className="bg-muted/30 border-y">
                                    <tr>
                                        <th className="p-2 text-left text-xs font-medium text-muted-foreground">Chỉ tiêu</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Trọng số</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Mục tiêu</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Thực tế</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Đạt %</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Điểm gốc</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Điều chỉnh</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Điểm cuối</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Nguồn</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupItems.map((item: any) => {
                                        const editing = editingItems[item.id] || {};
                                        return (
                                            <tr key={item.id} className="border-b hover:bg-muted/20">
                                                <td className="p-2">
                                                    <div className="text-sm font-medium">{item.metric_name}</div>
                                                    <div className="text-xs text-muted-foreground">{item.metric_code}</div>
                                                </td>
                                                <td className="p-2 text-center text-sm font-medium">{item.weight}</td>
                                                <td className="p-2 text-center text-sm">{Number(item.target_value) > 0 ? item.target_value : '-'}</td>
                                                <td className="p-2 text-center">
                                                    {!isLocked && (item.source_type === 'manual' || item.source_type === 'hybrid') ? (
                                                        <Input
                                                            type="number"
                                                            className="w-20 h-7 text-sm text-center mx-auto"
                                                            value={editing.actual_value ?? item.actual_value}
                                                            onChange={e => setEditingItems(prev => ({
                                                                ...prev,
                                                                [item.id]: { ...prev[item.id], actual_value: Number(e.target.value) }
                                                            }))}
                                                        />
                                                    ) : (
                                                        <span className="text-sm font-medium">{Number(item.actual_value).toFixed(1)}</span>
                                                    )}
                                                </td>
                                                <td className="p-2 text-center">
                                                    <span className={`text-sm font-medium ${
                                                        item.achievement_rate >= 100 ? 'text-emerald-600' :
                                                        item.achievement_rate >= 70 ? 'text-amber-600' : 'text-red-600'
                                                    }`}>
                                                        {Number(item.achievement_rate).toFixed(0)}%
                                                    </span>
                                                </td>
                                                <td className="p-2 text-center text-sm">{Number(item.raw_score).toFixed(1)}</td>
                                                <td className="p-2 text-center">
                                                    {!isLocked ? (
                                                        <Input
                                                            type="number"
                                                            className="w-16 h-7 text-sm text-center mx-auto"
                                                            value={editing.manual_adjustment ?? item.manual_adjustment}
                                                            onChange={e => setEditingItems(prev => ({
                                                                ...prev,
                                                                [item.id]: { ...prev[item.id], manual_adjustment: Number(e.target.value) }
                                                            }))}
                                                        />
                                                    ) : (
                                                        <span className="text-sm">{Number(item.manual_adjustment) !== 0 ? item.manual_adjustment : '-'}</span>
                                                    )}
                                                </td>
                                                <td className="p-2 text-center font-bold text-sm">{Number(item.final_score).toFixed(1)}</td>
                                                <td className="p-2 text-center">
                                                    <Badge variant={item.source_type === 'auto' ? 'success' : item.source_type === 'hybrid' ? 'warning' : 'secondary'} className="text-xs">
                                                        {item.source_type}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                );
            })}

            {/* Violations */}
            {violations.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Vi phạm KPI ({violations.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full">
                            <thead className="bg-muted/30 border-y">
                                <tr>
                                    <th className="p-2 text-left text-xs font-medium text-muted-foreground">Vi phạm</th>
                                    <th className="p-2 text-center text-xs font-medium text-muted-foreground">Loại</th>
                                    <th className="p-2 text-center text-xs font-medium text-muted-foreground">Trừ điểm</th>
                                    <th className="p-2 text-right text-xs font-medium text-muted-foreground">Trừ tiền</th>
                                    <th className="p-2 text-center text-xs font-medium text-muted-foreground">Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                {violations.map((v: any) => (
                                    <tr key={v.id} className="border-b">
                                        <td className="p-2 text-sm">{v.rule_name}</td>
                                        <td className="p-2 text-center"><Badge variant="outline" className="text-xs">{violationTypeLabels[v.violation_type] || v.violation_type}</Badge></td>
                                        <td className="p-2 text-center text-red-600 font-medium">{v.deduct_kpi_point ? `-${v.deduct_kpi_point}` : '-'}</td>
                                        <td className="p-2 text-right text-red-600">{Number(v.deduct_amount) > 0 ? formatCurrency(v.deduct_amount) : '-'}</td>
                                        <td className="p-2 text-center">
                                            <Badge variant={v.status === 'approved' ? 'success' : v.status === 'rejected' ? 'danger' : 'warning'} className="text-xs">
                                                {v.status === 'approved' ? 'Đã duyệt' : v.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
