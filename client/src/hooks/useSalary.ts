import { useState, useCallback } from 'react';
import { salaryApi, usersApi } from '@/lib/api';

export interface SalaryRecord {
    id: string;
    user_id: string;
    user?: {
        id: string;
        name: string;
        email: string;
        avatar?: string;
        department?: string;
        role?: string;
        employee_code?: string;
    };
    month: number;
    year: number;
    base_salary: number;
    hourly_rate?: number;
    hourly_wage: number;
    overtime_pay: number;
    total_hours: number;
    overtime_hours: number;

    // Commission breakdown
    service_commission?: number;
    product_commission?: number;
    referral_commission?: number;
    commission: number;
    tech_service_fee_total?: number | null;
    tech_accessory_cost_total?: number | null;
    tech_commission_final?: number | null;
    tech_commission_policy_applied?: boolean;

    // KPI
    kpi_achievement?: number;
    kpi_primary_score?: number;
    kpi_primary_rank?: string;
    kpi_primary_bonus?: number;
    kpi_primary_penalty?: number;
    kpi_primary_commission_factor?: number;
    kpi_secondary_details?: Array<{
        policy_id: string;
        policy_code: string;
        policy_name: string;
        score: number;
        rank: string;
        bonus: number;
        penalty: number;
        bucket: string;
    }> | null;
    teamlead_bonus?: number;
    management_bonus?: number;
    bonus: number;

    // Deductions
    social_insurance?: number;
    health_insurance?: number;
    personal_tax?: number;
    advances?: number;
    deduction: number;

    // Final
    gross_salary?: number;
    net_salary: number;

    // Status
    status: 'draft' | 'pending' | 'approved' | 'paid' | 'locked';
    telegram_sent?: boolean;
    payment_method?: string;
    approved_by?: string;
    approved_at?: string;
    paid_at?: string;
    paid_by?: string;
    created_at: string;
    created_by?: string;
}

export interface SalarySummary {
    totalBaseSalary: number;
    totalCommission: number;
    totalBonus: number;
    totalDeduction: number;
    totalNet: number;
    count: number;
    month: number;
    year: number;
}

// Role labels for display
export const roleLabels: Record<string, string> = {
    admin: 'Quản trị viên',
    manager: 'Quản lý',
    accountant: 'Kế toán',
    sale: 'Sale',
    technician: 'Kỹ thuật'
};

function extractErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = (error as { response?: unknown }).response;
        if (typeof response === 'object' && response !== null && 'data' in response) {
            const data = (response as { data?: unknown }).data;
            if (typeof data === 'object' && data !== null && 'message' in data) {
                const message = (data as { message?: unknown }).message;
                if (typeof message === 'string' && message.trim()) {
                    return message;
                }
            }
        }
    }

    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    return fallback;
}

export function useSalary() {
    const [salaries, setSalaries] = useState<SalaryRecord[]>([]);
    const [summary, setSummary] = useState<SalarySummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSalaries = useCallback(async (params?: { month?: number; year?: number; status?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await salaryApi.getAll(params);
            setSalaries(response.data.data?.salaries || []);
            setSummary(response.data.data?.summary || null);
        } catch (err: unknown) {
            setError(extractErrorMessage(err, 'Lỗi khi tải bảng lương'));
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchUserSalary = useCallback(async (userId: string, year?: number) => {
        setLoading(true);
        try {
            const response = await salaryApi.getByUser(userId, year);
            return response.data.data?.salaries || [];
        } catch (err: unknown) {
            setError(extractErrorMessage(err, 'Lỗi khi tải lương'));
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    const calculateSalary = useCallback(async (data: { user_id: string; month: number; year: number }) => {
        const response = await salaryApi.calculate(data);
        const salary = response.data.data?.salary;
        if (salary) {
            setSalaries(prev => {
                const exists = prev.find(s => s.id === salary.id);
                if (exists) {
                    return prev.map(s => s.id === salary.id ? salary : s);
                }
                return [salary, ...prev];
            });
        }
        return salary;
    }, []);

    const calculateAllSalaries = useCallback(async (month: number, year: number) => {
        setLoading(true);
        setError(null);
        try {
            // Fetch all users first
            const usersResponse = await usersApi.getAll({ status: 'active' });
            const users = usersResponse.data.data?.users || [];

            // Calculate salary for each user
            for (const user of users) {
                try {
                    await salaryApi.calculate({ user_id: user.id, month, year });
                } catch (err) {
                    console.error(`Error calculating salary for user ${user.id}:`, err);
                }
            }

            // Refresh salaries list
            await fetchSalaries({ month, year });
        } catch (err: unknown) {
            setError(extractErrorMessage(err, 'Lỗi khi tính lương'));
        } finally {
            setLoading(false);
        }
    }, [fetchSalaries]);

    const approveSalary = useCallback(async (id: string) => {
        const response = await salaryApi.approve(id);
        const updated = response.data.data?.salary;
        setSalaries(prev => prev.map(s => s.id === id ? updated : s));
        return updated;
    }, []);

    const approveBulk = useCallback(async (ids: string[]) => {
        setLoading(true);
        try {
            for (const id of ids) {
                await salaryApi.approve(id);
            }
            // Refresh list
            const firstSalary = salaries.find(s => ids.includes(s.id));
            if (firstSalary) {
                await fetchSalaries({ month: firstSalary.month, year: firstSalary.year });
            }
        } catch (err: unknown) {
            setError(extractErrorMessage(err, 'Lỗi khi duyệt lương'));
        } finally {
            setLoading(false);
        }
    }, [salaries, fetchSalaries]);

    const paySalary = useCallback(async (id: string, payment_method?: string) => {
        const response = await salaryApi.pay(id, { payment_method });
        const updated = response.data.data?.salary;
        setSalaries(prev => prev.map(s => s.id === id ? updated : s));
        return updated;
    }, []);

    return {
        salaries,
        summary,
        loading,
        error,
        roleLabels,
        fetchSalaries,
        fetchUserSalary,
        calculateSalary,
        calculateAllSalaries,
        approveSalary,
        approveBulk,
        paySalary,
    };
}
