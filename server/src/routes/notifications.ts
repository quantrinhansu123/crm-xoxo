import express, { Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

// Create notification (internal use - for cron jobs, webhooks, etc.)
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { user_id, type, title, message, data } = req.body;

        if (!user_id || !title || !message) {
            return res.status(400).json({ message: 'user_id, title, message are required' });
        }

        const { data: notification, error } = await supabaseAdmin
            .from('notifications')
            .insert({
                user_id,
                type: type || 'system',
                title,
                message,
                data: data || {},
                is_read: false,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ status: 'success', data: notification });
    } catch (error) {
        next(error);
    }
});

// Create notifications for multiple users
router.post('/batch', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { user_ids, type, title, message, data } = req.body;

        if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
            return res.status(400).json({ message: 'user_ids array is required' });
        }

        if (!title || !message) {
            return res.status(400).json({ message: 'title and message are required' });
        }

        const notifications = user_ids.map((user_id: string) => ({
            user_id,
            type: type || 'system',
            title,
            message,
            data: data || {},
            is_read: false,
            created_at: new Date().toISOString()
        }));

        const { data: inserted, error } = await supabaseAdmin
            .from('notifications')
            .insert(notifications)
            .select();

        if (error) throw error;

        res.status(201).json({ status: 'success', count: inserted?.length || 0, data: inserted });
    } catch (error) {
        next(error);
    }
});

// Get notifications for current user
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { type, limit = 50 } = req.query;

        let query = supabaseAdmin
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(Number(limit));

        if (type) {
            query = query.eq('type', type);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({ data });
    } catch (error) {
        next(error);
    }
});

// Mark notification as read
router.put('/:id/read', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { data, error } = await supabaseAdmin
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        res.json({ data });
    } catch (error) {
        next(error);
    }
});

// Mark all notifications as read
router.put('/read-all', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { data, error } = await supabaseAdmin
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false)
            .select();

        if (error) throw error;

        res.json({ message: 'All notifications marked as read', count: data?.length || 0 });
    } catch (error) {
        next(error);
    }
});

// Get unread count
router.get('/unread-count', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { count, error } = await supabaseAdmin
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) throw error;

        res.json({ unreadCount: count || 0 });
    } catch (error) {
        next(error);
    }
});

export default router;

