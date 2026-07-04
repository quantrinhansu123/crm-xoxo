import { Router, Request, Response, NextFunction } from 'express';
import { checkAllSLA } from '../utils/slaManager.js';
import { ApiError } from '../middleware/errorHandler.js';
import { supabaseAdmin } from '../config/supabase.js';
import { autoLogKpiViolation } from '../utils/kpiViolationLogger.js';
import { fireWebhook } from '../utils/webhookNotifier.js';

const router = Router();

/**
 * Middleware: Verify CRON_SECRET to prevent unauthorized SLA triggers
 */
const verifyCronSecret = (req: Request, res: Response, next: NextFunction) => {
    const secret = req.headers['x-cron-secret'] || req.query.secret;
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
        console.error('[Cron] CRON_SECRET is not configured in .env');
        return next(); // If not configured, allow for now but log error
    }

    if (!secret || secret !== expectedSecret) {
        console.warn('[Cron] Unauthorized trigger attempt');
        throw new ApiError('Unauthorized - Invalid cron secret', 401);
    }

    next();
};

/**
 * GET /api/cron/check-sla
 * Trigger SLA scan via HTTP (for Cron-job.org or Render Cron)
 */
router.get('/check-sla', verifyCronSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[Cron] Manual SLA Check Triggered via HTTP');
        
        // Run the SLA check logic
        await checkAllSLA();
        
        res.json({
            status: 'success',
            message: 'SLA check completed',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/cron/test-webhook
 * Trigger a dummy webhook to verify n8n integration
 */
router.get('/test-webhook', verifyCronSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { fireWebhook } = await import('../utils/webhookNotifier.js');
        console.log('[Cron] Manual Webhook Test Triggered');
        
        const result = await fireWebhook('CRM_TEST_DEBUG', {
            message: 'Đây là tin nhắn test từ hệ thống CRM SLA Engine',
            triggered_by: 'Manual Trigger',
            tele_id_sale: '123456789', // Dummy ID for testing
            link_lead: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/leads/test-id`,
            server_time: new Date().toISOString()
        });
        
        res.json({
            status: result?.ok ? 'success' : 'failed',
            n8n_status: result?.status,
            message: result?.ok ? 'Test webhook fired successfully' : 'Failed to fire test webhook',
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/cron/auto-payroll
 * Check if today is the last Sunday of the month, create payroll batch if so
 * Should be called daily via external cron
 */
router.get('/auto-payroll', verifyCronSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[Cron] Auto-Payroll Check Triggered');

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        // Calculate last Sunday of current month
        const lastDay = new Date(year, month, 0);
        const dayOfWeek = lastDay.getDay();
        const lastSunday = new Date(lastDay);
        lastSunday.setDate(lastDay.getDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));

        const isLastSunday = now.getDate() === lastSunday.getDate();

        if (!isLastSunday) {
            return res.json({
                status: 'skipped',
                message: `Hôm nay (${now.toISOString().split('T')[0]}) không phải chủ nhật cuối tháng (${lastSunday.toISOString().split('T')[0]})`,
            });
        }

        // Import supabase and create batch
        const { supabaseAdmin } = await import('../config/supabase.js');

        // Check if batch already exists
        const { data: existing } = await supabaseAdmin
            .from('payroll_batches')
            .select('id, code')
            .eq('month', month)
            .eq('year', year)
            .single();

        if (existing) {
            return res.json({
                status: 'already_exists',
                message: `Bảng lương tháng ${month}/${year} đã tồn tại: ${existing.code}`,
            });
        }

        // Create new batch
        const lastDayNum = new Date(year, month, 0).getDate();
        const { data: batch, error } = await supabaseAdmin
            .from('payroll_batches')
            .insert({
                code: '',
                name: `Bảng lương tháng ${month}/${year}`,
                month,
                year,
                pay_period: 'Hàng tháng',
                work_period_start: `${year}-${String(month).padStart(2, '0')}-01`,
                work_period_end: `${year}-${String(month).padStart(2, '0')}-${lastDayNum}`,
                status: 'pending',
                scope: 'Tất cả nhân viên',
            })
            .select()
            .single();

        if (error) {
            console.error('[Cron] Error creating payroll batch:', error);
            throw error;
        }

        console.log(`[Cron] Auto-created payroll batch: ${batch.code} for ${month}/${year}`);

        res.json({
            status: 'success',
            message: `Tự động tạo bảng lương tháng ${month}/${year}: ${batch.code}`,
            data: { batch },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/cron/check-partner-appointments
 * Check partner appointments:
 * 1. If appointment is today -> mark card with red border (handled by frontend)
 * 2. If appointment is tomorrow -> send notification to all managers/admins
 */
router.get('/check-partner-appointments', verifyCronSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[Cron] Partner Appointments Check Triggered');

        const now = new Date();
        
        // Calculate tomorrow's date range (00:00:00 to 23:59:59)
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const dayAfterTomorrow = new Date(tomorrow);
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

        // Find partner requests with appointment_time tomorrow
        const { data: tomorrowAppointments, error: appointmentsError } = await supabaseAdmin
            .from('order_item_partner')
            .select(`
                id,
                status,
                metadata,
                order_item:order_items(id, item_name, order:orders(id, order_code)),
                order_product:order_products(id, name, order:orders(id, order_code)),
                order_product_service:order_product_services(id, order_product:order_products(name, order:orders(id, order_code)))
            `)
            .eq('status', 'partner_doing');

        if (appointmentsError) {
            throw new ApiError('Error fetching partner appointments: ' + appointmentsError.message, 500);
        }

        // Filter to only tomorrow's appointments
        const tomorrowItems = (tomorrowAppointments || []).filter((item: any) => {
            const appointmentTime = item.metadata?.appointment_time;
            if (!appointmentTime) return false;
            const aptDate = new Date(appointmentTime);
            return aptDate.getTime() >= tomorrow.getTime() && aptDate.getTime() < dayAfterTomorrow.getTime();
        });

        // Get all managers and admins
        const { data: managers, error: managersError } = await supabaseAdmin
            .from('users')
            .select('id, name, role')
            .in('role', ['admin', 'manager'])
            .eq('status', 'active');

        if (managersError) {
            throw new ApiError('Error fetching managers: ' + managersError.message, 500);
        }

// Create notifications for each tomorrow appointment
        const notifications: any[] = [];
        for (const item of tomorrowItems) {
            // Supabase returns relations as arrays, get first element
            const orderItem = Array.isArray(item.order_item) ? item.order_item[0] : item.order_item;
            const orderProduct = Array.isArray(item.order_product) ? item.order_product[0] : item.order_product;
            const orderProductService = Array.isArray(item.order_product_service) ? item.order_product_service[0] : item.order_product_service;
            const orderProd = orderProductService?.order_product;
            const orderProdFinal = Array.isArray(orderProd) ? orderProd[0] : orderProd;
            
            const itemName = orderItem?.item_name || 
                           orderProduct?.name || 
                           orderProdFinal?.name || 
                           'Sản phẩm';
            const orderObj = orderItem?.order || orderProduct?.order || orderProdFinal?.order;
            const orderObjFinal = Array.isArray(orderObj) ? orderObj[0] : orderObj;
            const orderCode = orderObjFinal?.order_code || 'N/A';
            const appointmentDate = new Date(item.metadata.appointment_time).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            for (const manager of (managers || [])) {
                notifications.push({
                    user_id: manager.id,
                    type: 'partner_appointment',
                    title: 'Nhắc lịch hẹn đối tác ngày mai',
                    message: `${itemName} (${orderCode}) có lịch hẹn đối tác vào ngày mai: ${appointmentDate}`,
                    data: {
                partner_request_id: item.id,
                order_code: orderCode,
                appointment_time: item.metadata.appointment_time,
                item_name: itemName
            },
                    is_read: false,
                    created_at: new Date().toISOString()
                });
            }
        }

        // Insert all notifications
        if (notifications.length > 0) {
            const { error: insertError } = await supabaseAdmin
                .from('notifications')
                .insert(notifications);

            if (insertError) {
                console.error('[Cron] Error inserting notifications:', insertError);
            } else {
                console.log(`[Cron] Created ${notifications.length} notifications for ${(managers || []).length} managers`);
            }
        }

        res.json({
            status: 'success',
            message: 'Partner appointments check completed',
            data: {
                tomorrow_appointments: tomorrowItems.length,
                managers_notified: (managers || []).length,
                notifications_created: notifications.length,
                appointments: tomorrowItems.map((item: any) => {
                    const oi = Array.isArray(item.order_item) ? item.order_item[0] : item.order_item;
                    const op = Array.isArray(item.order_product) ? item.order_product[0] : item.order_product;
                    return {
                        id: item.id,
                        appointment_time: item.metadata?.appointment_time,
                        item_name: oi?.item_name || op?.name || 'N/A'
                    };
                })
            },
            timestamp: now.toISOString()
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/cron/check-return-due-reminders
 * Fire webhook reminders 1 day before return due date for technician(s) and sale.
 * Should be called daily via external cron.
 */
router.get('/check-return-due-reminders', verifyCronSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[Cron] Return Due Reminder Check Triggered');

        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const dayAfterTomorrow = new Date(tomorrow);
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

        const startIso = tomorrow.toISOString();
        const endIso = dayAfterTomorrow.toISOString();

        const firedEvents: any[] = [];
        const warnings: string[] = [];
        let productReminders = 0;
        let itemReminders = 0;

        let dueProducts: any[] = [];

        const productRes = await supabaseAdmin
            .from('order_products')
            .select('id, order_id, product_code, name, due_at, after_sale_stage')
            .gte('due_at', startIso)
            .lt('due_at', endIso)
            .not('after_sale_stage', 'eq', 'after4');
        if (productRes.error) {
            warnings.push(`order_products primary query failed: ${productRes.error.message}`);
            const fallbackProductRes = await supabaseAdmin
                .from('order_products')
                .select('id, order_id, product_code, name, due_at')
                .gte('due_at', startIso)
                .lt('due_at', endIso);
            if (fallbackProductRes.error) {
                warnings.push(`order_products fallback query failed: ${fallbackProductRes.error.message}`);
            } else {
                dueProducts = fallbackProductRes.data || [];
            }
        } else {
            dueProducts = productRes.data || [];
        }

        const allOrderIds = [...new Set([
            ...dueProducts.map((product: any) => product.order_id)
        ].filter(Boolean))];

        const { data: orders, error: ordersError } = allOrderIds.length > 0
            ? await supabaseAdmin
                .from('orders')
                .select('id, order_code, sales_id, customer:customers(id, name, phone)')
                .in('id', allOrderIds)
            : { data: [], error: null as any };

        if (ordersError) {
            throw new ApiError('Error fetching orders for return due reminders: ' + ordersError.message, 500);
        }

        const orderById = new Map<string, any>((orders || []).map((order: any) => [order.id, order]));

        const saleIds = [...new Set((orders || []).map((order: any) => order.sales_id).filter(Boolean))];
        const { data: saleUsers, error: saleUsersError } = saleIds.length > 0
            ? await supabaseAdmin
                .from('users')
                .select('id, name, telegram_chat_id')
                .in('id', saleIds)
            : { data: [], error: null as any };

        if (saleUsersError) {
            warnings.push(`sale users query failed: ${saleUsersError.message}`);
        }
        const saleById = new Map<string, any>(((saleUsers || []) as any[]).map((user: any) => [user.id, user]));

        const productIds = dueProducts.map((product: any) => product.id).filter(Boolean);
        const { data: productServices, error: productServicesError } = productIds.length > 0
            ? await supabaseAdmin
                .from('order_product_services')
                .select('id, order_product_id')
                .in('order_product_id', productIds)
            : { data: [], error: null as any };

        if (productServicesError) {
            warnings.push(`order_product_services query failed: ${productServicesError.message}`);
        }

        const serviceRows = (productServices || []) as any[];
        const serviceIds = serviceRows.map((service: any) => service.id).filter(Boolean);
        const servicesByProductId = new Map<string, any[]>();
        for (const service of serviceRows) {
            const bucket = servicesByProductId.get(service.order_product_id) || [];
            bucket.push(service);
            servicesByProductId.set(service.order_product_id, bucket);
        }

        const legacyTechByServiceId = new Map<string, string>();
        if (serviceIds.length > 0) {
            const legacyTechRes = await supabaseAdmin
                .from('order_product_services')
                .select('id, technician_id')
                .in('id', serviceIds);
            if (!legacyTechRes.error) {
                for (const row of (legacyTechRes.data || [])) {
                    if ((row as any).technician_id) {
                        legacyTechByServiceId.set((row as any).id, (row as any).technician_id);
                    }
                }
            } else {
                warnings.push(`legacy service technician_id query failed: ${legacyTechRes.error.message}`);
            }
        }

        const junctionTechByServiceId = new Map<string, string[]>();
        if (serviceIds.length > 0) {
            const junctionRes = await supabaseAdmin
                .from('order_product_service_technicians')
                .select('order_product_service_id, technician_id')
                .in('order_product_service_id', serviceIds);
            if (!junctionRes.error) {
                for (const row of (junctionRes.data || [])) {
                    const key = (row as any).order_product_service_id;
                    const techId = (row as any).technician_id;
                    if (!key || !techId) continue;
                    const bucket = junctionTechByServiceId.get(key) || [];
                    bucket.push(techId);
                    junctionTechByServiceId.set(key, bucket);
                }
            } else {
                warnings.push(`service technicians junction query failed: ${junctionRes.error.message}`);
            }
        }

        const junctionTechIds = Array.from(junctionTechByServiceId.values()).reduce<string[]>((acc, techIds) => {
            acc.push(...techIds);
            return acc;
        }, []);
        const serviceTechIds = [
            ...Array.from(legacyTechByServiceId.values()),
            ...junctionTechIds
        ];
        const allTechIds = [...new Set(serviceTechIds.filter(Boolean))];
        const { data: techUsers, error: techUsersError } = allTechIds.length > 0
            ? await supabaseAdmin
                .from('users')
                .select('id, name, telegram_chat_id')
                .in('id', allTechIds)
            : { data: [], error: null as any };
        if (techUsersError) {
            warnings.push(`technician users query failed: ${techUsersError.message}`);
        }
        const techById = new Map<string, any>(((techUsers || []) as any[]).map((user: any) => [user.id, user]));

        for (const product of dueProducts) {
            const orderObj = orderById.get(product.order_id);
            const customerObj = Array.isArray(orderObj?.customer) ? orderObj.customer[0] : orderObj?.customer;
            const saleUser = orderObj?.sales_id ? saleById.get(orderObj.sales_id) : null;
            const services = servicesByProductId.get(product.id) || [];

            const technicianMap = new Map<string, any>();
            for (const service of services) {
                const techIds = new Set<string>();
                const legacyId = legacyTechByServiceId.get(service.id);
                if (legacyId) techIds.add(legacyId);
                for (const junctionId of (junctionTechByServiceId.get(service.id) || [])) {
                    if (junctionId) techIds.add(junctionId);
                }
                for (const techId of techIds) {
                    const tech = techById.get(techId);
                    if (tech) technicianMap.set(tech.id, { id: tech.id, name: tech.name, telegram_chat_id: tech.telegram_chat_id });
                }
            }
            const uniqueTechnicians = Array.from(technicianMap.values());

            const payload = {
                order_id: orderObj?.id || product.order_id,
                order_code: orderObj?.order_code || 'N/A',
                customer_name: customerObj?.name || null,
                customer_phone: customerObj?.phone || null,
                order_product_id: product.id,
                product_code: product.product_code || null,
                product_name: product.name || 'N/A',
                due_at: product.due_at,
                reminder_type: '1_day_before_return',
                target_user_id: saleUser?.id || orderObj?.sales_id || null,
                target_role: 'sale',
                sale_id: saleUser?.id || orderObj?.sales_id || null,
                sale_name: saleUser?.name || null,
                tele_id_sale: saleUser?.telegram_chat_id || null,
                technicians: uniqueTechnicians,
                tele_ids_technician: uniqueTechnicians.map((tech: any) => tech.telegram_chat_id).filter(Boolean),
            };

            fireWebhook('return_due.reminder_tomorrow', payload);
            productReminders++;
            firedEvents.push({
                entity_type: 'order_product',
                entity_id: product.id,
                order_code: payload.order_code,
                customer_name: payload.customer_name,
                due_at: payload.due_at,
                sale_tele: payload.tele_id_sale,
                technician_count: payload.tele_ids_technician.length,
            });
        }

        res.json({
            status: 'success',
            message: 'Return due reminders webhook check completed',
            data: {
                window_start: startIso,
                window_end: endIso,
                product_reminders: productReminders,
                item_reminders: itemReminders,
                total_events: firedEvents.length,
                events: firedEvents,
                warnings,
            },
            timestamp: now.toISOString(),
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/cron/check-debt-overdue
 * Detect orders at kiểm nợ stage with overdue debt (>10 days).
 * Auto-creates KPI violation logs for responsible sales.
 * Should be called daily via external cron.
 */
router.get('/check-debt-overdue', verifyCronSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[Cron] Debt Overdue Check Triggered');
        
        const now = new Date();
        const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
        
        // Find orders where:
        // - debt_start_at is set and older than 10 days
        // - remaining_debt > 0
        // - sales_id is set (someone is responsible)
        // - order is not cancelled
        const { data: overdueOrders, error } = await supabaseAdmin
            .from('orders')
            .select('id, order_code, sales_id, debt_start_at, remaining_debt, total_amount')
            .not('debt_start_at', 'is', null)
            .not('sales_id', 'is', null)
            .gt('remaining_debt', 0)
            .lt('debt_start_at', tenDaysAgo.toISOString())
            .neq('status', 'cancelled');
        
        if (error) {
            console.error('[Cron] Error fetching overdue orders:', error);
            throw error;
        }
        
        let violationsCreated = 0;
        const details: any[] = [];
        
        for (const order of (overdueOrders || [])) {
            const overdueDays = Math.floor(
                (now.getTime() - new Date(order.debt_start_at).getTime()) / (24 * 60 * 60 * 1000)
            );
            
            await autoLogKpiViolation({
                employeeId: order.sales_id,
                relatedOrderId: order.id,
                ruleCode: 'debt_overdue',
                ruleName: `Nợ quá hạn (${overdueDays} ngày) - ${order.order_code}`,
                deductPoint: 0,
                note: `Đơn ${order.order_code}: còn nợ ${order.remaining_debt?.toLocaleString('vi-VN')}đ, đã ${overdueDays} ngày kể từ kiểm nợ`
            });
            
            violationsCreated++;
            details.push({
                order_code: order.order_code,
                sales_id: order.sales_id,
                remaining_debt: order.remaining_debt,
                overdue_days: overdueDays
            });
        }
        
        console.log(`[Cron] Debt check complete: ${violationsCreated} violations logged`);
        
        res.json({
            status: 'success',
            message: `Checked debt overdue: ${(overdueOrders || []).length} overdue orders found`,
            data: {
                overdue_count: (overdueOrders || []).length,
                violations_created: violationsCreated,
                details
            },
            timestamp: now.toISOString()
        });
    } catch (err) {
        next(err);
    }
});

export { router as cronRouter };


