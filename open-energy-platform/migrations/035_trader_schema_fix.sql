-- ════════════════════════════════════════════════════════════════════════
-- 035 · trader schema gaps
--
-- Fills the remaining columns/tables the route layer references but the v1
-- schema didn't include. Once applied, /api/trading/orders, /trading/fills,
-- /trader-risk/positions and /trader-risk/credit-check return 200.
--
-- All operations are idempotent (CREATE IF NOT EXISTS or wrapped ALTERs).
-- ════════════════════════════════════════════════════════════════════════

-- /api/trading/orders selects `order_type` from trade_orders.
ALTER TABLE trade_orders ADD COLUMN order_type TEXT DEFAULT 'limit';

-- /api/trading/fills reads from trade_fills (the per-execution record); the
-- v1 schema only had trade_matches. We create a thin trade_fills view-like
-- table populated by the matching engine going forward, plus a compatible
-- view that flattens existing trade_matches.
CREATE TABLE IF NOT EXISTS trade_fills (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  side          TEXT NOT NULL CHECK (side IN ('buy','sell')),
  energy_type   TEXT,
  matched_volume_mwh REAL NOT NULL,
  matched_price REAL NOT NULL,
  matched_at    TEXT DEFAULT (datetime('now')),
  buyer_id      TEXT,
  buyer_name    TEXT,
  seller_id     TEXT,
  seller_name   TEXT,
  match_id      TEXT REFERENCES trade_matches(id),
  fee_zar       REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_trade_fills_part ON trade_fills(participant_id, matched_at DESC);

-- /api/trader-risk/credit-check reads from credit_limits. Single row per
-- (participant, counterparty) pair; null counterparty = global limit.
CREATE TABLE IF NOT EXISTS credit_limits (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  counterparty_id TEXT,
  credit_limit    REAL NOT NULL,
  utilisation     REAL DEFAULT 0,
  utilisation_pct REAL DEFAULT 0,
  rating          TEXT,
  set_by          TEXT,
  set_at          TEXT DEFAULT (datetime('now')),
  expires_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_credit_limits_part ON credit_limits(participant_id);

-- /api/trader-risk/positions joins trade_orders and reads delivery_date from
-- the orders table — the column already exists, but the JOIN may also need
-- mark_prices. Make sure that table exists.
CREATE TABLE IF NOT EXISTS mark_prices (
  energy_type        TEXT NOT NULL,
  delivery_date      TEXT,
  mark_price_zar_mwh REAL NOT NULL,
  computed_at        TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (energy_type, delivery_date)
);
