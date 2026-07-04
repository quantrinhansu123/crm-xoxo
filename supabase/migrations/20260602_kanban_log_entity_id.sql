-- Link care/warranty kanban history to specific products/items
ALTER TABLE order_care_warranty_log
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS entity_type text;

ALTER TABLE order_after_sale_stage_log
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS entity_type text;
