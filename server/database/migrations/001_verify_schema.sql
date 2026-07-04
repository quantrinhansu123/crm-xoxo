-- =============================================================================
-- 001_verify_schema.sql
-- PURPOSE: Schema discovery — verify live DB state BEFORE any mutations.
-- Run this in Supabase SQL Editor. Save the output as a comment in this file.
-- DO NOT execute migrations until you've confirmed the output matches expectations.
-- =============================================================================

-- 1. Verify order_items columns (V1)
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_items'
ORDER BY ordinal_position;

-- 2. Verify order_products columns (V2 products)
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_products'
ORDER BY ordinal_position;

-- 3. Verify order_product_services columns (V2 services)
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_product_services'
ORDER BY ordinal_position;

-- 4. Check for active triggers on these tables (critical — trigger may conflict with dual-write)
SELECT trigger_name, event_manipulation, event_object_table, action_statement
FROM information_schema.triggers
WHERE event_object_table IN (
    'order_items',
    'order_products',
    'order_product_services',
    'order_item_steps'
)
ORDER BY event_object_table, trigger_name;

-- 5. Check CHECK constraints on status columns (needed to understand V1 vs V2 valid values)
SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE contype = 'c'
AND conrelid IN (
    'order_items'::regclass,
    'order_products'::regclass,
    'order_product_services'::regclass
)
ORDER BY conrelid::regclass::text, conname;

-- 6. Verify which new/old columns already exist (prevents duplicate ADD COLUMN errors)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name IN ('order_items', 'order_products', 'order_product_services')
AND column_name IN (
    'current_phase',
    'phase_stage',
    'after_sale_stage',
    'care_warranty_flow',
    'care_warranty_stage'
)
ORDER BY table_name, column_name;

-- 7. Count existing rows per table (to calibrate migration impact)
SELECT 'order_items' AS tbl, COUNT(*) FROM order_items
UNION ALL
SELECT 'order_products', COUNT(*) FROM order_products
UNION ALL
SELECT 'order_product_services', COUNT(*) FROM order_product_services;

-- 8. Check trigger function body (if it exists)
SELECT prosrc
FROM pg_proc
WHERE proname = 'update_order_product_status';

-- =============================================================================
-- EXPECTED RESULTS (before migration):
-- - after_sale_stage, care_warranty_flow, care_warranty_stage SHOULD exist on all 3 tables
--   (added by archived migrations, NOT in schema.sql)
-- - current_phase, phase_stage should NOT exist yet
-- - Trigger update_order_product_status() may or may not be active
-- =============================================================================
