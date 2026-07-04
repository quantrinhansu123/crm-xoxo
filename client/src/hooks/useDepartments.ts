import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export interface Department {
    id: string;
    code: string;
    name: string;
    description?: string;
    manager_id?: string | null;
    manager?: {
        id: string;
        name: string;
        email: string;
        avatar?: string;
    };
    status: 'active' | 'inactive';
    created_at?: string;
    updated_at?: string;
}

interface UseDepartmentsReturn {
    departments: Department[];
    loading: boolean;
    error: string | null;
    fetchDepartments: (params?: { status?: string }) => Promise<void>;
    createDepartment: (data: Partial<Department>) => Promise<Department>;
    updateDepartment: (id: string, data: Partial<Department>) => Promise<Department>;
    deleteDepartment: (id: string) => Promise<void>;
}

export function useDepartments(): UseDepartmentsReturn {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchDepartments = useCallback(async (params?: { status?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams();
            if (params?.status) queryParams.set('status', params.status);

            const url = `/departments${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await api.get(url);
            const data = response?.data ?? response;
            setDepartments(Array.isArray(data) ? data : []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lỗi khi tải danh sách phòng ban';
            setError(message);
            console.error('Error fetching departments:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const createDepartment = useCallback(async (data: Partial<Department>): Promise<Department> => {
        const response = await api.post('/departments', data);
        const newDept = response.data || response;
        setDepartments(prev => [...prev, newDept]);
        return newDept;
    }, []);

    const updateDepartment = useCallback(async (id: string, data: Partial<Department>): Promise<Department> => {
        const response = await api.put(`/departments/${id}`, data);
        const updatedDept = response.data || response;
        setDepartments(prev => prev.map(d => d.id === id ? updatedDept : d));
        return updatedDept;
    }, []);

    const deleteDepartment = useCallback(async (id: string): Promise<void> => {
        await api.delete(`/departments/${id}`);
        setDepartments(prev => prev.filter(d => d.id !== id));
    }, []);

    return {
        departments,
        loading,
        error,
        fetchDepartments,
        createDepartment,
        updateDepartment,
        deleteDepartment
    };
}

