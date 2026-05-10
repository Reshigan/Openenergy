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

-- Margin call ledger (used by /api/trader-risk/margin-calls/run + /margin-calls).
CREATE TABLE IF NOT EXISTS margin_calls (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  required_zar    REAL NOT NULL,
  posted_zar      REAL NOT NULL,
  shortfall_zar   REAL NOT NULL,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','met','escalated','breached')),
  due_at          TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  resolved_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_margin_calls_part_status ON margin_calls(participant_id, status);

-- Clearing run summary (used by /api/trader-risk/clearing/run + /clearing/runs).
CREATE TABLE IF NOT EXISTS clearing_runs (
  id              TEXT PRIMARY KEY,
  shard_key       TEXT,
  trades_in       INTEGER DEFAULT 0,
  obligations_out INTEGER DEFAULT 0,
  net_zar         REAL DEFAULT 0,
  started_at      TEXT DEFAULT (datetime('now')),
  finished_at     TEXT,
  status          TEXT DEFAULT 'running' CHECK (status IN ('running','complete','failed'))
);

CREATE TABLE IF NOT EXISTS clearing_obligations (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES clearing_runs(id),
  participant_id  TEXT NOT NULL,
  counterparty_id TEXT,
  net_zar         REAL NOT NULL,
  direction       TEXT CHECK (direction IN ('pay','receive')),
  status          TEXT DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_clearing_obligations_run ON clearing_obligations(run_id);
