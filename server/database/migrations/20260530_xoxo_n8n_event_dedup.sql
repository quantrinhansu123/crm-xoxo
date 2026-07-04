CREATE TABLE IF NOT EXISTS xoxo_n8n_event_dedup (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    channel TEXT NOT NULL,
    target_user_id TEXT,
    payload JSONB,
    status TEXT DEFAULT 'received',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dedup_event_type ON xoxo_n8n_event_dedup(event_type);
CREATE INDEX IF NOT EXISTS idx_dedup_created_at ON xoxo_n8n_event_dedup(created_at);
