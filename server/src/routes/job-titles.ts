import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// Generate job title code
const generateJobTitleCode = async (): Promise<string> => {
    const { data } = await supabase
        .from('job_titles')
        .select('code')
        .order('created_at', { ascending: false })
        .limit(1);

    let nextNumber = 1;
    if (data && data.length > 0) {
        const lastCode = data[0].code;
        const match = lastCode.match(/CD(\d+)/);
        if (match) {
            nextNumber = parseInt(match[1]) + 1;
        }
    }
    return `CD${nextNumber.toString().padStart(3, '0')}`;
};

// Get all job titles
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { status } = req.query;

        let query = supabase
            .from('job_titles')
            .select('*')
            .order('name', { ascending: true });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Get job title by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('job_titles')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            res.status(404).json({ error: 'Job title not found' });
            return;
        }

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Create job title
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, description, status = 'active' } = req.body;

        if (!name) {
            res.status(400).json({ error: 'Job title name is required' });
            return;
        }

        const code = await generateJobTitleCode();

        const { data, error } = await supabase
            .from('job_titles')
            .insert({
                code,
                name,
                description,
                status
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        next(error);
    }
});

// Update job title
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, description, status } = req.body;

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (status !== undefined) updateData.status = status;

        const { data, error } = await supabase
            .from('job_titles')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        if (!data) {
            res.status(404).json({ error: 'Job title not found' });
            return;
        }

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Delete job title
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        // Check if any users have this job title
        const { data: users } = await supabase
            .from('users')
            .select('id')
            .eq('job_title_id', id)
            .limit(1);

        if (users && users.length > 0) {
            res.status(400).json({ error: 'Cannot delete job title with assigned users' });
            return;
        }

        const { error } = await supabase
            .from('job_titles')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export default router;
