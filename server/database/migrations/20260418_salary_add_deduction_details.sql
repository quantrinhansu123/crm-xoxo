-- Migration: Add manual deduction details to salary_records
-- Description: Adds a JSONB column to store categorized manual deductions.

ALTER TABLE salary_records 
ADD COLUMN IF NOT EXISTS deduction_details JSONB DEFAULT '{"byDay": [], "other": []}';

-- Update existing records
UPDATE salary_records 
SET deduction_details = '{"byDay": [], "other": []}' 
WHERE deduction_details IS NULL;
