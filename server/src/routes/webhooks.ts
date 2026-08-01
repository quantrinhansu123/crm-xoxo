import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { fireWebhook, notifyCrmMaster } from '../utils/webhookNotifier.js';
import { on_customer_message, on_sale_message, on_lead_assigned, getVirtualTimeLeft, calculateDeadline, SLA_CYCLES } from '../utils/leadSlaStateMachine.js';
import { enrichLeadSlaFields, resolveLeadCustomerMessageAt, resolveLeadStaffReplyAt, normalizeN8nLeadPayload, N8N_LEAD_NON_DB_KEYS } from '../utils/webhookPayloadAliases.js';

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ============================================================
// Middleware: Xác thực webhook bằng API Key
// n8n cần gửi header: x-webhook-secret: <WEBHOOK_SECRET>
// ============================================================
const verifyWebhookSecret = (req: Request, res: Response, next: NextFunction) => {
    const secret = req.headers['x-webhook-secret'] as string;
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (!expectedSecret) {
        console.error('[Webhook] WEBHOOK_SECRET chưa được cấu hình trong .env');
        return res.status(500).json({
            status: 'error',
            message: 'Webhook chưa được cấu hình',
        });
    }

    if (!secret || secret !== expectedSecret) {
        console.warn('[Webhook] Unauthorized request - invalid secret');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized - Invalid webhook secret',
        });
    }

    next();
};

// ============================================================
// POST /api/webhooks/n8n
// Endpoint chính để n8n gửi data vào
// 
// Body format:
// {
//   "event": "lead.create" | "lead.update" | "customer.create" | "order.create" | "custom",
//   "data": { ... }
// }
// ============================================================
router.post('/n8n', verifyWebhookSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { event, data } = req.body;

        if (!event || !data) {
            throw new ApiError('Thiếu trường "event" hoặc "data" trong request body', 400);
        }

        let result: any;

        const processEvent = async (evt: string, item: any) => {
            switch (evt) {
                case 'lead.upsert':
                case 'lead.create':
                case 'lead.update':
                    return await handleLeadUpsert(item, evt);
                case 'lead.ai_update':
                    return await handleLeadAIUpdate(item);
                case 'lead.sale_memory_update':
                    return await handleLeadSaleMemoryUpdate(item);
                case 'customer.create':
                    return await handleCustomerCreate(item);
                case 'order.create':
                    return await handleOrderCreate(item);
                default:
                    return await logWebhookEvent(evt, item);
            }
        };

        let finalData = data;
        // Hỗ trợ "Cách 2": n8n gửi một object có key "lead" chứa mảng dữ liệu (VD: { lead: [...] })
        if (!Array.isArray(data) && data && typeof data === 'object' && Array.isArray(data.lead)) {
            console.log(`[Webhook] Phát hiện mảng bên trong key "lead" với ${data.lead.length} items`);
            finalData = data.lead;
        }

        if (Array.isArray(finalData)) {
            console.log(`[Webhook] Xử lý mảng ${finalData.length} items cho event: ${event}`);
            result = await Promise.all(finalData.map(item => processEvent(event, item)));
        } else {
            result = await processEvent(event, finalData);
        }

        // Log webhook vào database
        await logWebhookEvent(event, data, 'success');

        res.status(200).json({
            status: 'success',
            message: `Event "${event}" đã được xử lý`,
            data: result,
        });
    } catch (error) {
        // Log lỗi webhook
        try {
            await logWebhookEvent(
                req.body?.event || 'unknown',
                req.body?.data || {},
                'error',
                error instanceof Error ? error.message : 'Unknown error'
            );
        } catch (logErr) {
            console.error('[Webhook] Lỗi khi log webhook:', logErr);
        }
        next(error);
    }
});

