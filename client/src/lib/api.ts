import axios from 'axios';
import type { AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005/api';

// Create axios instance
export const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - handle errors
api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('token');
            localStorage.removeItem('user');

            // Only redirect if not already on login page
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// API Response types
export interface ApiResponse<T> {
    status: 'success' | 'fail' | 'error';
    data?: T;
    message?: string;
}

export interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    totalPages?: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
    data: T & { pagination: PaginationInfo };
}

// Auth API
export const authApi = {
    login: (email: string, password: string) =>
        api.post<ApiResponse<{ user: any; token: string }>>('/auth/login', { email, password }),

    register: (data: { email: string; password: string; name: string; role: string; phone?: string; department?: string }) =>
        api.post<ApiResponse<{ user: any }>>('/auth/register', data),

    getMe: () =>
        api.get<ApiResponse<{ user: any }>>('/auth/me'),

    changePassword: (currentPassword: string, newPassword: string) =>
        api.post<ApiResponse<null>>('/auth/change-password', { currentPassword, newPassword }),

    logout: () =>
        api.post<ApiResponse<null>>('/auth/logout'),
};

// Leads API
export const leadsApi = {
    getAll: (params?: { status?: string; source?: string; search?: string; page?: number; limit?: number }) =>
        api.get<PaginatedResponse<{ leads: any[] }>>('/leads', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ lead: any }>>(`/leads/${id}`),

    create: (data: any) =>
        api.post<ApiResponse<{ lead: any }>>('/leads', data),

    update: (id: string, data: any) =>
        api.put<ApiResponse<{ lead: any }>>(`/leads/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/leads/${id}`),

    convert: (id: string) =>
        api.post<ApiResponse<{ customer: any }>>(`/leads/${id}/convert`),

    // Activities/History
    getActivities: (id: string, limit?: number) =>
        api.get<ApiResponse<{ activities: any[] }>>(`/leads/${id}/activities`, { params: { limit } }),

    addActivity: (id: string, data: { activity_type: string; content?: string; old_status?: string; new_status?: string; metadata?: any }) =>
        api.post<ApiResponse<{ activity: any }>>(`/leads/${id}/activities`, data),
};

// Customers API
export const customersApi = {
    getAll: (params?: { type?: string; status?: string; search?: string; page?: number; limit?: number }) =>
        api.get<PaginatedResponse<{ customers: any[] }>>('/customers', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ customer: any }>>(`/customers/${id}`),

    create: (data: any) =>
        api.post<ApiResponse<{ customer: any }>>('/customers', data),

    update: (id: string, data: any) =>
        api.put<ApiResponse<{ customer: any }>>(`/customers/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/customers/${id}`),

    getDebt: (id: string) =>
        api.get<ApiResponse<{
            customer: { id: string; name: string; phone?: string };
            summary: {
                total_debt: number;
                total_paid: number;
                total_order_value: number;
                total_deposit: number;
                open_orders_count: number;
            };
            orders: Array<{
                id: string;
                order_code: string;
                created_at: string;
                total_amount: number;
                paid_amount: number;
                deposit_amount: number;
                remaining_debt: number;
                payment_status?: string;
                products?: Array<{
                    id: string;
                    product_code: string;
                    name: string;
                    image_url: string | null;
                    total_amount: number;
                    deposit_amount: number;
                    paid_amount?: number;
                    remaining_debt?: number;
                }>;
            }>;
            ledger: Array<{
                id: string;
                at: string;
                code: string;
                kind: 'sale' | 'payment';
                label: string;
                amount: number;
                balance: number;
            }>;
        }>>(`/customers/${id}/debt`),

    collectPayment: (
        id: string,
        data: {
            amount: number;
            payment_method?: string;
            notes?: string;
            content?: string;
            allocations: Array<{
                order_id: string;
                amount: number;
                order_product_id?: string;
                payment_kind?: 'deposit' | 'payment';
            }>;
        }
    ) => api.post<ApiResponse<{ payments: unknown[] }>>(`/customers/${id}/collect-payment`, data),
};

