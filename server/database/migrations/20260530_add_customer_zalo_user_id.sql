ALTER TABLE customers ADD COLUMN IF NOT EXISTS zalo_user_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_zalo_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_zalo_user_id ON customers(zalo_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_customer_zalo_user_id ON customers(customer_zalo_user_id);
