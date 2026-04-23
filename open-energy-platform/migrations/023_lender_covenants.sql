-- 023_lender_covenants.sql
-- Lender / project finance national-scale features:
--   1. Covenant definitions + test results (DSCR, LLCR, availability, etc)
--   2. Independent Engineer (IE) workflow for drawdown certification
--   3. Cash-flow waterfall & reserve accounts (DSRA, MRA, O&M reserve)
--   4. Stress scenarios against the portfolio
--
-- Framework references: LMA ECA Term Loan, REIPPPP Implementation Agreement,
-- African Development Bank / DFI covenant norms.

-- ─── Covenant definitions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS covenants (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES ipp_projects(id),
  lender_participant_id TEXT REFERENCES participants(id),
  covenant_code TEXT NOT NULL,         -- 'DSCR_12M','LLCR','AVAILABILITY_95','INSURANCE','DEBT_RATIO'
  covenant_name TEXT NOT NULL,
  covenant_type TEXT NOT NULL CHECK (covenant_type IN (
    'financial','operational','insurance','reporting','legal','environmental','governance'
  )),
  operator TEXT NOT NULL CHECK (operator IN ('gte','lte','eq','gt','lt','between')),
  threshold REAL,
  threshold_upper REAL,                -- used for 'between'
  measurement_frequency TEXT NOT NULL CHECK (measurement_frequency IN (
    'monthly','quarterly','semi_annual','annual','on_event'
  )),
  first_test_date TEXT,
  waivable BOOLEAN DEFAULT 1,
  material_adverse_effect BOOLEAN DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','terminated')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_covenants_project ON covenants(project_id);
CREATE INDEX IF NOT EXISTS idx_covenants_lender ON covenants(lender_participant_id);
CREATE INDEX IF NOT EXISTS idx_covenants_code ON covenants(covenant_code);

-- ─── Covenant test results ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS covenant_tests (
  id TEXT PRIMARY KEY,
  covenant_id TEXT NOT NULL REFERENCES covenants(id),
  test_period TEXT NOT NULL,           -- 'Q2-2026', '2026-04', etc
  test_date TEXT NOT NULL,
  measured_value REAL,
  measured_value_text TEXT,            -- for non-numeric covenants
  result TEXT NOT NULL CHECK (result IN ('pass','warn','breach','not_tested','waived')),
  evidence_r2_key TEXT,
  narrative TEXT,
  waiver_id TEXT REFERENCES covenant_waivers(id),
  tested_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cov_tests_covenant ON covenant_tests(covenant_id, test_date DESC);
CREATE INDEX IF NOT EXISTS idx_cov_tests_result ON covenant_tests(result, test_date DESC);

-- ─── Covenant waivers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS covenant_waivers (
  id TEXT PRIMARY KEY,
  covenant_id TEXT NOT NULL REFERENCES covenants(id),
  requested_by TEXT REFERENCES participants(id),
  reason TEXT NOT NULL,
  requested_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested','reviewing','granted','rejected','expired'
  )),
  granted_by TEXT REFERENCES participants(id),
  granted_at TEXT,
  conditions TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cov_waivers_status ON covenant_waivers(status);

-- ─── Independent Engineer (IE) workflow ────────────────────────────────────
-- Extends project_disbursements (already in 002_domain.sql) with full IE
-- sign-off workflow: drawdown request → IE review → IE certificate → lender
-- approval → release. Keeps project_disbursements as the aggregate; adds
-- deeper state machine for each drawdown.
CREATE TABLE IF NOT EXISTS ie_certifications (
  id TEXT PRIMARY KEY,
  disbursement_id TEXT REFERENCES project_disbursements(id),
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  ie_participant_id TEXT NOT NULL REFERENCES participants(id),
  cert_number TEXT UNIQUE NOT NULL,
  cert_type TEXT NOT NULL CHECK (cert_type IN (
    'monthly_progress','milestone_completion','drawdown','commissioning','performance_test','taking_over','final'
  )),
  period TEXT,
  physical_progress_pct REAL,
  financial_progress_pct REAL,
  recommended_drawdown_zar REAL,
  certified_amount_zar REAL,
  qualifications TEXT,                 -- any qualifications / caveats on the cert
  site_visit_date TEXT,
  cert_issue_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','submitted','under_review','certified','qualified','rejected'
  )),
  document_r2_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ie_cert_project ON ie_certifications(project_id, cert_issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_ie_cert_disbursement ON ie_certifications(disbursement_id);
CREATE INDEX IF NOT EXISTS idx_ie_cert_status ON ie_certifications(status);

-- ─── Cash-flow waterfall ───────────────────────────────────────────────────
-- Standard project finance waterfall priorities (paid in order each period
-- from available project cashflow):
--   1 - Operating expenses
--   2 - Taxes
--   3 - Senior interest
--   4 - Senior principal
--   5 - DSRA top-up to target
--   6 - MRA top-up to target
--   7 - Mezzanine / subordinated debt
--   8 - Distributions to equity
CREATE TABLE IF NOT EXISTS waterfall_structures (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  waterfall_name TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_waterfall_project ON waterfall_structures(project_id);

CREATE TABLE IF NOT EXISTS waterfall_tranches (
  id TEXT PRIMARY KEY,
  waterfall_id TEXT NOT NULL REFERENCES waterfall_structures(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL,           -- 1 = first to be paid
  tranche_name TEXT NOT NULL,
  tranche_type TEXT NOT NULL CHECK (tranche_type IN (
    'opex','tax','senior_interest','senior_principal','dsra','mra','mezzanine','subordinated','equity_distribution','other'
  )),
  target_account_id TEXT,              -- REFERENCES reserve_accounts(id) when applicable
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_wf_tranche_waterfall ON waterfall_tranches(waterfall_id, priority);

CREATE TABLE IF NOT EXISTS waterfall_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  waterfall_id TEXT NOT NULL REFERENCES waterfall_structures(id),
  period TEXT NOT NULL,                -- 'Q2-2026'
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  available_cash_zar REAL NOT NULL,
  total_allocated_zar REAL,
  surplus_after_equity_zar REAL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','executed','reversed')),
  executed_at TEXT,
  executed_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wf_run_project ON waterfall_runs(project_id, period_start DESC);

CREATE TABLE IF NOT EXISTS waterfall_allocations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES waterfall_runs(id) ON DELETE CASCADE,
  tranche_id TEXT NOT NULL REFERENCES waterfall_tranches(id),
  amount_allocated_zar REAL NOT NULL,
  shortfall_zar REAL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_wf_alloc_run ON waterfall_allocations(run_id);

-- ─── Reserve accounts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reserve_accounts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  reserve_type TEXT NOT NULL CHECK (reserve_type IN ('dsra','mra','om_reserve','tax_reserve','insurance','other')),
  target_amount_zar REAL NOT NULL,
  target_basis TEXT,                   -- 'next_6m_debt_service','next_12m_om','fixed'
  current_balance_zar REAL DEFAULT 0,
  custodian TEXT,
  account_number TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','drawn_down','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reserve_project ON reserve_accounts(project_id);

CREATE TABLE IF NOT EXISTS reserve_movements (
  id TEXT PRIMARY KEY,
  reserve_id TEXT NOT NULL REFERENCES reserve_accounts(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('top_up','release','draw','interest','transfer_in','transfer_out')),
  amount_zar REAL NOT NULL,
  waterfall_run_id TEXT REFERENCES waterfall_runs(id),
  reason TEXT,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reserve_mvt_reserve ON reserve_movements(reserve_id, created_at DESC);

-- ─── Portfolio stress scenarios ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stress_scenarios (
  id TEXT PRIMARY KEY,
  scenario_name TEXT UNIQUE NOT NULL,
  description TEXT,
  parameters_json TEXT,                -- { tariff_shock_pct, availability_delta, fx_delta, ... }
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO stress_scenarios (id, scenario_name, description, parameters_json) VALUES
  ('ss_base', 'Base case',               'As-planned financial model.',                                  '{"tariff_delta_pct":0,"availability_delta_pct":0,"fx_delta_pct":0,"inflation_delta_pct":0}'),
  ('ss_tar_down_10', '10% tariff haircut', 'NERSA approves tariff 10% below request for the next period.', '{"tariff_delta_pct":-10,"availability_delta_pct":0,"fx_delta_pct":0,"inflation_delta_pct":0}'),
  ('ss_avail_85',    'Availability drops to 85%', 'Grid constraints / curtailment reduce availability to 85%.', '{"tariff_delta_pct":0,"availability_delta_pct":-10,"fx_delta_pct":0,"inflation_delta_pct":0}'),
  ('ss_fx_20',       'ZAR devaluation 20%', 'ZAR weakens 20% vs. USD — raises FX-linked debt service.', '{"tariff_delta_pct":0,"availability_delta_pct":0,"fx_delta_pct":-20,"inflation_delta_pct":0}'),
  ('ss_combo',       'Combined stress',     'Tariff -5%, availability -5%, FX -10%.',                     '{"tariff_delta_pct":-5,"availability_delta_pct":-5,"fx_delta_pct":-10,"inflation_delta_pct":0}');

CREATE TABLE IF NOT EXISTS stress_results (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES stress_scenarios(id),
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  run_at TEXT NOT NULL DEFAULT (datetime('now')),
  period TEXT,
  base_dscr REAL,
  stressed_dscr REAL,
  base_llcr REAL,
  stressed_llcr REAL,
  base_equity_irr REAL,
  stressed_equity_irr REAL,
  notes TEXT,
  run_by TEXT REFERENCES participants(id)
);
CREATE INDEX IF NOT EXISTS idx_stress_results_project ON stress_results(project_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_stress_results_scenario ON stress_results(scenario_id);
