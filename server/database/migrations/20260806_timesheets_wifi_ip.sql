-- WiFi / IP metadata for mobile check-in / check-out
ALTER TABLE timesheets
    ADD COLUMN IF NOT EXISTS check_in_ip TEXT,
    ADD COLUMN IF NOT EXISTS check_in_wifi_ok BOOLEAN,
    ADD COLUMN IF NOT EXISTS check_out_ip TEXT,
    ADD COLUMN IF NOT EXISTS check_out_wifi_ok BOOLEAN;
