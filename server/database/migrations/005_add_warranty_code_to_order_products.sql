-- 005_add_warranty_code_to_order_products.sql
-- order_products table is missing warranty_code column that order_items already has.
-- The "Tạo HD Bảo hành" feature writes warranty_code via PATCH /:id/status,
-- causing Supabase to reject the update.

ALTER TABLE order_products ADD COLUMN IF NOT EXISTS warranty_code TEXT;
