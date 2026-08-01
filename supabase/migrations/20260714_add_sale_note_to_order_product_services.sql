ALTER TABLE order_product_services
  ADD COLUMN IF NOT EXISTS sale_note TEXT;

COMMENT ON COLUMN order_product_services.sale_note IS 'Ghi chú của sale/nhân viên về dịch vụ này. Tách biệt với cột notes (bị dùng làm ghi chú hoàn thành dịch vụ của kỹ thuật viên) để tránh bị ghi đè khi hoàn thành dịch vụ.';
