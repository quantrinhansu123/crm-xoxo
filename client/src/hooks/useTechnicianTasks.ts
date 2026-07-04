import { useState, useCallback } from 'react';
import api from '@/lib/api';

export interface TechnicianTask {
    id: string;
    task_code: string;
    item_code?: string;
    order_id?: string;
    order_item_id?: string;
    order_product_id?: string;
    service_id?: string;
    customer_id?: string;
    technician_id: string | null;
    service_name: string;
    product_name?: string;
    product_type?: string;
    product_images?: string[];
    quantity: number;
    status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'partially_completed';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    scheduled_date: string | null;
    scheduled_time: string | null;
    started_at: string | null;
    completed_at: string | null;
    duration_minutes: number | null;
    notes: string | null;
    customer_feedback: string | null;
    rating: number | null;
    assigned_by: string | null;
    assigned_at: string | null;
    created_at: string;
    updated_at: string;
    type?: 'v1_service' | 'v2_service' | 'v2_product' | 'workflow_step';
    is_step?: boolean;
    step_id?: string;
    services?: Array<{
        id: string;
        name: string;
        status: string;
        unit_price?: number;
        started_at?: string | null;
        completed_at?: string | null;
        assigned_at?: string | null;
        technicians?: Array<{
            technician_id: string;
            technician?: {
                id: string;
                name: string;
                phone?: string;
                avatar?: string;
            };
        }>;
    }>;
    services_count?: number;
    // Joined data
    order?: {
        order_code: string;
        customer?: {
            name: string;
            phone: string;
            address: string;
        };
    };
    service?: {
        name: string;
        price: number;
        duration: number;
    };
    technician?: {
        name: string;
        phone: string;
        avatar: string;
        department?: string;
        department_id?: string;
    };
    customer?: {
        name: string;
        phone: string;
        address: string;
    };
}

export interface TaskStats {
    total: number;
    pending: number;
    assigned: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    total_duration: number;
    avg_rating: number;
}

export function useTechnicianTasks() {
    const [tasks, setTasks] = useState<TechnicianTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<TaskStats | null>(null);

    const fetchTasks = useCallback(async (filters?: {
        status?: string;
        technician_id?: string;
        date_from?: string;
        date_to?: string;
        priority?: string;
    }) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters?.status) params.append('status', filters.status);
            if (filters?.technician_id) params.append('technician_id', filters.technician_id);
            if (filters?.date_from) params.append('date_from', filters.date_from);
            if (filters?.date_to) params.append('date_to', filters.date_to);
            if (filters?.priority) params.append('priority', filters.priority);

            const response = await api.get(`/technician-tasks?${params.toString()}`);
            setTasks(response.data);
            return response.data;
        } catch (error) {
            console.error('Error fetching tasks:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchMyTasks = useCallback(async (filters?: {
        status?: string;
        date?: string;
    }) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters?.status) params.append('status', filters.status);
            if (filters?.date) params.append('date', filters.date);

            const response = await api.get(`/technician-tasks/my-tasks?${params.toString()}`);
            setTasks(response.data);
            return response.data;
        } catch (error) {
            console.error('Error fetching my tasks:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchTask = useCallback(async (id: string) => {
        const response = await api.get(`/technician-tasks/${id}`);
        return response.data;
    }, []);

    const createTask = useCallback(async (data: Partial<TechnicianTask>) => {
        const response = await api.post('/technician-tasks', data);
        setTasks(prev => [response.data, ...prev]);
        return response.data;
    }, []);

    const createTasksFromOrder = useCallback(async (orderId: string, data: {
        technician_id?: string;
        scheduled_date?: string;
        scheduled_time?: string;
    }) => {
        const response = await api.post(`/technician-tasks/from-order/${orderId}`, data);
        setTasks(prev => [...response.data, ...prev]);
        return response.data;
    }, []);

    const updateTask = useCallback(async (id: string, data: Partial<TechnicianTask>) => {
        const response = await api.put(`/technician-tasks/${id}`, data);
        setTasks(prev => prev.map(t => t.id === id ? response.data : t));
        return response.data;
    }, []);

    const assignTask = useCallback(async (id: string, data: {
        technician_id: string;
        scheduled_date?: string;
        scheduled_time?: string;
    }) => {
        const response = await api.put(`/technician-tasks/${id}/assign`, data);
        setTasks(prev => prev.map(t => t.id === id ? response.data : t));
        return response.data;
    }, []);

    const startTask = useCallback(async (id: string) => {
        const response = await api.put(`/technician-tasks/${id}/start`);
        setTasks(prev => prev.map(t => t.id === id ? response.data : t));
        return response.data;
    }, []);

    const completeTask = useCallback(async (id: string, data?: {
        notes?: string;
        duration_minutes?: number;
    }) => {
        const response = await api.put(`/technician-tasks/${id}/complete`, data || {});
        setTasks(prev => prev.map(t => t.id === id ? response.data : t));
        return response.data;
    }, []);

    const cancelTask = useCallback(async (id: string, notes?: string) => {
        const response = await api.put(`/technician-tasks/${id}/cancel`, { notes });
        setTasks(prev => prev.map(t => t.id === id ? response.data : t));
        return response.data;
    }, []);

    const addFeedback = useCallback(async (id: string, data: {
        customer_feedback?: string;
        rating?: number;
    }) => {
        const response = await api.put(`/technician-tasks/${id}/feedback`, data);
        setTasks(prev => prev.map(t => t.id === id ? response.data : t));
        return response.data;
    }, []);

    const deleteTask = useCallback(async (id: string) => {
        await api.delete(`/technician-tasks/${id}`);
        setTasks(prev => prev.filter(t => t.id !== id));
    }, []);

    const fetchStats = useCallback(async (filters?: {
        date_from?: string;
        date_to?: string;
    }) => {
        try {
            const params = new URLSearchParams();
            if (filters?.date_from) params.append('date_from', filters.date_from);
            if (filters?.date_to) params.append('date_to', filters.date_to);

            const response = await api.get(`/technician-tasks/stats/summary?${params.toString()}`);
            setStats(response.data);
            return response.data;
        } catch (error) {
            console.error('Error fetching stats:', error);
            throw error;
        }
    }, []);

    return {
        tasks,
        loading,
        stats,
        fetchTasks,
        fetchMyTasks,
        fetchTask,
        createTask,
        createTasksFromOrder,
        updateTask,
        assignTask,
        startTask,
        completeTask,
        cancelTask,
        addFeedback,
        deleteTask,
        fetchStats,
    };
}
