-- Index on hashed_em so the dashboard can compute Customers / NewCust /
-- RepeatCust / LTV without a full-table scan on each request.
--
-- The column already exists (added in 0003); only the index is new.
CREATE INDEX IF NOT EXISTS idx_purchase_log_hashed_em
    ON purchase_log(hashed_em);
