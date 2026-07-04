ALTER TABLE order_products
  ADD COLUMN IF NOT EXISTS warranty_code VARCHAR(64) NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS warranty_code VARCHAR(64) NULL;

COMMENT ON COLUMN order_products.warranty_code IS 'HDBH code khi tạo HD Bảo hành. Format: HDBH{order_code}.{last4_of_id}.{2-digit-sequence}. NULL nếu chưa bảo hành.';
COMMENT ON COLUMN order_items.warranty_code IS 'HDBH code khi tạo HD Bảo hành. Format: HDBH{order_code}.{last4_of_id}.{2-digit-sequence}. NULL nếu chưa bảo hành.';
