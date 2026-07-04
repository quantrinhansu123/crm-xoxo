-- 004_hotfix_workflow_to_aftersale.sql
-- Hotfix: Move items stuck at current_phase='workflow' to 'after_sale'
-- when their parent order is already 'done' or 'after_sale'.
-- This fixes items that completed workflow before the dual-write was in place.
-- Safe to run multiple times (idempotent).

-- STEP A: Fix order_items stuck in workflow on completed orders
UPDATE order_items
SET current_phase = 'after_sale',
    phase_stage = 'after1'
WHERE current_phase = 'workflow'
  AND order_id IN (
    SELECT id FROM orders WHERE status IN ('done', 'after_sale')
  );

-- STEP B: Fix order_products stuck in workflow on completed orders
UPDATE order_products
SET current_phase = 'after_sale',
    phase_stage = 'after1'
WHERE current_phase = 'workflow'
  AND order_id IN (
    SELECT id FROM orders WHERE status IN ('done', 'after_sale')
  );

-- STEP C: Fix order_product_services stuck in workflow on completed orders
-- Uses JOIN to parent order_products to reach order_id
UPDATE order_product_services ops
SET current_phase = 'after_sale',
    phase_stage = 'after1'
FROM order_products op
WHERE ops.order_product_id = op.id
  AND ops.current_phase = 'workflow'
  AND op.order_id IN (
    SELECT id FROM orders WHERE status IN ('done', 'after_sale')
  );

-- STEP D: Also fix items with status='completed' still in workflow phase
-- (items that completed all steps but order hasn't reached 'done' yet due to payment gate)
UPDATE order_items
SET phase_stage = 'done'
WHERE current_phase = 'workflow'
  AND status = 'completed'
  AND phase_stage != 'done';

UPDATE order_product_services ops
SET phase_stage = 'done'
WHERE ops.current_phase = 'workflow'
  AND ops.status = 'completed'
  AND ops.phase_stage != 'done';

-- Verification queries:
-- SELECT count(*) FROM order_items WHERE current_phase = 'workflow' AND order_id IN (SELECT id FROM orders WHERE status IN ('done', 'after_sale'));
-- Should return 0 after running this migration.