// ============================================================
// GET /api/webhooks/leads/sla
// Lấy danh sách Leads đang được gán (assigned) để kiểm tra SLA
// ============================================================
router.get('/leads/sla', verifyWebhookSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('leads')
            .select(`
                id, name, phone, fb_thread_id, pancake_conversation_id,
                t_last_inbound, t_last_outbound, current_deadline_at, 
                current_rule_index, sla_state, created_at, assigned_to,
                assigned_to_user: users!leads_assigned_to_fkey(name, telegram_chat_id)
            `)
            .in('sla_state', ['OWNED_WAITING_SALE', 'OWNED_WAITING_CUSTOMER', 'PAUSED_FOLLOWUP'])
            .not('assigned_to', 'is', null)
            .not('pipeline_stage', 'in', '("chot_don","huy","fail")');

        if (error) {
            throw new ApiError('Lỗi truy vấn Leads SLA: ' + error.message, 500);
        }

        const now = new Date();

        // Format data — cùng ngưỡng WARN/RECLAIM với checkSlaCron (Rule 1+2)
        const leads = data.map((lead: any) => {
            const deadline = lead.current_deadline_at ? new Date(lead.current_deadline_at) : now;
            const createdAt = lead.created_at ? new Date(lead.created_at) : now;
            const ruleIndex = lead.current_rule_index || 0;
            const slaMinutes = SLA_CYCLES[ruleIndex] || 3;
            const warnMinutes = slaMinutes <= 3 ? 1.5 : 45;

            const timeLeftMins = getVirtualTimeLeft(now, deadline, createdAt);

            let action_type = 'NONE';

            // RECLAIM chỉ khi mốc 3 phút (index 0) thủng — mốc dài chỉ WARN (cron sẽ chuyển mốc)
            if (timeLeftMins <= 0 && ruleIndex === 0) {
                action_type = 'RECLAIM';
            } else if (timeLeftMins <= 0 && ruleIndex > 0) {
                action_type = 'WARN';
            } else if (timeLeftMins > 0 && timeLeftMins <= warnMinutes) {
                action_type = 'WARN';
            }

            return enrichLeadSlaFields({
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                fb_thread_id: lead.fb_thread_id,
                pancake_conversation_id: lead.pancake_conversation_id,
                assigned_to: lead.assigned_to,
                assigned_to_name: lead.assigned_to_user?.name || 'Hệ thống',
                t_last_inbound: lead.t_last_inbound,
                t_last_outbound: lead.t_last_outbound,
                current_deadline_at: lead.current_deadline_at,
                current_rule_index: ruleIndex,
                sla_state: lead.sla_state,
                time_left_mins: timeLeftMins,
                action_type: action_type,
                sla_label: action_type === 'RECLAIM' ? `${slaMinutes} phút (Thu hồi)` : action_type === 'WARN' ? `${warnMinutes} phút (Cảnh báo)` : 'OK'
            });
        }).filter((l: any) => l.action_type !== 'NONE');

        res.json({
            status: 'success',
            count: leads.length,
            server_time: now.toISOString(),
            data: leads
        });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// GET /api/webhooks/leads/daily-summary
// Báo cáo tổng hợp hằng ngày cho AI:
// - Top 5 Heat Score chưa chốt
// - Khách High Risk trong 24h
// - Số khách mới hôm qua
// - Sale để khách chờ quá hạn SLA (>3 phút)
// ============================================================
router.get('/leads/daily-summary', verifyWebhookSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        const startOfYesterday = new Date(yesterday);
        startOfYesterday.setHours(0, 0, 0, 0);

        const endOfYesterday = new Date(yesterday);
        endOfYesterday.setHours(23, 59, 59, 999);

        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // 1. Top 5 Heat Score chưa chốt
        const { data: topPotentials } = await supabaseAdmin
            .from('leads')
            .select('id, name, phone, lead_score, pipeline_stage')
            .neq('pipeline_stage', 'chot_don')
            .order('lead_score', { ascending: false })
            .limit(5);

        // 2. High Risk 24h
        const { data: highRisks } = await supabaseAdmin
            .from('leads')
            .select('id, name, phone, loss_risk, updated_at')
            .ilike('loss_risk', 'high')
            .gt('updated_at', last24h.toISOString());

        // 3. Khách mới hôm qua
        const { count: newLeadsYesterday } = await supabaseAdmin
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfYesterday.toISOString())
            .lte('created_at', endOfYesterday.toISOString());

        // 4. Sale để khách quá hạn SLA (>3p)
        const { data: slaData } = await supabaseAdmin
            .from('leads')
            .select('id, name, t_last_inbound, t_last_outbound, assigned_to_user: users!leads_assigned_to_fkey(name)')
            .eq('assign_state', 'assigned')
            .not('assigned_to', 'is', null);

        const overdueSales = new Set<string>();
        if (slaData) {
            slaData.forEach((l: any) => {
                const lastIn = l.t_last_inbound ? new Date(l.t_last_inbound) : null;
                const lastOut = l.t_last_outbound ? new Date(l.t_last_outbound) : null;
                if (lastIn && (!lastOut || lastIn > lastOut)) {
                    const waitMin = (now.getTime() - lastIn.getTime()) / 60000;
                    if (waitMin > 3) {
                        overdueSales.add(l.assigned_to_user?.name || 'Ẩn danh');
                    }
                }
            });
        }

        res.json({
            status: 'success',
            report_date: now.toISOString(),
            summary: {
                top_potentials: topPotentials || [],
                high_risks_24h: highRisks || [],
                new_leads_yesterday_count: newLeadsYesterday || 0,
                sales_with_overdue_leads: Array.from(overdueSales)
            }
        });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// POST /api/webhooks/n8n/raw
// Endpoint nhận raw data từ n8n (không cần format event/data)
// Data sẽ được lưu trực tiếp vào bảng webhook_logs
// ============================================================
function looksLikeUnevaluatedN8nExpression(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const s = value.trim();
    // Literal chưa evaluate: "={{ $json.raw_payload }}" hoặc "{{ $json... }}"
    return /^=\{\{/.test(s) || /^\{\{\s*\$json/.test(s);
}

function scanUnevaluatedExpressions(input: unknown, path = 'body'): string[] {
    const hits: string[] = [];
    if (looksLikeUnevaluatedN8nExpression(input)) {
        hits.push(path);
        return hits;
    }
    if (!input || typeof input !== 'object') return hits;
    if (Array.isArray(input)) {
        input.forEach((item, i) => hits.push(...scanUnevaluatedExpressions(item, `${path}[${i}]`)));
        return hits;
    }
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        hits.push(...scanUnevaluatedExpressions(value, `${path}.${key}`));
    }
    return hits;
}

/** Chuẩn hóa body RAW: hỗ trợ { source, payload: <pancake json> } */
function normalizeRawWebhookBody(body: any): {
    source: string;
    payload: Record<string, any>;
    meta: Record<string, any>;
} {
    const source = typeof body?.source === 'string' && body.source.trim()
        ? body.source.trim()
        : 'pancake';

    let payload: any = body?.payload !== undefined ? body.payload : body;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch {
            payload = { raw_string: payload };
        }
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        payload = { value: payload ?? null };
    }

    const nested = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const flat = { ...payload, ...nested };

    const meta = {
        message_id: flat.message_id ?? flat.id ?? null,
        request_id: flat.request_id ?? null,
        message_time: flat.message_time ?? flat.last_message_time ?? flat.inserted_at ?? flat.created_at ?? null,
        page_id: flat.page_id ?? flat.pageId ?? null,
        message_direction: flat.message_direction ?? flat.direction ?? null,
        sender_sale_id: flat.sender_sale_id ?? null,
        sender_sale_name: flat.sender_sale_name ?? null,
        assigned_to: flat.assigned_to ?? null,
    };

    return { source, payload, meta };
}

router.post('/n8n/raw', verifyWebhookSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body;

        // Bắt lỗi cấu hình n8n: body gửi literal expression thay vì JSON đã evaluate
        const badPaths = scanUnevaluatedExpressions(data);
        if (badPaths.length > 0) {
            console.error('[Webhook] RAW body chứa expression chưa evaluate:', badPaths, String(JSON.stringify(data)).slice(0, 200));
            await logWebhookEvent('raw', {
                error: 'N8N_EXPRESSION_NOT_EVALUATED',
                bad_paths: badPaths,
                hint: 'Body JSON phải là ={{ { source: \"pancake\", payload: $json } }} (expression object), không phải chuỗi \"={{ $json.raw_payload }}\". Bật Continue On Fail cho node RAW_LOG.',
                received: data,
            }, 'error');

            // Best-effort: trả 200 kèm warning để không chặn nhánh song song nếu quên Continue On Fail
            return res.status(200).json({
                status: 'accepted_with_warning',
                code: 'N8N_EXPRESSION_NOT_EVALUATED',
                message:
                    'Body RAW đang là expression n8n chưa evaluate. Sửa Body = JSON: ={{ { source: \"pancake\", payload: $json } }}. Bật Continue On Fail cho RAW_LOG.',
                bad_paths: badPaths,
            });
        }

        const normalized = normalizeRawWebhookBody(data);
        console.log('[Webhook] Nhận raw data:', JSON.stringify({
            source: normalized.source,
            meta: normalized.meta,
        }).substring(0, 300));

        await logWebhookEvent('raw', {
            source: normalized.source,
            payload: normalized.payload,
            meta: normalized.meta,
        }, 'success');

        res.status(200).json({
            status: 'success',
            message: 'Raw data đã được lưu',
            meta: normalized.meta,
        });
    } catch (error) {
        // Best-effort logging: không làm hỏng luồng n8n
        console.error('[Webhook] RAW log failed (best-effort):', error);
        try {
            await logWebhookEvent('raw', {
                error: 'RAW_LOG_EXCEPTION',
                message: error instanceof Error ? error.message : String(error),
                received: req.body,
            }, 'error');
        } catch (_) {
            /* ignore */
        }
        return res.status(200).json({
            status: 'accepted_with_warning',
            code: 'RAW_LOG_EXCEPTION',
            message: 'RAW log lỗi phía CRM nhưng đã acknowledge để không chặn flow n8n',
        });
    }
});

// ============================================================
// GET /api/webhooks/orders/overdue-pickup
// Lấy danh sách đơn quá hạn trả đồ:
// - order_products.due_at < Ngày hiện tại
// - order_products.after_sale_stage != 'after4' (chưa Lưu Trữ)
// ============================================================
router.get('/orders/overdue-pickup', verifyWebhookSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const now = new Date().toISOString();

        // 1. Lấy order_products quá hạn và chưa lưu trữ
        const { data: overdueProducts, error } = await supabaseAdmin
            .from('order_products')
            .select(`
                id,
                product_code,
                name,
                images,
                due_at,
                after_sale_stage,
                services:order_product_services(
                    id,
                    item_name,
                    status,
                    technician_id,
                    technician:users!order_product_services_technician_id_fkey(id, name, telegram_chat_id)
                ),
                order:orders!inner(
                    id,
                    order_code,
                    sales_id,
                    due_at,
                    customer:customers!inner(id, name, phone, zalo_user_id, customer_zalo_user_id),
                    sales_user:users!orders_sales_id_fkey(id, name, role, telegram_chat_id)
                )
            `)
            .lt('due_at', now)
            .not('after_sale_stage', 'eq', 'after4');

        if (error) {
            throw new ApiError('Lỗi truy vấn đơn quá hạn: ' + error.message, 500);
        }

        // 2. Collect customer phones to look up Pancake conversation links
        const customerPhones = [...new Set(
            (overdueProducts || [])
                .map((p: any) => p.order?.customer?.phone)
                .filter(Boolean)
        )];

        let leadsByPhone: Record<string, string> = {};
        if (customerPhones.length > 0) {
            const { data: leads } = await supabaseAdmin
                .from('leads')
                .select('phone, pancake_conversation_id')
                .in('phone', customerPhones)
                .not('pancake_conversation_id', 'is', null);

            if (leads) {
                for (const lead of leads) {
                    if (lead.phone && lead.pancake_conversation_id) {
                        leadsByPhone[lead.phone] = lead.pancake_conversation_id;
                    }
                }
            }
        }

        // 3. Format response
        const results = (overdueProducts || []).map((p: any) => {
            const order = Array.isArray(p.order) ? p.order[0] : p.order;
            const customer = Array.isArray(order?.customer) ? order.customer[0] : order?.customer;
            const saleUser = Array.isArray(order?.sales_user) ? order.sales_user[0] : order?.sales_user;
            const services = Array.isArray(p.services) ? p.services : [];
            const primaryService = services[0] || null;
            const technician = Array.isArray(primaryService?.technician) ? primaryService.technician[0] : primaryService?.technician;
            const productImageUrl = Array.isArray(p.images)
                ? p.images[0] || null
                : (typeof p.images === 'string' ? p.images : null);
            const customerPhone = customer?.phone;
            const pancakeId = customerPhone ? leadsByPhone[customerPhone] : null;
            const orderCode = order?.order_code || null;
            const productCode = p.product_code || null;
            const productName = p.name || null;
            const customerName = customer?.name || null;
            const serviceName = primaryService?.item_name || productName;

            return {
                event: 'technical.deadline.overdue',
                order_id: order?.id || null,
                order_code: orderCode,
                hd_code: orderCode,
                invoice_code: orderCode,
                product_id: p.id,
                product_code: productCode,
                sp_code: productCode,
                product_name: productName,
                service_name: serviceName,
                customer_id: customer?.id || null,
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_zalo_user_id: customer?.zalo_user_id || customer?.customer_zalo_user_id || null,
                sale_id: order?.sales_id || null,
                sale_name: saleUser?.name || 'N/A',
                sale_telegram_id: saleUser?.telegram_chat_id || null,
                technician_id: primaryService?.technician_id || null,
                technician_name: technician?.name || null,
                technician_telegram_id: technician?.telegram_chat_id || null,
                due_at: p.due_at,
                deadline_at: p.due_at,
                after_sale_stage: p.after_sale_stage,
                product_image_url: productImageUrl,
                order: {
                    id: order?.id || null,
                    order_code: orderCode,
                    due_at: order?.due_at || null,
                    return_due_at: p.due_at || order?.due_at || null,
                },
                item: {
                    id: p.id,
                    product_code: productCode,
                    product_name: productName,
                    service_name: serviceName,
                    deadline_at: p.due_at,
                    after_sale_stage: p.after_sale_stage,
                },
                customer: {
                    id: customer?.id || null,
                    name: customerName,
                    phone: customerPhone,
                    zalo_user_id: customer?.zalo_user_id || customer?.customer_zalo_user_id || null,
                },
                staff: {
                    sale: saleUser ? {
                        id: saleUser.id,
                        name: saleUser.name,
                        role: saleUser.role || 'sale',
                        telegram_chat_id: saleUser.telegram_chat_id || null,
                    } : null,
                    technician: technician ? {
                        id: technician.id,
                        name: technician.name,
                        telegram_chat_id: technician.telegram_chat_id || null,
                    } : null,
                },
                pancake_link: pancakeId
                    ? `https://pages.pancake.vn/conversations/${pancakeId}`
                    : null,
            };
        });

        res.json({
            status: 'success',
            count: results.length,
            server_time: now,
            data: results,
        });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// GET /api/webhooks/customers/birthdays
// Lấy danh sách khách có sinh nhật trong ngày hôm nay
// ============================================================
router.get('/customers/birthdays', verifyWebhookSecret, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const now = new Date();
        const month = now.getMonth() + 1; // 1-12
        const day = now.getDate();

        // Pad month and day for string matching (dob format: YYYY-MM-DD)
        const monthStr = String(month).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        const pattern = `%-${monthStr}-${dayStr}%`;

        const { data: customers, error } = await supabaseAdmin
            .from('customers')
            .select('id, name, phone, email, dob')
            .like('dob', pattern)
            .eq('status', 'active');

        if (error) {
            throw new ApiError('Lỗi truy vấn sinh nhật: ' + error.message, 500);
        }

        res.json({
            status: 'success',
            count: customers?.length || 0,
            today: `${now.getFullYear()}-${monthStr}-${dayStr}`,
            data: customers || [],
        });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// GET /api/webhooks/health
// Kiểm tra webhook endpoint hoạt động (n8n có thể dùng để test)
// ============================================================
router.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        message: 'Webhook endpoint is active',
        timestamp: new Date().toISOString(),
    });
});

