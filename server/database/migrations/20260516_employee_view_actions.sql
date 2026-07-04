ALTER TABLE employee_view_permissions
    ADD COLUMN IF NOT EXISTS view_actions JSONB NOT NULL DEFAULT '{}'::jsonb;
