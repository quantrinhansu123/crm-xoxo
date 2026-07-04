-- Add new columns for advanced salary configuration
ALTER TABLE salary_configs ADD COLUMN IF NOT EXISTS bonus_scope VARCHAR(255) DEFAULT 'system';
ALTER TABLE salary_configs ADD COLUMN IF NOT EXISTS allowance_rules JSONB DEFAULT '[]'::jsonb;
ALTER TABLE salary_configs ADD COLUMN IF NOT EXISTS commission_rules JSONB DEFAULT '[]'::jsonb;
