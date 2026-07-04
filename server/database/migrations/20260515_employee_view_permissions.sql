-- Quyền xem màn hình theo nhân viên (see supabase/migrations/20260515_employee_view_permissions.sql)
CREATE TABLE IF NOT EXISTS employee_view_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    allowed_views   TEXT[] NOT NULL DEFAULT '{}',
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_view_permissions_user ON employee_view_permissions(user_id);
