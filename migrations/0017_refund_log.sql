-- One row per refund / chargeback received from a sales platform webhook.
-- Idempotent via the UNIQUE INDEX on (platform, transaction_id) so webhook
-- retries don't double-count.
--
-- purchase_id is nullable because some platforms emit a refund webhook for
-- transactions that never reached us (test orders, manual refunds before
-- the integration was wired up). When non-null it points to the matching
-- purchase_log row found by transaction_id.
CREATE TABLE IF NOT EXISTS refund_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER,
    platform TEXT NOT NULL,            -- 'eduzz' | 'hotmart' | 'kiwify'
    transaction_id TEXT NOT NULL,
    value REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    reason TEXT,
    raw_payload TEXT,                  -- JSON dump for debugging
    created_at INTEGER NOT NULL        -- unix seconds
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_log_unique
    ON refund_log(platform, transaction_id);

CREATE INDEX IF NOT EXISTS idx_refund_log_created
    ON refund_log(created_at);

CREATE INDEX IF NOT EXISTS idx_refund_log_purchase
    ON refund_log(purchase_id);
