-- =============================================
-- Shifts table: defines shift types (CA SALE, CA KỸ THUẬT, etc.)
-- =============================================
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                          -- e.g. "CA SALE", "CA KỸ THUẬT"
    start_time TIME NOT NULL DEFAULT '09:00',    -- e.g. 09:00
    end_time TIME NOT NULL DEFAULT '21:00',      -- e.g. 21:00
    color TEXT DEFAULT 'blue',                   -- display color key
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default shifts
INSERT INTO shifts (name, start_time, end_time, color) VALUES
    ('CA SALE', '09:00', '21:00', 'emerald'),
    ('CA KỸ THUẬT', '10:00', '21:00', 'blue');

-- =============================================
-- Work Schedules table: links employee + shift + date
-- =============================================
CREATE TABLE IF NOT EXISTS work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    schedule_date DATE NOT NULL,
    repeat_weekly BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prevent duplicate shift assignments on the same day
    UNIQUE(user_id, shift_id, schedule_date)
);

-- Indexes for fast queries
CREATE INDEX idx_work_schedules_user_date ON work_schedules(user_id, schedule_date);
CREATE INDEX idx_work_schedules_date ON work_schedules(schedule_date);
CREATE INDEX idx_work_schedules_shift ON work_schedules(shift_id);

-- RLS policies (allow authenticated access)
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read shifts"
    ON shifts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin/manager to manage shifts"
    ON shifts FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to read work_schedules"
    ON work_schedules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin/manager to manage work_schedules"
    ON work_schedules FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
