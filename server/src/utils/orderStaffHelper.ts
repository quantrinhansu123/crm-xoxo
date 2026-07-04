type StaffUser = { id: string; name: string; telegram_chat_id?: string | null };

function normalizeUser(user: unknown): StaffUser | null {
    if (!user || typeof user !== 'object') return null;
    const u = user as { id?: string; name?: string; telegram_chat_id?: string | null };
    if (!u.id || !u.name) return null;
    return { id: u.id, name: u.name, telegram_chat_id: u.telegram_chat_id ?? null };
}

/** Sale chốt theo dịch vụ — không gộp sales_id cấp đơn */
export function collectAssignedSalesFromServices(services: any[]): StaffUser[] {
    const map = new Map<string, StaffUser>();
    for (const service of services || []) {
        for (const row of service.sales || []) {
            const sale = normalizeUser(Array.isArray(row.sale) ? row.sale[0] : row.sale);
            if (sale) map.set(sale.id, sale);
        }
    }
    return Array.from(map.values());
}

export function collectAssignedTechniciansFromServices(services: any[]): StaffUser[] {
    const map = new Map<string, StaffUser>();
    for (const service of services || []) {
        const primary = normalizeUser(
            Array.isArray(service.technician) ? service.technician[0] : service.technician,
        );
        if (primary) map.set(primary.id, primary);
        for (const row of service.technicians || []) {
            const tech = normalizeUser(Array.isArray(row.technician) ? row.technician[0] : row.technician);
            if (tech) map.set(tech.id, tech);
        }
    }
    return Array.from(map.values());
}

import { fireWebhook } from './webhookNotifier.js';

export async function fetchProductServicesStaff(supabase: any, productId: string) {
    const { data } = await supabase
        .from('order_products')
        .select(`
            id, product_code, name, order_id,
            services:order_product_services(
                id, item_name,
                technician:users!order_product_services_technician_id_fkey(id, name, telegram_chat_id),
                technicians:order_product_service_technicians(
                    technician:users!order_product_service_technicians_technician_id_fkey(id, name, telegram_chat_id)
                ),
                sales:order_product_service_sales(
                    sale:users!order_product_service_sales_sale_id_fkey(id, name, telegram_chat_id)
                )
            )
        `)
        .eq('id', productId)
        .maybeSingle();

    const services = data?.services || [];
    return {
        product: data,
        sales: collectAssignedSalesFromServices(services),
        technicians: collectAssignedTechniciansFromServices(services),
    };
}

export async function firePickupInfoWebhook(
    supabase: any,
    productId: string,
    stepData: Record<string, unknown>,
) {
    const staff = await fetchProductServicesStaff(supabase, productId);
    const product = staff.product;
    if (!product?.order_id) return;

    const { data: orderInfo } = await supabase
        .from('orders')
        .select('order_code, customer:customers(name)')
        .eq('id', product.order_id)
        .maybeSingle();

    const customerName = (orderInfo?.customer as { name?: string } | null)?.name || 'N/A';

    fireWebhook('pickup_info.saved', {
        order_code: orderInfo?.order_code,
        product_code: product.product_code,
        product_name: product.name,
        customer_name: customerName,
        step_data: stepData,
        sales_users: staff.sales,
        sales_names: staff.sales.map((s) => s.name).join(', ') || null,
        technicians: staff.technicians,
        technician_names: staff.technicians.map((t) => t.name).join(', ') || null,
    });
}
