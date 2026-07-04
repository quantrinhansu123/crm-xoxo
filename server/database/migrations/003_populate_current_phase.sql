-- =============================================================================
-- 003_populate_current_phase.sql
-- PURPOSE: Backfill current_phase and phase_stage for ALL existing rows.
-- Uses the ADR-7 decision table with priority order (first match wins).
-- SAFE: All UPDATEs use AND current_phase = 'sales' guard to skip already-set rows.
-- Run AFTER 002_add_current_phase.sql.
-- Run inside a transaction for atomicity.
-- =============================================================================

BEGIN;

-- ============================================================
-- STEP A: order_items (V1)
-- Valid status values: pending, assigned, in_progress, completed,
--                      cancelled, step1, step2, step3, step4, step5
-- NOTE: 'processing' and 'delivered' are NOT valid for V1 items.
-- ============================================================

-- A1: Warranty items (highest priority)
UPDATE order_items
SET current_phase = 'warranty',
    phase_stage   = COALESCE(care_warranty_stage, 'war1')
WHERE care_warranty_flow = 'warranty';

-- A2: Care items
UPDATE order_items
SET current_phase = 'care',
    phase_stage   = COALESCE(care_warranty_stage, 'care6')
WHERE care_warranty_flow = 'care'
  AND current_phase = 'sales'; -- skip already-set rows from A1

-- A3: After Sale items (have explicit after_sale_stage, not yet in care/warranty)
UPDATE order_items
SET current_phase = 'after_sale',
    phase_stage   = after_sale_stage
WHERE after_sale_stage IS NOT NULL
  AND current_phase = 'sales'; -- skip already-set rows

-- A4: Completed items still in workflow (have no after_sale_stage yet)
-- These completed successfully but haven't been explicitly moved to after_sale
UPDATE order_items
SET current_phase = 'workflow',
    phase_stage   = 'done'
WHERE status = 'completed'
  AND after_sale_stage IS NULL
  AND care_warranty_flow IS NULL
  AND current_phase = 'sales';

-- A5: Active workflow items (assigned or in_progress means being worked on)
UPDATE order_items
SET current_phase = 'workflow',
    phase_stage   = 'room_active'
WHERE status IN ('assigned', 'in_progress')
  AND after_sale_stage IS NULL
  AND care_warranty_flow IS NULL
  AND current_phase = 'sales';

-- A6: step5 = confirmed into workflow, waiting for tech assignment
UPDATE order_items
SET current_phase = 'workflow',
    phase_stage   = 'waiting'
WHERE status = 'step5'
  AND after_sale_stage IS NULL
  AND care_warranty_flow IS NULL
  AND current_phase = 'sales';

-- A7: Sales items step1-step4 — phase_stage mirrors status
UPDATE order_items
SET phase_stage = status
WHERE status IN ('step1', 'step2', 'step3', 'step4')
  AND current_phase = 'sales';

-- A8: pending + cancelled → stay as sales/step1 (already the default, no-op)


-- ============================================================
-- STEP B: order_products (V2 products)
-- Valid status values: pending, processing, completed, delivered,
--                      cancelled, step1, step2, step3, step4, step5
-- NOTE: 'processing' and 'delivered' ARE valid here (unlike V1).
-- ============================================================

-- B1: Warranty items
UPDATE order_products
SET current_phase = 'warranty',
    phase_stage   = COALESCE(care_warranty_stage, 'war1')
WHERE care_warranty_flow = 'warranty';

-- B2: Care items
UPDATE order_products
SET current_phase = 'care',
    phase_stage   = COALESCE(care_warranty_stage, 'care6')
WHERE care_warranty_flow = 'care'
  AND current_phase = 'sales';

-- B3: After Sale items
UPDATE order_products
SET current_phase = 'after_sale',
    phase_stage   = after_sale_stage
WHERE after_sale_stage IS NOT NULL
  AND current_phase = 'sales';

-- B4: Delivered products → entering after_sale (no explicit stage yet)
UPDATE order_products
SET current_phase = 'after_sale',
    phase_stage   = 'after1'
WHERE status = 'delivered'
  AND after_sale_stage IS NULL
  AND care_warranty_flow IS NULL
  AND current_phase = 'sales';

-- B5: Completed products still in workflow
UPDATE order_products
SET current_phase = 'workflow',
    phase_stage   = 'done'
WHERE status = 'completed'
  AND after_sale_stage IS NULL
  AND care_warranty_flow IS NULL
  AND current_phase = 'sales';

-- B6: Processing products = active in a tech room
UPDATE order_products
SET current_phase = 'workflow',
    phase_stage   = 'room_active'
WHERE status = 'processing'
  AND after_sale_stage IS NULL
  AND care_warranty_flow IS NULL
  AND current_phase = 'sales';

