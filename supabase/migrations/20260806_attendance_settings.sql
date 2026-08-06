-- Singleton settings for mobile WiFi/IP attendance
CREATE TABLE IF NOT EXISTS attendance_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    allowed_ips TEXT[] NOT NULL DEFAULT '{}',
    office_name TEXT NOT NULL DEFAULT 'XOXO',
    wifi_name TEXT NOT NULL DEFAULT 'XOXO / AURA',
    office_address TEXT,
    enforce_wifi BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID NULL
);

INSERT INTO attendance_settings (id, allowed_ips, office_name, wifi_name, enforce_wifi)
VALUES (
    1,
    ARRAY[
        '42.114.71.44',
        '192.168.1.0/24',
        '192.168.11.0/24',
        '192.168.31.0/24'
    ],
    'XOXO',
    'XOXO / AURA',
    TRUE
)
ON CONFLICT (id) DO NOTHING;
