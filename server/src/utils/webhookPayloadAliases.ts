/**
 * Chuẩn hóa alias field cho webhook n8n / Telegram — giữ field cũ để không breaking.
 */

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function toIsoOrNull(raw: unknown): string | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const d = new Date(String(raw));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Chuẩn hóa payload lead từ n8n/Pancake trước khi xử lý.
 * Map alias phổ biến → field CRM chuẩn (không breaking field cũ).
 */
export function normalizeN8nLeadPayload(incoming: Record<string, any> | null | undefined): Record<string, any> {
    if (!incoming || typeof incoming !== 'object') return {};

    const data = { ...incoming };

    // message_time (n8n) → last_message_time
    if (!data.last_message_time && data.message_time) {
        data.last_message_time = data.message_time;
    }

    // assigned_to_name (n8n) → owner_sale
    if (!data.owner_sale && data.assigned_to_name) {
        data.owner_sale = data.assigned_to_name;
    }

    // customer_id từ Pancake đôi khi là pancake customer id
    if (!data.pancake_customer_id && data.pancake_customer_id_alt) {
        data.pancake_customer_id = data.pancake_customer_id_alt;
    }

    // Alias thời điểm khách/sale
    if (!data.last_customer_message_at && data.t_last_customer_message) {
        data.last_customer_message_at = data.t_last_customer_message;
    }
    if (!data.last_staff_reply_at && data.t_last_staff_reply) {
        data.last_staff_reply_at = data.t_last_staff_reply;
    }

    // Nếu last_actor=sale và có message time → coi là staff reply time
    const actor = String(data.last_actor || '').trim().toLowerCase();
    const msgAt = data.last_message_time || data.message_time || null;
    if (actor === 'sale' || actor === 'agent' || actor === 'staff' || actor === 'page') {
        if (!data.last_staff_reply_at && msgAt) data.last_staff_reply_at = msgAt;
        if (!data.t_last_outbound && msgAt) data.t_last_outbound = msgAt;
    } else if (actor === 'lead' || actor === 'customer' || actor === 'khach' || actor === 'khách' || actor === 'user' || actor === 'client') {
        if (!data.last_customer_message_at && msgAt) data.last_customer_message_at = msgAt;
        if (!data.t_last_inbound && msgAt) data.t_last_inbound = msgAt;
    }

    return data;
}

/** Các key n8n không phải cột DB leads — bỏ khỏi update bừa */
export const N8N_LEAD_NON_DB_KEYS = [
    'message_time',
    'assigned_to_name',
    'customer_id', // CRM customers.id — không phải cột leads
    'message_id',
    'request_id',
    'page_id',
    'message_direction',
    'last_customer_message_at',
    'last_staff_reply_at',
    't_last_customer_message',
    't_last_staff_reply',
    't_last_message',
    'event',
    'data',
] as const;

/** Đọc timestamp khách nhắn từ payload n8n/Pancake */
export function resolveLeadCustomerMessageAt(data: Record<string, any> | null | undefined): string | null {
    if (!data) return null;
    return toIsoOrNull(
        data.last_customer_message_at
        ?? data.t_last_customer_message
        ?? data.t_last_inbound
        ?? ((String(data.last_actor || '').toLowerCase() === 'lead' || String(data.message_direction || '').toLowerCase() === 'inbound')
            ? (data.last_message_time ?? data.message_time)
            : null)
    );
}

/** Đọc timestamp sale rep từ payload n8n/Pancake */
export function resolveLeadStaffReplyAt(data: Record<string, any> | null | undefined): string | null {
    if (!data) return null;
    return toIsoOrNull(
        data.last_staff_reply_at
        ?? data.t_last_staff_reply
        ?? data.t_last_outbound
        ?? ((String(data.last_actor || '').toLowerCase() === 'sale' || String(data.message_direction || '').toLowerCase() === 'outbound')
            ? (data.last_message_time ?? data.message_time)
            : null)
    );
}

/** Thêm alias SLA cho lead (outbound webhook / API response) */
export function enrichLeadSlaFields<T extends Record<string, any>>(lead: T | null | undefined): T | null | undefined {
    if (!lead || typeof lead !== 'object') return lead;

    const inbound = lead.t_last_inbound ?? lead.last_customer_message_at ?? lead.t_last_customer_message ?? null;
    const outbound = lead.t_last_outbound ?? lead.last_staff_reply_at ?? lead.t_last_staff_reply ?? null;

    return {
        ...lead,
        t_last_inbound: inbound,
        t_last_outbound: outbound,
        last_customer_message_at: inbound,
        t_last_customer_message: inbound,
        last_staff_reply_at: outbound,
        t_last_staff_reply: outbound,
    };
}

