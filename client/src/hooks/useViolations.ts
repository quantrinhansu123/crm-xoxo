import { useState, useCallback } from 'react';
import { violationsApi } from '@/lib/api';

export interface ViolationReward {
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
    type: 'violation' | 'reward';
    category: string;
    amount: number;
    date: string;
    month: number;
    year: number;
    description?: string;
    timesheet_id?: string;
    creator?: { id: string; name: string };
    created_by?: string;
    created_at: string;
    updated_at?: string;
}

export interface VRSummary {
    totalViolations: number;
    totalRewards: number;
    violationCount: number;
    rewardCount: number;
    net: number;
}

export const VIOLATION_CATEGORIES = [
    { value: 'late', label: 'Đi muộn' },
    { value: 'absent', label: 'Vắng không phép' },
    { value: 'early_leave', label: 'Về sớm' },
    { value: 'rule_violation', label: 'Vi phạm nội quy' },
    { value: 'customer_complaint', label: 'Khách hàng phàn nàn' },
    { value: 'other', label: 'Khác' },
];

export const REWARD_CATEGORIES = [
    { value: 'performance', label: 'Hoàn thành xuất sắc' },
    { value: 'customer_praise', label: 'Khách hàng khen' },
    { value: 'initiative', label: 'Sáng kiến' },
    { value: 'attendance_perfect', label: 'Chuyên cần' },
    { value: 'other', label: 'Khác' },
];

export function useViolations() {
    const [records, setRecords] = useState<ViolationReward[]>([]);
    const [summary, setSummary] = useState<VRSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchRecords = useCallback(async (params?: { month?: number; year?: number; type?: string; user_id?: string; category?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await violationsApi.getAll(params);
            const data = response.data?.data || (response.data as any);
            setRecords(data?.records || []);
            setSummary(data?.summary || null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải danh sách vi phạm/thưởng');
        } finally {
            setLoading(false);
        }
    }, []);

    const createRecord = useCallback(async (data: {
        user_id: string;
        type: 'violation' | 'reward';
        category: string;
        amount?: number;
        date?: string;
        month?: number;
        year?: number;
        description?: string;
        timesheet_id?: string;
    }) => {
        const response = await violationsApi.create(data);
        const record = response.data?.data?.record || response.data;
        if (record) {
            setRecords(prev => [record, ...prev]);
        }
        return record;
    }, []);

    const updateRecord = useCallback(async (id: string, data: Partial<{
        type: string;
        category: string;
        amount: number;
        date: string;
        description: string;
    }>) => {
        const response = await violationsApi.update(id, data);
        const updated = response.data?.data?.record || response.data;
        setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
        return updated;
    }, []);

    const deleteRecord = useCallback(async (id: string) => {
        await violationsApi.delete(id);
        setRecords(prev => prev.filter(r => r.id !== id));
    }, []);

    return {
        records,
        summary,
        loading,
        error,
        fetchRecords,
        createRecord,
        updateRecord,
        deleteRecord,
    };
}
