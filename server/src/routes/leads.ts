import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireSale } from '../middleware/auth.js';
import { autoLogKpiViolation } from '../utils/kpiViolationLogger.js';
import { notifyCrmMaster } from '../utils/webhookNotifier.js';

const router = Router();

/** Chuỗi rỗng → null để tránh vi phạm unique index trên cột optional */
function optionalText(value: unknown): string | null {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
}

function isFbThreadIdDuplicateError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    if (error.code === '23505') {
        const msg = (error.message || '').toLowerCase();
        return msg.includes('fb_thread_id') || msg.includes('idx_leads_fb_thread_id');
    }
    return false;
}

async function assertUniqueFbThreadId(fbThreadId: string | null): Promise<void> {
    if (!fbThreadId) return;
    const { data: existing } = await supabaseAdmin
        .from('leads')
        .select('id, name')
        .eq('fb_thread_id', fbThreadId)
        .maybeSingle();
    if (existing) {
        throw new ApiError(
            `Mã hội thoại (Thread ID) đã được dùng cho lead "${existing.name}". Vui lòng kiểm tra lại hoặc để trống.`,
            409
        );
    }
}

// Get all leads
router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { status, source, assigned_to, search, page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = supabaseAdmin
            .from('leads')
            .select('*, assigned_user:users!leads_assigned_to_fkey(id, name, email)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        const userRole = req.user!.role;

        // Sale: chỉ xem lead chưa phân công hoặc lead do chính mình phụ trách
        if (userRole === 'sale') {
            query = query.or(`assigned_to.eq.${req.user!.id},assigned_to.is.null`);
        } else if (userRole === 'admin' || userRole === 'manager') {
            if (assigned_to) {
                query = query.eq('assigned_to', assigned_to);
            }
        } else {
            query = query.eq('assigned_to', req.user!.id);
        }

        if (status) query = query.eq('status', status);
        if (source) query = query.eq('source', source);
        if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

        const { data: leads, error, count } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách leads', 500);
        }

        res.json({
            status: 'success',
            data: {
                leads,
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

// Get lead by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: lead, error } = await supabaseAdmin
            .from('leads')
            .select('*, assigned_user:users!leads_assigned_to_fkey(id, name, email)')
            .eq('id', id)
            .single();

        if (error || !lead) {
            throw new ApiError('Không tìm thấy lead', 404);
        }

        res.json({
            status: 'success',
            data: { lead },
        });
    } catch (error) {
        next(error);
    }
});

// Create lead
router.post('/', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const {
            name, phone, email, source, company, address, notes, assigned_to,
            dob, fb_thread_id, fb_profile_pic, fb_link, link_message,
            appointment_time, lead_type, delivery_method, tracking_code, shipping_fee
        } = req.body;

        if (!name || !phone) {
            throw new ApiError('Tên và số điện thoại là bắt buộc', 400);
        }

        const normalizedFbThreadId = optionalText(fb_thread_id);
        await assertUniqueFbThreadId(normalizedFbThreadId);

        const { data: lead, error } = await supabaseAdmin
            .from('leads')
            .insert({
                name: String(name).trim(),
                phone: String(phone).trim(),
                email: optionalText(email),
                source: source || 'other',
                company: optionalText(company),
                address: optionalText(address),
                notes: optionalText(notes),
                // Default to the first pipeline stage used by the CRM UI
                status: 'xac_dinh_nhu_cau',
                pipeline_stage: 'xac_dinh_nhu_cau',
                assigned_to: assigned_to || req.user!.id,
                created_by: req.user!.id,
                dob: optionalText(dob),
                fb_thread_id: normalizedFbThreadId,
                fb_profile_pic: optionalText(fb_profile_pic),
                fb_link: optionalText(fb_link),
                link_message: optionalText(link_message),
                appointment_time: appointment_time || null,
                lead_type: lead_type || 'individual',
                delivery_method: delivery_method || null,
                tracking_code: optionalText(tracking_code),
                shipping_fee: shipping_fee || 0,
            })
            .select()
            .single();

        if (error) {
            if (isFbThreadIdDuplicateError(error)) {
                throw new ApiError(
                    'Mã hội thoại (Thread ID) đã được dùng cho lead khác. Vui lòng kiểm tra lại hoặc để trống.',
                    409
                );
            }
            throw new ApiError('Lỗi khi tạo lead: ' + error.message, 500);
        }

        notifyCrmMaster('lead.created', { lead });

        res.status(201).json({
            status: 'success',
            data: { lead },
        });
    } catch (error) {
        next(error);
    }
});

