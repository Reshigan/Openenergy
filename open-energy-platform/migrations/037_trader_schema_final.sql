-- ════════════════════════════════════════════════════════════════════════
-- 037 · trader schema final alignment
--
-- Replaces the placeholder tables created in 034/035/036 with the exact
-- column names referenced by /src/routes/trader-risk.ts. This is the last
-- alignment migration in the trader space.
-- ════════════════════════════════════════════════════════════════════════

-- trader_positions: keyed by (participant_id, energy_type, delivery_date)
DROP TABLE IF EXISTS trader_positions;
CREATE TABLE trader_positions (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  energy_type     TEXT,
  delivery_date   TEXT,
  net_volume_mwh  REAL DEFAULT 0,
  avg_entry_price REAL,
  mark_price      REAL,
  unrealised_pnl  REAL DEFAULT 0,
  realised_pnl    REAL DEFAULT 0,
  notional        REAL DEFAULT 0,
  updated_at      TEXT DEFAULT (datetime('now')),
  UNIQUE (participant_id, energy_type, delivery_date)
);
CREATE INDEX IF NOT EXISTS idx_trader_positions_part ON trader_positions(participant_id);

-- margin_calls: per-participant per-as_of snapshots.
DROP TABLE IF EXISTS margin_calls;
CREATE TABLE margin_calls (
  id                       TEXT PRIMARY KEY,
  participant_id           TEXT NOT NULL,
  as_of                    TEXT NOT NULL,
  exposure_zar             REAL DEFAULT 0,
  initial_margin_zar       REAL DEFAULT 0,
  variation_margin_zar     REAL DEFAULT 0,
  posted_collateral_zar    REAL DEFAULT 0,
  shortfall_zar            REAL DEFAULT 0,
  due_by                   TEXT,
  status                   TEXT DEFAULT 'open' CHECK (status IN ('open','met','escalated','breached')),
  created_at               TEXT DEFAULT (datetime('now')),
  resolved_at              TEXT
);
CREATE INDEX IF NOT EXISTS idx_margin_calls_part_asof ON margin_calls(participant_id, as_of DESC);

-- clearing_runs: keyed by trading_day, with summary counts.
DROP TABLE IF EXISTS clearing_runs;
CREATE TABLE clearing_runs (
  id              TEXT PRIMARY KEY,
  trading_day     TEXT NOT NULL,
  shard_key       TEXT,
  status          TEXT DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  trades_in       INTEGER DEFAULT 0,
  obligations_out INTEGER DEFAULT 0,
  net_zar         REAL DEFAULT 0,
  created_by      TEXT,
  started_at      TEXT DEFAULT (datetime('now')),
  finished_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_clearing_runs_day ON clearing_runs(trading_day DESC);

-- clearing_obligations stays same shape from 036 but recreate for clarity.
DROP TABLE IF EXISTS clearing_obligations;
CREATE TABLE clearing_obligations (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES clearing_runs(id),
  participant_id  TEXT NOT NULL,
  counterparty_id TEXT,
  net_zar         REAL NOT NULL,
  direction       TEXT CHECK (direction IN ('pay','receive')),
  status          TEXT DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_clearing_obligations_run ON clearing_obligations(run_id);

-- mark_prices: route uses (id, energy_type, delivery_date, mark_date,
-- mark_price_zar_mwh, source). My 035 version had a different shape.
DROP TABLE IF EXISTS mark_prices;
CREATE TABLE mark_prices (
  id                  TEXT PRIMARY KEY,
  energy_type         TEXT NOT NULL,
  delivery_date       TEXT,
  mark_date           TEXT NOT NULL,
  mark_price_zar_mwh  REAL NOT NULL,
  source              TEXT DEFAULT 'manual',
  computed_at         TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mark_prices_lookup ON mark_prices(energy_type, delivery_date, mark_date DESC);
