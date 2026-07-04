import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useKPI } from '@/hooks/useKPI';
import { api } from '@/lib/api';

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultMonthKey?: string;
}

export function KPIViolationFormDialog({ open, onClose, onSuccess, defaultMonthKey }: Props) {
    const { createViolation } = useKPI();
    const [employees, setEmployees] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        employee_id: '',
        month_key: defaultMonthKey || '',
        violation_type: 'discipline',
        rule_code: '',
        rule_name: '',
        deduct_kpi_point: 0,
        deduct_amount: 0,
        note: '',
    });

    // Fetch employees
    useEffect(() => {
        if (open) {
            api.get('/users?status=active').then(res => {
                const data = (res.data as any)?.data;
                setEmployees(data?.users || []);
            }).catch(() => {});
        }
    }, [open]);

    // Update month_key when defaultMonthKey changes
    useEffect(() => {
        if (defaultMonthKey) {
            setForm(f => ({ ...f, month_key: defaultMonthKey }));
        }
    }, [defaultMonthKey]);

    const violationPresets = [
        { code: 'uniform_violation', name: 'Không mặc đồng phục', type: 'discipline', point: 1 },
        { code: 'photo_missing', name: 'Quên chụp ảnh trước/sau', type: 'quality', point: 1 },
        { code: 'late_arrival', name: 'Đi muộn', type: 'discipline', point: 0.5 },
        { code: 'no_feedback', name: 'Không xin feedback', type: 'quality', point: 1 },
        { code: 'no_care_guide', name: 'Không nhận HD bảo quản', type: 'quality', point: 1 },
        { code: 'no_cleaning', name: 'Không vệ sinh khu làm việc', type: 'discipline', point: 2 },
        { code: 'wrong_process', name: 'Không đúng quy trình', type: 'process', point: 2 },
        { code: 'bad_attitude', name: 'Thái độ không tốt', type: 'discipline', point: 3 },
    ];

    const handlePresetSelect = (preset: typeof violationPresets[0]) => {
        setForm(f => ({
            ...f,
            rule_code: preset.code,
            rule_name: preset.name,
            violation_type: preset.type,
            deduct_kpi_point: preset.point,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employee_id || !form.rule_name) return;

        setSaving(true);
        try {
            await createViolation(form);
            // Reset form
            setForm({
                employee_id: '',
                month_key: defaultMonthKey || '',
                violation_type: 'discipline',
                rule_code: '',
                rule_name: '',
                deduct_kpi_point: 0,
                deduct_amount: 0,
                note: '',
            });
            onSuccess();
        } catch {
            // handled in hook
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Thêm vi phạm KPI</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Quick presets */}
                    <div>
                        <Label className="text-xs text-muted-foreground">Chọn nhanh:</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {violationPresets.map(preset => (
                                <Button
                                    key={preset.code}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => handlePresetSelect(preset)}
                                >
                                    {preset.name}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label>Nhân sự *</Label>
                        <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                            <SelectTrigger>
                                <SelectValue placeholder="Chọn nhân sự" />
                            </SelectTrigger>
                            <SelectContent>
                                {employees.map(emp => (
                                    <SelectItem key={emp.id} value={emp.id}>
                                        {emp.name} ({emp.role})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Tháng</Label>
                            <Input
                                value={form.month_key}
                                onChange={e => setForm(f => ({ ...f, month_key: e.target.value }))}
                                placeholder="YYYY-MM"
                            />
                        </div>
                        <div>
                            <Label>Loại vi phạm</Label>
                            <Select value={form.violation_type} onValueChange={v => setForm(f => ({ ...f, violation_type: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="discipline">Kỷ luật</SelectItem>
                                    <SelectItem value="quality">Chất lượng</SelectItem>
                                    <SelectItem value="process">Quy trình</SelectItem>
                                    <SelectItem value="other">Khác</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div>
                        <Label>Tên vi phạm *</Label>
                        <Input
                            value={form.rule_name}
                            onChange={e => setForm(f => ({ ...f, rule_name: e.target.value }))}
                            placeholder="VD: Không mặc đồng phục"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Điểm trừ KPI</Label>
                            <Input
                                type="number"
                                value={form.deduct_kpi_point}
                                onChange={e => setForm(f => ({ ...f, deduct_kpi_point: Number(e.target.value) }))}
                                step="0.5"
                                min="0"
                            />
                        </div>
                        <div>
                            <Label>Tiền phạt (VNĐ)</Label>
                            <Input
                                type="number"
                                value={form.deduct_amount}
                                onChange={e => setForm(f => ({ ...f, deduct_amount: Number(e.target.value) }))}
                                step="10000"
                                min="0"
                            />
                        </div>
                    </div>

                    <div>
                        <Label>Ghi chú</Label>
                        <Textarea
                            value={form.note}
                            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                            rows={2}
                            placeholder="Ghi chú thêm..."
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
                        <Button type="submit" disabled={saving || !form.employee_id || !form.rule_name}>
                            {saving ? 'Đang lưu...' : 'Thêm vi phạm'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
