-- ════════════════════════════════════════════════════════════════════════
-- 034 · trade_orders backfill + trader_positions
--
-- Migration 020 (matching engine) already adds `remaining_volume_mwh` and
-- `price` to trade_orders. This migration was originally written as a
-- hot-fix to add those columns when they were missing, but with 020 in
-- place the ALTERs would fail on fresh databases with
-- "duplicate column name". They have been removed; only the idempotent
-- backfills + trader_positions table creation remain.
-- ════════════════════════════════════════════════════════════════════════

-- Backfill remaining_volume_mwh for any rows added between 020 and 034 that
-- somehow ended up with the column NULL. Safe to re-run.
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
