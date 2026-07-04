-- Enforce: only one pending order-edit ticket per order
-- This prevents duplicate "Sửa đơn" requests while one is awaiting manager approval.

DROP INDEX IF EXISTS ux_upsell_tickets_pending_order_edit_per_order;

CREATE UNIQUE INDEX ux_upsell_tickets_pending_order_edit_per_order
ON upsell_tickets (order_id)
WHERE
    status = 'pending'
    AND COALESCE(
        lower(data->>'request_type'),
        lower(data->>'ticket_type'),
        lower(data->>'flow_type'),
        ''
    ) IN ('order_edit', 'edit_order', 'order_update');

