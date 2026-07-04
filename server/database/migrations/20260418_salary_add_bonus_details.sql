-- Migration: Add manual bonus details to salary_records
-- Description: Adds a JSONB column to store categorized manual bonuses and their metadata.

ALTER TABLE salary_records 
ADD COLUMN IF NOT EXISTS bonus_details JSONB DEFAULT '{"byDay": [], "other": []}';

-- Update existing records to have a valid JSON structure if needed
UPDATE salary_records 
SET bonus_details = '{"byDay": [], "other": []}' 
WHERE bonus_details IS NULL;
