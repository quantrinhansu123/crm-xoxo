import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Get all interactions
router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { customer_id, lead_id, type, result, page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = supabaseAdmin
            .from('interactions')
            .select(`
        *,
        customer:customers(id, name, phone),
        lead:leads(id, name, phone),
        created_user:users!interactions_created_by_fkey(id, name)
      `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + Number(limit) - 1);

        if (customer_id) query = query.eq('customer_id', customer_id);
        if (lead_id) query = query.eq('lead_id', lead_id);
        if (type) query = query.eq('type', type);
        if (result) query = query.eq('result', result);

        const { data: interactions, error, count } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách tương tác', 500);
        }

        res.json({
            status: 'success',
            data: {
                interactions,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: count || 0,
                }
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get interaction by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: interaction, error } = await supabaseAdmin
            .from('interactions')
            .select(`
        *,
        customer:customers(id, name, phone, email),
        lead:leads(id, name, phone, email),
        created_user:users!interactions_created_by_fkey(id, name)
      `)
            .eq('id', id)
            .single();

        if (error || !interaction) {
            throw new ApiError('Không tìm thấy tương tác', 404);
        }

        res.json({
            status: 'success',
            data: { interaction },
        });
    } catch (error) {
        next(error);
    }
});

// Create interaction
router.post('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const {
            customer_id,
            lead_id,
            type,
            subject,
            content,
            result,
            duration,
            next_action,
            next_action_date
        } = req.body;

        if (!type || !subject) {
            throw new ApiError('Loại tương tác và tiêu đề là bắt buộc', 400);
        }

        if (!customer_id && !lead_id) {
            throw new ApiError('Phải chọn khách hàng hoặc lead', 400);
        }

        const { data: interaction, error } = await supabaseAdmin
            .from('interactions')
            .insert({
                customer_id,
                lead_id,
                type,
                subject,
                content,
                result: result || 'pending',
                duration,
                next_action,
                next_action_date,
                created_by: req.user!.id,
            })
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi tạo tương tác: ' + error.message, 500);
        }

        // Cập nhật last_contact cho customer/lead
        if (customer_id) {
            await supabaseAdmin
                .from('customers')
                .update({ last_contact: new Date().toISOString() })
                .eq('id', customer_id);
        }
        if (lead_id) {
            await supabaseAdmin
                .from('leads')
                .update({ last_contact: new Date().toISOString() })
                .eq('id', lead_id);
        }

        res.status(201).json({
            status: 'success',
            data: { interaction },
        });
    } catch (error) {
        next(error);
    }
});

// Update interaction
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const updateFields = req.body;

        const { data: interaction, error } = await supabaseAdmin
            .from('interactions')
            .update({ ...updateFields, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật tương tác', 500);
        }

        res.json({
            status: 'success',
            data: { interaction },
        });
    } catch (error) {
        next(error);
    }
});

// Delete interaction
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('interactions')
            .delete()
            .eq('id', id);

        if (error) {
            throw new ApiError('Lỗi khi xóa tương tác', 500);
        }

        res.json({
            status: 'success',
            message: 'Đã xóa tương tác',
        });
    } catch (error) {
        next(error);
    }
});

// Get pending follow-ups
router.get('/followups/pending', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const { data: followups, error } = await supabaseAdmin
            .from('interactions')
            .select(`
        *,
        customer:customers(id, name, phone),
        lead:leads(id, name, phone)
      `)
            .not('next_action', 'is', null)
            .lte('next_action_date', today)
            .eq('created_by', req.user!.id)
            .order('next_action_date', { ascending: true });

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách follow-up', 500);
        }

        res.json({
            status: 'success',
            data: { followups },
        });
    } catch (error) {
        next(error);
    }
});

export { router as interactionsRouter };
