-- Quyền action (sửa / xóa) theo từng màn hình
-- Ví dụ: { "orders": { "edit": true, "delete": false }, "invoices": { "edit": true, "delete": true } }
ALTER TABLE employee_view_permissions
    ADD COLUMN IF NOT EXISTS view_actions JSONB NOT NULL DEFAULT '{}'::jsonb;
