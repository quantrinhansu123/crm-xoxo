import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { checkAndCompleteOrder } from '../utils/orderHelper.js';
import {
    buildServiceEventBase,
    getManagerRecipients,
    getServiceNotificationContext,
    notifyCrmMasterUser,
} from '../utils/n8nCrmEvents.js';
import { fireWebhook } from '../utils/webhookNotifier.js';
import { fetchProductServicesStaff, firePickupInfoWebhook } from '../utils/orderStaffHelper.js';
import {
    AFTER_SALE_STAGE_ORDER,
    CARE_STAGE_ORDER,
    WARRANTY_STAGE_ORDER,
    assertDebtCheckCompleteForStageMove,
    assertForwardStageMove,
} from '../utils/kanbanStageValidation.js';
import {
    clonePendingWorkflowStepsForService,
    isServiceActivelyInWorkflow,
} from '../utils/warrantyReentryHelper.js';

const router = Router();

// Get order product by QR code
router.get('/code/:code', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { code } = req.params;

        const { data: product, error } = await supabaseAdmin
            .from('order_products')
            .select(`
                *,
                order:orders(id, order_code, status, customer:customers(id, name, phone)),
                services:order_product_services(
                    *,
                    service:services(id, name, image),
                    package:packages(id, name),
                    technician:users!order_product_services_technician_id_fkey(id, name, avatar)
                )
            `)
            .eq('product_code', code)
            .single();

        if (error || !product) {
            throw new ApiError('Không tìm thấy sản phẩm', 404);
        }

        res.json({
            status: 'success',
            data: product
        });
    } catch (error) {
        next(error);
    }
});

// Get order product by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: product, error } = await supabaseAdmin
            .from('order_products')
            .select(`
                *,
                order:orders(id, order_code, status, customer:customers(id, name, phone)),
                services:order_product_services(
                    *,
                    service:services(id, name, image),
                    package:packages(id, name),
                    technician:users!order_product_services_technician_id_fkey(id, name, avatar)
                )
            `)
            .eq('id', id)
            .single();

        if (error || !product) {
            throw new ApiError('Không tìm thấy sản phẩm', 404);
        }

        res.json({
            status: 'success',
            data: product
        });
    } catch (error) {
        next(error);
    }
});

// Update order product fields (e.g. intake images)
router.patch('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { images } = req.body;

        if (images === undefined) {
            throw new ApiError('Không có dữ liệu cập nhật', 400);
        }

        const imageList = Array.isArray(images) ? images.filter((u: unknown) => typeof u === 'string' && u) : [];

        const { data: product, error } = await supabaseAdmin
            .from('order_products')
            .update({
                images: imageList,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('id, name, product_code, images, order_id')
            .single();

        if (error || !product) {
            throw new ApiError('Không tìm thấy sản phẩm hoặc lỗi cập nhật', 404);
        }

        res.json({
            status: 'success',
            data: product,
        });
    } catch (error) {
        next(error);
    }
});

