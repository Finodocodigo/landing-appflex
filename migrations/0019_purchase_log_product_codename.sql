-- Adds the BuyGoods {PRODUCT_CODENAME} to purchase_log.
--
-- Captured from the webhook so we can (a) discover the exact codename string the
-- platform sends for each product and (b) drive the Meta CAPI codename filter
-- (config/products.js → META_PRODUCT_CODENAME_ALLOWLIST). Sales are ALWAYS
-- logged regardless of codename; the filter only gates which ones fan out to
-- the Meta pixel.

ALTER TABLE purchase_log
    ADD COLUMN product_codename TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_purchase_log_product_codename
    ON purchase_log(product_codename);