function resolveSaleNameFromOrder(order: Record<string, any> | null | undefined): string | null {
    if (!order) return null;
    const salesUser = firstRelation(order.sales_user);
    return (
        order.sale_name
        ?? order.sales_name
        ?? salesUser?.name
        ?? order.owner_sale
        ?? null
    );
}

function resolveCreatedByNameFromOrder(order: Record<string, any> | null | undefined): string | null {
    if (!order) return null;
    const createdByUser = firstRelation(order.created_by_user);
    return order.created_by_name ?? createdByUser?.name ?? null;
}

/** Thêm alias sale / người tạo cho order trong CRM Master payload */
export function enrichOrderTelegramFields(order: Record<string, any> | null | undefined): Record<string, any> | null | undefined {
    if (!order || typeof order !== 'object') return order;

    const saleName = resolveSaleNameFromOrder(order);
    const createdByName = resolveCreatedByNameFromOrder(order);

    return {
        ...order,
        ...(saleName ? { sale_name: saleName, sales_name: saleName } : {}),
        ...(createdByName ? { created_by_name: createdByName } : {}),
    };
}

/** Alias phiếu thu/chi + hóa đơn cho n8n */
export function enrichFinanceWebhookPayload(
    event: string,
    data: Record<string, any>,
    actor?: { id?: string; name?: string; role?: string }
): Record<string, any> {
    const enriched: Record<string, any> = { ...data };

    if (data.code && !enriched.voucher_code) {
        enriched.voucher_code = data.code;
    }
    if (data.invoice_code && !enriched.voucher_code) {
        enriched.voucher_code = data.invoice_code;
    }

    const actorId = actor?.id ?? data.actor_id ?? data.created_by ?? null;
    const actorName = actor?.name ?? data.actor_name ?? data.created_by_name ?? null;

    if (actorId && !enriched.created_by) enriched.created_by = actorId;
    if (actorName && !enriched.created_by_name) enriched.created_by_name = actorName;

    const content = data.content ?? data.notes ?? data.description ?? data.reason ?? null;
    if (content) {
        if (!enriched.content) enriched.content = content;
        if (!enriched.reason) enriched.reason = content;
    }

    if (event === 'receipt.created' && actorName) {
        if (!enriched.collector_name) enriched.collector_name = actorName;
        if (!enriched.received_by_name) enriched.received_by_name = actorName;
    }

    if (event.startsWith('invoice.') || event.startsWith('order.')) {
        const saleName = data.sale_name ?? data.sales_name ?? data.sales_user?.name ?? null;
        if (saleName) {
            if (!enriched.sale_name) enriched.sale_name = saleName;
            if (!enriched.sales_name) enriched.sales_name = saleName;
        }
    }

    return enriched;
}

/** Enrich payload CRM Master (order.created, lead.updated, ...) */
export function enrichCrmMasterPayload(data: Record<string, any>): Record<string, any> {
    if (!data || typeof data !== 'object') return data;

    const result: Record<string, any> = { ...data };

    if (data.lead) {
        result.lead = enrichLeadSlaFields(data.lead);
    }

    if (data.order) {
        const order = enrichOrderTelegramFields(data.order)!;
        result.order = order;
        const saleName = order.sale_name ?? order.sales_name ?? null;
        const createdByName = order.created_by_name ?? null;
        if (saleName) {
            result.sale_name = result.sale_name ?? saleName;
            result.sales_name = result.sales_name ?? saleName;
        }
        if (createdByName) {
            result.created_by_name = result.created_by_name ?? createdByName;
        }
    }

    return result;
}

/** Enrich payload notifyCrmMasterUser (Telegram/Zalo) */
export function enrichCrmMasterUserPayload(payload: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = { ...payload };

    if (payload.order) {
        result.order = enrichOrderTelegramFields(payload.order);
    }

    const saleName =
        payload.sale_name
        ?? payload.sales_name
        ?? payload.staff?.name
        ?? resolveSaleNameFromOrder(payload.order)
        ?? null;

    const createdByName =
        payload.created_by_name
        ?? resolveCreatedByNameFromOrder(payload.order)
        ?? null;

    if (saleName) {
        result.sale_name = saleName;
        result.sales_name = saleName;
    }
    if (createdByName) {
        result.created_by_name = createdByName;
    }

    if (payload.staff?.name && !result.collector_name) {
        result.collector_name = payload.staff.name;
    }

    return result;
}
