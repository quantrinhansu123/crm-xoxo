import { useState, useCallback } from 'react';
import { usersApi } from '@/lib/api';

export interface Employee {
    id: string;
    email: string;
    name: string;
    role: string;
    phone?: string;
    avatar?: string;
    department?: string;
    status: string;
    created_at: string;
    last_login?: string;
}

export function useEmployees() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchEmployees = useCallback(async (params?: { role?: string; department?: string; status?: string; search?: string }) => {
        setLoading(true);
        try {
            const response = await usersApi.getAll(params);
            setEmployees(response.data.data?.users || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải danh sách nhân viên');
        } finally {
            setLoading(false);
        }
    }, []);

    const getEmployee = useCallback(async (id: string): Promise<Employee> => {
        const response = await usersApi.getById(id);
        return response.data.data!.user;
    }, []);

    const updateEmployee = useCallback(async (id: string, data: Partial<Employee>): Promise<Employee> => {
        const response = await usersApi.update(id, data);
        const updated = response.data.data!.user;
        setEmployees(prev => prev.map(e => e.id === id ? updated : e));
        return updated;
    }, []);

    const deleteEmployee = useCallback(async (id: string): Promise<void> => {
        await usersApi.delete(id);
        setEmployees(prev => prev.filter(e => e.id !== id));
    }, []);

    return {
        employees,
        loading,
        error,
        fetchEmployees,
        getEmployee,
        updateEmployee,
        deleteEmployee,
    };
}
