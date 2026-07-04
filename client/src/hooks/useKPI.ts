import { useState, useCallback } from 'react';
import { kpiApi } from '@/lib/api';
import { toast } from 'sonner';

// ============================================================
// TYPES
// ============================================================

export interface KPIPolicy {
    id: string;
    code: string;
    name: string;
    role: string;
    description?: string;
    effective_from: string;
    effective_to?: string;
    is_active: boolean;
    metric_count?: number;
    total_weight?: number;
    metrics?: KPIPolicyMetric[];
    employee_count?: number;
    created_at: string;
    updated_at: string;
}

export interface KPIPolicyMetric {
    id: string;
    policy_id: string;
    metric_code: string;
    metric_name: string;
    metric_group: 'output' | 'process' | 'discipline' | 'quality';
    description?: string;
    weight: number;
    score_type: 'threshold' | 'linear' | 'per_event' | 'boolean' | 'manual';
    target_type: 'percentage' | 'absolute' | 'count';
    target_value: number;
    scoring_rules: any;
    source_type: 'auto' | 'hybrid' | 'manual';
    source_key?: string;
    manual_input_allowed: boolean;
    manager_review_required: boolean;
    sort_order: number;
    is_active: boolean;
}

export interface KPIRankConfig {
    id: string;
    rank_code: string;
    rank_name: string;
    min_score: number;
    max_score: number;
    bonus_amount: number;
    penalty_amount: number;
    commission_factor: number;
    sort_order: number;
    is_active: boolean;
    employee_id?: string | null;
    policy_id?: string | null;
    is_override?: boolean;
    global_id?: string;
}

export interface KPIMonthlyRecord {
    id: string;
    employee_id: string;
    month_key: string;
    policy_id: string;
    total_score: number;
    rank: string;
    kpi_bonus_amount: number;
    kpi_penalty_amount: number;
    kpi_commission_factor: number;
    manual_adjustment_score: number;
    status: 'draft' | 'pending' | 'locked';
    reviewed_by?: string;
    reviewed_at?: string;
    note?: string;
    employee?: { id: string; name: string; email: string; avatar?: string; role: string; department?: string };
    policy?: { id: string; code: string; name: string };
    reviewer?: { id: string; name: string };
    items?: KPIMonthlyItem[];
    violations?: KPIViolation[];
    adjustments?: any[];
    created_at: string;
    updated_at: string;
}

export interface KPIMonthlyItem {
    id: string;
    monthly_kpi_id: string;
    metric_code: string;
    metric_name: string;
    metric_group: string;
    weight: number;
    target_value: number;
    actual_value: number;
    achievement_rate: number;
    raw_score: number;
    manual_adjustment: number;
    final_score: number;
    source_type: string;
    source_ref?: any;
    note?: string;
}

export interface KPIViolation {
    id: string;
    employee_id: string;
    month_key: string;
    violation_type: string;
    rule_code?: string;
    rule_name: string;
    source_type: string;
    deduct_kpi_point: number;
    deduct_amount: number;
    related_lead_id?: string;
    related_order_id?: string;
    note?: string;
    attachments?: any[];
    created_by?: string;
    created_at: string;
    status: 'pending' | 'approved' | 'rejected';
    employee?: { id: string; name: string; email: string; avatar?: string; role: string };
    creator?: { id: string; name: string };
}

export interface KPIMonthlySummary {
    total: number;
    draft: number;
    pending: number;
    locked: number;
    avg_score: number;
}

export interface KPIAssignment {
    id: string;
    employee_id: string;
    policy_id: string;
    assignment_type: 'primary' | 'secondary';
    compensation_bucket: string;
    effective_from: string;
    effective_to?: string;
    is_active: boolean;
    policy?: { id: string; code: string; name: string; role: string };
}

export interface EmployeeWithAssignments {
    id: string;
    name: string;
    email: string;
    role: string;
    department?: string | null; // Department name (joined from departments table)
    assignments: KPIAssignment[];
    primary_policy?: { id: string; code: string; name: string };
    // legacy compat
    kpi_policy_id?: string;
    kpi_policy?: { id: string; code: string; name: string };
}

// ============================================================
// HOOK
// ============================================================

