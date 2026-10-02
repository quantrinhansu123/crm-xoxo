import type { Lead, LeadNextAction, LeadOwner } from '@/hooks/useLeads';

/** Public read endpoint. Authentication and write APIs remain on the CRM backend. */
export const externalLeadsUrl = (import.meta.env.VITE_LEADS_READ_URL || '').trim();
export const externalLeadsEnabled = Boolean(externalLeadsUrl);
export const localLeadPreviewEnabled = import.meta.env.DEV && externalLeadsEnabled;

export const canonicalLeadColumns = ['NEED_DISCOVERY', 'PRICE_NEGOTIATION', 'APPOINTMENT_SHOP', 'APPOINTMENT_SHIP', 'WON'] as const;

// The API contract uses five codes; the CRM keeps its existing six visual columns.
export const canonicalLeadColumnToStage: Record<string, string> = {
    NEED_DISCOVERY: 'xac_dinh_nhu_cau',
    PRICE_NEGOTIATION: 'dam_phan_gia',
    APPOINTMENT_SHOP: 'hen_qua_ship',
    APPOINTMENT_SHIP: 'hen_qua_ship',
    WON: 'chot_don',
};

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function normalizeExternalLead(value: unknown): Lead {
    const raw = record(value);
    if (!raw) throw new Error('Dữ liệu lead không hợp lệ');
    const id = text(raw.lead_id) || text(raw.id);
    if (!id) throw new Error('Lead thiếu lead_id');
    const column = text(raw.kanban_column);
    if (!canonicalLeadColumns.some((item) => item === column)) {
        throw new Error(`Lead ${id} có kanban_column không hợp lệ: ${column || '(trống)'}`);
    }
    const customer = record(raw.customer);
    const ownerRaw = record(raw.owner);
    const owner: LeadOwner | null = ownerRaw ? {
        ...ownerRaw,
        staff_uid: text(ownerRaw.staff_uid) || text(ownerRaw.id) || text(ownerRaw.user_id) || null,
        display_name: text(ownerRaw.display_name) || text(ownerRaw.name) || null,
    } : null;
    const message = record(raw.last_message);
    const action = record(raw.next_action);
    if (raw.next_action != null && !action) throw new Error(`Lead ${id}: next_action phải là object hoặc null`);
    const nextAction: LeadNextAction | null = action ? {
        ...action,
        display_text: text(action.display_text),
    } : null;
    return {
        ...raw,
        id,
        lead_id: id,
        name: text(customer?.display_name) || text(raw.name) || 'Khách',
        phone: text(customer ? customer.phone : raw.phone),
        avatar_url: text(customer ? customer.avatar_url : raw.avatar_url) || null,
        source: text(raw.channel) || text(raw.source) || 'other',
        fb_thread_id: text(raw.conversation_id) || text(raw.fb_thread_id),
        link_message: text(raw.pancake_url) || text(raw.link_message),
        fb_profile_name: text(customer?.display_name) || text(raw.fb_profile_name),
        status: column,
        kanban_column: column,
        owner,
        assigned_to: owner?.staff_uid || undefined,
        assigned_user: owner ? { id: owner.staff_uid || '', name: owner.display_name || 'Chưa có tên Sale', email: '' } : undefined,
        owner_sale: owner?.display_name || undefined,
        next_action: nextAction,
        customer_insight: text(raw.customer_insight),
        ai_suggested_reply: text(raw.ai_suggested_reply),
        last_message_text: text(message?.text ?? message?.content_text ?? raw.last_message_text),
        last_message_time: text(message?.sent_at ?? message?.inserted_at ?? raw.last_message_time),
        last_message_mid: text(message?.message_id ?? raw.last_message_mid),
        last_actor: message?.direction === 'in' ? 'lead' : message?.direction === 'out' ? 'sale' : text(raw.last_actor),
        created_at: text(raw.created_at),
        lead_score: typeof raw.lead_score === 'number' ? raw.lead_score : undefined,
        loss_risk: text(raw.loss_risk) || undefined,
    } as Lead;
}

export function getLeadNextActionText(lead: Pick<Lead, 'next_action'>): string {
    return typeof lead.next_action === 'string' ? lead.next_action : lead.next_action?.display_text || '';
}

export function getLeadOwnerName(lead: Pick<Lead, 'owner' | 'assigned_user' | 'owner_sale'>): string {
    if ('owner' in lead) return lead.owner ? lead.owner.display_name || 'Chưa có tên Sale' : 'Chưa gán Sale';
    return lead.assigned_user?.name || lead.owner_sale || 'Chưa gán Sale';
}

async function readExternalBody(): Promise<Record<string, unknown>> {
    const response = await fetch(externalLeadsUrl, {
        method: 'GET', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`API Leads trả HTTP ${response.status}`);
    const body = record(await response.json());
    if (!body) throw new Error('API Leads không trả object JSON hợp lệ');
    if (body.status && body.status !== 'success') throw new Error(text(body.message) || 'API Leads báo lỗi');
    return body;
}

export function extractExternalLeadList(body: Record<string, unknown>): Lead[] {
    // An explicit empty list must remain empty, even if a separate detail is present.
    if (Array.isArray(body.data)) return body.data.map(normalizeExternalLead);
    if (record(body.lead)) return [normalizeExternalLead(body.lead)];
    throw new Error('API Leads thiếu data: [...] hoặc lead: {...}');
}

export async function readExternalLeads(params: { page?: number; limit?: number; search?: string; source?: string; status?: string } = {}) {
    const body = await readExternalBody();
    let leads = extractExternalLeadList(body);
    const search = (params.search || '').trim().toLocaleLowerCase('vi');
    if (search) leads = leads.filter((lead) => `${lead.name} ${lead.phone}`.toLocaleLowerCase('vi').includes(search));
    if (params.source) leads = leads.filter((lead) => lead.source === params.source);
    if (params.status) leads = leads.filter((lead) => lead.kanban_column === params.status);
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || 100);
    const total = leads.length;
    return { data: { status: 'success' as const, data: {
        leads: leads.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    } } };
}

export async function readExternalLead(id: string) {
    const body = await readExternalBody();
    const detail = record(body.lead) ? normalizeExternalLead(body.lead) : null;
    const lead = detail?.id === id ? detail : extractExternalLeadList(body).find((item) => item.id === id);
    if (!lead) throw new Error('Không tìm thấy lead trong nguồn dữ liệu này');
    return { data: { status: 'success', data: { lead } } };
}

export function requireCrmLeadWrites(): void {
    // Writes are enabled and routed to CRM backend
}
