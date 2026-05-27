-- 094_risk_engine.sql
-- Wave 2: Trading & Risk to CFTC + BIS PFMI grade.
-- Daily historical-simulation VaR + scenario engine for trading portfolios.
-- All CREATE TABLE IF NOT EXISTS; safe to re-apply.

-- ── risk_factors ────────────────────────────────────────────────────────
-- Universe of priced factors (ZA spot energy, ZAR/USD, coal API4, etc.).
CREATE TABLE IF NOT EXISTS risk_factors (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  factor_type   TEXT NOT NULL,          -- spot | fx | rates | fuel | index
  unit          TEXT NOT NULL,          -- ZAR/MWh, ZAR/USD, %, etc.
  source        TEXT,                   -- mark_prices, external_feed_xyz
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_risk_factors_type ON risk_factors(factor_type);

-- ── risk_factor_history ────────────────────────────────────────────────
-- Daily closes per factor; 250+ rows used as the historical-simulation
-- shock universe.
CREATE TABLE IF NOT EXISTS risk_factor_history (
  factor_id     TEXT NOT NULL,
  as_of_date    TEXT NOT NULL,
  value         REAL NOT NULL,
  source_run_id TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (factor_id, as_of_date)
);
CREATE INDEX IF NOT EXISTS idx_risk_fh_date ON risk_factor_history(as_of_date);

-- ── risk_portfolios ────────────────────────────────────────────────────
-- Saved portfolio views. basis_filter_json describes how to select
-- in-scope positions (e.g. {"trader_id":"u_001"}, {"counterparty":"x"},
-- {"energy_type":"baseload"}). Empty filter = all positions.
CREATE TABLE IF NOT EXISTS risk_portfolios (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  owner_id           TEXT,
  basis_filter_json  TEXT NOT NULL DEFAULT '{}',
  is_system          INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_risk_portfolios_owner ON risk_portfolios(owner_id);

-- ── risk_var_results ───────────────────────────────────────────────────
-- One row per portfolio × as_of × confidence × horizon. components_json
-- stores the top per-factor contributions for the AI explain assist.
CREATE TABLE IF NOT EXISTS risk_var_results (
  id                TEXT PRIMARY KEY,
  portfolio_id      TEXT NOT NULL,
  as_of_date        TEXT NOT NULL,
  methodology       TEXT NOT NULL DEFAULT 'historical_simulation',
  confidence        REAL NOT NULL,        -- 0.95 | 0.99
  horizon_days      INTEGER NOT NULL DEFAULT 1,
  var_amount_zar    REAL NOT NULL,        -- positive number (loss magnitude)
  es_amount_zar     REAL,                 -- expected shortfall, same convention
  components_json   TEXT,                  -- [{factor_id,name,contribution_zar,pct}]
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_risk_var_p_d ON risk_var_results(portfolio_id, as_of_date);
CREATE INDEX IF NOT EXISTS idx_risk_var_d ON risk_var_results(as_of_date);

-- ── risk_scenarios ─────────────────────────────────────────────────────
-- System library (is_system=1, owner_id NULL) + user-defined scenarios.
-- factor_shocks_json: [{factor_id, shock_pct} | {factor_id, shock_abs}].
CREATE TABLE IF NOT EXISTS risk_scenarios (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  is_system           INTEGER NOT NULL DEFAULT 0,
  factor_shocks_json  TEXT NOT NULL,
  owner_id            TEXT,                -- null for system
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_risk_scenarios_owner ON risk_scenarios(owner_id);

-- ── risk_scenario_results ──────────────────────────────────────────────
-- One row per scenario × portfolio × as_of_date.
CREATE TABLE IF NOT EXISTS risk_scenario_results (
  id                TEXT PRIMARY KEY,
  scenario_id       TEXT NOT NULL,
  portfolio_id      TEXT NOT NULL,
  as_of_date        TEXT NOT NULL,
  pnl_impact_zar    REAL NOT NULL,         -- negative = loss
  breakdown_json    TEXT,                   -- per-factor contribution
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_risk_sr_sp ON risk_scenario_results(scenario_id, portfolio_id, as_of_date);
CREATE INDEX IF NOT EXISTS idx_risk_sr_p_d ON risk_scenario_results(portfolio_id, as_of_date);
