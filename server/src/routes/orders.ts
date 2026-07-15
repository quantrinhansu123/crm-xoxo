import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, authorize, requireSale } from '../middleware/auth.js';
import { checkAndCompleteOrder } from '../utils/orderHelper.js';
import { autoCreateInvoice, syncInvoiceWithOrder } from '../utils/billingHelper.js';
import {
    createOrderIncomeTransaction,
    distributeDepositAcrossCustomerItems,
    recordProductDepositPayments,
} from '../utils/paymentRecordsHelper.js';
import { notifyFinanceEvent } from '../utils/financeNotifications.js';
import { notifyCrmMaster } from '../utils/webhookNotifier.js';
import { buildCrmOrderUrl, getManagerRecipients, notifyCrmMasterUser } from '../utils/n8nCrmEvents.js';
import { fetchOrderPaymentRecords, insertPaymentRecord } from '../utils/paymentRecordsHelper.js';
import { deleteOrderCascade } from '../utils/orderDeletionHelper.js';


const router = Router();
async function getOrderNotificationContext(orderId: string) {
    const { data: order, error } = await supabaseAdmin
        .from('orders')
        .select('id, order_code, sales_id, due_at, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)')
        .eq('id', orderId)
        .maybeSingle();

    if (error || !order) {
        if (error) console.error('[OrderNotify] Failed to load order context:', error.message);
        return null;
    }

    const salesUser = Array.isArray((order as any).sales_user) ? (order as any).sales_user[0] : (order as any).sales_user;
    const customer = Array.isArray((order as any).customer) ? (order as any).customer[0] : (order as any).customer;

    return { order, salesUser, customer };
}

function notifyOrderSalesUser(event: string, context: any, extra: Record<string, any> = {}) {
    const targetUserId = context?.salesUser?.id || context?.order?.sales_id;
    if (!targetUserId) {
        console.warn(`[OrderNotify] Skip ${event}: order has no sales_user UUID`);
        return;
    }

    notifyCrmMasterUser(event, {
        target_user_id: targetUserId,
        target_role: context.salesUser?.role || 'sale',
        channel: 'telegram',
        order: {
            id: context.order.id,
            order_code: context.order.order_code,
            return_due_at: context.order.due_at || null,
        },
        customer: context.customer ? {
            name: context.customer.name,
            phone: context.customer.phone,
            zalo_user_id: context.customer.zalo_user_id || context.customer.customer_zalo_user_id || null,
        } : null,
        staff: context.salesUser ? {
            id: context.salesUser.id,
            name: context.salesUser.name,
            role: context.salesUser.role || 'sale',
            telegram_chat_id: context.salesUser.telegram_chat_id || null,
        } : null,
        links: { crm_url: buildCrmOrderUrl(context.order.order_code || context.order.id) },
        ...extra,
    });
}

function notifyOrderCustomerZalo(event: string, context: any, extra: Record<string, any> = {}) {
    const zaloUserId = context?.customer?.zalo_user_id || context?.customer?.customer_zalo_user_id;
    if (!zaloUserId) {
        console.warn(`[OrderNotify] Skip ${event}: customer has no zalo_user_id`);
        if (context?.salesUser?.id || context?.order?.sales_id) {
            notifyOrderSalesUser('customer.zalo_user_id.missing', context, {
                missing_event: event,
                target_role: context.salesUser?.role || 'sale',
            });
        }
        return;
    }

    notifyCrmMasterUser(event, {
        target_user_id: zaloUserId,
        target_role: 'customer',
        channel: 'zalo',
        order: {
            id: context.order.id,
            order_code: context.order.order_code,
            return_due_at: context.order.due_at || null,
        },
        customer: context.customer ? {
            id: context.customer.id,
            name: context.customer.name,
            phone: context.customer.phone,
            zalo_user_id: zaloUserId,
        } : null,
        links: {},
        ...extra,
    });
}

// =====================================================
// ORDER CODE GENERATION HELPERS
// =====================================================

async function generateNextOrderCode(): Promise<string> {
    const prefix = 'HĐ';

    // Get the latest order with HĐ pattern
    const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('order_code')
        .like('order_code', `${prefix}%`)
        .order('created_at', { ascending: false })
        .limit(100);

    let maxNumber = 0;

    if (orders && orders.length > 0) {
        for (const order of orders) {
            // Parse HĐ format to extract number
            const match = order.order_code.match(/^HĐ(\d+)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNumber) maxNumber = num;
            }
        }
    }

    return `${prefix}${maxNumber + 1}`;
}

/**
 * Generate product code in format HĐ1.1, HĐ1.2...
 * Based on order code and product index
 */
function generateProductCode(orderCode: string, productIndex: number): string {
    return `${orderCode}.${productIndex + 1}`;
}

