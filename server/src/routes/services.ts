import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';

const router = Router();

// Get all services
router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { category, status, search } = req.query;

        let query = supabaseAdmin
            .from('services')
            .select('*')
            .order('created_at', { ascending: false });

        if (category) query = query.eq('category', category);
        if (status) query = query.eq('status', status);
        if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

        const { data: services, error } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách dịch vụ', 500);
        }

        res.json({
            status: 'success',
            data: { services },
        });
    } catch (error) {
        next(error);
    }
});

// Get service by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: service, error } = await supabaseAdmin
            .from('services')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !service) {
            throw new ApiError('Không tìm thấy dịch vụ', 404);
        }

        res.json({
            status: 'success',
            data: { service },
        });
    } catch (error) {
        next(error);
    }
});

// Create service
router.post('/', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { name, category, price, duration, description, commission_rate, applicable_product_types, commission_sale, commission_tech } = req.body;

        if (!name || !price) {
            throw new ApiError('Tên và giá dịch vụ là bắt buộc', 400);
        }

        // Auto-generate service code if not provided
        let code = req.body.code;
        if (!code) {
            // Get the latest service to generate next code
            const { data: latestService } = await supabaseAdmin
                .from('services')
                .select('code')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (latestService && latestService.code) {
                // Extract number from code (e.g., DV001 -> 1)
                const match = latestService.code.match(/\d+$/);
                const nextNum = match ? parseInt(match[0]) + 1 : 1;
                code = `DV${String(nextNum).padStart(3, '0')}`;
            } else {
                code = 'DV001';
            }
        }

        const { data: service, error } = await supabaseAdmin
            .from('services')
            .insert({
                code,
                name,
                category,
                price,
                duration,
                description,
                commission_rate: commission_rate || 5,
                commission_sale: commission_sale || 0,
                commission_tech: commission_tech || 0,
                applicable_product_types: applicable_product_types || null,
                status: 'active',
                created_by: req.user!.id,
            })
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi tạo dịch vụ: ' + error.message, 500);
        }

        res.status(201).json({
            status: 'success',
            data: { service },
        });
    } catch (error) {
        next(error);
    }
});

// Update service
router.put('/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const updateFields = req.body;
        
        const { data: service, error } = await supabaseAdmin
            .from('services')
            .update({ ...updateFields, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật dịch vụ: ' + error.message, 500);
        }

        if (!service || service.length === 0) {
            throw new ApiError('Không tìm thấy dịch vụ để cập nhật', 404);
        }

        res.json({
            status: 'success',
            data: { service: service[0] },
        });
    } catch (error) {
        next(error);
    }
});

// Delete service (soft delete)
router.delete('/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('services')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            throw new ApiError('Lỗi khi xóa dịch vụ', 500);
        }

        res.json({
            status: 'success',
            message: 'Đã vô hiệu hóa dịch vụ',
        });
    } catch (error) {
        next(error);
    }
});

// Get packages
router.get('/packages/list', authenticate, async (req, res, next) => {
    try {
        const { data: packages, error } = await supabaseAdmin
            .from('packages')
            .select('*, items:package_items(*, service:services(*))')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách gói dịch vụ', 500);
        }

        res.json({
            status: 'success',
            data: { packages },
        });
    } catch (error) {
        next(error);
    }
});

// Get vouchers
router.get('/vouchers/list', authenticate, async (req, res, next) => {
    try {
        const { data: vouchers, error } = await supabaseAdmin
            .from('vouchers')
            .select('*')
            .order('created_at', { ascending: false });

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

// ============ SERVICE-DEPARTMENT RELATIONSHIPS ============

// Get departments for a service
router.get('/:id/departments', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabaseAdmin
            .from('service_departments')
            .select(`
                *,
                department:departments(id, code, name, status)
            `)
            .eq('service_id', id)
            .order('is_primary', { ascending: false });

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách phòng ban của dịch vụ', 500);
        }

        res.json({
            status: 'success',
            data: { departments: data },
        });
    } catch (error) {
        next(error);
    }
});