// Update order product status
router.patch('/:id/status', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { status, reason, warranty_code } = req.body;

        const validStatuses = [
            'pending', 'processing', 'completed', 'delivered', 'cancelled',
            'step1', 'step2', 'step3', 'step4', 'step5'
        ];
        if (!validStatuses.includes(status)) {
            throw new ApiError('Trạng thái không hợp lệ', 400);
        }

        const userId = req.user?.id;
        const { data: beforeProduct } = await supabaseAdmin
            .from('order_products')
            .select('status, order_id, care_warranty_flow, care_warranty_stage')
            .eq('id', id)
            .single();
        const oldStatus = beforeProduct?.status ?? null;

        const updateData: any = {
            status,
            updated_at: new Date().toISOString()
        };

        if (warranty_code !== undefined) {
            updateData.warranty_code = warranty_code;
            updateData.care_warranty_flow = 'warranty';
        }

        if (['step1', 'step2', 'step3', 'step4'].includes(status)) {
            updateData.current_phase = 'sales';
            updateData.phase_stage = status;
        } else if (status === 'step5') {
            updateData.current_phase = 'workflow';
            updateData.phase_stage = 'waiting';
        } else if (['processing'].includes(status)) {
            updateData.current_phase = 'workflow';
            updateData.phase_stage = 'room_active';
        } else if (status === 'completed') {
            updateData.completed_at = new Date().toISOString();
            updateData.current_phase = 'workflow';
            updateData.phase_stage = 'done';
        } else if (status === 'delivered') {
            updateData.delivered_at = new Date().toISOString();
            updateData.current_phase = 'after_sale';
            updateData.phase_stage = 'after1';
        }

        const { data: product, error } = await supabaseAdmin
            .from('order_products')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('order_products status update failed:', error.message, error.details);
            throw new ApiError(`Không thể cập nhật trạng thái: ${error.message}`, 500);
        }

        if (status === 'step5') {
            const managers = await getManagerRecipients();
            for (const manager of managers) {
                notifyCrmMasterUser('workflow.item.waiting_assignment', {
                    target_user_id: manager.id,
                    target_role: manager.role || 'manager',
                    channel: 'telegram',
                    order: { id: product.order_id },
                    item: { id: product.id, service_name: product.name, deadline_at: product.due_at || null },
                    product_image_url: Array.isArray(product.images) ? product.images[0] || null : null,
                });
            }
        }

        if (beforeProduct?.order_id && oldStatus !== status) {
            try {
                await supabaseAdmin.from('order_item_status_log').insert({
                    order_id: beforeProduct.order_id,
                    entity_type: 'order_product',
                    entity_id: id,
                    from_status: oldStatus,
                    to_status: status,
                    reason: reason || null,
                    notes: warranty_code ? `Tạo HD Bảo hành: ${warranty_code}` : null,
                    photos: [],
                    created_by: userId ?? null,
                });
            } catch (logErr) {
                console.error('order_item_status_log insert error (order_product):', logErr);
            }
        }

        res.json({
            status: 'success',
            data: product,
            message: 'Đã cập nhật trạng thái sản phẩm'
        });
    } catch (error) {
        next(error);
    }
});

// Reset services of one order_product for warranty re-entry (không đụng SP/dịch vụ khác trên đơn)
router.patch('/:id/reset-services', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: product, error: productError } = await supabaseAdmin
            .from('order_products')
            .select('id, order_id, product_code')
            .eq('id', id)
            .single();

        if (productError || !product) {
            throw new ApiError('Không tìm thấy sản phẩm', 404);
        }

        const { data: services, error: fetchError } = await supabaseAdmin
            .from('order_product_services')
            .select('id, status, current_phase, item_type, service_id, package_id')
            .eq('order_product_id', id);

        if (fetchError) throw new ApiError('Không thể lấy danh sách services', 500);

        if (!services || services.length === 0) {
            return res.json({ status: 'success', data: [], message: 'Không có services nào' });
        }

        const toReset = services.filter((s) => !isServiceActivelyInWorkflow(s));
        const skipped = services.filter((s) => isServiceActivelyInWorkflow(s));

        if (toReset.length === 0) {
            return res.json({
                status: 'success',
                data: [],
                message: skipped.length > 0
                    ? `Giữ nguyên ${skipped.length} dịch vụ đang chạy trên Kanban kỹ thuật`
                    : 'Không có dịch vụ nào cần reset',
            });
        }

        const resetIds = toReset.map((s) => s.id);

        const { data: updated, error: updateError } = await supabaseAdmin
            .from('order_product_services')
            .update({
                status: 'step1',
                current_phase: 'sales',
                phase_stage: 'step1',
                completed_at: null,
                started_at: null,
            })
            .in('id', resetIds)
            .select();

        if (updateError) {
            console.error('reset-services update failed:', updateError.message, updateError.details, updateError.hint);
            throw new ApiError(`Không thể reset services: ${updateError.message}`, 500);
        }

        let clonedSteps = 0;
        for (const svc of toReset) {
            clonedSteps += await clonePendingWorkflowStepsForService(svc);
        }

        res.json({
            status: 'success',
            data: updated,
            skipped_count: skipped.length,
            message: `Đã reset ${updated?.length || 0} dịch vụ về step1${
                skipped.length > 0 ? ` (giữ ${skipped.length} DV đang ở phòng kỹ thuật)` : ''
            }${clonedSteps > 0 ? `, tạo ${clonedSteps} bước mới` : ''}`,
        });
    } catch (error) {
        next(error);
    }
});

