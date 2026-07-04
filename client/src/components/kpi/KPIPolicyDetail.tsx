import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Edit, GripVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useKPI, type KPIPolicy, type KPIPolicyMetric } from '@/hooks/useKPI';
import { KPIMetricFormDialog } from './KPIMetricFormDialog';

const groupLabels: Record<string, string> = {
    output: 'Kết quả',
    process: 'Quy trình',
    discipline: 'Kỷ luật',
    quality: 'Chất lượng',
};

const groupColors: Record<string, string> = {
    output: 'bg-blue-100 text-blue-800',
    process: 'bg-emerald-100 text-emerald-800',
    discipline: 'bg-amber-100 text-amber-800',
    quality: 'bg-purple-100 text-purple-800',
};

const scoreTypeLabels: Record<string, string> = {
    threshold: 'Bậc thang',
    linear: 'Tuyến tính',
    per_event: 'Theo sự kiện',
    boolean: 'Có/Không',
    manual: 'Nhập tay',
};

const sourceTypeLabels: Record<string, string> = {
    auto: 'Tự động',
    hybrid: 'Kết hợp',
    manual: 'Thủ công',
};

interface Props {
    policyId: string;
    onBack: () => void;
}

export function KPIPolicyDetail({ policyId, onBack }: Props) {
    const { selectedPolicy, fetchPolicyDetail, deleteMetric, loading } = useKPI();
    const [showMetricForm, setShowMetricForm] = useState(false);
    const [editingMetric, setEditingMetric] = useState<KPIPolicyMetric | null>(null);

    useEffect(() => {
        fetchPolicyDetail(policyId);
    }, [fetchPolicyDetail, policyId]);

    const policy = selectedPolicy;
    const metrics = policy?.metrics || [];

    // Group metrics
    const groupedMetrics = metrics.reduce((acc: Record<string, KPIPolicyMetric[]>, m) => {
        const group = m.metric_group || 'output';
        if (!acc[group]) acc[group] = [];
        acc[group].push(m);
        return acc;
    }, {});

    const totalWeight = metrics.reduce((sum, m) => sum + Number(m.weight || 0), 0);

    const handleDeleteMetric = async (id: string) => {
        if (!confirm('Bạn chắc chắn muốn xóa chỉ tiêu này?')) return;
        await deleteMetric(id);
        fetchPolicyDetail(policyId);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Quay lại
                </Button>
                <div className="flex-1">
                    <h2 className="text-lg font-bold">{policy?.name || 'Đang tải...'}</h2>
                    <p className="text-sm text-muted-foreground">
                        <code className="bg-muted px-1 rounded">{policy?.code}</code>
                        {' '} | Tổng trọng số: <span className={totalWeight === 100 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>{totalWeight}/100</span>
                        {' '} | {metrics.length} chỉ tiêu
                        {policy?.employee_count ? ` | ${policy.employee_count} nhân sự` : ''}
                    </p>
                </div>
                <Button onClick={() => { setEditingMetric(null); setShowMetricForm(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm chỉ tiêu
                </Button>
            </div>

            {/* Metrics by group */}
            {['output', 'process', 'discipline', 'quality'].map(group => {
                const groupMetrics = groupedMetrics[group];
                if (!groupMetrics || groupMetrics.length === 0) return null;

                const groupWeight = groupMetrics.reduce((sum, m) => sum + Number(m.weight || 0), 0);

                return (
                    <Card key={group}>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${groupColors[group]}`}>
                                        {groupLabels[group]}
                                    </span>
                                    <span className="text-muted-foreground font-normal">
                                        ({groupMetrics.length} chỉ tiêu, trọng số: {groupWeight})
                                    </span>
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full">
                                <thead className="bg-muted/30 border-y">
                                    <tr>
                                        <th className="p-2 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                                        <th className="p-2 text-left text-xs font-medium text-muted-foreground">Chỉ tiêu</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Trọng số</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Loại tính</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Mục tiêu</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground">Nguồn DL</th>
                                        <th className="p-2 text-center text-xs font-medium text-muted-foreground w-20">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupMetrics.sort((a, b) => a.sort_order - b.sort_order).map((metric, idx) => (
                                        <tr key={metric.id} className="border-b hover:bg-muted/20 transition-colors">
                                            <td className="p-2 text-muted-foreground">
                                                <GripVertical className="h-3 w-3" />
                                            </td>
                                            <td className="p-2">
                                                <div className="font-medium text-sm">{metric.metric_name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    <code>{metric.metric_code}</code>
                                                    {metric.description && ` - ${metric.description}`}
                                                </div>
                                            </td>
                                            <td className="p-2 text-center font-bold">{metric.weight}</td>
                                            <td className="p-2 text-center">
                                                <Badge variant="outline" className="text-xs">
                                                    {scoreTypeLabels[metric.score_type] || metric.score_type}
                                                </Badge>
                                            </td>
                                            <td className="p-2 text-center text-sm">
                                                {metric.target_value > 0 ? (
                                                    <span>
                                                        {metric.target_type === 'percentage' ? `${metric.target_value}%`
                                                            : metric.target_type === 'absolute' ? new Intl.NumberFormat('vi-VN').format(metric.target_value)
                                                            : metric.target_value}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="p-2 text-center">
                                                <Badge variant={metric.source_type === 'auto' ? 'success' : metric.source_type === 'hybrid' ? 'warning' : 'secondary'} className="text-xs">
                                                    {sourceTypeLabels[metric.source_type] || metric.source_type}
                                                </Badge>
                                            </td>
                                            <td className="p-2">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0"
                                                        onClick={() => { setEditingMetric(metric); setShowMetricForm(true); }}
                                                    >
                                                        <Edit className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-red-500"
                                                        onClick={() => handleDeleteMetric(metric.id)}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                );
            })}

            {metrics.length === 0 && !loading && (
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                        Chưa có chỉ tiêu KPI nào. Nhấn "Thêm chỉ tiêu" để bắt đầu.
                    </CardContent>
                </Card>
            )}

            {/* Metric Form Dialog */}
            <KPIMetricFormDialog
                open={showMetricForm}
                onClose={() => { setShowMetricForm(false); setEditingMetric(null); }}
                onSuccess={() => {
                    setShowMetricForm(false);
                    setEditingMetric(null);
                    fetchPolicyDetail(policyId);
                }}
                policyId={policyId}
                metric={editingMetric}
            />
        </div>
    );
}
