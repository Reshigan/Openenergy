-- 021_grid_operator_suite.sql
-- Grid operator national-scale workstreams:
--   1. Grid connection applications (study → budget → agreement)
--   2. Dispatch scheduling & instructions to IPPs
--   3. Curtailment notices
--   4. Ancillary services markets (FCR, aFRR, mFRR, reserves, black start)
--   5. Loss factors & nodal zones for locational pricing
--   6. Outage management & restoration tracking (beyond ona_faults)
--
-- Statutory basis: Electricity Regulation Act 4 of 2006 (ERA 2006),
-- South African Grid Code (Network, System Operations, Metering, Tariff codes),
-- NERSA Grid Connection Code, Eskom Transmission Development Plan.

-- ─── Grid connection applications ──────────────────────────────────────────
-- Full lifecycle from first enquiry through budget quote, cost estimate
-- letter, grid connection agreement (GCA), commissioning.
CREATE TABLE IF NOT EXISTS grid_connection_applications (
  id TEXT PRIMARY KEY,
  application_number TEXT UNIQUE NOT NULL,
  applicant_participant_id TEXT NOT NULL REFERENCES participants(id),
  project_id TEXT REFERENCES ipp_projects(id),
  substation TEXT NOT NULL,
  voltage_kv REAL NOT NULL,
  requested_capacity_mw REAL NOT NULL,
  technology TEXT,
  connection_type TEXT NOT NULL CHECK (connection_type IN (
    'new_generator','capacity_increase','voltage_upgrade','new_consumer','relocation'
  )),
  status TEXT NOT NULL DEFAULT 'enquiry' CHECK (status IN (
    'enquiry','screening','grid_study','cost_estimate','budget_quote',
    'cost_letter_issued','cost_letter_accepted','gca_drafted','gca_signed',
    'construction','commissioning','energised','rejected','withdrawn'
  )),
  grid_study_fee_zar REAL,
  connection_cost_estimate_zar REAL,
  confirmed_capacity_mw REAL,
  target_energisation_date TEXT,
  actual_energisation_date TEXT,
  assigned_engineer_id TEXT REFERENCES participants(id),
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gca_applicant ON grid_connection_applications(applicant_participant_id);
CREATE INDEX IF NOT EXISTS idx_gca_status ON grid_connection_applications(status);
CREATE INDEX IF NOT EXISTS idx_gca_substation ON grid_connection_applications(substation);

CREATE TABLE IF NOT EXISTS grid_connection_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES grid_connection_applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  description TEXT,
  document_r2_key TEXT,
  actor_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gce_app ON grid_connection_events(application_id, event_date DESC);

-- ─── Dispatch scheduling ───────────────────────────────────────────────────
-- Day-ahead and intraday dispatch schedules produced by the system operator.
-- Each period (typically 30-min) has a cleared schedule per participant site.
CREATE TABLE IF NOT EXISTS dispatch_schedules (
  id TEXT PRIMARY KEY,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('day_ahead','intraday','real_time','balancing')),
  trading_day TEXT NOT NULL,        -- YYYY-MM-DD
  gate_closure_at TEXT NOT NULL,
  published_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cleared','cancelled')),
  total_scheduled_mwh REAL,
  published_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dispatch_sch_day ON dispatch_schedules(trading_day, schedule_type);

CREATE TABLE IF NOT EXISTS dispatch_schedule_periods (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES dispatch_schedules(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,       -- ISO datetime
  period_end TEXT NOT NULL,
  site_id TEXT,                     -- FK target depends on site model; kept loose
  participant_id TEXT REFERENCES participants(id),
  scheduled_mwh REAL NOT NULL,
  cleared_price_zar_mwh REAL,
  zone TEXT                         -- nodal_zones.code
);
CREATE INDEX IF NOT EXISTS idx_dsp_schedule ON dispatch_schedule_periods(schedule_id, period_start);
CREATE INDEX IF NOT EXISTS idx_dsp_participant ON dispatch_schedule_periods(participant_id, period_start);

-- Dispatch instructions sent to generators: curtailment, redispatch, ramp.
-- Generators must acknowledge; response time tracked for SLA & penalty.
CREATE TABLE IF NOT EXISTS dispatch_instructions (
  id TEXT PRIMARY KEY,
  instruction_number TEXT UNIQUE NOT NULL,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  site_id TEXT,
  instruction_type TEXT NOT NULL CHECK (instruction_type IN (
    'curtail','redispatch','ramp_up','ramp_down','start','stop','islanding','black_start'
  )),
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  target_mw REAL,
  reason TEXT NOT NULL,
  grid_constraint_id TEXT REFERENCES grid_constraints(id),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN (
    'issued','acknowledged','compliant','non_compliant','cancelled','expired'
  )),
  acknowledged_at TEXT,
  acknowledgement_by TEXT REFERENCES participants(id),
  compliance_evidence_r2_key TEXT,
  penalty_amount_zar REAL,
  issued_by TEXT REFERENCES participants(id)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_instr_participant ON dispatch_instructions(participant_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_instr_status ON dispatch_instructions(status);

-- ─── Curtailment notices ───────────────────────────────────────────────────
-- Bulk curtailment events (e.g., network contingency) grouping multiple
-- dispatch instructions under one parent notice for easier reporting.
CREATE TABLE IF NOT EXISTS curtailment_notices (
  id TEXT PRIMARY KEY,
  notice_number TEXT UNIQUE NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  affected_zone TEXT,
  reason TEXT NOT NULL,
  curtailment_mw REAL,
  severity TEXT CHECK (severity IN ('advisory','mandatory','emergency')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','lifted','cancelled')),
  lifted_at TEXT,
  issued_by TEXT REFERENCES participants(id)
);
CREATE INDEX IF NOT EXISTS idx_curt_notice_status ON curtailment_notices(status, issued_at DESC);

-- ─── Ancillary services markets ────────────────────────────────────────────
-- Service types: FCR (frequency containment), aFRR (automatic frequency
-- restoration), mFRR (manual frequency restoration), 10-min reserve, ramping
-- reserve, black-start capability, reactive power.
CREATE TABLE IF NOT EXISTS ancillary_service_products (
  id TEXT PRIMARY KEY,
  product_code TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN (
    'fcr','afrr','mfrr','reserve_10min','reserve_ramp','black_start','reactive_power','voltage_support'
  )),
  description TEXT,
  min_capacity_mw REAL DEFAULT 0,
  product_duration_hours REAL,      -- block length
  enabled BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO ancillary_service_products (id, product_code, product_name, service_type, description, min_capacity_mw, product_duration_hours) VALUES
  ('asp_fcr',    'FCR_4H',    'Frequency Containment Reserve (4h)', 'fcr',     'Primary frequency response, automatic via governor droop.', 1.0, 4),
  ('asp_afrr',   'aFRR_4H',   'Automatic FRR (4h)',                 'afrr',    'Secondary response, automatic via AGC.',                  5.0, 4),
  ('asp_mfrr',   'mFRR_15M',  'Manual FRR (15-min)',                'mfrr',    'Tertiary response, dispatched by operator.',              10.0, 0.25),
  ('asp_10min',  'RES_10MIN', '10-minute reserve',                  'reserve_10min','Standing reserve for contingency.',                 5.0, 1),
  ('asp_ramp',   'RAMP_RES',  'Ramping reserve',                    'reserve_ramp','Fast-ramping capability.',                            2.0, 1),
  ('asp_black',  'BLACK_START','Black start capability',            'black_start','Site capable of self-starting without grid supply.',  50.0, 0),
  ('asp_qvar',   'REACTIVE',  'Reactive power / voltage support',   'reactive_power','MVAr injection/absorption.',                       1.0, 1);

CREATE TABLE IF NOT EXISTS ancillary_service_tenders (
  id TEXT PRIMARY KEY,
  tender_number TEXT UNIQUE NOT NULL,
  product_id TEXT NOT NULL REFERENCES ancillary_service_products(id),
  delivery_window_start TEXT NOT NULL,
  delivery_window_end TEXT NOT NULL,
  capacity_required_mw REAL NOT NULL,
  ceiling_price_zar_mw_h REAL,
  gate_closure_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'draft','open','closed','evaluated','awarded','cancelled'
  )),
  notes TEXT,
  published_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_anc_tender_status ON ancillary_service_tenders(status);
CREATE INDEX IF NOT EXISTS idx_anc_tender_product ON ancillary_service_tenders(product_id);

CREATE TABLE IF NOT EXISTS ancillary_service_bids (
  id TEXT PRIMARY KEY,
  tender_id TEXT NOT NULL REFERENCES ancillary_service_tenders(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  capacity_offered_mw REAL NOT NULL,
  price_zar_mw_h REAL NOT NULL,
  site_id TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted','withdrawn','rejected','awarded_full','awarded_partial','lost'
  )),
  awarded_capacity_mw REAL,
  awarded_price_zar_mw_h REAL
);
CREATE INDEX IF NOT EXISTS idx_anc_bid_tender ON ancillary_service_bids(tender_id, price_zar_mw_h);
CREATE INDEX IF NOT EXISTS idx_anc_bid_participant ON ancillary_service_bids(participant_id);

CREATE TABLE IF NOT EXISTS ancillary_service_awards (
  id TEXT PRIMARY KEY,
  tender_id TEXT NOT NULL REFERENCES ancillary_service_tenders(id),
  bid_id TEXT NOT NULL REFERENCES ancillary_service_bids(id),
  awarded_capacity_mw REAL NOT NULL,
  clearing_price_zar_mw_h REAL NOT NULL,
  awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
  awarded_by TEXT REFERENCES participants(id)
);
CREATE INDEX IF NOT EXISTS idx_anc_award_tender ON ancillary_service_awards(tender_id);

-- Delivery performance — did the awarded capacity actually get provided?
CREATE TABLE IF NOT EXISTS ancillary_service_deliveries (
  id TEXT PRIMARY KEY,
  award_id TEXT NOT NULL REFERENCES ancillary_service_awards(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  contracted_mw REAL NOT NULL,
  delivered_mw REAL,
  availability_percentage REAL,
  penalty_zar REAL,
  settled BOOLEAN DEFAULT 0,
  settled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_anc_deliv_award ON ancillary_service_deliveries(award_id);

-- ─── Loss factors & nodal zones ────────────────────────────────────────────
-- Locational marginal pricing requires per-node loss factors. We model zones
-- (coarse) with monthly loss factors; node-level granularity can be added by
-- an overlay table later.
CREATE TABLE IF NOT EXISTS nodal_zones (
  code TEXT PRIMARY KEY,            -- e.g. 'ZA-GP-01', 'ZA-WC-02'
  name TEXT NOT NULL,
  region TEXT NOT NULL,             -- province
  voltage_class TEXT,               -- 'HV_400','HV_275','HV_132','MV'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS zone_loss_factors (
  id TEXT PRIMARY KEY,
  zone_code TEXT NOT NULL REFERENCES nodal_zones(code),
  effective_month TEXT NOT NULL,    -- YYYY-MM
  loss_factor_pct REAL NOT NULL,    -- e.g. 4.2 = 4.2%
  methodology TEXT,                 -- 'measured','forecast','average_system_loss'
  approved BOOLEAN DEFAULT 0,
  approved_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_zone_loss_lookup ON zone_loss_factors(zone_code, effective_month);

-- ─── Outage & restoration tracking ─────────────────────────────────────────
-- Bulk transmission / distribution outages affecting many customers. Distinct
-- from single-site ona_faults (which tracks the generator side).
CREATE TABLE IF NOT EXISTS grid_outages (
  id TEXT PRIMARY KEY,
  outage_number TEXT UNIQUE NOT NULL,
  outage_type TEXT NOT NULL CHECK (outage_type IN (
    'planned','unplanned','forced','emergency','load_shedding','maintenance'
  )),
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),
  reported_at TEXT NOT NULL,
  started_at TEXT,
  estimated_restoration_at TEXT,
  restored_at TEXT,
  affected_zone TEXT,
  affected_substations TEXT,        -- JSON array
  affected_customers INTEGER,
  affected_load_mw REAL,
  cause TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','investigating','in_progress','partial_restoration','restored','closed'
  )),
  commander_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_grid_outage_status ON grid_outages(status);
CREATE INDEX IF NOT EXISTS idx_grid_outage_reported ON grid_outages(reported_at DESC);

CREATE TABLE IF NOT EXISTS grid_outage_updates (
  id TEXT PRIMARY KEY,
  outage_id TEXT NOT NULL REFERENCES grid_outages(id) ON DELETE CASCADE,
  update_at TEXT NOT NULL DEFAULT (datetime('now')),
  update_text TEXT NOT NULL,
  affected_load_mw REAL,
  restored_load_mw REAL,
  posted_by TEXT REFERENCES participants(id)
);
CREATE INDEX IF NOT EXISTS idx_grid_outage_updates ON grid_outage_updates(outage_id, update_at DESC);
