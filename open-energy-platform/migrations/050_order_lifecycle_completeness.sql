-- ════════════════════════════════════════════════════════════════════════
-- 050 · Order lifecycle completeness
--
-- Phase 2 of the trading-depth deepening sequence. Phase 1 (049) added
-- pre-trade gating; this one fills out the order itself so the lifecycle
-- after acceptance is real:
--
--   - Modifiers + extra parameters that real exchanges support but were
--     missing from trade_orders:
--       post_only, reduce_only        (risk-control modifiers)
--       stop_trigger_price            (stop / stop-limit orders)
--       display_size_mwh              (iceberg orders — only show a slice)
--       amend_count                   (history depth without joining)
--
--   - trade_order_amendments — one row per price/volume change on an
--     open order. Records prev/new on both fields, the resulting
--     remaining_volume change, and whether the amendment lost time
--     priority (per IFEU/JSE convention: any volume increase OR price
--     change loses priority; a volume decrease keeps it).
--
-- All ALTERs are additive and the new table is fresh, so existing rows
-- are untouched. Status enum already includes 'partial' and 'expired'
-- (from migration 001), so no enum change is required.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE trade_orders ADD COLUMN post_only          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trade_orders ADD COLUMN reduce_only        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trade_orders ADD COLUMN stop_trigger_price REAL;
ALTER TABLE trade_orders ADD COLUMN display_size_mwh   REAL;
ALTER TABLE trade_orders ADD COLUMN amend_count        INTEGER NOT NULL DEFAULT 0;

-- Useful for the expiry sweeper: it only ever needs the open + good_till
-- subset, so a partial-ish index over (status, good_till) keeps the scan
-- cheap even at national-scale order counts. SQLite doesn't strictly
-- support partial indexes in old D1 builds, so use a regular index.
CREATE INDEX IF NOT EXISTS idx_trade_orders_status_goodtill
  ON trade_orders (status, good_till);

CREATE TABLE IF NOT EXISTS trade_order_amendments (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL,
  amended_by          TEXT NOT NULL,
  amended_at          TEXT NOT NULL DEFAULT (datetime('now')),
  prev_price          REAL,
  new_price           REAL,
  prev_volume_mwh     REAL NOT NULL,
  new_volume_mwh      REAL NOT NULL,
  prev_remaining_mwh  REAL NOT NULL,
  new_remaining_mwh   REAL NOT NULL,
  -- 1 if the amendment cost the order its place in the price-time queue.
  -- Per the documented convention: any price change OR a volume increase
  -- loses priority; a pure volume decrease keeps it.
  lost_priority       INTEGER NOT NULL DEFAULT 0,
  reason              TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_order_amendments_order
  ON trade_order_amendments (order_id, amended_at DESC);
