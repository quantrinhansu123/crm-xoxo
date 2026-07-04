import { useState, useCallback } from 'react';
import { ordersApi } from '@/lib/api';

export interface SalesStepData extends Record<string, unknown> {
    pickup_appointment_at?: string;
    step1_receiver_name?: string;
    step1_shipping_fee?: number;
    step1_payment_method?: string;
    step1_evidence_photos?: string[];
    step1_accessories_checked?: boolean;
    step1_notes?: string;
    after2_accessories_returned_checked?: boolean;
    step2_tags_photos?: string[];
    step2_form_photos?: string[];
    step3_technician_name?: string;
    step3_work_details?: string;
    step3_work_location?: string;
    step3_notes?: string;
}

type ApiError = {
    response?: {
        data?: {
            message?: string;
        };
    };
};

const getErrorMessage = (err: unknown, fallback: string) => {
    const apiError = err as ApiError;
    return apiError.response?.data?.message || fallback;
};

export interface OrderSurcharge {
    type: string;
    label: string;
    value: number;
    isPercent?: boolean;
    is_percent?: boolean;
    amount?: number;
}

export interface OrderCustomerItem extends Record<string, unknown> {
    id: string;
    name?: string;
    item_name?: string;
    type?: string;
    item_type?: string;
    quantity?: number;
    unit_price?: number;
    total_price?: number;
    image?: string;
    images?: string[];
    services?: OrderItem[];
    surcharges?: OrderSurcharge[];
}

export interface CreateOrderCustomerItem extends Record<string, unknown> {
    name: string;
    services?: Array<Record<string, unknown>>;
    surcharges?: OrderSurcharge[];
}

export interface CreateOrderSaleItem extends Record<string, unknown> {
    item_id?: string;
    product_id?: string;
    service_id?: string;
    name?: string;
    quantity?: number;
    unit_price?: number;
    surcharges?: OrderSurcharge[];
}

export interface OrderItemStep {
    id: string;
    started_at?: string;
    estimated_duration?: number;
    status: string;
    step_order: number;
}

export interface OrderItem {
    id: string;
    order_id: string;
    product_id?: string;
    service_id?: string;
    item_type: string;
    item_name: string;
    image?: string;
    item_code?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    status?: string;
    technician_id?: string;
    technician?: { id: string; name: string; avatar?: string };
    /** Multiple technicians from order_product_service_technicians */
    technicians?: Array<{ technician_id?: string; commission?: number; technician?: { id: string; name: string; avatar?: string } }>;
    started_at?: string;
    completed_at?: string;
    /** Flag: Customer Item (Sản phẩm khách gửi) from order_products table */
    is_customer_item?: boolean;
    // Nested objects from API join
    product?: { id: string; name?: string; image?: string; code?: string; price?: number };
    service?: { id: string; name?: string; image?: string; code?: string; price?: number };
    accessory?: { id: string; order_item_id: string; status: string; notes?: string; updated_at: string } | null;
    partner?: { id: string; order_item_id: string; status: string; notes?: string; updated_at: string } | null;
    after_sale_stage?: string | null;
    completion_photos?: string[];
    packaging_photos?: string[];
    due_at?: string;
    /** Workflow steps for room deadline calculation */
    order_item_steps?: OrderItemStep[];
    surcharges?: OrderSurcharge[];
    surcharge_amount?: number;
    sales_step_data?: SalesStepData;
    care_warranty_flow?: string | null;
    care_warranty_stage?: string | null;
    warranty_code?: string | null;
    delivery_payment_method?: string | null;
    /** New phase ownership field — which pipeline tab this item belongs to */
    current_phase?: string | null;
    /** Stage within current_phase (e.g. step1, waiting, after1, war1, care6) */
    phase_stage?: string | null;
}

export interface Order {
    id: string;
    order_code: string;
    customer_id: string;
    customer?: { id: string; name: string; phone: string; email?: string };
    sales_id: string;
    sales_user?: { id: string; name: string };
    subtotal: number;
    discount: number;
    discount_type?: 'amount' | 'percent';
    discount_value?: number;
    surcharges?: Array<{
        type: string;
        label: string;
        value: number;
        is_percent: boolean;
        amount: number;
    }>;
    surcharges_amount?: number;
    total_amount: number;
    paid_amount?: number;
    remaining_debt?: number;
    payment_status?: 'unpaid' | 'partial' | 'paid';
    status: string;
    confirmed_at?: string;

