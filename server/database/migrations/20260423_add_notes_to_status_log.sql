-- Add notes column to order_item_status_log
-- To support backward move notes (ghi chú khi kéo lùi bước)

ALTER TABLE order_item_status_log
ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN order_item_status_log.notes IS 'Ghi chú bổ sung khi chuyển trạng thái (lùi bước, kéo về Sales, v.v.)';