// Get next order code (for preview on client)
router.get('/next-code', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const nextOrderCode = await generateNextOrderCode();
        res.json({
            status: 'success',
            data: {
                nextOrderCode
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get all orders
router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { status, customer_id, search, sale_id, technician_id, page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        // If technician_id is provided, we need to find orders with items assigned to that technician
        if (technician_id) {
            // Get order IDs where the technician is assigned
            const { data: techOrders, error: techError } = await supabaseAdmin
                .from('order_items')
                .select('order_id')
                .eq('technician_id', technician_id);

            if (techError) {
                throw new ApiError('Lỗi khi tìm đơn hàng', 500);
            }

            const orderIds = [...new Set((techOrders || []).map(o => o.order_id))];

            if (orderIds.length === 0) {
                return res.json({
                    status: 'success',
                    data: {
                        orders: [],
                        pagination: {
                            page: Number(page),
                            limit: Number(limit),
                            total: 0,
                            totalPages: 0,
                        }
                    },
                });
            }

            const { data: orders, error, count } = await supabaseAdmin
                .from('orders')
                .select(`
                    *,
                    customer:customers(id, name, phone, email),
                    sales_user:users!orders_sales_id_fkey(id, name),
                    items:order_items(
                        id, order_id, product_id, service_id, item_type, item_name, quantity, unit_price, total_price, item_code, technician_id, sales_step_data, after_sale_stage, care_warranty_flow, care_warranty_stage, current_phase, phase_stage, completion_photos, packaging_photos, delivery_code, delivery_carrier, delivery_type,
                        product:products(id, image, code),
                        service:services(id, image, code),
                        technician:users!order_product_services_technician_id_fkey(id, name),
                        order_item_steps(id, started_at, estimated_duration, status, step_order)
                    )
                `, { count: 'exact' })
                .in('id', orderIds)
                .order('created_at', { ascending: false })
                .range(offset, offset + Number(limit) - 1);

            if (error) {
                throw new ApiError('Lỗi khi lấy danh sách đơn hàng', 500);
            }

            // Merge V2 order_products into items for each order
            const orderIdsList = (orders || []).map((o: { id: string }) => o.id);
            if (orderIdsList.length > 0) {
                const { data: v2Products } = await supabaseAdmin
                    .from('order_products')
                    .select(`
                        id, order_id, product_code, name, type, brand, color, size, material, condition_before, notes, images, status, sales_step_data, after_sale_stage, care_warranty_flow, care_warranty_stage, current_phase, phase_stage, completion_photos, packaging_photos, delivery_code, delivery_carrier, delivery_type, due_at, surcharges, surcharge_amount, warranty_code,
                        services:order_product_services(
                            id, item_name, item_type, unit_price, technician_id, current_phase, phase_stage,
                            service:services(id, image, code),
                            technician:users(id, name),
                            order_item_steps(id, started_at, estimated_duration, status, step_order)
                        )
                    `)
                    .in('order_id', orderIdsList);

                const allServiceIds: string[] = [];
                for (const p of v2Products || []) {
                    for (const s of p.services || []) {
                        if (s?.id) allServiceIds.push(s.id);
                    }
                }
                let techniciansByService: Record<string, Array<{ technician_id: string; technician: { id: string; name: string } }>> = {};
                if (allServiceIds.length > 0) {
                    const { data: techRows } = await supabaseAdmin
                        .from('order_product_service_technicians')
                        .select('order_product_service_id, technician_id, technician:users!order_product_service_technicians_technician_id_fkey(id, name)')
                        .in('order_product_service_id', allServiceIds);
                    for (const row of techRows || []) {
                        const svcId = (row as any).order_product_service_id;
                        const tech = (row as any).technician;
                        if (!techniciansByService[svcId]) techniciansByService[svcId] = [];
                        techniciansByService[svcId].push({
                            technician_id: (row as any).technician_id,
                            technician: tech ? { id: tech.id, name: tech.name } : { id: (row as any).technician_id, name: 'N/A' },
                        });
                    }
                }

                for (const order of orders || []) {
                    const opList = (v2Products || []).filter((p: { order_id: string }) => p.order_id === order.id);
                    if (opList.length > 0) {
                        const v2Items: any[] = [];
                        for (const product of opList) {
                            v2Items.push({
                                id: product.id,
                                order_id: order.id,
                                item_name: product.name,
                                item_type: 'product',
                                quantity: 1,
                                unit_price: 0,
                                total_price: 0,
                                status: product.status || 'pending',
                                item_code: product.product_code,
                                product: { id: product.id, image: product.images?.[0] || null, code: product.product_code },
                                is_customer_item: true,
                                sales_step_data: product.sales_step_data || null,
                                after_sale_stage: product.after_sale_stage || null,
                                care_warranty_flow: product.care_warranty_flow || null,
                                care_warranty_stage: product.care_warranty_stage || null,
                                warranty_code: product.warranty_code || null,
                                completion_photos: product.completion_photos || [],
                                packaging_photos: product.packaging_photos || [],
                                delivery_code: product.delivery_code || null,
                                delivery_carrier: product.delivery_carrier || null,
                                delivery_type: product.delivery_type || null,
                                due_at: product.due_at || null,
                                surcharges: product.surcharges || [],
                                surcharge_amount: product.surcharge_amount || 0,
                                product_type: product.type || null,
                                product_brand: product.brand || null,
                                product_color: product.color || null,
                                product_size: product.size || null,
                                product_material: product.material || null,
                                product_condition_before: product.condition_before || null,
                                product_notes: product.notes || null,
                            });
                            if (product.services?.length) {
                                for (const s of product.services as any[]) {
                                    const svc = s.service;
                                    const techList = techniciansByService[s.id] || [];
                                    const tech = s.technician || (techList[0]?.technician);
                                    const techListFinal = techList.length > 0
                                        ? techList
                                        : tech ? [{ technician_id: tech.id, technician: { id: tech.id, name: tech.name } }] : [];
                                    v2Items.push({
                                        id: s.id,
                                        order_id: order.id,
                                        item_name: `${s.item_name} (${product.name})`,
                                        item_type: s.item_type,
                                        quantity: 1,
                                        unit_price: s.unit_price,
                                        total_price: s.unit_price,
                                        status: s.status,
                                        technician_id: s.technician_id,
                                        technician: tech ? { id: tech.id, name: tech.name } : null,
                                        technicians: techListFinal.length ? techListFinal : undefined,
                                        service: svc ? { id: svc.id, image: svc.image, code: svc.code } : null,
                                        package: s.package,
                                        product: { id: product.id, image: product.images?.[0] || null, code: product.product_code },
                                        is_customer_item: true,
                                        sales_step_data: product.sales_step_data,
                                        after_sale_stage: product.after_sale_stage || null,
                                        care_warranty_flow: product.care_warranty_flow || null,
                                        care_warranty_stage: product.care_warranty_stage || null,
                                        warranty_code: product.warranty_code || null,
                                        completion_photos: product.completion_photos || [],
                                        packaging_photos: product.packaging_photos || [],
                                        delivery_code: product.delivery_code || null,
                                        delivery_carrier: product.delivery_carrier || null,
                                        delivery_type: product.delivery_type || null,
                                    });
                                }
                            }
                        }
                        order.items = [...(order.items || []), ...v2Items];
                    }
                }
            }

            return res.json({
                status: 'success',
                data: {
                    orders,
                    pagination: {
                        page: Number(page),
                        limit: Number(limit),
                        total: count || 0,
                        totalPages: Math.ceil((count || 0) / Number(limit)),
                    }
                },
            });
        }

        let query = supabaseAdmin
            .from('orders')
            .select(`
        *,
        customer:customers(id, name, phone, email),
        sales_user:users!orders_sales_id_fkey(id, name),
        items:order_items(
            id, order_id, product_id, service_id, item_type, item_name, quantity, unit_price, total_price, item_code, technician_id, sales_step_data, after_sale_stage, care_warranty_flow, care_warranty_stage, current_phase, phase_stage, completion_photos, packaging_photos, delivery_code, delivery_carrier, delivery_type,
            product:products(id, image, code),
            service:services(id, image, code),
            technician:users!order_items_technician_id_fkey(id, name),
            order_item_steps(id, started_at, estimated_duration, status, step_order)
        )
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (status) query = query.eq('status', status);
        if (customer_id) query = query.eq('customer_id', customer_id);
        if (search) query = query.ilike('order_code', `%${search}%`);
        if (sale_id) query = query.eq('sales_id', sale_id);

        const { data: orders, error, count } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách đơn hàng', 500);
        }

        // Merge V2 order_products into items for each order
        const orderIdsList = (orders || []).map((o: { id: string }) => o.id);
        if (orderIdsList.length > 0) {
            const { data: v2Products } = await supabaseAdmin
                .from('order_products')
                .select(`
                    id, order_id, product_code, name, type, brand, color, size, material, condition_before, notes, images, status, sales_step_data, after_sale_stage, care_warranty_flow, care_warranty_stage, current_phase, phase_stage, completion_photos, packaging_photos, delivery_code, delivery_carrier, delivery_type, due_at, surcharges, surcharge_amount, warranty_code,
                    services:order_product_services(
                        id, item_name, item_type, unit_price, technician_id, current_phase, phase_stage,
                        service:services(id, image, code),
                        technician:users(id, name),
                        order_item_steps(id, started_at, estimated_duration, status, step_order)
                    )
                `)
                .in('order_id', orderIdsList);

            // Fetch all technicians from order_product_service_technicians (separate query - reliable)
            const allServiceIds: string[] = [];
            for (const p of v2Products || []) {
                for (const s of p.services || []) {
                    if (s?.id) allServiceIds.push(s.id);
                }
            }
            let techniciansByService: Record<string, Array<{ technician_id: string; technician: { id: string; name: string } }>> = {};
            if (allServiceIds.length > 0) {
                const { data: techRows } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select('order_product_service_id, technician_id, technician:users!order_product_service_technicians_technician_id_fkey(id, name)')
                    .in('order_product_service_id', allServiceIds);
                for (const row of techRows || []) {
                    const svcId = (row as any).order_product_service_id;
                    const tech = (row as any).technician;
                    if (!techniciansByService[svcId]) techniciansByService[svcId] = [];
                    techniciansByService[svcId].push({
                        technician_id: (row as any).technician_id,
                        technician: tech ? { id: tech.id, name: tech.name } : { id: (row as any).technician_id, name: 'N/A' },
                    });
                }
            }

            for (const order of orders || []) {
                const opList = (v2Products || []).filter((p: { order_id: string }) => p.order_id === order.id);
                if (opList.length > 0) {
                    const v2Items: any[] = [];
                    for (const product of opList) {
                        v2Items.push({
                            id: product.id,
                            order_id: order.id,
                            item_name: product.name,
                            item_type: 'product',
                            quantity: 1,
                            unit_price: 0,
                            total_price: 0,
                            status: product.status || 'pending',
                            item_code: product.product_code,
                            product: { id: product.id, image: product.images?.[0] || null, code: product.product_code },
                            is_customer_item: true,
                            sales_step_data: product.sales_step_data || null,
                            after_sale_stage: product.after_sale_stage || null,
                            care_warranty_flow: product.care_warranty_flow || null,
                                care_warranty_stage: product.care_warranty_stage || null,
                                warranty_code: product.warranty_code || null,
                                completion_photos: product.completion_photos || [],
                                packaging_photos: product.packaging_photos || [],
                                delivery_code: product.delivery_code || null,
                                delivery_carrier: product.delivery_carrier || null,
                                delivery_type: product.delivery_type || null,
                                due_at: product.due_at || null,
                                surcharges: product.surcharges || [],
                                surcharge_amount: product.surcharge_amount || 0,
                                product_type: product.type || null,
                                product_brand: product.brand || null,
                                product_color: product.color || null,
                                product_size: product.size || null,
                                product_material: product.material || null,
                                product_condition_before: product.condition_before || null,
                                product_notes: product.notes || null,
                            });
                        if (product.services?.length) {
                            for (const s of product.services as any[]) {
                                const svc = s.service;
                                const techList = techniciansByService[s.id] || [];
                                const tech = s.technician || (techList[0]?.technician);
                                const techListFinal = techList.length > 0
                                    ? techList
                                    : tech ? [{ technician_id: tech.id, technician: { id: tech.id, name: tech.name } }] : [];
                                v2Items.push({
                                    id: s.id,
                                    order_id: order.id,
                                    item_name: `${s.item_name} (${product.name})`,
                                    item_type: s.item_type,
                                    quantity: 1,
                                    unit_price: s.unit_price,
                                    total_price: s.unit_price,
                                    status: s.status,
                                    technician_id: s.technician_id,
                                    technician: tech ? { id: tech.id, name: tech.name } : null,
                                    technicians: techListFinal.length ? techListFinal : undefined,
                                    service: svc ? { id: svc.id, image: svc.image, code: svc.code } : null,
                                    package: s.package,
                                    product: { id: product.id, image: product.images?.[0] || null, code: product.product_code },
                                    is_customer_item: true,
                                    sales_step_data: product.sales_step_data,
                                    after_sale_stage: product.after_sale_stage || null,
                                    care_warranty_flow: product.care_warranty_flow || null,
                                    care_warranty_stage: product.care_warranty_stage || null,
                                    warranty_code: product.warranty_code || null,
                                    completion_photos: product.completion_photos || [],
                                    packaging_photos: product.packaging_photos || [],
                                    delivery_code: product.delivery_code || null,
                                    delivery_carrier: product.delivery_carrier || null,
                                    delivery_type: product.delivery_type || null,
                                    order_item_steps: s.order_item_steps || [],
                                });
                            }
                        }
                    }
                    order.items = [...(order.items || []), ...v2Items];
                }
            }
        }

        res.json({
            status: 'success',
            data: {
                orders,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / Number(limit)),
                }
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get order by ID or order_code
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Determine if id is a UUID or order_code
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        // Fetch order with Sale Items (order_items table)
        let query = supabaseAdmin
            .from('orders')
            .select(`
        *,
        customer:customers(id, name, phone, email, address),
        sales_user:users!orders_sales_id_fkey(id, name),
        created_by_user:users!orders_created_by_fkey(id, name),
        sale_items:order_items(
            *,
            sales_step_data,
            product:products(*),
            service:services(*),
            technicians:order_item_technicians(
                id,
                technician_id,
                commission,
                assigned_by,
                assigned_at,
                technician:users!order_item_technicians_technician_id_fkey(id, name)
            ),
            sales:order_item_sales(
                id,
                sale_id,
                commission,
                assigned_by,
                assigned_at,
                sale:users!order_item_sales_sale_id_fkey(id, name, avatar)
            )
        )
      `);

        // Query by id (UUID) or order_code
        if (isUUID) {
            query = query.eq('id', id);
        } else {
            query = query.eq('order_code', id);
        }

        const { data: order, error } = await query.single();

        if (error || !order) {
            throw new ApiError('Không tìm thấy đơn hàng', 404);
        }

        // Rename sale_items for clarity in internal logic
        const saleItems = order.sale_items || [];
        delete order.sale_items; // We'll re-attach at the end

        // Fetch Customer Items (order_products and their services) - use order.id (UUID)
        const { data: customerItemsData, error: customerError } = await supabaseAdmin
            .from('order_products')
            .select(`
                *,
                services:order_product_services(
                    *,
                    service:services(*),
                    package:packages(*),
                    technician:users(id, name),
                    technicians:order_product_service_technicians(
                        id,
                        technician_id,
                        commission,
                        status,
                        assigned_at,
                        technician:users!order_product_service_technicians_technician_id_fkey(id, name, avatar)
                    ),
                    sales:order_product_service_sales(
                        id,
                        sale_id,
                        commission,
                        assigned_at,
                        sale:users!order_product_service_sales_sale_id_fkey(id, name, avatar)
                    )
                )
            `)
            .eq('order_id', order.id);

        const customerItems: any[] = [];
        const flatItems: any[] = [...saleItems];

        if (!customerError && customerItemsData && customerItemsData.length > 0) {
            for (const product of customerItemsData) {
                // Map to CustomerItem structure (includes product details and its services)
                const cItem = {
                    ...product,
                    is_customer_item: true
                };
                customerItems.push(cItem);

                // Add to flat items list for backward compatibility
                flatItems.push({
                    id: product.id,
                    order_id: order.id,
                    item_name: product.name,
                    item_type: 'product',
                    quantity: 1,
                    unit_price: 0,
                    total_price: 0,
                    status: product.status || 'pending',
                    item_code: product.product_code,
                    product: {
                        image: product.images?.[0] || null
                    },
                    is_customer_item: true,
                    after_sale_stage: product.after_sale_stage || null,
                    care_warranty_flow: product.care_warranty_flow || null,
                    care_warranty_stage: product.care_warranty_stage || null,
                    warranty_code: product.warranty_code || null,
                    completion_photos: product.completion_photos || [],
                    packaging_photos: product.packaging_photos || [],
                    product_type: product.type || null,
                    product_images: product.images || [],
                    product_brand: product.brand || null,
                    product_color: product.color || null,
                    product_size: product.size || null,
                    product_material: product.material || null,
                    product_condition_before: product.condition_before || null,
                    product_notes: product.notes || null,
                    sales_step_data: product.sales_step_data || null,
                    delivery_code: product.delivery_code || null,
                    delivery_carrier: product.delivery_carrier || null,
                    delivery_type: product.delivery_type || null,
                    surcharges: product.surcharges || [],
                    surcharge_amount: product.surcharge_amount || 0,
                    due_at: product.due_at || null,
                    current_phase: product.current_phase || null,
                    phase_stage: product.phase_stage || null,
                    // Mỗi sản phẩm điền độc lập — không dùng chung dữ liệu cấp đơn
                    aftersale_receiver_name: product.aftersale_receiver_name || null,
                    debt_checked: product.debt_checked || false,
                    debt_checked_notes: product.debt_checked_notes || null,
                    debt_checked_by_name: product.debt_checked_by_name || null,
                    delivery_creator_name: product.delivery_creator_name || null,
                    delivery_shipper_phone: product.delivery_shipper_phone || null,
                    delivery_staff_name: product.delivery_staff_name || null,
                    delivery_received_at: product.delivery_received_at || null,
                });

                if (product.services && product.services.length > 0) {
                    for (const s of product.services) {
                        let technicians = s.technicians || [];
                        let sales = s.sales || [];
                        if (technicians.length === 0 && s.technician_id) {
                            technicians = [{
                                technician_id: s.technician_id,
                                technician: s.technician,
                                commission: 0
                            }];
                        }

                        flatItems.push({
                            id: s.id,
                            order_id: order.id,
                            item_name: `${s.item_name} (${product.name})`,
                            item_type: s.item_type,
                            quantity: 1,
                            unit_price: s.unit_price,
                            total_price: s.unit_price,
                            status: s.status,
                            notes: s.sale_note || null,
                            technician_id: s.technician_id,
                            technician: s.technician,
                            technicians: technicians,
                            sales: sales,
                            service: s.service,
                            package: s.package,
                            started_at: s.started_at,
                            completed_at: s.completed_at,
                            assigned_at: s.assigned_at,
                            is_customer_item: true, // Mark as customer item for grouping in OrderDetailPage
                            sales_step_data: product.sales_step_data, // Inherit from parent product
                            after_sale_stage: s.after_sale_stage ?? product.after_sale_stage ?? null,
                            care_warranty_flow: s.care_warranty_flow ?? product.care_warranty_flow ?? null,
                            care_warranty_stage: s.care_warranty_stage ?? product.care_warranty_stage ?? null,
                            warranty_code: product.warranty_code || null,
                            completion_photos: s.completion_photos ?? product.completion_photos ?? [],
                            packaging_photos: s.packaging_photos ?? product.packaging_photos ?? [],
                            delivery_code: s.delivery_code ?? product.delivery_code ?? null,
                            delivery_carrier: s.delivery_carrier ?? product.delivery_carrier ?? null,
                            delivery_type: s.delivery_type ?? product.delivery_type ?? null,
                            product: {
                                id: product.id,
                                image: product.images?.[0] || null
                            },
                            current_phase: s.current_phase || product.current_phase || null,
                            phase_stage: s.phase_stage || product.phase_stage || null
                        });
                    }
                }
            }
        }

        order.customer_items = customerItems;
        order.sale_items = saleItems;
        order.items = flatItems;

        // Attach extension requests
        const { data: extRequests } = await supabaseAdmin
            .from('order_extension_requests')
            .select('*')
            .eq('order_id', order.id)
            .order('created_at', { ascending: false });
        
        (order as any).extension_requests = extRequests || [];
        (order as any).extension_request = extRequests?.find((e: any) => !e.order_item_id && !e.order_product_service_id && !e.order_product_id) || null;

        // Attach accessories and partners for each flat item (batched, not N+1)
        if (order.items && order.items.length > 0) {
            const itemIds = order.items.map((i: any) => i.id).filter(Boolean);
            
            // Batch fetch all accessories and partners in 2 queries instead of 2N
            const [{ data: allAccessories }, { data: allPartners }] = await Promise.all([
                supabaseAdmin
                    .from('order_item_accessories')
                    .select('*')
                    .or(itemIds.map((id: string) => `order_item_id.eq.${id},order_product_id.eq.${id},order_product_service_id.eq.${id}`).join(','))
                    .order('updated_at', { ascending: false }),
                supabaseAdmin
                    .from('order_item_partner')
                    .select('*')
                    .or(itemIds.map((id: string) => `order_item_id.eq.${id},order_product_id.eq.${id},order_product_service_id.eq.${id}`).join(','))
                    .order('updated_at', { ascending: false }),
            ]);

            // Map results back to items (take latest per item)
            for (const item of order.items) {
                const itemId = item.id;
                if (!itemId) continue;
                (item as any).accessory = allAccessories?.find((a: any) => a.order_item_id === itemId || a.order_product_id === itemId || a.order_product_service_id === itemId) || null;
                (item as any).partner = allPartners?.find((p: any) => p.order_item_id === itemId || p.order_product_id === itemId || p.order_product_service_id === itemId) || null;
                (item as any).extension_request = extRequests?.find((e: any) => e.order_item_id === itemId || e.order_product_service_id === itemId) || null;
            }
        }

        const { data: pendingTickets } = await supabaseAdmin
            .from('upsell_tickets')
            .select('id, status, data, notes, created_at, sales_id')
            .eq('order_id', order.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        (order as any).pending_tickets = pendingTickets || [];

        res.json({
            status: 'success',
            data: { order },
        });
    } catch (error) {
        next(error);
    }
});

// Get Kanban logs by tab (sales | workflow | aftersale) – lịch sử chuyển trạng thái từng tab
router.get('/:id/kanban-logs', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id: orderIdOrCode } = req.params;
        const tab = (req.query.tab as string) || 'sales';
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderIdOrCode);
        let orderId: string = orderIdOrCode;
        if (!isUUID) {
            const { data: ord } = await supabaseAdmin.from('orders').select('id').eq('order_code', orderIdOrCode).single();
            if (!ord) throw new ApiError('Không tìm thấy đơn hàng', 404);
            orderId = ord.id;
        }

        if (tab === 'sales') {
            const { data: logs, error } = await supabaseAdmin
                .from('order_item_status_log')
                .select('id, entity_type, entity_id, from_status, to_status, reason, notes, photos, created_by, created_at, created_by_user:users!order_item_status_log_created_by_fkey(id, name)')
                .eq('order_id', orderId)
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw new ApiError('Lỗi khi lấy lịch sử Sales', 500);
            return res.json({ status: 'success', data: { logs: logs || [] } });
        }

        if (tab === 'aftersale') {
            const { data: logs, error } = await supabaseAdmin
                .from('order_after_sale_stage_log')
                .select('id, entity_type, entity_id, from_stage, to_stage, notes, photos, created_by, created_at, created_by_user:users!order_after_sale_stage_log_created_by_fkey(id, name)')
                .eq('order_id', orderId)
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw new ApiError('Lỗi khi lấy lịch sử After sale', 500);
            return res.json({ status: 'success', data: { logs: logs || [] } });
        }

        if (tab === 'workflow') {
            console.log('[Workflow Tab] Fetching logs for order:', orderId);
            
            const { data: orderItems } = await supabaseAdmin.from('order_items').select('id').eq('order_id', orderId);
            const orderItemIds = orderItems?.map((r: { id: string }) => r.id) || [];
            console.log('[Workflow] orderItemIds:', orderItemIds);
            
            const { data: orderProducts } = await supabaseAdmin.from('order_products').select('id').eq('order_id', orderId);
            const opIds = orderProducts?.map((r: { id: string }) => r.id) || [];
            console.log('[Workflow] opIds:', opIds);
            
            const { data: services } = opIds.length
                ? await supabaseAdmin.from('order_product_services').select('id').in('order_product_id', opIds)
                : { data: [] };
            const serviceIds = (services as { id: string }[] | null)?.map((r) => r.id) || [];
            console.log('[Workflow] serviceIds:', serviceIds);
            
            const { data: stepsV1 } = orderItemIds.length
                ? await supabaseAdmin.from('order_item_steps').select('id').in('order_item_id', orderItemIds)
                : { data: [] };
            const { data: stepsV2 } = serviceIds.length
                ? await supabaseAdmin.from('order_item_steps').select('id').in('order_product_service_id', serviceIds)
                : { data: [] };
            const stepIds = [
                ...((stepsV1 as { id: string }[] | null) || []),
                ...((stepsV2 as { id: string }[] | null) || [])
            ].map((s) => s.id);
            const ids = [...new Set(stepIds)];
            console.log('[Workflow] stepIds:', ids);
            
            let logs: any[] = [];

            if (ids.length > 0) {
                console.log('[Workflow] Querying by step IDs:', ids);
                const result = await supabaseAdmin
                    .from('order_workflow_step_log')
                    .select('id, order_item_step_id, action, step_name, step_order, notes, photos, reason, deadline_days, technician_id, entity_id, created_by, created_at, created_by_user:users!order_workflow_step_log_created_by_fkey(id, name), assigned_tech:users!order_workflow_step_log_technician_id_fkey(id, name)')
                    .in('order_item_step_id', ids)
                    .order('created_at', { ascending: false })
                    .limit(100);
                console.log('[Workflow] Step logs result:', result.data?.length, 'error:', result.error);
                logs = result.data || [];
            } else {
                console.log('[Workflow] No step IDs, skipping step log query');
            }

            const allEntityIds = [...orderItemIds, ...opIds, ...serviceIds];
            if (allEntityIds.length > 0) {
                console.log('[Workflow] Querying by entity IDs:', allEntityIds);
                const entityLogsResult = await supabaseAdmin
                    .from('order_workflow_step_log')
                    .select('id, order_item_step_id, action, step_name, step_order, notes, photos, reason, deadline_days, technician_id, entity_id, created_by, created_at, created_by_user:users!order_workflow_step_log_created_by_fkey(id, name), assigned_tech:users!order_workflow_step_log_technician_id_fkey(id, name)')
                    .in('entity_id', allEntityIds)
                    .order('created_at', { ascending: false })
                    .limit(100);
                console.log('[Workflow] Entity logs result:', entityLogsResult.data?.length, 'error:', entityLogsResult.error);
                if (entityLogsResult.data && entityLogsResult.data.length > 0) {
                    const existingIds = new Set(logs.map(l => l.id));
                    const newLogs = entityLogsResult.data.filter(l => !existingIds.has(l.id));
                    logs = [...logs, ...newLogs];
                    logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                }
            }

            console.log('[Workflow] Final logs count:', logs.length);
            return res.json({ status: 'success', data: { logs } });
        }

        if (tab === 'care') {
            const { data: logs, error } = await supabaseAdmin
                .from('order_care_warranty_log')
                .select('id, entity_type, entity_id, from_stage, to_stage, flow_type, notes, photos, created_by, created_at, created_by_user:users!order_care_warranty_log_created_by_fkey(id, name)')
                .eq('order_id', orderId)
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw new ApiError('Lỗi khi lấy lịch sử Chăm sóc/Bảo hành', 500);
            return res.json({ status: 'success', data: { logs: logs || [] } });
        }

        throw new ApiError('tab không hợp lệ. Chọn: sales, workflow, aftersale, care', 400);
    } catch (error) {
        next(error);
    }
});

// Create order (Unified endpoint: Customer Items + Sale Items)
router.post('/', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const {
            customer_id,
            customer_items, // New name
            products, // Deprecated name (alias for customer_items)
            sale_items, // New name
            add_on_products, // Deprecated name (alias for sale_items)
            notes,
            discount,
            discount_type,
            discount_value,
            surcharges,
            paid_amount,
            payment_method,
            status,
            due_at
        } = req.body;

        const finalCustomerItems = customer_items || products;
        const finalSaleItems = sale_items || add_on_products;

        if (!customer_id || (!finalCustomerItems && !finalSaleItems)) {
            throw new ApiError('Khách hàng và sản phẩm là bắt buộc', 400);
        }

        // 1. Calculate Subtotals
        let subtotalFromCustomerItems = 0;
        if (finalCustomerItems && Array.isArray(finalCustomerItems)) {
            for (const item of finalCustomerItems) {
                if (item.services && Array.isArray(item.services)) {
                    for (const service of item.services) {
                        subtotalFromCustomerItems += Number(service.price) || 0;
                    }
                }
                // Add per-product surcharge
                subtotalFromCustomerItems += Number(item.surcharge_amount) || 0;
            }
        }

        let subtotalFromSaleItems = 0;
        if (finalSaleItems && Array.isArray(finalSaleItems)) {
            for (const item of finalSaleItems) {
                const qty = Math.max(1, Number(item.quantity) || 1);
                const price = Number(item.unit_price || item.price) || 0;
                subtotalFromSaleItems += price * qty;
                // Add per-item surcharge
                subtotalFromSaleItems += Number(item.surcharge_amount) || 0;
            }
        }

        const subtotal = subtotalFromCustomerItems + subtotalFromSaleItems;
        const discountAmount = Number(discount) || 0;

        let totalSurchargesAmount = 0;
        if (surcharges && Array.isArray(surcharges)) {
            for (const surcharge of surcharges) {
                totalSurchargesAmount += Number(surcharge.amount) || 0;
            }
        }

        const totalAmount = Math.max(0, subtotal - discountAmount + totalSurchargesAmount);

        let depositFromItems = 0;
        if (finalCustomerItems && Array.isArray(finalCustomerItems)) {
            for (const item of finalCustomerItems) {
                if (!item.services || !Array.isArray(item.services)) continue;
                for (const svc of item.services) {
                    depositFromItems += Math.max(0, Number(svc.deposit_amount) || 0);
                }
            }
        }

        const paidAmountFromBody = Number(paid_amount) || 0;
        if (depositFromItems <= 0 && paidAmountFromBody > 0 && finalCustomerItems && Array.isArray(finalCustomerItems)) {
            depositFromItems = distributeDepositAcrossCustomerItems(finalCustomerItems, paidAmountFromBody);
        }

        const paidAmountValue = depositFromItems > 0
            ? depositFromItems
            : paidAmountFromBody;
        const remainingDebt = Math.max(0, totalAmount - paidAmountValue);

        // 2. Generate Order Code
        const orderCode = await generateNextOrderCode();

        // 3. Create Order
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .insert({
                order_code: orderCode,
                customer_id,
                sales_id: req.user!.id,
                subtotal,
                discount: discountAmount,
                discount_type: discount_type || 'amount',
                discount_value: discount_value || 0,
                surcharges: surcharges || [],
                surcharges_amount: totalSurchargesAmount,
                total_amount: totalAmount,
                paid_amount: paidAmountValue,
                remaining_debt: remainingDebt,
                payment_status: remainingDebt <= 0 ? 'paid' : (paidAmountValue > 0 ? 'partial' : 'unpaid'),
                status: status || 'in_progress',
                notes,
                created_by: req.user!.id,
            })
            .select('*, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)')
            .single();

        if (orderError) {
            throw new ApiError('Lỗi khi tạo đơn hàng: ' + orderError.message, 500);
        }

        // 4. Create Customer Items (order_products) and their services
        const createdCustomerItems = [];
        const productDepositLines: Array<{ order_product_id: string; product_code: string; amount: number }> = [];
        if (finalCustomerItems && Array.isArray(finalCustomerItems)) {
            for (let i = 0; i < finalCustomerItems.length; i++) {
                const item = finalCustomerItems[i];
                const productCode = generateProductCode(orderCode, i);

                const { data: orderProduct, error: productError } = await supabaseAdmin
                    .from('order_products')
                    .insert({
                        order_id: order.id,
                        product_code: productCode,
                        name: item.name,
                        type: item.type,
                        brand: item.brand,
                        color: item.color,
                        size: item.size,
                        material: item.material,
                        condition_before: item.condition_before,
                        images: item.images || [],
                        notes: item.notes,
                        due_at: item.due_at || null,
                        status: 'pending',
                        surcharges: item.surcharges || [],
                        surcharge_amount: Number(item.surcharge_amount) || 0,
                        current_phase: 'sales',
                        phase_stage: 'step1'
                    })
                    .select()
                    .single();

                if (productError) {
                    console.error('Error creating customer item:', productError);
                    continue;
                }
                console.log(`[OrderCreate] Created product ${orderProduct.product_code} with ID ${orderProduct.id}`);
                       if (item.services && Array.isArray(item.services)) {
                    console.log(`[OrderCreate] Processing ${item.services.length} services for product ${orderProduct.product_code}`);
                    
                    const servicesPayload = item.services.map((svc: any, sIdx: number) => {
                        const hasTechs = svc.technicians && svc.technicians.length > 0;
                        const techId = svc.technician_id || (hasTechs ? svc.technicians[0].technician_id : null);
                        const sId = svc.id || svc.service_id;

                        console.log(`[OrderCreate] Mapping service ${sIdx}: name="${svc.name}", type="${svc.type}", id="${sId}", price=${svc.price}`);

                        return {
                            order_product_id: orderProduct.id,
                            service_id: svc.type === 'service' ? sId : null,
                            package_id: svc.type === 'package' ? sId : null,
                            item_name: svc.name,
                            item_type: svc.type,
                            unit_price: Number(svc.price) || 0,
                            deposit_amount: Math.max(0, Number(svc.deposit_amount) || 0),
                            technician_id: techId,
                            status: hasTechs ? 'assigned' : 'pending',
                            assigned_at: hasTechs ? new Date().toISOString() : null,
                            _technicians: svc.technicians || [], // temp metadata
                            _sales: svc.sales || [], // temp metadata
                            _original_index: sIdx, // for debugging
                            current_phase: hasTechs ? 'workflow' : 'sales',
                            phase_stage: hasTechs ? 'room_active' : 'step1'
                        };
                    });

                    // Log columns we are about to insert
                    const insertData = servicesPayload.map((s: any) => {
                        const { _technicians, _sales, _original_index, ...data } = s;
                        return data;
                    });
                    console.log(`[OrderCreate] Inserting services into DB:`, JSON.stringify(insertData));

                    const { data: createdSvcs, error: svcsError } = await supabaseAdmin
                        .from('order_product_services')
                        .insert(insertData)
                        .select();

                    if (svcsError) {
                        console.error('[OrderCreate] DB Error inserting services:', JSON.stringify(svcsError));
                    } else {
                        console.log(`[OrderCreate] DB Success: created ${createdSvcs?.length} services`);
                    }

                    if (!svcsError && createdSvcs) {
                        // Handle multiple technicians
                        const techAssignments: any[] = [];
                        for (let j = 0; j < createdSvcs.length; j++) {
                            const createdSvc = createdSvcs[j];
                            const originalSvc = servicesPayload.find((s: any) => s._original_index === j); // Match by original index
                            if (!originalSvc) {
                                console.warn(`[OrderCreate] Could not find original service for created service at index ${j}. Skipping tech assignments.`);
                                continue;
                            }
                            const techs = originalSvc._technicians || [];
                            for (const t of techs) {
                                techAssignments.push({
                                    order_product_service_id: createdSvc.id,
                                    technician_id: t.technician_id,
                                    commission: t.commission || 0,
                                    assigned_by: req.user!.id,
                                    assigned_at: new Date().toISOString(),
                                    status: 'assigned'
                                });
                            }
                        }

                        if (techAssignments.length > 0) {
                            await supabaseAdmin.from('order_product_service_technicians').insert(techAssignments);
                        }

                        // Handle multiple salespersons
                        const saleAssignments: any[] = [];
                        for (let j = 0; j < createdSvcs.length; j++) {
                            const createdSvc = createdSvcs[j];
                            const originalSvc = servicesPayload.find((s: any) => s._original_index === j);
                            if (!originalSvc) continue;
                            const sales = originalSvc._sales || [];
                            for (const s of sales) {
                                saleAssignments.push({
                                    order_product_service_id: createdSvc.id,
                                    sale_id: s.sale_id || s.id,
                                    commission: s.commission || 0,
                                    assigned_by: req.user!.id,
                                    assigned_at: new Date().toISOString()
                                });
                            }
                        }

                        if (saleAssignments.length > 0) {
                            await supabaseAdmin.from('order_product_service_sales').insert(saleAssignments);
                        }

                        // Generate Workflow Steps for services
                        const itemSteps: any[] = [];
                        for (const createdSvc of createdSvcs) {
                            if (createdSvc.item_type === 'service' && createdSvc.service_id) {
                                const { data: sData } = await supabaseAdmin.from('services').select('workflow_id').eq('id', createdSvc.service_id).single();
                                if (sData?.workflow_id) {
                                    const { data: wSteps } = await supabaseAdmin.from('workflow_steps').select('*').eq('workflow_id', sData.workflow_id).order('step_order', { ascending: true });
                                    if (wSteps) {
                                        wSteps.forEach(ws => {
                                            itemSteps.push({
                                                order_product_service_id: createdSvc.id,
                                                workflow_step_id: ws.id,
                                                step_order: ws.step_order,
                                                step_name: ws.name || `Bước ${ws.step_order}`,
                                                department_id: ws.department_id,
                                                status: 'pending',
                                                estimated_duration: ws.estimated_duration
                                            });
                                        });
                                    }
                                }
                            }
                        }
                        if (itemSteps.length > 0) {
                            await supabaseAdmin.from('order_item_steps').insert(itemSteps);
                        }
                    }
                }

                let productDepositTotal = 0;
                if (item.services && Array.isArray(item.services)) {
                    for (const svc of item.services) {
                        productDepositTotal += Math.max(0, Number(svc.deposit_amount) || 0);
                    }
                }
                if (productDepositTotal > 0) {
                    productDepositLines.push({
                        order_product_id: orderProduct.id,
                        product_code: productCode,
                        amount: productDepositTotal,
                    });
                }

                createdCustomerItems.push({ ...orderProduct, qr_code: productCode });
            }
        }

        // 5. Create Sale Items (order_items table)
        if (finalSaleItems && Array.isArray(finalSaleItems) && finalSaleItems.length > 0) {
            const baseTime = Date.now().toString().slice(-8);
            const saleItemsPayload = [];

            for (let idxValue = 0; idxValue < finalSaleItems.length; idxValue++) {
                const itemValue = finalSaleItems[idxValue];
                const qValue = Math.max(1, Number(itemValue.quantity) || 1);
                const pValue = Number(itemValue.unit_price || itemValue.price) || 0;
                const totalValue = pValue * qValue;
                const productId = itemValue.product_id || itemValue.id;

                saleItemsPayload.push({
                    order_id: order.id,
                    product_id: productId || null,
                    item_type: 'product',
                    item_name: itemValue.name || 'Sản phẩm bán kèm',
                    quantity: qValue,
                    unit_price: pValue,
                    total_price: totalValue,
                    item_code: `IT${baseTime}${idxValue.toString().padStart(2, '0')}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
                    status: 'pending',
                    surcharges: itemValue.surcharges || [],
                    surcharge_amount: Number(itemValue.surcharge_amount) || 0,
                    current_phase: 'sales',
                    phase_stage: 'step1'
                });

                // Decrement stock for catalog product
                if (productId) {
                    try {
                        const { data: currentProd } = await supabaseAdmin.from('products').select('stock').eq('id', productId).single();
                        if (currentProd) {
                            const newStock = Math.max(0, (currentProd.stock || 0) - qValue);
                            await supabaseAdmin.from('products').update({ stock: newStock }).eq('id', productId);
                        }
                    } catch (err) {
                        console.error(`Error decrementing stock for product ${productId}:`, err);
                    }
                }
            }

            const { data: createdItems, error: itemsError } = await supabaseAdmin.from('order_items').insert(saleItemsPayload).select();

            if (!itemsError && createdItems) {
                const saleItemAssignments: any[] = [];
                for (let idx = 0; idx < createdItems.length; idx++) {
                    const createdItem = createdItems[idx];
                    const originalItem = finalSaleItems[idx];
                    const sales = originalItem.sales || [];
                    for (const s of sales) {
                        saleItemAssignments.push({
                            order_item_id: createdItem.id,
                            sale_id: s.sale_id || s.id,
                            commission: s.commission || 0,
                            assigned_by: req.user!.id,
                            assigned_at: new Date().toISOString()
                        });
                    }
                }
                if (saleItemAssignments.length > 0) {
                    await supabaseAdmin.from('order_item_sales').insert(saleItemAssignments);
                }
            }
        }

        const { data: customerRow } = await supabaseAdmin
            .from('customers')
            .select('name')
            .eq('id', customer_id)
            .single();
        const customerName = customerRow?.name || 'Khách hàng';

        if (productDepositLines.length === 0 && paidAmountValue > 0 && createdCustomerItems.length > 0) {
            const productTotals = new Map<string, number>();
            for (let i = 0; i < finalCustomerItems.length; i++) {
                const item = finalCustomerItems[i];
                const created = createdCustomerItems[i];
                if (!created?.id || !item?.services) continue;
                let sum = 0;
                for (const svc of item.services) {
                    sum += Math.max(0, Number(svc.deposit_amount) || 0);
                }
                if (sum > 0) productTotals.set(created.id, sum);
            }
            if (productTotals.size === 0) {
                const perProduct = Math.floor(paidAmountValue / createdCustomerItems.length);
                let remainder = paidAmountValue - perProduct * createdCustomerItems.length;
                for (const cp of createdCustomerItems) {
                    const amt = perProduct + (remainder > 0 ? 1 : 0);
                    if (remainder > 0) remainder--;
                    if (amt > 0) {
                        productDepositLines.push({
                            order_product_id: cp.id,
                            product_code: cp.product_code || cp.qr_code,
                            amount: amt,
                        });
                    }
                }
            }
        }

        if (productDepositLines.length > 0) {
            const { total: depositRecorded } = await recordProductDepositPayments({
                orderId: order.id,
                orderCode,
                customerName,
                paymentMethod: payment_method || 'cash',
                createdBy: req.user!.id,
                lines: productDepositLines,
                notes: 'Tiền cọc khi tạo đơn',
            });

            const finalPaid = depositRecorded;
            const finalRemaining = Math.max(0, totalAmount - finalPaid);
            const finalPaymentStatus = finalRemaining <= 0 ? 'paid' : (finalPaid > 0 ? 'partial' : 'unpaid');

            await supabaseAdmin
                .from('orders')
                .update({
                    paid_amount: finalPaid,
                    remaining_debt: finalRemaining,
                    payment_status: finalPaymentStatus,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', order.id);

            order.paid_amount = finalPaid;
            order.remaining_debt = finalRemaining;
            order.payment_status = finalPaymentStatus;

            await createOrderIncomeTransaction({
                orderId: order.id,
                orderCode,
                amount: finalPaid,
                paymentMethod: payment_method || 'cash',
                notes: `Phiếu thu cọc đơn hàng - ${orderCode}`,
                createdBy: req.user!.id,
                category: 'Tiền cọc',
            });
        } else if (paidAmountValue > 0) {
            await createOrderIncomeTransaction({
                orderId: order.id,
                orderCode,
                amount: paidAmountValue,
                paymentMethod: payment_method || 'cash',
                notes: `Phiếu thu đơn hàng - ${orderCode}`,
                createdBy: req.user!.id,
            });
        }

        notifyCrmMaster('order.created', { order, customer_items: createdCustomerItems });

        res.status(201).json({
            status: 'success',
            data: {
                order,
                customer_items: createdCustomerItems
            },
            message: `Đã tạo đơn hàng thành công với ${createdCustomerItems.length} sản phẩm khách gửi.`
        });

        // Auto-create invoice for the order - Force Reload Comment
        console.log(`[OrderCreate] Triggering auto-invoice creation for order ${order.id}`);
        autoCreateInvoice(order.id, payment_method).catch(err => console.error('[OrderCreate] Failed to auto-create invoice:', err));

    } catch (error) {

        next(error);
    }
});

// Upsell: Add more products/services to an existing order
// Create an upsell ticket (to be approved by manager)
router.post(['/:id/upsell-ticket', '/:id/upsell-request', '/:id/edit-request'], authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id: orderId } = req.params;
        const { customer_items, sale_items, notes, request_type, update_payload } = req.body;
        const inferredRequestType = req.path.endsWith('/edit-request') ? 'order_edit' : req.path.endsWith('/upsell-request') ? 'upsell' : request_type;
        const normalizedType = typeof inferredRequestType === 'string' ? inferredRequestType.toLowerCase() : 'upsell';
        const isOrderEditRequest =
            normalizedType === 'order_edit' ||
            normalizedType === 'edit_order' ||
            normalizedType === 'order_update';

        // 1. Get order details to get customer_id
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, order_code, customer_id, sales_id, due_at, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            throw new ApiError('Không tìm thấy đơn hàng', 404);
        }

        if (isOrderEditRequest) {
            const { data: pendingTickets } = await supabaseAdmin
                .from('upsell_tickets')
                .select('id, data')
                .eq('order_id', orderId)
                .eq('status', 'pending');

            const hasPendingEditTicket = (pendingTickets || []).some((ticket: any) => {
                const ticketType = ticket?.data?.request_type || ticket?.data?.ticket_type || ticket?.data?.flow_type || '';
                return ['order_edit', 'edit_order', 'order_update'].includes(String(ticketType).toLowerCase());
            });

            if (hasPendingEditTicket) {
                throw new ApiError('Đơn hàng đang có yêu cầu sửa chờ duyệt', 400);
            }
        }

        // Calculate total amount for the ticket
        let totalAmount = 0;
        if (isOrderEditRequest) {
            const editTotal =
                Number(update_payload?.total_amount) ||
                Number(update_payload?.preview?.total_amount_after) ||
                Number(update_payload?.preview?.total_amount) ||
                0;
            totalAmount = editTotal;
        } else {
            if (customer_items) {
                customer_items.forEach((item: any) => {
                    if (item.services) {
                        item.services.forEach((svc: any) => {
                            totalAmount += Number(svc.price) || 0;
                        });
                    }
                });
            }
            if (sale_items) {
                sale_items.forEach((item: any) => {
                    totalAmount += (Number(item.quantity) || 1) * (Number(item.unit_price) || 0);
                });
            }
        }

        // 2. Create ticket
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('upsell_tickets')
            .insert({
                order_id: orderId,
                sales_id: req.user!.id,
                customer_id: order.customer_id,
                status: 'pending',
                data: isOrderEditRequest
                    ? { request_type: 'order_edit', update_payload }
                    : { customer_items, sale_items },
                total_amount: totalAmount,
                notes: notes || ''
            })
            .select('*, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!upsell_tickets_sales_id_fkey(id, name, role, telegram_chat_id)')
            .single();

        if (ticketError) {
            throw new ApiError('Lỗi khi tạo ticket upsell: ' + ticketError.message, 500);
        }

        const eventName = isOrderEditRequest ? 'order_edit.request.created' : 'upsell.request.created';
        const orderContext = await getOrderNotificationContext(orderId);
        if (orderContext) {
            notifyOrderSalesUser(eventName, orderContext, {
                requester_id: req.user!.id,
                ticket_id: ticket.id,
                ticket: { id: ticket.id, total_amount: ticket.total_amount, request_type: isOrderEditRequest ? 'order_edit' : 'upsell' },
            });
        }

        res.json({
            status: 'success',
            data: ticket,
            message: isOrderEditRequest
                ? 'Đã gửi yêu cầu sửa đơn thành công. Vui lòng chờ quản lý duyệt.'
                : 'Đã gửi yêu cầu upsell thành công. Vui lòng chờ quản lý duyệt.'
        });
    } catch (error) {
        next(error);
    }
});