// ============================================================
// Handlers cho từng loại event
// ============================================================

/**
 * Helper: Kiểm tra chuỗi có phải UUID không (nới lỏng — chấp nhận mọi UUID 8-4-4-4-12)
 */
const isUUID = (str: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || '').trim());

/**
 * Helper: Tìm UUID nhân viên dựa trên Họ tên hoặc UUID
 */
async function resolveUserByName(nameOrId?: string | null): Promise<string | null> {
    if (!nameOrId || typeof nameOrId !== 'string') return null;
    const trimmed = nameOrId.trim();
    if (!trimmed) return null;

    // Nếu đã là UUID thì dùng luôn (không bắt buộc tồn tại trong users — n8n đã resolve)
    if (isUUID(trimmed)) return trimmed;

    // Tìm kiếm trong bảng users theo cột name (không phân biệt hoa thường)
    const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .ilike('name', trimmed)
        .limit(1)
        .maybeSingle();

    if (error || !data) {
        console.warn(`[Webhook] Không tìm thấy user với tên: ${trimmed}`);
        return null;
    }

    return data.id;
}

/**
 * Chỉ chấp nhận UUID đã có trong bảng users CRM.
 * Không map được → null (không dùng Pancake ID / tên chung / UUID lạ).
 */
async function resolveCrmUserId(raw: string | null | undefined): Promise<{ id: string | null; name: string | null }> {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return { id: null, name: null };

    if (isUUID(value)) {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('id, name')
            .eq('id', value)
            .maybeSingle();
        if (user) return { id: user.id, name: user.name || null };
        console.warn(`[Webhook] UUID không có trong users CRM — bỏ qua: ${value}`);
        return { id: null, name: null };
    }

    const id = await resolveUserByName(value);
    if (id) return { id, name: value };
    console.warn(`[Webhook] Không map được tên "${value}" → null`);
    return { id: null, name: null };
}

/**
 * Resolve người phụ trách (assigned_to) vs người gửi tin (sender_sale_*).
 * - assigned_to: owner lead hiện tại (UUID CRM)
 * - sender_sale_id: người trực tiếp gửi outbound (UUID CRM)
 * Claim/SLA dùng sender khi outbound; không map được → null.
 */
async function resolveLeadAssignee(opts: {
    assigned_to?: string | null;
    owner_sale?: string | null;
    assigned_to_name?: string | null;
    sender_sale_id?: string | null;
    sender_sale_name?: string | null;
    message_direction?: string | null;
}): Promise<{
    ownerId: string | null;
    ownerName: string | null;
    senderId: string | null;
    senderName: string | null;
    /** Actor dùng cho claim/SLA: ưu tiên sender trên outbound */
    actorId: string | null;
    actorName: string | null;
}> {
    const ownerFromId = await resolveCrmUserId(opts.assigned_to);
    const ownerFromName = !ownerFromId.id
        ? await resolveCrmUserId(opts.assigned_to_name || opts.owner_sale || null)
        : { id: null, name: null };
    const ownerId = ownerFromId.id || ownerFromName.id;
    const ownerName =
        ownerFromId.name
        || (typeof opts.assigned_to_name === 'string' && opts.assigned_to_name.trim())
        || (typeof opts.owner_sale === 'string' && opts.owner_sale.trim())
        || ownerFromName.name
        || null;

    const senderFromId = await resolveCrmUserId(opts.sender_sale_id);
    const senderFromName = !senderFromId.id
        ? await resolveCrmUserId(opts.sender_sale_name || null)
        : { id: null, name: null };
    const senderId = senderFromId.id || senderFromName.id;
    const senderName =
        senderFromId.name
        || (typeof opts.sender_sale_name === 'string' && opts.sender_sale_name.trim())
        || senderFromName.name
        || null;

    const outbound = isOutboundDirection(opts.message_direction);
    // Outbound: actor = người gửi tin; inbound/khác: không dùng sender để claim
    const actorId = outbound ? (senderId || ownerId) : ownerId;
    const actorName = outbound ? (senderName || ownerName) : ownerName;

    return { ownerId, ownerName, senderId, senderName, actorId, actorName };
}

