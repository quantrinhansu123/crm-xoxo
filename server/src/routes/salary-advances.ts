import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireAccountant, requireManager } from '../middleware/auth.js';

const router = Router();

// ─── GET all salary advances ─────────────────────────────────────
// Query params: month, year, status, user_id
router.get('/', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month, year, status, user_id } = req.query;

        let query = supabaseAdmin
            .from('salary_advances')
            .select(`
                *,
                user:users!salary_advances_user_id_fkey(id, name, email, avatar, role, department, employee_code),
                approver:users!salary_advances_approved_by_fkey(id, name)
            `)
            .order('created_at', { ascending: false });

        if (month) query = query.eq('month', Number(month));
        if (year) query = query.eq('year', Number(year));
        if (status) query = query.eq('status', status);
        if (user_id) query = query.eq('user_id', user_id);

        const { data, error } = await query;

        if (error) {
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                return res.json({ status: 'success', data: { advances: [], summary: { total: 0, pending: 0, approved: 0, count: 0 } } });
            }
            throw new ApiError('Lỗi khi lấy danh sách ứng lương: ' + error.message, 500);
        }

        const advances = data || [];
        const summary = {
            total: advances.reduce((sum, a) => sum + Number(a.amount), 0),
            pending: advances.filter(a => a.status === 'pending').reduce((sum, a) => sum + Number(a.amount), 0),
            approved: advances.filter(a => a.status === 'approved').reduce((sum, a) => sum + Number(a.amount), 0),
            deducted: advances.filter(a => a.status === 'deducted').reduce((sum, a) => sum + Number(a.amount), 0),
            count: advances.length,
        };

        res.json({ status: 'success', data: { advances, summary } });
    } catch (error) {
        next(error);
    }
});

// ─── GET advances by user (employee can see their own) ───────────
router.get('/user/:userId', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { userId } = req.params;
        const { year } = req.query;

        // Only allow viewing own advances or if manager/accountant
        if (req.user!.id !== userId && req.user!.role !== 'manager' && req.user!.role !== 'accountant' && req.user!.role !== 'admin') {
            throw new ApiError('Không có quyền xem ứng lương người khác', 403);
        }

        let query = supabaseAdmin
            .from('salary_advances')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (year) query = query.eq('year', Number(year));

        const { data, error } = await query;

        if (error) throw new ApiError('Lỗi khi lấy ứng lương: ' + error.message, 500);

        res.json({ status: 'success', data: { advances: data || [] } });
    } catch (error) {
        next(error);
    }
});

// ─── POST create advance request ─────────────────────────────────
router.post('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { user_id, amount, month, year, reason, notes } = req.body;

        if (!user_id || !amount || !month || !year) {
            throw new ApiError('Thiếu thông tin bắt buộc (user_id, amount, month, year)', 400);
        }

        if (amount <= 0) {
            throw new ApiError('Số tiền ứng lương phải lớn hơn 0', 400);
        }

        // Check if user exists
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('id, name, base_salary')
            .eq('id', user_id)
            .single();

        if (!user) throw new ApiError('Không tìm thấy nhân viên', 404);

        // Check total advances for the month don't exceed base salary
        const { data: existingAdvances } = await supabaseAdmin
            .from('salary_advances')
            .select('amount')
            .eq('user_id', user_id)
            .eq('month', month)
            .eq('year', year)
            .in('status', ['pending', 'approved']);

        const totalExisting = existingAdvances?.reduce((sum, a) => sum + Number(a.amount), 0) || 0;
        const baseSalary = user.base_salary || 15000000;

        if (totalExisting + amount > baseSalary * 0.5) {
            throw new ApiError(`Tổng ứng lương (${(totalExisting + amount).toLocaleString()}đ) vượt quá 50% lương cơ bản (${(baseSalary * 0.5).toLocaleString()}đ)`, 400);
        }

        const { data, error } = await supabaseAdmin
            .from('salary_advances')
            .insert({
                user_id,
                amount,
                month,
                year,
                reason,
                notes,
                status: 'pending',
                created_by: req.user!.id,
            })
            .select(`
                *,
                user:users!salary_advances_user_id_fkey(id, name, email, avatar, role, department, employee_code)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi tạo yêu cầu ứng lương: ' + error.message, 500);

        res.status(201).json({ status: 'success', data: { advance: data } });
    } catch (error) {
        next(error);
    }
});

// ─── PATCH approve advance ────────────────────────────────────────
router.patch('/:id/approve', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabaseAdmin
            .from('salary_advances')
            .update({
                status: 'approved',
                approved_by: req.user!.id,
                approved_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('status', 'pending')
            .select(`
                *,
                user:users!salary_advances_user_id_fkey(id, name, email, avatar, role, department, employee_code)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi duyệt ứng lương: ' + error.message, 500);
        if (!data) throw new ApiError('Không tìm thấy yêu cầu hoặc đã được xử lý', 404);

        res.json({ status: 'success', data: { advance: data } });
    } catch (error) {
        next(error);
    }
});

// ─── PATCH reject advance ─────────────────────────────────────────
router.patch('/:id/reject', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { rejection_reason } = req.body;

        const { data, error } = await supabaseAdmin
            .from('salary_advances')
            .update({
                status: 'rejected',
                rejected_by: req.user!.id,
                rejected_at: new Date().toISOString(),
                rejection_reason,
            })
            .eq('id', id)
            .eq('status', 'pending')
            .select(`
                *,
                user:users!salary_advances_user_id_fkey(id, name, email, avatar, role, department, employee_code)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi từ chối ứng lương: ' + error.message, 500);
        if (!data) throw new ApiError('Không tìm thấy yêu cầu hoặc đã được xử lý', 404);

        res.json({ status: 'success', data: { advance: data } });
    } catch (error) {
        next(error);
    }
});

// ─── DELETE advance (only pending) ────────────────────────────────
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Only allow delete if pending and created by the user or if manager/admin
        const { data: advance } = await supabaseAdmin
            .from('salary_advances')
            .select('id, status, created_by')
            .eq('id', id)
            .single();

        if (!advance) throw new ApiError('Không tìm thấy yêu cầu', 404);
        if (advance.status !== 'pending') throw new ApiError('Chỉ có thể xóa yêu cầu đang chờ duyệt', 400);

        if (advance.created_by !== req.user!.id && req.user!.role !== 'manager' && req.user!.role !== 'admin') {
            throw new ApiError('Không có quyền xóa yêu cầu này', 403);
        }

        const { error } = await supabaseAdmin
            .from('salary_advances')
            .delete()
            .eq('id', id);

        if (error) throw new ApiError('Lỗi khi xóa: ' + error.message, 500);

        res.json({ status: 'success', message: 'Đã xóa yêu cầu ứng lương' });
    } catch (error) {
        next(error);
    }
});

export { router as salaryAdvancesRouter };
