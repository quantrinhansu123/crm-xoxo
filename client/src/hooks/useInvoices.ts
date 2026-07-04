import { useState, useCallback } from 'react';
import { invoicesApi } from '@/lib/api';

export interface Invoice {
    id: string;
    invoice_code: string;
    order_id: string;
    order?: { id: string; order_code: string };
    customer_id: string;
    customer?: { id: string; name: string; phone: string; email?: string };
    subtotal: number;
    discount: number;
    total_amount: number;
    payment_method?: string;
    status: string;
    notes?: string;
    paid_at?: string;
    created_by: string;
    created_user?: { id: string; name: string };
    created_at: string;
    updated_at?: string;
}

export function useInvoices() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
    });

    const fetchInvoices = useCallback(async (params?: {
        status?: string;
        customer_id?: string;
        page?: number;
        limit?: number;
    }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await invoicesApi.getAll(params);
            const data = response.data.data;
            setInvoices(data.invoices || []);
            if (data.pagination) {
                setPagination(data.pagination);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải danh sách hóa đơn');
        } finally {
            setLoading(false);
        }
    }, []);

    const getInvoice = useCallback(async (id: string): Promise<Invoice> => {
        setLoading(true);
        try {
            const response = await invoicesApi.getById(id);
            return response.data.data!.invoice;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi tải thông tin hóa đơn';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const createInvoice = useCallback(async (data: {
        order_id: string;
        payment_method?: string;
        notes?: string;
    }): Promise<Invoice> => {
        setLoading(true);
        try {
            const response = await invoicesApi.create(data);
            const newInvoice = response.data.data!.invoice;
            setInvoices(prev => [newInvoice, ...prev]);
            return newInvoice;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi tạo hóa đơn';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateInvoiceStatus = useCallback(async (id: string, status: string): Promise<Invoice> => {
        setLoading(true);
        try {
            const response = await invoicesApi.updateStatus(id, status);
            const updated = response.data.data!.invoice;
            setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: updated.status, paid_at: updated.paid_at } : i));
            return updated;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi cập nhật trạng thái';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        invoices,
        loading,
        error,
        pagination,
        fetchInvoices,
        getInvoice,
        createInvoice,
        updateInvoiceStatus,
    };
}
