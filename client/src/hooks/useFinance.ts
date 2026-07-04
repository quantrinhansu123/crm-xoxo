import { useState, useCallback } from 'react';
import { financeApi } from '@/lib/api';

export interface Transaction {
    id: string;
    code: string;
    type: 'income' | 'expense';
    amount: number;
    category: string;
    description?: string;
    customer_id?: string;
    invoice_id?: string;
    supplier?: string;
    payment_method?: string;
    status: string;
    notes?: string;
    approved_by?: string;
    approved_at?: string;
    created_by: string;
    created_user?: { id: string; name: string };
    approved_user?: { id: string; name: string };
    created_at: string;
}

export function useFinance() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<{ totalIncome: number; totalExpense: number; profit: number } | null>(null);

    const fetchTransactions = useCallback(async (params?: {
        type?: string;
        status?: string;
        category?: string;
        from_date?: string;
        to_date?: string;
        page?: number;
    }) => {
        setLoading(true);
        try {
            const response = await financeApi.getTransactions(params);
            setTransactions(response.data.data?.transactions || []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải giao dịch');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchSummary = useCallback(async (params?: { from_date?: string; to_date?: string }) => {
        try {
            const response = await financeApi.getSummary(params);
            setSummary(response.data.data || null);
        } catch (err) {
            console.error('Error fetching summary:', err);
        }
    }, []);

    const createIncome = useCallback(async (data: Partial<Transaction>): Promise<Transaction> => {
        const response = await financeApi.createIncome(data);
        const newTransaction = response.data.data!.transaction;
        setTransactions(prev => [newTransaction, ...prev]);
        return newTransaction;
    }, []);

    const createExpense = useCallback(async (data: Partial<Transaction>): Promise<Transaction> => {
        const response = await financeApi.createExpense(data);
        const newTransaction = response.data.data!.transaction;
        setTransactions(prev => [newTransaction, ...prev]);
        return newTransaction;
    }, []);

    const approveTransaction = useCallback(async (id: string): Promise<Transaction> => {
        const response = await financeApi.approveTransaction(id);
        const updated = response.data.data!.transaction;
        setTransactions(prev => prev.map(t => t.id === id ? updated : t));
        return updated;
    }, []);

    const rejectTransaction = useCallback(async (id: string, reason: string): Promise<Transaction> => {
        const response = await financeApi.rejectTransaction(id, reason);
        const updated = response.data.data!.transaction;
        setTransactions(prev => prev.map(t => t.id === id ? updated : t));
        return updated;
    }, []);

    return {
        transactions,
        summary,
        loading,
        error,
        fetchTransactions,
        fetchSummary,
        createIncome,
        createExpense,
        approveTransaction,
        rejectTransaction,
    };
}
