import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useKPI, type KPIPolicyMetric } from '@/hooks/useKPI';

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    policyId: string;
    metric?: KPIPolicyMetric | null;
}

const SOURCE_KEYS = [
    { value: 'order_revenue_by_sale', label: 'Doanh thu (Sale)' },
    { value: 'closed_leads_ratio', label: 'Tỷ lệ chốt Lead' },
    { value: 'return_customer_count', label: 'Số khách hàng quay lại' },
    { value: 'lead_reclaimed_count', label: 'Số Lead bị thu hồi' },
    { value: 'sla_missed_count', label: 'Số lần trễ SLA' },
    { value: 'completed_jobs_count', label: 'Số công việc hoàn thành' },
    { value: 'on_time_completion_rate', label: 'Tỷ lệ hoàn thành đúng hạn' },
    { value: 'before_sale_task_completed_on_time_rate', label: 'Tỷ lệ chăm sóc Lead đúng hạn' },
    { value: 'after_sale_task_completed_on_time_rate', label: 'Tỷ lệ chăm sóc sau bán đúng hạn' },
    { value: 'status_update_rate', label: 'Tỷ lệ cập nhật trạng thái' },
    { value: 'late_jobs_count', label: 'Số công việc trễ hạn' },
    { value: 'rework_count', label: 'Số lần phải làm lại' },
    { value: 'bad_feedback_count', label: 'Số phản hồi xấu' },
    { value: 'employee_violation_logs', label: 'Tổng lỗi vi phạm' },
];

