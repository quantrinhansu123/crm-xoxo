-- Lưu ghi chú/ảnh minh chứng khi chuyển bước (forward move) hoặc khi archive dữ liệu cũ
ALTER TABLE order_care_warranty_log
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS photos text[];

ALTER TABLE order_after_sale_stage_log
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS photos text[];
