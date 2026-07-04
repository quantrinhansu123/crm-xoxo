-- ============================================================
-- KPI MODULE - Complete Database Schema
-- Created: 2026-04-18
-- Description: Creates all tables for the KPI module
-- Tables: kpi_policies, kpi_policy_metrics, kpi_rank_configs,
--         kpi_monthly, kpi_monthly_items, kpi_violation_logs,
--         kpi_adjustment_logs
-- Also: Adds kpi_policy_id column to users table
-- ============================================================

-- ============================================================
-- 1. kpi_policies - Chinh sach KPI theo role
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_policies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    role VARCHAR(50) NOT NULL,
    description TEXT,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. kpi_policy_metrics - Chi tieu KPI trong moi chinh sach
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_policy_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    policy_id UUID NOT NULL REFERENCES kpi_policies(id) ON DELETE CASCADE,
    metric_code VARCHAR(100) NOT NULL,
    metric_name VARCHAR(200) NOT NULL,
    metric_group VARCHAR(50) NOT NULL DEFAULT 'output',
    description TEXT,
    weight NUMERIC(5,2) NOT NULL DEFAULT 0,
    score_type VARCHAR(20) NOT NULL DEFAULT 'threshold',
    target_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
    target_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    scoring_rules JSONB NOT NULL DEFAULT '{}',
    source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    source_key VARCHAR(200),
    manual_input_allowed BOOLEAN NOT NULL DEFAULT false,
    manager_review_required BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_metric_group CHECK (metric_group IN ('output', 'process', 'discipline', 'quality')),
    CONSTRAINT chk_score_type CHECK (score_type IN ('threshold', 'linear', 'per_event', 'boolean', 'manual')),
    CONSTRAINT chk_target_type CHECK (target_type IN ('percentage', 'absolute', 'count')),
    CONSTRAINT chk_source_type CHECK (source_type IN ('auto', 'hybrid', 'manual')),
    CONSTRAINT uq_policy_metric UNIQUE (policy_id, metric_code)
);

-- ============================================================
-- 3. kpi_rank_configs - Cau hinh xep loai KPI
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_rank_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rank_code VARCHAR(10) NOT NULL UNIQUE,
    rank_name VARCHAR(50) NOT NULL,
    min_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    max_score NUMERIC(5,2) NOT NULL DEFAULT 100,
    bonus_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    penalty_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    commission_factor NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. kpi_monthly - Ket qua KPI thang cua tung nhan su
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_monthly (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month_key VARCHAR(7) NOT NULL,
    policy_id UUID NOT NULL REFERENCES kpi_policies(id),
    total_score NUMERIC(6,2) NOT NULL DEFAULT 0,
    rank VARCHAR(10),
    kpi_bonus_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    kpi_penalty_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    kpi_commission_factor NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    manual_adjustment_score NUMERIC(6,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_monthly_status CHECK (status IN ('draft', 'pending', 'locked')),
    CONSTRAINT uq_employee_month UNIQUE (employee_id, month_key)
);

-- ============================================================
-- 5. kpi_monthly_items - Chi tiet tung chi tieu trong thang
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_monthly_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    monthly_kpi_id UUID NOT NULL REFERENCES kpi_monthly(id) ON DELETE CASCADE,
    metric_code VARCHAR(100) NOT NULL,
    metric_name VARCHAR(200) NOT NULL,
    metric_group VARCHAR(50) NOT NULL DEFAULT 'output',
    weight NUMERIC(5,2) NOT NULL DEFAULT 0,
    target_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    actual_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    achievement_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
    raw_score NUMERIC(6,2) NOT NULL DEFAULT 0,
    manual_adjustment NUMERIC(6,2) NOT NULL DEFAULT 0,
    final_score NUMERIC(6,2) NOT NULL DEFAULT 0,
    source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    source_ref JSONB,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. kpi_violation_logs - Log vi pham KPI
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_violation_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month_key VARCHAR(7) NOT NULL,
    violation_type VARCHAR(50) NOT NULL,
    rule_code VARCHAR(100),
    rule_name VARCHAR(200) NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    deduct_kpi_point NUMERIC(6,2) NOT NULL DEFAULT 0,
    deduct_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    related_lead_id UUID,
    related_order_id UUID,
    note TEXT,
    attachments JSONB DEFAULT '[]',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    CONSTRAINT chk_violation_type CHECK (violation_type IN ('discipline', 'quality', 'process', 'other')),
    CONSTRAINT chk_violation_source CHECK (source_type IN ('auto', 'manual')),
    CONSTRAINT chk_violation_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- ============================================================
-- 7. kpi_adjustment_logs - Log chinh sua sau khi da lock
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_adjustment_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    monthly_kpi_id UUID NOT NULL REFERENCES kpi_monthly(id) ON DELETE CASCADE,
    action_type VARCHAR(30) NOT NULL,
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    reason TEXT NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_action_type CHECK (action_type IN ('score_adjust', 'unlock', 'override', 'note'))
);

