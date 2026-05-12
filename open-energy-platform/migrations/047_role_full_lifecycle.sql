-- ════════════════════════════════════════════════════════════════════════
-- 047 · Full lifecycle micro-tools for six remaining roles
--
-- Mirrors what migration 046 did for IPP, across the other roles. Each
-- role gets 7-8 tables covering the daily-weekly workflows that
-- previously required a separate tool.
--
--   OFFTAKER   energy procurement → reporting (7 tables)
--   LENDER     pipeline → portfolio → IFRS9 (7 tables)
--   CARBON     fund LPs → capital calls → NAV (7 tables)
--   GRID OP    SCADA → dispatch → contingency (7 tables)
--   REGULATOR  applications → inspections → annual reports (7 tables)
--   TRADER     limits → VaR → options → CSA → P&L (7 tables)
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- OFFTAKER — full energy procurement lifecycle
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS off_ppa_portfolio (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  contract_ref    TEXT,
  counterparty_name TEXT NOT NULL,
  technology      TEXT,
  capacity_mw     REAL,
  ppa_term_years  INTEGER,
  ppa_start_date  TEXT,
  ppa_end_date    TEXT,
  price_zar_per_mwh REAL,
  indexation      TEXT,                              -- 'CPI','CPI+2','fixed'
  expected_p50_gwh_yr REAL,
  green_attributes TEXT,
  status          TEXT DEFAULT 'signed' CHECK (status IN ('negotiating','signed','active','expired','terminated')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS off_contract_redlines (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  contract_id     TEXT,
  version_no      TEXT NOT NULL,
  prepared_by     TEXT,
  changes_summary TEXT,
  document_r2_key TEXT,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','received','accepted','rejected','superseded')),
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS off_tou_optimisations (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  analysis_month  TEXT NOT NULL,                     -- YYYY-MM
  current_tariff_bucket TEXT,                        -- 'megaflex_standard','megaflex_lpu','nightsave'
  current_zar_per_kwh REAL,
  suggested_bucket TEXT,
  suggested_zar_per_kwh REAL,
  annual_savings_zar REAL,
  load_shift_required_pct REAL,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS off_btm_designs (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  site_name       TEXT NOT NULL,
  rooftop_area_m2 REAL,
  proposed_kwp    REAL NOT NULL,
  inverter_kw     REAL,
  bess_kwh        REAL DEFAULT 0,
  expected_yield_kwh_yr REAL,
  capex_zar       REAL,
  estimated_payback_years REAL,
  self_consumption_pct REAL,
  scope2_reduction_tco2e_yr REAL,
  status          TEXT DEFAULT 'design' CHECK (status IN ('feasibility','design','approved','installed','commissioned','decommissioned')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS off_scope2_reports (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  reporting_year  INTEGER NOT NULL,
  total_consumption_mwh REAL NOT NULL,
  location_factor_kg_kwh REAL,                       -- NERSA grid factor
  market_factor_kg_kwh REAL,
  location_tco2e  REAL,
  market_tco2e    REAL,
  recs_retired_mwh REAL DEFAULT 0,
  ppa_attributed_mwh REAL DEFAULT 0,
  renewable_pct   REAL,
  cfe_match_pct   REAL,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','assured','restated')),
  assured_by      TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE (participant_id, reporting_year)
);

CREATE TABLE IF NOT EXISTS off_cfe_commitments (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  framework       TEXT NOT NULL,                     -- 'RE100','24/7 CFE','SBTi','custom'
  target_year     INTEGER NOT NULL,
  target_pct      REAL NOT NULL,                     -- e.g. 100% or 24/7 match
  pledge_date     TEXT,
  status          TEXT DEFAULT 'active' CHECK (status IN ('committed','active','achieved','off_track','revised','withdrawn')),
  current_pct     REAL,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS off_energy_budgets (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  budget_year     INTEGER NOT NULL,
  category        TEXT NOT NULL,                     -- 'grid','ppa','rec','offset','wheeling'
  budget_zar      REAL NOT NULL,
  spent_zar       REAL DEFAULT 0,
  variance_zar    REAL,
  variance_pct    REAL,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','tracking','overspent','closed')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- LENDER — full project-finance lifecycle (beyond what 045 covers)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lender_deal_pipeline (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  deal_name       TEXT NOT NULL,
  sponsor_name    TEXT,
  sector          TEXT,
  jurisdiction    TEXT,
  ticket_size_zar REAL,
  expected_close  TEXT,
  probability_pct REAL,
  source          TEXT,                              -- 'inbound','outbound','reference','rfp'
  owner_user_id   TEXT,
  stage           TEXT DEFAULT 'sourcing' CHECK (stage IN ('sourcing','qualified','term_sheet','due_diligence','credit_committee','signed','closed','lost','withdrawn')),
  next_action     TEXT,
  next_action_due TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pipe_part_stage ON lender_deal_pipeline(participant_id, stage);

CREATE TABLE IF NOT EXISTS lender_sponsor_dd (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  pipeline_id     TEXT,
  sponsor_name    TEXT NOT NULL,
  registration_no TEXT,
  jurisdiction    TEXT,
  ultimate_beneficial_owner TEXT,
  group_structure_r2_key TEXT,
  -- DD checks
  kyc_outcome     TEXT CHECK (kyc_outcome IN ('clean','flagged','blocked','pending')),
  sanctions_check_outcome TEXT,
  pep_check_outcome TEXT,
  litigation_check_outcome TEXT,
  track_record_score INTEGER CHECK (track_record_score BETWEEN 1 AND 10),
  bbbee_level     INTEGER,
  financial_strength_score INTEGER CHECK (financial_strength_score BETWEEN 1 AND 10),
  overall_outcome TEXT CHECK (overall_outcome IN ('approved','conditional','declined','pending')),
  reviewed_by     TEXT,
  reviewed_at     TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lender_credit_risk (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  loan_id         TEXT,
  as_of_date      TEXT NOT NULL,
  -- Basel III / IFRS 9 inputs
  pd_1yr_pct      REAL,                              -- probability of default
  pd_lifetime_pct REAL,
  lgd_pct         REAL,                              -- loss given default
  ead_zar         REAL,                              -- exposure at default
  ccf_pct         REAL,                              -- credit conversion factor
  risk_weight_pct REAL,                              -- Basel III risk weight
  rwa_zar         REAL,                              -- risk-weighted assets
  expected_loss_zar REAL,                            -- PD × LGD × EAD
  rating_internal TEXT,                              -- 'AAA','AA','A','BBB',...'D'
  rating_external TEXT,
  watchlist       INTEGER DEFAULT 0,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lender_ecl_provisions (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  loan_id         TEXT,
  reporting_period TEXT NOT NULL,                    -- YYYY-MM or YYYY-Q1
  ifrs9_stage     INTEGER CHECK (ifrs9_stage IN (1, 2, 3)),
  stage1_ecl_zar  REAL DEFAULT 0,                    -- 12-month ECL
  stage2_ecl_zar  REAL DEFAULT 0,                    -- lifetime ECL
  stage3_ecl_zar  REAL DEFAULT 0,                    -- credit-impaired
  total_provision_zar REAL,
  recovery_zar    REAL DEFAULT 0,
  net_provision_zar REAL,
  stage_change_reason TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lender_limit_framework (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  limit_type      TEXT NOT NULL CHECK (limit_type IN ('single_name','sector','country','currency','product','tenor','ltv','dscr_min')),
  limit_dimension TEXT,                              -- the value being limited (e.g. 'power' or 'ZA' or 'syndicated')
  limit_zar       REAL,
  limit_pct       REAL,
  current_zar     REAL DEFAULT 0,
  current_pct     REAL,
  utilisation_pct REAL,
  status          TEXT DEFAULT 'within' CHECK (status IN ('within','warning','breach','waived')),
  as_of_date      TEXT,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS lender_pricing_models (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  loan_id         TEXT,
  pricing_method  TEXT,                              -- 'RAROC','EVA','target_margin'
  cost_of_funds_pct REAL,
  cost_of_credit_pct REAL,
  cost_of_capital_pct REAL,
  cost_of_ops_pct REAL,
  pricing_floor_bps INTEGER,
  proposed_margin_bps INTEGER,
  expected_raroc_pct REAL,
  hurdle_raroc_pct REAL,
  approved        INTEGER DEFAULT 0,
  approved_by     TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lender_repayment_schedules (
  id              TEXT PRIMARY KEY,
  loan_id         TEXT NOT NULL,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  installment_no  INTEGER NOT NULL,
  due_date        TEXT NOT NULL,
  principal_zar   REAL,
  interest_zar    REAL,
  fees_zar        REAL,
  total_zar       REAL,
  balance_after_zar REAL,
  status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','paid','partial','overdue','rescheduled','waived')),
  paid_at         TEXT,
  paid_amount_zar REAL,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_repay_loan ON lender_repayment_schedules(loan_id, due_date);

-- ────────────────────────────────────────────────────────────────────────
-- CARBON FUND — full fund lifecycle
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS carbon_fund_lps (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),  -- the fund GP
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  lp_name         TEXT NOT NULL,
  lp_jurisdiction TEXT,
  commitment_zar  REAL NOT NULL,
  drawn_zar       REAL DEFAULT 0,
  distributed_zar REAL DEFAULT 0,
  remaining_commitment_zar REAL,
  share_class     TEXT,                              -- 'A','B','founders'
  side_letter     INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'active' CHECK (status IN ('committed','active','defaulted','redeemed','transferred')),
  joined_at       TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_fund_capital_calls (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  call_no         INTEGER NOT NULL,
  call_date       TEXT NOT NULL,
  due_date        TEXT,
  total_called_zar REAL NOT NULL,
  purpose         TEXT,
  status          TEXT DEFAULT 'issued' CHECK (status IN ('issued','funded','partial','overdue','cancelled')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_fund_nav_history (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  as_of_date      TEXT NOT NULL,
  gross_asset_value_zar REAL NOT NULL,
  cash_zar        REAL DEFAULT 0,
  liabilities_zar REAL DEFAULT 0,
  net_asset_value_zar REAL NOT NULL,
  nav_per_unit_zar REAL,
  units_outstanding REAL,
  ytd_return_pct  REAL,
  itd_irr_pct     REAL,                              -- inception-to-date IRR
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE (participant_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS carbon_fund_pipeline (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_lead    TEXT NOT NULL,
  technology      TEXT,
  expected_tco2e_yr REAL,
  ticket_size_zar REAL,
  developer_name  TEXT,
  stage           TEXT DEFAULT 'sourced' CHECK (stage IN ('sourced','screening','term_sheet','dd','approval','signed','withdrawn','rejected')),
  source          TEXT,
  owner_user_id   TEXT,
  next_action     TEXT,
  next_action_due TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_fund_term_sheets (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  pipeline_id     TEXT,
  developer_name  TEXT,
  version         TEXT,
  total_tco2e     REAL,
  price_zar_per_tco2e REAL,
  prepayment_zar  REAL,
  conditions_precedent TEXT,
  document_r2_key TEXT,
  status          TEXT DEFAULT 'drafting' CHECK (status IN ('drafting','sent','negotiating','signed','expired','withdrawn')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_fund_cobenefits (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,                              -- joins cdr_projects(id)
  sdg_target      TEXT NOT NULL,                     -- 'SDG_1','SDG_7','SDG_13','SDG_15',...
  metric_name     TEXT,                              -- 'jobs_created','hectares_restored','women_trained'
  baseline_value  REAL,
  current_value   REAL,
  target_value    REAL,
  unit            TEXT,
  reporting_period TEXT,
  verified_by     TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_fund_fees (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  fee_type        TEXT NOT NULL CHECK (fee_type IN ('management','performance','admin','transaction','side_pocket')),
  reporting_period TEXT NOT NULL,
  basis           TEXT,                              -- e.g. '2% NAV','20% above hurdle'
  base_zar        REAL,
  rate_pct        REAL,
  fee_zar         REAL NOT NULL,
  status          TEXT DEFAULT 'accrued' CHECK (status IN ('accrued','invoiced','paid','disputed','waived')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- GRID OPERATOR — full system operation lifecycle
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grid_scada_snapshots (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  substation_code TEXT NOT NULL,
  observed_at     TEXT NOT NULL,
  voltage_kv      REAL,
  voltage_pu      REAL,
  active_mw       REAL,
  reactive_mvar   REAL,
  frequency_hz    REAL,
  loading_pct     REAL,
  health_status   TEXT,                              -- 'normal','warn','alarm','outage'
  scada_source    TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scada_sub_time ON grid_scada_snapshots(substation_code, observed_at);

CREATE TABLE IF NOT EXISTS grid_dispatch_schedules (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  schedule_date   TEXT NOT NULL,
  schedule_type   TEXT NOT NULL CHECK (schedule_type IN ('day_ahead','intra_day','real_time')),
  published_at    TEXT,
  generator_id    TEXT,
  generator_name  TEXT,
  -- 24-hour MWh dispatch schedule stored as JSON
  hourly_mwh_json TEXT NOT NULL,
  total_mwh       REAL,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','superseded','withdrawn')),
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_dispatch_date ON grid_dispatch_schedules(schedule_date, status);

CREATE TABLE IF NOT EXISTS grid_intraday_balancing (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  trading_hour    TEXT NOT NULL,                     -- ISO datetime, hour-truncated
  generation_forecast_mw REAL,
  load_forecast_mw REAL,
  imbalance_mw    REAL,
  balancing_action_mw REAL,
  action_direction TEXT CHECK (action_direction IN ('up','down','none')),
  balancing_cost_zar REAL,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grid_reactive_dispatch (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  observed_at     TEXT NOT NULL,
  zone_id         TEXT,                              -- joins voltage_management_zones
  reactive_dispatched_mvar REAL,
  resource_type   TEXT,                              -- 'svc','statcom','synchronous_condenser','capacitor_bank','generator_avr'
  voltage_set_point_pu REAL,
  achieved_voltage_pu REAL,
  cost_zar        REAL,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grid_contingency_runs (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  run_date        TEXT NOT NULL,
  run_type        TEXT NOT NULL CHECK (run_type IN ('n_minus_1','n_minus_2','cascade','black_start')),
  contingency_set TEXT,                              -- JSON list of elements knocked out
  pre_contingency_loading_pct REAL,
  post_contingency_loading_pct REAL,
  pre_contingency_voltage_pu REAL,
  post_contingency_voltage_pu REAL,
  outcome         TEXT CHECK (outcome IN ('secure','warn','breach','blackout')),
  remedy_actions  TEXT,                              -- JSON
  computed_at     TEXT DEFAULT (datetime('now')),
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS grid_outage_coordination (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  outage_ref      TEXT,
  asset_descr     TEXT NOT NULL,
  outage_type     TEXT NOT NULL CHECK (outage_type IN ('planned','forced','emergency','protective')),
  scheduled_start TEXT,
  scheduled_end   TEXT,
  actual_start    TEXT,
  actual_end      TEXT,
  capacity_out_mw REAL,
  reason          TEXT,
  coordinated_with TEXT,                             -- generators / SO / EPC
  status          TEXT DEFAULT 'requested' CHECK (status IN ('requested','approved','active','restored','cancelled','overrun')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grid_aggregated_forecasts (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  forecast_for_date TEXT NOT NULL,
  forecast_made_at TEXT DEFAULT (datetime('now')),
  technology      TEXT NOT NULL CHECK (technology IN ('solar','wind','hydro','demand')),
  grid_zone       TEXT,
  hourly_mw_json  TEXT NOT NULL,                     -- 24h
  total_mwh       REAL,
  source          TEXT,                              -- 'ona','vortex','windgrid','eskom_iml','solcast'
  confidence_pct  REAL,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_aggfc_date ON grid_aggregated_forecasts(forecast_for_date, technology);

-- ────────────────────────────────────────────────────────────────────────
-- REGULATOR — full oversight lifecycle
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reg_licence_applications (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  application_ref TEXT NOT NULL UNIQUE,
  applicant_id    TEXT,
  applicant_name  TEXT NOT NULL,
  licence_category TEXT NOT NULL,                    -- joins universal_categories REG_LIC_*
  capacity_mw     REAL,
  technology      TEXT,
  jurisdiction    TEXT,
  filed_at        TEXT NOT NULL,
  completeness_check_outcome TEXT,
  technical_evaluator TEXT,
  financial_evaluator TEXT,
  public_consultation_id TEXT,
  panel_decision_at TEXT,
  outcome         TEXT CHECK (outcome IN ('pending','granted','granted_with_conditions','refused','withdrawn')),
  conditions      TEXT,
  determination_id TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_app ON reg_licence_applications(outcome, filed_at);

CREATE TABLE IF NOT EXISTS reg_tariff_applications (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  application_ref TEXT NOT NULL UNIQUE,
  applicant_id    TEXT,
  applicant_name  TEXT NOT NULL,
  tariff_year     INTEGER NOT NULL,
  requested_increase_pct REAL NOT NULL,
  approved_increase_pct REAL,
  multi_year_path TEXT,                              -- 'MYPD5','MYPD6'
  hearing_id      TEXT,
  determination_id TEXT,
  status          TEXT DEFAULT 'filed' CHECK (status IN ('filed','consultation','hearing','determined','appealed','withdrawn')),
  decision_date   TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reg_inspections (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  licensee_id     TEXT,
  licensee_name   TEXT NOT NULL,
  inspection_type TEXT NOT NULL CHECK (inspection_type IN ('routine','triggered','post_incident','complaint_driven','random')),
  inspector_name  TEXT,
  scheduled_at    TEXT,
  conducted_at    TEXT,
  scope           TEXT,
  findings        TEXT,                              -- JSON list of findings with severity
  outcome         TEXT CHECK (outcome IN ('compliant','non_compliant_minor','non_compliant_material','enforcement_referral')),
  follow_up_due   TEXT,
  status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','conducted','reporting','closed','cancelled')),
  report_r2_key   TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reg_compliance_monitoring (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  licensee_id     TEXT,
  licensee_name   TEXT NOT NULL,
  monitoring_period TEXT NOT NULL,
  obligation_summary TEXT,
  compliance_score REAL,                              -- 0-100
  open_findings_count INTEGER DEFAULT 0,
  enforcement_actions_count INTEGER DEFAULT 0,
  risk_rating     TEXT CHECK (risk_rating IN ('low','medium','high','very_high')),
  last_reviewed_at TEXT,
  next_review_due TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reg_public_register (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('licensee','generator','distributor','trader','reseller','exempt_generator')),
  legal_name      TEXT NOT NULL,
  trading_name    TEXT,
  registration_no TEXT,
  jurisdiction    TEXT,
  licence_no      TEXT,
  capacity_mw     REAL,
  technology      TEXT,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','revoked','expired','dormant')),
  effective_from  TEXT,
  effective_to    TEXT,
  public_address  TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reg_complaints (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  complaint_ref   TEXT NOT NULL UNIQUE,
  complainant_name TEXT NOT NULL,
  complainant_contact TEXT,
  against_licensee TEXT NOT NULL,
  category        TEXT,                              -- 'tariff','service','metering','outage','safety','licensing'
  description     TEXT,
  received_at     TEXT NOT NULL,
  acknowledged_at TEXT,
  assigned_to     TEXT,
  resolution_due  TEXT,
  resolved_at     TEXT,
  outcome         TEXT,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','acknowledged','investigating','resolved','escalated','withdrawn')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reg_annual_reports (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  reporting_year  INTEGER NOT NULL UNIQUE,
  total_licensees INTEGER,
  licences_granted INTEGER DEFAULT 0,
  licences_refused INTEGER DEFAULT 0,
  determinations_issued INTEGER DEFAULT 0,
  consultations_completed INTEGER DEFAULT 0,
  complaints_received INTEGER DEFAULT 0,
  complaints_resolved INTEGER DEFAULT 0,
  inspections_conducted INTEGER DEFAULT 0,
  enforcement_actions INTEGER DEFAULT 0,
  document_r2_key TEXT,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','reviewed','published','tabled')),
  published_at    TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- TRADER — full commodity trading desk
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trader_risk_limits (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  limit_type      TEXT NOT NULL CHECK (limit_type IN ('var_1d','var_10d','position','net_open_volume','tenor','counterparty','sector','concentration','stop_loss')),
  dimension       TEXT,                              -- 'electricity_spot','solar_hours','counterparty_X'
  limit_zar       REAL,
  limit_units     REAL,
  current_zar     REAL DEFAULT 0,
  current_units   REAL DEFAULT 0,
  utilisation_pct REAL,
  breached_at     TEXT,
  approved_by     TEXT,
  expires_at      TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trader_var_calculations (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  as_of_date      TEXT NOT NULL,
  method          TEXT NOT NULL CHECK (method IN ('historical','parametric','monte_carlo')),
  horizon_days    INTEGER NOT NULL,
  confidence_pct  REAL NOT NULL,                     -- e.g. 95, 99
  var_zar         REAL NOT NULL,
  expected_shortfall_zar REAL,
  portfolio_value_zar REAL,
  -- Stress test
  stress_var_zar  REAL,
  stress_scenario TEXT,
  observation_window_days INTEGER,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trader_hedging_strategies (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  strategy_name   TEXT NOT NULL,
  strategy_type   TEXT NOT NULL CHECK (strategy_type IN ('forward_match','option_collar','swap','swaption','spread','calendar')),
  underlying_exposure_mwh REAL,
  hedge_ratio_pct REAL,
  cost_zar        REAL,
  expected_savings_zar REAL,
  effectiveness_pct REAL,
  start_date      TEXT,
  end_date        TEXT,
  status          TEXT DEFAULT 'proposed' CHECK (status IN ('proposed','approved','active','unwound','expired')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trader_options_positions (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  contract_type   TEXT NOT NULL CHECK (contract_type IN ('european_call','european_put','asian_call','asian_put','swap')),
  underlying      TEXT NOT NULL,                     -- 'electricity_spot','solar_hours','carbon'
  side            TEXT NOT NULL CHECK (side IN ('long','short')),
  strike_zar_per_mwh REAL,
  expiry_date     TEXT,
  volume_mwh      REAL,
  premium_zar     REAL,
  underlying_price_zar REAL,
  implied_vol_pct REAL,
  delta           REAL,
  gamma           REAL,
  vega            REAL,
  theta           REAL,
  mtm_zar         REAL,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','exercised','expired','closed','assigned')),
  counterparty    TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trader_t2_settlements (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  trade_id        TEXT,
  settlement_date TEXT NOT NULL,
  counterparty    TEXT,
  notional_zar    REAL,
  delivery_volume_mwh REAL,
  cash_leg_zar    REAL,
  physical_leg_mwh REAL,
  dvp_status      TEXT CHECK (dvp_status IN ('pending','matched','settled','failed','disputed')),
  fail_reason     TEXT,
  settled_at      TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trader_csa_terms (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  counterparty_id TEXT,
  counterparty_name TEXT NOT NULL,
  csa_version     TEXT,
  threshold_zar   REAL,
  independent_amount_zar REAL,
  minimum_transfer_zar REAL,
  eligible_collateral TEXT,                          -- JSON
  haircut_pct     REAL,
  rounding_zar    REAL,
  base_currency   TEXT DEFAULT 'ZAR',
  governing_law   TEXT,
  status          TEXT DEFAULT 'active' CHECK (status IN ('drafting','signed','active','suspended','terminated')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trader_pnl_attribution (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  as_of_date      TEXT NOT NULL,
  book            TEXT,                              -- 'spot','forward','options','reccs','carbon'
  -- P&L breakdown
  realised_pnl_zar REAL DEFAULT 0,
  unrealised_pnl_zar REAL DEFAULT 0,
  -- Greeks-driven (for options)
  delta_pnl_zar   REAL DEFAULT 0,
  gamma_pnl_zar   REAL DEFAULT 0,
  vega_pnl_zar    REAL DEFAULT 0,
  theta_pnl_zar   REAL DEFAULT 0,
  -- Other attribution
  carry_zar       REAL DEFAULT 0,
  fees_zar        REAL DEFAULT 0,
  fx_pnl_zar      REAL DEFAULT 0,
  total_pnl_zar   REAL,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pnl_part_date ON trader_pnl_attribution(participant_id, as_of_date);
