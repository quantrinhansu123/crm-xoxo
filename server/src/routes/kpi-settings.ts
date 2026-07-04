import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';

const router = Router();

// ============================================================
// KPI RANK CONFIGS
// ============================================================

// GET /api/kpi/rank-configs - Get rank configs (global, per-policy, or per-employee)
// Query params: employee_id (optional), policy_id (optional)
// - employee_id: returns merged employee overrides + global fallback
// - policy_id: returns merged policy-specific + global fallback
router.get('/rank-configs', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { employee_id, policy_id } = req.query;

        // Handle policy_id query (new functionality)
        if (policy_id && typeof policy_id === 'string') {
            const { data: globalConfigs, error: globalError } = await supabaseAdmin
                .from('kpi_rank_configs')
                .select('*')
                .is('policy_id', null)
                .is('employee_id', null)
                .order('sort_order', { ascending: true });

            if (globalError) throw new ApiError('Lỗi khi lấy cấu hình global: ' + globalError.message, 500);

            const { data: policyConfigs, error: policyError } = await supabaseAdmin
                .from('kpi_rank_configs')
                .select('*')
                .eq('policy_id', policy_id)
                .order('sort_order', { ascending: true });

            if (policyError) throw new ApiError('Lỗi khi lấy cấu hình policy: ' + policyError.message, 500);

            console.log('DEBUG policyConfigs from DB:', policyConfigs);

            const overrideMap = new Map((policyConfigs || []).map((c: any) => [c.rank_code, c]));
            const merged = (globalConfigs || []).map((global: any) => {
                const override = overrideMap.get(global.rank_code);
                return override
                    ? { ...global, ...override, is_override: true, global_id: global.id }
                    : { ...global, is_override: false };
            });

            console.log('DEBUG merged configs:', merged);

            return res.json({
                status: 'success',
                data: { configs: merged, policy_id }
            });
        }

        // Handle employee_id query (existing functionality - backward compat)
        if (employee_id && typeof employee_id === 'string') {
            const { data: globalConfigs, error: globalError } = await supabaseAdmin
                .from('kpi_rank_configs')
                .select('*')
                .is('employee_id', null)
                .is('policy_id', null)
                .order('sort_order', { ascending: true });

            if (globalError) throw new ApiError('Lỗi khi lấy cấu hình global: ' + globalError.message, 500);

            const { data: employeeConfigs, error: empError } = await supabaseAdmin
                .from('kpi_rank_configs')
                .select('*')
                .eq('employee_id', employee_id)
                .order('sort_order', { ascending: true });

            if (empError) throw new ApiError('Lỗi khi lấy cấu hình nhân viên: ' + empError.message, 500);

            const overrideMap = new Map((employeeConfigs || []).map((c: any) => [c.rank_code, c]));
            const merged = (globalConfigs || []).map((global: any) => {
                const override = overrideMap.get(global.rank_code);
                return override
                    ? { ...global, ...override, is_override: true, global_id: global.id }
                    : { ...global, is_override: false };
            });

            return res.json({
                status: 'success',
                data: { configs: merged, employee_id }
            });
        }

// Default: return global configs only (exclude policy-specific overrides)
        const { data: configs, error } = await supabaseAdmin
            .from('kpi_rank_configs')
            .select('*')
            .is('employee_id', null)
            .is('policy_id', null)
            .order('sort_order', { ascending: true });

        if (error) throw new ApiError('Lỗi khi lấy cấu hình xếp loại: ' + error.message, 500);

        res.json({
            status: 'success',
            data: { configs: configs || [] }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/rank-configs - Create rank config (global, per-policy, or per-employee)
router.post('/rank-configs', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { rank_code, rank_name, min_score, max_score, bonus_amount, penalty_amount, commission_factor, sort_order, employee_id, policy_id } = req.body;

        if (!rank_code || !rank_name) {
            throw new ApiError('Thiếu thông tin bắt buộc (rank_code, rank_name)', 400);
        }

        const { data: config, error } = await supabaseAdmin
            .from('kpi_rank_configs')
            .insert({
                rank_code,
                rank_name,
                min_score: min_score ?? 0,
                max_score: max_score ?? 100,
                bonus_amount: bonus_amount ?? 0,
                penalty_amount: penalty_amount ?? 0,
                commission_factor: commission_factor ?? 100.0,
                sort_order: sort_order ?? 0,
                is_active: true,
                employee_id: employee_id ?? null,
                policy_id: policy_id ?? null,
            })
            .select()
            .single();

        if (error) throw new ApiError('Lỗi khi tạo cấu hình xếp loại: ' + error.message, 500);

        res.status(201).json({
            status: 'success',
            data: { config }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/rank-configs/upsert-employee - Upsert per-employee rank config overrides
// Creates or updates all rank overrides for one employee in a single request.
router.post('/rank-configs/upsert-employee', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { employee_id, configs } = req.body;

        if (!employee_id) throw new ApiError('Thiếu employee_id', 400);
        if (!Array.isArray(configs) || configs.length === 0) throw new ApiError('Thiếu danh sách cấu hình (configs)', 400);

        const results: any[] = [];
        const errors: any[] = [];

        for (const cfg of configs) {
            const { rank_code, rank_name, min_score, max_score, bonus_amount, penalty_amount, commission_factor, sort_order, reset_to_global } = cfg;

            if (!rank_code) { errors.push({ rank_code, error: 'Thiếu rank_code' }); continue; }

            if (reset_to_global) {
                const { error } = await supabaseAdmin
                    .from('kpi_rank_configs')
                    .delete()
                    .eq('employee_id', employee_id)
                    .eq('rank_code', rank_code);
                if (error) errors.push({ rank_code, error: error.message });
                else results.push({ rank_code, action: 'deleted' });
                continue;
            }

            const { data: existing } = await supabaseAdmin
                .from('kpi_rank_configs')
                .select('id')
                .eq('employee_id', employee_id)
                .eq('rank_code', rank_code)
                .single();

            if (existing) {
                const updateData: any = {};
                if (rank_name !== undefined) updateData.rank_name = rank_name;
                if (min_score !== undefined) updateData.min_score = min_score;
                if (max_score !== undefined) updateData.max_score = max_score;
                if (bonus_amount !== undefined) updateData.bonus_amount = bonus_amount;
                if (penalty_amount !== undefined) updateData.penalty_amount = penalty_amount;
                if (commission_factor !== undefined) updateData.commission_factor = commission_factor;
                if (sort_order !== undefined) updateData.sort_order = sort_order;

                const { data: updated, error } = await supabaseAdmin
                    .from('kpi_rank_configs')
                    .update(updateData)
                    .eq('id', existing.id)
                    .select()
                    .single();

                if (error) errors.push({ rank_code, error: error.message });
                else results.push({ ...updated, action: 'updated' });
            } else {
                const { data: created, error } = await supabaseAdmin
                    .from('kpi_rank_configs')
                    .insert({
                        employee_id,
                        rank_code,
                        rank_name: rank_name ?? rank_code,
                        min_score: min_score ?? 0,
                        max_score: max_score ?? 100,
                        bonus_amount: bonus_amount ?? 0,
                        penalty_amount: penalty_amount ?? 0,
                        commission_factor: commission_factor ?? 100,
                        sort_order: sort_order ?? 0,
                        is_active: true,
                    })
                    .select()
                    .single();

                if (error) errors.push({ rank_code, error: error.message });
                else results.push({ ...created, action: 'created' });
            }
        }

        res.json({
            status: 'success',
            data: { updated: results.length, errors: errors.length, results, errors_detail: errors }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/rank-configs/upsert-policy - Upsert per-policy rank config overrides
router.post('/rank-configs/upsert-policy', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { policy_id, configs } = req.body;

        console.log('DEBUG upsert-policy body:', { policy_id, configs_count: configs?.length });

        if (!policy_id) throw new ApiError('Thiếu policy_id', 400);
        if (!Array.isArray(configs) || configs.length === 0) throw new ApiError('Thiếu danh sách cấu hình (configs)', 400);

        const results: any[] = [];
        const errors: any[] = [];

        for (const cfg of configs) {
            const { rank_code, rank_name, min_score, max_score, bonus_amount, penalty_amount, commission_factor, sort_order, reset_to_global } = cfg;

            console.log('DEBUG processing config:', { rank_code, penalty_amount, reset_to_global });

            if (!rank_code) { errors.push({ rank_code, error: 'Thiếu rank_code' }); continue; }

            if (reset_to_global) {
                const { error } = await supabaseAdmin
                    .from('kpi_rank_configs')
                    .delete()
                    .eq('policy_id', policy_id)
                    .eq('rank_code', rank_code);
                if (error) errors.push({ rank_code, error: error.message });
                else results.push({ rank_code, action: 'deleted' });
                continue;
            }

            const { data: existing } = await supabaseAdmin
                .from('kpi_rank_configs')
                .select('id')
                .eq('policy_id', policy_id)
                .eq('rank_code', rank_code)
                .single();

            console.log('DEBUG existing record:', { existing });

            if (existing) {
                const updateData: any = {};
                if (rank_name !== undefined) updateData.rank_name = rank_name;
                if (min_score !== undefined) updateData.min_score = min_score;
                if (max_score !== undefined) updateData.max_score = max_score;
                if (bonus_amount !== undefined) updateData.bonus_amount = bonus_amount;
                if (penalty_amount !== undefined) updateData.penalty_amount = penalty_amount;
                if (commission_factor !== undefined) updateData.commission_factor = commission_factor;
                if (sort_order !== undefined) updateData.sort_order = sort_order;

                console.log('DEBUG updating existing:', { id: existing.id, updateData });

                const { data: updated, error } = await supabaseAdmin
                    .from('kpi_rank_configs')
                    .update(updateData)
                    .eq('id', existing.id)
                    .select()
                    .single();

                console.log('DEBUG update result:', { updated, error });

                if (error) errors.push({ rank_code, error: error.message });
                else results.push({ ...updated, action: 'updated' });
            } else {
                const insertData = {
                    policy_id,
                    rank_code,
                    rank_name: rank_name ?? rank_code,
                    min_score: min_score ?? 0,
                    max_score: max_score ?? 100,
                    bonus_amount: bonus_amount ?? 0,
                    penalty_amount: penalty_amount ?? 0,
                    commission_factor: commission_factor ?? 100,
                    sort_order: sort_order ?? 0,
                    is_active: true,
                };
                console.log('DEBUG creating new:', insertData);

                const { data: created, error } = await supabaseAdmin
                    .from('kpi_rank_configs')
                    .insert(insertData)
                    .select()
                    .single();

                console.log('DEBUG create result:', { created, error });

                if (error) errors.push({ rank_code, error: error.message });
                else results.push({ ...created, action: 'created' });
            }
        }

        res.json({
            status: 'success',
            data: { updated: results.length, errors: errors.length, results, errors_detail: errors }
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/kpi/rank-configs/:id - Update rank config
router.put('/rank-configs/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { rank_name, min_score, max_score, bonus_amount, penalty_amount, commission_factor, sort_order, is_active } = req.body;

        const updateData: any = {};
        if (rank_name !== undefined) updateData.rank_name = rank_name;
        if (min_score !== undefined) updateData.min_score = min_score;
        if (max_score !== undefined) updateData.max_score = max_score;
        if (bonus_amount !== undefined) updateData.bonus_amount = bonus_amount;
        if (penalty_amount !== undefined) updateData.penalty_amount = penalty_amount;
        if (commission_factor !== undefined) updateData.commission_factor = commission_factor;
        if (sort_order !== undefined) updateData.sort_order = sort_order;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data: config, error } = await supabaseAdmin
            .from('kpi_rank_configs')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new ApiError('Lỗi khi cập nhật cấu hình xếp loại: ' + error.message, 500);

        res.json({
            status: 'success',
            data: { config }
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/kpi/rank-configs/:id - Delete rank config
router.delete('/rank-configs/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('kpi_rank_configs')
            .delete()
            .eq('id', id);

        if (error) throw new ApiError('Lỗi khi xóa cấu hình xếp loại: ' + error.message, 500);

        res.json({
            status: 'success',
            message: 'Đã xóa cấu hình xếp loại'
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================
// BATCH ASSIGN KPI POLICY TO EMPLOYEES
// ============================================================

// GET /api/kpi/employee-assignments - List employees with their KPI assignments
router.get('/employee-assignments', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { role, department, status = 'active' } = req.query;

        let query = supabaseAdmin
            .from('users')
            .select('id, name, email, role, department, department_id, status, departments!department_id(name)')
            .eq('status', status as string)
            .order('name', { ascending: true });

        if (role && role !== 'all') query = query.eq('role', role as string);
        if (department && department !== 'all') query = query.eq('department_id', department as string);

        const { data: employees, error } = await query;
        if (error) throw new ApiError('Lỗi khi lấy danh sách nhân sự: ' + error.message, 500);

        // Fetch all departments for name resolution fallback (in case legacy 'department' field contains UUID)
        const { data: deptList } = await supabaseAdmin.from('departments').select('id, name');
        const deptMap = new Map((deptList || []).map(d => [d.id, d.name]));

        // Get all active assignments with policy info
        const { data: assignments } = await supabaseAdmin
            .from('employee_kpi_assignments')
            .select('*, policy:kpi_policies(id, code, name, role)')
            .eq('is_active', true);

        // Group assignments by employee_id
        const assignmentMap = new Map<string, any[]>();
        for (const a of (assignments || [])) {
            const list = assignmentMap.get(a.employee_id) || [];
            list.push(a);
            assignmentMap.set(a.employee_id, list);
        }

        // Merge employees with their assignments
        const employeesWithAssignments = (employees || []).map((emp: any) => ({
            ...emp,
            department: emp.departments?.name || (emp.department ? (deptMap.get(emp.department) || emp.department) : null), // Return department name from join, map lookup, or legacy field
            assignments: assignmentMap.get(emp.id) || [],
            primary_policy: (assignmentMap.get(emp.id) || []).find((a: any) => a.assignment_type === 'primary')?.policy || null
        }));

        // Get all active policies for dropdown
        const { data: policies } = await supabaseAdmin
            .from('kpi_policies')
            .select('id, code, name, role')
            .eq('is_active', true)
            .order('name', { ascending: true });

        res.json({
            status: 'success',
            data: {
                employees: employeesWithAssignments,
                policies: policies || []
            }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/employee-assignments - Create/update KPI assignments
router.post('/employee-assignments', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { assignments } = req.body;
        // assignments: [{ employee_id, policy_id, assignment_type, compensation_bucket }]

        if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
            throw new ApiError('Thiếu danh sách gán (assignments)', 400);
        }

        const results: any[] = [];
        const errors: any[] = [];

        for (const assignment of assignments) {
            try {
                const { employee_id, policy_id, assignment_type = 'primary', compensation_bucket } = assignment;

                if (!employee_id || !policy_id) {
                    errors.push({ employee_id, error: 'Thiếu employee_id hoặc policy_id' });
                    continue;
                }

                if (!['primary', 'secondary'].includes(assignment_type)) {
                    errors.push({ employee_id, error: 'assignment_type phải là primary hoặc secondary' });
                    continue;
                }

                const VALID_BUCKETS = ['teamlead_sale', 'teamlead_tech', 'manager_store', 'marketing', 'sale_personal', 'technician_personal', 'general'];
                if (compensation_bucket && !VALID_BUCKETS.includes(compensation_bucket)) {
                    errors.push({ employee_id, error: 'compensation_bucket không hợp lệ' });
                    continue;
                }

                // Validate policy exists
                const { data: policy } = await supabaseAdmin
                    .from('kpi_policies')
                    .select('id, code, role')
                    .eq('id', policy_id)
                    .eq('is_active', true)
                    .single();

                if (!policy) {
                    errors.push({ employee_id, error: 'Chính sách KPI không tồn tại hoặc không active' });
                    continue;
                }

                // If primary: deactivate existing primary for this employee first
                if (assignment_type === 'primary') {
                    await supabaseAdmin
                        .from('employee_kpi_assignments')
                        .update({ is_active: false, effective_to: new Date().toISOString().split('T')[0] })
                        .eq('employee_id', employee_id)
                        .eq('assignment_type', 'primary')
                        .eq('is_active', true);
                }

                // Derive compensation_bucket if not provided
                // More specific codes must be checked before general ones (TEAMLEAD_SALE before SALE)
                const bucket = compensation_bucket || (
                    policy.code.includes('TEAMLEAD_SALE') ? 'teamlead_sale' :
                    policy.code.includes('LEAD_KYTHUAT') ? 'teamlead_tech' :
                    policy.code.includes('QUANLY') ? 'manager_store' :
                    policy.code.includes('MARKETING') ? 'marketing' :
                    policy.code.includes('SALE') ? 'sale_personal' :
                    policy.code.includes('KYTHUAT') ? 'technician_personal' :
                    'general'
                );

                // Insert new assignment
                const { data: newAssignment, error: insertError } = await supabaseAdmin
                    .from('employee_kpi_assignments')
                    .insert({
                        employee_id,
                        policy_id,
                        assignment_type,
                        compensation_bucket: bucket,
                        effective_from: new Date().toISOString().split('T')[0],
                        is_active: true,
                        assigned_by: req.user?.id || null
                    })
                    .select()
                    .single();

                if (insertError) {
                    errors.push({ employee_id, error: insertError.message });
                    continue;
                }

                // Backward compat: sync users.kpi_policy_id for primary assignments
                if (assignment_type === 'primary') {
                    await supabaseAdmin
                        .from('users')
                        .update({ kpi_policy_id: policy_id })
                        .eq('id', employee_id);
                }

                results.push(newAssignment);
            } catch (err: any) {
                errors.push({ employee_id: assignment.employee_id, error: err.message });
            }
        }

        res.json({
            status: 'success',
            data: {
                created: results.length,
                errors: errors.length,
                results,
                errors_detail: errors
            }
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/kpi/employee-assignments/:id - Deactivate an assignment
router.delete('/employee-assignments/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        // Get the assignment first
        const { data: assignment, error: fetchError } = await supabaseAdmin
            .from('employee_kpi_assignments')
            .select('id, employee_id, assignment_type, policy_id, is_active')
            .eq('id', id)
            .single();

        if (fetchError || !assignment) {
            throw new ApiError('Không tìm thấy assignment', 404);
        }

        if (!assignment.is_active) {
            throw new ApiError('Assignment đã được deactivate', 400);
        }

        // Deactivate the assignment
        const { error: updateError } = await supabaseAdmin
            .from('employee_kpi_assignments')
            .update({
                is_active: false,
                effective_to: new Date().toISOString().split('T')[0]
            })
            .eq('id', id);

        if (updateError) throw new ApiError('Lỗi khi xóa assignment: ' + updateError.message, 500);

        // Backward compat: if primary was removed, clear users.kpi_policy_id
        if (assignment.assignment_type === 'primary') {
            await supabaseAdmin
                .from('users')
                .update({ kpi_policy_id: null })
                .eq('id', assignment.employee_id);
        }

        res.json({
            status: 'success',
            message: 'Đã gỡ KPI assignment'
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================
// KPI LEADERBOARD
// ============================================================

// GET /api/kpi/leaderboard - KPI leaderboard by month
router.get('/leaderboard', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { month_key, role, limit = 20 } = req.query;

        // Default to current month
        const now = new Date();
        const currentMonthKey = month_key || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        let query = supabaseAdmin
            .from('kpi_monthly')
            .select(`
                *,
                employee:users!employee_id(id, name, email, avatar, role, department),
                policy:kpi_policies(code, name)
            `)
            .eq('month_key', currentMonthKey)
            .in('status', ['pending', 'locked'])
            .order('total_score', { ascending: false })
            .limit(Number(limit));

        const { data: leaderboard, error } = await query;

        if (error) throw new ApiError('Lỗi khi lấy bảng xếp hạng: ' + error.message, 500);

        // Filter by role if specified (post-query since we joined)
        let filtered = leaderboard || [];
        if (role && role !== 'all') {
            filtered = filtered.filter((item: any) => item.employee?.role === role);
        }

        // Add position
        const ranked = filtered.map((item: any, index: number) => ({
            ...item,
            position: index + 1
        }));

        res.json({
            status: 'success',
            data: {
                leaderboard: ranked,
                month_key: currentMonthKey
            }
        });
    } catch (error) {
        next(error);
    }
});

export { router as kpiSettingsRouter };
