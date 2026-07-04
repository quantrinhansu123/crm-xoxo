import { useState, useEffect } from 'react';
import { Plus, Settings, Eye, ToggleLeft, ToggleRight, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useKPI, type KPIPolicy } from '@/hooks/useKPI';
import { KPIPolicyFormDialog } from './KPIPolicyFormDialog';
import { KPIPolicyDetail } from './KPIPolicyDetail';

const roleLabels: Record<string, string> = {
    sale: 'Sale',
    technician: 'Kỹ thuật',
    manager: 'Quản lý',
    accountant: 'Kế toán',
    admin: 'Admin',
};

export function KPIPoliciesTab() {
    const { policies, fetchPolicies, updatePolicy, loading } = useKPI();
    const [roleFilter, setRoleFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<KPIPolicy | null>(null);
    const [viewingPolicy, setViewingPolicy] = useState<KPIPolicy | null>(null);

    useEffect(() => {
        fetchPolicies(roleFilter !== 'all' ? { role: roleFilter } : undefined);
    }, [fetchPolicies, roleFilter]);

    const filtered = policies.filter(p => {
        if (search) {
            const q = search.toLowerCase();
            return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
        }
        return true;
    });

    const handleToggleActive = async (policy: KPIPolicy) => {
        await updatePolicy(policy.id, { is_active: !policy.is_active });
        fetchPolicies(roleFilter !== 'all' ? { role: roleFilter } : undefined);
    };

    if (viewingPolicy) {
        return (
            <KPIPolicyDetail
                policyId={viewingPolicy.id}
                onBack={() => {
                    setViewingPolicy(null);
                    fetchPolicies(roleFilter !== 'all' ? { role: roleFilter } : undefined);
                }}
            />
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Tìm chính sách..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tất cả role</SelectItem>
                            <SelectItem value="sale">Sale</SelectItem>
                            <SelectItem value="technician">Kỹ thuật</SelectItem>
                            <SelectItem value="manager">Quản lý</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={() => { setEditingPolicy(null); setShowForm(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Tạo chính sách
                </Button>
            </div>

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50 border-b">
                                <tr>
                                    <th className="p-3 text-left text-sm font-medium text-muted-foreground">Mã</th>
                                    <th className="p-3 text-left text-sm font-medium text-muted-foreground">Tên chính sách</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Role</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Chỉ tiêu</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Tổng trọng số</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Trạng thái</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                            Đang tải...
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                            Chưa có chính sách KPI nào
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map(policy => (
                                        <tr key={policy.id} className="border-b hover:bg-muted/30 transition-colors">
                                            <td className="p-3">
                                                <code className="text-xs bg-muted px-2 py-1 rounded">{policy.code}</code>
                                            </td>
                                            <td className="p-3 font-medium">{policy.name}</td>
                                            <td className="p-3 text-center">
                                                <Badge variant={policy.role === 'sale' ? 'info' : policy.role === 'technician' ? 'secondary' : 'purple'}>
                                                    {roleLabels[policy.role] || policy.role}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-center">{policy.metric_count || 0}</td>
                                            <td className="p-3 text-center font-medium">{policy.total_weight || 0}</td>
                                            <td className="p-3 text-center">
                                                <Badge variant={policy.is_active ? 'success' : 'secondary'}>
                                                    {policy.is_active ? 'Đang dùng' : 'Ngưng'}
                                                </Badge>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setViewingPolicy(policy)}
                                                        title="Xem chi tiết"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => { setEditingPolicy(policy); setShowForm(true); }}
                                                        title="Chỉnh sửa"
                                                    >
                                                        <Settings className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleToggleActive(policy)}
                                                        title={policy.is_active ? 'Tắt' : 'Bật'}
                                                    >
                                                        {policy.is_active
                                                            ? <ToggleRight className="h-4 w-4 text-emerald-600" />
                                                            : <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                                                        }
                                                    </Button>
                                                </div>
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
            <KPIPolicyFormDialog
                open={showForm}
                onClose={() => { setShowForm(false); setEditingPolicy(null); }}
                onSuccess={() => {
                    setShowForm(false);
                    setEditingPolicy(null);
                    fetchPolicies(roleFilter !== 'all' ? { role: roleFilter } : undefined);
                }}
                policy={editingPolicy}
            />
        </div>
    );
}
