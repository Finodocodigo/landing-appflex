-- Capture the Meta ad_id on each purchase for exact per-ad ROAS.
--
-- The ad_id already arrives on every Meta sale inside event_source_url, e.g.
--   https://laappflex.shop/breath-report?ad_id=120250464034450070&...&utm_id=120250464034450070...
-- (utm_id == ad_id — both carry {{ad.id}}). This promotes it to a first-class,
-- indexed column so the dashboard joins spend↔sale by ad_id without parsing URLs
-- at read time. Going forward it's written by functions/webhook/_core.js; the
-- UPDATE below backfills the full history from the URL already on each row.

ALTER TABLE purchase_log ADD COLUMN ad_id TEXT;
CREATE INDEX IF NOT EXISTS idx_purchase_log_ad_id ON purchase_log(ad_id);

-- Backfill: extract the digits after 'ad_id=' up to the next '&' (or end).
-- Pure SQLite string ops (no regex): substr from just past 'ad_id=', then cut at
-- the first '&'. Only touches rows that actually carry an ad_id in the URL.
UPDATE purchase_log
SET ad_id = CASE
  WHEN instr(substr(event_source_url, instr(event_source_url, 'ad_id=') + 6), '&') > 0
    THEN substr(
           substr(event_source_url, instr(event_source_url, 'ad_id=') + 6),
           1,
           instr(substr(event_source_url, instr(event_source_url, 'ad_id=') + 6), '&') - 1)
  ELSE substr(event_source_url, instr(event_source_url, 'ad_id=') + 6)
END
WHERE (ad_id IS NULL OR ad_id = '')
  AND event_source_url LIKE '%ad_id=%';
