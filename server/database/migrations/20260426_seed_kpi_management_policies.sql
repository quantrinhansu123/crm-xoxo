-- ============================================================
-- KPI MANAGEMENT POLICIES — Seed metrics for 3 management policies
-- Created: 2026-04-26
-- KPI_TEAMLEAD_SALE and KPI_LEAD_KYTHUAT already exist as shells
-- KPI_QUANLY_CUAHANG must be created fresh
-- ============================================================

-- ── KPI_TEAMLEAD_SALE: 13 metrics (weight total = 100) ─────────────────
DO $$
DECLARE v_policy_id UUID;
BEGIN
    SELECT id INTO v_policy_id FROM kpi_policies WHERE code = 'KPI_TEAMLEAD_SALE';
    IF v_policy_id IS NOT NULL THEN
        DELETE FROM kpi_policy_metrics WHERE policy_id = v_policy_id;
        INSERT INTO kpi_policy_metrics (policy_id, metric_code, metric_name, metric_group, weight, score_type, target_type, target_value, scoring_rules, source_type, source_key, sort_order)
        VALUES
            (v_policy_id, 'team_revenue', 'Doanh thu team sale', 'output', 20, 'threshold', 'absolute', 0,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":20},{"min":90,"max":99,"score":16},{"min":80,"max":89,"score":10},{"min":0,"max":79,"score":0}]}',
             'auto', 'team_order_revenue', 1),
            (v_policy_id, 'team_close_rate', 'Tỷ lệ chốt của team', 'output', 10, 'threshold', 'percentage', 60,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":10},{"min":80,"max":99,"score":8},{"min":60,"max":79,"score":5},{"min":0,"max":59,"score":2}]}',
             'auto', 'team_closed_leads_ratio', 2),
            (v_policy_id, 'team_return_customer', 'Khách hàng quay lại của team', 'output', 5, 'threshold', 'count', 5,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":5},{"min":60,"max":99,"score":3},{"min":0,"max":59,"score":1}]}',
             'auto', 'team_return_customer_count', 3),
            (v_policy_id, 'team_kpi_attainment', 'Tỷ lệ nhân sự team đạt KPI', 'output', 5, 'threshold', 'percentage', 80,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":5},{"min":80,"max":99,"score":4},{"min":60,"max":79,"score":2},{"min":0,"max":59,"score":0}]}',
             'auto', 'team_member_kpi_attainment_rate', 4),
            (v_policy_id, 'team_before_sale_sla', 'Chăm lead đúng SLA của team', 'process', 10, 'threshold', 'percentage', 90,
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":10},{"min":70,"max":89,"score":7},{"min":50,"max":69,"score":4},{"min":0,"max":49,"score":0}]}',
             'auto', 'team_before_sale_task_completed_on_time_rate', 5),
            (v_policy_id, 'team_after_sale', 'Chăm aftersale đúng mốc của team', 'process', 5, 'threshold', 'percentage', 90,
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":5},{"min":70,"max":89,"score":3},{"min":0,"max":69,"score":1}]}',
             'auto', 'team_after_sale_task_completed_on_time_rate', 6),
            (v_policy_id, 'team_lead_reclaimed', 'Lead bị thu hồi của team', 'process', 5, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-1,"max_deduct":-5}',
             'auto', 'team_lead_reclaimed_count', 7),
            (v_policy_id, 'report_handover', 'Báo cáo, bàn giao, điều phối ca', 'process', 5, 'manual', 'count', 0,
             '{"type":"manual","max_score":5}',
             'manual', 'teamlead_weekly_report_submission', 8),
            (v_policy_id, 'shift_coverage', 'Phủ ca đầy đủ, không để trống ca', 'process', 10, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-5,"max_deduct":-10}',
             'hybrid', 'shift_coverage_violation_count', 9),
            (v_policy_id, 'training_support', 'Kèm cặp / hỗ trợ sale trong team', 'quality', 5, 'manual', 'count', 0,
             '{"type":"manual","max_score":5}',
             'manual', 'teamlead_training_completion_score', 10),
            (v_policy_id, 'marketing_coordination', 'Phối hợp marketing / tư liệu', 'quality', 5, 'manual', 'count', 0,
             '{"type":"manual","max_score":5}',
             'manual', 'marketing_coordination_score', 11),
            (v_policy_id, 'team_conduct', 'Tác phong / phối hợp nội bộ', 'discipline', 5, 'manual', 'count', 0,
             '{"type":"manual","max_score":5}',
             'manual', 'team_conduct_cooperation_score', 12),
            (v_policy_id, 'team_operation_errors', 'Tỷ lệ lỗi vận hành sale của team', 'discipline', 10, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-2,"max_deduct":-10}',
             'auto', 'team_sale_operation_error_count', 13)
        ON CONFLICT (policy_id, metric_code) DO NOTHING;
    END IF;
