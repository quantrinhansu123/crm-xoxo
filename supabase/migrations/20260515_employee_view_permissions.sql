-- Quyền xem màn hình theo nhân viên (user_id / email đăng nhập)
CREATE TABLE IF NOT EXISTS employee_view_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    allowed_views   TEXT[] NOT NULL DEFAULT '{}',
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_view_permissions_user ON employee_view_permissions(user_id);

ALTER TABLE employee_view_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON employee_view_permissions
    FOR ALL USING (true) WITH CHECK (true);
