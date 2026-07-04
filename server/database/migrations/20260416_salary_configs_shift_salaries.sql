-- ============================================================
-- Migration: Add shift_salaries JSONB column and root shift rates
-- ============================================================

-- First drop the old columns in case they were created as double precision
ALTER TABLE public.salary_configs
  DROP COLUMN IF EXISTS shift_saturday_rate,
  DROP COLUMN IF EXISTS shift_sunday_rate,
  DROP COLUMN IF EXISTS shift_holiday_rate,
  DROP COLUMN IF EXISTS shift_tet_rate;

ALTER TABLE public.salary_configs
ADD COLUMN IF NOT EXISTS shift_salaries jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS shift_saturday_rate jsonb,
ADD COLUMN IF NOT EXISTS shift_sunday_rate jsonb,
ADD COLUMN IF NOT EXISTS shift_holiday_rate jsonb,
ADD COLUMN IF NOT EXISTS shift_tet_rate jsonb;

COMMENT ON COLUMN public.salary_configs.shift_salaries IS 'Cấu hình lương theo từng ca cụ thể: mảng object { shift_id, base_amount, saturday_rate, sunday_rate, holiday_rate, tet_rate }';
