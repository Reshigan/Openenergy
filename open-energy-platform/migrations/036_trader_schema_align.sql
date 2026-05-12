-- ════════════════════════════════════════════════════════════════════════
-- 036 · trader schema alignment (true column/table names from route layer)
--
-- Migration 035 created tables/columns the route layer needs but with the
-- wrong names. This migration drops the placeholders and recreates them
-- with the names actually referenced in /src/routes/trader-risk.ts and
-- /src/routes/trading.ts:
--
--   trade_fills      uses `executed_at`, has `fee_zar`, `gross_zar`
--   credit_limits    uses `limit_zar`, `basis`, `effective_from/to`, `scope`
--   collateral_accounts has `balance_zar`, `account_type`, `status`
--   market_prints    has `shard_key`, `minute_bucket`, `vwap`, `volume_mwh`
--
-- All operations idempotent.
-- ════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS trade_fills;
CREATE TABLE trade_fills (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL,
  participant_id  TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  energy_type     TEXT,
  matched_volume_mwh REAL NOT NULL,
  matched_price   REAL NOT NULL,
  gross_zar       REAL,
  fee_zar         REAL DEFAULT 0,
  net_zar         REAL,
  executed_at     TEXT DEFAULT (datetime('now')),
  buyer_id        TEXT,
  buyer_name      TEXT,
  seller_id       TEXT,
  seller_name     TEXT,
  match_id        TEXT REFERENCES trade_matches(id),
  shard_key       TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_fills_part_exec ON trade_fills(participant_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_fills_match ON trade_fills(match_id);

DROP TABLE IF EXISTS credit_limits;
CREATE TABLE credit_limits (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  limit_zar       REAL NOT NULL,
  basis           TEXT DEFAULT 'aggregate',
  scope           TEXT DEFAULT 'platform',  -- platform | counterparty | product
  scope_id        TEXT,
  effective_from  TEXT NOT NULL,
  effective_to    TEXT,
  set_by          TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_credit_limits_part_eff ON credit_limits(participant_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS collateral_accounts (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  account_type    TEXT DEFAULT 'cash' CHECK (account_type IN ('cash','letter_of_credit','bank_guarantee','tbills','other')),
  balance_zar     REAL NOT NULL DEFAULT 0,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  reference       TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_collateral_part_status ON collateral_accounts(participant_id, status);

CREATE TABLE IF NOT EXISTS collateral_movements (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES collateral_accounts(id),
  movement_type   TEXT NOT NULL CHECK (movement_type IN ('deposit','withdrawal','margin_call','release')),
  amount_zar      REAL NOT NULL,
  balance_after_zar REAL,
  reference       TEXT,
  created_by      TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_collateral_movements_acc ON collateral_movements(account_id, created_at DESC);

-- market_prints already exists from 020 with a slightly different schema;
-- the IF NOT EXISTS create below is a no-op, and the index targets
-- minute_bucket which both schemas have, so it's safe.
CREATE TABLE IF NOT EXISTS market_prints (
  shard_key       TEXT NOT NULL,
  minute_bucket   TEXT NOT NULL,
  energy_type     TEXT,
  delivery_date   TEXT,
  open_price      REAL,
  high_price      REAL,
  low_price       REAL,
  close_price     REAL,
  vwap            REAL,
  volume_mwh      REAL,
  trade_count     INTEGER DEFAULT 0,
  PRIMARY KEY (shard_key, minute_bucket)
);
CREATE INDEX IF NOT EXISTS idx_market_prints_minute ON market_prints(minute_bucket DESC);

-- margin_calls, clearing_runs, clearing_obligations were originally created
-- here. Migration 022 already creates the first one with a different shape,
-- and migration 037 then DROPs and recreates all three with the final shape
-- used by the route layer. Re-creating them here with CREATE IF NOT EXISTS
-- was a silent no-op (existing tables won), and the index on
-- clearing_obligations(run_id) failed because 022's column is named
-- `clearing_run_id`. Removed — 037 delivers the correct schema + indexes.
