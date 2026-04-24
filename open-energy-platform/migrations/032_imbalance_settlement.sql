-- 032_imbalance_settlement.sql
-- SA Grid Code — System Operations Code BRP imbalance settlement.
--
-- Distinct from the pre-existing `grid_imbalance` table (migration 002),
-- which is a kWh-based manual-entry book kept for legacy reports. The
-- national-scale settlement engine (src/utils/imbalance-engine.ts) works
-- in MWh with direction-based pricing (long / short / balanced) and
-- lands its output in the three tables below.
--
-- Model:
--   brp_period_nominations  — BRP's scheduled vs actual MWh per 30-min period
--   imbalance_prices        — SO-published long/short prices per period
--   imbalance_settlements   — engine output, one row per (BRP × period)
--   imbalance_monthly_totals — cached monthly aggregate for invoicing
--
-- Settlement periods are 30-min UTC; period_start is the canonical key.

CREATE TABLE IF NOT EXISTS brp_period_nominations (
  brp_participant_id TEXT NOT NULL REFERENCES participants(id),
  period_start TEXT NOT NULL,               -- ISO datetime, 30-min UTC
  period_end TEXT NOT NULL,
  scheduled_mwh REAL NOT NULL,
  actual_mwh REAL,                           -- null until metering closes
  source TEXT DEFAULT 'brp' CHECK (source IN ('brp','metering','sro','backfill')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (brp_participant_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_brp_noms_period ON brp_period_nominations(period_start);
CREATE INDEX IF NOT EXISTS idx_brp_noms_brp_period ON brp_period_nominations(brp_participant_id, period_start);

CREATE TABLE IF NOT EXISTS imbalance_prices (
  period_start TEXT PRIMARY KEY,              -- ISO datetime
  period_end TEXT NOT NULL,
  long_price_zar_mwh REAL NOT NULL,
  short_price_zar_mwh REAL NOT NULL,
  tolerance_mwh REAL DEFAULT 0.05,
  published_by TEXT REFERENCES participants(id),
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_imbalance_prices_published ON imbalance_prices(published_at);

CREATE TABLE IF NOT EXISTS imbalance_settlements (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,                       -- batches period records into a single settlement run
  brp_participant_id TEXT NOT NULL REFERENCES participants(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  scheduled_mwh REAL NOT NULL,
  actual_mwh REAL NOT NULL,
  imbalance_mwh REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long','short','balanced')),
  price_applied_zar_mwh REAL NOT NULL,
  imbalance_charge_zar REAL NOT NULL,         -- +ve BRP owes, -ve BRP receives
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (brp_participant_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_imbalance_settlements_run ON imbalance_settlements(run_id);
CREATE INDEX IF NOT EXISTS idx_imbalance_settlements_brp ON imbalance_settlements(brp_participant_id, period_start);
CREATE INDEX IF NOT EXISTS idx_imbalance_settlements_period ON imbalance_settlements(period_start);

CREATE TABLE IF NOT EXISTS imbalance_monthly_totals (
  brp_participant_id TEXT NOT NULL REFERENCES participants(id),
  period TEXT NOT NULL,                        -- YYYY-MM
  periods_count INTEGER NOT NULL,
  scheduled_mwh_total REAL NOT NULL,
  actual_mwh_total REAL NOT NULL,
  imbalance_mwh_long REAL NOT NULL,
  imbalance_mwh_short REAL NOT NULL,
  net_charge_zar REAL NOT NULL,
  long_charge_zar REAL NOT NULL,
  short_charge_zar REAL NOT NULL,
  on_target_period_pct REAL NOT NULL,
  settled INTEGER NOT NULL DEFAULT 0,
  settled_at TEXT,
  invoice_id TEXT REFERENCES invoices(id),
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (brp_participant_id, period)
);
CREATE INDEX IF NOT EXISTS idx_imbalance_monthly_period ON imbalance_monthly_totals(period);
CREATE INDEX IF NOT EXISTS idx_imbalance_monthly_settled ON imbalance_monthly_totals(settled, period);

-- Run log: lets us audit + replay settlement runs.
CREATE TABLE IF NOT EXISTS imbalance_settlement_runs (
  id TEXT PRIMARY KEY,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  run_by TEXT REFERENCES participants(id),
  periods_settled INTEGER DEFAULT 0,
  brps_settled INTEGER DEFAULT 0,
  net_charge_zar_total REAL DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_imbalance_runs_started ON imbalance_settlement_runs(started_at);
