import { useState, useCallback } from 'react';
import { customersApi } from '@/lib/api';

export interface Customer {
    id: string;
    code?: string;
    name: string;
    phone: string;
    dob?: string;
    email?: string;
    type: 'individual' | 'company';
    company?: string;
    tax_code?: string;
    address?: string;
    source?: string;
    status: string;
    assigned_to?: string;
    assigned_user?: { id: string; name: string; email: string };
    lead_id?: string;
    last_contact?: string;
    notes?: string;
    tags?: string[];
    total_orders?: number;
    total_spent?: number;
    created_at: string;
    updated_at?: string;
}

export interface UseCustomersReturn {
    customers: Customer[];
    loading: boolean;
    error: string | null;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    fetchCustomers: (params?: {
        type?: string;
        status?: string;
        search?: string;
        page?: number;
        limit?: number;
    }) => Promise<void>;
    getCustomer: (id: string) => Promise<Customer>;
    createCustomer: (data: Partial<Customer>) => Promise<Customer>;
    updateCustomer: (id: string, data: Partial<Customer>) => Promise<Customer>;
    deleteCustomer: (id: string) => Promise<void>;
}

export function useCustomers(): UseCustomersReturn {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
    });

    const fetchCustomers = useCallback(async (params?: {
        type?: string;
        status?: string;
        search?: string;
        page?: number;
        limit?: number;
    }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await customersApi.getAll(params);
            const data = response.data.data;
            setCustomers(data.customers || []);
            if (data.pagination) {
                setPagination({
                    page: data.pagination.page,
                    limit: data.pagination.limit,
                    total: data.pagination.total,
                    totalPages: data.pagination.totalPages || Math.ceil(data.pagination.total / data.pagination.limit)
                });
            }
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi tải danh sách khách hàng';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const getCustomer = useCallback(async (id: string): Promise<Customer> => {
        setLoading(true);
        setError(null);
        try {
            const response = await customersApi.getById(id);
            return response.data.data!.customer;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi tải thông tin khách hàng';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const createCustomer = useCallback(async (data: Partial<Customer>): Promise<Customer> => {
        setLoading(true);
        setError(null);
        try {
            const response = await customersApi.create(data);
            const newCustomer = response.data.data!.customer;
            setCustomers(prev => [newCustomer, ...prev]);
            return newCustomer;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi tạo khách hàng';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateCustomer = useCallback(async (id: string, data: Partial<Customer>): Promise<Customer> => {
        setLoading(true);
        setError(null);
        try {
            const response = await customersApi.update(id, data);
            const updatedCustomer = response.data.data!.customer;
            setCustomers(prev => prev.map(c => c.id === id ? updatedCustomer : c));
            return updatedCustomer;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi cập nhật khách hàng';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteCustomer = useCallback(async (id: string): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            await customersApi.delete(id);
            setCustomers(prev => prev.filter(c => c.id !== id));
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi xóa khách hàng';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        customers,
        loading,
        error,
        pagination,
        fetchCustomers,
        getCustomer,
        createCustomer,
        updateCustomer,
        deleteCustomer,
    };
}
