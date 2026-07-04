-- ============================================================
-- KPI MULTI-ASSIGNMENT — Core Schema Migration
-- Created: 2026-04-26
-- MUST deploy atomically — all changes in this file are interdependent
-- ============================================================

-- 1. CREATE stores table
CREATE TABLE IF NOT EXISTS stores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    manager_id UUID REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stores_active ON stores(is_active);
CREATE INDEX IF NOT EXISTS idx_stores_manager ON stores(manager_id);

-- Seed XOXO store
INSERT INTO stores (code, name, address)
VALUES ('XOXO_LUXURY', 'XOXO Luxury', 'Cửa hàng XOXO Luxury')
ON CONFLICT (code) DO NOTHING;

-- Add store_id to users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'store_id'
    ) THEN
        ALTER TABLE users ADD COLUMN store_id UUID REFERENCES stores(id);
    END IF;
END $$;

-- Set all active users to XOXO store
UPDATE users SET store_id = (SELECT id FROM stores WHERE code = 'XOXO_LUXURY')
WHERE store_id IS NULL AND status = 'active';

-- 2. CREATE employee_kpi_assignments table
CREATE TABLE IF NOT EXISTS employee_kpi_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES kpi_policies(id),
    assignment_type VARCHAR(20) NOT NULL DEFAULT 'primary',
    compensation_bucket VARCHAR(50) NOT NULL,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_assignment_type CHECK (assignment_type IN ('primary', 'secondary')),
    CONSTRAINT uq_employee_policy_active UNIQUE (employee_id, policy_id, is_active) 
);

-- Only 1 primary per employee (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_primary_per_employee 
    ON employee_kpi_assignments (employee_id) 
    WHERE assignment_type = 'primary' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_assignments_employee ON employee_kpi_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_assignments_policy ON employee_kpi_assignments(policy_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active ON employee_kpi_assignments(is_active);
CREATE INDEX IF NOT EXISTS idx_assignments_type ON employee_kpi_assignments(assignment_type);
CREATE INDEX IF NOT EXISTS idx_assignments_bucket ON employee_kpi_assignments(compensation_bucket);

-- 3. MIGRATE existing users.kpi_policy_id → employee_kpi_assignments
INSERT INTO employee_kpi_assignments (employee_id, policy_id, assignment_type, compensation_bucket, effective_from, is_active, assigned_by)
SELECT 
    u.id,
    u.kpi_policy_id,
    'primary',
    CASE 
        WHEN p.code LIKE '%SALE%' THEN 'sale_personal'
        WHEN p.code LIKE '%KYTHUAT%' THEN 'technician_personal'
        WHEN p.code LIKE '%MARKETING%' THEN 'marketing'
        ELSE 'general'
    END,
    COALESCE(p.effective_from, CURRENT_DATE),
    true,
    NULL
FROM users u
JOIN kpi_policies p ON u.kpi_policy_id = p.id
WHERE u.kpi_policy_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. ALTER kpi_monthly — change UNIQUE constraint
-- Drop old unique constraint
ALTER TABLE kpi_monthly DROP CONSTRAINT IF EXISTS uq_employee_month;
-- Add new unique constraint allowing multiple policies per employee per month
ALTER TABLE kpi_monthly ADD CONSTRAINT uq_employee_month_policy 
    UNIQUE (employee_id, month_key, policy_id);

-- 5. ADD compensation_rules JSONB to kpi_policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'kpi_policies' AND column_name = 'compensation_rules'
    ) THEN
        ALTER TABLE kpi_policies ADD COLUMN compensation_rules JSONB DEFAULT '{}';
    END IF;
END $$;

-- Set compensation_rules for KPI_TEAMLEAD_SALE
UPDATE kpi_policies 
SET compensation_rules = '{
    "type": "team_revenue_percentage",
    "bucket": "teamlead_sale",
    "rates_by_rank": {
        "A+": 0.003,
        "A": 0.003,
        "B": 0.003,
        "C": 0.0015,
        "D": 0
    },
    "revenue_source": "team_order_revenue",
    "description": "Hoa hồng Teamlead = % doanh thu team theo rank KPI"
}'::jsonb
WHERE code = 'KPI_TEAMLEAD_SALE';

-- 6. ADD multi-bucket columns to salary_records
DO $$
BEGIN
    -- Primary KPI fields (replace single kpi_achievement)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_records' AND column_name = 'kpi_primary_score') THEN
        ALTER TABLE salary_records ADD COLUMN kpi_primary_score NUMERIC(6,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_records' AND column_name = 'kpi_primary_rank') THEN
        ALTER TABLE salary_records ADD COLUMN kpi_primary_rank VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_records' AND column_name = 'kpi_primary_bonus') THEN
        ALTER TABLE salary_records ADD COLUMN kpi_primary_bonus NUMERIC(15,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_records' AND column_name = 'kpi_primary_penalty') THEN
        ALTER TABLE salary_records ADD COLUMN kpi_primary_penalty NUMERIC(15,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_records' AND column_name = 'kpi_primary_commission_factor') THEN
        ALTER TABLE salary_records ADD COLUMN kpi_primary_commission_factor NUMERIC(5,2) DEFAULT 100.0;
    END IF;
    -- Secondary KPI aggregated fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_records' AND column_name = 'kpi_secondary_details') THEN
        ALTER TABLE salary_records ADD COLUMN kpi_secondary_details JSONB DEFAULT '[]';
    END IF;
    -- Teamlead-specific bonus
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_records' AND column_name = 'teamlead_bonus') THEN
        ALTER TABLE salary_records ADD COLUMN teamlead_bonus NUMERIC(15,2) DEFAULT 0;
    END IF;
    -- Management bonus (generic for any management role)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salary_records' AND column_name = 'management_bonus') THEN
        ALTER TABLE salary_records ADD COLUMN management_bonus NUMERIC(15,2) DEFAULT 0;
    END IF;
END $$;

-- 7. RLS + Triggers
ALTER TABLE employee_kpi_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employee_kpi_assignments_all" ON employee_kpi_assignments FOR ALL USING (true);
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_all" ON stores FOR ALL USING (true);

CREATE TRIGGER trg_employee_kpi_assignments_updated_at
    BEFORE UPDATE ON employee_kpi_assignments
    FOR EACH ROW EXECUTE FUNCTION update_kpi_updated_at();

CREATE TRIGGER trg_stores_updated_at
    BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_kpi_updated_at();
