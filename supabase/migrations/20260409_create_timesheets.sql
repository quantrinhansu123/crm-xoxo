-- ============================================================
-- Timesheets (Bảng chấm công)
-- ============================================================

-- Drop if exists from failed previous run
DROP TABLE IF EXISTS timesheets CASCADE;

CREATE TABLE timesheets (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_id    UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    schedule_date DATE NOT NULL,
    check_in    TIMESTAMPTZ,
    check_out   TIMESTAMPTZ,
    -- on_time | late_early | incomplete | not_checked | day_off
    status      TEXT NOT NULL DEFAULT 'not_checked',
    notes       TEXT,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT timesheets_unique UNIQUE (user_id, shift_id, schedule_date)
);

-- Index for date range queries
CREATE INDEX idx_timesheets_date ON timesheets (schedule_date);
CREATE INDEX idx_timesheets_user ON timesheets (user_id);
CREATE INDEX idx_timesheets_shift ON timesheets (shift_id);

-- RLS
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON timesheets
    FOR ALL USING (true) WITH CHECK (true);
