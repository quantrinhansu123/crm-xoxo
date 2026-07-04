import { useState, useCallback } from 'react';
import { salaryAdvancesApi } from '@/lib/api';

export interface SalaryAdvance {
    id: string;
    user_id: string;
    user?: {
        id: string;
        name: string;
        email: string;
        avatar?: string;
        role?: string;
        department?: string;
        employee_code?: string;
    };
    amount: number;
    month: number;
    year: number;
    reason?: string;
    status: 'pending' | 'approved' | 'rejected' | 'deducted';
    approved_by?: string;
    approved_at?: string;
    approver?: { id: string; name: string };
    rejected_by?: string;
    rejected_at?: string;
    rejection_reason?: string;
    deducted_at?: string;
    salary_record_id?: string;
    notes?: string;
    created_at: string;
    created_by?: string;
    updated_at?: string;
}

export interface AdvanceSummary {
    total: number;
    pending: number;
    approved: number;
    deducted: number;
    count: number;
}

export function useSalaryAdvances() {
    const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
    const [summary, setSummary] = useState<AdvanceSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchAdvances = useCallback(async (params?: { month?: number; year?: number; status?: string; user_id?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await salaryAdvancesApi.getAll(params);
            const data = response.data?.data || (response.data as any);
            setAdvances(data?.advances || []);
            setSummary(data?.summary || null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải danh sách ứng lương');
        } finally {
            setLoading(false);
        }
    }, []);

    const createAdvance = useCallback(async (data: {
        user_id: string;
        amount: number;
        month: number;
        year: number;
        reason?: string;
        notes?: string;
    }) => {
        const response = await salaryAdvancesApi.create(data);
        const advance = response.data?.data?.advance || response.data;
        if (advance) {
            setAdvances(prev => [advance, ...prev]);
        }
        return advance;
    }, []);

    const approveAdvance = useCallback(async (id: string) => {
        const response = await salaryAdvancesApi.approve(id);
        const updated = response.data?.data?.advance || response.data;
        setAdvances(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
        return updated;
    }, []);

    const rejectAdvance = useCallback(async (id: string, rejection_reason?: string) => {
        const response = await salaryAdvancesApi.reject(id, rejection_reason);
        const updated = response.data?.data?.advance || response.data;
        setAdvances(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a));
        return updated;
    }, []);

    const deleteAdvance = useCallback(async (id: string) => {
        await salaryAdvancesApi.delete(id);
        setAdvances(prev => prev.filter(a => a.id !== id));
    }, []);

    return {
        advances,
        summary,
        loading,
        error,
        fetchAdvances,
        createAdvance,
        approveAdvance,
        rejectAdvance,
        deleteAdvance,
    };
}