function normalizeMessageActor(lastActor?: string | null, messageDirection?: string | null): 'lead' | 'sale' | undefined {
    const actor = String(lastActor || '').trim().toLowerCase();
    if (actor === 'lead' || actor === 'customer' || actor === 'khach' || actor === 'khách' || actor === 'user' || actor === 'client') {
        return 'lead';
    }
    if (actor === 'sale' || actor === 'agent' || actor === 'staff' || actor === 'page' || actor === 'outbound') {
        return 'sale';
    }

    const dir = String(messageDirection || '').trim().toLowerCase();
    if (dir === 'inbound' || dir === 'in' || dir === 'received') return 'lead';
    if (dir === 'outbound' || dir === 'out' || dir === 'sent') return 'sale';
    return undefined;
}

function isInboundDirection(messageDirection?: string | null): boolean {
    const dir = String(messageDirection || '').trim().toLowerCase();
    return dir === 'inbound' || dir === 'in' || dir === 'received';
}

function isOutboundDirection(messageDirection?: string | null): boolean {
    const dir = String(messageDirection || '').trim().toLowerCase();
    return dir === 'outbound' || dir === 'out' || dir === 'sent';
}

async function emitIntrusionAlert(payload: {
    lead_id: string;
    lead_name?: string | null;
    owner_id: string;
    owner_name: string;
    tele_id_sale?: string | null;
    intruder_id: string;
    intruder_name: string;
    tele_id_vi_pham?: string | null;
}) {
    const link_lead = `${FRONTEND_URL}/leads/${payload.lead_id}`;
    const eventPayload = { ...payload, link_lead };

    // 1) n8n / crm-xoxo webhook
    fireWebhook('INTRUSION_DETECTED', eventPayload);

    // 2) Notification Center (owner + managers)
    try {
        const recipientIds = new Set<string>();
        if (payload.owner_id) recipientIds.add(payload.owner_id);

        const { data: managers } = await supabaseAdmin
            .from('users')
            .select('id')
            .in('role', ['admin', 'manager'])
            .eq('status', 'active');
        (managers || []).forEach((u) => recipientIds.add(u.id));

        if (recipientIds.size > 0) {
            const title = 'Cảnh báo giành khách';
            const message = `${payload.intruder_name} đã nhắn vào lead của ${payload.owner_name}: ${payload.lead_name || payload.lead_id}`;
            await supabaseAdmin.from('notifications').insert(
                Array.from(recipientIds).map((user_id) => ({
                    user_id,
                    type: 'INTRUSION_DETECTED',
                    title,
                    message,
                    data: eventPayload,
                }))
            );
        }
    } catch (err) {
        console.error('[Webhook] Failed to write intrusion notifications:', err);
    }
}

