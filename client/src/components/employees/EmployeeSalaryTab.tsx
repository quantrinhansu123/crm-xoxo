import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import api, { commissionTablesApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface BonusTier {
    category?: string;
    from_amount: number;
    bonus_percent: number;
    sort_order: number;
}

interface CommissionRule {
    category: string;
    from_amount: number;
    commission_type: string;
    amount?: number;
    sort_order: number;
}

interface DeductionRule {
    name: string;
    condition: string;
    amount: number;
    sort_order: number;
}

interface AllowanceRule {
    name: string;
    type: string;
    amount: number;
    sort_order: number;
}

interface RateValue {
    value: number;
    unit: 'vnd' | 'percent';
}

interface ShiftSalary {
    shift_id: string | 'default';
    base_amount: number;
    saturday_rate: RateValue | null;
    sunday_rate: RateValue | null;
    holiday_rate: RateValue | null;
    tet_rate: RateValue | null;
}

interface OvertimeRates {
    weekday: number;    // Ngày thường
    saturday: number;   // Thứ 7
    sunday: number;     // Chủ nhật
    holiday: number;    // Ngày nghỉ
    tet: number;        // Ngày lễ tết
}

interface SalaryConfig {
    id?: string;
    salary_template: string | null;
    salary_type: string;
    base_amount: number;
    bonus_enabled: boolean;
    bonus_type: string;
    bonus_format: string;
    bonus_scope?: string;
    commission_enabled: boolean;
    commission_rules: CommissionRule[];
    overtime_enabled: boolean;
    overtime_rates: OvertimeRates;
    allowance_enabled: boolean;
    allowance_amount: number;
    allowance_rules: AllowanceRule[];
    deduction_enabled: boolean;
    bonus_tiers: BonusTier[];
    deduction_rules: DeductionRule[];
    shift_salaries: ShiftSalary[];
    shift_saturday_rate: RateValue | null;
    shift_sunday_rate: RateValue | null;
    shift_holiday_rate: RateValue | null;
    shift_tet_rate: RateValue | null;
}

interface Props {
    employeeId: string;
}

const SALARY_TYPES: Record<string, string> = {
    shift: 'Theo ca làm việc',
    hourly: 'Theo giờ làm việc',
    standard_day: 'Theo ngày công chuẩn',
    fixed: 'Cố định',
};

const SALARY_UNIT_LABELS: Record<string, string> = {
    shift: '/ ca',
    hourly: '/ giờ',
    standard_day: '/ Kỳ lương',
    fixed: '/ kỳ lương',
};

const BONUS_TYPES: Record<string, string> = {
    personal_revenue: 'Theo doanh thu cá nhân',
    team_revenue: 'Theo doanh thu nhóm',
    branch_revenue: 'Theo doanh thu chi nhánh/Cửa hàng',
    fixed: 'Thưởng cố định',
};

const BONUS_FORMATS: Record<string, string> = {
    tiered: 'Tính theo nấc bậc thang tổng doanh thu',
    flat_percent: 'Tính theo mức tổng doanh thu',
    service_consulting: 'Tính theo dịch vụ thực hiện - tư vấn bán hàng',
    fixed_amount: 'Thưởng số tiền cố định',
};

const BONUS_CATEGORIES: Record<string, string> = {
    sales_consulting: 'Tư vấn bán hàng',
    service: 'Thực hiện dịch vụ',
    other: 'Khác',
};

const COMMISSION_CATEGORIES: Record<string, string> = {
    sales_consulting: 'Tư vấn bán hàng',
    service: 'Thực hiện dịch vụ',
    other: 'Khác',
};

const COMMISSION_TYPES: Record<string, string> = {
    shared_table: 'Bảng hoa hồng chung',
    fixed_percent: 'Hoa hồng cố định (%)',
    fixed_amount: 'Hoa hồng cố định (VNĐ)',
};

const ALLOWANCE_NAMES: Record<string, string> = {
    food: 'Phụ cấp ăn uống',
    transport: 'Phụ cấp đi lại',
    phone: 'Phụ cấp điện thoại',
    other: 'Khác',
};

const ALLOWANCE_TYPES: Record<string, string> = {
    fixed_day: 'Phụ cấp cố định theo ngày',
    fixed_month: 'Phụ cấp cố định theo tháng',
    other: 'Khác',
};

const DEDUCTION_NAMES: Record<string, string> = {
    late: 'Đi muộn',
    early_leave: 'Về sớm',
    violation: 'Vi phạm nội quy',
    other: 'Khác',
};

const DEDUCTION_TYPES: Record<string, string> = {
    late: 'Đi muộn',
    early_leave: 'Về sớm',
    absent: 'Nghỉ không phép',
    violation: 'Vi phạm',
    other: 'Khác',
};

function fmtMoney(n: number): string {
    if (!n) return '';
    return n.toLocaleString('vi-VN');
}

const DEFAULT_OVERTIME_RATES: OvertimeRates = {
    weekday: 150,
    saturday: 200,
    sunday: 200,
    holiday: 200,
    tet: 300,
};

const OVERTIME_RATE_LABELS: { key: keyof OvertimeRates; label: string }[] = [
    { key: 'weekday', label: 'Ngày thường' },
    { key: 'saturday', label: 'Thứ 7' },
    { key: 'sunday', label: 'Chủ nhật' },
    { key: 'holiday', label: 'Ngày nghỉ' },
    { key: 'tet', label: 'Ngày lễ tết' },
];

const defaultConfig: SalaryConfig = {
    salary_template: null,
    salary_type: 'standard_day',
    base_amount: 0,
    bonus_enabled: false,
    bonus_type: 'personal_revenue',
    bonus_format: 'tiered',
    bonus_scope: 'system',
    commission_enabled: false,
    commission_rules: [],
    overtime_enabled: false,
    overtime_rates: { ...DEFAULT_OVERTIME_RATES },
    allowance_enabled: false,
    allowance_amount: 0,
    allowance_rules: [],
    deduction_enabled: false,
    bonus_tiers: [],
    deduction_rules: [],
    shift_salaries: [],
    shift_saturday_rate: null,
    shift_sunday_rate: null,
    shift_holiday_rate: { value: 100, unit: 'percent' },
    shift_tet_rate: { value: 100, unit: 'percent' },
};

const RateCell = ({ value, onChange }: { value: RateValue | null, onChange: (v: RateValue | null) => void }) => {
    const [open, setOpen] = useState(false);
    const [tempValue, setTempValue] = useState<number>(value?.value || 0);
    const [tempUnit, setTempUnit] = useState<'vnd' | 'percent'>(value?.unit || 'percent');

    useEffect(() => {
        if (open) {
            setTempValue(value?.value || 0);
            setTempUnit(value?.unit || 'percent');
        }
    }, [open, value]);

    if (!value) {
        return (
            <td className="px-4 py-2.5 text-center cursor-pointer hover:bg-gray-50 group" onClick={() => onChange({ value: 100, unit: 'percent' })}>
                <span className="text-gray-400 font-bold group-hover:text-blue-500">+</span>
            </td>
        );
    }

    const displayText = value.unit === 'percent' ? `${value.value}%` : fmtMoney(value.value);

    return (
        <td className="px-4 py-2.5">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <div className="flex items-center justify-center border border-gray-200 rounded px-2 py-1 cursor-pointer hover:border-blue-400 min-w-[70px] bg-white transition-colors">
                        <span className="text-[12px]">{displayText}</span>
                    </div>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-4 rounded-xl shadow-xl border-gray-100" align="center">
                    <div className="space-y-4">
                        <div className="flex items-center border border-gray-200 rounded-lg bg-gray-50/50 overflow-hidden px-1 py-1">
                            <input
                                type="text"
                                className="flex-1 min-w-0 w-0 bg-transparent border-none outline-none px-3 py-1.5 text-right font-medium text-[14px]"
                                value={tempUnit === 'vnd' ? fmtMoney(tempValue) : tempValue}
                                onChange={e => {
                                    const raw = e.target.value.replace(/[^\d]/g, '');
                                    setTempValue(parseInt(raw) || 0);
                                }}
                                autoFocus
                            />
                            <div className="flex items-center bg-gray-100 rounded-md p-1 ml-2">
                                <button
                                    className={cn(
                                        "px-2.5 py-1 text-[11px] font-bold rounded transition-all",
                                        tempUnit === 'vnd' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                                    )}
                                    onClick={() => setTempUnit('vnd')}
                                >
                                    VND
                                </button>
                                <button
                                    className={cn(
                                        "px-2.5 py-1 text-[11px] font-bold rounded transition-all",
                                        tempUnit === 'percent' ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-gray-600"
                                    )}
                                    onClick={() => setTempUnit('percent')}
                                >
                                    %
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 px-4 text-gray-400 hover:text-red-500 hover:bg-red-50 border-gray-200 bg-white"
                                onClick={() => {
                                    onChange(null);
                                    setOpen(false);
                                }}
                            >
                                Xóa
                            </Button>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 px-4 border-gray-200 bg-white text-gray-600 font-medium"
                                    onClick={() => setOpen(false)}
                                >
                                    Bỏ qua
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                    onClick={() => {
                                        onChange({ value: tempValue, unit: tempUnit });
                                        setOpen(false);
                                    }}
                                >
                                    Xong
                                </Button>
                            </div>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </td>
    );
};

export function EmployeeSalaryTab({ employeeId }: Props) {
    const [config, setConfig] = useState<SalaryConfig>({ ...defaultConfig });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAdvancedSalary, setShowAdvancedSalary] = useState(false);
    const [availableShifts, setAvailableShifts] = useState<{ id: string; name: string }[]>([]);
    
    // Commission Table States
    const [isCommissionDialogOpen, setIsCommissionDialogOpen] = useState(false);
    const [commissionTables, setCommissionTables] = useState<any[]>([]);
    const [newCommTable, setNewCommTable] = useState({
        name: '',
        scope: 'system',
        branch: 'none',
        status: 'active'
    });
    const [currentRuleIndex, setCurrentRuleIndex] = useState<number | null>(null);

    const fetchShifts = useCallback(async () => {
        try {
            const res = await api.get('/work-schedules/shifts');
            setAvailableShifts(res.data?.data?.shifts || []);
        } catch (err) {
            console.error('Lỗi khi tải danh sách ca:', err);
        }
    }, []);

    const fetchCommissionTables = useCallback(async () => {
        try {
            const res = await commissionTablesApi.getAll();
            setCommissionTables(res.data?.data?.tables || []);
        } catch (err) {
            console.error('Lỗi khi tải bảng hoa hồng:', err);
        }
    }, []);

    useEffect(() => { 
        fetchShifts(); 
        fetchCommissionTables();
    }, [fetchShifts, fetchCommissionTables]);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/salary-configs/${employeeId}`);
            const c = res.data?.data?.config;
            if (c) {
                setConfig({
                    id: c.id,
                    salary_template: c.salary_template,
                    salary_type: c.salary_type || 'standard_day',
                    base_amount: c.base_amount || 0,
                    bonus_enabled: c.bonus_type !== 'none' && !!c.bonus_type,
                    bonus_type: c.bonus_type && c.bonus_type !== 'none' ? c.bonus_type : 'personal_revenue',
                    bonus_format: c.bonus_format || 'tiered',
                    bonus_scope: c.bonus_scope || 'system',
                    commission_enabled: !!c.commission_enabled,
                    commission_rules: (c.commission_rules || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)),
                    overtime_enabled: !!c.overtime_enabled,
                    overtime_rates: c.overtime_rates ? { ...DEFAULT_OVERTIME_RATES, ...c.overtime_rates } : { ...DEFAULT_OVERTIME_RATES },
                    allowance_enabled: !!c.allowance_enabled,
                    allowance_amount: c.allowance_amount || 0,
                    allowance_rules: (c.allowance_rules || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)),
                    deduction_enabled: (c.deduction_rules || []).length > 0,
                    bonus_tiers: (c.bonus_tiers || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)),
                    deduction_rules: (c.deduction_rules || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)),
                    shift_salaries: c.shift_salaries || [],
                    shift_saturday_rate: c.shift_saturday_rate,
                    shift_sunday_rate: c.shift_sunday_rate,
                    shift_holiday_rate: c.shift_holiday_rate,
                    shift_tet_rate: c.shift_tet_rate,
                });
            } else {
                setConfig({ ...defaultConfig });
            }
        } catch (err) {
            console.error('Lỗi khi tải cấu hình lương:', err);
        } finally {
            setLoading(false);
        }
    }, [employeeId]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleSave = async () => {
        const invalidFixedCommission = config.commission_enabled && config.commission_rules.some(rule =>
            ['fixed_percent', 'fixed_amount'].includes(rule.commission_type) && (!rule.amount || rule.amount <= 0)
        );
        if (invalidFixedCommission) {
            toast.error('Hoa hồng cố định phải nhập giá trị > 0');
            return;
        }

        setSaving(true);
        try {
            await api.put(`/salary-configs/${employeeId}`, {
                ...config,
                bonus_type: config.bonus_enabled ? config.bonus_type : 'none',
                bonus_scope: config.bonus_scope || 'system',
                commission_enabled: config.commission_enabled,
                commission_rules: config.commission_enabled ? config.commission_rules : [],
                overtime_enabled: config.overtime_enabled,
                overtime_rates: config.overtime_enabled ? config.overtime_rates : null,
                allowance_enabled: config.allowance_enabled,
                allowance_amount: config.allowance_amount,
                allowance_rules: config.allowance_enabled ? config.allowance_rules : [],
                bonus_tiers: config.bonus_tiers,
                deduction_rules: config.deduction_enabled ? config.deduction_rules : [],
            });
            toast.success('Đã cập nhật thiết lập lương!');
            await fetchConfig();
        } catch {
            toast.error('Lỗi khi lưu thiết lập lương');
        } finally {
            setSaving(false);
        }
    };

    // ── Shift salary helpers ──
    const addShiftSalary = () => {
        setConfig(prev => ({
            ...prev,
            shift_salaries: [
                ...prev.shift_salaries,
                { shift_id: '', base_amount: 0, saturday_rate: null, sunday_rate: null, holiday_rate: null, tet_rate: null }
            ]
        }));
    };

    const toggleAdvanced = (val: boolean) => {
        setShowAdvancedSalary(val);
    };

    const updateShiftSalary = (index: number, field: keyof ShiftSalary, value: any) => {
        setConfig(prev => {
            const list = [...prev.shift_salaries];
            list[index] = { ...list[index], [field]: value };
            return { ...prev, shift_salaries: list };
        });
    };

    const removeShiftSalary = (index: number) => {
        setConfig(prev => ({
            ...prev,
            shift_salaries: prev.shift_salaries.filter((_, i) => i !== index),
        }));
    };

    // ── Bonus tier helpers ──
    const addBonusTier = () => {
        const lastTier = config.bonus_tiers[config.bonus_tiers.length - 1];
        setConfig(prev => ({
            ...prev,
            bonus_tiers: [
                ...prev.bonus_tiers,
                { from_amount: lastTier ? lastTier.from_amount + 20000000 : 0, bonus_percent: 0, sort_order: prev.bonus_tiers.length },
            ],
        }));
    };

    const updateBonusTier = (index: number, field: keyof BonusTier, value: string | number) => {
        setConfig(prev => {
            const tiers = [...prev.bonus_tiers];
            tiers[index] = { ...tiers[index], [field]: value };
            return { ...prev, bonus_tiers: tiers };
        });
    };

    const removeBonusTier = (index: number) => {
        setConfig(prev => ({
            ...prev,
            bonus_tiers: prev.bonus_tiers.filter((_, i) => i !== index),
        }));
    };

    // ── Deduction rule helpers ──
    const addDeductionRule = () => {
        setConfig(prev => ({
            ...prev,
            deduction_rules: [
                ...prev.deduction_rules,
                { name: 'late', condition: 'late', amount: 0, sort_order: prev.deduction_rules.length },
            ],
        }));
    };

    const updateDeductionRule = (index: number, field: keyof DeductionRule, value: string | number) => {
        setConfig(prev => {
            const rules = [...prev.deduction_rules];
            rules[index] = { ...rules[index], [field]: value };
            return { ...prev, deduction_rules: rules };
        });
    };

    const removeDeductionRule = (index: number) => {
        setConfig(prev => ({
            ...prev,
            deduction_rules: prev.deduction_rules.filter((_, i) => i !== index),
        }));
    };

    // ── Allowance rule helpers ──
    const addAllowanceRule = () => {
        setConfig(prev => ({
            ...prev,
            allowance_rules: [
                ...prev.allowance_rules,
                { name: 'food', type: 'fixed_day', amount: 0, sort_order: prev.allowance_rules.length },
            ],
        }));
    };

    const updateAllowanceRule = (index: number, field: keyof AllowanceRule, value: string | number) => {
        setConfig(prev => {
            const rules = [...prev.allowance_rules];
            rules[index] = { ...rules[index], [field]: value };
            return { ...prev, allowance_rules: rules };
        });
    };

    const removeAllowanceRule = (index: number) => {
        setConfig(prev => ({
            ...prev,
            allowance_rules: prev.allowance_rules.filter((_, i) => i !== index),
        }));
    };

    // ── Commission rule helpers ──
    const addCommissionRule = () => {
        setConfig(prev => ({
            ...prev,
            commission_rules: [
                ...prev.commission_rules,
                { category: 'sales_consulting', from_amount: 0, commission_type: 'shared_table', amount: 0, sort_order: prev.commission_rules.length },
            ],
        }));
    };

    const updateCommissionRule = (index: number, field: keyof CommissionRule, value: string | number) => {
        setConfig(prev => {
            const rules = [...prev.commission_rules];
            rules[index] = { ...rules[index], [field]: value };
            return { ...prev, commission_rules: rules };
        });
    };

    const removeCommissionRule = (index: number) => {
        setConfig(prev => ({
            ...prev,
            commission_rules: prev.commission_rules.filter((_, i) => i !== index),
        }));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="p-5 pb-0 space-y-4 text-[13px]">
            {/* ═══════════ Section: Lương chính ═══════════ */}
            <div className="border border-gray-200 rounded-lg bg-white">
                <div className="px-5 py-3 bg-gray-50 rounded-t-lg border-b border-gray-200">
                    <h3 className="font-bold text-[14px] text-gray-800">Lương chính</h3>
                </div>
                <div className="px-5 py-4 space-y-4">
                    {/* Loại lương */}
                    <div className="flex items-center gap-4">
                        <label className="text-gray-600 w-[100px] shrink-0">Loại lương</label>
                        <div className="flex items-center gap-2">
                            <Select
                                value={config.salary_type}
                                onValueChange={(v) => {
                                    setConfig(prev => ({
                                        ...prev,
                                        salary_type: v,
                                        base_amount: 0,
                                        shift_salaries: [],
                                        shift_saturday_rate: null,
                                        shift_sunday_rate: null,
                                        shift_holiday_rate: { value: 100, unit: 'percent' },
                                        shift_tet_rate: { value: 100, unit: 'percent' },
                                    }));
                                    setShowAdvancedSalary(false);
                                }}
                            >
                                <SelectTrigger className="w-[240px] h-9 text-[13px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(SALARY_TYPES).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Info className="h-4 w-4 text-gray-400 cursor-help" />
                        </div>
                    </div>

                    {/* Mức lương */}
                    {!( ['shift', 'hourly', 'standard_day'].includes(config.salary_type) && showAdvancedSalary) && (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <label className="text-gray-600 w-[100px] shrink-0">Mức lương</label>
                                <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
                                    <input
                                        type="text"
                                        className="px-3 py-1.5 w-[180px] text-right bg-white focus:outline-none text-[13px]"
                                        value={fmtMoney(config.base_amount)}
                                        onChange={e => {
                                            const raw = e.target.value.replace(/[^\d]/g, '');
                                            setConfig(prev => ({ ...prev, base_amount: parseInt(raw) || 0 }));
                                        }}
                                    />
                                    <span className="px-3 py-1.5 bg-gray-50 text-gray-500 text-[13px] border-l border-gray-200">
                                        {SALARY_UNIT_LABELS[config.salary_type] || '/ kỳ lương'}
                                    </span>
                                </div>
                            </div>
                            {['shift', 'hourly', 'standard_day'].includes(config.salary_type) && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500 text-[12px]">Thiết lập nâng cao</span>
                                    <Switch
                                        checked={showAdvancedSalary}
                                        onCheckedChange={toggleAdvanced}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Advanced Shift Salary Table */}
                    {['shift', 'hourly', 'standard_day'].includes(config.salary_type) && showAdvancedSalary && (
                        <div className="border border-gray-200 rounded-lg overflow-hidden mt-4">
                            <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                <span className="font-bold text-gray-700">Mức lương</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500 text-[12px]">Thiết lập nâng cao</span>
                                    <Switch
                                        checked={showAdvancedSalary}
                                        onCheckedChange={toggleAdvanced}
                                    />
                                </div>
                            </div>
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Ca</th>
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">
                                            {config.salary_type === 'hourly' ? 'Lương/giờ' : (config.salary_type === 'standard_day' ? 'Lương/Kỳ' : 'Lương/ca')}
                                        </th>
                                        <th className="text-center px-4 py-2.5 font-semibold text-gray-600">Thứ 7</th>
                                        <th className="text-center px-4 py-2.5 font-semibold text-gray-600">Chủ nhật</th>
                                        <th className="text-center px-4 py-2.5 font-semibold text-gray-600">Ngày nghỉ</th>
                                        <th className="text-center px-4 py-2.5 font-semibold text-gray-600">Ngày lễ tết</th>
                                        <th className="w-[50px]"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Default Row */}
                                    <tr className="border-t border-gray-100">
                                        <td className="px-4 py-2.5 font-medium text-gray-700 italic">Mặc định</td>
                                        <td className="px-4 py-2.5">
                                            <input
                                                type="text"
                                                className="border border-gray-200 rounded px-2 py-1 w-full text-right"
                                                value={fmtMoney(config.base_amount)}
                                                onChange={e => {
                                                    const raw = e.target.value.replace(/[^\d]/g, '');
                                                    setConfig(prev => ({ ...prev, base_amount: parseInt(raw) || 0 }));
                                                }}
                                            />
                                        </td>
                                        <RateCell value={config.shift_saturday_rate} onChange={v => setConfig(prev => ({ ...prev, shift_saturday_rate: v }))} />
                                        <RateCell value={config.shift_sunday_rate} onChange={v => setConfig(prev => ({ ...prev, shift_sunday_rate: v }))} />
                                        <RateCell value={config.shift_holiday_rate} onChange={v => setConfig(prev => ({ ...prev, shift_holiday_rate: v }))} />
                                        <RateCell value={config.shift_tet_rate} onChange={v => setConfig(prev => ({ ...prev, shift_tet_rate: v }))} />
                                        <td className="px-4 py-2.5"></td>
                                    </tr>
                                    {/* Specific Shift Rows */}
                                    {config.shift_salaries.map((s, idx) => (
                                        <tr key={idx} className="border-t border-gray-100">
                                            <td className="px-4 py-2.5">
                                                <Select
                                                    value={s.shift_id}
                                                    onValueChange={v => updateShiftSalary(idx, 'shift_id', v)}
                                                >
                                                    <SelectTrigger className="w-full h-8 text-[12px]">
                                                        <SelectValue placeholder="Chọn ca" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {availableShifts.map(shift => (
                                                            <SelectItem key={shift.id} value={shift.id}>
                                                                {shift.name}
                                                            </SelectItem>
                                                        ))}
                                                        <div className="border-t border-gray-100 mt-1 pt-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="w-full justify-start text-blue-600 text-[12px] h-8 px-2"
                                                                onClick={() => toast.info('Chế độ thêm ca mới sắp ra mắt')}
                                                            >
                                                                <Plus className="h-3 w-3 mr-1" /> Thêm ca
                                                            </Button>
                                                        </div>
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <input
                                                    type="text"
                                                    className="border border-gray-200 rounded px-2 py-1 w-full text-right"
                                                    value={fmtMoney(s.base_amount)}
                                                    onChange={e => {
                                                        const raw = e.target.value.replace(/[^\d]/g, '');
                                                        updateShiftSalary(idx, 'base_amount', parseInt(raw) || 0);
                                                    }}
                                                />
                                            </td>
                                            <RateCell value={s.saturday_rate} onChange={v => updateShiftSalary(idx, 'saturday_rate', v)} />
                                            <RateCell value={s.sunday_rate} onChange={v => updateShiftSalary(idx, 'sunday_rate', v)} />
                                            <RateCell value={s.holiday_rate} onChange={v => updateShiftSalary(idx, 'holiday_rate', v)} />
                                            <RateCell value={s.tet_rate} onChange={v => updateShiftSalary(idx, 'tet_rate', v)} />
                                            <td className="px-4 py-2.5 pl-1 italic text-gray-400">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-gray-400 hover:text-red-500"
                                                    onClick={() => removeShiftSalary(idx)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Add More Row */}
                                    <tr className="border-t border-gray-100">
                                        <td colSpan={7} className="px-4 py-3">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-blue-600 hover:text-blue-700 hover:bg-transparent text-[13px] h-auto p-0 font-medium"
                                                onClick={addShiftSalary}
                                            >
                                                Thêm điều kiện
                                            </Button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Lương làm thêm giờ */}
                    {config.salary_type !== 'hourly' && (
                        <>
                            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                                <span className="text-gray-600">Lương làm thêm giờ</span>
                                <Switch
                                    checked={config.overtime_enabled}
                                    onCheckedChange={(v) => setConfig(prev => ({ ...prev, overtime_enabled: v }))}
                                />
                            </div>

                            {/* Overtime rates table */}
                            {config.overtime_enabled && (
                                <div className="border-t border-gray-100 pt-4">
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="bg-gray-50">
                                            <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-[160px]"></th>
                                            {OVERTIME_RATE_LABELS.map(({ label }) => (
                                                <th key={label} className="text-center px-3 py-2.5 font-semibold text-gray-600">{label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-t border-gray-100">
                                            <td className="px-4 py-2.5 text-gray-600">Hệ số lương trên giờ</td>
                                            {OVERTIME_RATE_LABELS.map(({ key }) => (
                                                <td key={key} className="px-3 py-2.5 text-center">
                                                    <div className="flex items-center justify-center">
                                                        <input
                                                            type="number"
                                                            className="border border-gray-200 rounded-md px-3 py-1.5 w-[80px] text-center bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-[13px]"
                                                            value={config.overtime_rates[key]}
                                                            onChange={e => {
                                                                const val = parseInt(e.target.value) || 0;
                                                                setConfig(prev => ({
                                                                    ...prev,
                                                                    overtime_rates: { ...prev.overtime_rates, [key]: val },
                                                                }));
                                                            }}
                                                        />
                                                        <span className="ml-1 text-gray-500">%</span>
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                        </>
                    )}
                </div>
            </div>

            {/* ═══════════ Section: Mẫu lương ═══════════ */}
            <div className="border border-gray-200 rounded-lg bg-white">
                <div className="px-5 py-4 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-[14px] text-gray-800">Mẫu lương</h3>
                        <Info className="h-4 w-4 text-gray-400 cursor-help" />
                    </div>
                    <Select
                        value={config.salary_template || 'none'}
                        onValueChange={(v) => {
                            if (v === 'manager_template') {
                                setConfig({
                                    ...defaultConfig,
                                    salary_template: 'manager_template',
                                    salary_type: 'standard_day',
                                    base_amount: 20000,
                                    bonus_enabled: true,
                                    bonus_type: 'branch_revenue',
                                    bonus_format: 'flat_percent',
                                    bonus_scope: 'system',
                                    bonus_tiers: [{ from_amount: 50000000, bonus_percent: 1, sort_order: 0 }],
                                    allowance_enabled: true,
                                    allowance_rules: [{ name: 'food', type: 'fixed_day', amount: 50000, sort_order: 0 }],
                                    deduction_enabled: true,
                                    deduction_rules: [{ name: 'late', condition: 'late', amount: 20000, sort_order: 0 }],
                                    overtime_enabled: false,
                                    commission_enabled: false,
                                    commission_rules: [],
                                });
                                setShowAdvancedSalary(false);
                            } else if (v === 'cashier_template') {
                                setConfig({
                                    ...defaultConfig,
                                    salary_template: 'cashier_template',
                                    salary_type: 'standard_day',
                                    base_amount: 20000,
                                    bonus_enabled: true,
                                    bonus_type: 'personal_revenue',
                                    bonus_format: 'service_consulting',
                                    bonus_tiers: [{ category: 'sales_consulting', from_amount: 20000000, bonus_percent: 0.5, sort_order: 0 }],
                                    commission_enabled: true,
                                    commission_rules: [{ category: 'sales_consulting', from_amount: 500000, commission_type: 'shared_table', sort_order: 0 }],
                                    allowance_enabled: true,
                                    allowance_rules: [{ name: 'food', type: 'fixed_day', amount: 50000, sort_order: 0 }],
                                    deduction_enabled: true,
                                    deduction_rules: [{ name: 'late', condition: 'late', amount: 20000, sort_order: 0 }],
                                    overtime_enabled: false,
                                });
                                setShowAdvancedSalary(false);
                                } else if (v === 'accountant_template') {
                                    setConfig({
                                        ...defaultConfig,
                                        salary_template: 'accountant_template',
                                        salary_type: 'standard_day',
                                        base_amount: 20000,
                                        bonus_enabled: false,
                                        allowance_enabled: true,
                                        allowance_rules: [{ name: 'food', type: 'fixed_day', amount: 50000, sort_order: 0 }],
                                        deduction_enabled: true,
                                        deduction_rules: [{ name: 'late', condition: 'late', amount: 20000, sort_order: 0 }],
                                        overtime_enabled: true,
                                        commission_enabled: false,
                                        commission_rules: [],
                                    });
                                    setShowAdvancedSalary(false);
                                } else if (v === 'service_employee_template') {
                                    setConfig({
                                        ...defaultConfig,
                                        salary_template: 'service_employee_template',
                                        salary_type: 'standard_day',
                                        base_amount: 20000,
                                        bonus_enabled: true,
                                        bonus_type: 'personal_revenue',
                                        bonus_format: 'service_consulting',
                                        bonus_tiers: [{ category: 'service', from_amount: 15000000, bonus_percent: 3, sort_order: 0 }],
                                        commission_enabled: true,
                                        commission_rules: [{ category: 'service', from_amount: 2000000, commission_type: 'shared_table', sort_order: 0 }],
                                        allowance_enabled: true,
                                        allowance_rules: [{ name: 'food', type: 'fixed_day', amount: 50000, sort_order: 0 }],
                                        deduction_enabled: true,
                                        deduction_rules: [{ name: 'late', condition: 'late', amount: 20000, sort_order: 0 }],
                                        overtime_enabled: false,
                                    });
                                    setShowAdvancedSalary(false);
                                } else {
                                setConfig(prev => ({ ...prev, salary_template: v === 'none' ? null : v }));
                            }
                        }}
                    >
                        <SelectTrigger className="w-[280px] h-9 text-[13px]">
                            <SelectValue placeholder="Chọn mẫu lương có sẵn" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Chọn mẫu lương có sẵn</SelectItem>
                            <SelectItem value="manager_template">Mẫu lương quản lý</SelectItem>
                            <SelectItem value="cashier_template">Mẫu lương thu ngân</SelectItem>
                            <SelectItem value="accountant_template">Mẫu lương kế toán</SelectItem>
                            <SelectItem value="service_employee_template">Mẫu lương nhân viên làm dịch vụ</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* ═══════════ Section: Thưởng ═══════════ */}
            <div className="border border-gray-200 rounded-lg bg-white">
                <div className="px-5 py-4 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-[14px] text-gray-800">Thưởng</h3>
                        <p className="text-gray-400 text-[12px] mt-0.5">Thiết lập thưởng theo doanh thu cho nhân viên</p>
                    </div>
                    <Switch
                        checked={config.bonus_enabled}
                        onCheckedChange={(v) => setConfig(prev => ({ ...prev, bonus_enabled: v }))}
                    />
                </div>

                {config.bonus_enabled && (
                    <div className="px-5 pb-4 space-y-4 border-t border-gray-100 pt-4">
                        {/* Loại thưởng + Hình thức */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-gray-600 text-[12px] block mb-1.5">Loại thưởng</label>
                                <Select
                                    value={config.bonus_type}
                                    onValueChange={(v) => setConfig(prev => ({ ...prev, bonus_type: v }))}
                                >
                                    <SelectTrigger className="w-full h-9 text-[13px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(BONUS_TYPES).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-gray-600 text-[12px] block mb-1.5 flex items-center gap-1">
                                    Hình thức <Info className="h-3.5 w-3.5 text-gray-400" />
                                </label>
                                <Select
                                    value={config.bonus_format}
                                    onValueChange={(v) => setConfig(prev => ({ ...prev, bonus_format: v }))}
                                >
                                    <SelectTrigger className="w-full h-9 text-[13px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(BONUS_FORMATS).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {config.bonus_type === 'branch_revenue' && (
                            <div>
                                <label className="text-gray-600 text-[12px] block mb-1.5">Phạm vi</label>
                                <div className="flex items-center gap-6 mt-1">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="bonus_scope"
                                            value="branch"
                                            checked={config.bonus_scope === 'branch'}
                                            onChange={() => setConfig(prev => ({ ...prev, bonus_scope: 'branch' }))}
                                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className="text-[13px] text-gray-700">Chi nhánh</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="bonus_scope"
                                            value="system"
                                            checked={config.bonus_scope === 'system'}
                                            onChange={() => setConfig(prev => ({ ...prev, bonus_scope: 'system' }))}
                                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className="text-[13px] text-gray-700">Toàn hệ thống</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Bonus tiers table */}
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Loại hình</th>
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">
                                            <div className="flex items-center gap-1">
                                                Doanh thu <Info className="h-3.5 w-3.5 text-gray-400" />
                                            </div>
                                        </th>
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Thưởng</th>
                                        <th className="w-[50px]"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {config.bonus_tiers.map((tier, i) => (
                                        <tr key={i} className="border-t border-gray-100">
                                            <td className="px-4 py-2.5">
                                                <Select value={tier.category || 'sales_consulting'} onValueChange={(v) => updateBonusTier(i, 'category', v)}>
                                                    <SelectTrigger className="w-[200px] h-9 text-[13px] bg-white border-gray-200">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.entries(BONUS_CATEGORIES).map(([k, v]) => (
                                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">Từ</span>
                                                    <input
                                                        type="text"
                                                        className="border border-gray-200 rounded-md px-3 py-1.5 w-[150px] text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-[13px]"
                                                        value={fmtMoney(tier.from_amount)}
                                                        onChange={e => {
                                                            const raw = e.target.value.replace(/[^\d]/g, '');
                                                            updateBonusTier(i, 'from_amount', parseInt(raw) || 0);
                                                        }}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        className="border border-gray-200 rounded-md px-3 py-1.5 w-[60px] text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-[13px]"
                                                        value={tier.bonus_percent}
                                                        onChange={e => updateBonusTier(i, 'bonus_percent', parseFloat(e.target.value) || 0)}
                                                    />
                                                    <span className="text-gray-500">% Doanh thu</span>
                                                </div>
                                            </td>
                                            <td className="px-2 py-2.5 text-center">
                                                <button
                                                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                                    onClick={() => removeBonusTier(i)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="px-4 py-2.5 border-t border-gray-100">
                                <button
                                    className="text-blue-600 hover:text-blue-700 text-[13px] font-medium"
                                    onClick={addBonusTier}
                                >
                                    Thêm thưởng
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══════════ Section: Hoa hồng ═══════════ */}
            <div className="border border-gray-200 rounded-lg bg-white">
                <div className="px-5 py-4 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-[14px] text-gray-800">Hoa hồng</h3>
                        <p className="text-gray-400 text-[12px] mt-0.5">Thiết lập mức hoa hồng theo sản phẩm hoặc dịch vụ</p>
                    </div>
                    <Switch
                        checked={config.commission_enabled}
                        onCheckedChange={(v) => setConfig(prev => ({ ...prev, commission_enabled: v }))}
                    />
                </div>
                {config.commission_enabled && (
                    <div className="p-5 pt-0 border-t border-gray-100">
                        <div className="border border-gray-200 rounded-lg overflow-hidden mt-4">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Loại hình</th>
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">
                                            <div className="flex items-center gap-1">
                                                Doanh thu <Info className="h-3.5 w-3.5 text-gray-400" />
                                            </div>
                                        </th>
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Hoa hồng thụ hưởng</th>
                                        <th className="w-[50px]"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {config.commission_rules.map((rule, i) => (
                                        <tr key={i} className="border-t border-gray-100">
                                            <td className="px-4 py-2.5">
                                                <Select value={rule.category || 'sales_consulting'} onValueChange={(v) => updateCommissionRule(i, 'category', v)}>
                                                    <SelectTrigger className="w-[200px] h-9 text-[13px] bg-white border-gray-200">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.entries(COMMISSION_CATEGORIES).map(([k, v]) => (
                                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">Từ</span>
                                                    <input
                                                        type="text"
                                                        className="border border-gray-200 rounded-md px-3 py-1.5 w-[150px] text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-[13px]"
                                                        value={fmtMoney(rule.from_amount)}
                                                        onChange={e => {
                                                            const raw = e.target.value.replace(/[^\d]/g, '');
                                                            updateCommissionRule(i, 'from_amount', parseInt(raw) || 0);
                                                        }}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <Select 
                                                        value={rule.commission_type || 'shared_table'} 
                                                        onValueChange={(v) => {
                                                            if (v === 'add_new_commission_table') {
                                                                setCurrentRuleIndex(i);
                                                                setIsCommissionDialogOpen(true);
                                                            } else {
                                                                updateCommissionRule(i, 'commission_type', v);
                                                            }
                                                        }}
                                                    >
                                                        <SelectTrigger className="w-[200px] h-9 text-[13px] bg-white border-gray-200">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {(!commissionTables.some(t => t.id === 'shared_table' || t.id === 'common')) && (
                                                                <SelectItem value="shared_table">Bảng hoa hồng chung</SelectItem>
                                                            )}
                                                            {commissionTables.map(table => (
                                                                <SelectItem key={table.id} value={table.id}>{table.name}</SelectItem>
                                                            ))}
                                                            {Object.entries(COMMISSION_TYPES).filter(([k]) => k !== 'shared_table').map(([k, v]) => (
                                                                <SelectItem key={k} value={k}>{v}</SelectItem>
                                                            ))}
                                                            <div className="border-t border-gray-100 mt-1 pt-1">
                                                                <SelectItem value="add_new_commission_table" className="text-blue-600 font-medium cursor-pointer">
                                                                    + Thêm bảng hoa hồng
                                                                </SelectItem>
                                                            </div>
                                                        </SelectContent>
                                                    </Select>
                                                    {['fixed_percent', 'fixed_amount'].includes(rule.commission_type) && (
                                                        <div className="flex items-center border border-gray-200 rounded-md bg-white overflow-hidden">
                                                            <input
                                                                type="text"
                                                                className="w-[90px] px-3 py-1.5 text-right text-[13px] outline-none"
                                                                value={rule.commission_type === 'fixed_amount' ? fmtMoney(rule.amount || 0) : (rule.amount || '')}
                                                                onChange={e => {
                                                                    const raw = e.target.value.replace(/[^\d]/g, '');
                                                                    updateCommissionRule(i, 'amount', parseInt(raw) || 0);
                                                                }}
                                                                placeholder="> 0"
                                                            />
                                                            <span className="px-2 text-[12px] text-gray-500 bg-gray-50 border-l border-gray-100">
                                                                {rule.commission_type === 'fixed_percent' ? '%' : 'đ'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-2 py-2.5 text-center">
                                                <button
                                                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                                    onClick={() => removeCommissionRule(i)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="px-4 py-2.5 border-t border-gray-100">
                                <button
                                    className="text-blue-600 hover:text-blue-700 text-[13px] font-medium"
                                    onClick={addCommissionRule}
                                >
                                    Thêm hoa hồng
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══════════ Section: Phụ cấp ═══════════ */}
            <div className="border border-gray-200 rounded-lg bg-white">
                <div className="px-5 py-4 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-[14px] text-gray-800">Phụ cấp</h3>
                        <p className="text-gray-400 text-[12px] mt-0.5">Thiết lập khoản hỗ trợ làm việc như ăn trưa, đi lại, điện thoại, ...</p>
                    </div>
                    <Switch
                        checked={config.allowance_enabled}
                        onCheckedChange={(v) => setConfig(prev => ({ ...prev, allowance_enabled: v }))}
                    />
                </div>
                {config.allowance_enabled && (
                    <div className="px-5 pb-4 border-t border-gray-100 pt-4">
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Tên phụ cấp</th>
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Loại phụ cấp</th>
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Phụ cấp thụ hưởng</th>
                                        <th className="w-[50px]"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {config.allowance_rules.map((rule, i) => (
                                        <tr key={i} className="border-t border-gray-100">
                                            <td className="px-4 py-2.5">
                                                <Select
                                                    value={rule.name || 'food'}
                                                    onValueChange={(v) => updateAllowanceRule(i, 'name', v)}
                                                >
                                                    <SelectTrigger className="w-[180px] h-9 text-[13px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.entries(ALLOWANCE_NAMES).map(([k, v]) => (
                                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <Select
                                                    value={rule.type || 'fixed_day'}
                                                    onValueChange={(v) => updateAllowanceRule(i, 'type', v)}
                                                >
                                                    <SelectTrigger className="w-[200px] h-9 text-[13px] flex justify-between items-center">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.entries(ALLOWANCE_TYPES).map(([k, v]) => (
                                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <input
                                                    type="text"
                                                    className="border border-gray-200 rounded-md px-3 py-1.5 w-full text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-[13px]"
                                                    value={fmtMoney(rule.amount)}
                                                    onChange={e => {
                                                        const raw = e.target.value.replace(/[^\d]/g, '');
                                                        updateAllowanceRule(i, 'amount', parseInt(raw) || 0);
                                                    }}
                                                />
                                            </td>
                                            <td className="px-2 py-2.5 text-center">
                                                <button
                                                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                                    onClick={() => removeAllowanceRule(i)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="px-4 py-2.5 border-t border-gray-100">
                                <button
                                    className="text-blue-600 hover:text-blue-700 text-[13px] font-medium"
                                    onClick={addAllowanceRule}
                                >
                                    Thêm phụ cấp
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══════════ Section: Giảm trừ ═══════════ */}
            <div className="border border-gray-200 rounded-lg bg-white">
                <div className="px-5 py-4 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-[14px] text-gray-800">Giảm trừ</h3>
                        <p className="text-gray-400 text-[12px] mt-0.5">Thiết lập khoản giảm trừ như đi muộn, về sớm, vi phạm nội quy, ...</p>
                    </div>
                    <Switch
                        checked={config.deduction_enabled}
                        onCheckedChange={(v) => setConfig(prev => ({ ...prev, deduction_enabled: v }))}
                    />
                </div>

                {config.deduction_enabled && (
                    <div className="px-5 pb-4 border-t border-gray-100 pt-4">
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Tên giảm trừ</th>
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Loại giảm trừ</th>
                                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600" colSpan={2}>Khoản giảm trừ</th>
                                        <th className="w-[50px]"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {config.deduction_rules.map((rule, i) => (
                                        <tr key={i} className="border-t border-gray-100">
                                            <td className="px-4 py-2.5">
                                                <Select
                                                    value={rule.name || 'late'}
                                                    onValueChange={(v) => updateDeductionRule(i, 'name', v)}
                                                >
                                                    <SelectTrigger className="w-[130px] h-9 text-[13px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.entries(DEDUCTION_NAMES).map(([k, v]) => (
                                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <Select
                                                    value={rule.condition || 'late'}
                                                    onValueChange={(v) => updateDeductionRule(i, 'condition', v)}
                                                >
                                                    <SelectTrigger className="w-[160px] h-9 text-[13px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.entries(DEDUCTION_TYPES).map(([k, v]) => (
                                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <Select value="per_time" onValueChange={() => {}}>
                                                    <SelectTrigger className="w-[120px] h-9 text-[13px] text-gray-700 bg-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="per_time">Theo số lần</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="py-2.5">
                                                <input
                                                    type="text"
                                                    className="border border-gray-200 rounded-md px-3 py-1.5 w-[120px] text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-[13px]"
                                                    value={fmtMoney(rule.amount)}
                                                    onChange={e => {
                                                        const raw = e.target.value.replace(/[^\d]/g, '');
                                                        updateDeductionRule(i, 'amount', parseInt(raw) || 0);
                                                    }}
                                                />
                                            </td>
                                            <td className="px-2 py-2.5 text-center">
                                                <button
                                                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                                    onClick={() => removeDeductionRule(i)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="px-4 py-2.5 border-t border-gray-100">
                                <button
                                    className="text-blue-600 hover:text-blue-700 text-[13px] font-medium"
                                    onClick={addDeductionRule}
                                >
                                    Thêm giảm trừ
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Spacer for footer */}
            <div className="h-4" />

            {/* Footer - Sticky */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 py-3 px-5 -mx-5 flex justify-end gap-3">
                <Button
                    variant="outline"
                    className="text-[13px] h-9 px-5"
                    onClick={() => fetchConfig()}
                >
                    Bỏ qua
                </Button>
                <Button
                    variant="outline"
                    className="text-[13px] h-9 px-5"
                    onClick={handleSave}
                    disabled={saving}
                >
                    Lưu và tạo mẫu lương mới
                </Button>
                <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[13px] h-9 px-6"
                    disabled={saving}
                    onClick={handleSave}
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Lưu
                </Button>
            </div>

            {/* ═══════════ Dialog: Thêm mới điều kiện hoa hồng ═══════════ */}
            <Dialog open={isCommissionDialogOpen} onOpenChange={setIsCommissionDialogOpen}>
                <DialogContent className="max-w-md p-0 overflow-hidden rounded-xl border-none shadow-2xl">
                    <DialogHeader className="px-6 py-4 bg-white border-b border-gray-100 relative">
                        <DialogTitle className="text-[16px] font-bold text-gray-800">Thêm mới điều kiện hoa hồng</DialogTitle>
                        <DialogDescription className="sr-only">Nhập thông tin điều kiện hoa hồng mới</DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-6">
                        {/* Tên */}
                        <div className="flex items-center gap-4">
                            <label className="text-[13px] font-bold text-gray-700 w-[120px] shrink-0">Tên</label>
                            <Input 
                                className="h-9 text-[13px] bg-white border-gray-200 focus:ring-1 focus:ring-blue-400"
                                value={newCommTable.name}
                                onChange={e => setNewCommTable(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </div>

                        {/* Phạm vi áp dụng */}
                        <div className="flex items-start gap-4">
                            <label className="text-[13px] font-bold text-gray-700 w-[120px] shrink-0 pt-1">Phạm vi áp dụng</label>
                            <div className="flex-1 space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input 
                                        type="radio" 
                                        name="scope" 
                                        checked={newCommTable.scope === 'system'}
                                        onChange={() => setNewCommTable(prev => ({ ...prev, scope: 'system' }))}
                                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" 
                                    />
                                    <span className="text-[13px] text-gray-700 group-hover:text-blue-600 transition-colors">Toàn hệ thống</span>
                                </label>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-3 cursor-pointer group shrink-0">
                                        <input 
                                            type="radio" 
                                            name="scope" 
                                            checked={newCommTable.scope === 'branch'}
                                            onChange={() => setNewCommTable(prev => ({ ...prev, scope: 'branch' }))}
                                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" 
                                        />
                                        <span className="text-[13px] text-gray-700 group-hover:text-blue-600 transition-colors">Chi nhánh</span>
                                    </label>
                                    <Select 
                                        disabled={newCommTable.scope !== 'branch'}
                                        value={newCommTable.branch}
                                        onValueChange={v => setNewCommTable(prev => ({ ...prev, branch: v }))}
                                    >
                                        <SelectTrigger className="h-9 text-[12px] bg-gray-50 border-gray-100 text-gray-400 flex-1">
                                            <SelectValue placeholder="Chọn chi nhánh áp dụng" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Chọn chi nhánh áp dụng</SelectItem>
                                            <SelectItem value="b1">Chi nhánh 1</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {/* Trạng thái */}
                        <div className="flex items-start gap-4">
                            <label className="text-[13px] font-bold text-gray-700 w-[120px] shrink-0 pt-1">Trạng thái</label>
                            <div className="flex-1 space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input 
                                        type="radio" 
                                        name="status" 
                                        checked={newCommTable.status === 'active'}
                                        onChange={() => setNewCommTable(prev => ({ ...prev, status: 'active' }))}
                                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" 
                                    />
                                    <span className="text-[13px] text-gray-700 group-hover:text-blue-600 transition-colors">Áp dụng</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input 
                                        type="radio" 
                                        name="status" 
                                        checked={newCommTable.status === 'inactive'}
                                        onChange={() => setNewCommTable(prev => ({ ...prev, status: 'inactive' }))}
                                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" 
                                    />
                                    <span className="text-[13px] text-gray-700 group-hover:text-blue-600 transition-colors">Ngừng áp dụng</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 gap-3">
                        <Button
                            variant="outline"
                            className="h-9 px-6 text-[13px] font-medium border-gray-200 bg-white"
                            onClick={() => setIsCommissionDialogOpen(false)}
                        >
                            Bỏ qua
                        </Button>
                        <Button
                            className="h-9 px-8 text-[13px] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200/50"
                            onClick={async () => {
                                if (!newCommTable.name.trim()) {
                                    toast.error('Vui lòng nhập tên điều kiện hoa hồng');
                                    return;
                                }
                                try {
                                    const res = await commissionTablesApi.create({
                                        id: 'custom_' + Date.now(),
                                        name: newCommTable.name,
                                        type: newCommTable.scope === 'branch' ? 'branch' : 'system'
                                    });
                                    
                                    const newTable = res.data?.data?.table;
                                    if (newTable) {
                                        await fetchCommissionTables();
                                        if (currentRuleIndex !== null) {
                                            updateCommissionRule(currentRuleIndex, 'commission_type', newTable.id);
                                        }
                                        toast.success('Đã thêm bảng hoa hồng mới!');
                                    }
                                } catch (err) {
                                    console.error('Lỗi khi tạo bảng hoa hồng:', err);
                                    toast.error('Lỗi khi lưu bảng hoa hồng');
                                } finally {
                                    setIsCommissionDialogOpen(false);
                                    setNewCommTable({ name: '', scope: 'system', branch: 'none', status: 'active' });
                                }
                            }}
                        >
                            Lưu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