// Update lead
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { name, phone, email, source, company, address, notes, status, assigned_to, pipeline_stage, dob, delivery_method, tracking_code, shipping_fee } = req.body;

        // Get current lead to check for status change and assigned_to change
        const { data: currentLead } = await supabaseAdmin
            .from('leads')
            .select('status, pipeline_stage, assigned_to')
            .eq('id', id)
            .single();

        const oldStatus = currentLead?.status || currentLead?.pipeline_stage;
        const oldAssignedTo = currentLead?.assigned_to;
        const newStatus = status || pipeline_stage;

        const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (source) updateData.source = source;
        if (company !== undefined) updateData.company = company;
        if (address !== undefined) updateData.address = address;
        if (notes !== undefined) updateData.notes = notes;
        if (status) updateData.status = status;
        if (pipeline_stage) updateData.pipeline_stage = pipeline_stage;
        if (assigned_to) updateData.assigned_to = assigned_to;
        if (dob !== undefined) updateData.dob = dob;
        if (req.body.fb_link !== undefined) updateData.fb_link = req.body.fb_link;
        if (req.body.fb_profile_name !== undefined) updateData.fb_profile_name = req.body.fb_profile_name;
        if (req.body.fb_profile_pic !== undefined) updateData.fb_profile_pic = req.body.fb_profile_pic;
        if (req.body.avatar_url !== undefined) updateData.avatar_url = req.body.avatar_url;
        if (req.body.next_followup_time !== undefined) updateData.next_followup_time = req.body.next_followup_time;
        if (req.body.care_note !== undefined) updateData.care_note = req.body.care_note;
        if (req.body.lead_score !== undefined) updateData.lead_score = req.body.lead_score;
        if (req.body.loss_risk !== undefined) updateData.loss_risk = req.body.loss_risk;
        if (req.body.next_action !== undefined) updateData.next_action = req.body.next_action;
        if (req.body.customer_insight !== undefined) updateData.customer_insight = req.body.customer_insight;
        if (req.body.note !== undefined) updateData.note = req.body.note;
        if (req.body.sale_memory !== undefined) updateData.sale_memory = req.body.sale_memory;
        if (delivery_method !== undefined) updateData.delivery_method = delivery_method;
        if (tracking_code !== undefined) updateData.tracking_code = tracking_code;
        if (shipping_fee !== undefined) updateData.shipping_fee = shipping_fee;

        // SLA Shield: Pause SLA if appointment_time is updated
        if (req.body.appointment_time !== undefined) {
            updateData.appointment_time = req.body.appointment_time;
            if (req.body.appointment_time) {
                updateData.sla_state = 'PAUSED_APPOINTMENT';
            }
        }

        // SLA Shield: Pause SLA if next_followup_time is updated
        if (req.body.next_followup_time !== undefined) {
            updateData.next_followup_time = req.body.next_followup_time;
            if (req.body.next_followup_time) {
                updateData.sla_state = 'PAUSED_APPOINTMENT';
            }
        }

        const { data: lead, error } = await supabaseAdmin
            .from('leads')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật lead', 500);
        }

        // Log status change activity if status changed
        if (newStatus && oldStatus !== newStatus) {
            await supabaseAdmin.from('lead_activities').insert({
                lead_id: id,
                activity_type: 'status_change',
                old_status: oldStatus,
                new_status: newStatus,
                created_by: req.user?.id,
            });
        }

        if (
            assigned_to !== undefined &&
            oldAssignedTo &&
            assigned_to !== oldAssignedTo
        ) {
            await autoLogKpiViolation({
                employeeId: oldAssignedTo,
                relatedLeadId: id,
                ruleCode: 'lead_reclaimed',
                ruleName: assigned_to 
                    ? 'Thu hồi Lead (Manager chuyển giao)'
                    : 'Thu hồi Lead (Manager gỡ phân công)',
                deductPoint: 0,
                note: `Lead được chuyển từ sale cũ bởi ${(req as any).user?.name || (req as any).user?.id || 'unknown'}`
            });
        }

        notifyCrmMaster('lead.updated', { lead });

        res.json({
            status: 'success',
            data: { lead },
        });
    } catch (error) {
        next(error);
    }
});

// Delete lead
router.delete('/:id', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('leads')
            .delete()
            .eq('id', id);

        if (error) {
            throw new ApiError('Lỗi khi xóa lead', 500);
        }

        res.json({
            status: 'success',
            message: 'Đã xóa lead',
        });
    } catch (error) {
        next(error);
    }
});

