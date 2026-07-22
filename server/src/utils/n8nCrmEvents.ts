import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { fireCrmMasterWebhook } from './webhookNotifier.js';
import { enrichCrmMasterUserPayload } from './webhookPayloadAliases.js';
import { buildFrontendUrl } from '../config/index.js';

type StaffRole = 'technician' | 'sale' | 'manager' | 'accountant' | string;
type Channel = 'telegram' | 'zalo';

export type CrmMasterEventPayload = {
    target_user_id: string;
    target_role: StaffRole;
    channel?: Channel;
    order?: Record<string, any> | null;
    item?: Record<string, any> | null;
    customer?: Record<string, any> | null;
    staff?: Record<string, any> | null;
    product_image_url?: string | null;
    links?: Record<string, any> | null;
    [key: string]: any;
};

const recentCrmMasterEventIds = new Map<string, number>();
const CRM_MASTER_DEDUPE_TTL_MS = 5 * 60 * 1000;

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function getFirstImage(images: unknown): string | null {
    if (Array.isArray(images)) return typeof images[0] === 'string' ? images[0] : null;
    if (typeof images === 'string') {
        try {
            const parsed = JSON.parse(images);
            return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : null;
        } catch {
            return images || null;
        }
    }
    return null;
}

export function buildCrmOrderUrl(orderCodeOrId?: string | null): string | null {
    if (!orderCodeOrId) return null;
    return buildFrontendUrl(`/orders/${orderCodeOrId}`);
}

export function notifyCrmMasterUser(event: string, payload: CrmMasterEventPayload): void {
    const eventId = payload.event_id || uuidv4();
    const now = Date.now();
    for (const [key, expiresAt] of recentCrmMasterEventIds) {
        if (expiresAt <= now) recentCrmMasterEventIds.delete(key);
    }
    if (recentCrmMasterEventIds.has(eventId)) {
        console.warn(`[CrmMasterEvent] Skip duplicate ${event}: ${eventId}`);
        return;
    }
    recentCrmMasterEventIds.set(eventId, now + CRM_MASTER_DEDUPE_TTL_MS);

    const body = enrichCrmMasterUserPayload({
        event,
        event_id: eventId,
        created_at: new Date().toISOString(),
        channel: payload.channel || 'telegram',
        ...payload,
    });

    fireCrmMasterWebhook(event, body).catch((err) => {
        console.error(`[CrmMasterEvent] Failed to fire ${event}:`, err);
    });
}

export async function resolveRequestNotificationContext(entity: {
    order_item_id?: string | null;
    order_product_id?: string | null;
    order_product_service_id?: string | null;
}) {
    let serviceId = entity.order_product_service_id || null;
    let service: any = null;
    let orderProduct: any = null;
    let order: any = null;
    let customer: any = null;
    let technician: any = null;

    if (serviceId) {
        const context = await getServiceNotificationContext(serviceId);
        if (context) {
            service = context.service;
            orderProduct = context.orderProduct;
            order = context.order;
            customer = context.customer;
            technician = context.technician;
        }
    }

    if (!service && entity.order_product_id) {
        const { data } = await supabaseAdmin
            .from('order_products')
            .select(`
                id, order_id, product_code, name, images, due_at,
                order:orders(id, order_code, due_at, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id)),
                services:order_product_services(id, item_name, technician_id, technician:users!order_product_services_technician_id_fkey(id, name, role, telegram_chat_id))
            `)
            .eq('id', entity.order_product_id)
            .maybeSingle();
        orderProduct = data;
        order = firstRelation(data?.order);
        customer = firstRelation(order?.customer);
        service = Array.isArray(data?.services) ? (data.services[0] ?? null) : null;
        serviceId = service?.id || null;
        technician = firstRelation(service?.technician);
    }

    if (!order && entity.order_item_id) {
        const { data } = await supabaseAdmin
            .from('order_items')
            .select('id, item_name, item_code, order:orders(id, order_code, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id))')
            .eq('id', entity.order_item_id)
            .maybeSingle();
        service = data;
        order = firstRelation((data as any)?.order);
        customer = firstRelation(order?.customer);
    }

    return { serviceId, service, orderProduct, order, customer, technician };
}