-- ============================================================
-- 8. Add kpi_policy_id to users table
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'kpi_policy_id'
    ) THEN
        ALTER TABLE users ADD COLUMN kpi_policy_id UUID REFERENCES kpi_policies(id);
    END IF;
END $$;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_kpi_policies_role ON kpi_policies(role);
CREATE INDEX IF NOT EXISTS idx_kpi_policies_active ON kpi_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_kpi_policy_metrics_policy ON kpi_policy_metrics(policy_id);
CREATE INDEX IF NOT EXISTS idx_kpi_policy_metrics_group ON kpi_policy_metrics(metric_group);
CREATE INDEX IF NOT EXISTS idx_kpi_monthly_employee ON kpi_monthly(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_monthly_month ON kpi_monthly(month_key);
CREATE INDEX IF NOT EXISTS idx_kpi_monthly_status ON kpi_monthly(status);
CREATE INDEX IF NOT EXISTS idx_kpi_monthly_policy ON kpi_monthly(policy_id);
CREATE INDEX IF NOT EXISTS idx_kpi_monthly_emp_month ON kpi_monthly(employee_id, month_key);
CREATE INDEX IF NOT EXISTS idx_kpi_monthly_items_kpi ON kpi_monthly_items(monthly_kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_violations_employee ON kpi_violation_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_violations_month ON kpi_violation_logs(month_key);
CREATE INDEX IF NOT EXISTS idx_kpi_violations_status ON kpi_violation_logs(status);
CREATE INDEX IF NOT EXISTS idx_kpi_violations_emp_month ON kpi_violation_logs(employee_id, month_key);
CREATE INDEX IF NOT EXISTS idx_kpi_adjustments_kpi ON kpi_adjustment_logs(monthly_kpi_id);
CREATE INDEX IF NOT EXISTS idx_users_kpi_policy ON users(kpi_policy_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE kpi_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_policy_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_rank_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_monthly_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_violation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_adjustment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_policies_all" ON kpi_policies FOR ALL USING (true);
CREATE POLICY "kpi_policy_metrics_all" ON kpi_policy_metrics FOR ALL USING (true);
CREATE POLICY "kpi_rank_configs_all" ON kpi_rank_configs FOR ALL USING (true);
CREATE POLICY "kpi_monthly_all" ON kpi_monthly FOR ALL USING (true);
CREATE POLICY "kpi_monthly_items_all" ON kpi_monthly_items FOR ALL USING (true);
CREATE POLICY "kpi_violation_logs_all" ON kpi_violation_logs FOR ALL USING (true);
CREATE POLICY "kpi_adjustment_logs_all" ON kpi_adjustment_logs FOR ALL USING (true);

-- ============================================================
-- TRIGGERS - Auto update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_kpi_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kpi_policies_updated_at
    BEFORE UPDATE ON kpi_policies
    FOR EACH ROW EXECUTE FUNCTION update_kpi_updated_at();

CREATE TRIGGER trg_kpi_policy_metrics_updated_at
    BEFORE UPDATE ON kpi_policy_metrics
    FOR EACH ROW EXECUTE FUNCTION update_kpi_updated_at();

CREATE TRIGGER trg_kpi_rank_configs_updated_at
    BEFORE UPDATE ON kpi_rank_configs
    FOR EACH ROW EXECUTE FUNCTION update_kpi_updated_at();

CREATE TRIGGER trg_kpi_monthly_updated_at
    BEFORE UPDATE ON kpi_monthly
    FOR EACH ROW EXECUTE FUNCTION update_kpi_updated_at();

CREATE TRIGGER trg_kpi_monthly_items_updated_at
    BEFORE UPDATE ON kpi_monthly_items
    FOR EACH ROW EXECUTE FUNCTION update_kpi_updated_at();

-- ============================================================
-- SEED DATA - Default rank configs
-- ============================================================
INSERT INTO kpi_rank_configs (rank_code, rank_name, min_score, max_score, bonus_amount, penalty_amount, commission_factor, sort_order)
VALUES
    ('A+', 'Xuất sắc',     95, 100, 500000, 0, 1.10, 1),
    ('A',  'Tốt',          85,  94, 300000, 0, 1.00, 2),
    ('B',  'Khá',          75,  84, 100000, 0, 1.00, 3),
    ('C',  'Trung bình',   65,  74,      0, 0, 0.80, 4),
    ('D',  'Yếu',           0,  64,      0, 200000, 0.50, 5)
ON CONFLICT (rank_code) DO NOTHING;

-- ============================================================
-- SEED DATA - Sample KPI policies
-- ============================================================
INSERT INTO kpi_policies (code, name, role, description, effective_from)
VALUES
    ('KPI_SALE_FULLTIME', 'KPI Sale Full-time', 'sale',
     'Chính sách KPI dành cho nhân viên sale full-time', '2026-01-01'),
    ('KPI_SALE_PARTTIME', 'KPI Sale Part-time', 'sale',
     'Chính sách KPI dành cho nhân viên sale part-time', '2026-01-01'),
    ('KPI_KYTHUAT_CHINH', 'KPI Kỹ thuật chính', 'technician',
     'Chính sách KPI dành cho kỹ thuật viên chính', '2026-01-01'),
    ('KPI_KYTHUAT_PARTTIME', 'KPI Kỹ thuật Part-time', 'technician',
     'Chính sách KPI dành cho kỹ thuật viên part-time', '2026-01-01'),
    ('KPI_TEAMLEAD_SALE', 'KPI Team Lead Sale', 'manager',
     'Chính sách KPI dành cho team lead sale', '2026-01-01'),
    ('KPI_LEAD_KYTHUAT', 'KPI Lead Kỹ thuật', 'manager',
     'Chính sách KPI dành cho lead kỹ thuật', '2026-01-01'),
    ('KPI_MARKETING', 'KPI Marketing', 'sale',
     'Chính sách KPI dành cho nhân viên marketing', '2026-01-01')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- SEED DATA - Sample metrics for KPI_SALE_FULLTIME
-- ============================================================
DO $$
DECLARE
    v_policy_id UUID;
BEGIN
    SELECT id INTO v_policy_id FROM kpi_policies WHERE code = 'KPI_SALE_FULLTIME';
    IF v_policy_id IS NOT NULL THEN
        INSERT INTO kpi_policy_metrics (policy_id, metric_code, metric_name, metric_group, description, weight, score_type, target_type, target_value, scoring_rules, source_type, source_key, sort_order)
        VALUES
            (v_policy_id, 'revenue_personal', 'Doanh thu cá nhân', 'output',
             'Tổng doanh thu từ đơn hàng đã hoàn thành', 35, 'threshold', 'absolute', 50000000,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":35},{"min":90,"max":99,"score":30},{"min":80,"max":89,"score":24},{"min":70,"max":79,"score":18},{"min":0,"max":69,"score":10}]}',
             'auto', 'order_revenue_by_sale', 1),
            (v_policy_id, 'close_rate', 'Tỷ lệ chốt', 'output',
             'Tỷ lệ lead chuyển đổi thành đơn hàng', 15, 'threshold', 'percentage', 30,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":15},{"min":80,"max":99,"score":12},{"min":60,"max":79,"score":8},{"min":0,"max":59,"score":4}]}',
             'auto', 'closed_leads_ratio', 2),
            (v_policy_id, 'return_customer', 'Khách quay lại', 'output',
             'Số khách hàng cũ quay lại mua', 10, 'threshold', 'count', 3,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":10},{"min":67,"max":99,"score":7},{"min":33,"max":66,"score":4},{"min":0,"max":32,"score":0}]}',
             'auto', 'return_customer_count', 3),
            (v_policy_id, 'follow_before_sale', 'Follow đúng mốc before sale', 'process',
             'Hoàn thành task follow-up trước bán đúng hạn', 10, 'threshold', 'percentage', 100,
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":10},{"min":70,"max":89,"score":7},{"min":50,"max":69,"score":4},{"min":0,"max":49,"score":0}]}',
             'hybrid', 'before_sale_task_completed_on_time_rate', 4),
            (v_policy_id, 'follow_after_sale', 'Follow đúng mốc after sale', 'process',
             'Hoàn thành task chăm sóc sau bán đúng hạn', 10, 'threshold', 'percentage', 100,
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":10},{"min":70,"max":89,"score":7},{"min":50,"max":69,"score":4},{"min":0,"max":49,"score":0}]}',
             'hybrid', 'after_sale_task_completed_on_time_rate', 5),
            (v_policy_id, 'lead_reclaimed', 'Lead bị thu hồi', 'discipline',
             'Số lead bị thu hồi do không follow đúng', 5, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-0.5,"max_deduct":-5}',
             'auto', 'lead_reclaimed_count', 6),
            (v_policy_id, 'sla_missed', 'Rep quá SLA', 'discipline',
             'Số lần phản hồi quá thời gian SLA', 5, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-1,"max_deduct":-5}',
             'auto', 'sla_missed_count', 7),
            (v_policy_id, 'uniform_violation', 'Không mặc đồng phục', 'discipline',
             'Số lần vi phạm không mặc đồng phục', 5, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-1,"max_deduct":-5}',
             'manual', 'employee_violation_logs', 8),
            (v_policy_id, 'photo_missing', 'Quên chụp ảnh trước/sau', 'quality',
             'Số lần quên chụp ảnh before/after', 5, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-1,"max_deduct":-5}',
             'manual', 'employee_violation_logs', 9)
        ON CONFLICT (policy_id, metric_code) DO NOTHING;
    END IF;
