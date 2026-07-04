-- Payroll Batches table
-- Each row = one monthly payroll for the company
-- Auto-created on the last Sunday of each month

CREATE TABLE IF NOT EXISTS payroll_batches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    pay_period VARCHAR(50) DEFAULT 'Hàng tháng',
    work_period_start DATE NOT NULL,
    work_period_end DATE NOT NULL,
    
    -- Totals (aggregated from salary_records)
    total_salary NUMERIC(15,2) DEFAULT 0,
    total_paid NUMERIC(15,2) DEFAULT 0,
    total_remaining NUMERIC(15,2) DEFAULT 0,
    employee_count INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'paid', 'locked')),
    
    -- Metadata
    scope VARCHAR(100) DEFAULT 'Tất cả nhân viên',
    notes TEXT,
    
    -- Created
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    -- Approved/locked
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    
    -- Unique: one batch per month/year
    UNIQUE(month, year)
);

-- Add payroll_batch_id to salary_records to link individual records to a batch
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'payroll_batch_id'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN payroll_batch_id UUID REFERENCES payroll_batches(id);
    END IF;
END $$;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_payroll_batches_month_year ON payroll_batches(year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_salary_records_batch ON salary_records(payroll_batch_id);

-- Auto-generate batch code sequence
CREATE SEQUENCE IF NOT EXISTS payroll_batch_code_seq START WITH 1;

-- Function to generate next batch code
CREATE OR REPLACE FUNCTION generate_payroll_batch_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.code IS NULL OR NEW.code = '' THEN
        NEW.code := 'BL' || LPAD(nextval('payroll_batch_code_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS trg_payroll_batch_code ON payroll_batches;
CREATE TRIGGER trg_payroll_batch_code
    BEFORE INSERT ON payroll_batches
    FOR EACH ROW
    EXECUTE FUNCTION generate_payroll_batch_code();

-- Sync the sequence with existing data
DO $$
DECLARE
    max_code INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)), 0) INTO max_code FROM payroll_batches;
    PERFORM setval('payroll_batch_code_seq', GREATEST(max_code, 1));
END $$;
