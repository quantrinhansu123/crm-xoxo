-- ============================================================
-- Migration: Thêm employee_id vào kpi_rank_configs
-- Cho phép cấu hình xếp loại KPI riêng theo từng nhân viên.
-- NULL = global default, có giá trị = override cho nhân viên đó.
-- ============================================================

-- 1. Thêm cột employee_id (nullable)
ALTER TABLE kpi_rank_configs
    ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 2. Bỏ constraint UNIQUE (rank_code) vì giờ mỗi nhân viên có thể có bộ rank riêng
--    Thay bằng unique (rank_code, employee_id) với employee_id có thể NULL
ALTER TABLE kpi_rank_configs
    DROP CONSTRAINT IF EXISTS kpi_rank_configs_rank_code_key;

-- 3. Unique constraint mới: một rank_code chỉ xuất hiện 1 lần per employee (NULL = global)
--    Dùng partial index để handle NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_rank_global
    ON kpi_rank_configs (rank_code)
    WHERE employee_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_rank_per_employee
    ON kpi_rank_configs (rank_code, employee_id)
    WHERE employee_id IS NOT NULL;

-- 4. Index để query nhanh theo employee
CREATE INDEX IF NOT EXISTS idx_kpi_rank_configs_employee
    ON kpi_rank_configs (employee_id);

-- Verify
SELECT COUNT(*) AS global_configs FROM kpi_rank_configs WHERE employee_id IS NULL;
