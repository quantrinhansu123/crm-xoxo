/**
 * Chuẩn hóa alias field cho webhook n8n / Telegram — giữ field cũ để không breaking.
 */

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/** Đọc timestamp khách nhắn từ payload n8n/Pancake */
export function resolveLeadCustomerMessageAt(data: Record<string, any> | null | undefined): string | null {
    if (!data) return null;
    const raw =
        data.last_customer_message_at
        ?? data.t_last_customer_message
        ?? data.t_last_inbound
        ?? null;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Đọc timestamp sale rep từ payload n8n/Pancake */
export function resolveLeadStaffReplyAt(data: Record<string, any> | null | undefined): string | null {
    if (!data) return null;
    const raw =
        data.last_staff_reply_at
        ?? data.t_last_staff_reply
        ?? data.t_last_outbound
        ?? null;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