// Convert lead to customer
router.post('/:id/convert', authenticate, requireSale, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Lấy thông tin lead
        const { data: lead, error: leadError } = await supabaseAdmin
            .from('leads')
            .select('*')
            .eq('id', id)
            .single();

        if (leadError || !lead) {
            throw new ApiError('Không tìm thấy lead', 404);
        }

        // Kiểm tra nếu lead đã được convert
        if (lead.customer_id) {
            // Lead đã được convert, chỉ trả về customer hiện tại
            const { data: existingCustomer } = await supabaseAdmin
                .from('customers')
                .select('*')
                .eq('id', lead.customer_id)
                .single();

            return res.json({
                status: 'success',
                data: { customer: existingCustomer },
                message: 'Lead đã được chuyển đổi trước đó',
            });
        }

        // Kiểm tra customer đã tồn tại với số điện thoại này chưa
        const { data: existingByPhone } = await supabaseAdmin
            .from('customers')
            .select('*')
            .eq('phone', lead.phone)
            .maybeSingle();

        let customer;

        if (existingByPhone) {
            // Đã có customer với số điện thoại này, chỉ link lead vào
            customer = existingByPhone;
        } else {
            // Tạo customer mới từ lead
            const { data: newCustomer, error: customerError } = await supabaseAdmin
                .from('customers')
                .insert({
                    name: lead.name,
                    phone: lead.phone,
                    email: lead.email,
                    company: lead.company,
                    address: lead.address,
                    source: lead.source,
                    type: lead.company ? 'company' : 'individual',
                    status: 'active',
                    assigned_to: lead.assigned_to,
                    created_by: req.user!.id,
                    lead_id: lead.id,
                    dob: lead.dob,
                })
                .select()
                .single();

            if (customerError) {
                throw new ApiError('Lỗi khi tạo khách hàng', 500);
            }
            customer = newCustomer;
        }

        // Cập nhật trạng thái lead
        await supabaseAdmin
            .from('leads')
            .update({
                status: 'converted',
                converted_at: new Date().toISOString(),
                customer_id: customer.id,
            })
            .eq('id', id);

        notifyCrmMaster('lead.converted', { lead: { ...lead, customer_id: customer.id }, customer });

        res.json({
            status: 'success',
            data: { customer },
            message: existingByPhone
                ? 'Đã liên kết lead với khách hàng hiện có'
                : 'Đã chuyển đổi lead thành khách hàng',
        });
    } catch (error) {
        next(error);
    }
});

// Get lead activities/history
router.get('/:id/activities', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { limit = 50 } = req.query;

        const { data: activities, error } = await supabaseAdmin
            .from('lead_activities')
            .select(`
                *,
                created_by_user:users!lead_activities_created_by_fkey(name)
            `)
            .eq('lead_id', id)
            .order('created_at', { ascending: false })
            .limit(Number(limit));

        if (error) {
            throw new ApiError('Lỗi khi lấy lịch sử hoạt động', 500);
        }

        // Map to add created_by_name
        const activitiesWithNames = activities?.map(activity => ({
            ...activity,
            created_by_name: activity.created_by_user?.name || null,
        }));

        res.json({
            status: 'success',
            data: { activities: activitiesWithNames },
        });
    } catch (error) {
        next(error);
    }
});

// Add activity/note to lead
router.post('/:id/activities', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { activity_type, content, old_status, new_status, metadata } = req.body;

        if (!activity_type) {
            throw new ApiError('Loại hoạt động là bắt buộc', 400);
        }

        const { data: activity, error } = await supabaseAdmin
            .from('lead_activities')
            .insert({
                lead_id: id,
                activity_type,
                content,
                old_status,
                new_status,
                metadata: metadata || {},
                created_by: req.user!.id,
                created_by_name: req.user!.name,
            })
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi thêm hoạt động: ' + error.message, 500);
        }

        // Send notifications if there are mentions
        if (metadata?.mentions && Array.isArray(metadata.mentions) && metadata.mentions.length > 0) {
            try {
                const { data: lead } = await supabaseAdmin
                    .from('leads')
                    .select('name')
                    .eq('id', id)
                    .single();

                const senderName = req.user!.name;
                const leadName = lead?.name || 'một Lead';

                const notifications = metadata.mentions.map((userId: string) => ({
                    user_id: userId,
                    type: 'mention',
                    title: 'Bạn được nhắc tên trong ghi chú Lead',
                    message: `${senderName} đã nhắc tên bạn trong ghi chú của lead "${leadName}"`,
                    data: {
                        lead_id: id,
                        activity_id: activity.id,
                        action_url: `/leads/${id}`
                    }
                }));

                await supabaseAdmin.from('notifications').insert(notifications);
            } catch (notifError) {
                console.error('Error creating mention notifications:', notifError);
            }
        }

        res.status(201).json({
            status: 'success',
            data: { activity },
        });
    } catch (error) {
        next(error);
    }
});

export { router as leadsRouter };
