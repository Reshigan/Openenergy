-- ════════════════════════════════════════════════════════════════════════
-- 046 · IPP full project-lifecycle micro-tools
--
-- Closes the gaps from pre-development through decommissioning so an
-- IPP can plan a project, raise funds and operate it end-to-end on the
-- platform without leaving for separate tools.
--
--   PRE-DEVELOPMENT
--     ipp_site_assessments       site screening / shortlist
--     ipp_resource_campaigns     met-mast / pyranometer deployment
--     ipp_yield_estimates        P50 / P75 / P90 PVsyst / WindPRO outputs
--
--   DEVELOPMENT
--     ipp_financial_models       LCOE / IRR / NPV with sensitivity scenarios
--     ipp_tenders                EPC / O&M / civils RFQ issuance
--     ipp_tender_bidders         per-bidder evaluation scores
--     ipp_permits                EA / WUL / AEL / NERSA licence / SPLUMA
--     ipp_info_memorandums       lender DD packs
--     ipp_drawdown_requests      disbursement against facility
--
--   CONSTRUCTION → OPERATION
--     ipp_commissioning_tests    pre-COD checklist
--     ipp_nominations            day-ahead nominations to system operator
--     ipp_work_orders            O&M work-order management
--     ipp_spares_inventory       parts catalogue + stock levels
--     ipp_decommissioning_plans  end-of-life / repowering
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- Pre-development
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ipp_site_assessments (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  site_name       TEXT NOT NULL,
  lat             REAL,
  lng             REAL,
  province        TEXT,                              -- ZA province
  technology      TEXT,                              -- 'solar','wind','hybrid','bess'
  hectares        REAL,
  grid_distance_km REAL,                             -- to nearest connection point
  nearest_substation TEXT,
  substation_capacity_mw REAL,
  -- Solar-specific
  ghi_kwh_per_m2_yr REAL,                            -- Global Horizontal Irradiance
  dni_kwh_per_m2_yr REAL,                            -- Direct Normal Irradiance
  -- Wind-specific
  avg_wind_speed_ms REAL,                            -- at hub height
  wind_class      TEXT,                              -- IEC class I / II / III / IV
  -- Site rating
  capex_estimate_zar_per_mw REAL,
  preliminary_lcoe_zar_per_mwh REAL,
  go_decision     TEXT CHECK (go_decision IN ('go','no_go','hold','escalate')),
  rating_score    INTEGER CHECK (rating_score BETWEEN 1 AND 10),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_part ON ipp_site_assessments(participant_id, technology);

CREATE TABLE IF NOT EXISTS ipp_resource_campaigns (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  site_assessment_id TEXT,
  campaign_name   TEXT NOT NULL,
  campaign_type   TEXT NOT NULL CHECK (campaign_type IN (
                    'met_mast','pyranometer','lidar','sodar','reference_satellite'
                  )),
  start_date      TEXT NOT NULL,
  end_date        TEXT,
  installed_height_m REAL,                           -- met-mast hub height
  data_recovery_pct REAL,                            -- % data validity
  raw_data_r2_key TEXT,
  status          TEXT DEFAULT 'planning' CHECK (status IN ('planning','installed','collecting','analysing','complete','decommissioned')),
  vendor          TEXT,
  cost_zar        REAL,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ipp_yield_estimates (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  site_assessment_id TEXT,
  project_id      TEXT,
  estimate_round  INTEGER DEFAULT 1,                 -- preliminary / detailed / due-diligence
  capacity_mw     REAL NOT NULL,
  -- PVsyst / WindPRO outputs
  p50_gwh_yr      REAL NOT NULL,
  p75_gwh_yr      REAL,
  p90_gwh_yr      REAL,
  net_capacity_factor REAL,                          -- decimal e.g. 0.27
  -- Assumptions
  module_or_turbine TEXT,                            -- 'Trina 600W Vertex' or 'Vestas V162-7.2MW'
  inverter_or_converter TEXT,
  module_count    INTEGER,
  turbine_count   INTEGER,
  pr_or_availability REAL,                           -- performance ratio (PV) or availability (wind)
  losses_pct      REAL,
  long_term_correction_pct REAL,
  software        TEXT,                              -- 'PVsyst','WindPRO','OpenWind','GENESYS'
  software_version TEXT,
  report_r2_key   TEXT,
  status          TEXT DEFAULT 'preliminary' CHECK (status IN ('preliminary','detailed','dd_certified','final')),
  certified_by    TEXT,                              -- DNV / UL / Fichtner / Tractebel
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- Development
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ipp_financial_models (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  model_version   TEXT NOT NULL,                     -- 'v1.0','v1.1','TS_v1','CC_pack'
  yield_estimate_id TEXT REFERENCES ipp_yield_estimates(id),
  -- Inputs
  capacity_mw     REAL NOT NULL,
  capex_zar       REAL NOT NULL,
  opex_zar_yr     REAL,
  ppa_tariff_zar_mwh REAL,
  tariff_escalation_pct REAL DEFAULT 0,              -- annual
  operating_life_yrs INTEGER DEFAULT 25,
  debt_ratio_pct  REAL DEFAULT 70,
  debt_tenor_yrs  REAL,
  interest_rate_pct REAL,
  tax_rate_pct    REAL DEFAULT 27,                   -- SA corporate tax
  -- Outputs (computed)
  lcoe_zar_per_mwh REAL,                             -- levelised cost of energy
  project_irr_pct REAL,
  equity_irr_pct  REAL,
  npv_zar         REAL,
  payback_years   REAL,
  min_dscr        REAL,
  avg_dscr        REAL,
  scenario_set_json TEXT,                            -- JSON: array of sensitivity scenarios with shifted inputs/outputs
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved','dd_certified','archived')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ipp_tenders (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  tender_name     TEXT NOT NULL,
  tender_type     TEXT NOT NULL CHECK (tender_type IN ('epc','om','civils','grid_connection','module_supply','turbine_supply','transformer','bess','professional_services')),
  scope           TEXT,
  issued_at       TEXT,
  closing_at      TEXT,
  expected_award_zar REAL,
  evaluation_criteria TEXT,                          -- JSON
  status          TEXT DEFAULT 'drafting' CHECK (status IN ('drafting','issued','clarifications','evaluation','award','cancelled')),
  awarded_to      TEXT,                              -- bidder id or name
  awarded_amount_zar REAL,
  awarded_at      TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ipp_tender_bidders (
  id              TEXT PRIMARY KEY,
  tender_id       TEXT NOT NULL REFERENCES ipp_tenders(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  bidder_name     TEXT NOT NULL,
  contractor_id   TEXT,                              -- joins epc_contractors(id)
  bid_amount_zar  REAL,
  bid_tenor_years REAL,
  bid_warranties_years REAL,
  -- Evaluation matrix scores 0..100
  technical_score REAL,
  commercial_score REAL,
  bbbee_score     REAL,
  experience_score REAL,
  total_score     REAL,
  rank            INTEGER,
  status          TEXT DEFAULT 'submitted' CHECK (status IN ('invited','submitted','clarifying','shortlisted','rejected','withdrawn','awarded')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ipp_permits (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  permit_type     TEXT NOT NULL CHECK (permit_type IN (
                    'environmental_authorisation','water_use_licence',
                    'air_emissions_licence','nersa_generation_licence',
                    'nersa_distribution_licence','spluma_consent',
                    'heritage_authorisation','aviation_clearance','sabs_certificate',
                    'building_plan','occupational_health_safety','waste_management'
                  )),
  application_no  TEXT,
  authority       TEXT,                              -- 'DFFE','DWS','NERSA','SACAA','SANRAL','Local Municipality'
  applied_at      TEXT,
  expected_decision_at TEXT,
  decided_at      TEXT,
  outcome         TEXT CHECK (outcome IN ('pending','granted','granted_with_conditions','refused','appealed','withdrawn','expired')),
  conditions      TEXT,
  valid_from      TEXT,
  valid_to        TEXT,
  document_r2_key TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_permits_part ON ipp_permits(participant_id, outcome);

CREATE TABLE IF NOT EXISTS ipp_info_memorandums (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  im_version      TEXT NOT NULL,
  im_title        TEXT NOT NULL,
  -- Contents
  executive_summary TEXT,
  project_description TEXT,
  capacity_mw     REAL,
  capex_zar       REAL,
  funding_requested_zar REAL,
  ppa_summary     TEXT,
  yield_estimate_id TEXT REFERENCES ipp_yield_estimates(id),
  financial_model_id TEXT REFERENCES ipp_financial_models(id),
  -- Distribution
  prepared_by     TEXT,
  shared_with_lenders TEXT,                          -- JSON list of participant ids
  share_link_token TEXT,
  status          TEXT DEFAULT 'drafting' CHECK (status IN ('drafting','reviewed','released','withdrawn')),
  document_r2_key TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ipp_drawdown_requests (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  loan_id         TEXT,                              -- joins loan_originations(id) when available
  drawdown_no     INTEGER,
  requested_amount_zar REAL NOT NULL,
  purpose         TEXT,                              -- 'epc_milestone_5','io_phase_2','soft_costs'
  supporting_invoices_r2_key TEXT,
  ie_cert_id      TEXT,                              -- independent engineer cert ref
  requested_at    TEXT DEFAULT (datetime('now')),
  approved_amount_zar REAL,
  approved_at     TEXT,
  approved_by     TEXT,
  disbursed_amount_zar REAL,
  disbursed_at    TEXT,
  status          TEXT DEFAULT 'requested' CHECK (status IN ('requested','reviewing','approved','disbursed','partial','rejected','cancelled')),
  rejection_reason TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_dd_part ON ipp_drawdown_requests(participant_id, status, requested_at);

-- ────────────────────────────────────────────────────────────────────────
-- Construction → Operation
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ipp_commissioning_tests (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  test_phase      TEXT NOT NULL CHECK (test_phase IN ('hot','cold','sat','perf','reliability','grid_compliance','final_acceptance')),
  test_name       TEXT NOT NULL,
  test_code       TEXT,                              -- 'PT-001'
  scheduled_at    TEXT,
  executed_at     TEXT,
  witnesses       TEXT,
  pass_fail       TEXT CHECK (pass_fail IN ('pass','fail','partial','retest_required')),
  measured_value  REAL,
  target_value    REAL,
  unit            TEXT,
  evidence_r2_key TEXT,
  punch_list_items TEXT,                             -- JSON
  status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','complete','failed','rescheduled')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ipp_nominations (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  delivery_date   TEXT NOT NULL,
  nomination_type TEXT NOT NULL CHECK (nomination_type IN ('day_ahead','intra_day','operational','re_nomination')),
  submitted_at    TEXT DEFAULT (datetime('now')),
  -- Hourly volumes 0..23 stored as JSON to keep one row per nomination
  hourly_mwh_json TEXT NOT NULL,
  total_mwh       REAL,
  scheduled_at    TEXT,                              -- when grid operator confirmed
  acknowledged_by_so INTEGER DEFAULT 0,
  scheduling_reference TEXT,                         -- SO ref number
  curtailed_mwh   REAL DEFAULT 0,
  curtailment_reason TEXT,
  status          TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','acknowledged','scheduled','partial','curtailed','rejected','withdrawn')),
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_nom_part_date ON ipp_nominations(participant_id, delivery_date);

CREATE TABLE IF NOT EXISTS ipp_work_orders (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  wo_number       TEXT,
  wo_type         TEXT NOT NULL CHECK (wo_type IN ('preventive','corrective','breakdown','inspection','retrofit','calibration','warranty')),
  asset_id        TEXT,                              -- joins to ipp assets if available
  asset_descr     TEXT,
  failure_mode    TEXT,
  priority        TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical','outage')),
  scheduled_start TEXT,
  scheduled_end   TEXT,
  actual_start    TEXT,
  actual_end      TEXT,
  downtime_hours  REAL,
  energy_loss_mwh REAL,
  -- Resources
  labour_hours    REAL,
  labour_cost_zar REAL,
  parts_cost_zar  REAL,
  external_cost_zar REAL,
  total_cost_zar  REAL,
  technicians     TEXT,                              -- comma list
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','on_hold','complete','cancelled','invoiced')),
  root_cause      TEXT,
  corrective_action TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wo_part_status ON ipp_work_orders(participant_id, status, scheduled_start);

CREATE TABLE IF NOT EXISTS ipp_spares_inventory (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  part_number     TEXT,
  description     TEXT NOT NULL,
  manufacturer    TEXT,
  category        TEXT,                              -- 'inverter','transformer','module','blade','gearbox','sensor','consumable'
  location        TEXT,                              -- warehouse / site
  unit_of_measure TEXT,
  on_hand_qty     REAL DEFAULT 0,
  reorder_point   REAL,
  reorder_qty     REAL,
  unit_cost_zar   REAL,
  last_received_at TEXT,
  last_issued_at  TEXT,
  shelf_life_months INTEGER,
  warranty_until  TEXT,
  status          TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock','low_stock','out_of_stock','obsolete','on_order')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ipp_decommissioning_plans (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  plan_version    TEXT NOT NULL,
  -- Strategy
  strategy        TEXT NOT NULL CHECK (strategy IN ('decommission','repower','life_extension','sell','hand_back')),
  expected_eol_date TEXT,                            -- end-of-life
  estimated_decom_cost_zar REAL,
  decom_provision_zar REAL,                          -- amount already provisioned
  -- Residual values
  module_residual_zar REAL,
  steel_residual_zar REAL,
  inverter_residual_zar REAL,
  bess_residual_zar REAL,
  recycling_partner TEXT,
  rehab_obligations TEXT,
  status          TEXT DEFAULT 'planning' CHECK (status IN ('planning','approved','provisioned','in_execution','complete','superseded')),
  approved_by     TEXT,
  approved_at     TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
