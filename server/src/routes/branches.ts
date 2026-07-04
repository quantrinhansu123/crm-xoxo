import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

// Get all branches
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { status } = req.query;

        let query = supabaseAdmin
            .from('branches')
            .select('id, code, name, address, status, created_at, updated_at')
            .order('name', { ascending: true });

        if (status) {
            query = query.eq('status', status as string);
        }

        const { data, error } = await query;

        if (error) {
            // Bảng chưa migrate — trả mảng rỗng thay vì 500
            if (error.code === '42P01' || error.message?.includes('branches')) {
                console.warn('[branches] Table missing or inaccessible:', error.message);
                res.json({ status: 'success', data: { branches: [] } });
                return;
            }
            throw error;
        }

        res.json({
            status: 'success',
            data: { branches: data || [] },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