END $$;

-- ── KPI_LEAD_KYTHUAT: 11 metrics (weight total = 100) ──────────────────
DO $$
DECLARE v_policy_id UUID;
BEGIN
    SELECT id INTO v_policy_id FROM kpi_policies WHERE code = 'KPI_LEAD_KYTHUAT';
    IF v_policy_id IS NOT NULL THEN
        DELETE FROM kpi_policy_metrics WHERE policy_id = v_policy_id;
        INSERT INTO kpi_policy_metrics (policy_id, metric_code, metric_name, metric_group, weight, score_type, target_type, target_value, scoring_rules, source_type, source_key, sort_order)
        VALUES
            (v_policy_id, 'team_on_time_rate', 'Tỷ lệ đúng hạn chung bộ phận KT', 'output', 15, 'threshold', 'percentage', 90,
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":15},{"min":80,"max":89,"score":10},{"min":70,"max":79,"score":5},{"min":0,"max":69,"score":0}]}',
             'auto', 'team_on_time_completion_rate', 1),
            (v_policy_id, 'team_completed_vs_plan', 'Tỷ lệ đơn hoàn thành đúng kế hoạch', 'output', 10, 'threshold', 'percentage', 100,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":10},{"min":90,"max":99,"score":7},{"min":80,"max":89,"score":4},{"min":0,"max":79,"score":0}]}',
             'hybrid', 'team_completed_jobs_vs_plan', 2),
            (v_policy_id, 'team_late_jobs', 'Tỷ lệ đơn bị trễ bộ phận KT', 'output', 10, 'threshold', 'count', 0,
             '{"type":"threshold","tiers":[{"min":0,"max":2,"score":10},{"min":3,"max":4,"score":7},{"min":5,"max":6,"score":3},{"min":7,"max":null,"score":0}]}',
             'auto', 'team_late_jobs_count', 3),
            (v_policy_id, 'team_rework', 'Tỷ lệ làm lại / bảo hành chung', 'quality', 10, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-2,"max_deduct":-10}',
             'auto', 'team_rework_count', 4),
            (v_policy_id, 'team_bad_feedback', 'Feedback không hài lòng liên quan KT', 'quality', 10, 'per_event', 'count', 0,
             '{"type":"per_event","tiers":[{"min":0,"max":0,"score":10},{"min":1,"max":1,"score":7},{"min":2,"max":2,"score":4},{"min":3,"max":null,"score":0}]}',
             'hybrid', 'team_bad_feedback_count', 5),
            (v_policy_id, 'team_critical_quality_error', 'Lỗi chất lượng nghiêm trọng', 'quality', 10, 'per_event', 'count', 0,
             '{"type":"per_event","tiers":[{"min":0,"max":0,"score":10},{"min":1,"max":null,"score":0}]}',
             'hybrid', 'team_critical_quality_error_count', 6),
            (v_policy_id, 'assignment_management', 'Phân việc / điều phối đơn hợp lý', 'process', 10, 'manual', 'count', 0,
             '{"type":"manual","max_score":10}',
             'manual', 'technical_assignment_management_score', 7),
            (v_policy_id, 'issue_handling', 'Xử lý phát sinh, gia hạn, phối hợp', 'process', 5, 'manual', 'count', 0,
             '{"type":"manual","max_score":5}',
             'hybrid', 'technical_issue_handling_score', 8),
            (v_policy_id, 'process_compliance', 'Tuân thủ quy trình KT toàn bộ phận', 'process', 5, 'manual', 'count', 0,
             '{"type":"manual","max_score":5}',
             'hybrid', 'team_technical_process_compliance_score', 9),
            (v_policy_id, 'tech_training', 'Kèm cặp / đào tạo kỹ thuật viên', 'quality', 10, 'manual', 'count', 0,
             '{"type":"manual","max_score":10}',
             'manual', 'technical_training_completion_score', 10),
            (v_policy_id, 'tech_conduct', 'Tác phong / phối hợp nội bộ bộ phận KT', 'discipline', 5, 'manual', 'count', 0,
             '{"type":"manual","max_score":5}',
             'manual', 'team_conduct_cooperation_score', 11)
        ON CONFLICT (policy_id, metric_code) DO NOTHING;
    END IF;
END $$;

