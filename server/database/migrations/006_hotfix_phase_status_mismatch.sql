-- 006_hotfix_phase_status_mismatch.sql
-- Items that went through "Tạo HD Bảo hành" had status reset to 'step1'
-- but current_phase was never updated from 'warranty' to 'sales'.
-- This fixes any items where status says sales (step1-step4) but current_phase disagrees.

UPDATE order_products
SET current_phase = 'sales',
    phase_stage = status
WHERE status IN ('step1', 'step2', 'step3', 'step4')
  AND current_phase != 'sales';

UPDATE order_product_services
SET current_phase = 'sales',
    phase_stage = status
WHERE status IN ('step1', 'step2', 'step3', 'step4')
  AND current_phase != 'sales';

UPDATE order_items
SET current_phase = 'sales',
    phase_stage = status
WHERE status IN ('step1', 'step2', 'step3', 'step4')
  AND current_phase != 'sales';
