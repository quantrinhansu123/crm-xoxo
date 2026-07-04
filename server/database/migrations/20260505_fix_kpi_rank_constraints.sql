-- ============================================================
-- Migration: Fix unique constraints cho kpi_rank_configs
-- Issue: Có thể constraint cũ vẫn tồn tại hoặc dữ liệu cũ conflict
-- ============================================================

-- 1. Kiểm tra và xóa tất cả unique constraints cũ trên rank_code
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Tìm và xóa tất cả constraints có tên chứa 'rank_code' và 'key'
    FOR constraint_record IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'kpi_rank_configs'::regclass 
        AND contype = 'u'
        AND conname LIKE '%rank%'
    LOOP
        EXECUTE format('ALTER TABLE kpi_rank_configs DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
        RAISE NOTICE 'Dropped constraint: %', constraint_record.conname;
    END LOOP;
END $$;

-- 2. Drop indexes nếu tồn tại để recreate
DROP INDEX IF EXISTS uq_kpi_rank_global;
DROP INDEX IF EXISTS uq_kpi_rank_per_policy;

-- 3. Xóa các bản ghi policy có thể bị lỗi (policy_id = NULL nhưng lại có rank_code duplicate)
-- Giữ lại bản ghi global gốc (cũ nhất)
DELETE FROM kpi_rank_configs a
WHERE a.id IN (
    SELECT id FROM (
        SELECT id, rank_code, policy_id, employee_id,
               ROW_NUMBER() OVER (PARTITION BY rank_code 
                                  ORDER BY created_at ASC) as rn
        FROM kpi_rank_configs
        WHERE policy_id IS NULL AND employee_id IS NULL
    ) sub
    WHERE rn > 1
);

-- 4. Tạo lại partial unique indexes đúng chuẩn

-- Index cho global configs: chỉ áp dụng khi cả policy_id và employee_id đều NULL
CREATE UNIQUE INDEX uq_kpi_rank_global
    ON kpi_rank_configs (rank_code)
    WHERE policy_id IS NULL AND employee_id IS NULL;

-- Index cho policy-specific configs: áp dụng khi policy_id có giá trị
CREATE UNIQUE INDEX uq_kpi_rank_per_policy
    ON kpi_rank_configs (policy_id, rank_code)
    WHERE policy_id IS NOT NULL;

-- 5. Verify kết quả
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'kpi_rank_configs' 
AND indexname LIKE 'uq_kpi_rank%'
ORDER BY indexname;
