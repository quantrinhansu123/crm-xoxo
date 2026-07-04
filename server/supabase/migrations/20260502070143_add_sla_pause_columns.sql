ALTER TABLE order_item_steps
ADD COLUMN sla_paused_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN sla_total_paused_minutes INTEGER DEFAULT 0;