// =====================================================
// ORDER PRODUCT SERVICES ROUTES
// =====================================================

// Assign technician(s) to a service
router.patch('/services/:serviceId/assign', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { serviceId } = req.params;
        const { technician_id, assignments } = req.body;
        const userId = req.user?.id;

        // Backward compatibility or new array format
        // assignments: [{ technician_id, commission }]
        let techAssignments: { technician_id: string; commission?: number }[] = [];

        if (assignments && Array.isArray(assignments) && assignments.length > 0) {
            techAssignments = assignments;
        } else if (technician_id) {
            techAssignments = [{ technician_id, commission: 0 }];
        } else {
            throw new ApiError('Vui lòng chọn kỹ thuật viên', 400);
        }

        const primaryTechId = techAssignments[0].technician_id;
        const { data: beforeAssignService } = await supabaseAdmin
            .from('order_product_services')
            .select('technician_id, technician:users!order_product_services_technician_id_fkey(department_id, department, departments!department_id(id, name))')
            .eq('id', serviceId)
            .maybeSingle();
        const beforeTechnician = Array.isArray(beforeAssignService?.technician) ? beforeAssignService.technician[0] : beforeAssignService?.technician;
        const beforeDepartment = Array.isArray(beforeTechnician?.departments) ? beforeTechnician.departments[0] : beforeTechnician?.departments;

        // Update main service record
        const { data: service, error } = await supabaseAdmin
            .from('order_product_services')
            .update({
                technician_id: primaryTechId,
                status: 'assigned',
                assigned_at: new Date().toISOString()
            })
            .eq('id', serviceId)
            .select('*, technician:users!order_product_services_technician_id_fkey(id, name)')
            .single();

        if (error) {
            throw new ApiError('Không thể phân công kỹ thuật viên', 500);
        }

        // Handle junction table
        // 1. Delete existing
        await supabaseAdmin.from('order_product_service_technicians').delete().eq('order_product_service_id', serviceId);

        // 2. Insert new
        const junctionRows = techAssignments.map(t => ({
            order_product_service_id: serviceId,
            technician_id: t.technician_id,
            commission: t.commission || 0,
            assigned_by: userId,
            assigned_at: new Date().toISOString(),
            status: 'assigned'
        }));

        const { error: junctionError } = await supabaseAdmin.from('order_product_service_technicians').insert(junctionRows);
        if (junctionError) {
            console.error('Error inserting order_product_service_technicians:', junctionError);
        }

        const context = await getServiceNotificationContext(serviceId);
        if (context) {
            const basePayload = buildServiceEventBase(context);
            for (const assignment of techAssignments) {
                const { data: technician } = await supabaseAdmin
                    .from('users')
                    .select('id, name, role, telegram_chat_id, department_id, department, departments!department_id(id, name)')
                    .eq('id', assignment.technician_id)
                    .maybeSingle();

                if (!technician?.id) continue;
                const department = Array.isArray(technician.departments) ? technician.departments[0] : technician.departments;
                const room = {
                    id: technician.department_id || null,
                    name: department?.name || technician.department || null,
                };
                notifyCrmMasterUser(beforeAssignService?.technician_id && beforeAssignService.technician_id !== technician.id ? 'workflow.item.technician_changed' : 'workflow.item.assigned', {
                    ...basePayload,
                    item: {
                        ...basePayload.item,
                        room_id: room.id,
                        room_name: room.name,
                    },
                    target_user_id: technician.id,
                    target_role: 'technician',
                    channel: 'telegram',
                    staff: {
                        id: technician.id,
                        name: technician.name,
                        role: technician.role || 'technician',
                        telegram_chat_id: technician.telegram_chat_id || null,
                        room_id: room.id,
                        room_name: room.name,
                    },
                });
                const previousRoomId = beforeTechnician?.department_id || null;
                const previousRoomName = beforeDepartment?.name || beforeTechnician?.department || null;
                if (room.id && room.id !== previousRoomId) {
                    notifyCrmMasterUser('workflow.item.room_changed', {
                        ...basePayload,
                        item: {
                            ...basePayload.item,
                            room_id: room.id,
                            room_name: room.name,
                            previous_room_id: previousRoomId,
                            previous_room_name: previousRoomName,
                        },
                        target_user_id: technician.id,
                        target_role: 'technician',
                        channel: 'telegram',
                        staff: {
                            id: technician.id,
                            name: technician.name,
                            role: technician.role || 'technician',
                            telegram_chat_id: technician.telegram_chat_id || null,
                            room_id: room.id,
                            room_name: room.name,
                        },
                    });
                }
            }
        }

        res.json({
            status: 'success',
            data: service,
            message: 'Đã phân công kỹ thuật viên'
        });
    } catch (error) {
        next(error);
    }
});

