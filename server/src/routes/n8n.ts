import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { getFirstImage } from '../utils/n8nCrmEvents.js';

const router = Router();
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || 'crm-n8n-webhook-secret-2026';

const verifyN8nSecret = (req: Request, res: Response, next: NextFunction) => {
    const secret = req.headers['x-webhook-secret'];

    if (secret !== N8N_WEBHOOK_SECRET) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized - Invalid webhook secret' });
    }

    next();
};

function getDateWindow(req: Request) {
    const now = new Date();
    const offsetDays = Number(req.query.offset_days ?? req.query.offsetDays ?? 0);

    if (req.query.return_due_filter === 'tomorrow' && !req.query.date && !req.query.from && !req.query.to) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const to = new Date(tomorrow);
        to.setDate(to.getDate() + 1);
        return { from: tomorrow, to };
    }

    if (req.query.from || req.query.to) {
        const from = req.query.from ? new Date(String(req.query.from)) : new Date(now);
        const to = req.query.to ? new Date(String(req.query.to)) : new Date(from);
        if (!req.query.to) to.setDate(to.getDate() + 1);
        return { from, to };
    }

    const target = req.query.date ? new Date(String(req.query.date)) : new Date(now);
    target.setDate(target.getDate() + offsetDays);
    target.setHours(0, 0, 0, 0);
    const to = new Date(target);
    to.setDate(to.getDate() + 1);
    return { from: target, to };
}

function getDeadlineWindow(filter: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filter === 'tomorrow') {
        const from = new Date(today);
        from.setDate(from.getDate() + 1);
        const to = new Date(from);
        to.setDate(to.getDate() + 1);
        return { from, to };
    }

    if (filter === 'overdue') {
        return { from: null, to: today };
    }

    const to = new Date(today);
    to.setDate(to.getDate() + 1);
    return { from: today, to };
}

function assertValidDateWindow(from: Date, to: Date) {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new ApiError('Invalid date window. Use date=YYYY-MM-DD or from/to ISO timestamps.', 400);
    }
    if (from >= to) throw new ApiError('Invalid date window. "from" must be before "to".', 400);
}

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function normalizeUser(user: any) {
    if (!user) return null;
    return { id: user.id, name: user.name, telegram_chat_id: user.telegram_chat_id || null };
}

function normalizeService(service: any, orderProduct: any, order: any) {
    const customer = firstRelation(order?.customer);
    const technicians = (service.technicians || [])
        .map((row: any) => normalizeUser(firstRelation(row.technician)))
        .filter(Boolean);
    const primaryTechnician = normalizeUser(firstRelation(service.technician));
    const uniqueTechnicians = new Map<string, any>();

    for (const tech of [primaryTechnician, ...technicians].filter(Boolean)) uniqueTechnicians.set(tech.id, tech);

    const serviceSales = (service.sales || [])
        .map((row: any) => normalizeUser(firstRelation(row.sale)))
        .filter(Boolean);
    const uniqueSalesUsers = new Map<string, any>();

    for (const sale of serviceSales) uniqueSalesUsers.set(sale.id, sale);

    const technicianList = Array.from(uniqueTechnicians.values());
    const salesUserList = Array.from(uniqueSalesUsers.values());

    return {
        id: service.id,
        item_id: service.id,
        item_code: orderProduct.product_code,
        name: service.item_name || orderProduct.name,
        service_name: service.item_name || orderProduct.name,
        deadline_at: orderProduct.due_at || order?.due_at || null,
        status: service.status,
        order_id: order?.id || orderProduct.order_id,
        order_code: order?.order_code || null,
        customer_id: customer?.id || null,
        customer_name: customer?.name || null,
        customer_phone: customer?.phone || null,
        customer: customer ? {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            zalo_user_id: customer.zalo_user_id || customer.customer_zalo_user_id || null,
        } : null,
        product_image_url: getFirstImage(orderProduct.images),
        technician: technicianList[0] || null,
        technicians: technicianList,
        sales_user: salesUserList[0] || null,
        sales_users: salesUserList,
    };
}
async function fetchOrderProductsByDueWindow(fromIso: string | null, toIso: string) {
    let query = supabaseAdmin
        .from('order_products')
        .select(`
            id, order_id, product_code, name, type, status, images, due_at,
            after_sale_stage, care_warranty_flow, care_warranty_stage,
            current_phase, phase_stage, delivery_code, delivery_carrier, delivery_type,
            order:orders(
                id, order_code, sales_id, status, due_at,
                customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id),
                sales_user:users!orders_sales_id_fkey(id, name, telegram_chat_id)
            ),
            services:order_product_services(
                id, item_name, status, technician_id, assigned_at, completed_at,
                technician:users!order_product_services_technician_id_fkey(id, name, telegram_chat_id),
                technicians:order_product_service_technicians(
                    technician:users!order_product_service_technicians_technician_id_fkey(id, name, telegram_chat_id)
                ),
                sales:order_product_service_sales(
                    sale:users!order_product_service_sales_sale_id_fkey(id, name, telegram_chat_id)
                )
            )
        `)
        .lt('due_at', toIso)
        .not('after_sale_stage', 'eq', 'after4')
        .order('due_at', { ascending: true });

    if (fromIso) query = query.gte('due_at', fromIso);
    const { data, error } = await query;
    if (error) throw new ApiError('Lỗi truy vấn sản phẩm theo hạn: ' + error.message, 500);
    return data || [];
}

