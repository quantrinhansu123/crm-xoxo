-- ============================================================
-- Salary Advances (Ứng lương)
-- Employee requests advance salary → Manager approves → 
-- Auto-deducted in monthly payroll calculation
-- ============================================================

CREATE TABLE IF NOT EXISTS salary_advances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Employee
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Amount & period
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    
    -- Request details
    reason TEXT,
    
    -- Status workflow: pending → approved → deducted | rejected
    status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected', 'deducted')),
    
    -- Approval
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    -- When deducted from salary
    deducted_at TIMESTAMPTZ,
    salary_record_id UUID, -- Link to the salary_record it was deducted from
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_salary_advances_user ON salary_advances(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_period ON salary_advances(year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_salary_advances_status ON salary_advances(status);
CREATE INDEX IF NOT EXISTS idx_salary_advances_user_period ON salary_advances(user_id, year, month);

-- RLS (Row Level Security)
ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;

-- Admin/Manager can see all
CREATE POLICY salary_advances_admin_all ON salary_advances
    FOR ALL USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_salary_advances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_salary_advances_updated_at ON salary_advances;
CREATE TRIGGER trg_salary_advances_updated_at
    BEFORE UPDATE ON salary_advances
    FOR EACH ROW
    EXECUTE FUNCTION update_salary_advances_updated_at();
