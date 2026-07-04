import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';

type DeleteOrderCascadeOptions = {
    allowStatuses?: string[];
};

async function deleteByFilter(
    table: string,
    applyFilter: (query: any) => any,
    errorMessage: string,
    options: { optional?: boolean } = {},
) {
    const { error } = await applyFilter(supabaseAdmin.from(table).delete());

    if (!error) return;

    const message = String(error.message || '');
    const isMissingResource =
        message.includes('does not exist')
        || message.includes('Could not find')
        || message.includes('schema cache');

    if (options.optional || isMissingResource) {
        console.warn(`[OrderDeleteCascade] Skip ${table}:`, message);
        return;
    }

    console.error(`[OrderDeleteCascade] ${table} delete error:`, error);
    throw new ApiError(errorMessage, 500);
}

export async function deleteOrderCascade(orderId: string, options: DeleteOrderCascadeOptions = {}) {
    const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('id, order_code, status')
        .eq('id', orderId)
        .single();

    if (orderError || !order) {
        throw new ApiError('Không tìm thấy đơn hàng', 404);
    }

    if (options.allowStatuses?.length && !options.allowStatuses.includes(order.status)) {
        throw new ApiError(`Không thể xóa đơn hàng ở trạng thái ${order.status}`, 400);
    }

    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
        .from('order_items')
        .select('id, product_id, quantity, item_type, item_code')
        .eq('order_id', orderId);

    if (orderItemsError) {
        throw new ApiError('Không thể lấy danh sách hạng mục đơn hàng', 500);
    }

    // Xóa dữ liệu tham chiếu trực tiếp tới order (tránh FK chặn xóa orders)
    await Promise.all([
        deleteByFilter(
            'upsell_tickets',
            query => query.eq('order_id', orderId),
            'Không thể xóa ticket upsell liên quan đơn hàng',
            { optional: true },
        ),
        deleteByFilter(
            'order_care_warranty_log',
            query => query.eq('order_id', orderId),
            'Không thể xóa log bảo hành/chăm sóc của đơn hàng',
            { optional: true },
        ),
    ]);

    const { data: orderProducts, error: orderProductsError } = await supabaseAdmin
        .from('order_products')
        .select('id, product_code')
        .eq('order_id', orderId);

    if (orderProductsError) {
        throw new ApiError('Không thể lấy danh sách sản phẩm đơn hàng', 500);
    }

    const orderItemIds = (orderItems || []).map(item => item.id);
    const orderProductIds = (orderProducts || []).map(product => product.id);
    const itemCodes = [
        ...(orderItems || []).map(item => item.item_code).filter(Boolean),
        ...(orderProducts || []).map(product => product.product_code).filter(Boolean),
    ];

    const { data: orderServices, error: orderServicesError } = orderProductIds.length > 0
        ? await supabaseAdmin
            .from('order_product_services')
            .select('id')
            .in('order_product_id', orderProductIds)
        : { data: [], error: null };

    if (orderServicesError) {
        throw new ApiError('Không thể lấy danh sách dịch vụ đơn hàng', 500);
    }

    const orderServiceIds = (orderServices || []).map(service => service.id);

    const stepResults: { data: { id: string }[] | null }[] = [];
    if (orderItemIds.length > 0) {
        const { data } = await supabaseAdmin.from('order_item_steps').select('id').in('order_item_id', orderItemIds);
        stepResults.push({ data });
    }
    if (orderServiceIds.length > 0) {
        const { data } = await supabaseAdmin.from('order_item_steps').select('id').in('order_product_service_id', orderServiceIds);
        stepResults.push({ data });
    }

    const orderStepIds = stepResults.flatMap(result => (result.data || []).map((step: { id: string }) => step.id));

    const { data: invoices, error: invoicesError } = await supabaseAdmin
        .from('invoices')
        .select('id')
        .eq('order_id', orderId);

    if (invoicesError) {
        throw new ApiError('Không thể lấy danh sách hóa đơn của đơn hàng', 500);
    }

    const invoiceIds = (invoices || []).map(invoice => invoice.id);

    for (const item of orderItems || []) {
        if (!item.product_id || item.item_type !== 'product') continue;

        try {
            const { data: product } = await supabaseAdmin
                .from('products')
                .select('stock')
                .eq('id', item.product_id)
                .single();

            if (product) {
                const restoredStock = (product.stock || 0) + (Number(item.quantity) || 0);
                await supabaseAdmin
                    .from('products')
                    .update({ stock: restoredStock })
                    .eq('id', item.product_id);
            }
        } catch (error) {
            console.error('[OrderDeleteCascade] Error restoring stock:', error);
        }
    }

    if (orderStepIds.length > 0) {
        const { error } = await supabaseAdmin
            .from('order_workflow_step_log')
            .delete()
            .in('order_item_step_id', orderStepIds);
        if (error) throw new ApiError('Không thể xóa log quy trình của đơn hàng', 500);
    }

    if (orderItemIds.length > 0) {
        await Promise.all([
            deleteByFilter(
                'order_item_accessories',
                query => query.in('order_item_id', orderItemIds),
                'Không thể xóa phụ kiện của hạng mục đơn hàng',
                { optional: true },
            ),
            deleteByFilter(
                'order_item_partner',
                query => query.in('order_item_id', orderItemIds),
                'Không thể xóa dữ liệu đối tác của hạng mục đơn hàng',
                { optional: true },
            ),
            deleteByFilter(
                'order_item_technicians',
                query => query.in('order_item_id', orderItemIds),
                'Không thể xóa phân công kỹ thuật của hạng mục đơn hàng',
                { optional: true },
            ),
            deleteByFilter(
                'order_item_sales',
                query => query.in('order_item_id', orderItemIds),
                'Không thể xóa phân công sale của hạng mục đơn hàng',
                { optional: true },
            ),
        ]);
    }

    if (orderServiceIds.length > 0) {
        await Promise.all([
            deleteByFilter(
                'order_item_accessories',
                query => query.in('order_product_service_id', orderServiceIds),
                'Không thể xóa phụ kiện của dịch vụ đơn hàng',
                { optional: true },
            ),
            deleteByFilter(
                'order_item_partner',
                query => query.in('order_product_service_id', orderServiceIds),
                'Không thể xóa dữ liệu đối tác của dịch vụ đơn hàng',
                { optional: true },
            ),
            deleteByFilter(
                'order_product_service_technicians',
                query => query.in('order_product_service_id', orderServiceIds),
                'Không thể xóa phân công kỹ thuật của dịch vụ đơn hàng',
                { optional: true },
            ),
            deleteByFilter(
                'order_product_service_sales',
                query => query.in('order_product_service_id', orderServiceIds),
                'Không thể xóa phân công sale của dịch vụ đơn hàng',
                { optional: true },
            ),
        ]);
    }

    if (orderProductIds.length > 0) {
        await Promise.all([
            deleteByFilter(
                'order_item_accessories',
                query => query.in('order_product_id', orderProductIds),
                'Không thể xóa yêu cầu mua phụ kiện theo sản phẩm đơn hàng',
                { optional: true },
            ),
            deleteByFilter(
                'order_item_partner',
                query => query.in('order_product_id', orderProductIds),
                'Không thể xóa yêu cầu gửi đối tác theo sản phẩm đơn hàng',
                { optional: true },
            ),
        ]);
    }

    if (orderStepIds.length > 0) {
        const { error } = await supabaseAdmin
            .from('order_item_steps')
            .delete()
            .in('id', orderStepIds);
        if (error) throw new ApiError('Không thể xóa các bước quy trình của đơn hàng', 500);
    }

    await deleteByFilter(
        'technician_tasks',
        query => query.eq('order_id', orderId),
        'Không thể xóa công việc kỹ thuật liên quan đơn hàng',
        { optional: true },
    );

    if (orderItemIds.length > 0) {
        await deleteByFilter(
            'technician_tasks',
            query => query.in('order_item_id', orderItemIds),
            'Không thể xóa công việc kỹ thuật liên quan hạng mục đơn hàng',
            { optional: true },
        );
    }

    if (itemCodes.length > 0) {
        await deleteByFilter(
            'technician_tasks',
            query => query.in('item_code', itemCodes),
            'Không thể xóa công việc kỹ thuật theo mã hàng',
            { optional: true },
        );
    }

    await Promise.all([
        deleteByFilter(
            'order_extension_requests',
            query => query.eq('order_id', orderId),
            'Không thể xóa yêu cầu gia hạn của đơn hàng',
            { optional: true },
        ),
        deleteByFilter(
            'order_item_status_log',
            query => query.eq('order_id', orderId),
            'Không thể xóa lịch sử trạng thái của đơn hàng',
            { optional: true },
        ),
        deleteByFilter(
            'order_after_sale_stage_log',
            query => query.eq('order_id', orderId),
            'Không thể xóa lịch sử after-sale của đơn hàng',
            { optional: true },
        ),
        deleteByFilter(
            'commissions',
            query => query.eq('order_id', orderId),
            'Không thể xóa hoa hồng liên quan đơn hàng',
            { optional: true },
        ),
        deleteByFilter(
            'transactions',
            query => query.eq('order_id', orderId),
            'Không thể xóa chứng từ thanh toán liên quan đơn hàng',
            { optional: true },
        ),
        deleteByFilter(
            'payment_records',
            query => query.eq('order_id', orderId),
            'Không thể xóa phiếu thu liên quan đơn hàng',
            { optional: true },
        ),
    ]);

    if (order.order_code) {
        await Promise.all([
            deleteByFilter(
                'transactions',
                query => query.eq('order_code', order.order_code),
                'Không thể xóa chứng từ thanh toán theo mã đơn hàng',
                { optional: true },
            ),
            deleteByFilter(
                'transactions',
                query => query.ilike('notes', `%${order.order_code}%`),
                'Không thể xóa chứng từ thanh toán ghi chú theo mã đơn hàng',
                { optional: true },
            ),
        ]);
    }

    if (invoiceIds.length > 0) {
        await deleteByFilter(
            'commissions',
            query => query.in('invoice_id', invoiceIds),
            'Không thể xóa hoa hồng liên quan hóa đơn',
            { optional: true },
        );

        const { error: financeDeleteError } = await supabaseAdmin
            .from('finance_transactions')
            .delete()
            .in('invoice_id', invoiceIds);

        if (financeDeleteError) {
            const now = new Date().toISOString();
            await supabaseAdmin
                .from('finance_transactions')
                .update({ status: 'cancelled', updated_at: now })
                .in('invoice_id', invoiceIds);

            const { error: financeRetryError } = await supabaseAdmin
                .from('finance_transactions')
                .delete()
                .in('invoice_id', invoiceIds);

            if (financeRetryError) {
                console.error('[OrderDeleteCascade] finance_transactions delete error:', financeRetryError);
                throw new ApiError('Không thể xóa giao dịch tài chính liên quan hóa đơn', 500);
            }
        }

        const { error } = await supabaseAdmin.from('invoices').delete().eq('order_id', orderId);
        if (error) {
            console.error('[OrderDeleteCascade] invoices delete error:', error);
            throw new ApiError('Không thể xóa hóa đơn liên quan đơn hàng', 500);
        }
    }

    if (orderServiceIds.length > 0) {
        const { error } = await supabaseAdmin
            .from('order_product_services')
            .delete()
            .in('id', orderServiceIds);
        if (error) throw new ApiError('Không thể xóa dịch vụ của đơn hàng', 500);
    }

    if (orderProductIds.length > 0) {
        const { error } = await supabaseAdmin.from('order_products').delete().eq('order_id', orderId);
        if (error) throw new ApiError('Không thể xóa sản phẩm của đơn hàng', 500);
    }

    if (orderItemIds.length > 0) {
        const { error } = await supabaseAdmin.from('order_items').delete().eq('order_id', orderId);
        if (error) throw new ApiError('Không thể xóa hạng mục của đơn hàng', 500);
    }

    const { error: deleteOrderError } = await supabaseAdmin.from('orders').delete().eq('id', orderId);
    if (deleteOrderError) {
        console.error('[OrderDeleteCascade] orders delete error:', deleteOrderError);
        throw new ApiError(
            `Không thể xóa đơn hàng: ${deleteOrderError.message || 'còn dữ liệu liên quan'}`,
            500,
        );
    }

    return order;
}
