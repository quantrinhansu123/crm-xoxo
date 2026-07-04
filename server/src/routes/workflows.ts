import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Generate workflow code
const generateWorkflowCode = async (): Promise<string> => {
    const { data } = await supabase
        .from('workflows')
        .select('code')
        .order('created_at', { ascending: false })
        .limit(1);

    let nextNumber = 1;
    if (data && data.length > 0) {
        const lastCode = data[0].code;
        const match = lastCode.match(/QT(\d+)/);
        if (match) {
            nextNumber = parseInt(match[1]) + 1;
        }
    }
    return `QT${nextNumber.toString().padStart(3, '0')}`;
};

// ==========================================
// WORKFLOW CRUD
// ==========================================

// Get all workflows
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { status } = req.query;

        let query = supabase
            .from('workflows')
            .select(`
                *,
                steps:workflow_steps(
                    id,
                    step_order,
                    name,
                    description,
                    estimated_duration,
                    is_required,
                    department:departments(id, name, code)
                ),
                created_by_user:users!workflows_created_by_fkey(id, name)
            `)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Sort steps by step_order
        const workflows = data?.map(w => ({
            ...w,
            steps: w.steps?.sort((a: { step_order: number }, b: { step_order: number }) => a.step_order - b.step_order) || []
        }));

        res.json(workflows);
    } catch (error) {
        next(error);
    }
});

