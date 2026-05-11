-- ════════════════════════════════════════════════════════════════════════
-- 045 · Role completeness — make the platform the ONLY tool each role uses
--
-- Adds the daily/weekly workflow tables that a real user in each role
-- would otherwise reach for a separate tool to handle. Twenty-seven new
-- tables across seven roles.
--
--   IPP        EPC contractors, land leases, insurance policies,
--              community engagement, environmental compliance calendar
--   Offtaker   PPA marketplace listings, demand response programs/events,
--              bill validations
--   Lender     Loan origination, syndication participants, SLL KPIs,
--              default workouts
--   Carbon     CDR buffer pool, due diligence, permanence monitoring,
--              client retirement attribution
--   Grid       Connection queue, frequency response markets,
--              voltage management zones, network development plan
--   Regulator  Public consultations, hearings, determinations register,
--              license fees
--   Trader     Day-ahead vs intraday markets, block bids, pre-trade
--              checks, trade confirmations
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- IPP — developer workflow completeness
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS epc_contractors (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  contractor_name TEXT NOT NULL,
  registration_no TEXT,
  bbbee_level     INTEGER CHECK (bbbee_level BETWEEN 1 AND 8),
  technologies    TEXT,                              -- comma-list
  countries_served TEXT,
  rating          TEXT CHECK (rating IN ('approved','preferred','probation','blacklisted','withdrawn')),
  primary_contact TEXT,
  primary_email   TEXT,
  primary_phone   TEXT,
  bonds_capacity_zar REAL,                           -- performance-bond capacity
  insurance_capacity_zar REAL,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_epc_part ON epc_contractors(participant_id, rating);

CREATE TABLE IF NOT EXISTS land_leases (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,                              -- joins projects(id)
  property_description TEXT NOT NULL,
  erf_number      TEXT,
  title_deed      TEXT,
  landowner_name  TEXT,
  landowner_contact TEXT,
  hectares        REAL,
  zoning          TEXT,                              -- 'agricultural','industrial','mixed','consent_use'
  lease_start_date TEXT,
  lease_end_date  TEXT,
  rental_zar_per_yr REAL,
  escalation_pct  REAL,
  payment_frequency TEXT DEFAULT 'annual' CHECK (payment_frequency IN ('monthly','quarterly','semi_annual','annual')),
  status          TEXT DEFAULT 'option' CHECK (status IN ('option','signed','active','renewal_due','terminated','expired')),
  consent_use_secured INTEGER DEFAULT 0,             -- requires consent use under SPLUMA
  evidence_r2_key TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_land_part ON land_leases(participant_id, status);

-- Note: ipp-lifecycle migration 024 already created an `insurance_policies`
-- table that is project-scoped (REFERENCES ipp_projects(id)). This v2
-- table is participant-scoped to cover the developer's whole insurance
-- programme (operational + non-project policies like D&O, cyber, etc.).
CREATE TABLE IF NOT EXISTS insurance_policies_v2 (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  policy_type     TEXT NOT NULL CHECK (policy_type IN (
                    'construction_all_risk','operational_all_risk','marine_cargo',
                    'erection_all_risk','public_liability','professional_indemnity',
                    'business_interruption','delay_in_start_up','political_risk',
                    'cyber','directors_officers','environmental_impairment','warranty'
                  )),
  insurer_name    TEXT NOT NULL,
  broker_name     TEXT,
  policy_number   TEXT,
  sum_insured_zar REAL NOT NULL,
  premium_zar     REAL,
  deductible_zar  REAL,
  effective_from  TEXT NOT NULL,
  effective_to    TEXT NOT NULL,
  lender_endorsement INTEGER DEFAULT 0,              -- lender named on policy
  status          TEXT DEFAULT 'active' CHECK (status IN ('quote','bound','active','expired','cancelled','claim_open')),
  evidence_r2_key TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ins_part_status ON insurance_policies_v2(participant_id, status, effective_to);

-- Note: ipp-lifecycle migration 024 already has `community_engagements`
-- (project-scoped). This v2 is participant-scoped so a developer can
-- track engagements that span multiple projects or are pre-project.
CREATE TABLE IF NOT EXISTS community_engagements_v2 (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  engagement_type TEXT NOT NULL CHECK (engagement_type IN (
                    'open_day','consultation','community_trust_meeting','grievance',
                    'cosi_funding','sed_funding','ed_funding','jobs_event','training_event'
                  )),
  engagement_date TEXT NOT NULL,
  location        TEXT,
  attendees       INTEGER,
  topic           TEXT,
  outcome         TEXT,
  grievance_severity TEXT CHECK (grievance_severity IN ('minor','significant','material')),
  grievance_status TEXT CHECK (grievance_status IN ('logged','investigating','resolved','escalated')),
  evidence_r2_key TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_part ON community_engagements_v2(participant_id, engagement_date);

CREATE TABLE IF NOT EXISTS env_compliance_obligations (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT,
  obligation_type TEXT NOT NULL CHECK (obligation_type IN (
                    'ea_condition','ael_condition','wul_condition','noise',
                    'avifauna_monitoring','bats_monitoring','flora_monitoring',
                    'rehab','water_quality','dust','community_trust_distribution'
                  )),
  source_doc      TEXT,                              -- ROD or licence ref
  description     TEXT NOT NULL,
  due_date        TEXT,
  frequency       TEXT,                              -- 'annual','quarterly','monthly','event'
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','overdue','waived')),
  responsible_party TEXT,
  evidence_r2_key TEXT,
  closed_at       TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_env_oblig_part ON env_compliance_obligations(participant_id, status, due_date);

-- ────────────────────────────────────────────────────────────────────────
-- Offtaker — energy buyer workflow completeness
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ppa_marketplace_listings (
  id              TEXT PRIMARY KEY,
  seller_id       TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  listing_type    TEXT NOT NULL CHECK (listing_type IN ('sell','buy')),
  technology      TEXT NOT NULL,                     -- 'solar','wind','hybrid','bess','gas'
  capacity_mw     REAL NOT NULL,
  expected_p50_gwh_yr REAL,
  ppa_term_years  INTEGER NOT NULL,
  price_zar_per_mwh REAL,
  price_floor_zar REAL,
  price_ceiling_zar REAL,
  delivery_point  TEXT,
  delivery_grid_zone TEXT,
  start_date      TEXT,
  green_attributes TEXT,                             -- 'rec_bundled','rec_stripped','24_7_cfe'
  status          TEXT DEFAULT 'listed' CHECK (status IN ('listed','negotiating','signed','withdrawn','expired')),
  description     TEXT,
  evidence_r2_key TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ppa_market ON ppa_marketplace_listings(status, technology, capacity_mw);

CREATE TABLE IF NOT EXISTS ppa_marketplace_offers (
  id              TEXT PRIMARY KEY,
  listing_id      TEXT NOT NULL REFERENCES ppa_marketplace_listings(id),
  bidder_id       TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  offered_price_zar_per_mwh REAL NOT NULL,
  offered_volume_gwh_yr REAL NOT NULL,
  offered_term_years INTEGER,
  conditions      TEXT,
  status          TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','shortlisted','accepted','rejected','withdrawn')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS demand_response_programs (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  program_name    TEXT NOT NULL,
  program_type    TEXT NOT NULL CHECK (program_type IN ('iol','dispatchable_load','vpp','peak_clipping','tou_arbitrage')),
  baseline_load_mw REAL NOT NULL,
  reducible_load_mw REAL NOT NULL,
  notice_period_minutes INTEGER,
  recovery_period_minutes INTEGER,
  compensation_zar_per_mwh REAL,
  max_events_per_month INTEGER,
  status          TEXT DEFAULT 'enrolled' CHECK (status IN ('draft','enrolled','active','suspended','terminated')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS demand_response_events (
  id              TEXT PRIMARY KEY,
  program_id      TEXT NOT NULL REFERENCES demand_response_programs(id),
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  event_start     TEXT NOT NULL,
  event_end       TEXT NOT NULL,
  called_load_mw  REAL,
  delivered_load_mw REAL,
  compensation_zar REAL,
  performance_pct REAL,                              -- (delivered / called) * 100
  status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','called','responding','delivered','missed','cancelled')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dr_events_prog ON demand_response_events(program_id, event_start);

CREATE TABLE IF NOT EXISTS utility_bill_validations (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  supplier        TEXT NOT NULL,                     -- 'Eskom','City of CT','City of JHB','City Power','eThekwini'
  account_number  TEXT,
  reading_month   TEXT NOT NULL,                     -- YYYY-MM
  billed_kwh      REAL,
  billed_amount_zar REAL,
  metered_kwh     REAL,                              -- from metering_readings
  expected_amount_zar REAL,                          -- computed from tariff schedule
  variance_kwh    REAL,
  variance_zar    REAL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','validated','dispute_raised','reconciled','paid')),
  dispute_reference TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bill_val_part ON utility_bill_validations(participant_id, reading_month);

-- ────────────────────────────────────────────────────────────────────────
-- Lender — loan origination + syndication + SLL completeness
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS loan_originations (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),  -- the lender
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  borrower_id     TEXT REFERENCES participants(id),           -- internal demo borrower or NULL for external
  borrower_name   TEXT NOT NULL,
  project_id      TEXT,
  facility_type   TEXT NOT NULL CHECK (facility_type IN (
                    'term_loan','revolving','syndicated','bridge','mezzanine',
                    'green_bond','sustainability_linked','vendor_finance'
                  )),
  proposed_amount_zar REAL NOT NULL,
  proposed_tenor_years REAL,
  proposed_margin_bps INTEGER,
  reference_rate  TEXT,                              -- 'JIBAR','PRIME','SOFR'
  stage           TEXT DEFAULT 'pipeline' CHECK (stage IN (
                    'pipeline','origination','term_sheet','credit_committee',
                    'documentation','signing','financial_close','disbursed','withdrawn','declined'
                  )),
  credit_committee_date TEXT,
  credit_committee_outcome TEXT CHECK (credit_committee_outcome IN ('approved','approved_with_conditions','deferred','declined')),
  conditions_precedent TEXT,                         -- JSON list
  expected_close_date TEXT,
  actual_close_date TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_origin_part ON loan_originations(participant_id, stage);

CREATE TABLE IF NOT EXISTS syndication_participants (
  id              TEXT PRIMARY KEY,
  loan_id         TEXT NOT NULL REFERENCES loan_originations(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  participant_lender_id TEXT,                        -- joins participants(id) for internal lender; nullable for external
  participant_name TEXT NOT NULL,
  commitment_zar  REAL NOT NULL,
  participation_pct REAL,
  role            TEXT CHECK (role IN ('mlp','arranger','underwriter','participant','agent','security_trustee')),
  status          TEXT DEFAULT 'invited' CHECK (status IN ('invited','indicated','committed','documented','funded','withdrew')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sll_kpis (
  id              TEXT PRIMARY KEY,
  loan_id         TEXT REFERENCES loan_originations(id),
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  kpi_name        TEXT NOT NULL,
  kpi_type        TEXT NOT NULL CHECK (kpi_type IN ('emissions_intensity','renewable_pct','sbti_target','water_intensity','safety_ltifr','bbbee_level','jobs_created','custom')),
  baseline_value  REAL,
  target_value    REAL NOT NULL,
  observation_period TEXT NOT NULL,                  -- 'annual','semi_annual'
  margin_step_up_bps INTEGER DEFAULT 0,              -- penalty for missing
  margin_step_down_bps INTEGER DEFAULT 0,            -- reward for meeting
  current_value   REAL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','met','missed','assured','restated')),
  reporting_year  INTEGER,
  assured_by      TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loan_workouts (
  id              TEXT PRIMARY KEY,
  loan_id         TEXT NOT NULL REFERENCES loan_originations(id),
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  workout_type    TEXT NOT NULL CHECK (workout_type IN (
                    'standstill','reschedule','restructure','enforcement','write_down','dpo'
                  )),
  opened_at       TEXT DEFAULT (datetime('now')),
  closed_at       TEXT,
  trigger_event   TEXT,                              -- 'dscr_breach','payment_default','covenant_breach','ea_breach','restructuring_pending'
  exposure_at_default_zar REAL,
  expected_recovery_zar REAL,
  loss_given_default_pct REAL,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','negotiating','agreed','executed','closed','litigation')),
  legal_counsel   TEXT,
  notes           TEXT
);

-- ────────────────────────────────────────────────────────────────────────
-- Carbon Fund — buffer pool, DD, permanence, client attribution
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cdr_buffer_pool (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT NOT NULL REFERENCES cdr_projects(id),
  total_contributed_tco2e REAL NOT NULL,
  reserved_tco2e  REAL DEFAULT 0,
  released_tco2e  REAL DEFAULT 0,
  buffer_pct      REAL NOT NULL,                     -- typically 10-30% of project lifetime credits
  release_schedule TEXT,                              -- JSON: when buffer releases back
  reason          TEXT,                              -- 'reversal_risk','permanence_risk','baseline_uncertainty'
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','released','liquidated','retired_for_reversal')),
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cdr_due_diligence (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  project_id      TEXT NOT NULL REFERENCES cdr_projects(id),
  dd_step         TEXT NOT NULL CHECK (dd_step IN (
                    'technical_review','methodology_review','additionality_test',
                    'leakage_assessment','permanence_assessment','baseline_validation',
                    'site_visit','financial_review','legal_review','co_benefits',
                    'mrv_review','registry_check'
                  )),
  reviewer        TEXT,
  outcome         TEXT CHECK (outcome IN ('pass','conditional','fail','withdrawn')),
  conditions      TEXT,
  rating_score    INTEGER CHECK (rating_score BETWEEN 1 AND 10),
  evidence_r2_key TEXT,
  completed_at    TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permanence_monitoring (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES cdr_projects(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  observation_date TEXT NOT NULL,
  reporting_year  INTEGER NOT NULL,
  stored_tco2e    REAL NOT NULL,
  reversal_tco2e  REAL DEFAULT 0,
  reversal_cause  TEXT,                              -- 'fire','disease','natural','intentional','measurement_revision'
  monitoring_method TEXT,                            -- 'satellite','field_survey','sensors','self_reported'
  attestation     TEXT,
  evidence_r2_key TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cdr_client_attribution (
  id              TEXT PRIMARY KEY,
  fund_participant_id TEXT NOT NULL REFERENCES participants(id),  -- the carbon fund
  client_participant_id TEXT,                                       -- internal client; nullable for external
  client_name     TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  retirement_id   TEXT NOT NULL REFERENCES cdr_retirements(id),
  attributed_tco2e REAL NOT NULL,
  reporting_year  INTEGER NOT NULL,
  proof_of_offset_url TEXT,                          -- public attestation URL
  share_token     TEXT,                              -- client portal token
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- Grid Operator — connection queue, FCR/FRR/RR, voltage, network plan
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connection_queue (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),  -- the grid operator
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  applicant_name  TEXT NOT NULL,
  applicant_participant_id TEXT,
  application_no  TEXT,
  project_name    TEXT,
  capacity_mw     REAL NOT NULL,
  technology      TEXT,
  request_voltage_kv REAL,
  connection_point TEXT,
  grid_zone       TEXT,
  queue_position  INTEGER,
  request_date    TEXT NOT NULL,
  budget_quote_zar REAL,
  cua_signed_at   TEXT,                              -- Connection Use of System Agreement
  status          TEXT DEFAULT 'in_queue' CHECK (status IN (
                    'submitted','study_in_progress','budget_quote','cua_offer',
                    'cua_signed','in_construction','energised','withdrawn','rejected'
                  )),
  expected_energised TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cq_part_status ON connection_queue(participant_id, status, queue_position);

CREATE TABLE IF NOT EXISTS frequency_response_markets (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  market_type     TEXT NOT NULL CHECK (market_type IN ('FCR','FRR_a','FRR_m','RR','synthetic_inertia','black_start')),
  product_window_start TEXT NOT NULL,
  product_window_end TEXT NOT NULL,
  required_mw     REAL NOT NULL,
  procured_mw     REAL DEFAULT 0,
  clearing_price_zar_per_mw_per_h REAL,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','clearing','cleared','settled','cancelled')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS frequency_response_offers (
  id              TEXT PRIMARY KEY,
  market_id       TEXT NOT NULL REFERENCES frequency_response_markets(id),
  bidder_id       TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  offered_mw      REAL NOT NULL,
  offered_price_zar_per_mw_per_h REAL NOT NULL,
  award_mw        REAL DEFAULT 0,
  status          TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','partial','rejected','withdrawn')),
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS voltage_management_zones (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  zone_name       TEXT NOT NULL UNIQUE,
  voltage_level_kv REAL NOT NULL,
  target_voltage_pu REAL DEFAULT 1.0,
  band_low_pu     REAL DEFAULT 0.95,
  band_high_pu    REAL DEFAULT 1.05,
  current_voltage_pu REAL,
  reactive_capability_mvar REAL,
  status          TEXT DEFAULT 'normal' CHECK (status IN ('normal','warn','breach','outage')),
  last_observed_at TEXT,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS network_development_items (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  item_name       TEXT NOT NULL,
  item_type       TEXT CHECK (item_type IN ('new_substation','line_upgrade','new_corridor','reactive_compensation','battery_storage','automation')),
  voltage_kv      REAL,
  estimated_capex_zar REAL,
  expected_inservice TEXT,
  driver          TEXT,                              -- 'growth','reliability','curtailment','renewables','reactive'
  priority        TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status          TEXT DEFAULT 'planned' CHECK (status IN ('study','planned','approved','construction','commissioned','cancelled')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- Regulator — public consultation, hearings, determinations, fees
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public_consultations (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  consultation_ref TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  scope           TEXT,                              -- 'tariff','licence','code','rule','policy'
  reference_doc_r2_key TEXT,
  opened_at       TEXT NOT NULL,
  closed_at       TEXT,
  status          TEXT DEFAULT 'open' CHECK (status IN ('draft','open','closed','consolidated','published')),
  written_comments_count INTEGER DEFAULT 0,
  hearings_held   INTEGER DEFAULT 0,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS public_comments (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES public_consultations(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  commenter_name  TEXT NOT NULL,
  commenter_org   TEXT,
  commenter_email TEXT,
  is_anonymous    INTEGER DEFAULT 0,
  comment_text    TEXT,
  attachment_r2_key TEXT,
  category        TEXT,                              -- 'oppose','support','technical','clarification'
  consolidated_into TEXT,                            -- a determination id if folded
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS public_hearings (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT REFERENCES public_consultations(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  hearing_date    TEXT NOT NULL,
  venue           TEXT,
  panel_chair     TEXT,
  status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','held','postponed','cancelled')),
  transcript_r2_key TEXT,
  attendee_count  INTEGER,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS determinations_register (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  consultation_id TEXT REFERENCES public_consultations(id),
  determination_ref TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  category        TEXT,                              -- 'tariff','licence','enforcement','code_amendment'
  affected_parties TEXT,
  decision_date   TEXT,
  effective_from  TEXT,
  expires_at      TEXT,
  document_r2_key TEXT,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','appealed','superseded','revoked')),
  appealed_at     TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS license_fees_register (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  licensee_id     TEXT REFERENCES participants(id),
  licensee_name   TEXT NOT NULL,
  license_category TEXT NOT NULL,                    -- 'generation','distribution','trading','transmission','reseller'
  capacity_mw     REAL,
  fee_year        INTEGER NOT NULL,
  fee_zar         REAL NOT NULL,
  paid_at         TEXT,
  status          TEXT DEFAULT 'invoiced' CHECK (status IN ('invoiced','paid','overdue','waived','in_dispute')),
  invoice_ref     TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- Trader — day-ahead vs intraday, block bids, pre-trade checks, T+0 affirmation
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS day_ahead_blocks (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  delivery_date   TEXT NOT NULL,
  block_type      TEXT NOT NULL CHECK (block_type IN ('base','peak','off_peak','super_peak','solar_hours','wind_hours')),
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  volume_mwh      REAL NOT NULL,
  price_zar_per_mwh REAL NOT NULL,
  energy_type     TEXT,
  status          TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','cleared','rejected','withdrawn','partial')),
  cleared_volume_mwh REAL,
  cleared_price_zar REAL,
  cleared_at      TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_da_part_delivery ON day_ahead_blocks(participant_id, delivery_date);

CREATE TABLE IF NOT EXISTS intraday_orders (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  delivery_hour   TEXT NOT NULL,                     -- ISO datetime, hour-truncated
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  volume_mwh      REAL NOT NULL,
  limit_price_zar REAL NOT NULL,
  energy_type     TEXT,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','filled','partial','cancelled','expired')),
  filled_volume_mwh REAL DEFAULT 0,
  vwap_zar        REAL,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pre_trade_checks (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  intent_type     TEXT NOT NULL CHECK (intent_type IN ('order','block_bid','intraday','rec','carbon')),
  intent_payload  TEXT NOT NULL,                     -- JSON of proposed order
  outcome         TEXT NOT NULL CHECK (outcome IN ('allow','block','warn')),
  failed_checks   TEXT,                              -- JSON list of breached checks
  credit_used_pre REAL,
  credit_used_post REAL,
  credit_limit    REAL,
  checked_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trade_confirmations (
  id              TEXT PRIMARY KEY,
  trade_id        TEXT NOT NULL,                     -- joins trade_fills(id)
  participant_id  TEXT NOT NULL,
  counterparty_id TEXT,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  affirmation_status TEXT DEFAULT 'pending' CHECK (affirmation_status IN ('pending','affirmed','disputed','novated','cancelled')),
  affirmed_at     TEXT,
  dispute_reason  TEXT,
  novation_to     TEXT,                              -- new counterparty
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_conf_part ON trade_confirmations(participant_id, affirmation_status);