// Add department to service
router.post('/:id/departments', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { department_id, commission_sale, commission_tech, is_primary } = req.body;

        if (!department_id) {
            throw new ApiError('department_id là bắt buộc', 400);
        }

        // If is_primary, remove primary flag from other departments
        if (is_primary) {
            await supabaseAdmin
                .from('service_departments')
                .update({ is_primary: false })
                .eq('service_id', id);
        }

        const { data, error } = await supabaseAdmin
            .from('service_departments')
            .insert({
                service_id: id,
                department_id,
                commission_sale: commission_sale || 0,
                commission_tech: commission_tech || 0,
                is_primary: is_primary || false,
            })
            .select(`
                *,
                department:departments(id, code, name, status)
            `)
            .single();

        if (error) {
            if (error.code === '23505') {
                throw new ApiError('Phòng ban này đã được thêm cho dịch vụ', 400);
            }
            throw new ApiError('Lỗi khi thêm phòng ban: ' + error.message, 500);
        }

        res.status(201).json({
            status: 'success',
            data: { serviceDepartment: data },
        });
    } catch (error) {
        next(error);
    }
});

// Update department commission for service
router.put('/:id/departments/:deptId', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id, deptId } = req.params;
        const { commission_sale, commission_tech, is_primary } = req.body;

        // If setting as primary, remove primary flag from others first
        if (is_primary) {
            await supabaseAdmin
                .from('service_departments')
                .update({ is_primary: false })
                .eq('service_id', id);
        }

        const { data, error } = await supabaseAdmin
            .from('service_departments')
            .update({
                commission_sale,
                commission_tech,
                is_primary,
                updated_at: new Date().toISOString(),
            })
            .eq('service_id', id)
            .eq('department_id', deptId)
            .select(`
                *,
                department:departments(id, code, name, status)
            `)
            .single();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật hoa hồng: ' + error.message, 500);
        }

        res.json({
            status: 'success',
            data: { serviceDepartment: data },
        });
    } catch (error) {
        next(error);
    }
});

// Remove department from service
router.delete('/:id/departments/:deptId', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id, deptId } = req.params;

        const { error } = await supabaseAdmin
            .from('service_departments')
            .delete()
            .eq('service_id', id)
            .eq('department_id', deptId);

        if (error) {
            throw new ApiError('Lỗi khi xóa phòng ban: ' + error.message, 500);
        }

        res.json({
            status: 'success',
            message: 'Đã xóa phòng ban khỏi dịch vụ',
        });
    } catch (error) {
        next(error);
    }
});

// Batch update departments for a service (replace all)
router.put('/:id/departments', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { departments } = req.body; // Array of { department_id, commission_sale, commission_tech, is_primary }

        if (!Array.isArray(departments)) {
            throw new ApiError('departments phải là mảng', 400);
        }

        // Delete existing relationships
        await supabaseAdmin
            .from('service_departments')
            .delete()
            .eq('service_id', id);

        // Insert new relationships
        if (departments.length > 0) {
            const insertData = departments.map((d: any) => ({
                service_id: id,
                department_id: d.department_id,
                commission_sale: d.commission_sale || 0,
                commission_tech: d.commission_tech || 0,
                is_primary: d.is_primary || false,
            }));

            const { data, error } = await supabaseAdmin
                .from('service_departments')
                .insert(insertData)
                .select(`
                    *,
                    department:departments(id, code, name, status)
                `);

            if (error) {
                throw new ApiError('Lỗi khi cập nhật phòng ban: ' + error.message, 500);
            }

            return res.json({
                status: 'success',
                data: { departments: data },
            });
        }

        res.json({
            status: 'success',
            data: { departments: [] },
        });
    } catch (error) {
        next(error);
    }
});

// Get services by department
router.get('/by-department/:deptId', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { deptId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('service_departments')
            .select(`
                *,
                service:services(*)
            `)
            .eq('department_id', deptId)
            .order('is_primary', { ascending: false });

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách dịch vụ của phòng ban', 500);
        }

        res.json({
            status: 'success',
            data: { services: data },
        });
    } catch (error) {
        next(error);
    }
});

export { router as servicesRouter };
