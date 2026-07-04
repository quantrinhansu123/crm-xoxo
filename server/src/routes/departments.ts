import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// Generate department code
const generateDepartmentCode = async (): Promise<string> => {
    const { data } = await supabase
        .from('departments')
        .select('code')
        .order('created_at', { ascending: false })
        .limit(1);

    let nextNumber = 1;
    if (data && data.length > 0) {
        const lastCode = data[0].code;
        const match = lastCode.match(/PB(\d+)/);
        if (match) {
            nextNumber = parseInt(match[1]) + 1;
        }
    }
    return `PB${nextNumber.toString().padStart(3, '0')}`;
};

// Get all departments
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { status } = req.query;

        let query = supabase
            .from('departments')
            .select(`
                *,
                manager:users!departments_manager_id_fkey(id, name, email, avatar)
            `)
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

// Get Kanban view: departments with active order item steps (smart filtering)
router.get('/kanban', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Fetch all active departments
        const { data: departments, error: deptError } = await supabase
            .from('departments')
            .select('id, code, name')
            .eq('status', 'active')
            .order('name', { ascending: true });

        if (deptError) throw deptError;

        // Fetch ALL steps (including completed) to determine workflow state
        const { data: allSteps, error: stepsError } = await supabase
            .from('order_item_steps')
            .select(`
                id,
                step_name,
                step_order,
                status,
                started_at,
                completed_at,
                estimated_duration,
                department_id,
                technician_id,
                order_item_id,
                order_product_service_id,
                technician:users!order_item_steps_technician_id_fkey(id, name, avatar),
                order_item:order_items(
                    id,
                    item_name,
                    order:orders(
                        id,
                        order_code,
                        due_at,
                        status,
                        customer:customers(id, name, phone),
                        sales_user:users!orders_sales_id_fkey(id, name)
                    )
                ),
                order_product_service:order_product_services(
                    id,
                    item_name,
                    order_product:order_products(
                        id,
                        name,
                        order:orders(
                            id,
                            order_code,
                            due_at,
                            status,
                            customer:customers(id, name, phone),
                            sales_user:users!orders_sales_id_fkey(id, name)
                        )
                    )
                )
            `)
            .order('step_order', { ascending: true });

        if (stepsError) throw stepsError;

        // Group steps by service (order_item_id or order_product_service_id)
        const stepsByService: Record<string, any[]> = {};
        for (const step of allSteps || []) {
            const serviceKey = step.order_product_service_id || step.order_item_id;
            if (!serviceKey) continue;
            if (!stepsByService[serviceKey]) {
                stepsByService[serviceKey] = [];
            }
            stepsByService[serviceKey].push(step);
        }

        // Process each service to determine which steps to show
        const stepsToShow: any[] = [];

        for (const serviceKey of Object.keys(stepsByService)) {
            const serviceSteps = stepsByService[serviceKey].sort((a, b) => a.step_order - b.step_order);

            // Find the current workflow state
            let lastCompletedIndex = -1;
            let inProgressIndex = -1;

            for (let i = 0; i < serviceSteps.length; i++) {
                const step = serviceSteps[i];
                if (step.status === 'completed' || step.status === 'skipped') {
                    lastCompletedIndex = i;
                } else if (step.status === 'in_progress' || step.status === 'assigned') {
                    inProgressIndex = i;
                    break; // Stop at first in-progress step
                }
            }

            // Determine which steps to display based on workflow state
            if (inProgressIndex >= 0) {
                // Case: A step is in progress
                // Show only the in-progress step (hide completed steps)
                stepsToShow.push({
                    ...serviceSteps[inProgressIndex],
                    display_status: serviceSteps[inProgressIndex].status === 'in_progress' ? 'in_progress' : 'assigned'
                });
            } else if (lastCompletedIndex >= 0 && lastCompletedIndex < serviceSteps.length - 1) {
                // Case: Last step was completed, next step is pending
                // Show both: completed step (marked) + next pending step (waiting)
                const completedStep = serviceSteps[lastCompletedIndex];
                const nextStep = serviceSteps[lastCompletedIndex + 1];

                // Show completed step
                stepsToShow.push({
                    ...completedStep,
                    display_status: 'completed'
                });

                // Show next pending step
                stepsToShow.push({
                    ...nextStep,
                    display_status: 'waiting'
                });
            } else if (lastCompletedIndex === -1 && serviceSteps.length > 0) {
                // Case: Service not started yet - show only first step
                const firstStep = serviceSteps[0];
                if (firstStep.status === 'pending' || firstStep.status === 'assigned') {
                    stepsToShow.push({
                        ...firstStep,
                        display_status: 'waiting'
                    });
                }
            }
            // If all steps completed, don't show anything
        }

        // Group filtered steps by department
        const stepsByDept: Record<string, any[]> = {};
        for (const step of stepsToShow) {
            const deptId = step.department_id;
            if (!deptId) continue;

            // Normalize step data
            const orderItem = step.order_item as any;
            const orderService = step.order_product_service as any;

            let itemName = '';
            let productName = '';
            let order: any = null;

            if (orderItem?.order) {
                itemName = orderItem.item_name || '';
                order = orderItem.order;
            } else if (orderService?.order_product?.order) {
                itemName = orderService.item_name || '';
                productName = orderService.order_product?.name || '';
                order = orderService.order_product.order;
            }

            if (!order) continue;

            if (!stepsByDept[deptId]) {
                stepsByDept[deptId] = [];
            }

            stepsByDept[deptId].push({
                id: step.id,
                step_name: step.step_name,
                step_order: step.step_order,
                status: step.status,
                display_status: step.display_status, // New field for UI display
                started_at: step.started_at,
                completed_at: step.completed_at,
                estimated_duration: step.estimated_duration,
                technician: step.technician,
                item_name: itemName,
                product_name: productName,
                order_id: order.id,
                order_code: order.order_code,
                order_due_at: order.due_at,
                order_status: order.status,
                customer_name: order.customer?.name || '',
                customer_phone: order.customer?.phone || '',
                sales_name: order.sales_user?.name || ''
            });
        }

        // Attach steps to departments
        const result = (departments || []).map(dept => ({
            ...dept,
            steps: stepsByDept[dept.id] || []
        }));

        res.json({
            status: 'success',
            data: result
        });
    } catch (error) {
        next(error);
    }
});

