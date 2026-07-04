import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';

const router = Router();

// Get all vouchers
router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { status, search } = req.query;

        let query = supabaseAdmin
            .from('vouchers')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);
        if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

        const { data: vouchers, error } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách voucher', 500);
        }

        res.json({
            status: 'success',
            data: { vouchers },
        });
    } catch (error) {
        next(error);
    }
});

// Get voucher by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: voucher, error } = await supabaseAdmin
            .from('vouchers')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !voucher) {
            throw new ApiError('Không tìm thấy voucher', 404);
        }

        res.json({
            status: 'success',
            data: { voucher },
        });
    } catch (error) {
        next(error);
    }
});

// Create voucher
router.post('/', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { name, type, value, min_order_value, max_discount, quantity, start_date, end_date } = req.body;

        if (!name || !type || !value) {
            throw new ApiError('Tên, loại và giá trị voucher là bắt buộc', 400);
        }

        // Auto-generate voucher code if not provided
        let code = req.body.code;
        if (!code) {
            const { data: latestVoucher } = await supabaseAdmin
                .from('vouchers')
                .select('code')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (latestVoucher && latestVoucher.code) {
                const match = latestVoucher.code.match(/\d+$/);
                const nextNum = match ? parseInt(match[0]) + 1 : 1;
                code = `VC${String(nextNum).padStart(3, '0')}`;
            } else {
                code = 'VC001';
            }
        }

        const { data: voucher, error } = await supabaseAdmin
            .from('vouchers')
            .insert({
                code,
                name,
                type,
                value,
                min_order_value: min_order_value || 0,
                max_discount,
                quantity: quantity || 0,
                used_count: 0,
                start_date,
                end_date,
                status: 'active',
                created_by: req.user!.id,
            })
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi tạo voucher: ' + error.message, 500);
        }

        res.status(201).json({
            status: 'success',
            data: { voucher },
        });
    } catch (error) {
        next(error);
    }
});

// Update voucher
router.put('/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { name, type, value, min_order_value, max_discount, quantity, start_date, end_date, status } = req.body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (type !== undefined) updateData.type = type;
        if (value !== undefined) updateData.value = value;
        if (min_order_value !== undefined) updateData.min_order_value = min_order_value;
        if (max_discount !== undefined) updateData.max_discount = max_discount;
        if (quantity !== undefined) updateData.quantity = quantity;
        if (start_date !== undefined) updateData.start_date = start_date;
        if (end_date !== undefined) updateData.end_date = end_date;
        if (status !== undefined) updateData.status = status;
        updateData.updated_at = new Date().toISOString();

        const { data: voucher, error } = await supabaseAdmin
            .from('vouchers')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error || !voucher) {
            throw new ApiError('Lỗi khi cập nhật voucher', 500);
        }

        res.json({
            status: 'success',
            data: { voucher },
        });
    } catch (error) {
        next(error);
    }
});

// Delete voucher
router.delete('/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('vouchers')
            .delete()
            .eq('id', id);

        if (error) {
            throw new ApiError('Lỗi khi xóa voucher', 500);
        }

        res.json({
            status: 'success',
            message: 'Đã xóa voucher',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
