-- ============================================================
-- KPI REWORK - KPI_SALE_FULLTIME
-- Created: 2026-04-21
-- Description: Rework metrics for Sale Full-time policy
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'debt_start_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN debt_start_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_debt_start_at ON orders(debt_start_at);

DO $$
DECLARE
    v_policy_id UUID;
BEGIN
    SELECT id INTO v_policy_id FROM kpi_policies WHERE code = 'KPI_SALE_FULLTIME';
    
    IF v_policy_id IS NOT NULL THEN
        DELETE FROM kpi_policy_metrics WHERE policy_id = v_policy_id;

        INSERT INTO kpi_policy_metrics (
            policy_id, metric_code, metric_name, metric_group, 
            weight, score_type, target_type, target_value, 
            scoring_rules, source_type, source_key, sort_order
        )
        VALUES
            (v_policy_id, 'revenue_personal', 'Doanh thu cá nhân', 'output', 
             25, 'threshold', 'absolute', 50000000, 
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":25},{"min":90,"max":99,"score":21},{"min":80,"max":89,"score":17},{"min":70,"max":79,"score":12},{"min":0,"max":69,"score":6}]}', 
             'auto', 'order_revenue_by_sale', 1),
             
            (v_policy_id, 'close_rate', 'Tỷ lệ chốt đơn', 'output', 
             15, 'threshold', 'percentage', 30, 
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":15},{"min":80,"max":99,"score":12},{"min":60,"max":79,"score":8},{"min":0,"max":59,"score":4}]}', 
             'auto', 'won_leads_ratio', 2),
             
            (v_policy_id, 'return_customer', 'Khách hàng quay lại', 'output', 
             5, 'threshold', 'count', 3, 
             '{"type":"threshold","tiers":[{"min":100,"max":null,"score":5},{"min":67,"max":99,"score":3},{"min":33,"max":66,"score":2},{"min":0,"max":32,"score":0}]}', 
             'auto', 'return_customer_count', 3),
             
            (v_policy_id, 'follow_before_sale', 'Follow đúng mốc before sale', 'process', 
             10, 'threshold', 'percentage', 100, 
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":10},{"min":70,"max":89,"score":7},{"min":50,"max":69,"score":4},{"min":0,"max":49,"score":0}]}', 
             'hybrid', 'before_sale_task_completed_on_time_rate', 4),
             
            (v_policy_id, 'follow_after_sale', 'Follow đúng mốc after sale', 'process', 
             10, 'threshold', 'percentage', 100, 
             '{"type":"threshold","tiers":[{"min":90,"max":null,"score":10},{"min":70,"max":89,"score":7},{"min":50,"max":69,"score":4},{"min":0,"max":49,"score":0}]}', 
             'hybrid', 'after_sale_task_completed_on_time_rate', 5),
             
            (v_policy_id, 'lead_reclaimed', 'Lead bị thu hồi', 'discipline', 
             5, 'per_event', 'count', 0, 
             '{"type":"per_event","points_per_event":-1,"max_deduct":-5}', 
             'auto', 'lead_reclaimed_count', 6),
             
            (v_policy_id, 'debt_overdue', 'Kiểm nợ và thu tiền', 'discipline', 
             20, 'per_event', 'count', 0, 
             '{"type":"per_event","points_per_event":-4,"max_deduct":-20}', 
             'auto', 'overdue_receivables_after_finish_photo_by_sale', 7),
             
            (v_policy_id, 'sale_conduct', 'Vi phạm tác phong sale', 'discipline', 
             10, 'per_event', 'count', 0, 
             '{"type":"per_event","points_per_event":-2,"max_deduct":-10}', 
             'manual', 'employee_violation_logs', 8);
    END IF;
END $$;

UPDATE orders o
SET debt_start_at = log.created_at
FROM (
    SELECT DISTINCT ON (order_id) order_id, created_at
    FROM order_after_sale_stage_log
    WHERE to_stage = 'after1_debt'
    ORDER BY order_id, created_at ASC
) log
WHERE o.id = log.order_id
AND o.debt_start_at IS NULL;
