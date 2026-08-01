-- SLA/owner state machine required by Ban_dac_ta_he_thong_CRM_XOXO.md.
-- All durations are seconds; timestamps are stored as timestamptz (UTC).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS active_sla_id uuid,
  ADD COLUMN IF NOT EXISTS sla_type text,
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

CREATE TABLE IF NOT EXISTS lead_sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message_id text,
  source text,
  page_id text,
  conversation_id text,
  source_event_time timestamptz,
  backend_received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  event_version text,
  is_duplicate boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_sla_event_message
  ON lead_sla_events(source, page_id, conversation_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_messages_message_id
  ON lead_messages(message_id) WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_sla_warning
  ON leads(warning_at) WHERE warning_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_sla_deadline
  ON leads(current_deadline_at)
  WHERE sla_state IN ('UNASSIGNED_WAITING_SALE', 'OWNED_WAITING_SALE', 'OWNED_WAITING_CUSTOMER');

-- Legacy values are mapped conservatively. Active rows will be normalized by the
-- next inbound/outbound event; stopped rows remain stopped.
UPDATE leads
SET sla_state = CASE
  WHEN pipeline_stage = 'chot_don' THEN 'STOPPED_WON'
  WHEN pipeline_stage IN ('huy', 'fail') THEN 'STOPPED_FAILED'
  WHEN sla_state IN ('STOPPED', 'FINISHED') THEN 'STOPPED_FAILED'
  WHEN assigned_to IS NULL THEN 'UNASSIGNED_IDLE'
  ELSE 'OWNED_WAITING_CUSTOMER'
END
WHERE sla_state IS NULL
   OR sla_state NOT IN (
     'UNASSIGNED_IDLE', 'UNASSIGNED_WAITING_SALE',
     'OWNED_WAITING_CUSTOMER', 'OWNED_WAITING_SALE',
     'PAUSED_FOLLOWUP', 'STOPPED_WON', 'STOPPED_FAILED'
   );
