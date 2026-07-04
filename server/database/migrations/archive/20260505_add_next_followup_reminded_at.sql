-- Migration: Add next_followup_reminded_at to leads table
-- Purpose: Support SLA webhook reminders for next_followup_time (same as appointment_time)

ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup_reminded_at TIMESTAMPTZ;

-- Add index for cron query performance
CREATE INDEX IF NOT EXISTS idx_leads_next_followup_reminded_at ON leads(next_followup_reminded_at);

COMMENT ON COLUMN leads.next_followup_reminded_at IS 'Timestamp when the follow-up reminder webhook was fired';