export function KPIMetricFormDialog({ open, onClose, onSuccess, policyId, metric }: Props) {
    const { addMetric, updateMetric } = useKPI();
    const isEditing = !!metric;
    const [openSourceKey, setOpenSourceKey] = useState(false);

    const [form, setForm] = useState({
        metric_code: metric?.metric_code || '',
        metric_name: metric?.metric_name || '',
        metric_group: metric?.metric_group || 'output',
        description: metric?.description || '',
        weight: metric?.weight ?? 10,
        score_type: metric?.score_type || 'threshold',
        target_type: metric?.target_type || 'percentage',
        target_value: metric?.target_value ?? 0,
        source_type: metric?.source_type || 'manual',
        source_key: metric?.source_key || '',
        manual_input_allowed: metric?.manual_input_allowed ?? false,
        manager_review_required: metric?.manager_review_required ?? false,
        sort_order: metric?.sort_order ?? 0,
        // Scoring rules - simplified for threshold
        scoring_tiers: metric?.scoring_rules?.tiers || [
            { min: 100, max: null, score: 10 },
            { min: 80, max: 99, score: 8 },
            { min: 60, max: 79, score: 5 },
            { min: 0, max: 59, score: 2 },
        ],
        per_event_points: metric?.scoring_rules?.points_per_event ?? -1,
        per_event_max: metric?.scoring_rules?.max_deduct ?? -5,
    });
    const [saving, setSaving] = useState(false);

    // Reset when metric changes
    useEffect(() => {
        if (metric) {
            setForm({
                metric_code: metric.metric_code,
                metric_name: metric.metric_name,
                metric_group: metric.metric_group,
                description: metric.description || '',
                weight: metric.weight,
                score_type: metric.score_type,
                target_type: metric.target_type,
                target_value: metric.target_value,
                source_type: metric.source_type,
                source_key: metric.source_key || '',
                manual_input_allowed: metric.manual_input_allowed,
                manager_review_required: metric.manager_review_required,
                sort_order: metric.sort_order,
                scoring_tiers: metric.scoring_rules?.tiers || [],
                per_event_points: metric.scoring_rules?.points_per_event ?? -1,
                per_event_max: metric.scoring_rules?.max_deduct ?? -5,
            });
        } else {
            setForm({
                metric_code: '',
                metric_name: '',
                metric_group: 'output',
                description: '',
                weight: 10,
                score_type: 'threshold',
                target_type: 'percentage',
                target_value: 0,
                source_type: 'manual',
                source_key: '',
                manual_input_allowed: false,
                manager_review_required: false,
                sort_order: 0,
                scoring_tiers: [
                    { min: 100, max: null, score: 10 },
                    { min: 80, max: 99, score: 8 },
                    { min: 60, max: 79, score: 5 },
                    { min: 0, max: 59, score: 2 },
                ],
                per_event_points: -1,
                per_event_max: -5,
            });
        }
    }, [metric, open]);

    const buildScoringRules = () => {
        switch (form.score_type) {
            case 'threshold':
                return { type: 'threshold', tiers: form.scoring_tiers };
            case 'per_event':
                return { type: 'per_event', points_per_event: form.per_event_points, max_deduct: form.per_event_max };
            case 'linear':
                return { type: 'linear', base_score: form.weight };
            case 'boolean':
                return { type: 'boolean', yes_score: form.weight, no_score: 0 };
            case 'manual':
                return { type: 'manual', min_score: 0, max_score: form.weight };
            default:
                return {};
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const data = {
                metric_code: form.metric_code,
                metric_name: form.metric_name,
                metric_group: form.metric_group,
                description: form.description || null,
                weight: Number(form.weight),
                score_type: form.score_type,
                target_type: form.target_type,
                target_value: Number(form.target_value),
                scoring_rules: buildScoringRules(),
                source_type: form.source_type,
                source_key: form.source_key || null,
                manual_input_allowed: form.manual_input_allowed,
                manager_review_required: form.manager_review_required,
                sort_order: Number(form.sort_order),
            };

            if (isEditing && metric) {
                await updateMetric(metric.id, data);
            } else {
                await addMetric(policyId, data);
            }
            onSuccess();
        } catch {
            // handled in hook
        } finally {
            setSaving(false);
        }
    };

    const updateTier = (index: number, field: string, value: any) => {
        const tiers = [...form.scoring_tiers];
        tiers[index] = { ...tiers[index], [field]: value === '' ? null : Number(value) };
        setForm(f => ({ ...f, scoring_tiers: tiers }));
    };

    const addTier = () => {
        setForm(f => ({
            ...f,
            scoring_tiers: [...f.scoring_tiers, { min: 0, max: null, score: 0 }]
        }));
    };

    const removeTier = (index: number) => {
        setForm(f => ({ ...f, scoring_tiers: f.scoring_tiers.filter((_: any, i: number) => i !== index) }));
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Sửa chỉ tiêu KPI' : 'Thêm chỉ tiêu KPI'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Basic info */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Mã chỉ tiêu *</Label>
                            <Input
                                value={form.metric_code}
                                onChange={e => setForm(f => ({ ...f, metric_code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                                placeholder="VD: revenue_personal"
                                required
                                disabled={isEditing}
                            />
                        </div>
                        <div>
                            <Label>Tên chỉ tiêu *</Label>
                            <Input
                                value={form.metric_name}
                                onChange={e => setForm(f => ({ ...f, metric_name: e.target.value }))}
                                placeholder="VD: Doanh thu cá nhân"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <Label>Nhóm</Label>
                            <Select value={form.metric_group} onValueChange={v => setForm(f => ({ ...f, metric_group: v as "output" | "process" | "discipline" | "quality" }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="output">Kết quả</SelectItem>
                                    <SelectItem value="process">Quy trình</SelectItem>
                                    <SelectItem value="discipline">Kỷ luật</SelectItem>
                                    <SelectItem value="quality">Chất lượng</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Trọng số (điểm)</Label>
                            <Input
                                type="number"
                                value={form.weight}
                                onChange={e => setForm(f => ({ ...f, weight: Number(e.target.value) }))}
                                min={0}
                                max={100}
                            />
                        </div>
                        <div>
                            <Label>Thứ tự</Label>
                            <Input
                                type="number"
                                value={form.sort_order}
                                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                                min={0}
                            />
                        </div>
                    </div>

                    <div>
                        <Label>Mô tả</Label>
                        <Textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={2}
                        />
                    </div>

                    {/* Scoring config */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <Label>Loại tính điểm</Label>
                            <Select value={form.score_type} onValueChange={v => setForm(f => ({ ...f, score_type: v as "boolean" | "manual" | "linear" | "threshold" | "per_event" }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="threshold">Bậc thang</SelectItem>
                                    <SelectItem value="linear">Tuyến tính</SelectItem>
                                    <SelectItem value="per_event">Theo sự kiện</SelectItem>
                                    <SelectItem value="boolean">Có/Không</SelectItem>
                                    <SelectItem value="manual">Nhập tay</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Kiểu mục tiêu</Label>
                            <Select value={form.target_type} onValueChange={v => setForm(f => ({ ...f, target_type: v as "percentage" | "absolute" | "count" }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="percentage">Phần trăm (%)</SelectItem>
                                    <SelectItem value="absolute">Giá trị tuyệt đối</SelectItem>
                                    <SelectItem value="count">Số lượng</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Giá trị mục tiêu</Label>
                            <Input
                                type="number"
                                value={form.target_value}
                                onChange={e => setForm(f => ({ ...f, target_value: Number(e.target.value) }))}
                            />
                        </div>
                    </div>

                    {/* Threshold tiers */}
                    {form.score_type === 'threshold' && (
                        <div className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">Cấu hình bậc thang</Label>
                                <Button type="button" variant="outline" size="sm" onClick={addTier}>+ Thêm bậc</Button>
                            </div>
                            <div className="space-y-1">
                                {form.scoring_tiers.map((tier: any, idx: number) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground w-8">#{idx + 1}</span>
                                        <Input
                                            type="number"
                                            className="w-20 h-8 text-sm"
                                            value={tier.min ?? ''}
                                            onChange={e => updateTier(idx, 'min', e.target.value)}
                                            placeholder="Min %"
                                        />
                                        <span className="text-xs">-</span>
                                        <Input
                                            type="number"
                                            className="w-20 h-8 text-sm"
                                            value={tier.max ?? ''}
                                            onChange={e => updateTier(idx, 'max', e.target.value)}
                                            placeholder="Max %"
                                        />
                                        <span className="text-xs">=</span>
                                        <Input
                                            type="number"
                                            className="w-20 h-8 text-sm"
                                            value={tier.score ?? ''}
                                            onChange={e => updateTier(idx, 'score', e.target.value)}
                                            placeholder="Điểm"
                                        />
                                        <span className="text-xs text-muted-foreground">điểm</span>
                                        {form.scoring_tiers.length > 1 && (
                                            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => removeTier(idx)}>
                                                x
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Per event config */}
                    {form.score_type === 'per_event' && (
                        <div className="border rounded-lg p-3 space-y-2">
                            <Label className="text-sm font-medium">Cấu hình theo sự kiện</Label>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Điểm mỗi sự kiện</Label>
                                    <Input
                                        type="number"
                                        value={form.per_event_points}
                                        onChange={e => setForm(f => ({ ...f, per_event_points: Number(e.target.value) }))}
                                        step="0.5"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Trừ tối đa</Label>
                                    <Input
                                        type="number"
                                        value={form.per_event_max}
                                        onChange={e => setForm(f => ({ ...f, per_event_max: Number(e.target.value) }))}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Data source */}
                    <div className={cn(
                        "p-3 rounded-lg border space-y-3",
                        form.source_type === 'manual' ? "bg-muted/30" : "bg-primary/5 border-primary/20"
                    )}>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="font-semibold">Nguồn dữ liệu</Label>
                                <Select value={form.source_type} onValueChange={v => setForm(f => ({ ...f, source_type: v as "auto" | "manual" | "hybrid" }))}>
                                    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto">Tự động (auto)</SelectItem>
                                        <SelectItem value="hybrid">Kết hợp (hybrid)</SelectItem>
                                        <SelectItem value="manual">Thủ công (manual)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {(form.source_type === 'auto' || form.source_type === 'hybrid') && (
                                <div>
                                    <Label className="font-semibold text-primary">Source key *</Label>
                                    <Popover open={openSourceKey} onOpenChange={setOpenSourceKey}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={openSourceKey}
                                                className="w-full justify-between font-normal bg-background border-primary/30"
                                            >
                                                {form.source_key
                                                    ? SOURCE_KEYS.find((key) => key.value === form.source_key)?.label || form.source_key
                                                    : "Chọn hoặc nhập key..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[400px] p-0" align="start">
                                            <Command>
                                                <CommandInput 
                                                    placeholder="Tìm kiếm hoặc nhập key mới..." 
                                                    onValueChange={(v) => {
                                                        if (v && !SOURCE_KEYS.some(k => k.value === v)) {
                                                            setForm(f => ({ ...f, source_key: v }));
                                                        }
                                                    }}
                                                />
                                                <CommandList>
                                                    <CommandEmpty>Không tìm thấy key nào. Nhấn Enter để dùng key này.</CommandEmpty>
                                                    <CommandGroup>
                                                        {SOURCE_KEYS.map((key) => (
                                                            <CommandItem
                                                                key={key.value}
                                                                value={key.value}
                                                                onSelect={(currentValue) => {
                                                                    setForm(f => ({ ...f, source_key: currentValue }));
                                                                    setOpenSourceKey(false);
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        form.source_key === key.value ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                <div className="flex flex-col">
                                                                    <span>{key.label}</span>
                                                                    <span className="text-xs text-muted-foreground">{key.value}</span>
                                                                </div>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Switches */}
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={form.manual_input_allowed}
                                onCheckedChange={v => setForm(f => ({ ...f, manual_input_allowed: v }))}
                            />
                            <Label className="text-sm">Cho phép nhập tay</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={form.manager_review_required}
                                onCheckedChange={v => setForm(f => ({ ...f, manager_review_required: v }))}
                            />
                            <Label className="text-sm">Cần quản lý duyệt</Label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Đang lưu...' : isEditing ? 'Cập nhật' : 'Thêm'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
