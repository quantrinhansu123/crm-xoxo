-- Migration: Create sla_fired_alerts table for persistent alert deduplication
-- Replaces in-memory Set<string> that was lost on server restart

CREATE TABLE IF NOT EXISTS sla_fired_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    rule_index INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(lead_id, rule_index, alert_type, DATE(created_at))
);

CREATE INDEX idx_sla_fired_alerts_lookup ON sla_fired_alerts(lead_id, rule_index, alert_type, DATE(created_at));