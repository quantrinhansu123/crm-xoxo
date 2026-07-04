-- Link payment records to order products and classify deposit vs payment
ALTER TABLE payment_records
    ADD COLUMN IF NOT EXISTS order_product_id UUID REFERENCES order_products(id) ON DELETE SET NULL;

ALTER TABLE payment_records
    ADD COLUMN IF NOT EXISTS payment_kind TEXT;

ALTER TABLE payment_records DROP CONSTRAINT IF EXISTS payment_records_payment_kind_check;
ALTER TABLE payment_records
    ADD CONSTRAINT payment_records_payment_kind_check
    CHECK (payment_kind IS NULL OR payment_kind IN ('deposit', 'payment'));

CREATE INDEX IF NOT EXISTS idx_payment_records_order_product_id
    ON payment_records(order_product_id);
