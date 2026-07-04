-- ============================================================
-- KPI REWORK - KPI_KYTHUAT_CHINH
-- Created: 2026-04-22
-- Description: Rework metrics for Ky thuat chinh (full-time technician) policy
--   Part A: Add kpi_impact column to order_extension_requests,
--           reconcile extension status constraint
--   Part B: Rework KPI_KYTHUAT_CHINH metrics
--     - Deactivate: status_update, late_jobs
--     - Update: completed_jobs, on_time_rate, bad_feedback, rework_count, cleaning_violation
--     - Add: technical_process, critical_quality_error, conduct_cooperation
--     - Final active weights: 30+20+10+10+15+5+5+5 = 100
-- ============================================================

-- ============================================================
-- PART A: kpi_impact column + extension status constraint
-- ============================================================

-- Add kpi_impact column to order_extension_requests
ALTER TABLE order_extension_requests ADD COLUMN IF NOT EXISTS kpi_impact BOOLEAN DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_order_extension_requests_kpi_impact ON order_extension_requests(kpi_impact);
COMMENT ON COLUMN order_extension_requests.kpi_impact IS 'NULL=legacy/unknown, false=exclude_from_kpi, true=include_in_kpi';

-- Reconcile extension status constraint (unify schema.sql + migration 20260328 statuses)
ALTER TABLE order_extension_requests DROP CONSTRAINT IF EXISTS order_extension_requests_status_check;
ALTER TABLE order_extension_requests ADD CONSTRAINT order_extension_requests_status_check
CHECK (status IN ('requested', 'sale_contacted', 'manager_approved', 'notified_tech', 'approved', 'rejected', 'declined', 'done', 'kpi_recorded'));

-- ============================================================
-- PART B: Rework KPI_KYTHUAT_CHINH metrics
-- ============================================================

DO $$
DECLARE
    v_policy_id UUID;
