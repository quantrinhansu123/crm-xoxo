import { Router, Response, NextFunction } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { checkAndCompleteOrder } from '../utils/orderHelper.js';
import { fireWebhook } from '../utils/webhookNotifier.js';

const router = Router();

// Generate task code
const generateTaskCode = async (): Promise<string> => {
    const today = new Date();
    const prefix = `CV${today.getFullYear().toString().slice(-2)}${(today.getMonth() + 1).toString().padStart(2, '0')} `;

    const { data } = await supabase
        .from('technician_tasks')
        .select('task_code')
        .like('task_code', `${prefix}% `)
        .order('task_code', { ascending: false })
        .limit(1);

    let nextNumber = 1;
    if (data && data.length > 0) {
        const lastCode = data[0].task_code;
        const lastNumber = parseInt(lastCode.slice(-4));
        nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(4, '0')} `;
};

// Get all tasks (with filters)
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { status, technician_id, date_from, date_to, priority } = req.query;

        let query = supabase
            .from('technician_tasks')
            .select(`
    *,
    order: orders(order_code, customer: customers(name, phone, address)),
        service: services(name, price, duration),
            technician: users!technician_tasks_technician_id_fkey(name, phone, avatar, department, department_id, departments!department_id(name)),
                customer: customers(name, phone, address)
                    `)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        if (technician_id) {
            query = query.eq('technician_id', technician_id);
        }

        if (date_from) {
            query = query.gte('scheduled_date', date_from);
        }

        if (date_to) {
            query = query.lte('scheduled_date', date_to);
        }

        if (priority) {
            query = query.eq('priority', priority);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Fetch all departments for name resolution fallback
        const { data: deptList } = await supabaseAdmin.from('departments').select('id, name');
        const deptMap = new Map((deptList || []).map(d => [d.id, d.name]));
        
        // Map technician department name
        const mappedData = (data || []).map((task: any) => {
            if (task.technician) {
                task.technician.department = task.technician.departments?.name || (task.technician.department ? (deptMap.get(task.technician.department) || task.technician.department) : null);
            }
            return task;
        });

        res.json(mappedData);
    } catch (error) {
        next(error);
    }
});

// Get tasks for current technician
router.get('/my-tasks', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const { status, date } = req.query;

        if (!userId) {
            return res.json([]);
        }

        let tasks: any[] = [];

        try {
            let query = supabase
                .from('technician_tasks')
                .select(`
                    *,
                    order: orders(order_code, customer: customers(name, phone, address)),
                        service: services(name, price, duration),
                            customer: customers(name, phone, address)
                                `)
                .eq('technician_id', userId)
                .order('scheduled_date', { ascending: true })
                .order('scheduled_time', { ascending: true });

            if (status && status !== 'all') {
                query = query.eq('status', status);
            }

            if (date) {
                query = query.eq('scheduled_date', date);
            }

            const { data, error } = await query;
            if (!error && data) {
                tasks = data;
            }
        } catch (e) {
            console.log('technician_tasks table not available');
        }

        // Also get order_items assigned to this technician (V1)
        const { data: orderItems, error: itemsError } = await supabase
            .from('order_items')
            .select(`
                                *,
                                order: orders(id, order_code, status, customer: customers(*)),
                                    service: services(*)
                                        `)
            .eq('technician_id', userId)
            .not('item_code', 'is', null);

        // Get order_product_services assigned to this technician (V2) - check both old column and new junction table
        const { data: v2Services, error: v2Error } = await supabaseAdmin
            .from('order_product_services')
            .select(`
                                        *,
                                        order_products(
                                            id,
                                            product_code,
                                            name,
                                            type,
                                            brand,
                                            color,
                                            size,
                                            material,
                                            condition_before,
                                            images,
                                            notes,
                                            orders(id, order_code, status, customer: customers(*))
                                        )
                                            `)
            .eq('technician_id', userId);

        // Also get V2 services from junction table (new multi-technician assignments)
        const { data: v2JunctionServices } = await supabaseAdmin
            .from('order_product_service_technicians')
            .select(`
                                        *,
                                        order_product_services(
                    *,
                                            order_products(
                                                id,
                                                product_code,
                                                name,
                                                type,
                                                brand,
                                                color,
                                                size,
                                                material,
                                                condition_before,
                                                images,
                                                notes,
                                                orders(id, order_code, status, customer: customers(*))
                                            )
                                        )
                                            `)
            .eq('technician_id', userId);

        // Combine V2 services (avoid duplicates)
        const v2ServiceIds = new Set((v2Services || []).map(s => s.id));
        const additionalV2Services = (v2JunctionServices || [])
            .filter(j => j.order_product_services && !v2ServiceIds.has(j.order_product_services.id))
            .map(j => ({
                ...j.order_product_services,
                junction_status: j.status, // Use junction status if needed
                junction_commission: j.commission
            }));
        const allV2Services = [...(v2Services || []), ...additionalV2Services];

        // Get workflow steps assigned to this technician
        const { data: workflowSteps, error: stepsError } = await supabaseAdmin
            .from('order_item_steps')
            .select(`
                                        *,
                                        order_product_services(
                                            item_name,
                                            order_products(
                                                id,
                                                product_code,
                                                orders(id, order_code, status, customer: customers(*))
                                            )
                                        ),
                                        order_items(
                                            item_name,
                                            orders(id, order_code, status, customer: customers(*))
                                        )
                                            `)
            .eq('technician_id', userId);

        if (itemsError) {
            console.error('Error fetching order items:', itemsError);
        }

        const taskItemCodes = new Set(tasks.map(t => t.item_code).filter(Boolean));
        const allTasks = [...tasks];

        // Process V1 Items
        if (orderItems) {
            const v1Items = orderItems
                .filter(item => item.item_code && !taskItemCodes.has(item.item_code))
                .map(item => {
                    let taskStatus = 'assigned';
                    if (item.status === 'in_progress') taskStatus = 'in_progress';
                    else if (item.status === 'completed') taskStatus = 'completed';
                    else if (item.status === 'cancelled') taskStatus = 'cancelled';
                    else if (item.status === 'pending') taskStatus = 'assigned';

                    return {
                        id: item.id,
                        task_code: 'V1-' + item.item_code,
                        item_code: item.item_code,
                        order_id: item.order?.id,
                        order_item_id: item.id,
                        service_id: item.service_id,
                        technician_id: userId,
                        service_name: item.item_name,
                        quantity: item.quantity,
                        status: taskStatus,
                        priority: 'normal',
                        scheduled_date: null,
                        scheduled_time: null,
                        started_at: item.started_at || null,
                        completed_at: item.completed_at || null,
                        assigned_at: item.created_at,
                        created_at: item.created_at,
                        updated_at: item.updated_at,
                        order: item.order ? {
                            order_code: item.order.order_code,
                            customer: item.order.customer
                        } : undefined,
                        service: item.service,
                        customer: item.order?.customer,
                        is_virtual: true,
                        type: 'v1_service'
                    };
                });
            allTasks.push(...v1Items);
        }

        // Process V2 Services - Group by product
        if (allV2Services.length > 0) {
            // Fetch technicians for all services from junction table
            const serviceIds = allV2Services.map(s => s.id).filter(Boolean);
            let techniciansByService: Record<string, any[]> = {};

            if (serviceIds.length > 0) {
                const { data: techAssignments } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select(`
order_product_service_id,
    technician_id,
    commission,
    status,
    assigned_at,
    technician: users!order_product_service_technicians_technician_id_fkey(id, name, phone, avatar)
                    `)
                    .in('order_product_service_id', serviceIds);

                if (techAssignments) {
                    techAssignments.forEach((ta: any) => {
                        const svcId = ta.order_product_service_id;
                        if (!techniciansByService[svcId]) {
                            techniciansByService[svcId] = [];
                        }
                        techniciansByService[svcId].push({
                            technician_id: ta.technician_id,
                            technician: ta.technician,
                            commission: ta.commission,
                            status: ta.status,
                            assigned_at: ta.assigned_at
                        });
                    });
                }
            }

            // Group services by product
            const servicesByProduct = new Map<string, any[]>();
            const productInfoMap = new Map<string, any>();

            allV2Services.forEach(item => {
                const productId = item.order_products?.id;
                const productCode = item.order_products?.product_code;

                if (!productId || !productCode) return;

                if (!servicesByProduct.has(productId)) {
                    servicesByProduct.set(productId, []);
                    productInfoMap.set(productId, {
                        id: productId,
                        product_code: productCode,
                        name: item.order_products?.name || 'Sản phẩm',
                        type: item.order_products?.type,
                        brand: item.order_products?.brand,
                        color: item.order_products?.color,
                        size: item.order_products?.size,
                        material: item.order_products?.material,
                        condition_before: item.order_products?.condition_before,
                        images: item.order_products?.images || [],
                        notes: item.order_products?.notes,
                        order: item.order_products?.orders,
                        customer: item.order_products?.orders?.customer
                    });
                }

                // Get technicians for this service
                const serviceTechnicians = techniciansByService[item.id] || [];
                // Fallback to single technician if no junction table entries
                if (serviceTechnicians.length === 0 && item.technician_id) {
                    serviceTechnicians.push({ technician_id: item.technician_id });
                }

                servicesByProduct.get(productId)!.push({
                    id: item.id,
                    item_name: item.item_name,
                    service_id: item.service_id,
                    status: item.status,
                    technician_id: item.technician_id,
                    unit_price: item.unit_price,
                    started_at: item.started_at,
                    completed_at: item.completed_at,
                    assigned_at: item.assigned_at || item.created_at,
                    technicians: serviceTechnicians
                });
            });

            // Create product-based tasks
            servicesByProduct.forEach((services, productId) => {
                const productInfo = productInfoMap.get(productId)!;

                // Determine overall status: if any service is in_progress -> in_progress, else if all completed -> completed, else assigned
                const hasInProgress = services.some((s: any) => s.status === 'in_progress');
                const allCompleted = services.every((s: any) => s.status === 'completed' || s.status === 'cancelled');
                const hasCompleted = services.some((s: any) => s.status === 'completed');

                let taskStatus = 'assigned';
                if (hasInProgress) taskStatus = 'in_progress';
                else if (allCompleted) taskStatus = 'completed';
                else if (hasCompleted) taskStatus = 'partially_completed';

                // Get earliest start and latest completion
                const startedServices = services.filter((s: any) => s.started_at);
                const completedServices = services.filter((s: any) => s.completed_at);
                const earliestStart = startedServices.length > 0
                    ? startedServices.reduce((earliest: string, s: any) =>
                        !earliest || new Date(s.started_at) < new Date(earliest) ? s.started_at : earliest, null)
                    : null;
                const latestComplete = completedServices.length > 0
                    ? completedServices.reduce((latest: string, s: any) =>
                        !latest || new Date(s.completed_at) > new Date(latest) ? s.completed_at : latest, null)
                    : null;

                allTasks.push({
                    id: productId, // Use product ID as task ID
                    task_code: 'PROD-' + productInfo.product_code,
                    item_code: productInfo.product_code,
                    order_id: productInfo.order?.id,
                    order_product_id: productId,
                    technician_id: userId,
                    service_name: productInfo.name, // Product name
                    product_name: productInfo.name,
                    product_type: productInfo.type,
                    product_brand: productInfo.brand,
                    product_color: productInfo.color,
                    product_size: productInfo.size,
                    product_material: productInfo.material,
                    product_condition_before: productInfo.condition_before,
                    product_images: productInfo.images,
                    product_notes: productInfo.notes,
                    quantity: 1,
                    status: taskStatus,
                    priority: 'normal',
                    scheduled_date: null,
                    scheduled_time: null,
                    started_at: earliestStart,
                    completed_at: latestComplete,
                    assigned_at: services[0]?.assigned_at || new Date().toISOString(),
                    created_at: services[0]?.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    order: productInfo.order ? {
                        order_code: productInfo.order.order_code,
                        customer: productInfo.order.customer
                    } : undefined,
                    customer: productInfo.order?.customer,
                    // Include all services assigned to this technician
                    services: services.map((s: any) => ({
                        id: s.id,
                        name: s.item_name,
                        status: s.status,
                        unit_price: s.unit_price,
                        started_at: s.started_at,
                        completed_at: s.completed_at,
                        technicians: s.technicians
                    })),
                    services_count: services.length,
                    is_virtual: true,
                    type: 'v2_product'
                });
            });
        }

        // Process Workflow Steps
        if (workflowSteps) {
            const stepItems = workflowSteps.map(step => {
                let taskStatus = 'assigned';
                if (step.status === 'in_progress') taskStatus = 'in_progress';
                else if (step.status === 'completed') taskStatus = 'completed';
                else if (step.status === 'skipped') taskStatus = 'cancelled';
                else if (step.status === 'pending') taskStatus = 'assigned';

                // Determine parent service name and order info
                let serviceName = step.step_name;
                let parentServiceName = '';
                let orderInfo = null;
                let customerInfo = null;

                if (step.order_product_services) {
                    parentServiceName = step.order_product_services.item_name;
                    orderInfo = step.order_product_services.order_products?.orders;
                    customerInfo = orderInfo?.customer;
                } else if (step.order_items) {
                    parentServiceName = step.order_items.item_name;
                    orderInfo = step.order_items.orders;
                    customerInfo = orderInfo?.customer;
                }

                return {
                    id: step.id,
                    task_code: 'STEP-' + step.step_order, // Simple display code
                    item_code: null,
                    order_id: orderInfo?.id,
                    technician_id: userId,
                    service_name: `${step.step_name} (${parentServiceName})`,
                    quantity: 1,
                    status: taskStatus,
                    priority: 'normal',
                    scheduled_date: null,
                    scheduled_time: null,
                    started_at: step.started_at || null,
                    completed_at: step.completed_at || null,
                    assigned_at: step.created_at,
                    created_at: step.created_at,
                    updated_at: step.created_at,
                    order: orderInfo ? {
                        order_code: orderInfo.order_code,
                        customer: customerInfo
                    } : undefined,
                    customer: customerInfo,
                    is_virtual: true,
                    type: 'workflow_step',
                    is_step: true,
                    step_id: step.id
                };
            });
            allTasks.push(...stepItems);
        }

        res.json(allTasks);
    } catch (error) {
        next(error);
    }
});

// Get stats summary
router.get('/stats/summary', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const isTechnician = req.user?.role === 'technician';

        if (isTechnician && !userId) {
            return res.json({
                total: 0, pending: 0, assigned: 0, in_progress: 0,
                completed: 0, cancelled: 0, total_duration: 0, avg_rating: 0
            });
        }

        // Get technician_tasks
        let tasksQuery = supabase.from('technician_tasks').select('status, duration_minutes, rating, item_code');

        if (isTechnician && userId) {
            tasksQuery = tasksQuery.eq('technician_id', userId);
        }

        const { data: tasks, error } = await tasksQuery;
        if (error) throw error;

        // Also get order_items assigned to this technician
        let orderItemsStats = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
        if (isTechnician && userId) {
            const taskItemCodes = new Set((tasks || []).map(t => t.item_code).filter(Boolean));

            const { data: orderItems } = await supabase
                .from('order_items')
                .select('status, item_code')
                .eq('technician_id', userId)
                .not('item_code', 'is', null);

            // Count items not in technician_tasks
            (orderItems || []).forEach(item => {
                if (item.item_code && !taskItemCodes.has(item.item_code)) {
                    if (item.status === 'pending') orderItemsStats.pending++;
                    else if (item.status === 'in_progress') orderItemsStats.in_progress++;
                    else if (item.status === 'completed') orderItemsStats.completed++;
                    else if (item.status === 'cancelled') orderItemsStats.cancelled++;
                    else orderItemsStats.pending++; // default to pending/assigned
                }
            });
        }

        const stats = {
            total: (tasks?.length || 0) + orderItemsStats.pending + orderItemsStats.in_progress + orderItemsStats.completed + orderItemsStats.cancelled,
            pending: (tasks?.filter(t => t.status === 'pending').length || 0) + orderItemsStats.pending,
            assigned: (tasks?.filter(t => t.status === 'assigned').length || 0) + orderItemsStats.pending,
            in_progress: (tasks?.filter(t => t.status === 'in_progress').length || 0) + orderItemsStats.in_progress,
            completed: (tasks?.filter(t => t.status === 'completed').length || 0) + orderItemsStats.completed,
            cancelled: (tasks?.filter(t => t.status === 'cancelled').length || 0) + orderItemsStats.cancelled,
            total_duration: tasks?.reduce((sum, t) => sum + (t.duration_minutes || 0), 0) || 0,
            avg_rating: (() => {
                const rated = tasks?.filter(t => t.rating !== null) || [];
                if (rated.length === 0) return 0;
                return rated.reduce((sum, t) => sum + (t.rating || 0), 0) / rated.length;
            })()
        };

        res.json(stats);
    } catch (error) {
        next(error);
    }
});

// Get task by item_code (for QR code scanning)
router.get('/by-code/:itemCode', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { itemCode } = req.params;

        const { data, error } = await supabase
            .from('technician_tasks')
            .select(`
    *,
    order: orders(order_code, customer: customers(*)),
        service: services(*),
            technician: users!technician_tasks_technician_id_fkey(id, name, phone, avatar),
                customer: customers(*)
                    `)
            .eq('item_code', itemCode)
            .single();

        if (!error && data) {
            return res.json({ ...data, type: 'task' });
        }

        const { data: orderItem, error: itemError } = await supabase
            .from('order_items')
            .select(`
                    *,
                    order: orders(id, order_code, status, customer: customers(*)),
                        service: services(*),
                            technician: users(id, name, phone, avatar)
                                `)
            .eq('item_code', itemCode)
            .single();

        // If V1 item not found, try V2 product (order_products)
        if (itemError || !orderItem) {
            const userId = req.user?.id;

            const { data: v2Product, error: v2Error } = await supabaseAdmin
                .from('order_products')
                .select(`
id,
    name,
    product_code,
    type,
    brand,
    color,
    size,
    material,
    condition_before,
    images,
    notes,
    orders(id, order_code, status, customer: customers(*)),
    order_product_services(
        id,
        item_name,
        status,
        technician_id,
        unit_price,
        started_at,
        completed_at,
        assigned_at,
        users(id, name, phone, avatar)
    )
        `)
                .eq('product_code', itemCode)
                .single();

            if (v2Error || !v2Product) {
                return res.status(404).json({ message: 'Không tìm thấy mã QR này' });
            }

            // Fetch technicians from junction table for all services
            const serviceIds = (v2Product.order_product_services || []).map((s: any) => s.id).filter(Boolean);
            let techniciansByService: Record<string, any[]> = {};

            if (serviceIds.length > 0) {
                const { data: techAssignments } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select(`
order_product_service_id,
    technician_id,
    commission,
    status,
    assigned_at,
    technician: users!order_product_service_technicians_technician_id_fkey(id, name, phone, avatar)
        `)
                    .in('order_product_service_id', serviceIds);

                if (techAssignments) {
                    techAssignments.forEach((ta: any) => {
                        const svcId = ta.order_product_service_id;
                        if (!techniciansByService[svcId]) {
                            techniciansByService[svcId] = [];
                        }
                        techniciansByService[svcId].push({
                            technician_id: ta.technician_id,
                            technician: ta.technician,
                            commission: ta.commission,
                            status: ta.status,
                            assigned_at: ta.assigned_at
                        });
                    });
                }
            }

            // Filter services assigned to current technician (check both single technician and junction table)
            const assignedServices = (v2Product.order_product_services || []).filter((s: any) => {
                // Check single technician assignment (convert to string for comparison)
                if (String(s.technician_id) === String(userId)) return true;
                // Check junction table assignments
                const serviceTechnicians = techniciansByService[s.id] || [];
                return serviceTechnicians.some((t: any) => String(t.technician_id) === String(userId));
            });

            // If no services assigned to this technician, return product info only
            if (assignedServices.length === 0) {
                return res.json({
                    id: v2Product.id,
                    type: 'v2_product',
                    item_code: v2Product.product_code,
                    product_name: v2Product.name,
                    product_type: v2Product.type,
                    product_brand: v2Product.brand,
                    product_color: v2Product.color,
                    product_size: v2Product.size,
                    product_material: v2Product.material,
                    product_condition_before: v2Product.condition_before,
                    product_images: v2Product.images || [],
                    product_notes: v2Product.notes,
                    quantity: 1,
                    status: 'not_assigned',
                    order: v2Product.orders,
                    customer: (v2Product.orders as any)?.customer,
                    order_product_id: v2Product.id,
                    services: [] // No services assigned to this technician
                });
            }

            // Process assigned services
            const servicesData = assignedServices.map((s: any) => {
                // Get technicians array from junction table, fallback to single technician
                let technicians: any[] = techniciansByService[s.id] || [];
                if (technicians.length === 0 && s.technician_id && s.users) {
                    technicians = [{
                        technician_id: s.technician_id,
                        technician: s.users
                    }];
                }

                return {
                    id: s.id,
                    name: s.item_name,
                    status: s.status,
                    unit_price: s.unit_price,
                    started_at: s.started_at,
                    completed_at: s.completed_at,
                    assigned_at: s.assigned_at,
                    technicians: technicians
                };
            });

            // Determine overall status
            const hasInProgress = servicesData.some((s: any) => s.status === 'in_progress');
            const allCompleted = servicesData.every((s: any) => s.status === 'completed' || s.status === 'cancelled');
            const hasCompleted = servicesData.some((s: any) => s.status === 'completed');

            let overallStatus = 'assigned';
            if (hasInProgress) overallStatus = 'in_progress';
            else if (allCompleted) overallStatus = 'completed';
            else if (hasCompleted) overallStatus = 'partially_completed';

            // Get earliest start and latest completion
            const startedServices = servicesData.filter((s: any) => s.started_at);
            const completedServices = servicesData.filter((s: any) => s.completed_at);
            const earliestStart = startedServices.length > 0
                ? startedServices.reduce<string | null>((acc, s: any) => {
                    const t = s.started_at ?? null;
                    if (!t) return acc;
                    if (!acc) return t;
                    return new Date(t) < new Date(acc) ? t : acc;
                }, null)
                : null;
            const latestComplete = completedServices.length > 0
                ? completedServices.reduce<string | null>((acc, s: any) => {
                    const t = s.completed_at ?? null;
                    if (!t) return acc;
                    if (!acc) return t;
                    return new Date(t) > new Date(acc) ? t : acc;
                }, null)
                : null;

            return res.json({
                id: v2Product.id,
                type: 'v2_product',
                item_code: v2Product.product_code,
                product_name: v2Product.name,
                product_type: v2Product.type,
                product_brand: v2Product.brand,
                product_color: v2Product.color,
                product_size: v2Product.size,
                product_material: v2Product.material,
                product_condition_before: v2Product.condition_before,
                product_images: v2Product.images || [],
                product_notes: v2Product.notes,
                quantity: 1,
                status: overallStatus,
                started_at: earliestStart,
                completed_at: latestComplete,
                order: v2Product.orders,
                customer: (v2Product.orders as any)?.customer,
                order_product_id: v2Product.id,
                services: servicesData, // All services assigned to this technician
                services_count: servicesData.length
            });
        }

        return res.json({
            id: orderItem.id,
            type: 'order_item',
            item_code: orderItem.item_code,
            service_name: orderItem.item_name,
            quantity: orderItem.quantity,
            unit_price: orderItem.unit_price,
            total_price: orderItem.total_price,
            item_type: orderItem.item_type,
            status: orderItem.technician_id ? 'assigned' : 'not_assigned',
            order: orderItem.order,
            service: orderItem.service,
            technician: orderItem.technician,
            customer: orderItem.order?.customer,
        });
    } catch (error) {
        next(error);
    }
});

// Get single task
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('technician_tasks')
            .select(`
        *,
        order: orders(order_code, customer: customers(*)),
            service: services(*),
                technician: users!technician_tasks_technician_id_fkey(name, phone, avatar, department, departments!department_id(name)),
                    customer: customers(*)
                        `)
            .eq('id', id)
            .single();

        if (error) throw error;

        if (data && data.technician) {
            // Fetch department name if UUID is stored in legacy field
            let deptName = data.technician.departments?.name || data.technician.department;
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (deptName && uuidRegex.test(deptName)) {
                const { data: dept } = await supabaseAdmin.from('departments').select('name').eq('id', deptName).single();
                if (dept) deptName = dept.name;
            }
            data.technician.department = deptName || null;
        }

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Create task
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const taskCode = await generateTaskCode();

        const { data, error } = await supabase
            .from('technician_tasks')
            .insert({
                ...req.body,
                task_code: taskCode,
                created_by: userId
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        next(error);
    }
});

// Create tasks from order items
router.post('/from-order/:orderId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const { orderId } = req.params;
        const { technician_id, scheduled_date, scheduled_time } = req.body;

        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
                        *,
                        customer: customers(id, name, phone, address),
                            items: order_items(*)
                                `)
            .eq('id', orderId)
            .single();

        if (orderError) throw orderError;

        const serviceItems = order.items.filter((item: { item_type: string }) => item.item_type === 'service');

        if (serviceItems.length === 0) {
            return res.status(400).json({ message: 'Đơn hàng không có dịch vụ nào' });
        }

        const tasks = [];
        for (const item of serviceItems) {
            const taskCode = await generateTaskCode();
            tasks.push({
                task_code: taskCode,
                order_id: orderId,
                order_item_id: item.id,
                service_id: item.service_id,
                customer_id: order.customer?.id,
                technician_id: technician_id || null,
                service_name: item.item_name,
                quantity: item.quantity,
                status: technician_id ? 'assigned' : 'pending',
                scheduled_date: scheduled_date || null,
                scheduled_time: scheduled_time || null,
                assigned_by: technician_id ? userId : null,
                assigned_at: technician_id ? new Date().toISOString() : null,
                created_by: userId
            });
        }

        const { data, error } = await supabase
            .from('technician_tasks')
            .insert(tasks)
            .select();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        next(error);
    }
});