// Orders API
export const ordersApi = {
    getAll: (params?: { status?: string; customer_id?: string; search?: string; page?: number; limit?: number }) =>
        api.get<PaginatedResponse<{ orders: any[] }>>('/orders', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ order: any }>>(`/orders/${id}`),

    create: (data: {
        customer_id: string;
        customer_items?: any[];
        sale_items?: any[];
        notes?: string;
        discount?: number;
        discount_type?: 'amount' | 'percent';
        discount_value?: number;
        surcharges?: any[];
        paid_amount?: number;
        status?: string;
    }) => api.post<ApiResponse<{ order: any }>>('/orders', data),



    update: (id: string, data: any) =>
        api.put<ApiResponse<{ order: any }>>(`/orders/${id}`, data),

    updateFull: (id: string, data: any) =>
        api.put<ApiResponse<{ order: any }>>(`/orders/${id}/full`, data),

    patch: (id: string, data: {

        after_sale_stage?: string | null;
        completion_photos?: string[];
        debt_checked?: boolean;
        debt_checked_notes?: string | null;
        packaging_photos?: string[];
        delivery_carrier?: string | null;
        delivery_address?: string | null;
        delivery_self_pickup?: boolean;
        delivery_notes?: string | null;
        hd_sent?: boolean;
        hd_sent_photos?: string[];
        feedback_requested?: boolean;
        feedback_requested_photos?: string[];
        care_warranty_flow?: string | null;
        care_warranty_stage?: string | null;
        delivery_creator_name?: string | null;
        delivery_shipper_phone?: string | null;
        delivery_staff_name?: string | null;
        delivery_received_at?: string | null;
    }) => api.patch<ApiResponse<{ order: any }>>(`/orders/${id}`, data),

    updateAfterSaleStage: (orderId: string, stage: string | null) =>
        api.patch<ApiResponse<{ order: any }>>(`/orders/${orderId}`, { after_sale_stage: stage }),

    updateStatus: (id: string, status: string) =>
        api.patch<ApiResponse<{ order: any }>>(`/orders/${id}/status`, { status }),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/orders/${id}`),



    getKanbanLogs: (orderId: string, tab: 'sales' | 'workflow' | 'aftersale' | 'care') =>
        api.get<ApiResponse<{ logs: any[] }>>(`/orders/${orderId}/kanban-logs`, { params: { tab } }),

    // Payment records
    getPayments: (orderId: string) =>
        api.get<ApiResponse<{ payments: any[] }>>(`/orders/${orderId}/payments`),

    createPayment: (orderId: string, data: {
        content: string;
        amount: number;
        payment_method?: 'cash' | 'transfer' | 'zalopay';
        image_url?: string;
        notes?: string;
        order_product_id?: string;
    }) => api.post<ApiResponse<{ payment: any; order: any }>>(`/orders/${orderId}/payments`, data),

    upsell: (id: string, data: { customer_items?: any[]; sale_items?: any[] }) =>
        api.post<ApiResponse<any>>(`/orders/${id}/upsell`, data),

    createUpsellTicket: (id: string, data: { customer_items?: any[]; sale_items?: any[]; notes?: string; request_type?: string; update_payload?: any }) =>
        api.post<ApiResponse<any>>(`/orders/${id}/upsell-ticket`, data),

    createOrderEditTicket: (id: string, data: { update_payload: any; notes?: string }) =>
        api.post<ApiResponse<any>>(`/orders/${id}/upsell-ticket`, {
            request_type: 'order_edit',
            update_payload: data.update_payload,
            notes: data.notes
        }),
};

// Order Products API (Customer's products: shoes, bags, etc.)
export const orderProductsApi = {
    // Get product by QR code
    getByCode: (code: string) =>
        api.get<ApiResponse<any>>(`/order-products/code/${code}`),

    // Get product by ID
    getById: (id: string) =>
        api.get<ApiResponse<any>>(`/order-products/${id}`),

    update: (id: string, data: { images?: string[] }) =>
        api.patch<ApiResponse<any>>(`/order-products/${id}`, data),

    // Update product status
    updateStatus: (id: string, status: string, reason?: string, warranty_code?: string) =>
        api.patch<ApiResponse<any>>(`/order-products/${id}/status`, { status, ...(reason !== undefined && { reason }), ...(warranty_code !== undefined && { warranty_code }) }),

    // Assign technician to a service
    assignService: (serviceId: string, technician_id: string) =>
        api.patch<ApiResponse<any>>(`/order-products/services/${serviceId}/assign`, { technician_id }),

    // Start a service
    startService: (serviceId: string) =>
        api.patch<ApiResponse<any>>(`/order-products/services/${serviceId}/start`),

    // Complete a service
    completeService: (serviceId: string, notes?: string) =>
        api.patch<ApiResponse<{ allServicesCompleted: boolean }>>(`/order-products/services/${serviceId}/complete`, { notes }),

    // Get status summary with unified timeline
    getStatusSummary: (id: string) =>
        api.get<ApiResponse<{
            product_id: string;
            product_name: string;
            product_code: string;
            completion_percentage: number;
            overall_status: string;
            total_steps: number;
            completed_steps: number;
            earliest_started_at?: string;
            latest_completed_at?: string;
            total_duration_minutes?: number;
            estimated_duration_minutes?: number;
            services: Array<{
                id: string;
                name: string;
                status: string;
                completion_percentage: number;
                started_at?: string;
                completed_at?: string;
                steps: any[];
            }>;
            timeline: Array<{
                step_id: string;
                step_order: number;
                step_name: string;
                service_id: string;
                service_name: string;
                department_id?: string;
                department_name?: string;
                technician_id?: string;
                technician_name?: string;
                status: string;
                estimated_duration?: number;
                started_at?: string;
                completed_at?: string;
                notes?: string;
            }>;
        }>>(`/order-products/${id}/status-summary`),

    // Recalculate product status manually
    recalculateStatus: (id: string) =>
        api.post<ApiResponse<any>>(`/order-products/${id}/recalculate-status`),

    // Update after-sale data independently (photos, stage, etc)
    updateAfterSaleData: (id: string, data: {
        stage?: string | null;
        completion_photos?: string[];
        packaging_photos?: string[];
        delivery_code?: string | null;
        delivery_carrier?: string | null;
        delivery_type?: string | null;
        due_at?: string | null;
        care_warranty_flow?: string | null;
        care_warranty_stage?: string | null;
    }) => api.patch<ApiResponse<any>>(`/order-products/${id}/after-sale-data`, data),

    resetServices: (id: string) =>
        api.patch<ApiResponse<any>>(`/order-products/${id}/reset-services`, {}),
};

// Order Items API
export const orderItemsApi = {
    getById: (id: string) =>
        api.get<ApiResponse<any>>(`/order-items/${id}`),

    assignTechnician: (id: string, data: string | { technician_id: string; commission: number }[]) => {
        const payload = Array.isArray(data) ? { assignments: data } : { technician_id: data };
        return api.patch<ApiResponse<any>>(`/order-items/${id}/assign`, payload);
    },

    assignSale: (id: string, data: string | { sale_id: string; commission: number }[]) => {
        const payload = Array.isArray(data) ? { assignments: data } : { sale_id: data };
        return api.patch<ApiResponse<any>>(`/order-items/${id}/assign-sale`, payload);
    },

    start: (id: string) =>
        api.patch<ApiResponse<any>>(`/order-items/${id}/start`),

    complete: (id: string, notes?: string) =>
        api.patch<ApiResponse<{ allItemsCompleted: boolean }>>(`/order-items/${id}/complete`, { notes }),

    updateStatus: (id: string, status: string, reason?: string, warranty_code?: string, photos?: string[], notes?: string) =>
        api.patch<ApiResponse<any>>(`/order-items/${id}/status`, { status, reason, warranty_code, photos, notes }),

    // Order Item Steps (Workflow Steps)
    getSteps: (orderItemId: string) =>
        api.get<ApiResponse<any[]>>(`/order-items/${orderItemId}/steps`),

    assignStep: (stepId: string, technician_id: string) =>
        api.patch<ApiResponse<any>>(`/order-items/steps/${stepId}/assign`, { technician_id }),

    startStep: (stepId: string) =>
        api.patch<ApiResponse<any>>(`/order-items/steps/${stepId}/start`),

    completeStep: (stepId: string, notes?: string) =>
        api.patch<ApiResponse<{ allStepsCompleted: boolean }>>(`/order-items/steps/${stepId}/complete`, { notes }),

    skipStep: (stepId: string, notes?: string) =>
        api.patch<ApiResponse<any>>(`/order-items/steps/${stepId}/skip`, { notes }),

    updateAccessory: (orderItemId: string, data: { status: string; notes?: string; metadata?: Record<string, any> }) =>
        api.patch<ApiResponse<any>>(`/order-items/${orderItemId}/accessory`, data),

    updatePartner: (orderItemId: string, data: { status: string; notes?: string; metadata?: Record<string, any> }) =>
        api.patch<ApiResponse<any>>(`/order-items/${orderItemId}/partner`, data),

    updateSalesStepData: (orderItemId: string, data: Record<string, any>) =>
        api.patch<ApiResponse<any>>(`/order-items/${orderItemId}/sales-step-data`, { sales_step_data: data }),

    createExtensionRequest: (orderItemId: string, data: { reason: string; new_due_at?: string }) =>
        api.post<ApiResponse<any>>(`/order-items/${orderItemId}/extension-request`, data),

    // New Kanban Actions
    fail: (id: string, reason: string) =>
        api.patch<ApiResponse<any>>(`/order-items/${id}/fail`, { reason }),

    changeRoom: (id: string, data: { targetRoomId: string; reason: string; deadline_days: number; technician_id?: string | null; note?: string; photos?: string[] }) =>
        api.patch<ApiResponse<any>>(`/order-items/${id}/change-room`, data),

    // Update after-sale data independently (photos, stage, etc)
    updateAfterSaleData: (id: string, data: {
        stage?: string | null;
        completion_photos?: string[];
        packaging_photos?: string[];
        delivery_code?: string | null;
        delivery_carrier?: string | null;
        delivery_type?: string | null;
        due_at?: string | null;
        care_warranty_flow?: string | null;
        care_warranty_stage?: string | null;
    }) => api.patch<ApiResponse<any>>(`/order-items/${id}/after-sale-data`, data),
};

// Requests API (admin/manager - Mua phụ kiện, Gửi Đối Tác, Xin gia hạn)
export const requestsApi = {
    getAccessories: () =>
        api.get<ApiResponse<any[]>>('/requests/accessories'),
    getPartners: () =>
        api.get<ApiResponse<any[]>>('/requests/partners'),
    getExtensions: () =>
        api.get<ApiResponse<any[]>>('/requests/extensions'),
    createAccessory: (data: { order_item_id?: string; order_product_id?: string; order_product_service_id?: string; notes?: string; status?: string; metadata?: Record<string, any> }) =>
        api.post<ApiResponse<any>>('/order-items/accessories', data),
    updateAccessory: (id: string, data: { status?: string; notes?: string; metadata?: Record<string, any> }) =>
        api.patch<ApiResponse<any>>(`/requests/accessories/${id}`, data),
    updatePartner: (id: string, data: { status?: string; notes?: string; metadata?: Record<string, any> }) =>
        api.patch<ApiResponse<any>>(`/requests/partners/${id}`, data),
    updateExtension: (id: string, data: { status?: string; customer_result?: string; new_due_at?: string; valid_reason?: boolean; kpi_impact?: boolean }) =>
        api.patch<ApiResponse<any>>(`/requests/extensions/${id}`, data),
};

// Upsell Tickets API (admin/manager)
export const upsellTicketsApi = {
    getAll: () =>
        api.get<ApiResponse<any[]>>('/upsell-tickets'),
    approve: (id: string) =>
        api.post<ApiResponse<any>>(`/upsell-tickets/${id}/approve`),
    reject: (id: string) =>
        api.post<ApiResponse<any>>(`/upsell-tickets/${id}/reject`),
};

// Invoices API
export const invoicesApi = {
    getAll: (params?: {
        status?: string;
        customer_id?: string;
        from_date?: string;
        to_date?: string;
        page?: number;
        limit?: number;
    }) =>
        api.get<PaginatedResponse<{ invoices: any[] }>>('/invoices', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ invoice: any }>>(`/invoices/${id}?t=${Date.now()}`),

    create: (data: {
        order_id: string;
        payment_method?: string;
        amount?: number;
        notes?: string;
        order_item_ids?: string[];
        order_product_service_ids?: string[];
    }) => api.post<ApiResponse<{ invoice: any }>>('/invoices', data),


    updateStatus: (id: string, status: string, options?: { cancel_related_payments?: boolean }) =>
        api.patch<ApiResponse<{ invoice: any }>>(`/invoices/${id}/status`, {
            status,
            ...(status === 'cancelled'
                ? { cancel_related_payments: options?.cancel_related_payments !== false }
                : options?.cancel_related_payments !== undefined
                    ? { cancel_related_payments: options.cancel_related_payments }
                    : {}),
        }),

    delete: (id: string) => api.delete<ApiResponse<{ id: string; invoice_code: string }>>(`/invoices/${id}`),
};

// Products API
export const productsApi = {
    getAll: (params?: { category?: string; status?: string; search?: string }) =>
        api.get<ApiResponse<{ products: any[] }>>('/products', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ product: any }>>(`/products/${id}`),

    create: (data: any) =>
        api.post<ApiResponse<{ product: any }>>('/products', data),

    update: (id: string, data: any) =>
        api.put<ApiResponse<{ product: any }>>(`/products/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/products/${id}`),
};

// Services API
export const servicesApi = {
    getAll: (params?: { category?: string; status?: string; search?: string }) =>
        api.get<ApiResponse<{ services: any[] }>>('/services', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ service: any }>>(`/services/${id}`),

    create: (data: any) =>
        api.post<ApiResponse<{ service: any }>>('/services', data),

    update: (id: string, data: any) =>
        api.put<ApiResponse<{ service: any }>>(`/services/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/services/${id}`),
};

// Packages API
export const packagesApi = {
    getAll: (params?: { status?: string; search?: string }) =>
        api.get<ApiResponse<{ packages: any[] }>>('/packages', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ package: any }>>(`/packages/${id}`),

    create: (data: any) =>
        api.post<ApiResponse<{ package: any }>>('/packages', data),

    update: (id: string, data: any) =>
        api.put<ApiResponse<{ package: any }>>(`/packages/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/packages/${id}`),
};

// Vouchers API
export const vouchersApi = {
    getAll: (params?: { status?: string; search?: string }) =>
        api.get<ApiResponse<{ vouchers: any[] }>>('/vouchers', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ voucher: any }>>(`/vouchers/${id}`),

    create: (data: any) =>
        api.post<ApiResponse<{ voucher: any }>>('/vouchers', data),

    update: (id: string, data: any) =>
        api.put<ApiResponse<{ voucher: any }>>(`/vouchers/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/vouchers/${id}`),
};

// Finance API
export const financeApi = {
    getTransactions: (params?: { type?: string; status?: string; category?: string; from_date?: string; to_date?: string; page?: number; limit?: number }) =>
        api.get<PaginatedResponse<{ transactions: any[] }>>('/finance/transactions', { params }),

    createIncome: (data: any) =>
        api.post<ApiResponse<{ transaction: any }>>('/finance/income', data),

    createExpense: (data: any) =>
        api.post<ApiResponse<{ transaction: any }>>('/finance/expense', data),

    approveTransaction: (id: string) =>
        api.patch<ApiResponse<{ transaction: any }>>(`/finance/transactions/${id}/approve`),

    rejectTransaction: (id: string, reason: string) =>
        api.patch<ApiResponse<{ transaction: any }>>(`/finance/transactions/${id}/reject`, { reason }),

    getSummary: (params?: { from_date?: string; to_date?: string }) =>
        api.get<ApiResponse<{ totalIncome: number; totalExpense: number; profit: number; profitMargin: number }>>('/finance/summary', { params }),
};

// KPI API
export const kpiApi = {
    // Policies
    getPolicies: (params?: { role?: string; is_active?: string }) =>
        api.get<ApiResponse<{ policies: any[] }>>('/kpi/policies', { params }),

    getPolicy: (id: string) =>
        api.get<ApiResponse<{ policy: any }>>(`/kpi/policies/${id}`),

    createPolicy: (data: { code: string; name: string; role: string; description?: string; effective_from?: string; effective_to?: string }) =>
        api.post<ApiResponse<{ policy: any }>>('/kpi/policies', data),

    updatePolicy: (id: string, data: any) =>
        api.patch<ApiResponse<{ policy: any }>>(`/kpi/policies/${id}`, data),

    // Metrics
    addMetric: (policyId: string, data: any) =>
        api.post<ApiResponse<{ metric: any }>>(`/kpi/policies/${policyId}/metrics`, data),

    updateMetric: (id: string, data: any) =>
        api.patch<ApiResponse<{ metric: any }>>(`/kpi/metrics/${id}`, data),

    deleteMetric: (id: string) =>
        api.delete<ApiResponse<void>>(`/kpi/metrics/${id}`),

    // Rank configs
    getRankConfigs: (params?: { employee_id?: string; policy_id?: string }) =>
        api.get<ApiResponse<{ configs: any[]; employee_id?: string; policy_id?: string }>>('/kpi/rank-configs', { params }),

    createRankConfig: (data: any) =>
        api.post<ApiResponse<{ config: any }>>('/kpi/rank-configs', data),

    updateRankConfig: (id: string, data: any) =>
        api.put<ApiResponse<{ config: any }>>(`/kpi/rank-configs/${id}`, data),

    deleteRankConfig: (id: string) =>
        api.delete<ApiResponse<void>>(`/kpi/rank-configs/${id}`),

    upsertEmployeeRankConfigs: (employeeId: string, configs: any[]) =>
        api.post<ApiResponse<{ updated: number; errors: number; results: any[]; errors_detail: any[] }>>('/kpi/rank-configs/upsert-employee', { employee_id: employeeId, configs }),

    upsertPolicyRankConfigs: (policyId: string, configs: any[]) =>
        api.post<ApiResponse<{ updated: number; errors: number; results: any[]; errors_detail: any[] }>>('/kpi/rank-configs/upsert-policy', { policy_id: policyId, configs }),

    // Monthly KPI
    getMonthly: (params?: { month_key?: string; status?: string; employee_id?: string }) =>
        api.get<ApiResponse<{ records: any[]; month_key: string; summary: any; pagination: any }>>('/kpi/monthly', { params }),

    getMonthlyDetail: (id: string) =>
        api.get<ApiResponse<{ record: any }>>(`/kpi/monthly/${id}`),

    generateMonthly: (data: { month_key: string }) =>
        api.post<ApiResponse<{ generated: number; errors: number; results: any[]; errors_detail: any[] }>>('/kpi/monthly/generate', data),

    recalculateMonthly: (id: string) =>
        api.post<ApiResponse<{ record: any }>>(`/kpi/monthly/${id}/recalculate`),

    updateMonthly: (id: string, data: any) =>
        api.patch<ApiResponse<any>>(`/kpi/monthly/${id}`, data),

    lockMonthly: (id: string) =>
        api.post<ApiResponse<{ record: any }>>(`/kpi/monthly/${id}/lock`),

    batchLock: (data: { month_key: string }) =>
        api.post<ApiResponse<{ locked_count: number }>>('/kpi/monthly/batch-lock', data),

    pushToPayroll: (id: string) =>
        api.post<ApiResponse<any>>(`/kpi/monthly/${id}/push-to-payroll`),

    batchPush: (data: { month_key: string }) =>
        api.post<ApiResponse<any>>('/kpi/monthly/batch-push', data),

    // Violations
    getViolations: (params?: { month_key?: string; employee_id?: string; status?: string; violation_type?: string }) =>
        api.get<ApiResponse<{ violations: any[]; pagination: any }>>('/kpi/violations', { params }),

    createViolation: (data: any) =>
        api.post<ApiResponse<{ violation: any }>>('/kpi/violations', data),

    updateViolation: (id: string, data: any) =>
        api.patch<ApiResponse<{ violation: any }>>(`/kpi/violations/${id}`, data),

    approveViolation: (id: string) =>
        api.post<ApiResponse<{ violation: any }>>(`/kpi/violations/${id}/approve`),

    rejectViolation: (id: string) =>
        api.post<ApiResponse<{ violation: any }>>(`/kpi/violations/${id}/reject`),

    // Leaderboard
    getLeaderboard: (params?: { month_key?: string; role?: string; limit?: number }) =>
        api.get<ApiResponse<{ leaderboard: any[]; month_key: string }>>('/kpi/leaderboard', { params }),

    // Adjustments (for locked KPIs)
    getAdjustments: (monthlyId: string) =>
        api.get<ApiResponse<{ adjustments: any[] }>>(`/kpi/monthly/${monthlyId}/adjustments`),

    createAdjustment: (monthlyId: string, data: { field_name: string; old_value: any; new_value: any; reason: string; item_id?: string }) =>
        api.post<ApiResponse<{ adjustment: any }>>(`/kpi/monthly/${monthlyId}/adjustments`, data),

    // Employee KPI Policy Assignments
    getEmployeeAssignments: (params?: { role?: string; department?: string; status?: string }) =>
        api.get<ApiResponse<{ employees: any[]; policies: any[] }>>('/kpi/employee-assignments', { params }),

    batchAssignPolicies: (data: { assignments: Array<{ employee_id: string; policy_id: string | null }> }) =>
        api.post<ApiResponse<{ updated: number; errors: number; results: any[]; errors_detail: any[] }>>('/kpi/employee-assignments', data),

    removeAssignment: (id: string) =>
        api.delete<ApiResponse<void>>(`/kpi/employee-assignments/${id}`),
};

// Salary API
export const salaryApi = {
    getAll: (params?: { month?: number; year?: number; status?: string }) =>
        api.get<ApiResponse<{ salaries: any[]; summary: any }>>('/salary', { params }),

    getByUser: (userId: string, year?: number) =>
        api.get<ApiResponse<{ salaries: any[] }>>(`/salary/user/${userId}`, { params: { year } }),

    getCommissionDetails: (userId: string, month: number, year: number) =>
        api.get<ApiResponse<{ commissions: any[] }>>(`/salary/user/${userId}/commissions`, { params: { month, year } }),

    getBonusDetails: (userId: string, month: number, year: number) =>
        api.get<ApiResponse<{ bonuses: any[] }>>(`/salary/user/${userId}/bonuses`, { params: { month, year } }),

    calculate: (data: { user_id: string; month: number; year: number }) =>
        api.post<ApiResponse<{ salary: any }>>('/salary/calculate', data),

    updateBase: (id: string, data: { base_salary: number; standard_work_days: number; actual_work_days: number; applied_salary: number }) =>
        api.patch<ApiResponse<{ salary: any }>>(`/salary/${id}/update-base`, data),

    updateBonus: (id: string, data: { bonus_details: any }) =>
        api.patch<ApiResponse<{ salary: any }>>(`/salary/${id}/update-bonus`, data),

    updateDeduction: (id: string, data: { deduction_details: any }) =>
        api.patch<ApiResponse<{ salary: any }>>(`/salary/${id}/update-deduction`, data),

    approve: (id: string) =>
        api.patch<ApiResponse<{ salary: any }>>(`/salary/${id}/approve`),

    pay: (id: string, data?: { payment_method?: string, payment_date?: string, amount?: number, notes?: string }) =>
        api.patch<ApiResponse<{ salary: any }>>(`/salary/${id}/pay`, data),
};

// Salary Configs API
export const salaryConfigsApi = {
    getAll: () =>
        api.get<ApiResponse<{ configs: any[] }>>('/salary-configs'),
    getByUserId: (userId: string) =>
        api.get<ApiResponse<{ config: any }>>(`/salary-configs/${userId}`),
    update: (userId: string, data: any) =>
        api.put<ApiResponse<{ config: any }>>(`/salary-configs/${userId}`, data)
};

// Payroll Batches API
export const payrollBatchesApi = {
    getAll: (params?: { month?: number; year?: number; status?: string }) =>
        api.get<ApiResponse<{ batches: any[] }>>('/payroll-batches', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ batch: any; records: any[] }>>(`/payroll-batches/${id}`),

    generate: (data: { month: number; year: number; apply_technician_kpi_commission_policy?: boolean }) =>
        api.post<ApiResponse<{ batch: any }>>('/payroll-batches/generate', data),

    updateStatus: (id: string, status: string) =>
        api.patch<ApiResponse<{ batch: any }>>(`/payroll-batches/${id}/status`, { status }),

    cancel: (id: string) =>
        api.delete<ApiResponse<null>>(`/payroll-batches/${id}`),

    recalculate: (id: string, data?: { apply_technician_kpi_commission_policy?: boolean }) =>
        api.post<ApiResponse<{ batch: any; records: any[] }>>(`/payroll-batches/${id}/recalculate`, data),
};

// Reports API
export const reportsApi = {
    getRevenue: (params?: { from_date?: string; to_date?: string; group_by?: string }) =>
        api.get<ApiResponse<any>>('/reports/revenue', { params }),

    getSales: (params?: { from_date?: string; to_date?: string }) =>
        api.get<ApiResponse<any>>('/reports/sales', { params }),

    getCustomers: (params?: { from_date?: string; to_date?: string }) =>
        api.get<ApiResponse<any>>('/reports/customers', { params }),

    getFinancial: (params?: { from_date?: string; to_date?: string }) =>
        api.get<ApiResponse<any>>('/reports/financial', { params }),

    getDashboard: (params?: {
        chart_range?: string;
        from_date?: string;
        to_date?: string;
        group_by?: 'hour' | 'day' | 'weekday';
    }) => api.get<ApiResponse<any>>('/reports/dashboard', { params }),

    getDashboard2: (params?: {
        staff_range?: string;
        staff_from?: string;
        staff_to?: string;
        staff_metric?: 'revenue' | 'quantity' | 'commission';
        products_range?: string;
        products_from?: string;
        products_to?: string;
        product_category?: 'service' | 'package' | 'product' | 'account_card';
    }) => api.get<ApiResponse<any>>('/reports/dashboard-2', { params }),

    getCustomerAnalysis: (params?: { year?: number; month?: number; tab?: string }) =>
        api.get<ApiResponse<any>>('/reports/customer-analysis', { params }),
};

// Interactions API
export const interactionsApi = {
    getAll: (params?: { customer_id?: string; lead_id?: string; type?: string; result?: string; created_by?: string; page?: number; limit?: number }) =>
        api.get<PaginatedResponse<{ interactions: any[] }>>('/interactions', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ interaction: any }>>(`/interactions/${id}`),

    create: (data: any) =>
        api.post<ApiResponse<{ interaction: any }>>('/interactions', data),

    update: (id: string, data: any) =>
        api.put<ApiResponse<{ interaction: any }>>(`/interactions/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/interactions/${id}`),

    getPendingFollowups: () =>
        api.get<ApiResponse<{ followups: any[] }>>('/interactions/followups/pending'),
};

// Users API
export const usersApi = {
    getAll: (params?: { role?: string; department?: string; status?: string; search?: string }) =>
        api.get<ApiResponse<{ users: any[] }>>('/users', { params }),

    getMentionable: () =>
        api.get<ApiResponse<{ users: Array<{ id: string; name: string; avatar?: string; role?: string }> }>>('/users/mentionable'),

    getById: (id: string) =>
        api.get<ApiResponse<{ user: any }>>(`/users/${id}`),

    update: (id: string, data: any) =>
        api.put<ApiResponse<{ user: any }>>(`/users/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/users/${id}`),
};

export interface ViewActionFlags {
    edit: boolean;
    delete: boolean;
}

export type ViewActionsMap = Record<string, ViewActionFlags>;

export interface EmployeeViewPermissionRow {
    user_id: string;
    email: string;
    name: string;
    role: string;
    status?: string;
    has_custom_permissions: boolean;
    allowed_views: string[] | null;
    view_actions?: ViewActionsMap | null;
    updated_at: string | null;
}

export const employeeViewPermissionsApi = {
    list: () =>
        api.get<ApiResponse<{ permissions: EmployeeViewPermissionRow[] }>>('/employee-view-permissions'),

    getMe: () =>
        api.get<
            ApiResponse<{
                allowed_views: string[] | null;
                view_actions: ViewActionsMap | null;
                uses_role_defaults: boolean;
            }>
        >('/employee-view-permissions/me'),

    save: (userId: string, allowed_views: string[], view_actions: ViewActionsMap) =>
        api.put<
            ApiResponse<{
                permission: {
                    user_id: string;
                    email: string;
                    allowed_views: string[];
                    view_actions: ViewActionsMap;
                };
            }>
        >(`/employee-view-permissions/${userId}`, { allowed_views, view_actions }),

    remove: (userId: string) =>
        api.delete<ApiResponse<null>>(`/employee-view-permissions/${userId}`),
};

// Transactions API (Thu Chi)
export const transactionsApi = {
    getAll: (params?: {
        type?: 'income' | 'expense';
        status?: 'pending' | 'approved' | 'cancelled';
        search?: string;
        start_date?: string;
        end_date?: string;
    }) => api.get<PaginatedResponse<{ transactions: any[] }>>('/transactions', { params }),

    getSummary: (params?: { start_date?: string; end_date?: string }) =>
        api.get<ApiResponse<{
            totalIncome: number;
            totalExpense: number;
            balance: number;
            incomeCount: number;
            expenseCount: number;
            pendingIncomeCount: number;
            pendingExpenseCount: number;
        }>>('/transactions/summary', { params }),

    getById: (id: string) =>
        api.get<ApiResponse<{ transaction: any }>>(`/transactions/${id}`),

    create: (data: {
        type: 'income' | 'expense';
        category: string;
        amount: number;
        payment_method?: 'cash' | 'transfer' | 'zalopay';
        notes?: string;
        image_url?: string;
        date?: string;
        order_id?: string;
        order_code?: string;
        order_product_id?: string;
        status?: string;
        metadata?: any;
    }) => api.post<ApiResponse<{ transaction: any }>>('/transactions', data),

    updateStatus: (id: string, status: 'pending' | 'approved' | 'cancelled') =>
        api.patch<ApiResponse<{ transaction: any }>>(`/transactions/${id}/status`, { status }),

    update: (id: string, data: any) =>
        api.put<ApiResponse<{ transaction: any }>>(`/transactions/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/transactions/${id}`),
};

export const productChatsApi = {
    getRooms: () => api.get('/product-chats/rooms'),
    getMessages: (entityId: string, roomId: string) => api.get(`/product-chats/${entityId}/${roomId}`),
    sendMessage: (data: { order_id?: string; entity_id: string; entity_type: string; room_id: string; content: string; image_url?: string; mentions?: string[] }) =>
        api.post('/product-chats', data),
};

export const productTypesApi = {
    getAll: () =>
        api.get<ApiResponse<any[]>>('/product-types'),

    create: (data: any) =>
        api.post<ApiResponse<any>>('/product-types', data),

    update: (id: string, data: any) =>
        api.put<ApiResponse<any>>(`/product-types/${id}`, data),

    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/product-types/${id}`),
};

