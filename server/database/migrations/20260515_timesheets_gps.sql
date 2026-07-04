-- GPS metadata for mobile check-in / check-out (see supabase/migrations/20260515_timesheets_gps.sql)
ALTER TABLE timesheets
    ADD COLUMN IF NOT EXISTS check_in_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_in_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_in_accuracy_m DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_in_address TEXT,
    ADD COLUMN IF NOT EXISTS check_in_within_geofence BOOLEAN,
    ADD COLUMN IF NOT EXISTS check_out_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_out_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_out_accuracy_m DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_out_address TEXT,
    ADD COLUMN IF NOT EXISTS check_out_within_geofence BOOLEAN;