export function useKPI() {
    // Policies
    const [policies, setPolicies] = useState<KPIPolicy[]>([]);
    const [selectedPolicy, setSelectedPolicy] = useState<KPIPolicy | null>(null);

    // Monthly
    const [monthlyRecords, setMonthlyRecords] = useState<KPIMonthlyRecord[]>([]);
    const [monthlySummary, setMonthlySummary] = useState<KPIMonthlySummary | null>(null);
    const [selectedMonthly, setSelectedMonthly] = useState<KPIMonthlyRecord | null>(null);

    // Violations
    const [violations, setViolations] = useState<KPIViolation[]>([]);

    // Rank configs
    const [rankConfigs, setRankConfigs] = useState<KPIRankConfig[]>([]);

    // Leaderboard
    const [leaderboard, setLeaderboard] = useState<any[]>([]);

    // State
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── POLICIES ──

    const fetchPolicies = useCallback(async (params?: { role?: string; is_active?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await kpiApi.getPolicies(params);
            const data = response.data?.data || response.data;
            setPolicies((data as any)?.policies || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải chính sách KPI');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchPolicyDetail = useCallback(async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            const response = await kpiApi.getPolicy(id);
            const data = response.data?.data || response.data;
            setSelectedPolicy((data as any)?.policy || null);
            return (data as any)?.policy;
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải chi tiết chính sách');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const createPolicy = useCallback(async (data: any) => {
        try {
            const response = await kpiApi.createPolicy(data);
            toast.success('Đã tạo chính sách KPI');
            return (response.data?.data as any)?.policy;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi tạo chính sách');
            throw err;
        }
    }, []);

    const updatePolicy = useCallback(async (id: string, data: any) => {
        try {
            const response = await kpiApi.updatePolicy(id, data);
            toast.success('Đã cập nhật chính sách KPI');
            return (response.data?.data as any)?.policy;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật chính sách');
            throw err;
        }
    }, []);

    // ── METRICS ──

    const addMetric = useCallback(async (policyId: string, data: any) => {
        try {
            const response = await kpiApi.addMetric(policyId, data);
            toast.success('Đã thêm chỉ tiêu KPI');
            return (response.data?.data as any)?.metric;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi thêm chỉ tiêu');
            throw err;
        }
    }, []);

    const updateMetric = useCallback(async (id: string, data: any) => {
        try {
            const response = await kpiApi.updateMetric(id, data);
            toast.success('Đã cập nhật chỉ tiêu KPI');
            return (response.data?.data as any)?.metric;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật chỉ tiêu');
            throw err;
        }
    }, []);

    const deleteMetric = useCallback(async (id: string) => {
        try {
            await kpiApi.deleteMetric(id);
            toast.success('Đã xóa chỉ tiêu KPI');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi xóa chỉ tiêu');
            throw err;
        }
    }, []);

    // ── MONTHLY ──

    const fetchMonthly = useCallback(async (params?: { month_key?: string; status?: string; employee_id?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await kpiApi.getMonthly(params);
            const data = response.data?.data || response.data;
            setMonthlyRecords((data as any)?.records || []);
            setMonthlySummary((data as any)?.summary || null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải KPI tháng');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchMonthlyDetail = useCallback(async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            const response = await kpiApi.getMonthlyDetail(id);
            const data = response.data?.data || response.data;
            setSelectedMonthly((data as any)?.record || null);
            return (data as any)?.record;
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải chi tiết KPI');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const generateMonthly = useCallback(async (monthKey: string) => {
        setLoading(true);
        try {
            const response = await kpiApi.generateMonthly({ month_key: monthKey });
            const data = response.data?.data || response.data;
            const generated = (data as any)?.generated || 0;
            const errors = (data as any)?.errors || 0;
            const errors_detail = (data as any)?.errors_detail || [];

            if (errors > 0) {
                const errorMsg = errors_detail.map((e: any) => `${e.employee}: ${e.error}`).join('\n');
                toast.error(`Có ${errors} lỗi khi tạo KPI:\n${errorMsg}`, {
                    duration: 5000,
                });
            }
            
            if (generated > 0 || errors === 0) {
                toast.success(`Đã tạo KPI tháng: ${generated} nhân sự thành công`);
            }
            return data;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi tạo KPI tháng');
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    const recalculateMonthly = useCallback(async (id: string) => {
        try {
            const response = await kpiApi.recalculateMonthly(id);
            toast.success('Đã tính lại điểm KPI');
            return (response.data?.data as any)?.record;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi tính lại điểm');
            throw err;
        }
    }, []);

    const updateMonthly = useCallback(async (id: string, data: any) => {
        try {
            await kpiApi.updateMonthly(id, data);
            toast.success('Đã cập nhật KPI');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật');
            throw err;
        }
    }, []);

    const lockMonthly = useCallback(async (id: string) => {
        try {
            const response = await kpiApi.lockMonthly(id);
            toast.success('Đã khóa KPI');
            return (response.data?.data as any)?.record;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi khóa KPI');
            throw err;
        }
    }, []);

    const batchLock = useCallback(async (monthKey: string) => {
        try {
            const response = await kpiApi.batchLock({ month_key: monthKey });
            const count = (response.data?.data as any)?.locked_count || 0;
            toast.success(`Đã khóa ${count} KPI`);
            return count;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi khóa hàng loạt');
            throw err;
        }
    }, []);

    const pushToPayroll = useCallback(async (id: string) => {
        try {
            const response = await kpiApi.pushToPayroll(id);
            toast.success('Đã đẩy KPI sang bảng lương');
            return response.data?.data;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi đẩy sang bảng lương');
            throw err;
        }
    }, []);

    const batchPush = useCallback(async (monthKey: string) => {
        try {
            const response = await kpiApi.batchPush({ month_key: monthKey });
            toast.success('Đã đẩy tất cả KPI sang bảng lương');
            return response.data?.data;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi đẩy hàng loạt');
            throw err;
        }
    }, []);

    // ── VIOLATIONS ──

    const fetchViolations = useCallback(async (params?: { month_key?: string; employee_id?: string; status?: string; violation_type?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await kpiApi.getViolations(params);
            const data = response.data?.data || response.data;
            setViolations((data as any)?.violations || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải vi phạm');
        } finally {
            setLoading(false);
        }
    }, []);

    const createViolation = useCallback(async (data: any) => {
        try {
            const response = await kpiApi.createViolation(data);
            toast.success('Đã tạo vi phạm KPI');
            return (response.data?.data as any)?.violation;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi tạo vi phạm');
            throw err;
        }
    }, []);

    const approveViolation = useCallback(async (id: string) => {
        try {
            const response = await kpiApi.approveViolation(id);
            toast.success('Đã duyệt vi phạm');
            return (response.data?.data as any)?.violation;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi duyệt vi phạm');
            throw err;
        }
    }, []);

    const rejectViolation = useCallback(async (id: string) => {
        try {
            const response = await kpiApi.rejectViolation(id);
            toast.success('Đã từ chối vi phạm');
            return (response.data?.data as any)?.violation;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi từ chối vi phạm');
            throw err;
        }
    }, []);

    // ── RANK CONFIGS ──

    const fetchRankConfigs = useCallback(async (employeeId?: string, policyId?: string) => {
        setLoading(true);
        try {
            let params: { employee_id?: string; policy_id?: string } | undefined;
            if (policyId) {
                params = { policy_id: policyId };
            } else if (employeeId) {
                params = { employee_id: employeeId };
            }
            const response = await kpiApi.getRankConfigs(params);
            const data = response.data?.data || response.data;
            setRankConfigs((data as any)?.configs || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải cấu hình xếp loại');
        } finally {
            setLoading(false);
        }
    }, []);

    const updateRankConfig = useCallback(async (id: string, data: any) => {
        try {
            const response = await kpiApi.updateRankConfig(id, data);
            toast.success('Đã cập nhật cấu hình xếp loại');
            return (response.data?.data as any)?.config;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi cập nhật');
            throw err;
        }
    }, []);

    const upsertEmployeeRankConfigs = useCallback(async (employeeId: string, configs: Array<Partial<KPIRankConfig> & { rank_code: string; reset_to_global?: boolean }>) => {
        try {
            const response = await kpiApi.upsertEmployeeRankConfigs(employeeId, configs);
            toast.success('Đã lưu cấu hình xếp loại');
            return (response.data?.data as any);
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi lưu cấu hình');
            throw err;
        }
    }, []);

    const upsertPolicyRankConfigs = useCallback(async (policyId: string, configs: Array<Partial<KPIRankConfig> & { rank_code: string; reset_to_global?: boolean }>) => {
        try {
            const response = await kpiApi.upsertPolicyRankConfigs(policyId, configs);
            toast.success('Đã lưu cấu hình xếp loại theo chính sách');
            return (response.data?.data as any);
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi lưu cấu hình');
            throw err;
        }
    }, []);

    // ── LEADERBOARD ──

    const fetchLeaderboard = useCallback(async (params?: { month_key?: string; role?: string; limit?: number }) => {
        try {
            const response = await kpiApi.getLeaderboard(params);
            const data = response.data?.data || response.data;
            setLeaderboard((data as any)?.leaderboard || []);
        } catch (err: any) {
            console.error('Error fetching leaderboard:', err);
        }
    }, []);

    // ── ADJUSTMENTS (locked KPIs) ──

    const createAdjustment = useCallback(async (monthlyId: string, data: { field_name: string; old_value: any; new_value: any; reason: string; item_id?: string }) => {
        try {
            const response = await kpiApi.createAdjustment(monthlyId, data);
            toast.success('Đã tạo điều chỉnh KPI');
            return (response.data?.data as any)?.adjustment;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi tạo điều chỉnh');
            throw err;
        }
    }, []);

    // ── EMPLOYEE ASSIGNMENTS ──

    const [employeeAssignments, setEmployeeAssignments] = useState<EmployeeWithAssignments[]>([]);
    const [availablePolicies, setAvailablePolicies] = useState<any[]>([]);

    const fetchEmployeeAssignments = useCallback(async (params?: { role?: string; department?: string; status?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await kpiApi.getEmployeeAssignments(params);
            const data = response.data?.data || response.data;
            setEmployeeAssignments((data as any)?.employees || []);
            setAvailablePolicies((data as any)?.policies || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải danh sách gán KPI');
        } finally {
            setLoading(false);
        }
    }, []);

    const batchAssignPolicies = useCallback(async (assignments: Array<{ employee_id: string; policy_id: string | null }>) => {
        try {
            const response = await kpiApi.batchAssignPolicies({ assignments });
            const data = response.data?.data || response.data;
            const updated = (data as any)?.created || 0;
            const errors = (data as any)?.errors || 0;
            toast.success(`Đã gán KPI cho ${updated} nhân sự${errors > 0 ? `, ${errors} lỗi` : ''}`);
            return data;
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi gán chính sách KPI');
            throw err;
        }
    }, []);

    const removeAssignment = useCallback(async (assignmentId: string) => {
        try {
            await kpiApi.removeAssignment(assignmentId);
            toast.success('Đã xóa gán KPI phụ');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi xóa gán KPI');
            throw err;
        }
    }, []);

    return {
        // State
        policies, selectedPolicy, setSelectedPolicy,
        monthlyRecords, monthlySummary, selectedMonthly, setSelectedMonthly,
        violations,
        rankConfigs,
        leaderboard,
        employeeAssignments, availablePolicies,
        loading, error,

        // Policy actions
        fetchPolicies, fetchPolicyDetail, createPolicy, updatePolicy,

        // Metric actions
        addMetric, updateMetric, deleteMetric,

        // Monthly actions
        fetchMonthly, fetchMonthlyDetail, generateMonthly,
        recalculateMonthly, updateMonthly, lockMonthly,
        batchLock, pushToPayroll, batchPush,

        // Violation actions
        fetchViolations, createViolation, approveViolation, rejectViolation,

        // Rank config actions
        fetchRankConfigs, updateRankConfig, upsertEmployeeRankConfigs, upsertPolicyRankConfigs,

        // Leaderboard
        fetchLeaderboard,

        // Adjustments
        createAdjustment,

        // Employee assignments
        fetchEmployeeAssignments, batchAssignPolicies, removeAssignment,
    };
}
