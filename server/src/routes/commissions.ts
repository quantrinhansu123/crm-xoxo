import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireAccountant } from '../middleware/auth.js';

const router = Router();

// Get commission summary for an employee
router.get('/employee/:userId', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { userId } = req.params;
        const { from_date, to_date, status } = req.query;

        // Only allow viewing own commission or if manager/accountant
        if (req.user!.id !== userId &&
            req.user!.role !== 'manager' &&
            req.user!.role !== 'accountant') {
            throw new ApiError('Không có quyền xem hoa hồng người khác', 403);
        }

        // Get user info
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('id, name, role')
            .eq('id', userId)
            .single();

        if (!user) {
            throw new ApiError('Không tìm thấy nhân viên', 404);
        }

        // Build date filter
        const dateFilter: any = {};
        if (from_date) dateFilter.from_date = from_date;
        if (to_date) dateFilter.to_date = to_date;

        let salesCommissions: any[] = [];
        let techCommissions: any[] = [];

        // Get sales commission (from orders where user is sales_id)
        let salesQuery = supabaseAdmin
            .from('orders')
            .select(`
                id,
                order_code,
                status,
                total_amount,
                created_at,
                completed_at,
                customer:customers(name),
                items:order_items(id, item_name, item_type, total_price, commission_sale_rate, commission_sale_amount)
            `)
            .eq('sales_id', userId);

        if (status) {
            salesQuery = salesQuery.eq('status', status);
        } else {
            salesQuery = salesQuery.in('status', ['completed', 'delivered']);
        }
        if (from_date) salesQuery = salesQuery.gte('created_at', from_date);
        if (to_date) salesQuery = salesQuery.lte('created_at', to_date);

        const { data: salesOrders } = await salesQuery;

        if (salesOrders) {
            for (const order of salesOrders) {
                const items = (order.items as any[]) || [];
                const orderCommission = items.reduce((sum, item) =>
                    sum + (item.commission_sale_amount || 0), 0);

                if (orderCommission > 0) {
                    salesCommissions.push({
                        type: 'sale',
                        order_id: order.id,
                        order_code: order.order_code,
                        order_status: order.status,
                        customer_name: (order.customer as any)?.name || 'N/A',
                        total_amount: order.total_amount,
                        commission_amount: orderCommission,
                        items: items.map(item => ({
                            item_name: item.item_name,
                            item_type: item.item_type,
                            total_price: item.total_price,
                            commission_rate: item.commission_sale_rate,
                            commission_amount: item.commission_sale_amount,
                        })),
                        created_at: order.created_at,
                        completed_at: order.completed_at,
                    });
                }
            }
        }

        // Get technician commission (from order_items where user is technician_id)
        let techQuery = supabaseAdmin
            .from('order_items')
            .select(`
                id,
                item_name,
                item_type,
                total_price,
                commission_tech_rate,
                commission_tech_amount,
                order:orders!inner(id, order_code, status, created_at, completed_at, customer:customers(name))
            `)
            .eq('technician_id', userId)
            .gt('commission_tech_amount', 0);

        const { data: techItems } = await techQuery;

        if (techItems) {
            for (const item of techItems) {
                const order = item.order as any;

                // Filter by status
                if (status && order.status !== status) continue;
                if (!status && !['completed', 'delivered'].includes(order.status)) continue;

                // Filter by date
                if (from_date && order.created_at < from_date) continue;
                if (to_date && order.created_at > to_date) continue;

                techCommissions.push({
                    type: 'technician',
                    order_id: order.id,
                    order_code: order.order_code,
                    order_status: order.status,
                    customer_name: order.customer?.name || 'N/A',
                    item_name: item.item_name,
                    item_type: item.item_type,
                    total_price: item.total_price,
                    commission_rate: item.commission_tech_rate,
                    commission_amount: item.commission_tech_amount,
                    created_at: order.created_at,
                    completed_at: order.completed_at,
                });
            }
        }

        // Calculate totals
        const totalSalesCommission = salesCommissions.reduce((sum, c) => sum + c.commission_amount, 0);
        const totalTechCommission = techCommissions.reduce((sum, c) => sum + c.commission_amount, 0);

        res.json({
            status: 'success',
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                },
                summary: {
                    total_commission: totalSalesCommission + totalTechCommission,
                    sales_commission: totalSalesCommission,
                    tech_commission: totalTechCommission,
                    sales_orders_count: salesCommissions.length,
                    tech_items_count: techCommissions.length,
                },
                commissions: {
                    sales: salesCommissions,
                    technician: techCommissions,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get commission report for all employees
router.get('/report', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { from_date, to_date, month, year } = req.query;

        // Calculate date range
        let startDate: string;
        let endDate: string;

        if (from_date && to_date) {
            startDate = from_date as string;
            endDate = to_date as string;
        } else {
            const currentMonth = month ? Number(month) : new Date().getMonth() + 1;
            const currentYear = year ? Number(year) : new Date().getFullYear();
            startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
            endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
        }

        // Get all completed orders in the period
        const { data: orders } = await supabaseAdmin
            .from('orders')
            .select(`
                id,
                order_code,
                sales_id,
                status,
                total_amount,
                created_at,
                sales_user:users!orders_sales_id_fkey(id, name),
                items:order_items(id, item_name, total_price, technician_id, commission_sale_amount, commission_tech_amount)
            `)
            .in('status', ['completed', 'delivered'])
            .gte('created_at', startDate)
            .lte('created_at', endDate + 'T23:59:59');

        // Get all technicians
        const { data: technicians } = await supabaseAdmin
            .from('users')
            .select('id, name')
            .eq('role', 'technician')
            .eq('status', 'active');

        const techMap = new Map(technicians?.map(t => [t.id, t.name]) || []);

        // Aggregate by employee
        const employeeCommissions: Record<string, {
            id: string;
            name: string;
            role_type: string;
            sales_commission: number;
            tech_commission: number;
            orders_count: number;
        }> = {};

        orders?.forEach(order => {
            const salesUser = order.sales_user as any;
            const salesId = order.sales_id;
            const items = (order.items as any[]) || [];

            // Add sales commission
            if (salesId && salesUser) {
                if (!employeeCommissions[salesId]) {
                    employeeCommissions[salesId] = {
                        id: salesId,
                        name: salesUser.name,
                        role_type: 'sale',
                        sales_commission: 0,
                        tech_commission: 0,
                        orders_count: 0,
                    };
                }
                const salesComm = items.reduce((sum, item) => sum + (item.commission_sale_amount || 0), 0);
                employeeCommissions[salesId].sales_commission += salesComm;
                employeeCommissions[salesId].orders_count += 1;
            }

            // Add tech commission
            items.forEach(item => {
                if (item.technician_id && item.commission_tech_amount > 0) {
                    const techId = item.technician_id;
                    const techName = techMap.get(techId) || 'Unknown';

                    if (!employeeCommissions[techId]) {
                        employeeCommissions[techId] = {
                            id: techId,
                            name: techName,
                            role_type: 'technician',
                            sales_commission: 0,
                            tech_commission: 0,
                            orders_count: 0,
                        };
                    }
                    employeeCommissions[techId].tech_commission += item.commission_tech_amount;
                    employeeCommissions[techId].orders_count += 1;
                }
            });
        });

        const employees = Object.values(employeeCommissions)
            .map(e => ({
                ...e,
                total_commission: e.sales_commission + e.tech_commission,
            }))
            .sort((a, b) => b.total_commission - a.total_commission);

        const totalSalesCommission = employees.reduce((sum, e) => sum + e.sales_commission, 0);
        const totalTechCommission = employees.reduce((sum, e) => sum + e.tech_commission, 0);

        res.json({
            status: 'success',
            data: {
                period: {
                    from: startDate,
                    to: endDate,
                },
                summary: {
                    total_commission: totalSalesCommission + totalTechCommission,
                    sales_commission: totalSalesCommission,
                    tech_commission: totalTechCommission,
                    employees_count: employees.length,
                    orders_count: orders?.length || 0,
                },
                employees,
            },
        });
    } catch (error) {
        next(error);
    }
});

export { router as commissionsRouter };
