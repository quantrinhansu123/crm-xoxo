-- Add technician commission audit fields for payroll reconciliation UI
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'salary_records' AND column_name = 'tech_service_fee_total'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN tech_service_fee_total NUMERIC(15,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'salary_records' AND column_name = 'tech_accessory_cost_total'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN tech_accessory_cost_total NUMERIC(15,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'salary_records' AND column_name = 'tech_commission_final'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN tech_commission_final NUMERIC(15,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'salary_records' AND column_name = 'tech_commission_policy_applied'
    ) THEN
        ALTER TABLE salary_records ADD COLUMN tech_commission_policy_applied BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

