import { useState, useCallback, useEffect, useRef } from 'react';
import { leadsApi } from '@/lib/api';

export interface Lead {
    id: string;
    name: string;
    phone: string;
    dob?: string;
    email?: string;
    company?: string;
    address?: string;

    // Channel & Source
    source?: string;           // Legacy field
    channel?: string;          // New: facebook, zalo, website, referral, etc.
    lead_id?: string;          // External lead ID
    lead_type?: string;        // individual, company, etc.

    // Status & Pipeline
    status: string;
    pipeline_stage?: string;
    followup_step?: number;
    round_index?: number;

    // Assignment
    assigned_to?: string;      // Legacy UUID field
    assigned_user?: { id: string; name: string; email: string };
    sale_token?: string;       // New: Token/ID of assigned salesperson
    owner_sale?: string;       // New: Token/ID of lead owner

    // FB Messenger Integration
    fb_thread_id?: string;
    link_message?: string;

    // Last Message Info
    last_message_mid?: string;
    last_message_text?: string;
    last_message_time?: string;
    last_actor?: string;       // 'lead' or 'sale'

    // Delivery & Appointment (new)
    delivery_method?: 'direct' | 'ship';
    tracking_code?: string;
    shipping_fee?: number;
    appointment_time?: string;
    t_due?: string;
    t_last_inbound?: string;
    t_last_outbound?: string;
    sla_state?: string;        // 'ok', 'warning', 'overdue'

    // Notes & Metadata
    notes?: string;            // Legacy
    note?: string;             // New
    last_contact?: string;
    created_at: string;
    updated_at?: string;

    // Facebook Profile (new)
    fb_profile_name?: string;
    fb_profile_pic?: string | null;
    fb_link?: string;

    // AI Analysis (new)
    lead_score?: number;
    loss_risk?: string;
    next_action?: string;
    customer_insight?: string;

    // Follow-up (new)
    next_followup_time?: string;
    care_note?: string;
    avatar_url?: string | null;

    // Sale Memory (new from n8n)
    sale_memory?: string;
    quoted_price_last?: string;
    quoted_service?: string;
    sale_note_summary?: string;
    deposit_info?: string;
    eta_note?: string;
}

export interface UseLeadsReturn {
    leads: Lead[];
    loading: boolean;
    error: string | null;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    fetchLeads: (params?: {
        status?: string;
        source?: string;
        search?: string;
        page?: number;
        limit?: number;
    }) => Promise<void>;
    createLead: (data: Partial<Lead>) => Promise<Lead>;
    updateLead: (id: string, data: Partial<Lead>) => Promise<Lead>;
    deleteLead: (id: string) => Promise<void>;
    convertLead: (id: string) => Promise<any>;
}

export function useLeads(): UseLeadsReturn {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 500,
        total: 0,
        totalPages: 0,
    });

    const fetchLeads = useCallback(async (params?: {
        status?: string;
        source?: string;
        search?: string;
        page?: number;
        limit?: number;
    }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await leadsApi.getAll(params);
            const data = response.data.data;
            setLeads(data.leads || []);
            if (data.pagination) {
                setPagination({
                    page: data.pagination.page,
                    limit: data.pagination.limit,
                    total: data.pagination.total,
                    totalPages: data.pagination.totalPages || Math.ceil(data.pagination.total / data.pagination.limit)
                });
            }
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi tải danh sách leads';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const createLead = useCallback(async (data: Partial<Lead>): Promise<Lead> => {
        setLoading(true);
        setError(null);
        try {
            const payload: Partial<Lead> = { ...data };
            const trimOrDrop = (key: keyof Lead) => {
                const val = payload[key];
                if (typeof val === 'string') {
                    const trimmed = val.trim();
                    if (trimmed === '') {
                        delete payload[key];
                    } else {
                        (payload as Record<string, unknown>)[key as string] = trimmed;
                    }
                }
            };
            trimOrDrop('fb_thread_id');
            trimOrDrop('fb_link');
            trimOrDrop('link_message');
            trimOrDrop('email');
            trimOrDrop('company');
            trimOrDrop('address');
            trimOrDrop('notes');
            trimOrDrop('dob');
            if (payload.assigned_to === '') {
                delete payload.assigned_to;
            }

            const response = await leadsApi.create(payload);
            const newLead = response.data.data!.lead;
            await fetchLeads({ limit: 500 });
            return newLead;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi tạo lead';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, [fetchLeads]);

    const updateLead = useCallback(async (id: string, data: Partial<Lead>): Promise<Lead> => {
        setLoading(true);
        setError(null);
        try {
            const response = await leadsApi.update(id, data);
            const updatedLead = response.data.data!.lead;
            setLeads(prev => prev.map(l => l.id === id ? updatedLead : l));
            return updatedLead;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi cập nhật lead';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteLead = useCallback(async (id: string): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            await leadsApi.delete(id);
            await fetchLeads({ limit: 500 });
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi xóa lead';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, [fetchLeads]);

    const convertLead = useCallback(async (id: string): Promise<any> => {
        setLoading(true);
        setError(null);
        try {
            const response = await leadsApi.convert(id);
            // Update lead status in local state
            setLeads(prev => prev.map(l => l.id === id ? { ...l, status: 'converted' } : l));
            return response.data.data!.customer;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi chuyển đổi lead';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const lastParamsRef = useRef<{status?: string; source?: string; search?: string; page?: number; limit?: number}>({});
    
    const fetchLeadsWithParams = useCallback(async (params?: {status?: string; source?: string; search?: string; page?: number; limit?: number}) => {
        lastParamsRef.current = params || {};
        await fetchLeads(params);
    }, [fetchLeads]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchLeads(lastParamsRef.current);
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchLeads]);

    return {
        leads,
        loading,
        error,
        pagination,
        fetchLeads: fetchLeadsWithParams,
        createLead,
        updateLead,
        deleteLead,
        convertLead,
    };
}
