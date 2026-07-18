-- Enrich ad_spend from campaign-level to ad-level + placement, to support
-- per-ad ROAS (join to purchase_log by the Meta ad_id captured on the sale).
--
-- SAFETY: ad_spend is DASHBOARD-OWNED. Only the central dashboard's Meta sync
-- (central-dash/src/lib/meta-ads-sync.js) ever writes this table; the client's
-- own tracking stack never touches it. Truncating + re-keying here therefore
-- cannot affect sales/session/checkout data. The only rows present today are
-- 4 campaign-level smoke-test rows.

-- New dimensions/metrics from the ad-level insights pull (level=ad + breakdowns).
ALTER TABLE ad_spend ADD COLUMN adset_id TEXT;
ALTER TABLE ad_spend ADD COLUMN adset_name TEXT;
ALTER TABLE ad_spend ADD COLUMN link_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ad_spend ADD COLUMN landing_page_views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ad_spend ADD COLUMN initiate_checkout INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ad_spend ADD COLUMN publisher_platform TEXT;
ALTER TABLE ad_spend ADD COLUMN platform_position TEXT;
ALTER TABLE ad_spend ADD COLUMN account_id TEXT;

-- Old grain was campaign-level (ad_id left NULL); the new grain is per-ad ×
-- placement. Clear the old rows before swapping the unique key — keeping
-- campaign-level rows (NULL ad_id) would collide / double-count on re-pull.
DELETE FROM ad_spend;

-- New grain: one row per platform × day × ad × placement (network + position).
-- account_id is deliberately OUT of the key (Meta ad_id is globally unique, so
-- rows from different accounts never collide) — it is provenance only.
DROP INDEX IF EXISTS idx_ad_spend_unique;
CREATE UNIQUE INDEX idx_ad_spend_unique
  ON ad_spend(platform, date, ad_id, COALESCE(publisher_platform, ''), COALESCE(platform_position, ''));

-- Read-path indexes for the per-ad breakdown endpoint.
CREATE INDEX IF NOT EXISTS idx_ad_spend_ad_id     ON ad_spend(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_ad_name   ON ad_spend(ad_name);
CREATE INDEX IF NOT EXISTS idx_ad_spend_placement ON ad_spend(publisher_platform, platform_position);
CREATE INDEX IF NOT EXISTS idx_ad_spend_account   ON ad_spend(account_id);
