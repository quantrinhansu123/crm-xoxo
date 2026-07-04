import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';

const router = Router();

// ============================================================
// KPI VIOLATION LOGS
// ============================================================

// GET /api/kpi/violations - List violations
router.get('/violations', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month_key, employee_id, status, violation_type, page = 1, limit = 50 } = req.query;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const offset = (pageNum - 1) * limitNum;

        let query = supabaseAdmin
            .from('kpi_violation_logs')
            .select(`
                *,
                employee:users!kpi_violation_logs_employee_id_fkey(id, name, email, avatar, role),
                creator:users!kpi_violation_logs_created_by_fkey(id, name)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limitNum - 1);

        if (month_key) query = query.eq('month_key', month_key);
        if (employee_id) query = query.eq('employee_id', employee_id);
        if (status && status !== 'all') query = query.eq('status', status);
        if (violation_type && violation_type !== 'all') query = query.eq('violation_type', violation_type);

        const { data: violations, error, count } = await query;

        if (error) throw new ApiError('Lỗi khi lấy danh sách vi phạm: ' + error.message, 500);

        res.json({
            status: 'success',
            data: {
                violations: violations || [],
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / limitNum)
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/violations - Create violation (manual)
router.post('/violations', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const {
            employee_id, month_key, violation_type, rule_code, rule_name,
            deduct_kpi_point, deduct_amount, related_lead_id, related_order_id,
            note, attachments
        } = req.body;

        if (!employee_id || !month_key || !rule_name) {
            throw new ApiError('Thiếu thông tin bắt buộc (employee_id, month_key, rule_name)', 400);
        }

        // Verify employee exists
        const { data: employee } = await supabaseAdmin
            .from('users')
            .select('id, name')
            .eq('id', employee_id)
            .single();

        if (!employee) throw new ApiError('Không tìm thấy nhân sự', 404);

        const { data: violation, error } = await supabaseAdmin
            .from('kpi_violation_logs')
            .insert({
                employee_id,
                month_key,
                violation_type: violation_type || 'discipline',
                rule_code: rule_code || null,
                rule_name,
                source_type: 'manual',
                deduct_kpi_point: deduct_kpi_point || 0,
                deduct_amount: deduct_amount || 0,
                related_lead_id: related_lead_id || null,
                related_order_id: related_order_id || null,
                note: note || null,
                attachments: attachments || [],
                created_by: req.user!.id,
                status: 'pending'
            })
            .select(`
                *,
                employee:users!kpi_violation_logs_employee_id_fkey(id, name, email, avatar, role)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi tạo vi phạm: ' + error.message, 500);

        res.status(201).json({
            status: 'success',
            data: { violation }
        });
    } catch (error) {
        next(error);
    }
});

// PATCH /api/kpi/violations/:id - Update violation
router.patch('/violations/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Check current status - can only edit pending
        const { data: existing } = await supabaseAdmin
            .from('kpi_violation_logs')
            .select('status')
            .eq('id', id)
            .single();

        if (!existing) throw new ApiError('Không tìm thấy vi phạm', 404);
        if (existing.status !== 'pending') {
            throw new ApiError('Chỉ có thể sửa vi phạm đang chờ duyệt', 400);
        }

        const allowedFields = [
            'violation_type', 'rule_code', 'rule_name',
            'deduct_kpi_point', 'deduct_amount',
            'note', 'attachments'
        ];

        const updateData: any = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        const { data: violation, error } = await supabaseAdmin
            .from('kpi_violation_logs')
            .update(updateData)
            .eq('id', id)
            .select(`
                *,
                employee:users!kpi_violation_logs_employee_id_fkey(id, name, email, avatar, role)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi cập nhật vi phạm: ' + error.message, 500);

        res.json({
            status: 'success',
            data: { violation }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/violations/:id/approve - Approve violation
router.post('/violations/:id/approve', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: violation, error } = await supabaseAdmin
            .from('kpi_violation_logs')
            .update({ status: 'approved' })
            .eq('id', id)
            .eq('status', 'pending')
            .select(`
                *,
                employee:users!kpi_violation_logs_employee_id_fkey(id, name, email, avatar, role)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi duyệt vi phạm: ' + error.message, 500);
        if (!violation) throw new ApiError('Vi phạm không tồn tại hoặc đã được xử lý', 404);

        res.json({
            status: 'success',
            data: { violation }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/violations/:id/reject - Reject violation
router.post('/violations/:id/reject', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: violation, error } = await supabaseAdmin
            .from('kpi_violation_logs')
            .update({ status: 'rejected' })
            .eq('id', id)
            .eq('status', 'pending')
            .select(`
                *,
                employee:users!kpi_violation_logs_employee_id_fkey(id, name, email, avatar, role)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi từ chối vi phạm: ' + error.message, 500);
        if (!violation) throw new ApiError('Vi phạm không tồn tại hoặc đã được xử lý', 404);

        res.json({
            status: 'success',
            data: { violation }
        });
    } catch (error) {
        next(error);
    }
});

export { router as kpiViolationsRouter };
