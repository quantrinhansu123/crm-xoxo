-- Số Zalo khách (có thể khác SĐT liên hệ)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS zalo_phone TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_zalo_phone TEXT;

-- Đồng bộ alias nếu đã có dữ liệu một phía
UPDATE customers
SET customer_zalo_phone = COALESCE(customer_zalo_phone, zalo_phone)
WHERE customer_zalo_phone IS NULL AND zalo_phone IS NOT NULL;

UPDATE customers
SET zalo_phone = COALESCE(zalo_phone, customer_zalo_phone)
WHERE zalo_phone IS NULL AND customer_zalo_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_zalo_phone ON customers(zalo_phone);