async function handleLeadUpsert(incomingData: any, event?: string) {
    // normalizeN8nLeadPayload tự merge nested `lead` + giữ assigned_to UUID hợp lệ
    const data = normalizeN8nLeadPayload(incomingData);

    const {
        id, name, phone, email, source, company, address, notes, assigned_to, owner_sale, lead_type,
        fb_thread_id, pancake_conversation_id, facebook_name, avatar_url,
        last_message_text, last_message_time, last_actor,
        pancake_customer_id, message_direction, message_id
    } = data;

    const normalizedLastActor = normalizeMessageActor(last_actor, message_direction);
    const effectiveLastMessageTime = last_message_time || new Date().toISOString();
    const saleDisplayName = owner_sale || data.assigned_to_name || null;

    // Thông tin debug để trả về cho n8n đối soát
    const debugInfo = {
        fb_thread_id_received: fb_thread_id || null,
        pancake_conversation_id_received: pancake_conversation_id || null,
        last_actor_received: last_actor || null,
        message_direction_received: message_direction || null,
        message_id_received: message_id || null,
        request_id_received: data.request_id || null,
        page_id_received: data.page_id || null,
        message_time_mapped: last_message_time || data.message_time || null,
        owner_sale_mapped: saleDisplayName || null,
        assigned_to_received: assigned_to || null,
        sender_sale_id_received: data.sender_sale_id || null,
        sender_sale_name_received: data.sender_sale_name || null,
    };

    // 0. Kiểm tra thông tin định danh tối thiểu
    if (!id && !name && !fb_thread_id && !pancake_conversation_id && !phone && !pancake_customer_id) {
        return {
            action: 'skipped',
            reason: 'missing_identifiers',
            message: 'Lead cần có ít nhất tên hoặc thông tin định danh (ID/Phone/FB Thread ID/Pancake ID)',
            skipped: true,
            debug: debugInfo
        };
    }

    // 1. Kiểm tra lead đã tồn tại chưa (Duplicate Check theo ưu tiên)
    // Dùng .limit(1) thay vì .maybeSingle() để tránh lỗi khi có duplicate records
    let existing: any = null;

    // Ưu tiên 0: Theo ID nếu có gửi lên trực tiếp
    if (id) {
        const { data } = await supabaseAdmin
            .from('leads')
            .select('id, assigned_to')
            .eq('id', id)
            .limit(1)
            .single();
        if (data) existing = data;
    }

    // Ưu tiên 1: Theo pancake_conversation_id (ưu tiên nhất vì là ID duy nhất của cuộc hội thoại)
    if (!existing && pancake_conversation_id) {
        const { data } = await supabaseAdmin
            .from('leads')
            .select('id, assigned_to')
            .eq('pancake_conversation_id', pancake_conversation_id)
            .order('created_at', { ascending: true })
            .limit(1);
        if (data && data.length > 0) existing = data[0];
    }

    // Ưu tiên 2: Theo fb_thread_id
    if (!existing && fb_thread_id) {
        const { data } = await supabaseAdmin
            .from('leads')
            .select('id, assigned_to')
            .eq('fb_thread_id', fb_thread_id)
            .order('created_at', { ascending: true })
            .limit(1);
        if (data && data.length > 0) existing = data[0];
    }

    // Ưu tiên 3: Theo phone (fallback)
    if (!existing && phone) {
        const { data } = await supabaseAdmin
            .from('leads')
            .select('id, assigned_to')
            .eq('phone', phone)
            .order('created_at', { ascending: true })
            .limit(1);
        if (data && data.length > 0) existing = data[0];
    }

    // Ưu tiên 4: Theo pancake_customer_id
    if (!existing && pancake_customer_id) {
        const { data } = await supabaseAdmin
            .from('leads')
            .select('id, assigned_to')
            .eq('pancake_customer_id', pancake_customer_id)
            .order('created_at', { ascending: true })
            .limit(1);
        if (data && data.length > 0) existing = data[0];
    }

    if (existing) {
        // Nếu đã tồn tại, chuyển sang update thay vì skip hoàn toàn (hoặc chỉ skip tạo mới)
        console.log(`[Webhook] Lead đã tồn tại (ID: ${existing.id}), chuyển sang update...`);
        // Quan trọng: Phải truyền đúng object data từ n8n vào
        return await handleLeadUpdate({ id: existing.id, ...data });
    }

    // [KIẾM TRA] Theo yêu cầu: Không tạo lead mới khi có tin nhắn, chỉ upsert theo thread (nếu đã tồn tại)
    // Nếu không tìm thấy existing lead mà có thông tin tin nhắn, thì bỏ qua việc tạo mới
    // NHƯNG nếu là tin nhắn inbound từ khách (lead), có thread/conv id rõ ràng thì VẪN phải tạo.
    if (!existing && last_message_text && event !== 'lead.create') {
        const isLeadInbound = normalizedLastActor === 'lead';

        if (!isLeadInbound) {
            console.log(`[Webhook] Không tìm thấy lead cho thread ${fb_thread_id || pancake_conversation_id}, bỏ qua tạo mới theo yêu cầu.`);
            return {
                action: 'skipped',
                reason: 'filtered_as_unknown',
                message: 'Bỏ qua tạo lead mới cho tin nhắn không xác định (Chỉ update nếu thread đã tồn tại)',
                skipped: true,
                debug: debugInfo
            };
        }
    }

    // 2. Resolve assigned_to — chỉ gán owner khi sale reply (hoặc gán tay không kèm tin khách)
    const assignee = await resolveLeadAssignee({
        assigned_to,
        owner_sale: saleDisplayName,
        assigned_to_name: data.assigned_to_name,
        sender_sale_id: data.sender_sale_id,
        sender_sale_name: data.sender_sale_name,
        message_direction,
    });
    let resolvedAssignedTo = assignee.actorId;
    let saleName = assignee.actorName || assignee.senderName || assignee.ownerName;
    if (!resolvedAssignedTo && (assigned_to || data.sender_sale_id)) {
        console.warn(`[Webhook] Create: không resolve được assignee CRM — assigned_to=null`, {
            assigned_to,
            sender_sale_id: data.sender_sale_id || null,
        });
    }

    // Tin khách + UUID trong payload → không claim (tránh stale assignee)
    const createIsSaleReply = normalizedLastActor === 'sale' && !!last_message_text;
    if (resolvedAssignedTo && last_message_text && !createIsSaleReply) {
        console.log(`[Webhook] Create: bỏ assigned_to trên tin khách — lead tạo unassigned`);
        resolvedAssignedTo = null;
    }

    console.log(`[Webhook] Create lead assignee:`, {
        assigned_to,
        sender_sale_id: data.sender_sale_id || null,
        resolvedAssignedTo,
        saleName,
        createIsSaleReply,
        message_id: message_id || null,
        request_id: data.request_id || null,
        page_id: data.page_id || null,
        message_time: data.message_time || last_message_time || null,
    });

    // 3. Tạo Lead mới (với retry logic để xử lý race condition)
    const insertPayload: Record<string, any> = {
        name: name || facebook_name || 'Khách hàng mới',
        phone: phone || null,
        email: email || null,
        source: source || 'n8n',
        company: company || null,
        address: address || null,
        notes: notes || null,
        status: 'new',
        assigned_to: resolvedAssignedTo,
        owner_sale: resolvedAssignedTo ? (saleName || null) : null,
        lead_type: lead_type || 'individual',
        fb_thread_id: fb_thread_id || null,
        pancake_conversation_id: pancake_conversation_id || null,
        pancake_customer_id: pancake_customer_id || null,
        fb_profile_name: facebook_name || null,
        facebook_name: facebook_name || null,
        avatar_url: avatar_url || null,
        last_message_text: last_message_text || null,
        last_message_time: effectiveLastMessageTime,
        last_actor: normalizedLastActor || null,
        assign_state: resolvedAssignedTo ? 'assigned' : 'unassigned'
    };

    // A sale-only create event cannot invent an active customer-response SLA.
    if (createIsSaleReply) {
        insertPayload.assigned_to = null;
        insertPayload.owner_sale = null;
        insertPayload.assign_state = 'unassigned';
        insertPayload.sla_state = 'UNASSIGNED_IDLE';
    }

    const { data: lead, error } = await supabaseAdmin
        .from('leads')
        .insert(insertPayload)
        .select()
        .single();

    // Nếu INSERT lỗi do UNIQUE constraint (race condition), thử tìm lại và update
    if (error) {
        const isDuplicateError = error.message?.includes('unique') ||
            error.message?.includes('duplicate') ||
            error.code === '23505';

        if (isDuplicateError) {
            console.log(`[Webhook] Race condition detected cho thread ${fb_thread_id || pancake_conversation_id}, chuyển sang update...`);

            // Tìm lại lead vừa bị trùng
            let retryExisting: any = null;
            if (pancake_conversation_id) {
                const { data } = await supabaseAdmin.from('leads').select('id, assigned_to')
                    .eq('pancake_conversation_id', pancake_conversation_id).limit(1);
                if (data && data.length > 0) retryExisting = data[0];
            }
            if (!retryExisting && fb_thread_id) {
                const { data } = await supabaseAdmin.from('leads').select('id, assigned_to')
                    .eq('fb_thread_id', fb_thread_id).limit(1);
                if (data && data.length > 0) retryExisting = data[0];
            }

            if (retryExisting) {
                return await handleLeadUpdate({ id: retryExisting.id, ...data });
            }
        }

        throw new ApiError('Lỗi khi tạo lead: ' + error.message, 500);
    }

    // 3. Log sự kiện tạo lead
    await logLeadActivity(lead.id, {
        type: 'lead_created',
        content: `Lead được tạo từ nguồn ${source || 'Pancake'}`,
        userName: 'Hệ thống'
    });

    // 4. Log sự kiện gán Sale nếu có
    if (resolvedAssignedTo) {
        await logLeadActivity(lead.id, {
            type: 'owner_assigned',
            content: `Lead được gán cho ${saleName || resolvedAssignedTo}`,
            userId: resolvedAssignedTo,
            userName: saleName || 'Hệ thống'
        });
    }

    // 5. Log ghi chú ban đầu nếu có
    if (notes) {
        await logLeadActivity(lead.id, {
            type: 'note',
            content: notes,
            userId: resolvedAssignedTo || undefined,
            userName: saleName && !isUUID(saleName) ? saleName : 'n8n'
        });
    }

    // AI fields removed from handleLeadUpsert core flow as per request
    // These will be handled by lead.ai_update event instead

    // 6. Log tin nhắn đầu tiên nếu có
    if (last_message_text) {
        await logLeadMessage(lead.id, {
            content: last_message_text,
            sender_type: normalizedLastActor || 'lead',
            sender_name: normalizedLastActor === 'lead'
                ? (name || facebook_name)
                : (saleName || 'Sale'),
            created_at: effectiveLastMessageTime,
            message_id: message_id || null,
        });
        
        // Trigger SLA — sale claim đã set 60' lúc insert
        if (normalizedLastActor === 'lead') {
            await on_customer_message(lead, {
                inboundAt: resolveLeadCustomerMessageAt(data) ?? undefined,
                messageId: message_id || null,
            });
        } else if (normalizedLastActor === 'sale' && !(createIsSaleReply && resolvedAssignedTo)) {
            await on_sale_message(lead, resolvedAssignedTo as string, saleName || 'Sale', {
                outboundAt: resolveLeadStaffReplyAt(data) ?? undefined,
                messageId: message_id || null,
            });
        }
    } else if (resolvedAssignedTo) {
        // Mới gán Sale, chưa nhắn tin -> Rule 1 kích hoạt 3 phút
        await on_lead_assigned(lead.id, resolvedAssignedTo as string);
    }

    notifyCrmMaster('lead.created', { lead: enrichLeadSlaFields(lead) });

    return {
        action: 'created',
        lead: enrichLeadSlaFields(lead)
    };
}

