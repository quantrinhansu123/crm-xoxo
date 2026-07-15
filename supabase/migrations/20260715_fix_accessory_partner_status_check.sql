-- Expand accessory/partner status checks to match app approval + complete flows.

ALTER TABLE order_item_accessories
  DROP CONSTRAINT IF EXISTS order_item_accessories_status_check;

ALTER TABLE order_item_accessories
  ADD CONSTRAINT order_item_accessories_status_check
  CHECK (status IN (
    'requested',
    'rejected',
    'need_buy',
    'bought',
    'waiting_ship',
    'shipped',
    'delivered_to_tech',
    'done'
  ));

ALTER TABLE order_item_partner
  DROP CONSTRAINT IF EXISTS order_item_partner_status_check;

ALTER TABLE order_item_partner
  ADD CONSTRAINT order_item_partner_status_check
  CHECK (status IN (
    'requested',
    'rejected',
    'ship_to_partner',
    'partner_doing',
    'ship_back',
    'done'
  ));
