import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireAccountant, requireManager } from '../middleware/auth.js';

const router = Router();

// ─── GET all violations/rewards ──────────────────────────────────
// Query params: month, year, type, user_id, category
router.get('/', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month, year, type, user_id, category } = req.query;

        let query = supabaseAdmin
            .from('violations_rewards')
            .select(`
                *,
                user:users!violations_rewards_user_id_fkey(id, name, email, avatar, role, department, employee_code),
                creator:users!violations_rewards_created_by_fkey(id, name)
            `)
            .order('date', { ascending: false });

        if (month) query = query.eq('month', Number(month));
        if (year) query = query.eq('year', Number(year));
        if (type) query = query.eq('type', type);
        if (user_id) query = query.eq('user_id', user_id);
        if (category) query = query.eq('category', category);

        const { data, error } = await query;

        if (error) {
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                return res.json({
                    status: 'success',
                    data: {
                        records: [],
                        summary: { totalViolations: 0, totalRewards: 0, violationCount: 0, rewardCount: 0, net: 0 }
                    }
                });
            }
            throw new ApiError('Lỗi khi lấy danh sách vi phạm/thưởng: ' + error.message, 500);
        }

        const records = data || [];
        const violations = records.filter(r => r.type === 'violation');
        const rewards = records.filter(r => r.type === 'reward');

        const summary = {
            totalViolations: violations.reduce((sum, v) => sum + Number(v.amount), 0),
            totalRewards: rewards.reduce((sum, r) => sum + Number(r.amount), 0),
            violationCount: violations.length,
            rewardCount: rewards.length,
            net: rewards.reduce((sum, r) => sum + Number(r.amount), 0) - violations.reduce((sum, v) => sum + Number(v.amount), 0),
        };

        res.json({ status: 'success', data: { records, summary } });
    } catch (error) {
        next(error);
    }
});

// ─── GET by user ─────────────────────────────────────────────────
router.get('/user/:userId', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { userId } = req.params;
        const { month, year } = req.query;

        // Only allow viewing own records or if manager/accountant
        if (req.user!.id !== userId && req.user!.role !== 'manager' && req.user!.role !== 'accountant' && req.user!.role !== 'admin') {
            throw new ApiError('Không có quyền xem vi phạm/thưởng người khác', 403);
        }

        let query = supabaseAdmin
            .from('violations_rewards')
            .select('*')
            .eq('user_id', userId)
            .order('date', { ascending: false });

        if (month) query = query.eq('month', Number(month));
        if (year) query = query.eq('year', Number(year));

        const { data, error } = await query;

        if (error) throw new ApiError('Lỗi khi lấy vi phạm/thưởng: ' + error.message, 500);

        res.json({ status: 'success', data: { records: data || [] } });
    } catch (error) {
        next(error);
    }
});

// ─── POST create violation or reward ─────────────────────────────
router.post('/', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { user_id, type, category, amount, date, month, year, description, timesheet_id } = req.body;

        if (!user_id || !type || !category) {
            throw new ApiError('Thiếu thông tin bắt buộc (user_id, type, category)', 400);
        }

        if (!['violation', 'reward'].includes(type)) {
            throw new ApiError('Loại phải là "violation" hoặc "reward"', 400);
        }

        // Auto-calculate month/year from date if not provided
        const recordDate = date || new Date().toISOString().split('T')[0];
        const dateObj = new Date(recordDate);
        const recordMonth = month || (dateObj.getMonth() + 1);
        const recordYear = year || dateObj.getFullYear();

        const { data, error } = await supabaseAdmin
            .from('violations_rewards')
            .insert({
                user_id,
                type,
                category,
                amount: amount || 0,
                date: recordDate,
                month: recordMonth,
                year: recordYear,
                description,
                timesheet_id: timesheet_id || null,
                created_by: req.user!.id,
            })
            .select(`
                *,
                user:users!violations_rewards_user_id_fkey(id, name, email, avatar, role, department, employee_code)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi tạo bản ghi: ' + error.message, 500);

        res.status(201).json({ status: 'success', data: { record: data } });
    } catch (error) {
        next(error);
    }
});

// ─── PUT update violation/reward ──────────────────────────────────
router.put('/:id', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { type, category, amount, date, description } = req.body;

        const updateData: Record<string, any> = {};
        if (type) updateData.type = type;
        if (category) updateData.category = category;
        if (amount !== undefined) updateData.amount = amount;
        if (date) {
            updateData.date = date;
            const dateObj = new Date(date);
            updateData.month = dateObj.getMonth() + 1;
            updateData.year = dateObj.getFullYear();
        }
        if (description !== undefined) updateData.description = description;

        const { data, error } = await supabaseAdmin
            .from('violations_rewards')
            .update(updateData)
            .eq('id', id)
            .select(`
                *,
                user:users!violations_rewards_user_id_fkey(id, name, email, avatar, role, department, employee_code)
            `)
            .single();

        if (error) throw new ApiError('Lỗi khi cập nhật: ' + error.message, 500);
        if (!data) throw new ApiError('Không tìm thấy bản ghi', 404);

        res.json({ status: 'success', data: { record: data } });
    } catch (error) {
        next(error);
    }
});

// ─── DELETE violation/reward ──────────────────────────────────────
router.delete('/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('violations_rewards')
            .delete()
            .eq('id', id);

        if (error) throw new ApiError('Lỗi khi xóa: ' + error.message, 500);

        res.json({ status: 'success', message: 'Đã xóa bản ghi' });
    } catch (error) {
        next(error);
    }
});

// ─── GET summary by employee for a period ────────────────────────
// Useful for payroll integration
router.get('/summary', authenticate, requireAccountant, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            throw new ApiError('Thiếu tháng hoặc năm', 400);
        }

        const { data, error } = await supabaseAdmin
            .from('violations_rewards')
            .select(`
                user_id,
                type,
                amount
            `)
            .eq('month', Number(month))
            .eq('year', Number(year));

        if (error) {
            if (error.code === '42P01') {
                return res.json({ status: 'success', data: { employees: {} } });
            }
            throw new ApiError('Lỗi: ' + error.message, 500);
        }

        // Group by user_id
        const employees: Record<string, { violations: number; rewards: number; net: number }> = {};
        (data || []).forEach(record => {
            if (!employees[record.user_id]) {
                employees[record.user_id] = { violations: 0, rewards: 0, net: 0 };
            }
            const amt = Number(record.amount);
            if (record.type === 'violation') {
                employees[record.user_id].violations += amt;
            } else {
                employees[record.user_id].rewards += amt;
            }
            employees[record.user_id].net = employees[record.user_id].rewards - employees[record.user_id].violations;
        });

        res.json({ status: 'success', data: { employees } });
    } catch (error) {
        next(error);
    }
});

export { router as violationsRouter };
