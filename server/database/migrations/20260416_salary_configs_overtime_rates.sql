-- ============================================================
-- Migration: Add overtime_rates JSONB column to salary_configs
-- Stores hourly rate multipliers for different day types
-- Example: {"weekday": 150, "saturday": 200, "sunday": 200, "holiday": 200, "tet": 300}
-- ============================================================

ALTER TABLE public.salary_configs
ADD COLUMN IF NOT EXISTS overtime_rates jsonb DEFAULT '{"weekday": 150, "saturday": 200, "sunday": 200, "holiday": 200, "tet": 300}'::jsonb;

COMMENT ON COLUMN public.salary_configs.overtime_rates IS 'Hệ số lương làm thêm giờ (%) theo loại ngày: weekday, saturday, sunday, holiday, tet';
