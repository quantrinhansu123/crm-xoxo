import { useState, useEffect } from 'react';
import { Save, Loader2, Users, RotateCcw, Globe, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useKPI, type KPIRankConfig } from '@/hooks/useKPI';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

function removeVietnameseAccents(str: string): string {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

const rankColors: Record<string, string> = {
    'A+': 'bg-emerald-100 text-emerald-800',
    'A': 'bg-blue-100 text-blue-800',
    'B': 'bg-amber-100 text-amber-800',
    'C': 'bg-orange-100 text-orange-800',
    'D': 'bg-red-100 text-red-800',
};

type EditingMap = Record<string, Partial<KPIRankConfig> & { _reset_to_global?: boolean }>;

export function KPISettingsTab() {
    const { 
        rankConfigs, 
        fetchRankConfigs, 
        updateRankConfig, 
        upsertPolicyRankConfigs, 
        employeeAssignments,
        fetchEmployeeAssignments,
        loading 
    } = useKPI();

    const [selectedView, setSelectedView] = useState<'global' | 'employee' | null>(null);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
    const [editingConfigs, setEditingConfigs] = useState<EditingMap>({});
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchEmployeeAssignments({ status: 'active' });
    }, [fetchEmployeeAssignments]);

    useEffect(() => {
        setEditingConfigs({});
        if (selectedView === 'global') {
            fetchRankConfigs();
        } else if (selectedView === 'employee' && selectedPolicyId) {
            fetchRankConfigs(undefined, selectedPolicyId);
        }
    }, [selectedView, selectedPolicyId, fetchRankConfigs]);

    const handleChange = (rankCode: string, field: keyof KPIRankConfig, value: any) => {
        setEditingConfigs(prev => ({
            ...prev,
            [rankCode]: { ...prev[rankCode], [field]: value, _reset_to_global: false },
        }));
    };

    const getValue = (config: KPIRankConfig, field: keyof KPIRankConfig) => {
        const editing = editingConfigs[config.rank_code];
        if (editing && editing[field] !== undefined) return editing[field];
        return config[field];
    };

    const handleResetToGlobal = (rankCode: string) => {
        setEditingConfigs(prev => ({
            ...prev,
            [rankCode]: { _reset_to_global: true },
        }));
    };

    const handleSaveAll = async () => {
        setSaving(true);
        try {
            if (selectedView === 'global') {
                for (const config of rankConfigs) {
                    const changes = editingConfigs[config.rank_code];
                    if (changes && Object.keys(changes).length > 0) {
                        await updateRankConfig(config.id, changes);
                    }
                }
            } else if (selectedView === 'employee' && selectedPolicyId) {
                const upsertList = Object.entries(editingConfigs)
                    .filter(([, changes]) => Object.keys(changes).length > 0)
                    .map(([rank_code, changes]) => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { _reset_to_global, ...restChanges } = changes;
                        // Include ALL fields from current config to prevent default
                        // values (0) overriding global values when creating new overrides
                        const currentConfig = rankConfigs.find(c => c.rank_code === rank_code);
                        const base = currentConfig ? {
                            rank_name: currentConfig.rank_name,
                            min_score: currentConfig.min_score,
                            max_score: currentConfig.max_score,
                            bonus_amount: currentConfig.bonus_amount,
                            penalty_amount: currentConfig.penalty_amount,
                            commission_factor: currentConfig.commission_factor,
                            sort_order: currentConfig.sort_order,
                        } : {};
                        const payload = {
                            rank_code,
                            ...base,
                            ...restChanges,
                            reset_to_global: _reset_to_global ?? false,
                        };
                        console.log('DEBUG upsert payload:', { rank_code, base, restChanges, payload });
                        return payload;
                    });
                console.log('DEBUG upsertList:', upsertList);
                if (upsertList.length > 0) {
                    await upsertPolicyRankConfigs(selectedPolicyId, upsertList);
                }
            }
            setEditingConfigs({});
            if (selectedView === 'global') {
                await fetchRankConfigs();
            } else if (selectedView === 'employee' && selectedPolicyId) {
                await fetchRankConfigs(undefined, selectedPolicyId);
            }
        } finally {
            setSaving(false);
        }
    };

    const selectedEmployee = employeeAssignments.find(e => e.id === selectedEmployeeId);
    const employeePolicies = selectedEmployee?.assignments
        ?.map(a => a.policy)
        .filter((p): p is NonNullable<typeof p> => p != null) || [];
    const hasChanges = Object.keys(editingConfigs).length > 0;
    const isGlobal = selectedView === 'global';

    const normalizedQuery = removeVietnameseAccents(searchQuery.toLowerCase());
    const filteredEmployees = employeeAssignments.filter(emp => {
        const normalizedName = removeVietnameseAccents(emp.name.toLowerCase());
        const normalizedRole = emp.role ? removeVietnameseAccents(emp.role.toLowerCase()) : '';
        const normalizedDept = emp.department ? removeVietnameseAccents(emp.department.toLowerCase()) : '';
        return normalizedName.includes(normalizedQuery) ||
            normalizedRole.includes(normalizedQuery) ||
            normalizedDept.includes(normalizedQuery);
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold">Cấu hình xếp loại KPI</h3>
                    <p className="text-sm text-muted-foreground">
                        Chọn nhân viên và cấu hình xếp loại cho từng KPI đã gán
                    </p>
                </div>
                {hasChanges && (
                    <Button onClick={handleSaveAll} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Lưu thay đổi
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 items-start">
                {/* Left Sidebar - Global Default + Employee List */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Chọn cấu hình
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="max-h-[480px] overflow-y-auto">
                            {/* Global Default Option */}
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedView('global');
                                    setSelectedEmployeeId(null);
                                    setSelectedPolicyId(null);
                                }}
                                className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b ${
                                    selectedView === 'global'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'hover:bg-muted/50'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4" />
                                    <span className="font-medium">Mặc định toàn cục</span>
                                </div>
                                <div className={`text-xs mt-0.5 ${selectedView === 'global' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                    Áp dụng cho tất cả KPI chưa có cấu hình riêng
                                </div>
                            </button>

                            <Separator />

                            <div className="px-3 py-2 border-b">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder="Tìm nhân viên..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="h-8 pl-8 text-sm"
                                    />
                                </div>
                            </div>

                            {loading && employeeAssignments.length === 0 ? (
                                <div className="p-4 text-center text-muted-foreground text-xs">
                                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                                    Đang tải...
                                </div>
                            ) : employeeAssignments.length === 0 ? (
                                <div className="p-4 text-center text-muted-foreground text-xs">
                                    Không có nhân viên
                                </div>
                            ) : filteredEmployees.length === 0 ? (
                                <div className="p-4 text-center text-muted-foreground text-xs">
                                    Không tìm thấy nhân viên
                                </div>
                            ) : (
                                filteredEmployees.map(emp => (
                                    <button
                                        key={emp.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedView('employee');
                                            setSelectedEmployeeId(emp.id);
                                            const firstPolicy = emp.assignments?.[0]?.policy;
                                            setSelectedPolicyId(firstPolicy?.id || null);
                                        }}
                                        className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b last:border-b-0 ${
                                            selectedEmployeeId === emp.id && selectedView === 'employee'
                                                ? 'bg-primary text-primary-foreground'
                                                : 'hover:bg-muted/50'
                                        }`}
                                    >
                                        <div className="font-medium truncate">{emp.name}</div>
                                        <div className={`text-xs ${selectedEmployeeId === emp.id && selectedView === 'employee' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                            <span className="uppercase">{emp.role}</span>
                                            {emp.department && <span> · {emp.department}</span>}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Right Panel */}
                <div className="space-y-3">
                    {selectedView === null ? (
                        <Card className="p-8 text-center text-muted-foreground">
                            Chọn "Mặc định toàn cục" hoặc một nhân viên để cấu hình KPI
                        </Card>
                    ) : selectedView === 'global' ? (
                        <>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <Globe className="h-4 w-4" />
                                        Mặc định toàn cục
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Cấu hình xếp loại mặc định áp dụng cho tất cả KPI chưa có cấu hình riêng
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <RankConfigTable 
                                        rankConfigs={rankConfigs}
                                        isGlobal={true}
                                        editingConfigs={editingConfigs}
                                        handleChange={handleChange}
                                        getValue={getValue}
                                        handleResetToGlobal={handleResetToGlobal}
                                        loading={loading}
                                    />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Hướng dẫn</CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground space-y-1">
                                    <p><strong>Mặc định toàn cục:</strong> Áp dụng cho tất cả KPI chưa có cấu hình riêng.</p>
                                    <p><strong>Override per KPI:</strong> Chọn nhân viên → chọn tab KPI → chỉnh sửa bất kỳ hàng nào → Lưu. Hàng đó sẽ được đánh dấu <strong className="text-amber-600">override</strong>.</p>
                                    <p><strong>Reset về mặc định:</strong> Nhấn icon <RotateCcw className="h-3 w-3 inline" /> để xóa override.</p>
                                    <p><strong>Hệ số HH (%):</strong> 150 = nhận 150% hoa hồng.</p>
                                </CardContent>
                            </Card>
                        </>
                    ) : selectedView === 'employee' && selectedEmployee ? (
                        <>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">
                                        KPI đã gán cho: {selectedEmployee.name}
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        Chọn tab KPI để cấu hình xếp loại riêng cho từng chính sách
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {employeePolicies.length > 0 && selectedPolicyId ? (
                                        <Tabs 
                                            value={selectedPolicyId} 
                                            onValueChange={setSelectedPolicyId}
                                            className="w-full"
                                        >
                                            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-auto flex-wrap">
                                                {employeePolicies.map(policy => (
                                                    <TabsTrigger 
                                                        key={policy.id} 
                                                        value={policy.id}
                                                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/50 px-4 py-2"
                                                    >
                                                        {policy.name}
                                                    </TabsTrigger>
                                                ))}
                                            </TabsList>

                                            {employeePolicies.map(policy => (
                                                <TabsContent key={policy.id} value={policy.id} className="mt-0">
                                                    <div className="p-4 border-b bg-muted/30">
                                                        <div className="flex items-center gap-2">
                                                            <code className="text-xs bg-muted px-2 py-1 rounded">{policy.code}</code>
                                                            <span className="text-sm text-muted-foreground">{policy.role}</span>
                                                        </div>
                                                    </div>
                                                    <RankConfigTable 
                                                        rankConfigs={rankConfigs}
                                                        isGlobal={false}
                                                        editingConfigs={editingConfigs}
                                                        handleChange={handleChange}
                                                        getValue={getValue}
                                                        handleResetToGlobal={handleResetToGlobal}
                                                        loading={loading}
                                                    />
                                                </TabsContent>
                                            ))}
                                        </Tabs>
                                    ) : (
                                        <div className="p-8 text-center text-muted-foreground">
                                            Nhân viên này chưa có KPI nào được gán
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Hướng dẫn</CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground space-y-1">
                                    <p><strong>Mặc định toàn cục:</strong> Áp dụng cho tất cả KPI chưa có cấu hình riêng.</p>
                                    <p><strong>Override per KPI:</strong> Chọn tab KPI → chỉnh sửa bất kỳ hàng nào → Lưu. Hàng đó sẽ được đánh dấu <strong className="text-amber-600">override</strong>.</p>
                                    <p><strong>Reset về mặc định:</strong> Nhấn icon <RotateCcw className="h-3 w-3 inline" /> để xóa override.</p>
                                    <p><strong>Hệ số HH (%):</strong> 150 = nhận 150% hoa hồng.</p>
                                </CardContent>
                            </Card>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

// Sub-component for rank config table
interface RankConfigTableProps {
    rankConfigs: KPIRankConfig[];
    isGlobal: boolean;
    editingConfigs: EditingMap;
    handleChange: (rankCode: string, field: keyof KPIRankConfig, value: any) => void;
    getValue: (config: KPIRankConfig, field: keyof KPIRankConfig) => any;
    handleResetToGlobal: (rankCode: string) => void;
    loading: boolean;
}

function RankConfigTable({ 
    rankConfigs, 
    isGlobal, 
    editingConfigs, 
    handleChange, 
    getValue, 
    handleResetToGlobal,
    loading 
}: RankConfigTableProps) {
    if (loading && rankConfigs.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Đang tải...
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead className="bg-muted/50 border-b">
                    <tr>
                        <th className="p-3 text-center text-xs font-medium text-muted-foreground w-16">Mã</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Tên</th>
                        <th className="p-3 text-center text-xs font-medium text-muted-foreground">Điểm min</th>
                        <th className="p-3 text-center text-xs font-medium text-muted-foreground">Điểm max</th>
                        <th className="p-3 text-center text-xs font-medium text-muted-foreground">Thưởng (VNĐ)</th>
                        <th className="p-3 text-center text-xs font-medium text-muted-foreground">Phạt (VNĐ)</th>
                        <th className="p-3 text-center text-xs font-medium text-muted-foreground">Hệ số HH (%)</th>
                        {!isGlobal && (
                            <th className="p-3 text-center text-xs font-medium text-muted-foreground w-24">Trạng thái</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {rankConfigs.map(config => {
                        const isOverride = config.is_override === true;
                        const pending = editingConfigs[config.rank_code];
                        const isPendingReset = pending?._reset_to_global === true;
                        const isPendingOverride = !!pending && !isPendingReset;

                        return (
                            <tr
                                key={config.rank_code}
                                className={`border-b transition-colors ${
                                    isPendingReset ? 'bg-red-50/40' :
                                    isPendingOverride ? 'bg-amber-50/40' :
                                    isOverride ? 'bg-blue-50/30' :
                                    'hover:bg-muted/30'
                                }`}
                            >
                                <td className="p-3 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${rankColors[config.rank_code] || 'bg-gray-100'}`}>
                                        {config.rank_code}
                                    </span>
                                </td>
                                <td className="p-3">
                                    <Input
                                        className="h-8 text-sm"
                                        value={getValue(config, 'rank_name') as string}
                                        onChange={e => handleChange(config.rank_code, 'rank_name', e.target.value)}
                                        disabled={isPendingReset}
                                    />
                                </td>
                                <td className="p-3">
                                    <Input
                                        type="number"
                                        className="h-8 text-sm text-center w-20 mx-auto"
                                        value={getValue(config, 'min_score') as number}
                                        onChange={e => handleChange(config.rank_code, 'min_score', Number(e.target.value))}
                                        disabled={isPendingReset}
                                    />
                                </td>
                                <td className="p-3">
                                    <Input
                                        type="number"
                                        className="h-8 text-sm text-center w-20 mx-auto"
                                        value={getValue(config, 'max_score') as number}
                                        onChange={e => handleChange(config.rank_code, 'max_score', Number(e.target.value))}
                                        disabled={isPendingReset}
                                    />
                                </td>
                                <td className="p-3">
                                    <Input
                                        type="text"
                                        className="h-8 text-sm text-center w-28 mx-auto"
                                        value={(getValue(config, 'bonus_amount') as number || 0).toLocaleString('vi-VN')}
                                        onChange={e => {
                                            const num = parseInt(e.target.value.replace(/\D/g, '') || '0', 10);
                                            handleChange(config.rank_code, 'bonus_amount', num);
                                        }}
                                        disabled={isPendingReset}
                                    />
                                </td>
                                <td className="p-3">
                                    <Input
                                        type="text"
                                        className="h-8 text-sm text-center w-28 mx-auto"
                                        value={(getValue(config, 'penalty_amount') as number || 0).toLocaleString('vi-VN')}
                                        onChange={e => {
                                            const num = parseInt(e.target.value.replace(/\D/g, '') || '0', 10);
                                            handleChange(config.rank_code, 'penalty_amount', num);
                                        }}
                                        disabled={isPendingReset}
                                    />
                                </td>
                                <td className="p-3">
                                    <Input
                                        type="number"
                                        className="h-8 text-sm text-center w-20 mx-auto"
                                        value={getValue(config, 'commission_factor') as number}
                                        onChange={e => handleChange(config.rank_code, 'commission_factor', Number(e.target.value))}
                                        step="5"
                                        min="0"
                                        max="500"
                                        disabled={isPendingReset}
                                    />
                                </td>
                                {!isGlobal && (
                                    <td className="p-3 text-center">
                                        {isPendingReset ? (
                                            <Badge variant="destructive" className="text-[10px]">Sẽ reset</Badge>
                                        ) : isOverride || isPendingOverride ? (
                                            <div className="flex flex-col items-center gap-1">
                                                <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100 border-0">override</Badge>
                                                {isOverride && (
                                                    <button
                                                        type="button"
                                                        title="Về mặc định toàn cục"
                                                        onClick={() => handleResetToGlobal(config.rank_code)}
                                                        className="text-muted-foreground hover:text-destructive transition-colors"
                                                    >
                                                        <RotateCcw className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px] text-muted-foreground">mặc định</Badge>
                                        )}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
