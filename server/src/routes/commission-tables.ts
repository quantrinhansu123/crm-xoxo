import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// GET /api/commission-tables
router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('commission_tables')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            // Fallback if table doesn't exist yet (42P01 = undefined_table)
            if (error.code === '42P01' || error.message.includes('not found')) {
                return res.json({
                    status: 'success',
                    data: {
                        tables: [
                            { id: 'common', name: 'Bảng hoa hồng chung', type: 'common', checked: true },
                        ],
                        isFallback: true
                    }
                });
            }
            throw new ApiError('Lỗi khi tải bảng hoa hồng: ' + error.message, 500);
        }

        res.json({
            status: 'success',
            data: { tables: data },
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/commission-tables
router.post('/', async (req, res, next) => {
    try {
        const { id, name, type } = req.body;
        const { data, error } = await supabase
            .from('commission_tables')
            .insert([{ id, name, type, checked: true }])
            .select();

        if (error) {
            throw new ApiError('Lỗi khi tạo bảng hoa hồng: ' + error.message, 500);
        }

        res.json({
            status: 'success',
            data: { table: data[0] },
        });
    } catch (error) {
        next(error);
    }
});

// PATCH /api/commission-tables/:id
router.patch('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateFields = req.body;

        const { data, error } = await supabase
            .from('commission_tables')
            .update({ ...updateFields, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật bảng hoa hồng: ' + error.message, 500);
        }

        res.json({
            status: 'success',
            data: { table: data[0] },
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/commission-tables/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('commission_tables')
            .delete()
            .eq('id', id);

        if (error) {
            throw new ApiError('Lỗi khi xóa bảng hoa hồng: ' + error.message, 500);
        }

        res.json({
            status: 'success',
            message: 'Đã xóa bảng hoa hồng',
        });
    } catch (error) {
        next(error);
    }
});

export { router as commissionTablesRouter };