async function handleLeadUpdate(incomingData: any) {
    const data = normalizeN8nLeadPayload(incomingData);
    const {
        id,
        phone: incomingPhone,
        fb_thread_id,
        pancake_conversation_id,
        pancake_customer_id,
        last_message_text,
        last_message_time,
        last_actor: rawLastActor,
        status,
        pipeline_stage: _ignored_stage, // Luôn bỏ qua pipeline_stage vì sale cập nhật thủ công
        assigned_to,
        owner_sale, // Tên sale từ n8n (đã map từ assigned_to_name)
        assign_state, // Bôi đậm trạng thái gán
        message_direction, // Không phải cột DB
        message_id,
        lead: _ignored_lead, // Bỏ qua key "lead" để không bị nhầm là cột database
        t_last_message: _ignored_t1, // Bỏ key rác từ n8n
        tags: _ignored_tags, // Bỏ key rác chưa hỗ trợ
        ...otherFields
    } = data;

    const inboundMessageAt = resolveLeadCustomerMessageAt(data);
    const outboundReplyAt = resolveLeadStaffReplyAt(data);
    const effectiveLastMessageTime = last_message_time || outboundReplyAt || inboundMessageAt || new Date().toISOString();
    const saleDisplayName = owner_sale || data.assigned_to_name || null;

    // Log để kiểm tra dữ liệu nhận được từ n8n (Debug)
    console.log(`[Webhook] Update Lead ID: ${id || data.id}, Phone: ${incomingPhone || data.phone}, last_actor=${rawLastActor}, last_message_time=${effectiveLastMessageTime}`);

    // 1. Tìm leadId
    let leadId = id;
    let currentLead: any = null;
    const leadSlaSelect = 'id, assigned_to, name, facebook_name, created_at, round_index, t_last_inbound, t_last_outbound, current_deadline_at, current_rule_index, sla_state, owner_sale, pipeline_stage';

    if (!leadId) {
        // Search by fb_thread_id first
        if (fb_thread_id) {
            const { data: found } = await supabaseAdmin.from('leads')
                .select(leadSlaSelect)
                .eq('fb_thread_id', fb_thread_id)
                .maybeSingle();
            if (found) {
                leadId = found.id;
                currentLead = found;
            }
        }

        // Fallback to pancake_conversation_id
        if (!leadId && pancake_conversation_id) {
            const { data: found } = await supabaseAdmin.from('leads')
                .select(leadSlaSelect)
                .eq('pancake_conversation_id', pancake_conversation_id)
                .maybeSingle();
            if (found) {
                leadId = found.id;
                currentLead = found;
            }
        }

        // Fallback to pancake_customer_id
        if (!leadId && data.pancake_customer_id) {
            const { data: found } = await supabaseAdmin.from('leads')
                .select(leadSlaSelect)
                .eq('pancake_customer_id', data.pancake_customer_id)
                .maybeSingle();
            if (found) {
                leadId = found.id;
                currentLead = found;
            }
        }

        // Fallback to phone
        if (!leadId && data.phone) {
            const { data: found } = await supabaseAdmin.from('leads')
                .select(leadSlaSelect)
                .eq('phone', data.phone)
                .maybeSingle();
            if (found) {
                leadId = found.id;
                currentLead = found;
            }
        }
    }

    if (!leadId) {
        throw new ApiError('Không tìm thấy lead để cập nhật', 404);
    }

    // 2. Lấy thông tin hiện tại nếu chưa có (để check ownership)
    if (!currentLead) {
        const { data: found } = await supabaseAdmin
            .from('leads')
            .select(leadSlaSelect)
            .eq('id', leadId)
            .single();
        currentLead = found;
    }

    if (!currentLead) {
        throw new ApiError('Không tìm thấy bản ghi hiện tại của lead để cập nhật', 404);
    }

    // 3. Chuẩn bị dữ liệu update (Lọc bỏ các giá trị null hoặc rỗng để tránh ghi đè dữ liệu cũ)
    const updateData: any = {
        updated_at: new Date().toISOString(),
    };

    const addIfValid = (key: string, value: any) => {
        if (value !== undefined && value !== null && value !== "") {
            updateData[key] = value;
        }
    };

    // Các trường định danh và meta quan trọng
    addIfValid('phone', incomingPhone);
    addIfValid('fb_thread_id', fb_thread_id);
    addIfValid('pancake_conversation_id', pancake_conversation_id);
    addIfValid('pancake_customer_id', pancake_customer_id);
    addIfValid('status', status);

    // Lọc bỏ danh sách các cột tuyệt đối không cho phép update bừa bãi
    // Ownership (assigned_to / owner_sale / assign_state) CHỈ set qua logic bên dưới
    const BANNED_KEYS = [
        'id', 'created_at', 'current_rule_index', 'current_deadline_at', 'last_valid_followup_at',
        'sla_state', 't_last_inbound', 't_last_outbound', 'appointment_reminded_at', 'round_index',
        'assigned_to', 'owner_sale', 'assign_state',
        ...N8N_LEAD_NON_DB_KEYS,
    ];
    
    Object.keys(otherFields).forEach(key => {
        if (key !== 'notes' && key !== 'lead' && !BANNED_KEYS.includes(key)) {
            // Check an toàn: chỉ cho phép lấy các giá trị scalar
            if (typeof otherFields[key] !== 'object') {
                addIfValid(key, otherFields[key]);
            }
        }
    });

    // Appointment fields do not control the official owner/SLA state machine.

    let effectiveLastActor = normalizeMessageActor(rawLastActor, message_direction);
    let saleSlaHandledInCoreUpdate = false;

    const assignee = await resolveLeadAssignee({
        assigned_to,
        owner_sale: saleDisplayName,
        assigned_to_name: data.assigned_to_name,
        sender_sale_id: data.sender_sale_id,
        sender_sale_name: data.sender_sale_name,
        message_direction,
    });
    let resolvedIncomingId = assignee.actorId;
    let resolvedIncomingName = assignee.actorName || assignee.senderName || assignee.ownerName;

    // Không fallback UUID lạ / Pancake ID — chỉ UUID đã verify trong users
    if (!resolvedIncomingId && (assigned_to || data.sender_sale_id)) {
        console.warn(`[Webhook] Không resolve được assignee CRM — giữ assigned_to=null`, {
            assigned_to,
            sender_sale_id: data.sender_sale_id || null,
            sender_sale_name: data.sender_sale_name || null,
        });
    }

    const hasIncomingSale = !!(
        resolvedIncomingId
        || saleDisplayName
        || assignee.senderId
        || assignee.ownerId
        || data.sender_sale_id
        || data.sender_sale_name
    );
    const leadHasOwner = !!(currentLead.assigned_to && String(currentLead.assigned_to).trim());

    console.log(`[Webhook] Ownership check lead=${leadId}`, {
        payload_assigned_to: assigned_to,
        sender_sale_id: data.sender_sale_id || null,
        sender_sale_name: data.sender_sale_name || null,
        message_id: message_id || null,
        request_id: data.request_id || null,
        page_id: data.page_id || null,
        message_time: data.message_time || last_message_time || null,
        resolvedIncomingId,
        resolvedIncomingName,
        current_assigned_to: currentLead.assigned_to,
        last_actor: effectiveLastActor,
        leadHasOwner,
    });

    if (hasIncomingSale && last_message_text) {
        if (isOutboundDirection(message_direction)) {
            effectiveLastActor = 'sale';
        } else if (!isInboundDirection(message_direction) && effectiveLastActor === 'sale') {
            effectiveLastActor = 'sale';
        }
    }

    // ——— Ownership rules ———
    // Claim hợp lệ = tin SALE đang reply (không claim từ tin khách / sync còn kèm UUID cũ)
    const isValidSaleClaimReply = !!(
        effectiveLastActor === 'sale'
        && last_message_text
        && resolvedIncomingId
    );
    let skipIntrusionMessageSla = false;

    // n8n cannot decide owner/SLA transitions. This payload is descriptive only.
    if (!hasIncomingSale && assign_state === 'unassigned' && (assigned_to === null || assigned_to === undefined)) {
        delete updateData.assigned_to;
        delete updateData.assign_state;
        delete updateData.owner_sale;
    }
    // 2. Lead CHƯA có owner — CHỈ gán khi sale rep hợp lệ đầu tiên → ĐỢI KHÁCH 60'
    else if (!leadHasOwner && isValidSaleClaimReply) {
        // Persist the message first; state machine claims with deadline/version checks.
        delete updateData.assigned_to;
        delete updateData.assign_state;
        delete updateData.owner_sale;
        saleSlaHandledInCoreUpdate = false;
    }
    // 2b. Lead chưa owner nhưng payload còn UUID + tin khách/sync → BỎ QUA ownership (tránh re-bind sau revoke)
    else if (!leadHasOwner && resolvedIncomingId && !isValidSaleClaimReply) {
        console.log(`[Webhook] Skip assign UUID trên lead chưa owner (actor=${effectiveLastActor || 'n/a'}) — chờ sale reply hợp lệ`);
    }
    // 3. Lead ĐÃ có owner — không overwrite; sale khác + last_actor=sale → INTRUSION
    else if (leadHasOwner && resolvedIncomingId) {
        if (resolvedIncomingId !== currentLead.assigned_to) {
            const { data: usersData } = await supabaseAdmin
                .from('users')
                .select('id, name, telegram_chat_id')
                .in('id', [currentLead.assigned_to, resolvedIncomingId]);

            const ownerUser = usersData?.find(u => u.id === currentLead.assigned_to);
            const ownerTele = ownerUser?.telegram_chat_id;
            const ownerName = ownerUser?.name || currentLead.owner_sale || 'Ẩn danh';
            const intruderTele = usersData?.find(u => u.id === resolvedIncomingId)?.telegram_chat_id;
            const intruderName = resolvedIncomingName || saleDisplayName || 'Sale khác';

            // Chỉ cảnh báo khi đúng là sale đang nhắn
            if (effectiveLastActor === 'sale' && last_message_text) {
                await emitIntrusionAlert({
                    lead_id: leadId,
                    lead_name: currentLead.name || currentLead.facebook_name,
                    owner_id: currentLead.assigned_to,
                    owner_name: ownerName,
                    tele_id_sale: ownerTele,
                    intruder_id: resolvedIncomingId,
                    intruder_name: intruderName,
                    tele_id_vi_pham: intruderTele,
                });

                await logLeadActivity(leadId, {
                    type: 'note',
                    content: `[Cảnh báo vi phạm] ${intruderName} đã nhắn tin: ${last_message_text}`,
                    userName: 'Hệ thống'
                });

                // Không đổi owner / không reset timer / không ghi tin như khách
                skipIntrusionMessageSla = true;
                effectiveLastActor = undefined;
            }
        } else if (resolvedIncomingName) {
            updateData.owner_sale = resolvedIncomingName;
        }
    } else if (leadHasOwner && resolvedIncomingName && !resolvedIncomingId) {
        updateData.owner_sale = resolvedIncomingName;
    }

    // Cập nhật thông tin tin nhắn cuối và SLA
    if (last_message_text && effectiveLastActor !== undefined) {
        updateData.last_message_text = last_message_text;
        updateData.last_message_time = effectiveLastMessageTime;
        updateData.last_actor = effectiveLastActor;

        if (effectiveLastActor === 'lead') {
            await logLeadActivity(leadId, {
                type: 'customer_message',
                content: last_message_text,
                userName: currentLead.name || currentLead.facebook_name || 'Khách hàng'
            });
        } else if (effectiveLastActor === 'sale') {
            await logLeadActivity(leadId, {
                type: 'sale_reply',
                content: last_message_text,
                userName: resolvedIncomingName || currentLead.owner_sale || 'Sale'
            });
        }
    }

    console.log(`[Webhook] updateData ownership fields:`, {
        assigned_to: updateData.assigned_to,
        assign_state: updateData.assign_state,
        owner_sale: updateData.owner_sale,
    });

    let { data: lead, error } = await supabaseAdmin
        .from('leads')
        .update(updateData)
        .eq('id', leadId)
        .select()
        .single();

    if (error) {
        // FK fail khi UUID không có trong users → vẫn cố gán owner_sale + assign_state, bỏ assigned_to
        const isFkError = String(error.message || '').toLowerCase().includes('foreign key')
            || error.code === '23503';
        if (isFkError && updateData.assigned_to) {
            console.error(`[Webhook] FK assigned_to thất bại (${updateData.assigned_to}), thử lại không FK:`, error.message);
            const retryPayload = { ...updateData };
            delete retryPayload.assigned_to;
            // Không set assigned nếu FK fail — nhưng log rõ
            const retry = await supabaseAdmin
                .from('leads')
                .update(retryPayload)
                .eq('id', leadId)
                .select()
                .single();
            if (retry.error) {
                throw new ApiError('Lỗi khi cập nhật lead: ' + retry.error.message, 500);
            }
            lead = retry.data;
            throw new ApiError(
                `assigned_to UUID ${updateData.assigned_to} không tồn tại trong users — không gán được người phụ trách`,
                400
            );
        }
        throw new ApiError('Lỗi khi cập nhật lead: ' + error.message, 500);
    }

    // 4. Lưu ghi chú vào lịch sử hoạt động nếu có
    const notesFromData = data.notes;
    if (notesFromData && notesFromData !== "") {
        await logLeadActivity(leadId, {
            type: 'note',
            content: notesFromData,
            userId: currentLead?.assigned_to || undefined,
            userName: 'n8n'
        });
    }

    // 5. Lưu lịch sử tin nhắn
    // Intrusion: không ghi lead_messages (tránh cron restore 3') — đã log activity ở trên
    // Không default actor thiếu thành 'lead' (tránh cron tưởng khách nhắn → reset 3')
    if (last_message_text && !skipIntrusionMessageSla && effectiveLastActor) {
        const logged = await logLeadMessage(leadId, {
            content: last_message_text,
            sender_type: effectiveLastActor,
            sender_name: effectiveLastActor === 'lead'
                ? (currentLead?.name || currentLead?.facebook_name)
                : (resolvedIncomingName || saleDisplayName || currentLead?.owner_sale || 'Sale'),
            created_at: effectiveLastMessageTime,
            message_id: message_id || null,
        });

        // Tin trùng message_id → không đụng SLA (tránh reset 60'→3' khi n8n gửi lại)
        if (logged === false) {
            console.log(`[Webhook] Skip SLA update for duplicate message on lead ${leadId}`);
        } else if (effectiveLastActor === 'lead') {
            await on_customer_message(lead, {
                inboundAt: inboundMessageAt || effectiveLastMessageTime,
                messageId: message_id || null,
            });
        } else if (effectiveLastActor === 'sale' && !saleSlaHandledInCoreUpdate) {
            const saleName = resolvedIncomingName || saleDisplayName || currentLead.owner_sale || 'Sale';
            const resolvedId = resolvedIncomingId || lead.assigned_to || currentLead.assigned_to || null;
            await on_sale_message(lead, resolvedId, saleName, {
                outboundAt: outboundReplyAt || effectiveLastMessageTime,
                messageId: message_id || null,
            });
        }
    } else if (last_message_text && !effectiveLastActor && !skipIntrusionMessageSla) {
        console.log(`[Webhook] Skip lead_messages/SLA: thiếu last_actor/direction cho lead ${leadId}`);
    }


    const enrichedLead = enrichLeadSlaFields(lead);
    notifyCrmMaster('lead.updated', { lead: enrichedLead });

    return {
        action: 'updated',
        lead: enrichedLead
    };
}

