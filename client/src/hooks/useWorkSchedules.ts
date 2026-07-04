import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────

export interface Shift {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    color: string;
    status: 'active' | 'inactive';
    created_at: string;
}

export interface WorkSchedule {
    id: string;
    user_id: string;
    shift_id: string;
    schedule_date: string;
    repeat_weekly: boolean;
    work_on_holidays: boolean;
    repeat_days?: number[];
    end_date?: string;
    notes?: string;
    created_by?: string;
    created_at: string;
    shift: Shift;
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
}

export interface CreateScheduleData {
    user_id: string;
    shift_ids: string[];
    schedule_date: string;
    repeat_weekly?: boolean;
    repeat_days?: number[];
    end_date?: string;
    work_on_holidays?: boolean;
    apply_to_users?: string[];
    created_by?: string;
}

// ── Hook ───────────────────────────────────────────────────────

export function useWorkSchedules() {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Shifts ─────────────────────────────────────────────────

    const fetchShifts = useCallback(async () => {
        try {
            const response = await api.get('/work-schedules/shifts', { params: { status: 'active' } });
            const data = response?.data?.data?.shifts ?? response?.data?.shifts ?? response?.data ?? [];
            setShifts(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error fetching shifts:', err);
        }
    }, []);

    const createShift = useCallback(async (data: { name: string; start_time: string; end_time: string; color?: string }) => {
        const response = await api.post('/work-schedules/shifts', data);
        const newShift = response?.data?.data?.shift ?? response?.data?.shift ?? response?.data;
        setShifts(prev => [...prev, newShift]);
        return newShift;
    }, []);

    // ── Work Schedules ─────────────────────────────────────────

    const fetchSchedules = useCallback(async (startDate: string, endDate: string, userId?: string) => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = { start_date: startDate, end_date: endDate };
            if (userId) params.user_id = userId;

            const response = await api.get('/work-schedules', { params });
            const data = response?.data?.data?.schedules ?? response?.data?.schedules ?? response?.data ?? [];
            setSchedules(Array.isArray(data) ? data : []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lỗi khi tải lịch làm việc';
            setError(message);
            console.error('Error fetching schedules:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const createSchedule = useCallback(async (data: CreateScheduleData) => {
        setLoading(true);
        try {
            const response = await api.post('/work-schedules', data);
            return response?.data?.data ?? response?.data;
        } catch (err: any) {
            const message = err?.response?.data?.message || err?.message || 'Lỗi khi tạo lịch làm việc';
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteSchedule = useCallback(async (id: string) => {
        await api.delete(`/work-schedules/${id}`);
        setSchedules(prev => prev.filter(s => s.id !== id));
    }, []);

    const bulkDeleteSchedule = useCallback(async (data: { user_id: string; schedule_date: string; type: 'single' | 'future' | 'all' }) => {
        await api.post('/work-schedules/bulk-delete', data);
    }, []);

    return {
        shifts,
        schedules,
        loading,
        error,
        fetchShifts,
        createShift,
        fetchSchedules,
        createSchedule,
        deleteSchedule,
        bulkDeleteSchedule,
    };
}