    after_sale_stage?: string | null;
    completion_photos?: string[];
    debt_checked?: boolean;
    debt_checked_at?: string | null;
    debt_checked_notes?: string | null;
    debt_checked_by_name?: string | null;
    debt_payment_photos?: string[];
    aftersale_receiver_name?: string | null;
    packaging_photos?: string[];
    delivery_carrier?: string | null;
    delivery_type?: 'ship' | 'pickup' | null;
    delivery_code?: string | null;
    delivery_fee?: number | null;
    aftersale_return_user_name?: string | null;
    delivery_address?: string | null;
    delivery_self_pickup?: boolean;
    delivery_notes?: string | null;
    delivery_creator_name?: string | null;
    delivery_shipper_phone?: string | null;
    delivery_staff_name?: string | null;
    delivery_received_at?: string | null;
    hd_sent?: boolean;
    hd_sent_at?: string | null;
    hd_sent_photos?: string[];
    feedback_requested?: boolean;
    feedback_requested_at?: string | null;
    feedback_requested_photos?: string[];
    care_warranty_flow?: string | null;
    care_warranty_stage?: string | null;
    warranty_code?: string | null;
    delivery_payment_method?: string | null;
    notes?: string;
    customer_items?: OrderCustomerItem[];
    sale_items?: OrderItem[];
    items?: OrderItem[];
    sales_step_data?: SalesStepData;
    completed_at?: string;
    created_at: string;
    updated_at?: string;
    extension_request?: OrderExtensionRequest | null;
}

export interface OrderExtensionRequest {
    id: string;
    order_id: string;
    requested_by: string;
    reason: string;
    status: string;
    customer_result?: string;
    new_due_at?: string;
    approved_by?: string;
    approved_at?: string;
    valid_reason?: boolean;
    kpi_late_recorded?: boolean;
    created_at: string;
    updated_at: string;
}

export function useOrders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
    });

    const fetchOrders = useCallback(async (params?: {
        status?: string;
        customer_id?: string;
        search?: string;
        page?: number;
        limit?: number;
    }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await ordersApi.getAll(params);
            const data = response.data.data;
            setOrders(data.orders || []);
            if (data.pagination) {
                setPagination({
                    ...data.pagination,
                    totalPages: data.pagination.totalPages || 0,
                });
            }
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Lỗi khi tải danh sách đơn hàng'));
        } finally {
            setLoading(false);
        }
    }, []);

    const getOrder = useCallback(async (id: string): Promise<Order> => {
        setLoading(true);
        try {
            const response = await ordersApi.getById(id);
            return response.data.data!.order;
        } catch (err: unknown) {
            const message = getErrorMessage(err, 'Lỗi khi tải thông tin đơn hàng');
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const createOrder = useCallback(async (data: {
        customer_id: string;
        customer_items?: CreateOrderCustomerItem[];
        sale_items?: CreateOrderSaleItem[];
        notes?: string;
        discount?: number;
        discount_type?: 'amount' | 'percent';
        discount_value?: number;
        surcharges?: OrderSurcharge[];
        paid_amount?: number;
        status?: string;
    }): Promise<Order> => {
        setLoading(true);
        try {
            const response = await ordersApi.create(data);
            const newOrder = response.data.data!.order;
            setOrders(prev => [newOrder, ...prev]);
            return newOrder;
        } catch (err: unknown) {
            const message = getErrorMessage(err, 'Lỗi khi tạo đơn hàng');
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateOrderStatus = useCallback(async (id: string, status: string): Promise<Order> => {
        setLoading(true);
        try {
            const response = await ordersApi.updateStatus(id, status);
            const updated = response.data.data!.order;
            setOrders(prev => prev.map(o => o.id === id ? { ...o, status: updated.status } : o));
            return updated;
        } catch (err: unknown) {
            const message = getErrorMessage(err, 'Lỗi khi cập nhật trạng thái');
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateOrder = useCallback(async (id: string, data: {
        items: Array<{ type: string; item_id: string; name: string; quantity: number; unit_price: number }>;
        notes?: string;
        discount?: number;
    }): Promise<Order> => {
        setLoading(true);
        try {
            const response = await ordersApi.update(id, data);
            const updated = response.data.data!.order;
            setOrders(prev => prev.map(o => o.id === id ? updated : o));
            return updated;
        } catch (err: unknown) {
            const message = getErrorMessage(err, 'Lỗi khi cập nhật đơn hàng');
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteOrder = useCallback(async (id: string): Promise<void> => {
        setLoading(true);
        try {
            await ordersApi.delete(id);
            setOrders(prev => prev.filter(o => o.id !== id));
        } catch (err: unknown) {
            const message = getErrorMessage(err, 'Lỗi khi xóa đơn hàng');
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        orders,
        loading,
        error,
        pagination,
        fetchOrders,
        getOrder,
        createOrder,
        updateOrder,
        updateOrderStatus,
        deleteOrder,
    };
}