// Update task
router.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('technician_tasks')
            .update({
                ...req.body,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Assign task to technician
router.put('/:id/assign', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { technician_id, scheduled_date, scheduled_time } = req.body;
        const userId = req.user?.id;

        const { data, error } = await supabase
            .from('technician_tasks')
            .update({
                technician_id,
                scheduled_date,
                scheduled_time,
                status: 'assigned',
                assigned_by: userId,
                assigned_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Start task
router.put('/:id/start', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        // First try to find in technician_tasks
        const { data: taskInfo, error: taskError } = await supabase
            .from('technician_tasks')
            .select('id, order_id')
            .eq('id', id)
            .maybeSingle();

        if (taskInfo) {
            // Update technician_tasks
            const { data, error } = await supabase
                .from('technician_tasks')
                .update({
                    status: 'in_progress',
                    started_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select('*, order_item_id')
                .single();

            if (error) throw error;

            // Also update the corresponding order_item status
            if (data.order_item_id) {
                await supabase
                    .from('order_items')
                    .update({
                        status: 'in_progress',
                        started_at: new Date().toISOString()
                    })
                    .eq('id', data.order_item_id);
                console.log('Updated order_item status to in_progress:', data.order_item_id);
            }

            // Also update order status
            if (taskInfo.order_id) {
                await supabase
                    .from('orders')
                    .update({
                        status: 'processing',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', taskInfo.order_id)
                    .eq('status', 'confirmed');
            }

            return res.json(data);
        }

        // If not found in technician_tasks, try V2 product (order_products)
        const { data: v2Product, error: v2Error } = await supabaseAdmin
            .from('order_products')
            .select(`
id,
    product_code,
    name,
    orders(id, order_code, status),
    order_product_services(
        id,
        item_name,
        status,
        technician_id,
        started_at
    )
        `)
            .eq('id', id)
            .single();

        if (v2Product && !v2Error) {
            // Fetch technicians from junction table for all services
            const serviceIds = (v2Product.order_product_services || []).map((s: any) => s.id).filter(Boolean);
            let techniciansByService: Record<string, string[]> = {};

            if (serviceIds.length > 0) {
                const { data: techAssignments } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select('order_product_service_id, technician_id')
                    .in('order_product_service_id', serviceIds);

                if (techAssignments) {
                    techAssignments.forEach((ta: any) => {
                        const svcId = ta.order_product_service_id;
                        if (!techniciansByService[svcId]) {
                            techniciansByService[svcId] = [];
                        }
                        techniciansByService[svcId].push(ta.technician_id);
                    });
                }
            }

            // Find services assigned to current technician
            const assignedServices = (v2Product.order_product_services || []).filter((s: any) => {
                // Check single technician assignment (convert to string for comparison)
                if (String(s.technician_id) === String(userId)) return true;
                // Check junction table assignments
                const serviceTechnicians = techniciansByService[s.id] || [];
                return serviceTechnicians.some((tid: string) => String(tid) === String(userId));
            });

            if (assignedServices.length === 0) {
                console.log('No services assigned to technician:', {
                    userId,
                    productId: id,
                    services: v2Product.order_product_services?.map((s: any) => ({
                        id: s.id,
                        technician_id: s.technician_id,
                        junction_technicians: techniciansByService[s.id]
                    }))
                });
                return res.status(403).json({
                    message: 'Không có dịch vụ nào được phân công cho bạn'
                });
            }

            // Start all assigned services that are not yet started
            const startTime = new Date().toISOString();
            const serviceIdsToStart = assignedServices
                .filter((s: any) => s.status !== 'in_progress' && s.status !== 'completed')
                .map((s: any) => s.id);

            if (serviceIdsToStart.length === 0) {
                // All services already started or completed
                return res.json({
                    id: v2Product.id,
                    type: 'v2_product',
                    item_code: v2Product.product_code,
                    product_name: v2Product.name,
                    status: 'in_progress',
                    started_at: assignedServices[0]?.started_at || startTime,
                    message: 'Các dịch vụ đã được bắt đầu trước đó'
                });
            }

            // Update all assigned services to in_progress
            const { data: updatedServices, error: updateError } = await supabaseAdmin
                .from('order_product_services')
                .update({
                    status: 'in_progress',
                    started_at: startTime
                })
                .in('id', serviceIdsToStart)
                .select();

            if (updateError) {
                throw updateError;
            }

            // Update order status if needed (orders relation may be single object or array per Supabase typings)
            const orderRef = Array.isArray(v2Product.orders) ? (v2Product.orders as any)[0] : v2Product.orders;
            if (orderRef?.status === 'confirmed' && orderRef?.id) {
                await supabaseAdmin
                    .from('orders')
                    .update({
                        status: 'processing',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', orderRef.id);
            }

            return res.json({
                id: v2Product.id,
                type: 'v2_product',
                item_code: v2Product.product_code,
                product_name: v2Product.name,
                status: 'in_progress',
                started_at: startTime,
                services_started: updatedServices?.length || 0,
                message: `Đã bắt đầu ${updatedServices?.length || 0} dịch vụ`
            });
        }

        // If not found in technician_tasks or V2 product, try order_item_steps (Workflow Step)
        const { data: step } = await supabaseAdmin
            .from('order_item_steps')
            .select('id, status')
            .eq('id', id)
            .maybeSingle();

        if (step) {
            const { data: updatedStep, error: stepError } = await supabaseAdmin
                .from('order_item_steps')
                .update({
                    status: 'in_progress',
                    started_at: new Date().toISOString()
                })
                .eq('id', id)
                .select(`
    *,
    order_items: order_items(id, orders: orders(id, order_code)),
        order_product_services: order_product_services(
            id,
            order_products(id, orders(id, order_code))
        )
                `)
                .single();

            if (stepError) throw stepError;

            return res.json({
                ...updatedStep,
                type: 'workflow_step',
                is_virtual: true
            });
        }

        // If nothing found, return 404
        return res.status(404).json({
            message: 'Không tìm thấy công việc'
        });
    } catch (error) {
        next(error);
    }
});

// Complete task
router.put('/:id/complete', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { notes, duration_minutes } = req.body;
        const userId = req.user?.id;

        // First try to find in technician_tasks
        const { data: task } = await supabase
            .from('technician_tasks')
            .select('id, started_at')
            .eq('id', id)
            .maybeSingle();

        if (task) {
            let actualDuration = duration_minutes;
            if (!actualDuration && task.started_at) {
                const startTime = new Date(task.started_at);
                const endTime = new Date();
                actualDuration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
            }

            const { data, error } = await supabase
                .from('technician_tasks')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    duration_minutes: actualDuration,
                    notes,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select('*, order_id, order_item_id')
                .single();

            if (error) throw error;

            // Also update the corresponding order_item status
            if (data.order_item_id) {
                await supabase
                    .from('order_items')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', data.order_item_id);
                console.log('Updated order_item status to completed:', data.order_item_id);
            }

            // Check if all tasks of this order are completed
            if (data.order_id) {
                const { data: allTasks } = await supabase
                    .from('technician_tasks')
                    .select('id, status')
                    .eq('order_id', data.order_id);

                const allCompleted = allTasks?.every(t => t.status === 'completed');

                if (allCompleted && allTasks && allTasks.length > 0) {
                    // Get order details with sale info
                    const { data: order } = await supabase
                        .from('orders')
                        .select('id, order_code, created_by, customer:customers(name)')
                        .eq('id', data.order_id)
                        .single();

                    if (order?.created_by) {
                        const customerName = (order.customer as any)?.name || 'khách hàng';
                        await supabase.from('notifications').insert({
                            user_id: order.created_by,
                            type: 'order_completed',
                            title: 'Tất cả dịch vụ đã hoàn thành',
                            message: `Đơn hàng ${order.order_code} của ${customerName} đã hoàn thành.Vui lòng liên hệ khách hàng để thanh toán.`,
                            data: { order_id: order.id, order_code: order.order_code },
                            is_read: false
                        });
                        console.log('Sent completion notification to sale:', order.created_by);
                    }
                }
            }

            return res.json(data);
        }

        // If not found in technician_tasks, try V2 product (order_products)
        const { data: v2Product, error: v2Error } = await supabaseAdmin
            .from('order_products')
            .select(`
id,
    product_code,
    name,
    orders(id, order_code, status),
    order_product_services(
        id,
        item_name,
        status,
        technician_id,
        started_at,
        completed_at
    )
        `)
            .eq('id', id)
            .single();

        if (v2Product && !v2Error) {
            // Fetch technicians from junction table for all services
            const serviceIds = (v2Product.order_product_services || []).map((s: any) => s.id).filter(Boolean);
            let techniciansByService: Record<string, string[]> = {};

            if (serviceIds.length > 0) {
                const { data: techAssignments } = await supabaseAdmin
                    .from('order_product_service_technicians')
                    .select('order_product_service_id, technician_id')
                    .in('order_product_service_id', serviceIds);

                if (techAssignments) {
                    techAssignments.forEach((ta: any) => {
                        const svcId = ta.order_product_service_id;
                        if (!techniciansByService[svcId]) {
                            techniciansByService[svcId] = [];
                        }
                        techniciansByService[svcId].push(ta.technician_id);
                    });
                }
            }

            // Find services assigned to current technician that are in progress
            const assignedServices = (v2Product.order_product_services || []).filter((s: any) => {
                // Check single technician assignment (convert to string for comparison)
                if (String(s.technician_id) === String(userId)) return true;
                // Check junction table assignments
                const serviceTechnicians = techniciansByService[s.id] || [];
                return serviceTechnicians.some((tid: string) => String(tid) === String(userId));
            }).filter((s: any) => s.status === 'in_progress');

            if (assignedServices.length === 0) {
                return res.status(403).json({
                    message: 'Không có dịch vụ nào đang thực hiện để hoàn thành'
                });
            }

            // Complete all assigned services that are in progress
            const completeTime = new Date().toISOString();
            const serviceIdsToComplete = assignedServices.map((s: any) => s.id);

            // Calculate duration for each service
            const serviceUpdates = assignedServices.map((s: any) => {
                let actualDuration = duration_minutes;
                if (!actualDuration && s.started_at) {
                    const startTime = new Date(s.started_at);
                    const endTime = new Date();
                    actualDuration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
                }
                return {
                    id: s.id,
                    duration: actualDuration
                };
            });

            // Update all assigned services to completed
            const { data: updatedServices, error: updateError } = await supabaseAdmin
                .from('order_product_services')
                .update({
                    status: 'completed',
                    completed_at: completeTime,
                    notes: notes || undefined
                })
                .in('id', serviceIdsToComplete)
                .select();

            if (updateError) {
                throw updateError;
            }

            // Check if all services of this product are completed
            const { data: allProductServices } = await supabaseAdmin
                .from('order_product_services')
                .select('id, status')
                .eq('order_product_id', v2Product.id);

            const allServicesCompleted = allProductServices?.every((s: any) =>
                s.status === 'completed' || s.status === 'cancelled'
            );

            // Update order status if all services completed
            const orderRefComplete = Array.isArray(v2Product.orders) ? (v2Product.orders as any)[0] : v2Product.orders;
            if (allServicesCompleted && orderRefComplete?.id) {
                // Use consolidated helper to check payment and update to 'done' (triggers commissions)
                await checkAndCompleteOrder(orderRefComplete.id);
            }

            return res.json({
                id: v2Product.id,
                type: 'v2_product',
                item_code: v2Product.product_code,
                product_name: v2Product.name,
                status: allServicesCompleted ? 'completed' : 'partially_completed',
                completed_at: completeTime,
                services_completed: updatedServices?.length || 0,
                message: `Đã hoàn thành ${updatedServices?.length || 0} dịch vụ`
            });
        }

        // Try order_item_steps (Workflow Step) - complete step then check next step / all-done (same as order-items complete step)
        const { data: step } = await supabaseAdmin
            .from('order_item_steps')
            .select('id, started_at, order_item_id, order_product_service_id')
            .eq('id', id)
            .maybeSingle();

        if (step) {
            let actualDuration = duration_minutes;
            if (!actualDuration && step.started_at) {
                const startTime = new Date(step.started_at);
                const endTime = new Date();
                actualDuration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
            }

            const { data: updatedStep, error: stepError } = await supabaseAdmin
                .from('order_item_steps')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    notes: notes || undefined,
                    ...(typeof actualDuration === 'number' && { duration_minutes: actualDuration })
                })
                .eq('id', id)
                .select()
                .single();

            if (stepError) throw stepError;

            const isV2 = !!updatedStep.order_product_service_id;
            const itemFilter = isV2
                ? { order_product_service_id: updatedStep.order_product_service_id }
                : { order_item_id: updatedStep.order_item_id };

            const { data: allSteps, error: stepsError } = await supabaseAdmin
                .from('order_item_steps')
                .select('id, step_order, status')
                .match(itemFilter)
                .order('step_order', { ascending: true });

            let allStepsCompleted = true;
            let nextStep: { id: string; step_order: number } | null = null;

            if (!stepsError && allSteps?.length) {
                allStepsCompleted = allSteps.every((s: { status: string }) => s.status === 'completed' || s.status === 'skipped');
                if (allStepsCompleted) {
                    if (isV2 && updatedStep.order_product_service_id) {
                        await supabaseAdmin
                            .from('order_product_services')
                            .update({ status: 'completed', completed_at: new Date().toISOString() })
                            .eq('id', updatedStep.order_product_service_id);
                    } else if (updatedStep.order_item_id) {
                        await supabaseAdmin
                            .from('order_items')
                            .update({ status: 'completed', completed_at: new Date().toISOString() })
                            .eq('id', updatedStep.order_item_id);
                    }
                } else {
                    const nextRow = allSteps.find((s: { status: string }) => s.status !== 'completed' && s.status !== 'skipped');
                    if (nextRow) nextStep = { id: nextRow.id, step_order: nextRow.step_order };
                }
            }

            return res.json({
                ...updatedStep,
                type: 'workflow_step',
                is_virtual: true,
                allStepsCompleted,
                nextStep
            });
        }

        // Try V2 service
        const { data: v2Service } = await supabaseAdmin
            .from('order_product_services')
            .select('id, started_at, order_product_id, unit_price')
            .eq('id', id)
            .maybeSingle();

        if (v2Service) {
            let actualDuration = duration_minutes;
            if (!actualDuration && v2Service.started_at) {
                const startTime = new Date(v2Service.started_at);
                const endTime = new Date();
                actualDuration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
            }

            const { data: updatedService, error: serviceError } = await supabaseAdmin
                .from('order_product_services')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (serviceError) throw serviceError;

            return res.json({
                ...updatedService,
                type: 'v2_service',
                is_virtual: true
            });
        }

        // If not found in technician_tasks, try order_items (virtual task)
        const { data: orderItem } = await supabase
            .from('order_items')
            .select('id, started_at')
            .eq('id', id)
            .maybeSingle();

        if (!orderItem) {
            return res.status(404).json({ message: 'Không tìm thấy công việc' });
        }

        let actualDuration = duration_minutes;
        if (!actualDuration && orderItem.started_at) {
            const startTime = new Date(orderItem.started_at);
            const endTime = new Date();
            actualDuration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
        }

        const { data: updatedItem, error: updateError } = await supabase
            .from('order_items')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('*, order_id')
            .single();

        if (updateError) throw updateError;

        // Check if all service items of this order are completed
        if (updatedItem.order_id) {
            const { data: orderItems } = await supabase
                .from('order_items')
                .select('id, status, item_type')
                .eq('order_id', updatedItem.order_id)
                .eq('item_type', 'service');

            const allServicesCompleted = orderItems?.every(item => item.status === 'completed');

            if (allServicesCompleted && orderItems && orderItems.length > 0) {
                // Get order details with sale info
                const { data: order } = await supabase
                    .from('orders')
                    .select('id, order_code, created_by, customer:customers(name)')
                    .eq('id', updatedItem.order_id)
                    .single();

                if (order?.created_by) {
                    // Send notification to sale
                    const customerName = (order.customer as any)?.name || 'khách hàng';
                    await supabase.from('notifications').insert({
                        user_id: order.created_by,
                        type: 'order_completed',
                        title: 'Tất cả dịch vụ đã hoàn thành',
                        message: `Đơn hàng ${order.order_code} của ${customerName} đã hoàn thành.Vui lòng liên hệ khách hàng để thanh toán.`,
                        data: { order_id: order.id, order_code: order.order_code },
                        is_read: false
                    });

                    console.log('Sent completion notification to sale:', order.created_by);
                }
            }
        }

        res.json({
            ...updatedItem,
            duration_minutes: actualDuration,
            is_virtual: true
        });
    } catch (error) {
        next(error);
    }
});

// Cancel task
router.put('/:id/cancel', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const { data, error } = await supabase
            .from('technician_tasks')
            .update({
                status: 'cancelled',
                notes,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Add customer feedback/rating
router.put('/:id/feedback', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { customer_feedback, rating } = req.body;

        const { data, error } = await supabase
            .from('technician_tasks')
            .update({
                customer_feedback,
                rating,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // 🔔 WH6: Fire webhook — Nhận Feedback
        if (customer_feedback || rating) {
            // Lấy thêm thông tin đơn hàng
            const { data: taskInfo } = await supabase
                .from('technician_tasks')
                .select('task_code, order:orders(order_code)')
                .eq('id', id)
                .single();
            const orderCode = (taskInfo?.order as any)?.order_code || 'N/A';
            fireWebhook('feedback.received', {
                task_code: taskInfo?.task_code || id,
                order_code: orderCode,
                classification: rating >= 4 ? 'Tốt' : rating <= 2 ? 'Xấu' : 'Trung bình',
                rating,
                feedback_content: customer_feedback || '',
            });
        }

        res.json(data);
    } catch (error) {
        next(error);
    }
});

// Delete task
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('technician_tasks')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Đã xóa công việc' });
    } catch (error) {
        next(error);
    }
});

export default router;