router.post('/:id/upsell', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { customer_items, sale_items } = req.body;

        // 1. Fetch Order and check status
        const { data: order, error: orderFetchError } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('id', id)
            .single();

        if (orderFetchError || !order) {
            throw new ApiError('Không tìm thấy đơn hàng', 404);
        }

        if (order.status === 'cancelled') {
            throw new ApiError('Không thể upsell trên đơn hàng đã hủy', 400);
        }

        let newSubtotal = 0;
        const createdCustomerItems = [];

        // 2. Process Customer Items (V2)
        if (customer_items && Array.isArray(customer_items) && customer_items.length > 0) {
            // Get count of existing products for code generation
            const { count } = await supabaseAdmin
                .from('order_products')
                .select('*', { count: 'exact', head: true })
                .eq('order_id', id);

            let productIdx = (count || 0) + 1;

            for (const item of customer_items) {
                let orderProduct;

                if (item.order_product_id) {
                    // Use existing product
                    const { data: existingProduct, error: fetchError } = await supabaseAdmin
                        .from('order_products')
                        .select('*')
                        .eq('id', item.order_product_id)
                        .single();

                    if (fetchError || !existingProduct) {
                        console.error('Error fetching existing product for upsell:', fetchError);
                        continue;
                    }
                    orderProduct = existingProduct;
                } else {
                    // Create new product
                    const productCode = `${order.order_code}-${productIdx++}`;

                    const { data: newProduct, error: pError } = await supabaseAdmin
                        .from('order_products')
                        .insert({
                            order_id: id,
                            product_code: productCode,
                            name: item.name,
                            type: item.type,
                            brand: item.brand,
                            color: item.color,
                            size: item.size,
                            material: item.material,
                            condition_before: item.condition_before,
                            images: item.images || [],
                            notes: item.notes,
                            due_at: item.due_at || null,
                            status: 'pending'
                        })
                        .select()
                        .single();

                    if (pError || !newProduct) {
                        console.error('Error creating upsell product:', pError);
                        continue;
                    }
                    orderProduct = newProduct;
                }

                if (item.services && Array.isArray(item.services)) {
                    for (const svc of item.services) {
                        const price = Number(svc.price) || 0;
                        newSubtotal += price;

                        const hasTechs = svc.technicians && svc.technicians.length > 0;
                        const techId = hasTechs ? svc.technicians[0].technician_id : null;

                        const { data: createdSvc, error: sError } = await supabaseAdmin
                            .from('order_product_services')
                            .insert({
                                order_product_id: orderProduct.id,
                                service_id: svc.type === 'service' ? svc.id : null,
                                package_id: svc.type === 'package' ? svc.id : null,
                                item_name: svc.name,
                                item_type: svc.type,
                                unit_price: price,
                                deposit_amount: Math.max(0, Number(svc.deposit_amount) || 0),
                                technician_id: techId,
                                status: hasTechs ? 'assigned' : 'pending',
                                assigned_at: hasTechs ? new Date().toISOString() : null,
                            })
                            .select()
                            .single();

                        if (!sError && createdSvc) {
                            // Tech Assignments
                            if (hasTechs) {
                                const techPayload = svc.technicians.map((t: any) => ({
                                    order_product_service_id: createdSvc.id,
                                    technician_id: t.technician_id,
                                    commission: t.commission || 0,
                                    assigned_by: req.user!.id,
                                    assigned_at: new Date().toISOString(),
                                    status: 'assigned'
                                }));
                                await supabaseAdmin.from('order_product_service_technicians').insert(techPayload);
                            }

                            // Sales Assignments
                            if (svc.sales && svc.sales.length > 0) {
                                const salePayload = svc.sales.map((s: any) => ({
                                    order_product_service_id: createdSvc.id,
                                    sale_id: s.sale_id || s.id,
                                    commission: s.commission || 0,
                                    assigned_by: req.user!.id,
                                    assigned_at: new Date().toISOString()
                                }));
                                await supabaseAdmin.from('order_product_service_sales').insert(salePayload);
                            }

                            // Workflow Steps
                            if (svc.type === 'service' && svc.id) {
                                const { data: sData } = await supabaseAdmin.from('services').select('workflow_id').eq('id', svc.id).single();
                                if (sData?.workflow_id) {
                                    const { data: wSteps } = await supabaseAdmin.from('workflow_steps').select('*').eq('workflow_id', sData.workflow_id).order('step_order', { ascending: true });
                                    if (wSteps) {
                                        const itemSteps = wSteps.map(ws => ({
                                            order_product_service_id: createdSvc.id,
                                            workflow_step_id: ws.id,
                                            step_order: ws.step_order,
                                            step_name: ws.name || `Bước ${ws.step_order}`,
                                            department_id: ws.department_id,
                                            status: 'pending',
                                            estimated_duration: ws.estimated_duration
                                        }));
                                        await supabaseAdmin.from('order_item_steps').insert(itemSteps);
                                    }
                                }
                            }
                        }
                    }
                }
                createdCustomerItems.push(orderProduct);
            }
        }

        // 3. Process Sale Items (V1)
        if (sale_items && Array.isArray(sale_items) && sale_items.length > 0) {
            const baseTime = Date.now().toString().slice(-8);

            for (let idxValue = 0; idxValue < sale_items.length; idxValue++) {
                const itemValue = sale_items[idxValue];
                const qValue = Math.max(1, Number(itemValue.quantity) || 1);
                const pValue = Number(itemValue.unit_price || itemValue.price) || 0;
                const totalValue = pValue * qValue;
                const productId = itemValue.product_id || itemValue.id;

                newSubtotal += totalValue;

                // Check for existing item to aggregate (cộng dồn)
                let targetItemId: string | null = null;

                if (productId) {
                    const { data: existingItem } = await supabaseAdmin
                        .from('order_items')
                        .select('id, quantity, total_price')
                        .eq('order_id', id)
                        .eq('product_id', productId)
                        .eq('unit_price', pValue)
                        .eq('status', 'pending') // Only aggregate if still pending
                        .maybeSingle();

                    if (existingItem) {
                        targetItemId = existingItem.id;
                        const newQty = (Number(existingItem.quantity) || 0) + qValue;
                        const newTotal = (Number(existingItem.total_price) || 0) + totalValue;

                        await supabaseAdmin
                            .from('order_items')
                            .update({
                                quantity: newQty,
                                total_price: newTotal,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', targetItemId);
                    }
                }

                if (!targetItemId) {
                    // Create new item if not aggregated
                    const { data: newItem, error: insertError } = await supabaseAdmin
                        .from('order_items')
                        .insert({
                            order_id: id,
                            product_id: productId || null,
                            item_type: 'product',
                            item_name: itemValue.name || 'Sản phẩm upsell',
                            quantity: qValue,
                            unit_price: pValue,
                            total_price: totalValue,
                            item_code: `UP${baseTime}${idxValue.toString().padStart(2, '0')}`,
                            status: 'pending'
                        })
                        .select()
                        .single();

                    if (!insertError && newItem) {
                        targetItemId = newItem.id;
                    }
                }

                // Handle assignments if we have a target item
                if (targetItemId) {
                    const sales = itemValue.sales || [];
                    if (sales.length > 0) {
                        const saleItemAssignments = sales.map((s: any) => ({
                            order_item_id: targetItemId,
                            sale_id: s.sale_id || s.id,
                            commission: s.commission || 0,
                            assigned_by: req.user!.id,
                            assigned_at: new Date().toISOString()
                        }));
                        await supabaseAdmin.from('order_item_sales').insert(saleItemAssignments);
                    }
                }

                // Decrement stock for catalog product
                if (productId) {
                    try {
                        const { data: currentProd } = await supabaseAdmin.from('products').select('stock').eq('id', productId).single();
                        if (currentProd) {
                            const newStock = Math.max(0, (currentProd.stock || 0) - qValue);
                            await supabaseAdmin.from('products').update({ stock: newStock }).eq('id', productId);
                        }
                    } catch (err) {
                        console.error(`Error decrementing stock during upsell for product ${productId}:`, err);
                    }
                }
            }
        }

        // 4. Update Order Totals
        const updatedSubtotal = (Number(order.subtotal) || 0) + newSubtotal;
        const updatedTotalAmount = (Number(order.total_amount) || 0) + newSubtotal;
        const updatedRemainingDebt = (Number(order.remaining_debt) || 0) + newSubtotal;

        const { error: updateError } = await supabaseAdmin
            .from('orders')
            .update({
                subtotal: updatedSubtotal,
                total_amount: updatedTotalAmount,
                remaining_debt: updatedRemainingDebt,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) {
            console.error('Error updating order totals after upsell:', updateError);
        }

        notifyCrmMaster('order.upsell_added', { order_id: id, newSubtotal, customer_items: createdCustomerItems });

        res.json({
            status: 'success',
            data: {
                newSubtotal,
                createdCustomerItems
            },
            message: `Đã thêm thành công ${newSubtotal.toLocaleString()}đ vào đơn hàng.`
        });

    } catch (error) {
        next(error);
    }
});

// Update order (items, notes, discount)
router.put('/:id', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { items, notes, discount } = req.body;

        // Check if order exists and is not completed/cancelled
        const { data: existingOrder } = await supabaseAdmin
            .from('orders')
            .select('status')
            .eq('id', id)
            .single();

        if (!existingOrder) {
            throw new ApiError('Không tìm thấy đơn hàng', 404);
        }

        if (existingOrder.status === 'after_sale' || existingOrder.status === 'cancelled') {
            throw new ApiError('Không thể cập nhật đơn hàng đã hoàn thành hoặc đã huỷ', 400);
        }

        // Recalculate totals
        let subtotal = 0;
        for (const item of items) {
            subtotal += (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
        }
        const discountAmount = Number(discount) || 0;
        const totalAmount = subtotal - discountAmount;

        // Update order
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .update({
                subtotal,
                discount: discountAmount,
                total_amount: totalAmount,
                notes,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('*, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)')
            .single();

        if (orderError) {
            throw new ApiError('Lỗi khi cập nhật đơn hàng: ' + orderError.message, 500);
        }

        // Separate items
        // items from EditOrderDialog currently might be a mix.
        // We only want to manage order_items (Sale Items/V1 style) here.
        // Customer Items (order_products) are managed elsewhere (or preserved for now).
        const saleItemsToInsert = items
            .filter((item: any) => !item.is_customer_item)
            .map((item: any) => {
                const totalPrice = (Number(item.quantity) || 1) * (Number(item.unit_price) || 0);
                const commissionSaleRate = Number(item.commission_sale) || 0;
                const commissionTechRate = Number(item.commission_tech) || 0;
                const commissionSaleAmount = Math.floor(totalPrice * commissionSaleRate / 100);
                const commissionTechAmount = Math.floor(totalPrice * commissionTechRate / 100);

                // Ensure item_id is a valid UUID for products/services if needed
                // If it's a random string or invalid, we should be careful.
                const product_id = item.type === 'product' ? item.item_id : null;
                const service_id = (item.type === 'service' || item.type === 'package') ? item.item_id : null;

                return {
                    order_id: id,
                    product_id,
                    service_id,
                    item_type: item.type,
                    item_name: item.name,
                    quantity: Number(item.quantity) || 1,
                    unit_price: Number(item.unit_price) || 0,
                    total_price: totalPrice,
                    technician_id: item.technician_id || null,
                    item_code: item.item_code || `IT${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
                    commission_sale_rate: commissionSaleRate,
                    commission_tech_rate: commissionTechRate,
                    commission_sale_amount: commissionSaleAmount,
                    commission_tech_amount: commissionTechAmount,
                    _sales: item.sales || [] // temp metadata
                };
            });

        // Delete only old Sale Items (those in order_items table)
        // Note: order_products are in a different table and won't be deleted by this.
        await supabaseAdmin
            .from('order_items')
            .delete()
            .eq('order_id', id);

        if (saleItemsToInsert.length > 0) {
            const { data: createdItems, error: itemsError } = await supabaseAdmin
                .from('order_items')
                .insert(saleItemsToInsert.map(({ _sales, ...data }: any) => data))
                .select();

            if (itemsError || !createdItems) {
                console.error('Error updating sale items:', itemsError);
                throw new ApiError('Lỗi khi cập nhật danh sách sản phẩm bán kèm', 500);
            }

            // Insert Sales assignments
            const saleItemAssignments: any[] = [];
            for (let idx = 0; idx < createdItems.length; idx++) {
                const createdItem = createdItems[idx];
                const originalItem = saleItemsToInsert[idx];
                const sales = originalItem._sales || [];
                for (const s of sales) {
                    saleItemAssignments.push({
                        order_item_id: createdItem.id,
                        sale_id: s.sale_id || s.id,
                        commission: s.commission || 0,
                        assigned_by: req.user!.id,
                        assigned_at: new Date().toISOString()
                    });
                }
            }
            if (saleItemAssignments.length > 0) {
                await supabaseAdmin.from('order_item_sales').insert(saleItemAssignments);
            }
        }

        // Fetch updated order with items
        const { data: updatedOrder } = await supabaseAdmin
            .from('orders')
            .select(`
                *,
                customer:customers(id, name, phone, email),
                sales_user:users!orders_sales_id_fkey(id, name),
                items:order_items(
                    id, order_id, product_id, service_id, item_type, item_name, quantity, unit_price, total_price,
                    sales:order_item_sales(
                        id, sale_id, commission, assigned_at,
                        sale:users!order_item_sales_sale_id_fkey(id, name, avatar)
                    )
                )
            `)
            .eq('id', id)
            .single();
        notifyCrmMaster('order.updated', { order: updatedOrder });

        res.json({
            status: 'success',
            data: { order: updatedOrder },
        });
    } catch (error) {
        next(error);
    }
});

router.put('/:id/full', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { customer_items, sale_items, notes } = req.body;

        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, customer_id')
            .eq('id', id)
            .single();

        if (orderError || !order) {
            throw new ApiError('Không tìm thấy đơn hàng', 404);
        }

        const { data: pendingTickets } = await supabaseAdmin
            .from('upsell_tickets')
            .select('id, data')
            .eq('order_id', id)
            .eq('status', 'pending');

        const hasPendingEditTicket = (pendingTickets || []).some((ticket: any) => {
            const ticketType = ticket?.data?.request_type || ticket?.data?.ticket_type || ticket?.data?.flow_type || '';
            return ['order_edit', 'edit_order', 'order_update'].includes(String(ticketType).toLowerCase());
        });

        if (hasPendingEditTicket) {
            throw new ApiError('Đơn hàng đang có yêu cầu sửa chờ duyệt', 400);
        }

        let totalAmount = Number(req.body?.total_amount) || 0;
        if (!totalAmount) {
            let subtotal = 0;
            if (customer_items && Array.isArray(customer_items)) {
                for (const item of customer_items) {
                    if (item.services && Array.isArray(item.services)) {
                        for (const svc of item.services) {
                            subtotal += Number(svc.price) || 0;
                        }
                    }
                    subtotal += Number(item.surcharge_amount) || 0;
                }
            }
            if (sale_items && Array.isArray(sale_items)) {
                for (const item of sale_items) {
                    subtotal += (Number(item.quantity) || 1) * (Number(item.unit_price) || 0);
                    subtotal += Number(item.surcharge_amount) || 0;
                }
            }
            const discountAmount = Number(req.body?.discount) || 0;
            const topLevelSurchargeAmount = Array.isArray(req.body?.surcharges)
                ? req.body.surcharges.reduce((sum: number, s: any) => sum + (Number(s?.amount) || 0), 0)
                : 0;
            totalAmount = Math.max(0, subtotal - discountAmount + topLevelSurchargeAmount);
        }

        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('upsell_tickets')
            .insert({
                order_id: id,
                sales_id: req.user!.id,
                customer_id: order.customer_id,
                status: 'pending',
                data: {
                    request_type: 'order_edit',
                    update_payload: req.body
                },
                total_amount: totalAmount,
                notes: notes || 'Yêu cầu sửa đơn'
            })
            .select('*, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!upsell_tickets_sales_id_fkey(id, name, role, telegram_chat_id)')
            .single();

        if (ticketError) {
            throw new ApiError('Lỗi khi tạo yêu cầu sửa đơn: ' + ticketError.message, 500);
        }

        res.status(202).json({
            status: 'success',
            data: ticket,
            message: 'Đã gửi yêu cầu sửa đơn. Vui lòng chờ admin/quản lý duyệt trước khi áp dụng.'
        });
    } catch (error) {
        next(error);
    }
});

const CARE_WARRANTY_FLOWS = ['warranty', 'care'];
const CARE_WARRANTY_STAGES = ['war1', 'war2', 'war3', 'care6', 'care12', 'care-custom'];

// Update order (partial: due_at, after-sale data, care_warranty)
router.patch('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        let oldCareFlow: string | null | undefined;
        let oldCareStage: string | null | undefined;
        let oldAfterSaleStage: string | null | undefined;
        const {
            completion_photos,
            debt_checked,
            debt_checked_notes,
            debt_checked_by_name,
            debt_payment_photos,
            aftersale_receiver_name,
            packaging_photos,
            delivery_carrier,
            delivery_address,
            delivery_self_pickup,
            delivery_type,
            delivery_code,
            delivery_fee,
            aftersale_return_user_name,
            delivery_notes,
            hd_sent,
            hd_sent_photos,
            feedback_requested,
            feedback_requested_photos,
            care_warranty_flow,
            care_warranty_stage,
            after_sale_stage,
            delivery_creator_name,
            delivery_shipper_phone,
            delivery_staff_name,
            delivery_received_at,
        } = req.body;

        let currentData: any = null;
        if (care_warranty_flow !== undefined || care_warranty_stage !== undefined || after_sale_stage !== undefined) {
            const { data: current } = await supabaseAdmin
                .from('orders')
            .select('care_warranty_flow, care_warranty_stage, after_sale_stage, debt_start_at')
            .eq('id', id)
            .single();
            currentData = current;
            if (care_warranty_flow !== undefined || care_warranty_stage !== undefined) {
                oldCareFlow = (current as any)?.care_warranty_flow ?? null;
                oldCareStage = (current as any)?.care_warranty_stage ?? null;
            }
            if (after_sale_stage !== undefined) {
                oldAfterSaleStage = (current as any)?.after_sale_stage ?? null;
            }
        }

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (completion_photos !== undefined) updatePayload.completion_photos = Array.isArray(completion_photos) ? completion_photos : [];
        if (debt_checked !== undefined) {
            updatePayload.debt_checked = !!debt_checked;
            updatePayload.debt_checked_at = !!debt_checked ? new Date().toISOString() : null;
        }
        if (debt_checked_notes !== undefined) updatePayload.debt_checked_notes = debt_checked_notes ?? null;
        if (debt_checked_by_name !== undefined) updatePayload.debt_checked_by_name = debt_checked_by_name ?? null;
        if (debt_payment_photos !== undefined) updatePayload.debt_payment_photos = Array.isArray(debt_payment_photos) ? debt_payment_photos : [];
        if (aftersale_receiver_name !== undefined) updatePayload.aftersale_receiver_name = aftersale_receiver_name ?? null;
        if (packaging_photos !== undefined) updatePayload.packaging_photos = Array.isArray(packaging_photos) ? packaging_photos : [];
        if (delivery_carrier !== undefined) updatePayload.delivery_carrier = delivery_carrier ?? null;
        if (delivery_address !== undefined) updatePayload.delivery_address = delivery_address ?? null;
        if (delivery_self_pickup !== undefined) updatePayload.delivery_self_pickup = !!delivery_self_pickup;
        if (delivery_type !== undefined) updatePayload.delivery_type = delivery_type ?? 'ship';
        if (delivery_code !== undefined) updatePayload.delivery_code = delivery_code ?? null;
        if (delivery_fee !== undefined) updatePayload.delivery_fee = Number(delivery_fee) || 0;
        if (aftersale_return_user_name !== undefined) updatePayload.aftersale_return_user_name = aftersale_return_user_name ?? null;
        if (delivery_notes !== undefined) updatePayload.delivery_notes = delivery_notes ?? null;
        if (delivery_creator_name !== undefined) updatePayload.delivery_creator_name = delivery_creator_name || null;
        if (delivery_shipper_phone !== undefined) updatePayload.delivery_shipper_phone = delivery_shipper_phone || null;
        if (delivery_staff_name !== undefined) updatePayload.delivery_staff_name = delivery_staff_name || null;
        if (delivery_received_at !== undefined) updatePayload.delivery_received_at = delivery_received_at || null;
        if (hd_sent !== undefined) {
            updatePayload.hd_sent = !!hd_sent;
            updatePayload.hd_sent_at = !!hd_sent ? new Date().toISOString() : null;
        }
        if (hd_sent_photos !== undefined) updatePayload.hd_sent_photos = Array.isArray(hd_sent_photos) ? hd_sent_photos : [];
        if (feedback_requested !== undefined) {
            updatePayload.feedback_requested = !!feedback_requested;
            updatePayload.feedback_requested_at = !!feedback_requested ? new Date().toISOString() : null;
        }
        if (feedback_requested_photos !== undefined) updatePayload.feedback_requested_photos = Array.isArray(feedback_requested_photos) ? feedback_requested_photos : [];
        if (care_warranty_flow !== undefined) {
            if (care_warranty_flow !== null && !CARE_WARRANTY_FLOWS.includes(care_warranty_flow)) {
                throw new ApiError('care_warranty_flow không hợp lệ. Chọn: warranty, care', 400);
            }
            updatePayload.care_warranty_flow = care_warranty_flow || null;
        }
        if (care_warranty_stage !== undefined) {
            if (care_warranty_stage !== null && !CARE_WARRANTY_STAGES.includes(care_warranty_stage)) {
                throw new ApiError('care_warranty_stage không hợp lệ. Chọn: war1, war2, war3, care6, care12, care-custom', 400);
            }
            updatePayload.care_warranty_stage = care_warranty_stage || null;
            if (care_warranty_stage && (oldCareStage === null || oldCareStage === undefined)) {
                updatePayload.care_warranty_started_at = new Date().toISOString();
            }
        }
        if (after_sale_stage !== undefined) {
            updatePayload.after_sale_stage = after_sale_stage || null;

            // Set debt_start_at when entering kiểm nợ stage (only if not already set)
            if (after_sale_stage === 'after1_debt' && !currentData?.debt_start_at) {
                updatePayload.debt_start_at = new Date().toISOString();
            }
        }

        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .update(updatePayload)
            .eq('id', id)
            .select('*, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)')
            .single();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật đơn hàng', 500);
        }

        if (debt_checked === true) {
            const managers = await getManagerRecipients();
            const recipients = [
                ...managers,
                ...(order.sales_id ? [{ id: order.sales_id, role: 'sale' }] : []),
            ];

            for (const recipient of recipients) {
                notifyCrmMasterUser('aftersale.debt_check.started', {
                    target_user_id: recipient.id,
                    target_role: recipient.role || 'manager',
                    channel: 'telegram',
                    order: { id: order.id, order_code: order.order_code, return_due_at: order.due_at || null },
                    links: { crm_url: buildCrmOrderUrl(order.order_code || order.id) },
                });
            }
        }

        const orderCustomer = Array.isArray((order as any).customer) ? (order as any).customer[0] : (order as any).customer;
        const orderSalesUser = Array.isArray((order as any).sales_user) ? (order as any).sales_user[0] : (order as any).sales_user;
        const orderNotifyContext = { order, customer: orderCustomer, salesUser: orderSalesUser };

        if (delivery_code !== undefined && delivery_code) {
            notifyOrderCustomerZalo('shipping.tracking_code.updated', orderNotifyContext, {
                shipping: {
                    tracking_code: delivery_code,
                    carrier_name: delivery_carrier || order.delivery_carrier || null,
                    shipped_at: order.updated_at || new Date().toISOString(),
                    note: delivery_notes || order.delivery_notes || null,
                },
                sale_id: order.sales_id || null,
            });
        }

        if (feedback_requested === true || hd_sent === true) {
            notifyOrderCustomerZalo('aftersale.care_feedback.started', orderNotifyContext, {
                aftersale: {
                    care_type: 'care_feedback',
                    template_code: 'care_feedback_default',
                    scheduled_at: new Date().toISOString(),
                },
                sale_id: order.sales_id || null,
            });
        }

        if (care_warranty_flow !== undefined || care_warranty_stage !== undefined || after_sale_stage !== undefined) {
            const newFlow = care_warranty_flow !== undefined ? care_warranty_flow : oldCareFlow ?? null;
            const newStage = care_warranty_stage !== undefined ? care_warranty_stage : oldCareStage ?? null;
            const newAfterSale = after_sale_stage;

            let itemPhase: string | null = null;
            let itemPhaseStage: string | null = null;

            if (newFlow === 'warranty') {
                itemPhase = 'warranty';
                itemPhaseStage = newStage || 'war1';
            } else if (newFlow === 'care') {
                itemPhase = 'care';
                itemPhaseStage = newStage || 'care6';
            }
            // after_sale_stage on order is metadata only — each product has its own stage via PATCH .../after-sale-data

            if (itemPhase) {
                console.log('[OrderPatch] Propagating phase to items:', id, itemPhase, itemPhaseStage);
                const phaseUpdate = { current_phase: itemPhase, phase_stage: itemPhaseStage };
                const { data: prods } = await supabaseAdmin.from('order_products').select('id').eq('order_id', id);
                const prodIds = (prods || []).map((p: { id: string }) => p.id);
                const propagations: PromiseLike<unknown>[] = [
                    supabaseAdmin.from('order_items').update(phaseUpdate).eq('order_id', id),
                    supabaseAdmin.from('order_products').update(phaseUpdate).eq('order_id', id),
                ];
                if (prodIds.length > 0) {
                    propagations.push(
                        supabaseAdmin.from('order_product_services').update(phaseUpdate).in('order_product_id', prodIds)
                    );
                }
                await Promise.all(propagations);
            }
        }

        const newCareFlow = care_warranty_flow !== undefined ? (care_warranty_flow || null) : oldCareFlow ?? null;
        const newCareStage = care_warranty_stage !== undefined ? (care_warranty_stage || null) : oldCareStage ?? null;
        const careStageChanged = (care_warranty_stage !== undefined && (oldCareStage !== care_warranty_stage || oldCareFlow !== care_warranty_flow))
            || (care_warranty_flow !== undefined && (oldCareFlow !== care_warranty_flow || oldCareStage !== care_warranty_stage));
        if (careStageChanged && newCareStage) {
            const flowType = ['war1', 'war2', 'war3'].includes(newCareStage) ? 'warranty' : 'care';
            try {
                await supabaseAdmin.from('order_care_warranty_log').insert({
                    order_id: id,
                    from_stage: oldCareStage ?? null,
                    to_stage: newCareStage,
                    flow_type: flowType,
                    created_by: userId ?? null
                });
            } catch (logErr) {
                console.error('order_care_warranty_log insert error:', logErr);
            }
        }

        if (after_sale_stage !== undefined && oldAfterSaleStage !== after_sale_stage) {
            try {
                // Determine previous stage from log if needed, or just use oldAfterSaleStage
                await supabaseAdmin.from('order_after_sale_stage_log').insert({
                    order_id: id,
                    from_stage: oldAfterSaleStage ?? null,
                    to_stage: after_sale_stage,
                    created_by: userId ?? null
                });
            } catch (logErr) {
                console.error('order_after_sale_stage_log insert error:', logErr);
            }
        }

        res.json({
            status: 'success',
            data: { order },
        });
    } catch (error) {
        next(error);
    }
});

// Update order status
router.patch('/:id/status', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['before_sale', 'in_progress', 'done', 'after_sale', 'cancelled'];
        if (!validStatuses.includes(status)) {
            throw new ApiError('Trạng thái không hợp lệ', 400);
        }

        // When moving to in_progress: set confirmed_at only on first time (do not overwrite)
        let confirmedAtPayload: { confirmed_at?: string } = {};
        if (status === 'in_progress') {
            const { data: existing } = await supabaseAdmin
                .from('orders')
                .select('confirmed_at')
                .eq('id', id)
                .single();
            if (!existing?.confirmed_at) {
                confirmedAtPayload = { confirmed_at: new Date().toISOString() };
            }
        }

        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .update({
                status,
                updated_at: new Date().toISOString(),
                ...(status === 'after_sale' && { completed_at: new Date().toISOString() }),
                ...confirmedAtPayload,
            })
            .eq('id', id)
            .select('*, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)')
            .single();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật đơn hàng', 500);
        }

        notifyCrmMaster('order.status_updated', { order });

        res.json({
            status: 'success',
            data: { order },
        });
    } catch (error) {
        next(error);
    }
});

// =====================================================
// PAYMENT RECORDS - Thanh toán đơn hàng
// =====================================================

// Get payment records for an order
router.get('/:id/payments', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: payments, error } = await fetchOrderPaymentRecords(id);

        if (error) {
            console.error('Error fetching payments:', error);
            throw new ApiError('Lỗi khi lấy danh sách thanh toán', 500);
        }

        res.json({
            status: 'success',
            data: { payments: payments || [] },
        });
    } catch (error) {
        next(error);
    }
});

// Create a payment record for an order
router.post('/:id/payments', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { content, amount, payment_method, image_url, notes, order_product_id } = req.body;
        const amountNum = Number(amount);

        if (!content || !Number.isFinite(amountNum) || amountNum <= 0) {
            throw new ApiError('Nội dung và số tiền là bắt buộc', 400);
        }

        // Get order details
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id, order_code, customer_id, total_amount, paid_amount, remaining_debt')
            .eq('id', id)
            .single();

        if (orderError || !order) {
            throw new ApiError('Không tìm thấy đơn hàng', 404);
        }

        // Create payment record (no direct payment_records → customers FK in schema)
        const { data: payment, error: paymentError } = await insertPaymentRecord({
            order_id: order.id,
            order_code: order.order_code,
            content,
            amount: amountNum,
            payment_method: payment_method || 'cash',
            image_url: image_url || null,
            notes: notes || null,
            transaction_type: 'income',
            transaction_category: 'Thanh toán đơn hàng',
            transaction_status: 'approved',
            created_by: req.user!.id,
            order_product_id: order_product_id || null,
            payment_kind: 'payment',
        });

        if (paymentError) {
            console.error('Error creating payment:', paymentError);
            throw new ApiError('Lỗi khi tạo thanh toán: ' + paymentError.message, 500);
        }

        // Update order's paid_amount and remaining_debt
        const newPaidAmount = (order.paid_amount || 0) + amountNum;
        const newRemainingDebt = Math.max(0, order.total_amount - newPaidAmount);
        const newPaymentStatus = newRemainingDebt <= 0 ? 'paid' : (newPaidAmount > 0 ? 'partial' : 'unpaid');

        const { error: updateError } = await supabaseAdmin
            .from('orders')
            .update({
                paid_amount: newPaidAmount,
                remaining_debt: newRemainingDebt,
                payment_status: newPaymentStatus,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);

        if (updateError) {
            console.error('Error updating order payment:', updateError);
            // Don't fail, payment was recorded
        }

        // Check for auto-completion (Paid + All Services Done)
        await checkAndCompleteOrder(id);

        // Also create a transaction record for Thu Chi
        const { data: lastTrans } = await supabaseAdmin
            .from('transactions')
            .select('code')
            .like('code', 'PT%')
            .order('created_at', { ascending: false })
            .limit(1);

        let transCode = 'PT000001';
        if (lastTrans && lastTrans.length > 0) {
            const lastNum = parseInt(lastTrans[0].code.replace('PT', ''), 10);
            transCode = `PT${String(lastNum + 1).padStart(6, '0')}`;
        }

        // Find associated invoice to link and update
        const { data: invoice } = await supabaseAdmin
            .from('invoices')
            .select('id, total_amount, order_item_ids, order_product_service_ids')
            .eq('order_id', order.id)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const { error: transError } = await supabaseAdmin
            .from('transactions')
            .insert({
                code: transCode,
                type: 'income',
                category: 'Thanh toán đơn hàng',
                amount: amountNum,
                payment_method: payment_method || 'cash',
                notes: `${content} - ${order.order_code}`,
                image_url,
                date: new Date().toISOString().split('T')[0],
                order_id: order.id,
                order_code: order.order_code,
                status: 'approved',
                created_by: req.user!.id,
                approved_by: req.user!.id,
                approved_at: new Date().toISOString(),
            });

        if (transError) {
            console.error('Error creating transaction for payment:', transError);
        } else {
            console.log(`Created transaction ${transCode} for order ${order.order_code} payment`);
            await notifyFinanceEvent({
                event: 'receipt.created',
                title: 'Phiếu thu mới',
                message: `${req.user!.name} đã tạo phiếu thu ${transCode}`,
                actor: req.user!,
                recipientUserIds: [req.user!.id],
                data: {
                    code: transCode,
                    type: 'income',
                    category: 'Thanh toán đơn hàng',
                    amount: amountNum,
                    payment_method: payment_method || 'cash',
                    status: 'approved',
                    order_id: order.id,
                    order_code: order.order_code,
                    invoice_id: invoice?.id,
                    notes: `${content} - ${order.order_code}`,
                },
            });
        }

        // 3. Create a record in finance_transactions for consistent tracking and Invoices view
        // We do this for EVERY payment (partial or full) so it shows up in "Phiếu thu" tab
        if (invoice) {
            const financeTransCode = `PT${Date.now().toString().slice(-8)}`;
            await supabaseAdmin
                .from('finance_transactions')
                .insert({
                    code: financeTransCode,
                    type: 'income',
                    amount: amountNum, // The specific payment amount recorded now
                    category: 'Thanh toán đơn hàng',
                    description: `${content} - Hóa đơn ${invoice.id.slice(0, 8)} - ${order.order_code}`,
                    customer_id: (order as any).customer_id || null, 
                    invoice_id: invoice.id,
                    payment_method: payment_method || 'cash',
                    status: 'approved',
                    created_by: req.user!.id
                });
            console.log(`Created finance_transaction ${financeTransCode} linked to invoice ${invoice.id}`);
        }

        // Sync associated invoices (updates totals/items and marks as paid if settled)
        syncInvoiceWithOrder(id, payment_method).catch(err => console.error('[OrderPayment] Failed to sync invoice:', err));

        notifyCrmMaster('order.payment_added', {
            payment,
            order: {
                id,
                paid_amount: newPaidAmount,
                remaining_debt: newRemainingDebt,
                payment_status: newPaymentStatus,
            },
        });

        res.status(201).json({
            status: 'success',
            data: {
                payment,
                order: {
                    paid_amount: newPaidAmount,
                    remaining_debt: newRemainingDebt,
                    payment_status: newPaymentStatus,
                }
            },
            message: `Đã ghi nhận thanh toán ${amountNum.toLocaleString()}đ`,
        });
    } catch (error) {
        next(error);
    }
});

// =====================================================
// ORDER EXTENSION REQUESTS (Xin gia hạn)
// =====================================================
const EXTENSION_STATUSES = ['requested', 'sale_contacted', 'manager_approved', 'notified_tech', 'kpi_recorded', 'rejected'];

router.post('/:id/extension-request', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { reason, new_due_at } = req.body;

        if (!reason || typeof reason !== 'string' || !reason.trim()) {
            throw new ApiError('Lý do gia hạn là bắt buộc', 400);
        }

        const { data: order } = await supabaseAdmin.from('orders').select('id').eq('id', id).maybeSingle();
        if (!order) {
            throw new ApiError('Không tìm thấy đơn hàng', 404);
        }

        const { data: row, error } = await supabaseAdmin
            .from('order_extension_requests')
            .insert({
                order_id: id,
                requested_by: req.user!.id,
                reason: reason.trim(),
                new_due_at: new_due_at || null,
                status: 'requested',
            })
            .select('*, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)')
            .single();

        if (error) throw new ApiError('Lỗi tạo yêu cầu gia hạn: ' + error.message, 500);

        const context = await getOrderNotificationContext(id);
        if (context) {
            notifyOrderSalesUser('extension.request.created', context, {
                requester_id: req.user!.id,
                extension_request: row,
                reason: reason.trim(),
                new_deadline: new_due_at || null,
            });
        }

        res.status(201).json({
            status: 'success',
            data: row,
            message: 'Đã gửi yêu cầu gia hạn',
        });
    } catch (error) {
        next(error);
    }
});

router.patch('/:id/extension-request', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { customer_result, new_due_at, valid_reason, status } = req.body;

        const { data: latest } = await supabaseAdmin
            .from('order_extension_requests')
            .select('*')
            .eq('order_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!latest) {
            throw new ApiError('Không tìm thấy yêu cầu gia hạn', 404);
        }

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof customer_result === 'string') updatePayload.customer_result = customer_result;
        if (new_due_at !== undefined) updatePayload.new_due_at = new_due_at || null;
        if (typeof valid_reason === 'boolean') updatePayload.valid_reason = valid_reason;
        if (status && EXTENSION_STATUSES.includes(status)) updatePayload.status = status;
        if (new_due_at && req.user?.id) {
            updatePayload.approved_by = req.user.id;
            updatePayload.approved_at = new Date().toISOString();
        }

        const { data: updated, error } = await supabaseAdmin
            .from('order_extension_requests')
            .update(updatePayload)
            .eq('id', latest.id)
            .select('*, customer:customers(id, name, phone, zalo_user_id, customer_zalo_user_id), sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)')
            .single();

        if (error) throw new ApiError('Lỗi cập nhật: ' + error.message, 500);

        if (status === 'manager_approved' || status === 'rejected') {
            const context = await getOrderNotificationContext(id);
            if (context) {
                notifyOrderSalesUser(status === 'manager_approved' ? 'extension.approved' : 'extension.rejected', context, {
                    requester_id: updated.requested_by || null,
                    approver_id: req.user?.id || null,
                    extension_request: updated,
                    customer_result: updated.customer_result || customer_result || null,
                    new_deadline: updated.new_due_at || new_due_at || null,
                    valid_reason: typeof updated.valid_reason === 'boolean' ? updated.valid_reason : valid_reason,
                });
            }
        }

        // Removed global order due_at update
        
        // Resume SLA khi extension được xử lý xong
        if (updated && status && (status === 'notified_tech' || status === 'rejected')) {
            const itemId = updated.order_item_id || updated.order_product_service_id;
            if (itemId) {
                const stepFilter = updated.order_item_id 
                    ? { order_item_id: itemId }
                    : { order_product_service_id: itemId };
                
                // Fetch steps đang pause
                const { data: pausedSteps } = await supabaseAdmin
                    .from('order_item_steps')
                    .select('id, sla_paused_at, sla_total_paused_minutes')
                    .match(stepFilter)
                    .not('sla_paused_at', 'is', null);
                
                if (pausedSteps && pausedSteps.length > 0) {
                    const now = new Date();
                    for (const step of pausedSteps) {
                        if (!step.sla_paused_at) continue;
                        const pausedAt = new Date(step.sla_paused_at);
                        const pausedMinutes = Math.round((now.getTime() - pausedAt.getTime()) / 60000);
                        
                        await supabaseAdmin
                            .from('order_item_steps')
                            .update({
                                sla_paused_at: null,
                                sla_total_paused_minutes: (step.sla_total_paused_minutes || 0) + Math.max(0, pausedMinutes)
                            })
                            .eq('id', step.id);
                    }
                }
            }
        }

        if (status === 'kpi_recorded' && updated && !(updated as any).valid_reason) {
            await supabaseAdmin
                .from('order_extension_requests')
                .update({ kpi_late_recorded: true })
                .eq('id', latest.id);
        }

        res.json({
            status: 'success',
            data: updated,
            message: 'Đã cập nhật yêu cầu gia hạn',
        });
    } catch (error) {
        next(error);
    }
});

router.post('/:id/accessory-request', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id: orderId } = req.params;
        const { order_item_id, order_product_service_id, notes, metadata } = req.body;
        if (!order_item_id && !order_product_service_id) {
            throw new ApiError('Cần order_item_id hoặc order_product_service_id', 400);
        }

        const { data: accessory, error } = await supabaseAdmin
            .from('order_item_accessories')
            .insert({
                order_item_id: order_item_id || null,
                order_product_service_id: order_product_service_id || null,
                status: 'need_buy',
                notes: notes || null,
                metadata: metadata || {},
                updated_by: req.user?.id || null,
            })
            .select('*')
            .single();

        if (error) throw new ApiError('Không thể tạo yêu cầu phụ kiện: ' + error.message, 500);

        const context = await getOrderNotificationContext(orderId);
        if (context) {
            notifyOrderSalesUser('accessory.request.created', context, {
                requester_id: req.user!.id,
                accessory_request: accessory,
                item: {
                    id: order_item_id || order_product_service_id || null,
                    order_item_id: order_item_id || null,
                    order_product_service_id: order_product_service_id || null,
                    note: notes || null,
                },
            });
        }

        notifyCrmMaster('accessory.request.created', {
            accessory_id: accessory.id,
            order_id: orderId,
            order_item_id: order_item_id || null,
            order_product_service_id: order_product_service_id || null,
            notes: notes || null,
            metadata: metadata || {},
            requested_by: req.user?.id || null,
        });

        res.status(201).json({ status: 'success', data: accessory, message: 'Đã tạo yêu cầu phụ kiện' });
    } catch (error) {
        next(error);
    }
});

router.post('/:id/debt-check', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id: orderId } = req.params;
        const { notes, debt_checked_by_name } = req.body;
        const now = new Date().toISOString();

        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .update({
                debt_checked: true,
                debt_checked_at: now,
                debt_checked_notes: notes || null,
                debt_checked_by_name: debt_checked_by_name || req.user?.name || null,
            })
            .eq('id', orderId)
            .select('id, order_code, sales_id, due_at')
            .single();

        if (error) throw new ApiError('Không thể bắt đầu kiểm nợ: ' + error.message, 500);

        const context = await getOrderNotificationContext(orderId);
        if (context) {
            notifyOrderSalesUser('aftersale.debt_check.started', context, {
                requester_id: req.user!.id,
                notes: notes || null,
                customer_phone: context.customer?.phone || null,
            });
        }

        res.json({ status: 'success', data: order, message: 'Đã bắt đầu kiểm nợ' });
    } catch (error) {
        next(error);
    }
});
// Delete order
router.delete('/:id', authenticate, authorize('sale', 'manager', 'admin', 'accountant'), async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        await deleteOrderCascade(id);

        res.json({
            status: 'success',
            message: 'Đã xóa đơn hàng',
        });
    } catch (error) {
        next(error);
    }
});

export { router as ordersRouter };







