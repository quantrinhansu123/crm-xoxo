import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// Get all product types
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { data, error } = await supabase
            .from('product_types')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        res.json({
            status: 'success',
            data
        });
    } catch (error) {
        next(error);
    }
});

// Create product type
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, code, description } = req.body;

        if (!name || !code) {
            res.status(400).json({ error: 'Name and code are required' });
            return;
        }

        const { data, error } = await supabase
            .from('product_types')
            .insert({
                name,
                code,
                description
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            status: 'success',
            data
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('unique constraint')) {
            res.status(409).json({ error: 'Product type with this code or name already exists' });
            return;
        }
        next(error);
    }
});

// Update product type
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, code, description } = req.body;

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name;
        if (code !== undefined) updateData.code = code;
        if (description !== undefined) updateData.description = description;

        const { data, error } = await supabase
            .from('product_types')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        if (!data) {
            res.status(404).json({ error: 'Product type not found' });
            return;
        }

        res.json({
            status: 'success',
            data
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('unique constraint')) {
            res.status(409).json({ error: 'Product type with this code or name already exists' });
            return;
        }
        next(error);
    }
});

// Delete product type
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('product_types')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export default router;
