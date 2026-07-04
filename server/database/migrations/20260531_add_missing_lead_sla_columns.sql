-- Ensure lead SLA state-machine columns exist in live databases.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS current_rule_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_valid_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appointment_reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_reminded_at TIMESTAMPTZ;

UPDATE leads
SET sla_state = 'ACTIVE'
WHERE sla_state NOT IN ('ACTIVE', 'PAUSED_APPOINTMENT', 'FINISHED', 'RECLAIMED', 'STOPPED');