-- B7: step5 = confirmed into workflow
UPDATE order_products
SET current_phase = 'workflow',
    phase_stage   = 'waiting'
WHERE status = 'step5'
  AND current_phase = 'sales';

-- B8: Sales items step1-step4
UPDATE order_products
SET phase_stage = status
WHERE status IN ('step1', 'step2', 'step3', 'step4')
  AND current_phase = 'sales';

-- B9: pending + cancelled → stay as sales/step1 (already the default)


-- ============================================================
-- STEP C: order_product_services (V2 services)
-- Same valid status values as V1 order_items (same CHECK constraint).
-- NOTE: care_warranty_flow, care_warranty_stage, after_sale_stage
--       do NOT exist on this table — they live on parent order_products.
--       We JOIN to order_products to inherit the parent's phase fields.
-- ============================================================

-- C1: Warranty — inherit from parent product
UPDATE order_product_services ops
SET current_phase = 'warranty',
    phase_stage   = COALESCE(op.care_warranty_stage, 'war1')
FROM order_products op
WHERE ops.order_product_id = op.id
  AND op.care_warranty_flow = 'warranty';

-- C2: Care — inherit from parent product
UPDATE order_product_services ops
SET current_phase = 'care',
    phase_stage   = COALESCE(op.care_warranty_stage, 'care6')
FROM order_products op
WHERE ops.order_product_id = op.id
  AND op.care_warranty_flow = 'care'
  AND ops.current_phase = 'sales';

-- C3: After Sale — inherit from parent product
UPDATE order_product_services ops
SET current_phase = 'after_sale',
    phase_stage   = op.after_sale_stage
FROM order_products op
WHERE ops.order_product_id = op.id
  AND op.after_sale_stage IS NOT NULL
  AND ops.current_phase = 'sales';

-- C4: Completed services still in workflow (parent has no after_sale/care)
UPDATE order_product_services ops
SET current_phase = 'workflow',
    phase_stage   = 'done'
FROM order_products op
WHERE ops.order_product_id = op.id
  AND ops.status = 'completed'
  AND op.after_sale_stage IS NULL
  AND op.care_warranty_flow IS NULL
  AND ops.current_phase = 'sales';

-- C5: Assigned or in_progress services = active in a tech room
UPDATE order_product_services ops
SET current_phase = 'workflow',
    phase_stage   = 'room_active'
FROM order_products op
WHERE ops.order_product_id = op.id
  AND ops.status IN ('assigned', 'in_progress')
  AND op.after_sale_stage IS NULL
  AND op.care_warranty_flow IS NULL
  AND ops.current_phase = 'sales';

-- C6: step5 = confirmed into workflow (no parent JOIN needed — status is on ops)
UPDATE order_product_services
SET current_phase = 'workflow',
    phase_stage   = 'waiting'
WHERE status = 'step5'
  AND current_phase = 'sales';

-- C7: Sales items step1-step4
UPDATE order_product_services
SET phase_stage = status
WHERE status IN ('step1', 'step2', 'step3', 'step4')
  AND current_phase = 'sales';

-- C8: pending + cancelled → stay as sales/step1 (already the default)

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES (run after this migration):
-- =============================================================================

-- Phase distribution across all 3 tables
-- SELECT 'order_items' AS tbl, current_phase, COUNT(*) FROM order_items GROUP BY current_phase
-- UNION ALL
-- SELECT 'order_products', current_phase, COUNT(*) FROM order_products GROUP BY current_phase
-- UNION ALL
-- SELECT 'order_product_services', current_phase, COUNT(*) FROM order_product_services GROUP BY current_phase
-- ORDER BY 1, 2;

-- Cross-check 1: items with care_warranty_flow must be in care/warranty phase (Expected: 0 violations)
-- SELECT COUNT(*) AS violations FROM order_items
-- WHERE care_warranty_flow IS NOT NULL AND current_phase NOT IN ('care', 'warranty');

-- Cross-check 2: items with after_sale_stage and no care flow must be in after_sale (Expected: 0)
-- SELECT COUNT(*) AS violations FROM order_items
-- WHERE after_sale_stage IS NOT NULL AND care_warranty_flow IS NULL AND current_phase != 'after_sale';

-- Cross-check 3: no NULL current_phase values (Expected: all 0)
-- SELECT 'order_items' AS tbl, COUNT(*) FROM order_items WHERE current_phase IS NULL
-- UNION ALL
-- SELECT 'order_products', COUNT(*) FROM order_products WHERE current_phase IS NULL
-- UNION ALL
-- SELECT 'order_product_services', COUNT(*) FROM order_product_services WHERE current_phase IS NULL;
