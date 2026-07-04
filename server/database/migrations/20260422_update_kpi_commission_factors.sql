-- ============================================================
-- Update KPI Commission Factors to Percentage format
-- Created: 2026-04-22
-- ============================================================

-- Task 1: Update existing data in kpi_rank_configs
UPDATE kpi_rank_configs 
SET commission_factor = commission_factor * 100;

-- Task 3: Update column defaults in schema for kpi_rank_configs
ALTER TABLE kpi_rank_configs 
ALTER COLUMN commission_factor SET DEFAULT 100.0;

-- Task 2: Update existing data in kpi_monthly
UPDATE kpi_monthly 
SET kpi_commission_factor = kpi_commission_factor * 100;

-- Task 3: Update column defaults in schema for kpi_monthly
ALTER TABLE kpi_monthly 
ALTER COLUMN kpi_commission_factor SET DEFAULT 100.0;
