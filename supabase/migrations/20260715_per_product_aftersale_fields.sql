-- Mỗi sản phẩm trong cùng đơn phải điền độc lập: tách các trường kiểm nợ/người nhận/giao hàng
-- từ cấp Đơn hàng (orders) xuống cấp Sản phẩm (order_products/order_items), để 1 sản phẩm
-- hoàn thiện không khiến các sản phẩm khác trong cùng đơn bị coi là "đã đủ điều kiện".
ALTER TABLE order_products
  ADD COLUMN IF NOT EXISTS aftersale_receiver_name text,
  ADD COLUMN IF NOT EXISTS debt_checked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS debt_checked_notes text,
  ADD COLUMN IF NOT EXISTS debt_checked_by_name text,
  ADD COLUMN IF NOT EXISTS delivery_creator_name text,
  ADD COLUMN IF NOT EXISTS delivery_shipper_phone text,
  ADD COLUMN IF NOT EXISTS delivery_staff_name text,
  ADD COLUMN IF NOT EXISTS delivery_received_at timestamptz;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS aftersale_receiver_name text,
  ADD COLUMN IF NOT EXISTS debt_checked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS debt_checked_notes text,
  ADD COLUMN IF NOT EXISTS debt_checked_by_name text,
  ADD COLUMN IF NOT EXISTS delivery_creator_name text,
  ADD COLUMN IF NOT EXISTS delivery_shipper_phone text,
  ADD COLUMN IF NOT EXISTS delivery_staff_name text,
  ADD COLUMN IF NOT EXISTS delivery_received_at timestamptz;
