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
 *
 * Quan trọng: khi n8n bọc `{ assigned_to, lead: { assigned_to: null } }`,
 * không để nested `lead` ghi đè mất UUID hợp lệ ở top-level.
 */
export function normalizeN8nLeadPayload(incoming: Record<string, any> | null | undefined): Record<string, any> {
    if (!incoming || typeof incoming !== 'object') return {};

    const nestedLead = incoming.lead && typeof incoming.lead === 'object' && !Array.isArray(incoming.lead)
        ? incoming.lead
        : null;

    // Merge: nested lead trước, top-level sau → top-level thắng khi cả hai có giá trị
    const data: Record<string, any> = nestedLead
        ? { ...incoming, ...nestedLead }
        : { ...incoming };

    // Khôi phục field quan trọng nếu nested lead ghi đè bằng null/rỗng
    const preferNonEmpty = (key: string) => {
        const top = incoming[key];
        const current = data[key];
        const topOk = top !== undefined && top !== null && top !== '';
        const curEmpty = current === undefined || current === null || current === '';
        if (topOk && curEmpty) data[key] = top;
    };
    preferNonEmpty('assigned_to');
    preferNonEmpty('owner_sale');
    preferNonEmpty('assigned_to_name');
    preferNonEmpty('last_actor');
    preferNonEmpty('last_message_text');
    preferNonEmpty('last_message_time');
    preferNonEmpty('message_time');
    preferNonEmpty('fb_thread_id');
    preferNonEmpty('pancake_conversation_id');

    // Coerce assigned_to: object {id} / string / trim
    if (data.assigned_to != null && typeof data.assigned_to === 'object') {
        data.assigned_to = data.assigned_to.id || data.assigned_to.user_id || null;
    }
    if (typeof data.assigned_to === 'string') {
        data.assigned_to = data.assigned_to.trim() || null;
    }

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

    // Không để nested lead object lọt vào update DB
    delete data.lead;

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

    const code = data.code ?? data.voucher_code ?? data.invoice_code ?? null;
    if (code) {
        if (!enriched.code) enriched.code = code;
        if (!enriched.voucher_code) enriched.voucher_code = code;
    }

    const actorId = actor?.id ?? data.actor_id ?? data.created_by ?? null;
    const actorName = actor?.name ?? data.actor_name ?? data.created_by_name ?? null;

    if (actorId) {
        enriched.created_by = enriched.created_by ?? actorId;
        enriched.actor_id = enriched.actor_id ?? actorId;
    }
    if (actorName) {
        enriched.created_by_name = enriched.created_by_name ?? actorName;
        enriched.actor_name = enriched.actor_name ?? actorName;
    }

    const content = data.content ?? data.notes ?? data.description ?? data.reason ?? null;
    if (content) {
        enriched.content = enriched.content ?? content;
        enriched.reason = enriched.reason ?? content;
        enriched.notes = enriched.notes ?? content;
    }

    if (data.order_code) enriched.order_code = data.order_code;
    if (data.order_id) enriched.order_id = data.order_id;
    if (data.amount !== undefined) enriched.amount = data.amount;

    // Phiếu thu — Telegram "Người thu"
    if (event === 'receipt.created' || event === 'payment.created' || data.type === 'income') {
        if (actorName) {
            enriched.collector_name = enriched.collector_name ?? actorName;
            enriched.received_by_name = enriched.received_by_name ?? actorName;
            enriched.payment = {
                ...(enriched.payment || {}),
                created_by: actorId,
                created_by_name: actorName,
                collector_name: actorName,
                received_by_name: actorName,
            };
        }
    }

    // Phiếu chi — đảm bảo field chuẩn
    if (event === 'payment_voucher.created' || data.type === 'expense') {
        enriched.voucher_code = enriched.voucher_code ?? code;
        enriched.content = enriched.content ?? content;
        enriched.reason = enriched.reason ?? content;
    }

    // Hóa đơn / order
    if (event.startsWith('invoice.') || event.startsWith('order.')) {
        const saleName =
            data.sale_name
            ?? data.sales_name
            ?? data.sales_user?.name
            ?? firstRelation(data.sales_user)?.name
            ?? null;
        if (saleName) {
            enriched.sale_name = enriched.sale_name ?? saleName;
            enriched.sales_name = enriched.sales_name ?? saleName;
        }
        if (actorName) {
            enriched.created_by_name = enriched.created_by_name ?? actorName;
        }
        if (data.order_code || data.order?.order_code) {
            enriched.order_code = enriched.order_code ?? data.order_code ?? data.order?.order_code;
        }
    }

    return enriched;
}

/** Enrich customer fields cho Zalo / Telegram */
export function enrichCustomerZaloFields(
    customer: Record<string, any> | null | undefined,
    extra: Record<string, any> = {}
): Record<string, any> | null {
    if (!customer && !extra.customer_name && !extra.customer_phone) return null;

    const phone = customer?.zalo_phone
        ?? customer?.customer_zalo_phone
        ?? customer?.phone
        ?? extra.zalo_phone
        ?? extra.customer_zalo_phone
        ?? extra.customer_phone
        ?? null;
    const zaloUserId =
        customer?.zalo_user_id
        ?? customer?.customer_zalo_user_id
        ?? extra.zalo_user_id
        ?? null;
    const name = customer?.name ?? extra.customer_name ?? null;

    return {
        ...(customer || {}),
        id: customer?.id ?? null,
        name,
        phone,
        customer_name: name,
        customer_phone: customer?.phone ?? extra.customer_phone ?? phone,
        zalo_phone: phone,
        customer_zalo_phone: phone,
        zalo_user_id: zaloUserId,
        customer_zalo_user_id: zaloUserId,
    };
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

    const enrichedCustomer = enrichCustomerZaloFields(payload.customer, payload);
    if (enrichedCustomer) {
        result.customer = enrichedCustomer;
        result.customer_name = result.customer_name ?? enrichedCustomer.customer_name;
        result.customer_phone = result.customer_phone ?? enrichedCustomer.customer_phone;
        result.zalo_phone = result.zalo_phone ?? enrichedCustomer.zalo_phone;
        result.customer_zalo_phone = result.customer_zalo_phone ?? enrichedCustomer.customer_zalo_phone;
        result.zalo_user_id = result.zalo_user_id ?? enrichedCustomer.zalo_user_id;
    }

    if (payload.order?.order_code && !result.order_code) {
        result.order_code = payload.order.order_code;
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
        if (result.order && typeof result.order === 'object') {
            result.order = {
                ...result.order,
                sale_name: result.order.sale_name ?? saleName,
                sales_name: result.order.sales_name ?? saleName,
            };
        }
    }
    if (createdByName) {
        result.created_by_name = createdByName;
        if (result.order && typeof result.order === 'object') {
            result.order = {
                ...result.order,
                created_by_name: result.order.created_by_name ?? createdByName,
            };
        }
    }

    if (payload.staff?.name && !result.collector_name) {
        result.collector_name = payload.staff.name;
        result.received_by_name = result.received_by_name ?? payload.staff.name;
    }

    // product / step / media aliases
    if (payload.product_name && !result.product_name) result.product_name = payload.product_name;
    if (payload.item?.product_name && !result.product_name) result.product_name = payload.item.product_name;
    if (payload.current_step && !result.current_step) result.current_step = payload.current_step;
    if (payload.status && !result.status) result.status = payload.status;
    if (payload.product_image_url && !result.image_url) result.image_url = payload.product_image_url;
    if (payload.image_url && !result.product_image_url) result.product_image_url = payload.image_url;

    return result;
}
