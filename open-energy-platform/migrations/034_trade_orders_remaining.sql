-- ════════════════════════════════════════════════════════════════════════
-- 034 · trade_orders.remaining_volume_mwh + trader_positions
--
-- The matching engine, trader risk routes and the AI briefing all reference
-- `remaining_volume_mwh` to track partial fills, but the column was missing
-- from the v1 schema. This adds it (defaulting to volume_mwh so existing
-- open orders remain consistent) plus the missing trader_positions table
-- expected by /api/trader-risk/positions.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE trade_orders ADD COLUMN remaining_volume_mwh REAL;
ALTER TABLE trade_orders ADD COLUMN price REAL;

-- Backfill remaining_volume_mwh for existing rows so legacy queries stop
-- 500-ing. New rows get a non-null value at insert.
UPDATE trade_orders SET remaining_volume_mwh = volume_mwh WHERE remaining_volume_mwh IS NULL;

-- Backfill price from price_min/price_max midpoint where one or both exist.
UPDATE trade_orders SET price = COALESCE(
  (price_min + price_max) / 2.0,
  price_min,
  price_max
) WHERE price IS NULL;

CREATE TABLE IF NOT EXISTS trader_positions (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  energy_type     TEXT,
  product         TEXT,
  quantity_mwh    REAL DEFAULT 0,
  avg_price       REAL,
  mark_price      REAL,
  unrealised_pnl  REAL DEFAULT 0,
  realised_pnl    REAL DEFAULT 0,
  notional        REAL DEFAULT 0,
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trader_positions_participant ON trader_positions(participant_id);
