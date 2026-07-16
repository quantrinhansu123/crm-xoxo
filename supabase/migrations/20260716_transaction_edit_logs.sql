-- Lịch sử chỉnh sửa phiếu thu/chi
CREATE TABLE IF NOT EXISTS transaction_edit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    transaction_code TEXT,
    transaction_type TEXT,
    edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changes JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transaction_edit_logs_transaction_id
    ON transaction_edit_logs(transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_edit_logs_created_at
    ON transaction_edit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_edit_logs_type
    ON transaction_edit_logs(transaction_type);