export function buildRequestWorkflowPayload(event: string, request: Record<string, any>, context: any, opts: Record<string, any> = {}) {
    const metadata = request.metadata || {};
    const serviceName = context.service?.item_name || metadata.item_name || context.orderProduct?.name || null;
    const productName = context.orderProduct?.name || metadata.product_name || metadata.item_name || null;
    const orderCode = context.order?.order_code || metadata.order_code || null;
    const targetUserId = context.technician?.id || request.target_user_id || opts.target_user_id || null;

    return {
        event,
        event_id: opts.event_id || `${event}:${request.id}:${opts.old_status || 'none'}:${opts.new_status || request.status || 'none'}`,
        occurred_at: opts.occurred_at || new Date().toISOString(),
        target_user_id: targetUserId,
        target_role: context.technician ? 'technician' : (opts.target_role || 'manager'),
        channel: 'telegram' as const,
        order_item_id: request.order_item_id || null,
        order_product_id: request.order_product_id || context.orderProduct?.id || null,
        order_product_service_id: request.order_product_service_id || context.serviceId || null,
        order_code: orderCode,
        customer_name: context.customer?.name || metadata.customer_name || null,
        service_name: serviceName,
        order: context.order ? { order_id: context.order.id, order_code: orderCode } : { order_code: orderCode },
        item: {
            order_item_id: request.order_item_id || null,
            order_product_id: request.order_product_id || context.orderProduct?.id || null,
            order_product_service_id: request.order_product_service_id || context.serviceId || null,
            service_name: serviceName,
            product_name: productName,
        },
        customer: context.customer ? { name: context.customer.name, phone: context.customer.phone || null } : { name: metadata.customer_name || null },
        staff: context.technician ? { technician: context.technician } : null,
        links: orderCode ? { crm_url: buildCrmOrderUrl(orderCode) } : null,
        old_status: opts.old_status || null,
        new_status: opts.new_status || request.status || null,
        notes: opts.notes ?? request.notes ?? null,
    };
}

export async function getManagerRecipients(): Promise<any[]> {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, name, role, telegram_chat_id')
        .in('role', ['admin', 'manager']);

    if (error) {
        console.error('[CrmMasterEvent] Failed to resolve managers:', error.message);
        return [];
    }

    return data || [];
}

export async function getServiceNotificationContext(serviceId: string) {
    const { data, error } = await supabaseAdmin
        .from('order_product_services')
        .select(`
            id, item_name, status, notes, technician_id, assigned_at, completed_at,
            order_product:order_products(
                id, order_id, product_code, name, images, due_at,
                order:orders(
                    id, order_code, due_at, sales_id,
                    customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id),
                    sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)
                )
            ),
            technician:users!order_product_services_technician_id_fkey(id, name, role, telegram_chat_id, department_id, department, departments!department_id(id, name))
        `)
        .eq('id', serviceId)
        .maybeSingle();

    if (error || !data) {
        if (error) console.error('[CrmMasterEvent] Failed to load service context:', error.message);
        return null;
    }

    const orderProduct = firstRelation(data.order_product);
    const order = firstRelation(orderProduct?.order);
    const customer = firstRelation(order?.customer);
    const salesUser = firstRelation(order?.sales_user);
    const technician = firstRelation(data.technician);

    return {
        service: data,
        orderProduct,
        order,
        customer,
        salesUser,
        technician,
        productImageUrl: getFirstImage(orderProduct?.images),
    };
}

export function buildServiceEventBase(context: any) {
    const orderCodeOrId = context.order?.order_code || context.order?.id;
    const department = Array.isArray(context.technician?.departments) ? context.technician.departments[0] : context.technician?.departments;
    return {
        order: context.order ? {
            id: context.order.id,
            order_code: context.order.order_code,
            return_due_at: context.orderProduct?.due_at || context.order?.due_at || null,
        } : null,
        item: {
            id: context.service.id,
            service_name: context.service.item_name || context.orderProduct?.name || null,
            product_name: context.orderProduct?.name || null,
            product_code: context.orderProduct?.product_code || null,
            deadline_at: context.orderProduct?.due_at || context.order?.due_at || null,
            note: context.service.notes || null,
            room_id: context.technician?.department_id || null,
            room_name: department?.name || context.technician?.department || null,
        },
        customer: context.customer ? {
            name: context.customer.name,
            phone: context.customer.phone,
            zalo_user_id: context.customer.zalo_user_id || context.customer.customer_zalo_user_id || null,
        } : null,
        product_image_url: context.productImageUrl,
        links: {
            crm_url: buildCrmOrderUrl(orderCodeOrId),
        },
    };
}