/**
 * Event: lead.ai_update
 * Chuyên trách cập nhật các field AI để tách biệt khỏi luồng ghi lead lõi
 */
async function handleLeadAIUpdate(data: any) {
    const {
        id, phone, fb_thread_id, pancake_conversation_id, pancake_customer_id,
        ai_suggested_reply, lead_score, loss_risk, next_action, customer_insight
    } = data;

    // 1. Tìm Lead (Helper lookup)
    let leadId = id;
    if (!leadId) {
        // Tìm ID dựa trên thông tin định danh
        const lookupFields = { id, phone, fb_thread_id, pancake_conversation_id, pancake_customer_id };
        for (const [key, val] of Object.entries(lookupFields)) {
            if (val) {
                const { data: found } = await supabaseAdmin.from('leads').select('id').eq(key, val).maybeSingle();
                if (found) {
                    leadId = found.id;
                    break;
                }
            }
        }
    }

    if (!leadId) {
        return {
            action: 'skipped',
            reason: 'lead_not_found',
            message: 'Không tìm thấy lead để cập nhật thông tin AI',
            skipped: true
        };
    }

    // 2. Chuẩn bị dữ liệu update AI
    const updateData: any = { updated_at: new Date().toISOString() };
    const addIfValid = (key: string, value: any) => {
        if (value !== undefined && value !== null && value !== "") updateData[key] = value;
    };

    addIfValid('ai_suggested_reply', ai_suggested_reply);
    addIfValid('lead_score', lead_score);
    addIfValid('loss_risk', loss_risk);
    addIfValid('next_action', next_action);
    addIfValid('customer_insight', customer_insight);

    if (Object.keys(updateData).length <= 1) {
        return {
            action: 'skipped',
            reason: 'no_ai_data',
            message: 'Không có thông tin AI nào để cập nhật',
            skipped: true
        };
    }

    // 3. Thực thi update
    const { data: lead, error } = await supabaseAdmin
        .from('leads')
        .update(updateData)
        .eq('id', leadId)
        .select()
        .single();

    if (error) throw new ApiError('Lỗi cập nhật AI: ' + error.message, 500);

    notifyCrmMaster('lead.ai_updated', { lead });

    // 4. Log hoạt động AI
    if (ai_suggested_reply) {
        await logLeadActivity(leadId, {
            type: 'ai_suggestion',
            content: ai_suggested_reply,
            userName: 'AI Assistant'
        });
    }

    return {
        status: 'success',
        action: 'updated_ai',
        lead_id: leadId
    };
}

