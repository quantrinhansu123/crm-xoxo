ALTER TABLE orders ADD COLUMN IF NOT EXISTS debt_payment_photos JSONB DEFAULT '[]';
COMMENT ON COLUMN orders.debt_payment_photos IS 'Ảnh chụp bằng chứng thu tiền (chuyển khoản hoặc tiền mặt) khi kiểm nợ';
