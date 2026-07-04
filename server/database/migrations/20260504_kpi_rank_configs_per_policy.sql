-- ============================================================
-- Migration: Thêm policy_id vào kpi_rank_configs
-- Hệ thống 3-tier cho rank configs:
--   1. Global: policy_id = NULL AND employee_id = NULL -> Áp dụng cho tất cả
--   2. Policy-specific: policy_id IS NOT NULL -> Áp dụng theo policy
--   3. Employee-specific: employee_id IS NOT NULL -> Áp dụng theo nhân viên (deprecated)
-- ============================================================

-- 1. Thêm cột policy_id (nullable)
ALTER TABLE kpi_rank_configs
    ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES kpi_policies(id) ON DELETE CASCADE;

-- 2. Bỏ constraint UNIQUE (rank_code) cũ vì giờ có thể có rank theo policy
--    Thay bằng partial unique indexes để handle NULL values
ALTER TABLE kpi_rank_configs
    DROP CONSTRAINT IF EXISTS kpi_rank_configs_rank_code_key;

-- 3. Partial unique index cho global configs (cả policy_id và employee_id đều NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_rank_global
    ON kpi_rank_configs (rank_code)
    WHERE policy_id IS NULL AND employee_id IS NULL;

-- 4. Partial unique index cho policy-specific configs (policy_id có giá trị)
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_rank_per_policy
    ON kpi_rank_configs (rank_code, policy_id)
    WHERE policy_id IS NOT NULL;

-- 5. Index để query nhanh theo policy
CREATE INDEX IF NOT EXISTS idx_kpi_rank_configs_policy
    ON kpi_rank_configs (policy_id);

-- Verify: Đếm số global configs (cả policy_id và employee_id đều NULL)
SELECT COUNT(*) AS global_configs
FROM kpi_rank_configs
WHERE policy_id IS NULL AND employee_id IS NULL;