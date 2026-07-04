import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/types';

interface CreateUserData {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role: string;
    department?: string | null;
    departmentId?: string | null;
    avatar?: string;
    salary?: number;
    commission?: number;
    bankAccount?: string;
    bankName?: string;
    telegramChatId?: string;
}

interface UpdateUserData {
    name?: string;
    phone?: string;
    role?: string;
    department?: string | null;
    departmentId?: string | null;
    status?: string;
    avatar?: string;
    salary?: number;
    commission?: number;
    bankAccount?: string;
    bankName?: string;
    telegramChatId?: string;
    password?: string;
    jobTitleId?: string;
    joinDate?: string;
    payrollBranchId?: string;
    workingBranchId?: string;
    dob?: string;
    gender?: string;
    identityCard?: string;
    kiotvietAccount?: string;
    facebook?: string;
    address?: string;
    mobileDevice?: string;
    notes?: string;
}

interface UseUsersReturn {
    users: User[];
    technicians: User[];
    salesPersons: User[];
    loading: boolean;
    error: string | null;
    fetchUsers: (params?: { role?: string }) => Promise<void>;
    fetchTechnicians: () => Promise<void>;
    fetchSales: () => Promise<void>;
    createUser: (data: CreateUserData) => Promise<User>;
    updateUser: (id: string, data: UpdateUserData) => Promise<User>;
    deleteUser: (id: string) => Promise<void>;
}

export function useUsers(): UseUsersReturn {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchUsers = useCallback(async (params?: { role?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams();
            if (params?.role) queryParams.set('role', params.role);

            const url = `/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await api.get(url);

            // Handle API response format: { status: 'success', data: { users: [...] } }
            const responseData = response?.data ?? response;
            const usersData = responseData?.data?.users ?? responseData?.users ?? responseData;

            const newData = Array.isArray(usersData) ? usersData : [];
            setUsers(prev => {
                const ids = new Set(newData.map(u => u.id));
                return [...prev.filter(u => !ids.has(u.id)), ...newData];
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lỗi khi tải danh sách người dùng';
            setError(message);
            console.error('Error fetching users:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchTechnicians = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Use dedicated technicians endpoint (accessible by all authenticated users)
            const response = await api.get('/users/technicians');

            // Handle API response format
            const responseData = response?.data ?? response;
            const usersData = responseData?.data?.users ?? responseData?.users ?? responseData;

            const newData = Array.isArray(usersData) ? usersData : [];
            setUsers(prev => {
                const ids = new Set(newData.map(u => u.id));
                return [...prev.filter(u => !ids.has(u.id)), ...newData];
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lỗi khi tải danh sách kỹ thuật viên';
            setError(message);
            console.error('Error fetching technicians:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchSales = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/users/sales');
            const responseData = response?.data ?? response;
            const usersData = responseData?.data?.users ?? responseData?.users ?? responseData;
            const newData = Array.isArray(usersData) ? usersData : [];
            setUsers(prev => {
                const ids = new Set(newData.map(u => u.id));
                return [...prev.filter(u => !ids.has(u.id)), ...newData];
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lỗi khi tải danh sách sales';
            setError(message);
            console.error('Error fetching sales:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const createUser = useCallback(async (data: CreateUserData): Promise<User> => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.post('/users', data);
            const responseData = response?.data ?? response;
            const newUser = responseData?.data?.user ?? responseData?.user ?? responseData;

            setUsers(prev => [newUser, ...prev]);
            return newUser;
        } catch (err: any) {
            const message = err?.response?.data?.message || err?.message || 'Lỗi khi tạo người dùng';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateUser = useCallback(async (id: string, data: UpdateUserData): Promise<User> => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.put(`/users/${id}`, data);
            const responseData = response?.data ?? response;
            const updatedUser = responseData?.data?.user ?? responseData?.user ?? responseData;

            setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updatedUser } : u));
            return updatedUser;
        } catch (err: any) {
            const message = err?.response?.data?.message || err?.message || 'Lỗi khi cập nhật người dùng';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteUser = useCallback(async (id: string): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            await api.delete(`/users/${id}`);
            setUsers(prev => prev.filter(u => u.id !== id));
        } catch (err: any) {
            const message = err?.response?.data?.message || err?.message || 'Lỗi khi xóa người dùng';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Filter professionals from users
    const technicians = Array.isArray(users) ? users.filter(u => u.role === 'technician') : [];
    const salesPersons = Array.isArray(users) ? users.filter(u => u.role === 'sale') : [];

    return {
        users,
        technicians,
        salesPersons,
        loading,
        error,
        fetchUsers,
        fetchTechnicians,
        fetchSales,
        createUser,
        updateUser,
        deleteUser
    };
}

