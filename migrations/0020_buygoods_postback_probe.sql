-- BuyGoods postback PROBE (parallel, observational only).
--
-- A second BuyGoods postback URL feeds this table so we can compare the macros
-- BuyGoods sends here against what the production webhook (/webhook/buygoods)
-- already captures — WITHOUT touching purchase_log or firing Meta CAPI.
--
-- The goal: confirm whether the two postbacks carry the SAME sale identity
-- ({ORDERID}/{SUBID}/{EMAILHASH}) and, if so, quantify the EXTRA data this new
-- postback adds ({NAME}, {PHONE} — which the production webhook does not receive).
--
-- Correlate later with:
--   SELECT pr.*, p.transaction_id, p.hashed_em
--   FROM buygoods_postback_probe pr
--   LEFT JOIN purchase_log p ON p.transaction_id = pr.orderid;
-- and check pr.email_hash == p.hashed_em, plus pr.name_hash / pr.phone_hash.
--
-- All PII arrives pre-hashed (SHA256) from BuyGoods, so nothing here is raw PII.

CREATE TABLE IF NOT EXISTS buygoods_postback_probe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at INTEGER NOT NULL,        -- epoch seconds the probe was hit

    -- Sale identity (compare against purchase_log)
    subid TEXT,                          -- {SUBID}
    subid2 TEXT,                         -- {SUBID2}
    subid3 TEXT,                         -- {SUBID3}
    subid4 TEXT,                         -- {SUBID4}
    subid5 TEXT,                         -- {SUBID5}
    orderid TEXT,                        -- {ORDERID}            -> purchase_log.transaction_id
    commission_amount TEXT,              -- {COMMISSION_AMOUNT}
    conv_type TEXT,                      -- {CONV_TYPE} frontend|upsell
    product_codename TEXT,               -- {PRODUCT_CODENAME} (if the URL includes it)

    -- Hashed PII (SHA256). email_hash mirrors purchase_log.hashed_em; the others
    -- are the NEW fields we're evaluating.
    email_hash TEXT,                     -- {EMAILHASH}
    name_hash TEXT,                      -- {NAME}   (new vs production webhook)
    phone_hash TEXT,                     -- {PHONE}  (new vs production webhook)

    -- Provenance / catch-all for anything not mapped above
    raw_query TEXT,                      -- full querystring as received
    client_ip TEXT,                      -- cf-connecting-ip (BuyGoods server)
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_bg_probe_orderid  ON buygoods_postback_probe(orderid);
CREATE INDEX IF NOT EXISTS idx_bg_probe_subid    ON buygoods_postback_probe(subid);
CREATE INDEX IF NOT EXISTS idx_bg_probe_received ON buygoods_postback_probe(received_at);
