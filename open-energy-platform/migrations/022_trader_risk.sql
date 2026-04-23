-- 022_trader_risk.sql
-- Trader risk & credit framework: positions, mark-to-market, margin, credit
-- limits, collateral, clearing (multi-lateral netting).
--
-- Statutory basis: Financial Markets Act 19 of 2012 (FMA) for regulated
-- trading conduct; JSE Clear rules as reference for clearing/netting shapes.

-- ─── Positions ─────────────────────────────────────────────────────────────
-- Net long/short per participant × energy_type × delivery_date. Updated by
-- fills via a trigger-like maintenance function called from the DO.
CREATE TABLE IF NOT EXISTS trader_positions (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  energy_type TEXT NOT NULL,
  delivery_date TEXT,              -- NULL = prompt / any
  net_volume_mwh REAL DEFAULT 0,   -- +ve long, -ve short
  avg_entry_price REAL,
  realised_pnl_zar REAL DEFAULT 0,
  unrealised_pnl_zar REAL DEFAULT 0,
  last_mark_price REAL,
  last_mark_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (participant_id, energy_type, delivery_date)
);
CREATE INDEX IF NOT EXISTS idx_trader_pos_participant ON trader_positions(participant_id);

-- ─── Mark-to-market prices ─────────────────────────────────────────────────
-- EOD mark prices per (energy_type, delivery_date). Computed from market_prints
-- or posted by the clearing desk.
CREATE TABLE IF NOT EXISTS mark_prices (
  id TEXT PRIMARY KEY,
  energy_type TEXT NOT NULL,
  delivery_date TEXT,
  mark_date TEXT NOT NULL,          -- YYYY-MM-DD
  mark_price_zar_mwh REAL NOT NULL,
  source TEXT DEFAULT 'vwap',       -- 'vwap','settlement','operator_post'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (energy_type, delivery_date, mark_date)
);
CREATE INDEX IF NOT EXISTS idx_mark_prices_lookup ON mark_prices(energy_type, delivery_date, mark_date DESC);

-- ─── Credit limits & utilisation ───────────────────────────────────────────
-- Platform-imposed trading credit limit per participant. Pre-trade check
-- compares notional of new order against available headroom.
CREATE TABLE IF NOT EXISTS credit_limits (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  limit_zar REAL NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  approved_by TEXT REFERENCES participants(id),
  basis TEXT,                       -- 'cash_collateral','bank_guarantee','sov_bond','parental_guarantee','unsecured'
  counterparty_specific_id TEXT REFERENCES participants(id),  -- optional per-counterparty sub-limit
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_credit_limits_participant ON credit_limits(participant_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS credit_utilisation (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  open_notional_zar REAL DEFAULT 0,     -- unsettled exposure on open orders + matches
  settled_notional_zar REAL DEFAULT 0,  -- exposure awaiting payment
  margin_held_zar REAL DEFAULT 0,
  utilisation_pct REAL DEFAULT 0,
  snapshot_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_credit_util_participant ON credit_utilisation(participant_id, snapshot_at DESC);

-- ─── Collateral & margin ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collateral_accounts (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  account_number TEXT UNIQUE NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash','bank_guarantee','sov_bond','parental_guarantee','other')),
  currency TEXT DEFAULT 'ZAR',
  balance_zar REAL DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  custodian TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_collateral_participant ON collateral_accounts(participant_id);

CREATE TABLE IF NOT EXISTS collateral_movements (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES collateral_accounts(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'top_up','margin_call','margin_release','withdrawal','settlement_draw','fee','adjustment'
  )),
  amount_zar REAL NOT NULL,         -- signed: +ve in, -ve out
  related_entity_type TEXT,
  related_entity_id TEXT,
  description TEXT,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coll_mvt_account ON collateral_movements(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS margin_calls (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  as_of TEXT NOT NULL,
  exposure_zar REAL NOT NULL,
  initial_margin_zar REAL NOT NULL,
  variation_margin_zar REAL DEFAULT 0,
  posted_collateral_zar REAL DEFAULT 0,
  shortfall_zar REAL NOT NULL,
  due_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN (
    'issued','acknowledged','met','breached','waived','closed_out'
  )),
  met_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_margin_calls_participant ON margin_calls(participant_id, as_of DESC);
CREATE INDEX IF NOT EXISTS idx_margin_calls_status ON margin_calls(status);

-- ─── Clearing / multi-lateral netting ──────────────────────────────────────
-- One clearing run per trading day produces a net obligation per participant.
CREATE TABLE IF NOT EXISTS clearing_runs (
  id TEXT PRIMARY KEY,
  trading_day TEXT NOT NULL,
  run_started_at TEXT NOT NULL DEFAULT (datetime('now')),
  run_completed_at TEXT,
  total_gross_zar REAL,
  total_net_zar REAL,
  netting_ratio REAL,                -- net / gross; smaller = more netting saved
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','failed','reversed')),
  created_by TEXT REFERENCES participants(id)
);
CREATE INDEX IF NOT EXISTS idx_clearing_runs_day ON clearing_runs(trading_day DESC);

CREATE TABLE IF NOT EXISTS clearing_obligations (
  id TEXT PRIMARY KEY,
  clearing_run_id TEXT NOT NULL REFERENCES clearing_runs(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  counterparty_id TEXT REFERENCES participants(id),     -- NULL = against central counterparty
  gross_payables_zar REAL DEFAULT 0,
  gross_receivables_zar REAL DEFAULT 0,
  net_amount_zar REAL DEFAULT 0,    -- +ve receive, -ve pay
  settled BOOLEAN DEFAULT 0,
  settled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_clearing_obl_run ON clearing_obligations(clearing_run_id);
CREATE INDEX IF NOT EXISTS idx_clearing_obl_participant ON clearing_obligations(participant_id);
