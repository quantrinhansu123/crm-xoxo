-- Add commission_rules column to salary_configs
ALTER TABLE salary_configs ADD COLUMN IF NOT EXISTS commission_rules JSONB DEFAULT '[]'::jsonb;

-- Ensure allowance_rules also exists just in case (as I saw it was used too)
ALTER TABLE salary_configs ADD COLUMN IF NOT EXISTS allowance_rules JSONB DEFAULT '[]'::jsonb;