END $$;

-- ============================================================
-- SEED DATA - Sample metrics for KPI_KYTHUAT_CHINH
-- ============================================================
DO $$
DECLARE
    v_policy_id UUID;
BEGIN
    SELECT id INTO v_policy_id FROM kpi_policies WHERE code = 'KPI_KYTHUAT_CHINH';
    IF v_policy_id IS NOT NULL THEN
        INSERT INTO kpi_policy_metrics (policy_id, metric_code, metric_name, metric_group, description, weight, score_type, target_type, target_value, scoring_rules, source_type, source_key, sort_order)
        VALUES
            (v_policy_id, 'completed_jobs', 'Số đơn hoàn thành', 'output',
             'Tổng số đơn kỹ thuật đã hoàn thành', 30, 'threshold', 'count', 15,
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":30},{"min":80,"max":99,"score":24},{"min":60,"max":79,"score":18},{"min":0,"max":59,"score":10}]}',
             'auto', 'completed_jobs_count', 1),
            (v_policy_id, 'on_time_rate', 'Tỷ lệ đúng hạn', 'output',
             'Tỷ lệ đơn hoàn thành đúng deadline', 20, 'threshold', 'percentage', 90,
             '{"type":"threshold","tiers":[{"min":95,"max":null,"score":20},{"min":85,"max":94,"score":16},{"min":75,"max":84,"score":12},{"min":0,"max":74,"score":6}]}',
             'auto', 'on_time_completion_rate', 2),
            (v_policy_id, 'status_update', 'Cập nhật trạng thái đầy đủ', 'process',
             'Cập nhật đầy đủ trạng thái đơn trên hệ thống', 10, 'threshold', 'percentage', 100,
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":10},{"min":70,"max":89,"score":7},{"min":0,"max":69,"score":3}]}',
             'hybrid', 'status_update_rate', 3),
            (v_policy_id, 'late_jobs', 'Số đơn trễ', 'discipline',
             'Số đơn hoàn thành trễ deadline', 10, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-2,"max_deduct":-10}',
             'auto', 'late_jobs_count', 4),
            (v_policy_id, 'cleaning_violation', 'Không vệ sinh khu làm việc', 'discipline',
             'Số lần vi phạm không dọn vệ sinh sau khi làm', 10, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-2,"max_deduct":-10}',
             'manual', 'employee_violation_logs', 5),
            (v_policy_id, 'bad_feedback', 'Feedback không hài lòng', 'quality',
             'Số feedback đánh giá không hài lòng từ khách', 10, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-2,"max_deduct":-10}',
             'hybrid', 'bad_feedback_count', 6),
            (v_policy_id, 'rework_count', 'Tỷ lệ làm lại / bảo hành', 'quality',
             'Số lần phải làm lại hoặc bảo hành', 10, 'per_event', 'count', 0,
             '{"type":"per_event","points_per_event":-2,"max_deduct":-10}',
             'auto', 'rework_count', 7)
        ON CONFLICT (policy_id, metric_code) DO NOTHING;
    END IF;
END $$;
