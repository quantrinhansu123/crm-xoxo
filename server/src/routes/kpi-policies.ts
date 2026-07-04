import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';

const router = Router();

// ============================================================
// KPI POLICIES CRUD
// ============================================================

// GET /api/kpi/policies - List all policies
router.get('/policies', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { role, is_active } = req.query;

        let query = supabaseAdmin
            .from('kpi_policies')
            .select(`
                *,
                metrics:kpi_policy_metrics(count)
            `)
            .order('created_at', { ascending: false });

        if (role && role !== 'all') {
            query = query.eq('role', role);
        }
        if (is_active !== undefined) {
            query = query.eq('is_active', is_active === 'true');
        }

        const { data: policies, error } = await query;

        if (error) throw new ApiError('Lỗi khi lấy danh sách chính sách KPI: ' + error.message, 500);

        // Get metric counts separately since supabase count in select can be tricky
        const policiesWithCounts = await Promise.all(
            (policies || []).map(async (policy: any) => {
                const { count } = await supabaseAdmin
                    .from('kpi_policy_metrics')
                    .select('*', { count: 'exact', head: true })
                    .eq('policy_id', policy.id)
                    .eq('is_active', true);

                return {
                    ...policy,
                    metric_count: count || 0,
                    total_weight: 0 // will be calculated below
                };
            })
        );

        // Get total weight for each policy
        for (const policy of policiesWithCounts) {
            const { data: metrics } = await supabaseAdmin
                .from('kpi_policy_metrics')
                .select('weight')
                .eq('policy_id', policy.id)
                .eq('is_active', true);

            policy.total_weight = (metrics || []).reduce((sum: number, m: any) => sum + Number(m.weight || 0), 0);
        }

        res.json({
            status: 'success',
            data: { policies: policiesWithCounts }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/kpi/policies/:id - Get policy detail with metrics
router.get('/policies/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: policy, error } = await supabaseAdmin
            .from('kpi_policies')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !policy) throw new ApiError('Không tìm thấy chính sách KPI', 404);

        // Get metrics
        const { data: metrics, error: metricsError } = await supabaseAdmin
            .from('kpi_policy_metrics')
            .select('*')
            .eq('policy_id', id)
            .order('sort_order', { ascending: true });

        if (metricsError) throw new ApiError('Lỗi khi lấy chỉ tiêu: ' + metricsError.message, 500);

        // Count employees using this policy
        const { count: employeeCount } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('kpi_policy_id', id)
            .eq('status', 'active');

        res.json({
            status: 'success',
            data: {
                policy: {
                    ...policy,
                    metrics: metrics || [],
                    employee_count: employeeCount || 0,
                    total_weight: (metrics || []).reduce((sum: number, m: any) => sum + Number(m.weight || 0), 0)
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/kpi/policies - Create new policy
router.post('/policies', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { code, name, role, description, effective_from, effective_to, compensation_rules } = req.body;

        if (!code || !name || !role) {
            throw new ApiError('Thiếu thông tin bắt buộc (code, name, role)', 400);
        }

        if (compensation_rules !== undefined && compensation_rules !== null) {
            const VALID_RULE_TYPES = ['team_revenue_percentage', 'fixed_bonus', 'manual'];
            if (typeof compensation_rules !== 'object' || Array.isArray(compensation_rules)) {
                throw new ApiError('compensation_rules phải là object JSON', 400);
            }
            if (compensation_rules.type && !VALID_RULE_TYPES.includes(compensation_rules.type)) {
                throw new ApiError('compensation_rules.type không hợp lệ', 400);
            }
        }

        // Check unique code
        const { data: existing } = await supabaseAdmin
            .from('kpi_policies')
            .select('id')
            .eq('code', code)
            .single();

        if (existing) {
            throw new ApiError('Mã chính sách đã tồn tại', 400);
        }

        const { data: policy, error } = await supabaseAdmin
            .from('kpi_policies')
            .insert({
                code: code.toUpperCase().replace(/\s+/g, '_'),
                name,
                role,
                description: description || null,
                effective_from: effective_from || new Date().toISOString().split('T')[0],
                effective_to: effective_to || null,
                is_active: true,
                compensation_rules: compensation_rules || null
            })
            .select()
            .single();

        if (error) throw new ApiError('Lỗi khi tạo chính sách KPI: ' + error.message, 500);

        res.status(201).json({
            status: 'success',
            data: { policy }
        });
    } catch (error) {
        next(error);
    }
});

// PATCH /api/kpi/policies/:id - Update policy
router.patch('/policies/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, effective_from, effective_to, is_active, compensation_rules } = req.body;

        if (compensation_rules !== undefined && compensation_rules !== null) {
            const VALID_RULE_TYPES = ['team_revenue_percentage', 'fixed_bonus', 'manual'];
            if (typeof compensation_rules !== 'object' || Array.isArray(compensation_rules)) {
                throw new ApiError('compensation_rules phải là object JSON', 400);
            }
            if (compensation_rules.type && !VALID_RULE_TYPES.includes(compensation_rules.type)) {
                throw new ApiError('compensation_rules.type không hợp lệ', 400);
            }
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (effective_from !== undefined) updateData.effective_from = effective_from;
        if (effective_to !== undefined) updateData.effective_to = effective_to;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (compensation_rules !== undefined) updateData.compensation_rules = compensation_rules;

        if (Object.keys(updateData).length === 0) {
            throw new ApiError('Không có dữ liệu cập nhật', 400);
        }

        const { data: policy, error } = await supabaseAdmin
            .from('kpi_policies')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new ApiError('Lỗi khi cập nhật chính sách KPI: ' + error.message, 500);

        res.json({
            status: 'success',
            data: { policy }
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================
// KPI POLICY METRICS CRUD
// ============================================================

// POST /api/kpi/policies/:id/metrics - Add metric to policy
router.post('/policies/:id/metrics', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id: policy_id } = req.params;
        const {
            metric_code, metric_name, metric_group, description,
            weight, score_type, target_type, target_value,
            scoring_rules, source_type, source_key,
            manual_input_allowed, manager_review_required, sort_order
        } = req.body;

        if (!metric_code || !metric_name) {
            throw new ApiError('Thiếu thông tin bắt buộc (metric_code, metric_name)', 400);
        }

        // Verify policy exists
        const { data: policy } = await supabaseAdmin
            .from('kpi_policies')
            .select('id')
            .eq('id', policy_id)
            .single();

        if (!policy) throw new ApiError('Không tìm thấy chính sách KPI', 404);

        // Check duplicate metric_code within same policy
        const { data: existingMetric } = await supabaseAdmin
            .from('kpi_policy_metrics')
            .select('id')
            .eq('policy_id', policy_id)
            .eq('metric_code', metric_code)
            .single();

        if (existingMetric) {
            throw new ApiError('Mã chỉ tiêu đã tồn tại trong chính sách này', 400);
        }

        // Get next sort_order if not provided
        let finalSortOrder = sort_order;
        if (finalSortOrder === undefined) {
            const { data: lastMetric } = await supabaseAdmin
                .from('kpi_policy_metrics')
                .select('sort_order')
                .eq('policy_id', policy_id)
                .order('sort_order', { ascending: false })
                .limit(1)
                .single();

            finalSortOrder = (lastMetric?.sort_order || 0) + 1;
        }

        const { data: metric, error } = await supabaseAdmin
            .from('kpi_policy_metrics')
            .insert({
                policy_id,
                metric_code,
                metric_name,
                metric_group: metric_group || 'output',
                description: description || null,
                weight: weight || 0,
                score_type: score_type || 'threshold',
                target_type: target_type || 'percentage',
                target_value: target_value || 0,
                scoring_rules: scoring_rules || {},
                source_type: source_type || 'manual',
                source_key: source_key || null,
                manual_input_allowed: manual_input_allowed || false,
                manager_review_required: manager_review_required || false,
                sort_order: finalSortOrder,
                is_active: true
            })
            .select()
            .single();

        if (error) throw new ApiError('Lỗi khi thêm chỉ tiêu: ' + error.message, 500);

        res.status(201).json({
            status: 'success',
            data: { metric }
        });
    } catch (error) {
        next(error);
    }
});

// PATCH /api/kpi/metrics/:id - Update metric
router.patch('/metrics/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const allowedFields = [
            'metric_name', 'metric_group', 'description', 'weight',
            'score_type', 'target_type', 'target_value', 'scoring_rules',
            'source_type', 'source_key', 'manual_input_allowed',
            'manager_review_required', 'sort_order', 'is_active'
        ];

        const updateData: any = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        if (Object.keys(updateData).length === 0) {
            throw new ApiError('Không có dữ liệu cập nhật', 400);
        }

        const { data: metric, error } = await supabaseAdmin
            .from('kpi_policy_metrics')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new ApiError('Lỗi khi cập nhật chỉ tiêu: ' + error.message, 500);

        res.json({
            status: 'success',
            data: { metric }
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/kpi/metrics/:id - Delete metric
router.delete('/metrics/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('kpi_policy_metrics')
            .delete()
            .eq('id', id);

        if (error) throw new ApiError('Lỗi khi xóa chỉ tiêu: ' + error.message, 500);

        res.json({
            status: 'success',
            message: 'Đã xóa chỉ tiêu KPI'
        });
    } catch (error) {
        next(error);
    }
});

export { router as kpiPoliciesRouter };
