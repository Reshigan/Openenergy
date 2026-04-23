-- 020_matching_engine.sql
-- Price-time-priority matching engine for the spot & bilateral order book.
-- Extends trade_orders for partial fills, introduces order_book_shards (one
-- shard per energy_type × delivery_window to scale the Durable Object order
-- book horizontally), and captures fills + market prints.
--
-- Backwards-compatible with migration 001: trade_orders gains columns; the
-- existing (nullable) price_min/price_max survive for legacy UI.

ALTER TABLE trade_orders ADD COLUMN remaining_volume_mwh REAL;
ALTER TABLE trade_orders ADD COLUMN price REAL;
ALTER TABLE trade_orders ADD COLUMN order_type TEXT DEFAULT 'limit'; -- 'limit' | 'market' | 'ioc' | 'fok'
ALTER TABLE trade_orders ADD COLUMN good_till TEXT;                  -- ISO datetime; null = good-till-cancelled
ALTER TABLE trade_orders ADD COLUMN time_in_force TEXT DEFAULT 'gtc';
ALTER TABLE trade_orders ADD COLUMN shard_key TEXT;                  -- computed: energy_type|delivery_window
ALTER TABLE trade_orders ADD COLUMN external_ref TEXT;               -- client order ID for idempotency
ALTER TABLE trade_orders ADD COLUMN posted_at TEXT;                  -- set when accepted into the book

CREATE INDEX IF NOT EXISTS idx_trade_orders_book
  ON trade_orders(shard_key, status, side, price, posted_at);
CREATE INDEX IF NOT EXISTS idx_trade_orders_external_ref
  ON trade_orders(external_ref, participant_id);

-- Individual fills — one row per execution event. A single order may have
-- many fills as it gets hit by crossing orders.
CREATE TABLE IF NOT EXISTS trade_fills (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES trade_orders(id),
  counterparty_order_id TEXT NOT NULL REFERENCES trade_orders(id),
  match_id TEXT REFERENCES trade_matches(id),
  shard_key TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  volume_mwh REAL NOT NULL,
  price REAL NOT NULL,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_fills_order ON trade_fills(order_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_fills_shard ON trade_fills(shard_key, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_fills_match ON trade_fills(match_id);

-- Market prints (public tape) — aggregated fills per shard per minute so a
-- ticker endpoint can return OHLC without scanning trade_fills.
CREATE TABLE IF NOT EXISTS market_prints (
  shard_key TEXT NOT NULL,
  minute_bucket TEXT NOT NULL,   -- ISO YYYY-MM-DDTHH:MM
  open_price REAL,
  high_price REAL,
  low_price REAL,
  close_price REAL,
  volume_mwh REAL DEFAULT 0,
  trade_count INTEGER DEFAULT 0,
  PRIMARY KEY (shard_key, minute_bucket)
);
CREATE INDEX IF NOT EXISTS idx_market_prints_bucket ON market_prints(minute_bucket DESC);

-- Order-book health snapshot for the /trading/orderbook-depth endpoint.
-- Populated by the Durable Object on each mutation; serves aggregated depth
-- without locking the DO state for readers.
CREATE TABLE IF NOT EXISTS order_book_depth (
  shard_key TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  best_bid REAL,
  best_ask REAL,
  bid_volume_top5 REAL,
  ask_volume_top5 REAL,
  mid_price REAL,
  spread_bps REAL,
  PRIMARY KEY (shard_key, snapshot_at)
);
CREATE INDEX IF NOT EXISTS idx_ob_depth_shard ON order_book_depth(shard_key, snapshot_at DESC);

-- Backfill remaining_volume_mwh = volume_mwh for any pre-existing rows so
-- the new matching engine treats them as fully unfilled.
UPDATE trade_orders
   SET remaining_volume_mwh = volume_mwh
 WHERE remaining_volume_mwh IS NULL;

-- Backfill shard_key for existing orders so they can be routed to a DO on
-- the next mutation.
UPDATE trade_orders
   SET shard_key = energy_type || '|' || COALESCE(delivery_date, 'ANY')
 WHERE shard_key IS NULL;
