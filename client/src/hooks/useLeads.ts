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
    source?: string;
    channel?: string;
    lead_id?: string;
    lead_type?: string;

    // Status & Pipeline
    status: string;
    pipeline_stage?: string;
    followup_step?: number;
    round_index?: number;

    // Assignment
    assigned_to?: string;
    assigned_user?: { id: string; name: string; email: string };
    sale_token?: string;
    owner_sale?: string;

    // FB Messenger Integration
    fb_thread_id?: string;
    link_message?: string;

    // Last Message Info
    last_message_mid?: string;
    last_message_text?: string;
    last_message_time?: string;
    last_actor?: string;
    current_deadline_at?: string;
    current_rule_index?: number;

    // Delivery & Appointment
    delivery_method?: 'direct' | 'ship';
    tracking_code?: string;
    shipping_fee?: number;
    appointment_time?: string;
    t_due?: string;
    t_last_inbound?: string;
    t_last_outbound?: string;
    sla_state?: string;

    // Notes & Metadata
    notes?: string;
    note?: string;
    last_contact?: string;
    created_at: string;
    updated_at?: string;

    // Facebook Profile
    fb_profile_name?: string;
    fb_profile_pic?: string | null;
    fb_link?: string;

    // AI Analysis
    lead_score?: number;
    loss_risk?: string;
    next_action?: string;
    customer_insight?: string;

    // Follow-up
    next_followup_time?: string;
    care_note?: string;
    avatar_url?: string | null;

    // Sale Memory
    sale_memory?: string;
    quoted_price_last?: string;
    quoted_service?: string;
    sale_note_summary?: string;
    deposit_info?: string;
    eta_note?: string;
}

type FetchParams = {
    status?: string;
    source?: string;
    search?: string;
    page?: number;
    limit?: number;
};

type FetchOptions = {
    /** Không bật full-page loading (dùng cho poll nền) */
    silent?: boolean;
};

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
    fetchLeads: (params?: FetchParams, options?: FetchOptions) => Promise<void>;
    createLead: (data: Partial<Lead>) => Promise<Lead>;
    updateLead: (id: string, data: Partial<Lead>) => Promise<Lead>;
    deleteLead: (id: string) => Promise<void>;
    convertLead: (id: string) => Promise<any>;
}

/** Tải đủ leads cho Kanban — tránh kẹt thống kê ở 500 */
export const LEADS_LIST_LIMIT = 5000;

export function useLeads(): UseLeadsReturn {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: LEADS_LIST_LIMIT,
        total: 0,
        totalPages: 0,
    });

    const lastParamsRef = useRef<FetchParams>({ limit: LEADS_LIST_LIMIT });
    const fetchSeqRef = useRef(0);

    const fetchLeads = useCallback(async (params?: FetchParams, options?: FetchOptions) => {
        const silent = !!options?.silent;
        const seq = ++fetchSeqRef.current;
        if (params) {
            lastParamsRef.current = params;
        }

        if (!silent) setLoading(true);
        setError(null);
        try {
            const response = await leadsApi.getAll(lastParamsRef.current);
            // Bỏ qua response cũ nếu đã có request mới hơn
            if (seq !== fetchSeqRef.current) return;

            const data = response.data?.data;
            const nextLeads = Array.isArray(data?.leads) ? data.leads : [];
            setLeads(nextLeads);
            if (data?.pagination) {
                setPagination({
                    page: data.pagination.page,
                    limit: data.pagination.limit,
                    total: data.pagination.total,
                    totalPages:
                        data.pagination.totalPages ||
                        Math.ceil(data.pagination.total / data.pagination.limit),
                });
            }
        } catch (err: any) {
            if (seq !== fetchSeqRef.current) return;
            const message = err.response?.data?.message || 'Lỗi khi tải danh sách leads';
            setError(message);
        } finally {
            if (seq === fetchSeqRef.current && !silent) {
                setLoading(false);
            }
            // Silent request vẫn tắt loading nếu đây là request mới nhất và đang loading từ lần đầu
            if (seq === fetchSeqRef.current && silent) {
                setLoading((prev) => (prev ? false : prev));
            }
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
            await fetchLeads(lastParamsRef.current);
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
        setError(null);
        try {
            const response = await leadsApi.update(id, data);
            const updatedLead = response.data.data!.lead;
            setLeads((prev) => prev.map((l) => (l.id === id ? updatedLead : l)));
            return updatedLead;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi cập nhật lead';
            setError(message);
            throw new Error(message);
        }
    }, []);

    const deleteLead = useCallback(async (id: string): Promise<void> => {
        setError(null);
        try {
            await leadsApi.delete(id);
            setLeads((prev) => prev.filter((l) => l.id !== id));
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi xóa lead';
            setError(message);
            throw new Error(message);
        }
    }, []);

    const convertLead = useCallback(async (id: string): Promise<any> => {
        setError(null);
        try {
            const response = await leadsApi.convert(id);
            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'converted' } : l)));
            return response.data.data!.customer;
        } catch (err: any) {
            const message = err.response?.data?.message || 'Lỗi khi chuyển đổi lead';
            setError(message);
            throw new Error(message);
        }
    }, []);

    // Poll nền im lặng — không bật lại full-page loading
    useEffect(() => {
        const interval = setInterval(() => {
            fetchLeads(undefined, { silent: true });
        }, 15000);
        return () => clearInterval(interval);
    }, [fetchLeads]);

    return {
        leads,
        loading,
        error,
        pagination,
        fetchLeads,
        createLead,
        updateLead,
        deleteLead,
        convertLead,
    };
}