-- ── KPI_QUANLY_CUAHANG: create policy + 12 metrics (weight total = 100) ─
INSERT INTO kpi_policies (code, name, role, description, effective_from)
VALUES ('KPI_QUANLY_CUAHANG', 'KPI Quản lý toàn cửa hàng', 'manager',
    'Chính sách KPI cho người chịu trách nhiệm vận hành toàn bộ shop', '2026-01-01')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE v_policy_id UUID;
BEGIN
    SELECT id INTO v_policy_id FROM kpi_policies WHERE code = 'KPI_QUANLY_CUAHANG';
    IF v_policy_id IS NOT NULL THEN
        DELETE FROM kpi_policy_metrics WHERE policy_id = v_policy_id;
        INSERT INTO kpi_policy_metrics (policy_id, metric_code, metric_name, metric_group, weight, score_type, target_type, target_value, scoring_rules, source_type, source_key, sort_order)
        VALUES
            (v_policy_id, 'store_revenue', 'Doanh thu toàn cửa hàng', 'output', 20, 'threshold', 'absolute', 0,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":20},{"min":90,"max":99,"score":16},{"min":80,"max":89,"score":10},{"min":0,"max":79,"score":0}]}',
             'auto', 'store_total_revenue', 1),
            (v_policy_id, 'store_close_rate', 'Tỷ lệ chốt chung team sale', 'output', 10, 'threshold', 'percentage', 60,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":10},{"min":80,"max":99,"score":8},{"min":60,"max":79,"score":5},{"min":0,"max":59,"score":2}]}',
             'auto', 'store_closed_leads_ratio', 2),
            (v_policy_id, 'store_return_customer', 'Tỷ lệ khách quay lại toàn shop', 'output', 5, 'threshold', 'count', 5,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":5},{"min":60,"max":99,"score":3},{"min":0,"max":59,"score":1}]}',
             'auto', 'store_return_customer_count', 3),
            (v_policy_id, 'store_shift_coverage', 'Phủ ca đầy đủ', 'process', 10, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-5,"max_deduct":-10}',
             'hybrid', 'shift_coverage_violation_count', 4),
            (v_policy_id, 'store_sla_compliance', 'Tuân thủ vận hành sale đúng SLA', 'process', 10, 'threshold', 'percentage', 90,
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":10},{"min":70,"max":89,"score":7},{"min":50,"max":69,"score":4},{"min":0,"max":49,"score":0}]}',
             'auto', 'store_sla_compliance_rate', 5),
            (v_policy_id, 'store_coordination', 'Điều phối sale-KT-bàn giao trơn tru', 'process', 10, 'manual', 'count', 0,
             '{"type":"manual","max_score":10}',
             'manual', 'store_coordination_score', 6),
            (v_policy_id, 'store_on_time_rate', 'Tỷ lệ đúng hạn chung kỹ thuật', 'quality', 10, 'threshold', 'percentage', 90,
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":10},{"min":80,"max":89,"score":7},{"min":70,"max":79,"score":4},{"min":0,"max":69,"score":0}]}',
             'auto', 'store_on_time_completion_rate', 7),
            (v_policy_id, 'store_rework', 'Tỷ lệ làm lại / bảo hành chung', 'quality', 5, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-1,"max_deduct":-5}',
             'auto', 'store_rework_count', 8),
            (v_policy_id, 'store_bad_feedback', 'Feedback không hài lòng toàn shop', 'quality', 5, 'per_event', 'count', 0,
             '{"type":"per_event","tiers":[{"min":0,"max":0,"score":5},{"min":1,"max":1,"score":3},{"min":2,"max":2,"score":1},{"min":3,"max":null,"score":0}]}',
             'hybrid', 'store_bad_feedback_count', 9),
            (v_policy_id, 'store_kpi_attainment', 'Tỷ lệ nhân sự đạt KPI trong tháng', 'output', 5, 'threshold', 'percentage', 80,
             '{"type":"threshold","tiers":[{"min":80,"max":null,"score":5},{"min":60,"max":79,"score":3},{"min":0,"max":59,"score":0}]}',
             'auto', 'store_member_kpi_attainment_rate', 10),
            (v_policy_id, 'store_training', 'Đào tạo và kèm cặp nhân sự', 'quality', 5, 'manual', 'count', 0,
             '{"type":"manual","max_score":5}',
             'manual', 'store_training_score', 11),
            (v_policy_id, 'store_marketing', 'Phối hợp marketing / tư liệu', 'quality', 5, 'manual', 'count', 0,
             '{"type":"manual","max_score":5}',
             'manual', 'marketing_coordination_score', 12)
        ON CONFLICT (policy_id, metric_code) DO NOTHING;
    END IF;
END $$;
