-- CUTI Integration Contract v1.0.0
-- Inbox / Outbox / projection fields / five-state remap
-- Self-contained: also ensures SLA columns from 20260726 exist (safe IF NOT EXISTS)

-- Ensure Core SLA / CAS columns exist (may be missing if prior migration was skipped)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS active_sla_id uuid,
  ADD COLUMN IF NOT EXISTS sla_type text,
  ADD COLUMN IF NOT EXISTS current_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_rule_index integer,
  ADD COLUMN IF NOT EXISTS current_milestone_index integer,
  ADD COLUMN IF NOT EXISTS current_milestone_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS current_cycle_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS warning_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualifying_from_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_owner_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS trigger_message_id text,
  ADD COLUMN IF NOT EXISTS qualifying_message_id text,
  ADD COLUMN IF NOT EXISTS sla_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_remaining_seconds integer,
  ADD COLUMN IF NOT EXISTS sla_stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_intrusion_at timestamptz,
  ADD COLUMN IF NOT EXISTS warning_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;

-- CUTI projection / catalog fields
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS external_lead_key text,
  ADD COLUMN IF NOT EXISTS page_id text,
  ADD COLUMN IF NOT EXISTS conversation_id text,
  ADD COLUMN IF NOT EXISTS customer_external_id text,
  ADD COLUMN IF NOT EXISTS state_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_reason text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_id uuid,
  ADD COLUMN IF NOT EXISTS followup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS crm_note text,
  ADD COLUMN IF NOT EXISTS appointment_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_summary text;

COMMENT ON COLUMN leads.version IS 'CUTI state_version — monotonic CAS / projection ordering';

CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_external_lead_key
  ON leads(external_lead_key) WHERE external_lead_key IS NOT NULL;

-- Inbox: durable source/command idempotency
CREATE TABLE IF NOT EXISTS cuti_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  command_id uuid,
  correlation_id text,
  actor_id uuid,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_status text NOT NULL DEFAULT 'ACCEPTED',
  result_event_id uuid,
  result_state_version bigint,
  result_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cuti_inbox_idempotency
  ON cuti_inbox(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_cuti_inbox_lead
  ON cuti_inbox(lead_id, processed_at DESC);

-- Outbox: durable Backend→CRM projection/activity delivery
CREATE TABLE IF NOT EXISTS cuti_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  event_name text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  state_version bigint,
  idempotency_key text NOT NULL,
  correlation_id text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuti_outbox_pending
  ON cuti_outbox(next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cuti_outbox_lead
  ON cuti_outbox(lead_id, created_at DESC);

-- Activity append log (CRM projection of activities; also used for dedup)
CREATE TABLE IF NOT EXISTS cuti_lead_activities (
  event_id uuid PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  summary text NOT NULL,
  actor_id text,
  state_version bigint,
  occurred_at timestamptz NOT NULL,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuti_lead_activities_lead
  ON cuti_lead_activities(lead_id, occurred_at DESC);

-- Supporting SLA tables (no-op if already created by 20260726)
CREATE TABLE IF NOT EXISTS lead_sla_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES users(id),
  milestone_index integer NOT NULL,
  duration_seconds integer NOT NULL,
  cycle_started_at timestamptz NOT NULL,
  warning_at timestamptz NOT NULL,
  qualifying_from_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  qualifying_message_id text,
  completed_at timestamptz,
  expired_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'PAUSED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_one_active_milestone
  ON lead_sla_milestones(lead_id) WHERE status IN ('ACTIVE', 'PAUSED');

CREATE TABLE IF NOT EXISTS lead_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  old_owner_id uuid REFERENCES users(id),
  new_owner_id uuid REFERENCES users(id),
  reason text NOT NULL,
  event_time timestamptz NOT NULL,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Remap Ban_đặc_tả states → CUTI five-state machine
UPDATE leads
SET
  sla_state = CASE
    WHEN sla_state IN ('UNASSIGNED_IDLE', 'UNASSIGNED_WAITING_SALE') THEN 'SHARED_WAITING_SALE'
    WHEN sla_state = 'PAUSED_FOLLOWUP' THEN 'OWNED_WAITING_CUSTOMER'
    ELSE sla_state
  END,
  state_changed_at = COALESCE(state_changed_at, updated_at, created_at),
  outcome = CASE
    WHEN sla_state = 'STOPPED_WON' OR pipeline_stage = 'chot_don' THEN COALESCE(outcome, 'WON')
    WHEN sla_state = 'STOPPED_FAILED' OR pipeline_stage IN ('huy', 'fail') THEN COALESCE(outcome, 'FAILED')
    ELSE outcome
  END,
  closed_at = CASE
    WHEN sla_state IN ('STOPPED_WON', 'STOPPED_FAILED') OR pipeline_stage IN ('chot_don', 'huy', 'fail')
      THEN COALESCE(closed_at, sla_stopped_at, updated_at)
    ELSE closed_at
  END
WHERE sla_state IN (
  'UNASSIGNED_IDLE', 'UNASSIGNED_WAITING_SALE', 'PAUSED_FOLLOWUP',
  'OWNED_WAITING_SALE', 'OWNED_WAITING_CUSTOMER', 'STOPPED_WON', 'STOPPED_FAILED'
)
   OR pipeline_stage IN ('chot_don', 'huy', 'fail');

-- Appointment backfill only if legacy column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'appointment_time'
  ) THEN
    UPDATE leads
    SET appointment_scheduled_at = appointment_time
    WHERE appointment_scheduled_at IS NULL AND appointment_time IS NOT NULL;
  END IF;
END $$;

-- Deadline index only if current_deadline_at exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'current_deadline_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_leads_cuti_deadline
      ON leads(current_deadline_at)
      WHERE sla_state IN ('SHARED_WAITING_SALE', 'OWNED_WAITING_SALE', 'OWNED_WAITING_CUSTOMER');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_sla_warning
  ON leads(warning_at) WHERE warning_sent_at IS NULL;