// Start service
router.patch('/services/:serviceId/start', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { serviceId } = req.params;

        const { data: service, error } = await supabaseAdmin
            .from('order_product_services')
            .update({
                status: 'in_progress',
                started_at: new Date().toISOString()
            })
            .eq('id', serviceId)
            .select()
            .single();

        if (error) {
            throw new ApiError('Không thể bắt đầu dịch vụ', 500);
        }

        // Update order_product status to processing if pending
        if (service.order_product_id) {
            await supabaseAdmin
                .from('order_products')
                .update({ status: 'processing' })
                .eq('id', service.order_product_id)
                .eq('status', 'pending');

            // Also update parent order status to 'in_progress' if it's not already
            const { data: op } = await supabaseAdmin
                .from('order_products')
                .select('order_id, order:orders(status)')
                .eq('id', service.order_product_id)
                .single();

            if (op && op.order_id) {
                const orderData = Array.isArray(op.order) ? op.order[0] : op.order;
                if (orderData?.status !== 'in_progress' && orderData?.status !== 'completed' && orderData?.status !== 'cancelled') {
                    await supabaseAdmin
                        .from('orders')
                        .update({ status: 'in_progress' })
                        .eq('id', op.order_id);
                }
            }
        }

        res.json({
            status: 'success',
            data: service,
            message: 'Đã bắt đầu dịch vụ'
        });
    } catch (error) {
        next(error);
    }
});

// Complete service
router.patch('/services/:serviceId/complete', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { serviceId } = req.params;
        const { notes } = req.body;

        const { data: service, error } = await supabaseAdmin
            .from('order_product_services')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                notes: notes || null
            })
            .eq('id', serviceId)
            .select()
            .single();

        if (error) {
            throw new ApiError('Không thể hoàn thành dịch vụ', 500);
        }

        const context = await getServiceNotificationContext(serviceId);
        if (context) {
            const basePayload = buildServiceEventBase(context);
            const managers = await getManagerRecipients();
            for (const manager of managers) {
                notifyCrmMasterUser('workflow.item.completed_step', {
                    ...basePayload,
                    target_user_id: manager.id,
                    target_role: manager.role || 'manager',
                    channel: 'telegram',
                    staff: context.technician ? {
                        id: context.technician.id,
                        name: context.technician.name,
                        role: context.technician.role || 'technician',
                        telegram_chat_id: context.technician.telegram_chat_id || null,
                    } : null,
                });
            }
        }

        // Check if all services for this product are completed
        const { data: allServices } = await supabaseAdmin
            .from('order_product_services')
            .select('status')
            .eq('order_product_id', service.order_product_id);

        const allCompleted = allServices?.every(s => s.status === 'completed' || s.status === 'cancelled');

        // If all services completed, update product status and check parent order
        if (allCompleted) {
            await supabaseAdmin
                .from('order_products')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString()
                })
                .eq('id', service.order_product_id);

            // Check if parent order can be completed
            const { data: op } = await supabaseAdmin
                .from('order_products')
                .select('order_id')
                .eq('id', service.order_product_id)
                .single();

            if (op && op.order_id) {
                await checkAndCompleteOrder(op.order_id);
            }
        }

        res.json({
            status: 'success',
            data: service,
            message: 'Đã hoàn thành dịch vụ',
            allServicesCompleted: allCompleted
        });
    } catch (error) {
        next(error);
    }
});

