-- 007_hotfix_reset_steps_for_warranty_reentry.sql
-- When "Tạo HD Bảo hành" was used before the reset-services fix,
-- order_item_steps kept status='completed' from the previous cycle.
-- This resets steps belonging to services that are back in sales phase.

UPDATE order_item_steps ois
SET status = 'pending',
    completed_at = NULL,
    started_at = NULL,
    updated_at = NOW()
FROM order_product_services ops
WHERE ois.order_product_service_id = ops.id
  AND ops.status IN ('step1', 'step2', 'step3', 'step4', 'step5', 'pending')
  AND ois.status IN ('completed', 'skipped', 'in_progress', 'assigned');

-- Also reset steps for V1 order_items back in sales
UPDATE order_item_steps ois
SET status = 'pending',
    completed_at = NULL,
    started_at = NULL,
    updated_at = NOW()
FROM order_items oi
WHERE ois.order_item_id = oi.id
  AND oi.status IN ('step1', 'step2', 'step3', 'step4', 'step5', 'pending')
  AND ois.status IN ('completed', 'skipped', 'in_progress', 'assigned');