export const commissionTablesApi = {
    getAll: () => api.get('/commission-tables'),
    create: (data: any) => api.post('/commission-tables', data),
    update: (id: string, data: any) => api.patch(`/commission-tables/${id}`, data),
    delete: (id: string) => api.delete(`/commission-tables/${id}`),
};

// Departments API
export const departmentsApi = {
    getAll: (status?: string) =>
        api.get<any[]>('/departments', { params: { status } }),
    getById: (id: string) =>
        api.get<any>(`/departments/${id}`),
    create: (data: any) =>
        api.post<any>('/departments', data),
    update: (id: string, data: any) =>
        api.put<any>(`/departments/${id}`, data),
    delete: (id: string) =>
        api.delete(`/departments/${id}`),
};

// Leave Requests API
export const leaveRequestsApi = {
    getAll: (params?: { user_id?: string; role?: string }) =>
        api.get<any[]>('/leave-requests', { params }),
    create: (data: { user_id: string; type: string; sub_type: string; start_time: string; end_time?: string | null; reason: string }) =>
        api.post<any>('/leave-requests', data),
    updateStatus: (id: string, status: 'approved' | 'rejected', approved_by: string) =>
        api.patch<any>(`/leave-requests/${id}/status`, { status, approved_by }),
};

// Salary Advances API (Ứng lương)
export const salaryAdvancesApi = {
    getAll: (params?: { month?: number; year?: number; status?: string; user_id?: string }) =>
        api.get<ApiResponse<{ advances: any[]; summary: any }>>('/salary-advances', { params }),
    getByUser: (userId: string, year?: number) =>
        api.get<ApiResponse<{ advances: any[] }>>(`/salary-advances/user/${userId}`, { params: { year } }),
    create: (data: { user_id: string; amount: number; month: number; year: number; reason?: string; notes?: string }) =>
        api.post<ApiResponse<{ advance: any }>>('/salary-advances', data),
    approve: (id: string) =>
        api.patch<ApiResponse<{ advance: any }>>(`/salary-advances/${id}/approve`),
    reject: (id: string, rejection_reason?: string) =>
        api.patch<ApiResponse<{ advance: any }>>(`/salary-advances/${id}/reject`, { rejection_reason }),
    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/salary-advances/${id}`),
};

// Violations & Rewards API (Vi phạm / Thưởng)
export const violationsApi = {
    getAll: (params?: { month?: number; year?: number; type?: string; user_id?: string; category?: string }) =>
        api.get<ApiResponse<{ records: any[]; summary: any }>>('/violations', { params }),
    getByUser: (userId: string, params?: { month?: number; year?: number }) =>
        api.get<ApiResponse<{ records: any[] }>>(`/violations/user/${userId}`, { params }),
    create: (data: { user_id: string; type: 'violation' | 'reward'; category: string; amount?: number; date?: string; month?: number; year?: number; description?: string; timesheet_id?: string }) =>
        api.post<ApiResponse<{ record: any }>>('/violations', data),
    update: (id: string, data: Partial<{ type: string; category: string; amount: number; date: string; description: string }>) =>
        api.put<ApiResponse<{ record: any }>>(`/violations/${id}`, data),
    delete: (id: string) =>
        api.delete<ApiResponse<null>>(`/violations/${id}`),
    getSummary: (params: { month: number; year: number }) =>
        api.get<ApiResponse<{ employees: Record<string, { violations: number; rewards: number; net: number }> }>>('/violations/summary', { params }),
};

export const notificationsApi = {
    getAll: (params?: { type?: string; limit?: number }) =>
        api.get<ApiResponse<any[]>>('/notifications', { params }),

    getUnreadCount: () =>
        api.get<ApiResponse<{ unreadCount: number }>>('/notifications/unread-count'),

    markAsRead: (id: string) =>
        api.put<ApiResponse<any>>(`/notifications/${id}/read`),

    markAllAsRead: () =>
        api.put<ApiResponse<{ count: number }>>('/notifications/read-all'),

    create: (data: { user_id: string; type?: string; title: string; message: string; data?: any }) =>
        api.post<ApiResponse<any>>('/notifications', data),

    createBatch: (data: { user_ids: string[]; type?: string; title: string; message: string; data?: any }) =>
        api.post<ApiResponse<{ count: number }>>('/notifications/batch', data),
};

export default api;