// Get product status summary with unified timeline
router.get('/:id/status-summary', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Get product with all services and their steps
        const { data: product, error: productError } = await supabaseAdmin
            .from('order_products')
            .select(`
                id,
                name,
                product_code,
                completion_percentage,
                overall_status,
                total_workflow_steps,
                completed_workflow_steps,
                earliest_started_at,
                latest_completed_at,
                product_total_duration_minutes,
                product_estimated_duration_minutes,
                services:order_product_services(
                    id,
                    item_name,
                    status,
                    started_at,
                    completed_at,
                    service:services(id, name),
                    steps:order_item_steps(
                        id,
                        step_order,
                        step_name,
                        status,
                        department:departments(id, name),
                        technician:users!order_item_steps_technician_id_fkey(id, name),
                        estimated_duration,
                        started_at,
                        completed_at,
                        notes
                    )
                )
            `)
            .eq('id', id)
            .single();

        if (productError || !product) {
            throw new ApiError('Không tìm thấy sản phẩm', 404);
        }

        // Build services array with completion percentage
        const services = (product.services || []).map((service: any) => {
            const steps = service.steps || [];
            const totalSteps = steps.length;
            const completedSteps = steps.filter((s: any) =>
                s.status === 'completed' || s.status === 'skipped'
            ).length;
            const serviceCompletionPct = totalSteps > 0
                ? Math.round((completedSteps * 100) / totalSteps)
                : 0;

            return {
                id: service.id,
                name: service.item_name,
                status: service.status,
                completion_percentage: serviceCompletionPct,
                started_at: service.started_at,
                completed_at: service.completed_at,
                steps: steps.sort((a: any, b: any) => a.step_order - b.step_order)
            };
        });

        // Build unified timeline (all steps from all services, sorted chronologically)
        const allSteps: any[] = [];
        (product.services || []).forEach((service: any) => {
            (service.steps || []).forEach((step: any) => {
                allSteps.push({
                    step_id: step.id,
                    step_order: step.step_order,
                    step_name: step.step_name,
                    service_id: service.id,
                    service_name: service.item_name,
                    department_id: step.department?.id,
                    department_name: step.department?.name,
                    technician_id: step.technician?.id,
                    technician_name: step.technician?.name,
                    status: step.status,
                    estimated_duration: step.estimated_duration,
                    started_at: step.started_at,
                    completed_at: step.completed_at,
                    notes: step.notes
                });
            });
        });

        // Sort timeline by step_order, then by started_at if available
        allSteps.sort((a, b) => {
            if (a.step_order !== b.step_order) {
                return a.step_order - b.step_order;
            }
            if (a.started_at && b.started_at) {
                return new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
            }
            return 0;
        });

        res.json({
            status: 'success',
            data: {
                product_id: product.id,
                product_name: product.name,
                product_code: product.product_code,
                completion_percentage: product.completion_percentage || 0,
                overall_status: product.overall_status || 'pending',
                total_steps: product.total_workflow_steps || 0,
                completed_steps: product.completed_workflow_steps || 0,
                earliest_started_at: product.earliest_started_at,
                latest_completed_at: product.latest_completed_at,
                total_duration_minutes: product.product_total_duration_minutes,
                estimated_duration_minutes: product.product_estimated_duration_minutes,
                services,
                timeline: allSteps
            }
        });
    } catch (error) {
        next(error);
    }
});

// Recalculate product status manually
router.post('/:id/recalculate-status', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Trigger recalculation by updating a dummy field (triggers will fire)
        const { data: product, error } = await supabaseAdmin
            .from('order_products')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Không thể tính toán lại trạng thái', 500);
        }

        // Fetch updated product with calculated fields
        const { data: updatedProduct } = await supabaseAdmin
            .from('order_products')
            .select('completion_percentage, overall_status, total_workflow_steps, completed_workflow_steps')
            .eq('id', id)
            .single();

        res.json({
            status: 'success',
            data: updatedProduct,
            message: 'Đã tính toán lại trạng thái sản phẩm'
        });
    } catch (error) {
        next(error);
    }
});

