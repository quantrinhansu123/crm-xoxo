-- ============================================================
-- Violations & Rewards (Vi phạm / Thưởng)
-- Track employee violations (fines) and rewards (bonuses)
-- Auto-aggregated into monthly payroll calculation
-- ============================================================

CREATE TABLE IF NOT EXISTS violations_rewards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Employee
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Type: 'violation' (trừ tiền) or 'reward' (cộng tiền)
    type VARCHAR(10) NOT NULL CHECK (type IN ('violation', 'reward')),
    
    -- Category classification
    category VARCHAR(50) NOT NULL,
    -- violation categories: 'late', 'absent', 'rule_violation', 'customer_complaint', 'other'
    -- reward categories: 'performance', 'customer_praise', 'initiative', 'attendance_perfect', 'other'
    
    -- Amount (always positive, type determines add/subtract)
    amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    
    -- When it happened
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Period for payroll aggregation
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    
    -- Details
    description TEXT,
    
    -- Link to timesheet if generated from attendance
    timesheet_id UUID,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vr_user ON violations_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_vr_type ON violations_rewards(type);
CREATE INDEX IF NOT EXISTS idx_vr_period ON violations_rewards(year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_vr_user_period ON violations_rewards(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_vr_date ON violations_rewards(date DESC);
CREATE INDEX IF NOT EXISTS idx_vr_category ON violations_rewards(category);

-- RLS
ALTER TABLE violations_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY vr_admin_all ON violations_rewards
    FOR ALL USING (true);

-- Auto-update updated_at  
CREATE OR REPLACE FUNCTION update_vr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vr_updated_at ON violations_rewards;
CREATE TRIGGER trg_vr_updated_at
    BEFORE UPDATE ON violations_rewards
    FOR EACH ROW
    EXECUTE FUNCTION update_vr_updated_at();
