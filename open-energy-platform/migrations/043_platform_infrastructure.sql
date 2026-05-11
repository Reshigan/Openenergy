-- ════════════════════════════════════════════════════════════════════════
-- 043 · Platform-wide infrastructure for cross-module parity
--
-- Promotes four pieces of "Watershed-grade" infrastructure built for ESG
-- in migrations 040/042 into the platform layer so all modules benefit:
--
--   1. Generic scenarios — trading P&L shocks, grid N-1 contingencies,
--      IPP project IRR sensitivities, regulator tariff-path scenarios.
--   2. Platform-wide hash-chain audit — wraps any entity in the same
--      SHA-256 chain primitive used for ESG records.
--   3. Cross-module anomaly detection — trades, invoices, contracts,
--      grid telemetry, metering readings.
--   4. AI classification log — domain-tagged so trade-classification,
--      contract-classification, license-screening etc. all share the
--      same audit-grade store.
--
-- Tables are platform-scoped (no participant FK) and indexed by domain
-- so each role's UI tab can filter to its own slice cheaply.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1. Generic scenarios — superset of climate_scenarios (042)
-- ────────────────────────────────────────────────────────────────────────
-- climate_scenarios in 042 are kept as-is; platform_scenarios extends the
-- concept across non-climate domains. They share the same shape so the UI
-- can compose them together where useful.