BEGIN
    SELECT id INTO v_policy_id FROM kpi_policies WHERE code = 'KPI_KYTHUAT_CHINH';

    IF v_policy_id IS NOT NULL THEN

        -- Step 1: Deactivate removed metrics (DO NOT DELETE)
        UPDATE kpi_policy_metrics SET is_active = false
        WHERE policy_id = v_policy_id AND metric_code IN ('status_update', 'late_jobs');

        -- Step 2: Update existing metrics

        -- completed_jobs: target_value=30, new scoring tiers
        UPDATE kpi_policy_metrics SET
            target_value = 30,
            scoring_rules = '{"type":"threshold","tiers":[{"min":100,"max":null,"score":30},{"min":83.33,"max":99.99,"score":24},{"min":66.66,"max":83.32,"score":16},{"min":0,"max":66.65,"score":0}]}',
            updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'completed_jobs';

        -- on_time_rate: target_value=90, new scoring tiers
        UPDATE kpi_policy_metrics SET
            target_value = 90,
            scoring_rules = '{"type":"threshold","tiers":[{"min":100,"max":null,"score":20},{"min":88.88,"max":99.99,"score":15},{"min":77.77,"max":88.87,"score":8},{"min":0,"max":77.76,"score":0}]}',
            updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'on_time_rate';

        -- bad_feedback: weight=10, score_type, source_type, source_key, scoring_rules, description
        UPDATE kpi_policy_metrics SET
            weight = 10,
            score_type = 'per_event',
            source_type = 'hybrid',
            source_key = 'bad_feedback_count',
            scoring_rules = '{"type":"per_event","points_per_event":-5,"max_deduct":-10}',
            description = 'Feedback không hài lòng từ khách. Manual: quản lý ghi nhận theo từng dịch vụ/KTV.',
            updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'bad_feedback';

        -- rework_count: weight=15, scoring_rules
        UPDATE kpi_policy_metrics SET
            weight = 15,
            scoring_rules = '{"type":"per_event","points_per_event":-5,"max_deduct":-15}',
            updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'rework_count';

        -- cleaning_violation: weight=5, source_type, source_key, scoring_rules, description
        UPDATE kpi_policy_metrics SET
            weight = 5,
            source_type = 'hybrid',
            source_key = 'cleaning_violation_count',
            scoring_rules = '{"type":"per_event","points_per_event":-2.5,"max_deduct":-5}',
            description = 'Số lần vi phạm vệ sinh khu làm việc. Quản lý ghi nhận manual.',
            updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'cleaning_violation';

        -- Step 3: Insert new metrics (idempotent via ON CONFLICT DO UPDATE)

        -- technical_process
        INSERT INTO kpi_policy_metrics (
            policy_id, metric_code, metric_name, metric_group,
            weight, score_type, target_type, target_value,
            scoring_rules, source_type, source_key,
            manual_input_allowed, manager_review_required, sort_order,
            description
        ) VALUES (
            v_policy_id, 'technical_process', 'Tuân thủ quy trình kỹ thuật', 'process',
            10, 'per_event', 'count', 0,
            '{"type":"per_event","points_per_event":-2,"max_deduct":-10}',
            'hybrid', 'technical_process_violation_count',
            true, true, 3,
            'Quản lý chấm tay. Mỗi lỗi quy trình trừ 2 điểm, tối thiểu 0.'
        )
        ON CONFLICT (policy_id, metric_code) DO UPDATE SET
            metric_name = EXCLUDED.metric_name,
            metric_group = EXCLUDED.metric_group,
            weight = EXCLUDED.weight,
            score_type = EXCLUDED.score_type,
            target_type = EXCLUDED.target_type,
            target_value = EXCLUDED.target_value,
            scoring_rules = EXCLUDED.scoring_rules,
            source_type = EXCLUDED.source_type,
            source_key = EXCLUDED.source_key,
            manual_input_allowed = EXCLUDED.manual_input_allowed,
            manager_review_required = EXCLUDED.manager_review_required,
            sort_order = EXCLUDED.sort_order,
            description = EXCLUDED.description,
            is_active = true,
            updated_at = NOW();

        -- critical_quality_error
        INSERT INTO kpi_policy_metrics (
            policy_id, metric_code, metric_name, metric_group,
            weight, score_type, target_type, target_value,
            scoring_rules, source_type, source_key,
            manual_input_allowed, manager_review_required, sort_order,
            description
        ) VALUES (
            v_policy_id, 'critical_quality_error', 'Lỗi chất lượng nghiêm trọng', 'quality',
            5, 'per_event', 'count', 0,
            '{"type":"per_event","points_per_event":-5,"max_deduct":-5}',
            'hybrid', 'critical_quality_error_count',
            true, true, 6,
            'Sai màu nặng, làm hỏng thêm, lỗi kỹ thuật nghiêm trọng, phải đền bù. 1 lỗi = 0 điểm.'
        )
        ON CONFLICT (policy_id, metric_code) DO UPDATE SET
            metric_name = EXCLUDED.metric_name,
            metric_group = EXCLUDED.metric_group,
            weight = EXCLUDED.weight,
            score_type = EXCLUDED.score_type,
            target_type = EXCLUDED.target_type,
            target_value = EXCLUDED.target_value,
            scoring_rules = EXCLUDED.scoring_rules,
            source_type = EXCLUDED.source_type,
            source_key = EXCLUDED.source_key,
            manual_input_allowed = EXCLUDED.manual_input_allowed,
            manager_review_required = EXCLUDED.manager_review_required,
            sort_order = EXCLUDED.sort_order,
            description = EXCLUDED.description,
            is_active = true,
            updated_at = NOW();

        -- conduct_cooperation
        INSERT INTO kpi_policy_metrics (
            policy_id, metric_code, metric_name, metric_group,
            weight, score_type, target_type, target_value,
            scoring_rules, source_type, source_key,
            manual_input_allowed, manager_review_required, sort_order,
            description
        ) VALUES (
            v_policy_id, 'conduct_cooperation', 'Tác phong / phối hợp nội bộ', 'discipline',
            5, 'per_event', 'count', 0,
            '{"type":"per_event","points_per_event":-1,"max_deduct":-5}',
            'hybrid', 'conduct_deduction_sum',
            true, true, 8,
            'Vi phạm nhẹ trừ 2đ, vi phạm nặng trừ 5đ. Quản lý ghi nhận manual.'
        )
        ON CONFLICT (policy_id, metric_code) DO UPDATE SET
            metric_name = EXCLUDED.metric_name,
            metric_group = EXCLUDED.metric_group,
            weight = EXCLUDED.weight,
            score_type = EXCLUDED.score_type,
            target_type = EXCLUDED.target_type,
            target_value = EXCLUDED.target_value,
            scoring_rules = EXCLUDED.scoring_rules,
            source_type = EXCLUDED.source_type,
            source_key = EXCLUDED.source_key,
            manual_input_allowed = EXCLUDED.manual_input_allowed,
            manager_review_required = EXCLUDED.manager_review_required,
            sort_order = EXCLUDED.sort_order,
            description = EXCLUDED.description,
            is_active = true,
            updated_at = NOW();

        -- Step 4: Fix sort_order for all active metrics
        UPDATE kpi_policy_metrics SET sort_order = 1, updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'completed_jobs';

        UPDATE kpi_policy_metrics SET sort_order = 2, updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'on_time_rate';

        UPDATE kpi_policy_metrics SET sort_order = 3, updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'technical_process';

        UPDATE kpi_policy_metrics SET sort_order = 4, updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'bad_feedback';

        UPDATE kpi_policy_metrics SET sort_order = 5, updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'rework_count';

        UPDATE kpi_policy_metrics SET sort_order = 6, updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'critical_quality_error';

        UPDATE kpi_policy_metrics SET sort_order = 7, updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'cleaning_violation';

        UPDATE kpi_policy_metrics SET sort_order = 8, updated_at = NOW()
        WHERE policy_id = v_policy_id AND metric_code = 'conduct_cooperation';

    END IF;
END $$;
