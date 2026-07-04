import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

export interface WorkflowStep {
    id: string;
    step_order: number;
    name: string | null;
    description: string | null;
    estimated_duration: number;
    is_required: boolean;
    department: {
        id: string;
        name: string;
        code: string;
    };
}

export interface Workflow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    status: 'active' | 'inactive';
    steps: WorkflowStep[];
    created_by_user?: {
        id: string;
        name: string;
    };
    created_at: string;
    updated_at: string;
}

export interface CreateWorkflowInput {
    name: string;
    description?: string;
    status?: 'active' | 'inactive';
    steps?: {
        department_id: string;
        name?: string;
        description?: string;
        estimated_duration?: number;
        is_required?: boolean;
    }[];
    created_by?: string;
}

export interface UpdateWorkflowInput {
    name?: string;
    description?: string;
    status?: 'active' | 'inactive';
    steps?: {
        department_id: string;
        name?: string;
        description?: string;
        estimated_duration?: number;
        is_required?: boolean;
    }[];
}

export function useWorkflows() {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWorkflows = useCallback(async (status?: string) => {
        try {
            setLoading(true);
            setError(null);
            const params = status ? `?status=${status}` : '';
            const response = await api.get(`/workflows${params}`);
            setWorkflows(response.data);
        } catch (err) {
            setError('Không thể tải danh sách quy trình');
            console.error('Error fetching workflows:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const getWorkflow = useCallback(async (id: string): Promise<Workflow | null> => {
        try {
            const response = await api.get(`/workflows/${id}`);
            return response.data;
        } catch (err) {
            console.error('Error fetching workflow:', err);
            return null;
        }
    }, []);

    const createWorkflow = useCallback(async (data: CreateWorkflowInput): Promise<Workflow | null> => {
        try {
            const response = await api.post('/workflows', data);
            setWorkflows(prev => [response.data, ...prev]);
            return response.data;
        } catch (err) {
            console.error('Error creating workflow:', err);
            throw err;
        }
    }, []);

    const updateWorkflow = useCallback(async (id: string, data: UpdateWorkflowInput): Promise<Workflow | null> => {
        try {
            const response = await api.put(`/workflows/${id}`, data);
            setWorkflows(prev => prev.map(w => w.id === id ? response.data : w));
            return response.data;
        } catch (err) {
            console.error('Error updating workflow:', err);
            throw err;
        }
    }, []);

    const deleteWorkflow = useCallback(async (id: string): Promise<boolean> => {
        try {
            await api.delete(`/workflows/${id}`);
            setWorkflows(prev => prev.filter(w => w.id !== id));
            return true;
        } catch (err) {
            console.error('Error deleting workflow:', err);
            throw err;
        }
    }, []);

    const assignWorkflowToService = useCallback(async (serviceId: string, workflowId: string | null) => {
        try {
            const response = await api.post('/workflows/assign-service', {
                service_id: serviceId,
                workflow_id: workflowId
            });
            return response.data;
        } catch (err) {
            console.error('Error assigning workflow:', err);
            throw err;
        }
    }, []);

    const getServicesUsingWorkflow = useCallback(async (workflowId: string) => {
        try {
            const response = await api.get(`/workflows/${workflowId}/services`);
            return response.data;
        } catch (err) {
            console.error('Error fetching services:', err);
            return [];
        }
    }, []);

    useEffect(() => {
        fetchWorkflows();
    }, [fetchWorkflows]);

    return {
        workflows,
        loading,
        error,
        fetchWorkflows,
        getWorkflow,
        createWorkflow,
        updateWorkflow,
        deleteWorkflow,
        assignWorkflowToService,
        getServicesUsingWorkflow,
    };
}
