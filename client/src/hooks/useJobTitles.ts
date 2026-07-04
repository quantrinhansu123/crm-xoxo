import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export interface JobTitle {
    id: string;
    code: string;
    name: string;
    description?: string;
    status: 'active' | 'inactive';
    created_at?: string;
    updated_at?: string;
}

interface UseJobTitlesReturn {
    jobTitles: JobTitle[];
    loading: boolean;
    error: string | null;
    fetchJobTitles: (params?: { status?: string }) => Promise<void>;
    createJobTitle: (data: Partial<JobTitle>) => Promise<JobTitle>;
    updateJobTitle: (id: string, data: Partial<JobTitle>) => Promise<JobTitle>;
    deleteJobTitle: (id: string) => Promise<void>;
}

export function useJobTitles(): UseJobTitlesReturn {
    const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchJobTitles = useCallback(async (params?: { status?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams();
            if (params?.status) queryParams.set('status', params.status);

            const url = `/job-titles${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            const response = await api.get(url);
            const data = response?.data ?? response;
            setJobTitles(Array.isArray(data) ? data : []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lỗi khi tải danh sách chức danh';
            setError(message);
            console.error('Error fetching job titles:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const createJobTitle = useCallback(async (data: Partial<JobTitle>): Promise<JobTitle> => {
        const response = await api.post('/job-titles', data);
        const newItem = response.data || response;
        setJobTitles(prev => [...prev, newItem]);
        return newItem;
    }, []);

    const updateJobTitle = useCallback(async (id: string, data: Partial<JobTitle>): Promise<JobTitle> => {
        const response = await api.put(`/job-titles/${id}`, data);
        const updatedItem = response.data || response;
        setJobTitles(prev => prev.map(j => j.id === id ? updatedItem : j));
        return updatedItem;
    }, []);

    const deleteJobTitle = useCallback(async (id: string): Promise<void> => {
        await api.delete(`/job-titles/${id}`);
        setJobTitles(prev => prev.filter(j => j.id !== id));
    }, []);

    return {
        jobTitles,
        loading,
        error,
        fetchJobTitles,
        createJobTitle,
        updateJobTitle,
        deleteJobTitle
    };
}
