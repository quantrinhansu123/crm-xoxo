import { useState, useCallback } from 'react';
import { interactionsApi } from '@/lib/api';

export interface Interaction {
    id: string;
    customer_id?: string;
    lead_id?: string;
    customer?: { id: string; name: string; phone: string };
    lead?: { id: string; name: string; phone: string };
    type: string;
    subject: string;
    content?: string;
    result?: string;
    duration?: number;
    next_action?: string;
    next_action_date?: string;
    created_by: string;
    created_user?: { id: string; name: string };
    created_at: string;
    updated_at?: string;
}

export function useInteractions() {
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
    });

    const fetchInteractions = useCallback(async (params?: {
        customer_id?: string;
        lead_id?: string;
        created_by?: string;
        type?: string;
        result?: string;
        page?: number;
        limit?: number;
    }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await interactionsApi.getAll(params);
            const data = response.data.data;
            setInteractions(data.interactions || []);
            if (data.pagination) {
                setPagination(data.pagination);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Lỗi khi tải danh sách tương tác');
        } finally {
            setLoading(false);
        }
    }, []);

    const createInteraction = useCallback(async (data: Partial<Interaction>): Promise<Interaction> => {
        setLoading(true);
        try {
            const response = await interactionsApi.create(data);
            const newInteraction = response.data.data!.interaction;
            setInteractions(prev => [newInteraction, ...prev]);
            return newInteraction;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi tạo tương tác';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateInteraction = useCallback(async (id: string, data: Partial<Interaction>): Promise<Interaction> => {
        setLoading(true);
        try {
            const response = await interactionsApi.update(id, data);
            const updated = response.data.data!.interaction;
            setInteractions(prev => prev.map(i => i.id === id ? updated : i));
            return updated;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi cập nhật tương tác';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteInteraction = useCallback(async (id: string): Promise<void> => {
        setLoading(true);
        try {
            await interactionsApi.delete(id);
            setInteractions(prev => prev.filter(i => i.id !== id));
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi xóa tương tác';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const getPendingFollowups = useCallback(async () => {
        try {
            const response = await interactionsApi.getPendingFollowups();
            return response.data.data?.followups || [];
        } catch (err: any) {
            return [];
        }
    }, []);

    return {
        interactions,
        loading,
        error,
        pagination,
        fetchInteractions,
        createInteraction,
        updateInteraction,
        deleteInteraction,
        getPendingFollowups,
    };
}
