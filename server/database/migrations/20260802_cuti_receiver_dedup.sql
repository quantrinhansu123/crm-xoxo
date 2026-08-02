-- CUTI CRM receivers: durable message_id dedup uses cuti_inbox.idempotency_key
-- (prefix cuti-recv:<message_id>). Ensure inbox + activity tables exist.

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