// Get department by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('departments')
            .select(`
                *,
                manager:users!departments_manager_id_fkey(id, name, email, avatar)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!data) {
            res.status(404).json({ error: 'Department not found' });
            return;
        }

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Create department
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { name, description, manager_id, status = 'active' } = req.body;

        if (!name) {
            res.status(400).json({ error: 'Department name is required' });
            return;
        }

        const code = await generateDepartmentCode();

        const { data, error } = await supabase
            .from('departments')
            .insert({
                code,
                name,
                description,
                manager_id,
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

// Update department
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, description, manager_id, status } = req.body;

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (manager_id !== undefined) updateData.manager_id = manager_id;
        if (status !== undefined) updateData.status = status;

        const { data, error } = await supabase
            .from('departments')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        if (!data) {
            res.status(404).json({ error: 'Department not found' });
            return;
        }

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Delete department
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        // Check if department has any users or services
        const { data: users } = await supabase
            .from('users')
            .select('id')
            .eq('department_id', id)
            .limit(1);

        if (users && users.length > 0) {
            res.status(400).json({ error: 'Cannot delete department with assigned users' });
            return;
        }

        const { data: services } = await supabase
            .from('services')
            .select('id')
            .eq('department_id', id)
            .limit(1);

        if (services && services.length > 0) {
            res.status(400).json({ error: 'Cannot delete department with assigned services' });
            return;
        }

        const { error } = await supabase
            .from('departments')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

// Get technicians in a department
router.get('/:id/technicians', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('department_id', id)
            .eq('role', 'technician')
            .order('name', { ascending: true });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Get services in a department
router.get('/:id/services', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('department_id', id)
            .order('name', { ascending: true });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

export default router;
