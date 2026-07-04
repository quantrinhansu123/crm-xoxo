import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────

export interface Timesheet {
    id: string;
    user_id: string;
    shift_id: string;
    schedule_date: string;
    check_in: string | null;
    check_out: string | null;
    status: 'on_time' | 'late_early' | 'incomplete' | 'not_checked' | 'day_off';
    notes: string | null;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
    shift: {
        id: string;
        name: string;
        start_time: string;
        end_time: string;
        color: string;
        status: string;
    };
    user: {
        id: string;
        name: string;
        email: string;
        phone?: string;
        role: string;
        avatar?: string;
        status?: string;
        employee_code?: string;
        salary?: number;
        department_id?: string;
    };
    approver?: {
        id: string;
        name: string;
    } | null;
}

export type TimesheetStatus = Timesheet['status'];

// ── Hook ───────────────────────────────────────────────────────

export function useTimesheets() {
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTimesheets = useCallback(async (startDate: string, endDate: string, userId?: string) => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = { start_date: startDate, end_date: endDate };
            if (userId) params.user_id = userId;

            const response = await api.get('/timesheets', { params });
            const data = response?.data?.data?.timesheets ?? response?.data?.timesheets ?? response?.data ?? [];
            setTimesheets(Array.isArray(data) ? data : []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lỗi khi tải dữ liệu chấm công';
            setError(message);
            console.error('Error fetching timesheets:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const createTimesheet = useCallback(async (data: {
        user_id: string;
        shift_id: string;
        schedule_date: string;
        check_in?: string;
        check_out?: string;
        status?: TimesheetStatus;
        notes?: string;
    }) => {
        const response = await api.post('/timesheets', data);
        return response?.data?.data?.timesheet ?? response?.data;
    }, []);

    const updateTimesheet = useCallback(async (id: string, data: {
        check_in?: string;
        check_out?: string;
        status?: TimesheetStatus;
        notes?: string;
    }) => {
        const response = await api.put(`/timesheets/${id}`, data);
        return response?.data?.data?.timesheet ?? response?.data;
    }, []);

    const approveTimesheets = useCallback(async (timesheetIds: string[], approvedBy?: string) => {
        const response = await api.post('/timesheets/approve', {
            timesheet_ids: timesheetIds,
            approved_by: approvedBy,
        });
        return response?.data?.data;
    }, []);

    const generateTimesheets = useCallback(async (startDate: string, endDate: string) => {
        const response = await api.post('/timesheets/generate', {
            start_date: startDate,
            end_date: endDate,
        });
        return response?.data?.data;
    }, []);

    const deleteTimesheet = useCallback(async (id: string) => {
        await api.delete(`/timesheets/${id}`);
        setTimesheets(prev => prev.filter(t => t.id !== id));
    }, []);

    return {
        timesheets,
        loading,
        error,
        fetchTimesheets,
        createTimesheet,
        updateTimesheet,
        approveTimesheets,
        generateTimesheets,
        deleteTimesheet,
    };
}