// Get workflow by ID with steps
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('workflows')
            .select(`
                *,
                steps:workflow_steps(
                    id,
                    step_order,
                    name,
                    description,
                    estimated_duration,
                    is_required,
                    department:departments(id, name, code)
                ),
                created_by_user:users!workflows_created_by_fkey(id, name)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        // Sort steps
        data.steps = data.steps?.sort((a: { step_order: number }, b: { step_order: number }) => a.step_order - b.step_order) || [];

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Create workflow with steps
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, description, status = 'active', steps = [], created_by } = req.body;

        if (!name) {
            res.status(400).json({ error: 'Workflow name is required' });
            return;
        }

        const code = await generateWorkflowCode();

        // Create workflow
        const { data: workflow, error: workflowError } = await supabase
            .from('workflows')
            .insert({
                code,
                name,
                description,
                status,
                created_by
            })
            .select()
            .single();

        if (workflowError) throw workflowError;

        // Create steps if provided
        if (steps.length > 0) {
            const stepsToInsert = steps.map((step: {
                department_id: string;
                name?: string;
                description?: string;
                estimated_duration?: number;
                is_required?: boolean;
            }, index: number) => ({
                workflow_id: workflow.id,
                department_id: step.department_id,
                step_order: index + 1,
                name: step.name || null,
                description: step.description || null,
                estimated_duration: step.estimated_duration ?? 1,
                is_required: step.is_required !== false
            }));

            const { error: stepsError } = await supabase
                .from('workflow_steps')
                .insert(stepsToInsert);

            if (stepsError) throw stepsError;
        }

        // Fetch complete workflow with steps
        const { data: completeWorkflow, error: fetchError } = await supabase
            .from('workflows')
            .select(`
                *,
                steps:workflow_steps(
                    id,
                    step_order,
                    name,
                    description,
                    estimated_duration,
                    is_required,
                    department:departments(id, name, code)
                )
            `)
            .eq('id', workflow.id)
            .single();

        if (fetchError) throw fetchError;

        res.status(201).json(completeWorkflow);
    } catch (error) {
        next(error);
    }
});

// Update workflow
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, description, status, steps } = req.body;

        // Update workflow basic info
        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (status !== undefined) updateData.status = status;

        const { data: workflow, error: workflowError } = await supabase
            .from('workflows')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (workflowError) throw workflowError;

        if (!workflow) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        // Update steps if provided (replace all)
        if (steps !== undefined) {
            // Delete existing steps
            await supabase
                .from('workflow_steps')
                .delete()
                .eq('workflow_id', id);

            // Insert new steps
            if (steps.length > 0) {
                const stepsToInsert = steps.map((step: {
                    department_id: string;
                    name?: string;
                    description?: string;
                    estimated_duration?: number;
                    is_required?: boolean;
                }, index: number) => ({
                    workflow_id: id,
                    department_id: step.department_id,
                    step_order: index + 1,
                    name: step.name || null,
                    description: step.description || null,
                    estimated_duration: step.estimated_duration ?? 1,
                    is_required: step.is_required !== false
                }));

                const { error: stepsError } = await supabase
                    .from('workflow_steps')
                    .insert(stepsToInsert);

                if (stepsError) throw stepsError;
            }
        }

        // Fetch updated workflow with steps
        const { data: updatedWorkflow, error: fetchError } = await supabase
            .from('workflows')
            .select(`
                *,
                steps:workflow_steps(
                    id,
                    step_order,
                    name,
                    description,
                    estimated_duration,
                    is_required,
                    department:departments(id, name, code)
                )
            `)
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        res.json(updatedWorkflow);
    } catch (error) {
        next(error);
    }
});

// Delete workflow
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        // Check if workflow is used by any services
        const { data: services } = await supabase
            .from('services')
            .select('id, name')
            .eq('workflow_id', id)
            .limit(5);

        if (services && services.length > 0) {
            res.status(400).json({
                error: 'Cannot delete workflow that is used by services',
                services: services.map(s => s.name)
            });
            return;
        }

        // Delete workflow (steps will be deleted by CASCADE)
        const { error } = await supabase
            .from('workflows')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

// ==========================================
// WORKFLOW STEPS MANAGEMENT
// ==========================================

// Add step to workflow
router.post('/:id/steps', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { department_id, name, description, estimated_duration, is_required } = req.body;

        if (!department_id) {
            res.status(400).json({ error: 'department_id is required' });
            return;
        }

        // Get current max step_order
        const { data: existingSteps } = await supabase
            .from('workflow_steps')
            .select('step_order')
            .eq('workflow_id', id)
            .order('step_order', { ascending: false })
            .limit(1);

        const nextOrder = existingSteps && existingSteps.length > 0
            ? existingSteps[0].step_order + 1
            : 1;

        const { data, error } = await supabase
            .from('workflow_steps')
            .insert({
                workflow_id: id,
                department_id,
                step_order: nextOrder,
                name: name || null,
                description: description || null,
                estimated_duration: estimated_duration ?? 1,
                is_required: is_required !== false
            })
            .select(`
                *,
                department:departments(id, name, code)
            `)
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        next(error);
    }
});

// Reorder steps
router.put('/:id/steps/reorder', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { step_ids } = req.body; // Array of step IDs in new order

        if (!Array.isArray(step_ids)) {
            res.status(400).json({ error: 'step_ids must be an array' });
            return;
        }

        // Update each step's order
        for (let i = 0; i < step_ids.length; i++) {
            await supabase
                .from('workflow_steps')
                .update({ step_order: i + 1 })
                .eq('id', step_ids[i])
                .eq('workflow_id', id);
        }

        // Fetch updated steps
        const { data, error } = await supabase
            .from('workflow_steps')
            .select(`
                *,
                department:departments(id, name, code)
            `)
            .eq('workflow_id', id)
            .order('step_order', { ascending: true });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Update step
router.put('/:id/steps/:stepId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id, stepId } = req.params;
        const { department_id, name, description, estimated_duration, is_required } = req.body;

        const updateData: Record<string, unknown> = {};
        if (department_id !== undefined) updateData.department_id = department_id;
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (estimated_duration !== undefined) updateData.estimated_duration = Number(estimated_duration);
        if (is_required !== undefined) updateData.is_required = is_required;

        const { data, error } = await supabase
            .from('workflow_steps')
            .update(updateData)
            .eq('id', stepId)
            .eq('workflow_id', id)
            .select(`
                *,
                department:departments(id, name, code)
            `)
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Delete step
router.delete('/:id/steps/:stepId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id, stepId } = req.params;

        const { error } = await supabase
            .from('workflow_steps')
            .delete()
            .eq('id', stepId)
            .eq('workflow_id', id);

        if (error) throw error;

        // Reorder remaining steps
        const { data: remainingSteps } = await supabase
            .from('workflow_steps')
            .select('id')
            .eq('workflow_id', id)
            .order('step_order', { ascending: true });

        if (remainingSteps) {
            for (let i = 0; i < remainingSteps.length; i++) {
                await supabase
                    .from('workflow_steps')
                    .update({ step_order: i + 1 })
                    .eq('id', remainingSteps[i].id);
            }
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

// ==========================================
// SERVICE-WORKFLOW ASSIGNMENT
// ==========================================

// Assign workflow to service
router.post('/assign-service', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { service_id, workflow_id } = req.body;

        if (!service_id) {
            res.status(400).json({ error: 'service_id is required' });
            return;
        }

        const { data, error } = await supabase
            .from('services')
            .update({ workflow_id: workflow_id || null })
            .eq('id', service_id)
            .select(`
                *,
                workflow:workflows(id, code, name)
            `)
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Get services using a workflow
router.get('/:id/services', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('services')
            .select('id, name, category, price, status')
            .eq('workflow_id', id)
            .order('name', { ascending: true });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

export default router;
