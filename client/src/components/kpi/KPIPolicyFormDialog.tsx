import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useKPI, type KPIPolicy } from '@/hooks/useKPI';

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    policy?: KPIPolicy | null;
}

export function KPIPolicyFormDialog({ open, onClose, onSuccess, policy }: Props) {
    const { createPolicy, updatePolicy } = useKPI();
    const isEditing = !!policy;

    const [form, setForm] = useState({
        code: policy?.code || '',
        name: policy?.name || '',
        role: policy?.role || 'sale',
        description: policy?.description || '',
        effective_from: policy?.effective_from?.split('T')[0] || new Date().toISOString().split('T')[0],
        effective_to: policy?.effective_to?.split('T')[0] || '',
    });
    const [saving, setSaving] = useState(false);

    // Reset form when policy changes
    useState(() => {
        if (policy) {
            setForm({
                code: policy.code,
                name: policy.name,
                role: policy.role,
                description: policy.description || '',
                effective_from: policy.effective_from?.split('T')[0] || '',
                effective_to: policy.effective_to?.split('T')[0] || '',
            });
        } else {
            setForm({
                code: '',
                name: '',
                role: 'sale',
                description: '',
                effective_from: new Date().toISOString().split('T')[0],
                effective_to: '',
            });
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (isEditing && policy) {
                await updatePolicy(policy.id, {
                    name: form.name,
                    description: form.description || null,
                    effective_from: form.effective_from || null,
                    effective_to: form.effective_to || null,
                });
            } else {
                await createPolicy({
                    code: form.code,
                    name: form.name,
                    role: form.role,
                    description: form.description || undefined,
                    effective_from: form.effective_from || undefined,
                    effective_to: form.effective_to || undefined,
                });
            }
            onSuccess();
        } catch {
            // Error handled in hook
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Sửa chính sách KPI' : 'Tạo chính sách KPI'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isEditing && (
                        <div>
                            <Label>Mã chính sách *</Label>
                            <Input
                                value={form.code}
                                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                                placeholder="VD: KPI_SALE_FULLTIME"
                                required
                            />
                        </div>
                    )}
                    <div>
                        <Label>Tên chính sách *</Label>
                        <Input
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="VD: KPI Sale Full-time"
                            required
                        />
                    </div>
                    {!isEditing && (
                        <div>
                            <Label>Role *</Label>
                            <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sale">Sale</SelectItem>
                                    <SelectItem value="technician">Kỹ thuật</SelectItem>
                                    <SelectItem value="manager">Quản lý</SelectItem>
                                    <SelectItem value="accountant">Kế toán</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div>
                        <Label>Mô tả</Label>
                        <Textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Mô tả chính sách KPI"
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Ngày hiệu lực</Label>
                            <Input
                                type="date"
                                value={form.effective_from}
                                onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>Ngày kết thúc</Label>
                            <Input
                                type="date"
                                value={form.effective_to}
                                onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Đang lưu...' : isEditing ? 'Cập nhật' : 'Tạo mới'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