/**
 * Helper: Lưu lịch sử tin nhắn vào bảng lead_messages
 * @returns true nếu insert mới, false nếu duplicate/skip, undefined nếu lỗi
 */
async function logLeadMessage(leadId: string, messageData: any): Promise<boolean | undefined> {
    try {
        const { content, sender_type, sender_name, created_at, message_id, message_type, metadata } = messageData;

        // Tránh ghi trùng nếu n8n gửi lại cùng message_id
        if (message_id) {
            const { data: existing } = await supabaseAdmin
                .from('lead_messages')
                .select('id')
                .eq('lead_id', leadId)
                .eq('message_id', message_id)
                .limit(1)
                .maybeSingle();
            if (existing) {
                console.log(`[Webhook] Skip duplicate lead_message mid=${message_id}`);
                return false;
            }
        }

        await supabaseAdmin
            .from('lead_messages')
            .insert({
                lead_id: leadId,
                content,
                sender_type,
                sender_name: sender_name || null,
                message_id: message_id || null,
                message_type: message_type || 'text',
                metadata: metadata || {},
                created_at: created_at || new Date().toISOString()
            });
        return true;
    } catch (err) {
        console.error('[Webhook] Lỗi khi lưu lead_messages:', err);
        return undefined;
    }
}

async function handleCustomerCreate(data: any) {
    const { name, phone, email, company, address, source, type } = data;

    if (!name || !phone) {
        throw new ApiError('Customer cần có ít nhất "name" và "phone"', 400);
    }

    // Kiểm tra customer đã tồn tại chưa
    const { data: existing } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

    if (existing) {
        return { message: 'Customer với số điện thoại này đã tồn tại', customer_id: existing.id, skipped: true };
    }

    const { data: customer, error } = await supabaseAdmin
        .from('customers')
        .insert({
            name,
            phone,
            email: email || null,
            company: company || null,
            address: address || null,
            source: source || 'n8n',
            type: type || 'individual',
            status: 'active',
        })
        .select()
        .single();

    if (error) {
        throw new ApiError('Lỗi khi tạo customer: ' + error.message, 500);
    }

    notifyCrmMaster('customer.created', { customer });

    return { customer };
}

async function handleOrderCreate(data: any) {
    const { customer_id, customer_phone, items, notes, total_amount, status } = data;

    let finalCustomerId = customer_id;

    // Tìm customer bằng phone nếu không có customer_id
    if (!finalCustomerId && customer_phone) {
        const { data: customer } = await supabaseAdmin
            .from('customers')
            .select('id')
            .eq('phone', customer_phone)
            .maybeSingle();

        if (customer) {
            finalCustomerId = customer.id;
        }
    }

    if (!finalCustomerId) {
        throw new ApiError('Cần có "customer_id" hoặc "customer_phone" hợp lệ', 400);
    }

    const { data: order, error } = await supabaseAdmin
        .from('orders')
        .insert({
            customer_id: finalCustomerId,
            notes: notes || null,
            total_amount: total_amount || 0,
            status: status || 'before_sale',
            source: 'n8n',
        })
        .select()
        .single();

    if (error) {
        throw new ApiError('Lỗi khi tạo order: ' + error.message, 500);
    }

    notifyCrmMaster('order.created', { order });

    return { order };
}

/**
 * Helper: Lưu lịch sử hoạt động vào bảng lead_activities
 */
async function logLeadActivity(leadId: string, activityData: {
    type: string;
    content: string;
    userId?: string;
    userName?: string;
    metadata?: any;
}) {
    try {
        const { type, content, userId, userName, metadata } = activityData;

        await supabaseAdmin
            .from('lead_activities')
            .insert({
                lead_id: leadId,
                activity_type: type,
                content: content,
                created_by: userId || null,
                created_by_name: userName || 'Hệ thống',
                metadata: metadata || {},
                created_at: new Date().toISOString()
            });
    } catch (err) {
        console.error('[Webhook] Lỗi khi lưu lead_activities:', err);
    }
}

/**
 * Event: lead.sale_memory_update
 * Cập nhật 'sale_memory' khi Sale tương tác với Lead
 * Dùng để đồng bộ hóa response cho n8n branch/debug
 */
async function handleLeadSaleMemoryUpdate(data: any) {
    const {
        id, phone, fb_thread_id, pancake_conversation_id, pancake_customer_id,
        sale_memory, has_important_ops_info,
        quoted_price_last, quoted_service, appointment_time, delivery_method,
        deposit_info, eta_note, sale_note_summary
    } = data;

    // 1. Tìm Lead (Dùng helper lookup giống handleLeadAIUpdate)
    let leadId = id;
    if (!leadId) {
        const lookupFields = { id, phone, fb_thread_id, pancake_conversation_id, pancake_customer_id };
        for (const [key, val] of Object.entries(lookupFields)) {
            if (val) {
                const { data: found } = await supabaseAdmin.from('leads').select('id').eq(key, val).maybeSingle();
                if (found) {
                    leadId = found.id;
                    break;
                }
            }
        }
    }

    if (!leadId) {
        return {
            action: 'skipped',
            reason: 'lead_not_found',
            message: 'Không tìm thấy lead để cập nhật sale memory',
            skipped: true
        };
    }

    // 2. Kiểm tra nếu không có thông tin vận hành quan trọng thì bỏ qua theo yêu cầu
    if (has_important_ops_info === false) {
        return {
            action: 'skipped',
            reason: 'no_important_ops_info',
            message: 'Không có thông tin vận hành quan trọng để lưu',
            skipped: true
        };
    }

    // 3. Chuẩn bị dữ liệu update
    const updateData: any = {
        updated_at: new Date().toISOString()
    };

    const addIfValid = (key: string, value: any) => {
        if (value !== undefined && value !== null && value !== "") {
            updateData[key] = value;
        }
    };

    addIfValid('sale_memory', sale_memory);
    addIfValid('quoted_price_last', quoted_price_last);
    addIfValid('quoted_service', quoted_service);
    addIfValid('appointment_time', appointment_time);
    addIfValid('delivery_method', delivery_method);
    addIfValid('deposit_info', deposit_info);
    addIfValid('eta_note', eta_note);
    addIfValid('sale_note_summary', sale_note_summary);

    // Appointment fields do not pause the official follow-up SLA.

    // 4. Thực thi update
    const { error } = await supabaseAdmin
        .from('leads')
        .update(updateData)
        .eq('id', leadId);

    if (error) {
        throw new ApiError('Lỗi cập nhật sale memory: ' + error.message, 500);
    }

    // 5. Log activity nếu có sale_memory mới
    if (sale_memory || sale_note_summary) {
        await logLeadActivity(leadId, {
            type: 'note',
            content: `[Sale Memory Update] ${sale_note_summary || sale_memory}`,
            userName: 'Hệ thống'
        });
    }

    return {
        status: 'success',
        action: 'updated_sale_memory',
        lead_id: leadId
    };
}

// ============================================================
// Log webhook events (optional - cần tạo bảng webhook_logs)
// ============================================================
async function logWebhookEvent(
    event: string,
    data: any,
    status: string = 'received',
    errorMessage?: string
) {
    try {
        await supabaseAdmin
            .from('webhook_logs')
            .insert({
                event,
                payload: data,
                status,
                error_message: errorMessage || null,
                source: 'n8n',
                created_at: new Date().toISOString(),
            });
    } catch (err) {
        // Nếu bảng webhook_logs chưa tồn tại, chỉ log ra console
        console.log(`[Webhook Log] Event: ${event}, Status: ${status}`, errorMessage || '');
    }
}

export default router;
