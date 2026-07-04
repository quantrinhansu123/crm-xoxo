-- Phiếu thu/chi gắn sản phẩm đơn (HĐ74.1, HĐ74.2, …)
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS order_product_id UUID REFERENCES order_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_order_product_id
    ON transactions(order_product_id);

COMMENT ON COLUMN transactions.order_product_id IS 'Sản phẩm khách (order_products) mà phiếu thu/chi gắn với';