router.get('/cron-data', verifyN8nSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const type = String(req.query.type || 'orders');

        if (type === 'technical_deadlines') {
            const filter = String(req.query.filter || 'today');
            if (!['today', 'tomorrow', 'overdue'].includes(filter)) throw new ApiError('Invalid filter. Use today, tomorrow, or overdue.', 400);
            const { from, to } = getDeadlineWindow(filter);
            const products = await fetchOrderProductsByDueWindow(from ? from.toISOString() : null, to.toISOString());
            const items = products.flatMap((product: any) => {
                const order = firstRelation(product.order);
                return (product.services || [])
                    .filter((service: any) => service.status !== 'completed' && service.status !== 'cancelled')
                    .map((service: any) => normalizeService(service, product, order));
            });

            res.json({
                status: 'success',
                server_time: new Date().toISOString(),
                filters: { type, filter, from: from?.toISOString() || null, to: to.toISOString(), source: 'order_products.due_at' },
                counts: { items: items.length, orders: new Set(items.map((item: any) => item.order_id)).size },
                data: { items, orders: [] },
            });
            return;
        }

        if (type !== 'orders') throw new ApiError('Invalid type. Use orders or technical_deadlines.', 400);

        const { from, to } = getDateWindow(req);
        assertValidDateWindow(from, to);
        const fromIso = from.toISOString();
        const toIso = to.toISOString();
        const products = await fetchOrderProductsByDueWindow(fromIso, toIso);
        const ordersById = new Map<string, any>();

        for (const product of products) {
            const order = firstRelation(product.order);
            if (!order) continue;
            const customer = firstRelation(order.customer);
            const salesUser = normalizeUser(firstRelation(order.sales_user));
            const productImageUrl = getFirstImage(product.images);
            const current = ordersById.get(order.id) || {
                id: order.id,
                order_code: order.order_code,
                return_due_at: product.due_at || order.due_at || null,
                product_image_url: productImageUrl,
                customer: customer ? {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    zalo_user_id: customer.zalo_user_id || customer.customer_zalo_user_id || null,
                } : null,
                sales_user: salesUser,
                items: [],
            };
            if (!current.product_image_url && productImageUrl) current.product_image_url = productImageUrl;
            current.items.push(...(product.services || []).map((service: any) => normalizeService(service, product, order)));
            ordersById.set(order.id, current);
        }

        const orders = Array.from(ordersById.values());
        const items = orders.flatMap((order: any) => order.items);
        res.json({
            status: 'success',
            server_time: new Date().toISOString(),
            filters: { type, from: fromIso, to: toIso, return_due_filter: req.query.return_due_filter || null, source: 'order_products.due_at' },
            counts: { items: items.length, orders: orders.length },
            data: { items, orders },
        });
    } catch (error) {
        next(error);
    }
});

export default router;