// Update after-sale data for product
router.patch('/:id/after-sale-data', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { 
            completion_photos, packaging_photos, delivery_code, delivery_carrier, delivery_type, 
            stage, due_at, sales_step_data,
            care_warranty_flow, care_warranty_stage
        } = req.body;
        const userId = req.user?.id;

        const updatePayload: any = { updated_at: new Date().toISOString() };
        if (completion_photos !== undefined) updatePayload.completion_photos = Array.isArray(completion_photos) ? completion_photos : [];
        if (packaging_photos !== undefined) updatePayload.packaging_photos = Array.isArray(packaging_photos) ? packaging_photos : [];
        if (delivery_code !== undefined) updatePayload.delivery_code = delivery_code;
        if (delivery_carrier !== undefined) updatePayload.delivery_carrier = delivery_carrier;
        if (delivery_type !== undefined) updatePayload.delivery_type = delivery_type;
        if (stage !== undefined) updatePayload.after_sale_stage = stage;
        if (due_at !== undefined) updatePayload.due_at = due_at ? new Date(due_at).toISOString() : null;
        if (sales_step_data !== undefined) updatePayload.sales_step_data = sales_step_data;
        if (care_warranty_flow !== undefined) updatePayload.care_warranty_flow = care_warranty_flow;
        if (care_warranty_stage !== undefined) updatePayload.care_warranty_stage = care_warranty_stage;

        const { data: currentItem } = await supabaseAdmin.from('order_products').select('after_sale_stage, order_id, current_phase, care_warranty_flow, care_warranty_stage').eq('id', id).single();
        const oldCareFlow = currentItem?.care_warranty_flow ?? null;
        const oldCareStage = currentItem?.care_warranty_stage ?? null;

        if (care_warranty_flow !== undefined) {
            if (care_warranty_flow === 'warranty') {
                updatePayload.current_phase = 'warranty';
                updatePayload.phase_stage = care_warranty_stage || 'war1';
            } else if (care_warranty_flow === 'care') {
                updatePayload.current_phase = 'care';
                updatePayload.phase_stage = care_warranty_stage || 'care6';
            }
        } else if (care_warranty_stage !== undefined && !care_warranty_flow) {
            const curPhase = currentItem?.current_phase;
            if (curPhase === 'care' || curPhase === 'warranty') {
                updatePayload.phase_stage = care_warranty_stage;
            }
        }

        if (stage !== undefined && care_warranty_flow === undefined) {
            updatePayload.current_phase = 'after_sale';
            updatePayload.phase_stage = stage;
        }
        const oldStage = currentItem?.after_sale_stage || 'after1';

        if (stage !== undefined && stage !== oldStage) {
            assertForwardStageMove(AFTER_SALE_STAGE_ORDER, oldStage, stage);
            if (oldStage === 'after1_debt' && stage === 'after2' && currentItem?.order_id) {
                const { data: orderRow } = await supabaseAdmin
                    .from('orders')
                    .select('debt_checked, debt_checked_by_name')
                    .eq('id', currentItem.order_id)
                    .single();
                assertDebtCheckCompleteForStageMove(oldStage, stage, orderRow);
            }
        }

        const newCareFlowForCheck = care_warranty_flow !== undefined ? care_warranty_flow : oldCareFlow;
        if (
            care_warranty_stage !== undefined
            && care_warranty_stage !== oldCareStage
            && newCareFlowForCheck
            && newCareFlowForCheck === oldCareFlow
        ) {
            const cols = newCareFlowForCheck === 'warranty' ? WARRANTY_STAGE_ORDER : CARE_STAGE_ORDER;
            assertForwardStageMove(cols, oldCareStage, care_warranty_stage);
        }

        const { data: product, error } = await supabaseAdmin
            .from('order_products')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new ApiError('Không thể cập nhật thông tin after-sale', 500);
        }

        // Đồng bộ bước xuống dịch vụ của đúng sản phẩm này (không đụng SP khác trên đơn)
        if (stage !== undefined && care_warranty_flow === undefined && product?.id) {
            await supabaseAdmin
                .from('order_product_services')
                .update({
                    current_phase: 'after_sale',
                    phase_stage: stage,
                    after_sale_stage: stage,
                })
                .eq('order_product_id', id);
        }

        // 🔔 WH1: Fire webhook — Lưu thông tin nhận đồ (khi sales_step_data được cập nhật)
        if (sales_step_data !== undefined) {
            const stepDataObj = typeof sales_step_data === 'object' ? sales_step_data : {};
            try {
                await firePickupInfoWebhook(supabaseAdmin, id, stepDataObj);
            } catch (whErr) {
                console.error('pickup_info.saved webhook error:', whErr);
            }
        }

        // Record log if stage changed
        if (stage !== undefined && oldStage !== stage) {
            await supabaseAdmin.from('order_after_sale_stage_log').insert({
                order_id: product.order_id,
                entity_type: 'order_product',
                entity_id: id,
                from_stage: oldStage,
                to_stage: stage,
                created_by: userId
            });
        }

        const newCareFlow = care_warranty_flow !== undefined ? (care_warranty_flow || null) : oldCareFlow;
        const newCareStage = care_warranty_stage !== undefined ? (care_warranty_stage || null) : oldCareStage;
        const careChanged = (care_warranty_flow !== undefined || care_warranty_stage !== undefined)
            && (oldCareFlow !== newCareFlow || oldCareStage !== newCareStage)
            && newCareStage;
        if (careChanged && product.order_id) {
            const flowType = newCareFlow === 'warranty' || ['war1', 'war2', 'war3'].includes(newCareStage)
                ? 'warranty'
                : 'care';
            try {
                const careRow: Record<string, unknown> = {
                    order_id: product.order_id,
                    entity_type: 'order_product',
                    entity_id: id,
                    from_stage: oldCareStage,
                    to_stage: newCareStage,
                    flow_type: flowType,
                    created_by: userId ?? null,
                };
                await supabaseAdmin.from('order_care_warranty_log').insert(careRow);
            } catch (logErr) {
                try {
                    await supabaseAdmin.from('order_care_warranty_log').insert({
                        order_id: product.order_id,
                        from_stage: oldCareStage,
                        to_stage: newCareStage,
                        flow_type: flowType,
                        created_by: userId ?? null,
                    });
                } catch (fallbackErr) {
                    console.error('order_care_warranty_log insert error (order_product):', logErr, fallbackErr);
                }
            }
        }

        // Set debt_start_at on parent order when product transitions to after1_debt (only if not already set)
        if (stage === 'after1_debt' && product.order_id) {
            try {
                const { data: parentOrder } = await supabaseAdmin
                    .from('orders')
                    .select('debt_start_at')
                    .eq('id', product.order_id)
                    .single();

                if (!parentOrder?.debt_start_at) {
                    await supabaseAdmin
                        .from('orders')
                        .update({ debt_start_at: new Date().toISOString() })
                        .eq('id', product.order_id);
                }
            } catch (debtErr) {
                console.error('Error setting debt_start_at on parent order:', debtErr);
            }
        }

        if (stage === 'after1_debt' && oldStage !== 'after1_debt' && product.order_id) {
            try {
                const { data: orderCtx } = await supabaseAdmin
                    .from('orders')
                    .select('order_code')
                    .eq('id', product.order_id)
                    .maybeSingle();
                const staff = await fetchProductServicesStaff(supabaseAdmin, product.id);
                const assignedSales = staff.sales;

                fireWebhook('sale.commission_ready', {
                    order_id: product.order_id,
                    order_code: (orderCtx as any)?.order_code || 'N/A',
                    order_product_id: product.id,
                    product_code: product.product_code || null,
                    product_name: product.name || 'N/A',
                    stage: 'after1_debt',
                    sales_users: assignedSales,
                    sale_id: assignedSales[0]?.id || null,
                    sale_name: assignedSales.map((s) => s.name).join(', ') || null,
                    tele_id_sale: assignedSales[0]?.telegram_chat_id || null,
                });
            } catch (commissionWhErr) {
                console.error('Error firing sale.commission_ready webhook for order product:', commissionWhErr);
            }
        }

        res.json({
            status: 'success',
            data: product,
            message: 'Đã cập nhật thông tin after-sale'
        });
    } catch (error) {
        next(error);
    }
});

export default router;

