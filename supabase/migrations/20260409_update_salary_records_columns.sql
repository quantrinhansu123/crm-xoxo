-- ============================================================
-- Add new columns to salary_records for the updated salary formula
-- New fields: service_commission, product_commission, referral_commission, advances
-- ============================================================

-- Commission breakdown columns
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'service_commission'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN service_commission NUMERIC(15,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'product_commission'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN product_commission NUMERIC(15,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'referral_commission'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN referral_commission NUMERIC(15,2) DEFAULT 0;
    END IF;

    -- Advances column (total salary advances deducted)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'advances'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN advances NUMERIC(15,2) DEFAULT 0;
    END IF;

    -- Gross salary (if not exists)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'gross_salary'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN gross_salary NUMERIC(15,2) DEFAULT 0;
    END IF;

    -- Social insurance
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'social_insurance'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN social_insurance NUMERIC(15,2) DEFAULT 0;
    END IF;

    -- Health insurance
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'health_insurance'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN health_insurance NUMERIC(15,2) DEFAULT 0;
    END IF;

    -- Personal tax
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'personal_tax'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN personal_tax NUMERIC(15,2) DEFAULT 0;
    END IF;

    -- Payment tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN payment_method VARCHAR(30);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'paid_at'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN paid_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'salary_records' AND column_name = 'paid_by'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN paid_by UUID REFERENCES users(id);
    END IF;
END $$;
