-- Adds revenue_type classification to purchase_log so the dashboard can
-- split revenue into Initial / Upsell / Backend / Recurring buckets.
--
-- The classification is set at webhook time from config/products.js
-- (keyed by platform + product_id). Products not listed in config default
-- to 'initial'.

ALTER TABLE purchase_log
    ADD COLUMN revenue_type TEXT NOT NULL DEFAULT 'initial';

CREATE INDEX IF NOT EXISTS idx_purchase_log_revenue_type
    ON purchase_log(revenue_type);
