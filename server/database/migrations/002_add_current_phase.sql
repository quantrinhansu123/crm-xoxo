-- =============================================================================
-- 002_add_current_phase.sql
-- PURPOSE: Add current_phase and phase_stage columns to all 3 item tables.
-- SAFE: Uses IF NOT EXISTS — idempotent, safe to run multiple times.
-- NO CHECK CONSTRAINTS per ADR-3 (Phase 1 only uses unconstrained TEXT).
-- Run AFTER 001_verify_schema.sql confirms columns don't already exist.
-- =============================================================================

-- Add current_phase and phase_stage to order_items (V1)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS phase_stage TEXT DEFAULT 'step1';

-- Add current_phase and phase_stage to order_products (V2 products)
ALTER TABLE order_products
  ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS phase_stage TEXT DEFAULT 'step1';

-- Add current_phase and phase_stage to order_product_services (V2 services)
ALTER TABLE order_product_services
  ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS phase_stage TEXT DEFAULT 'step1';

-- Add indexes for the filter queries that will use these columns
-- (Frontend tabs filter by current_phase — this avoids full table scans)
CREATE INDEX IF NOT EXISTS idx_order_items_phase
    ON order_items(current_phase);

CREATE INDEX IF NOT EXISTS idx_order_products_phase
    ON order_products(current_phase);

CREATE INDEX IF NOT EXISTS idx_order_product_services_phase
    ON order_product_services(current_phase);

-- =============================================================================
-- VERIFICATION QUERIES (run after this migration):
-- =============================================================================

-- Verify columns were added to order_items
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'order_items' AND column_name IN ('current_phase', 'phase_stage');
-- Expected: 2 rows

-- Verify columns were added to order_products
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'order_products' AND column_name IN ('current_phase', 'phase_stage');
-- Expected: 2 rows

-- Verify columns were added to order_product_services
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'order_product_services' AND column_name IN ('current_phase', 'phase_stage');
-- Expected: 2 rows

-- Verify indexes exist
-- SELECT indexname FROM pg_indexes WHERE tablename = 'order_items' AND indexname LIKE '%phase%';
-- Expected: idx_order_items_phase

-- Verify defaults (all existing rows should have 'sales'/'step1' until migration 003 runs)
-- SELECT current_phase, phase_stage, COUNT(*) FROM order_items GROUP BY 1, 2;
-- Expected: single row: sales | step1 | <total count>