CREATE TABLE IF NOT EXISTS platform_scenarios (
  code            TEXT PRIMARY KEY,
  domain          TEXT NOT NULL CHECK (domain IN (
                    'trading','grid','ipp_project','regulator_tariff',
                    'lender_credit','offtaker_demand','climate'
                  )),
  family          TEXT NOT NULL,                     -- 'price_shock','outage','irr_sensitivity','tariff_path'…
  name            TEXT NOT NULL,
  description     TEXT,
  parameters_json TEXT,                              -- default JSON parameter set
  severity        TEXT CHECK (severity IN ('mild','moderate','severe','extreme')),
  created_at      TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO platform_scenarios (code, domain, family, name, description, parameters_json, severity) VALUES
  -- Trading
  ('TR_PRICE_SHOCK_DOWN_20','trading','price_shock','Price shock -20%','Mark prices drop 20% overnight.',
   '{"price_delta_pct":-20}','moderate'),
  ('TR_PRICE_SHOCK_DOWN_40','trading','price_shock','Price shock -40%','Mark prices drop 40% overnight.',
   '{"price_delta_pct":-40}','severe'),
  ('TR_PRICE_SHOCK_UP_30','trading','price_shock','Price shock +30%','Mark prices spike 30% — short-position pain.',
   '{"price_delta_pct":30}','moderate'),
  ('TR_VOL_DOUBLE','trading','volatility_shock','Volatility doubles','Realised volatility doubles, margin call triggered.',
   '{"vol_multiplier":2.0}','severe'),
  ('TR_COUNTERPARTY_DEFAULT','trading','counterparty_default','Top-3 counterparty defaults','Three largest counterparties default simultaneously.',
   '{"defaulting_counterparties":3}','extreme'),
  -- Grid
  ('GR_N1_LARGEST_GEN','grid','contingency','N-1: largest generator trips','Loss of single largest generation unit.',
   '{"contingency":"largest_gen_trip"}','moderate'),
  ('GR_N1_LINE_OUTAGE','grid','contingency','N-1: 400kV line outage','Loss of a 400kV transmission line — reroute via lower-voltage corridors.',
   '{"contingency":"line_400kv_outage"}','moderate'),
  ('GR_N2_DOUBLE_OUTAGE','grid','contingency','N-2: generator + line','Combined loss of generator and transmission line.',
   '{"contingency":"gen_plus_line"}','severe'),
  ('GR_LOAD_SHED_STAGE6','grid','load_shed','Stage-6 load shedding','Stage-6 NERSA load shedding regime activated.',
   '{"load_shed_stage":6}','severe'),
  -- IPP project
  ('IPP_TARIFF_DOWN_15','ipp_project','tariff_sensitivity','Tariff -15%','Off-take tariff revised down 15% on regulatory review.',
   '{"tariff_delta_pct":-15}','moderate'),
  ('IPP_AVAIL_DOWN_10','ipp_project','availability','Availability -10%','Plant availability factor degrades 10% due to wind resource drop.',
   '{"availability_delta_pct":-10}','moderate'),
  ('IPP_CAPEX_OVERRUN_25','ipp_project','capex_overrun','Capex +25%','Construction overruns drive capex 25% above budget.',
   '{"capex_delta_pct":25}','severe'),
  ('IPP_FX_DEPRECIATE_30','ipp_project','fx_shock','ZAR -30% vs USD','ZAR depreciates 30% — imported-equipment costs spike.',
   '{"fx_delta_pct":-30}','severe'),
  -- Regulator tariff
  ('REG_TARIFF_PATH_LOW','regulator_tariff','tariff_path','Low tariff path','Below-inflation tariff increase 4 years running.',
   '{"annual_increase_pct":4}','mild'),
  ('REG_TARIFF_PATH_HIGH','regulator_tariff','tariff_path','High tariff path','Above-inflation tariff increase 4 years running.',
   '{"annual_increase_pct":15}','moderate'),
  -- Lender credit
  ('LD_DSCR_BREACH','lender_credit','dscr_stress','DSCR breach','Project DSCR drops below 1.2× covenant threshold.',
   '{"dscr_target":1.2,"deterioration":"sudden"}','severe'),
  -- Offtaker
  ('OFF_DEMAND_DROP_20','offtaker_demand','demand_shock','Demand -20%','Industrial offtaker demand drops 20% on economic downturn.',
   '{"demand_delta_pct":-20}','moderate');

-- Per-participant scenario runs across all domains.
CREATE TABLE IF NOT EXISTS platform_scenario_runs (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL REFERENCES participants(id),
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  scenario_code       TEXT NOT NULL REFERENCES platform_scenarios(code),
  domain              TEXT NOT NULL,
  horizon_unit        TEXT NOT NULL CHECK (horizon_unit IN ('day','week','month','quarter','year')),
  horizon_value       INTEGER NOT NULL,
  -- Result metrics (domain-specific; nullable as appropriate)
  base_value_zar      REAL,
  shocked_value_zar   REAL,
  value_at_risk_zar   REAL,                          -- |shocked - base|
  pct_change          REAL,
  worst_entity        TEXT,                          -- worst-impacted contract / counterparty / project
  worst_entity_var_zar REAL,
  details_json        TEXT,                          -- per-row impact array
  status              TEXT DEFAULT 'complete' CHECK (status IN ('queued','running','complete','failed')),
  computed_at         TEXT DEFAULT (datetime('now')),
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_plat_scen_runs ON platform_scenario_runs(participant_id, domain, computed_at);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Platform-wide AI classification log (separates from ESG-only log)
-- ────────────────────────────────────────────────────────────────────────
-- Note: ai_classification_logs (042) is ESG-scoped. This one is domain-
-- tagged for cross-module classifications.

CREATE TABLE IF NOT EXISTS platform_ai_logs (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  domain              TEXT NOT NULL CHECK (domain IN (
                        'esg','trade','contract','license','grid_alarm','ipp_milestone',
                        'invoice','counterparty','market_surveillance','generic'
                      )),
  input_text          TEXT NOT NULL,
  input_metadata_json TEXT,
  model_id            TEXT,
  output_label        TEXT,
  output_categories_json TEXT,
  confidence          REAL,
  reasoning           TEXT,
  user_accepted       INTEGER DEFAULT 0,
  user_override       TEXT,
  resolved_at         TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plat_ai_logs_domain ON platform_ai_logs(participant_id, domain, created_at);

-- ────────────────────────────────────────────────────────────────────────
-- 3. Cross-module anomaly flags
-- ────────────────────────────────────────────────────────────────────────
-- esg_anomaly_flags (040) is FK-constrained to esg_activity_transactions
-- so it can't accept trade or invoice ids. This table accepts any entity.

CREATE TABLE IF NOT EXISTS platform_anomaly_flags (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  domain              TEXT NOT NULL CHECK (domain IN (
                        'trading','invoice','contract','grid_telemetry','metering',
                        'license_application','counterparty','ipp_milestone','esg'
                      )),
  entity_table        TEXT,                          -- which table the anomaly refers to
  entity_id           TEXT,                          -- record id (not FK to allow cross-module)
  rule                TEXT NOT NULL,                 -- 'price_spike','wash_trade','duplicate_invoice','factor_mismatch','telemetry_dropout','milestone_slip',…
  severity            TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  detail              TEXT,
  expected_value      REAL,
  observed_value      REAL,
  status              TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','dismissed','resolved')),
  detected_at         TEXT DEFAULT (datetime('now')),
  resolved_at         TEXT,
  resolved_by         TEXT
);
CREATE INDEX IF NOT EXISTS idx_plat_anom_part_dom ON platform_anomaly_flags(participant_id, domain, status);

-- ────────────────────────────────────────────────────────────────────────
-- 4. Platform-wide audit chain (mirrors audit_chain in 042 but generic)
-- ────────────────────────────────────────────────────────────────────────
-- audit_chain (042) already supports any entity_table — extend by adding
-- a domain tag so per-module UI tabs can filter cheaply.

ALTER TABLE audit_chain ADD COLUMN domain TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_chain_domain ON audit_chain(domain, sequence_no);
