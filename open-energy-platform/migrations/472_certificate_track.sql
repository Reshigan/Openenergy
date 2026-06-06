-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 472 — W226 Certificate Track Foundation
-- Track A: RECs (I-REC/zaRECs/SAREC), Track B: VCM (Gold Standard/Verra/Art6.4),
-- Track C: Carbon Tax Compliance, Certificate Bundle cross-track attestation
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE participants ADD COLUMN participant_market_access TEXT DEFAULT 'full_trading'
  CHECK(participant_market_access IN ('full_trading','certificate_only','read_only'));

CREATE TABLE IF NOT EXISTS oe_certificate_participants (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL UNIQUE,
  cert_track_enabled INTEGER DEFAULT 1,
  vcm_enabled INTEGER DEFAULT 0,
  rec_enabled INTEGER DEFAULT 1,
  carbon_tax_enabled INTEGER DEFAULT 0,
  onboarding_step TEXT DEFAULT 'welcome',
  onboarding_completed_at TEXT,
  subscription_tier TEXT DEFAULT 'free'
    CHECK(subscription_tier IN ('free','starter','standard','professional','enterprise')),
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Track A: REC devices ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oe_rec_devices (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  facility_name TEXT NOT NULL,
  technology TEXT NOT NULL CHECK(technology IN
    ('solar_pv','wind_onshore','wind_offshore','small_hydro','biomass','biogas','csp')),
  installed_capacity_kw REAL NOT NULL,
  commissioning_date TEXT NOT NULL,
  gps_lat REAL NOT NULL,
  gps_lng REAL NOT NULL,
  grid_connection_ref TEXT,
  nersa_licence_ref TEXT,
  reipppp_bid_ref TEXT,
  registry_standard TEXT NOT NULL CHECK(registry_standard IN ('i_rec','zarecs','sarec')),
  registry_device_id TEXT,
  chain_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(chain_status IN
      ('draft','submitted','issuer_review','queries','responded',
       'approved','registered','active','rejected','suspended')),
  registration_expiry TEXT,
  metering_arrangement TEXT CHECK(metering_arrangement IN
    ('utility_meter','scada','inverter_api','third_party_audited')),
  inverter_api_type TEXT CHECK(inverter_api_type IN
    ('solax','huawei_fusion','fronius','sma','solis','none')),
  inverter_api_credential_ref TEXT,
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_rec_metering_periods (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES oe_rec_devices(id),
  participant_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  gross_mwh REAL NOT NULL,
  net_mwh REAL NOT NULL,
  meter_source TEXT NOT NULL CHECK(meter_source IN
    ('utility_invoice','scada_export','inverter_api','manual_upload')),
  evidence_r2_key TEXT,
  fractional_carry_mwh REAL DEFAULT 0,
  chain_status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK(chain_status IN
      ('pending_verification','verified','submitted','issued','rejected')),
  verification_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_rec_issuance_requests (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES oe_rec_devices(id),
  participant_id TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  net_mwh REAL NOT NULL,
  certificates_requested INTEGER NOT NULL,
  registry_submission_ref TEXT,
  issuer_invoice_ref TEXT,
  fee_zar REAL,
  chain_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(chain_status IN
      ('draft','submitted_to_issuer','payment_pending','payment_confirmed',
       'processing','issued','rejected','cancelled')),
  issued_certificate_ids TEXT,
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_rec_holdings (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES oe_rec_devices(id),
  registry_standard TEXT NOT NULL,
  registry_cert_id TEXT NOT NULL UNIQUE,
  vintage_start TEXT NOT NULL,
  vintage_end TEXT NOT NULL,
  technology TEXT NOT NULL,
  quantity_mwh INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','transferred','retired','cancelled','expired')),
  acquisition_type TEXT CHECK(acquisition_type IN ('issued','purchased','transferred_in')),
  acquisition_zar REAL,
  transfer_ref TEXT,
  retirement_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_rec_retirements (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  beneficiary_name TEXT NOT NULL,
  beneficiary_purpose TEXT NOT NULL CHECK(beneficiary_purpose IN
    ('scope2_ghg_protocol','re100','sbti','cdp','iso14064','jse_esg','gbcsa_green_star','other')),
  registry_standard TEXT NOT NULL,
  total_mwh INTEGER NOT NULL,
  total_zar REAL,
  holding_ids TEXT NOT NULL,
  registry_redemption_statement_r2_key TEXT,
  registry_retirement_codes TEXT,
  retired_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Track B: VCM ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oe_vcm_projects (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  methodology TEXT NOT NULL CHECK(methodology IN
    ('acm0002','ams_i_d','gs4gg_re','vmr0017','gs4gg_poa','art64_a6_4','custom')),
  registry_standard TEXT NOT NULL CHECK(registry_standard IN
    ('verra_vcs','gold_standard','cdm_legacy','art64','dffe_domestic')),
  crediting_period_start TEXT,
  crediting_period_end TEXT,
  project_boundary_geojson TEXT,
  technology TEXT NOT NULL,
  installed_capacity_kw REAL,
  reipppp_bid_ref TEXT,
  nersa_licence_ref TEXT,
  dffe_ea_ref TEXT,
  dggef_tco2e_per_mwh REAL DEFAULT 0.942,
  sdg_targets TEXT,
  additionality_basis TEXT CHECK(additionality_basis IN
    ('investment_barrier','regulatory_surplus','common_practice','combined')),
  vvb_name TEXT,
  vvb_accreditation_ref TEXT,
  registry_project_id TEXT,
  chain_status TEXT NOT NULL DEFAULT 'conception'
    CHECK(chain_status IN
      ('conception','pdd_draft','pdd_ai_generated','stakeholder_consultation',
       'preliminary_review','validation_submitted','validation_complete',
       'registration','implementation','monitoring','verification_submitted',
       'credits_issued','active','cancelled')),
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_vcm_pdd_sections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES oe_vcm_projects(id),
  section_code TEXT NOT NULL,
  content_md TEXT NOT NULL,
  data_inputs TEXT,
  generated_by TEXT DEFAULT 'workers_ai',
  model_version TEXT,
  human_reviewed INTEGER DEFAULT 0,
  reviewer_id TEXT,
  reviewed_at TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_vcm_holdings (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES oe_vcm_projects(id),
  registry_standard TEXT NOT NULL,
  methodology TEXT NOT NULL,
  vintage_year INTEGER NOT NULL,
  serial_number_start TEXT,
  serial_number_end TEXT,
  quantity_tco2e REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','reserved','transferred','retired','cancelled','buffer_pool')),
  acquisition_type TEXT CHECK(acquisition_type IN
    ('issued','purchased_vcm','purchased_otc','transferred_in')),
  acquisition_price_zar REAL,
  acquisition_price_usd REAL,
  sylvera_rating TEXT,
  bezero_rating TEXT,
  carbon_tax_eligible INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_vcm_orders (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('bid','offer')),
  methodology TEXT NOT NULL,
  registry_standard TEXT NOT NULL,
  vintage_year INTEGER NOT NULL,
  quantity_tco2e REAL NOT NULL,
  min_lot_tco2e REAL DEFAULT 1.0,
  price_zar_per_tco2e REAL NOT NULL,
  carbon_tax_eligible INTEGER DEFAULT 0,
  expiry TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','partially_filled','filled','cancelled','expired')),
  filled_quantity_tco2e REAL DEFAULT 0,
  matched_trade_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_vcm_trades (
  id TEXT PRIMARY KEY,
  bid_order_id TEXT NOT NULL REFERENCES oe_vcm_orders(id),
  offer_order_id TEXT NOT NULL REFERENCES oe_vcm_orders(id),
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  methodology TEXT NOT NULL,
  registry_standard TEXT NOT NULL,
  vintage_year INTEGER NOT NULL,
  quantity_tco2e REAL NOT NULL,
  price_zar_per_tco2e REAL NOT NULL,
  total_zar REAL NOT NULL,
  platform_fee_zar REAL NOT NULL,
  settlement_date TEXT NOT NULL,
  registry_transfer_ref TEXT,
  carbon_tax_eligible INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'matched'
    CHECK(status IN
      ('matched','settlement_pending','registry_transfer','settled','disputed','failed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_vcm_market_data (
  id TEXT PRIMARY KEY,
  methodology TEXT NOT NULL,
  registry_standard TEXT NOT NULL,
  vintage_year INTEGER NOT NULL,
  vwap_30d_zar REAL,
  last_price_zar REAL,
  volume_30d_tco2e REAL,
  bid_count INTEGER DEFAULT 0,
  offer_count INTEGER DEFAULT 0,
  best_bid_zar REAL,
  best_offer_zar REAL,
  dggef REAL DEFAULT 0.942,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(methodology, registry_standard, vintage_year)
);

-- ── Track C: Carbon Tax ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oe_carbon_budget_registrations (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  facility_name TEXT NOT NULL,
  sector TEXT NOT NULL CHECK(sector IN
    ('electricity','mining','manufacturing','transport','construction','waste','agriculture','other')),
  annual_threshold_tco2e REAL NOT NULL,
  reporting_year INTEGER NOT NULL,
  scope1_combustion_tco2e REAL,
  scope1_fugitive_tco2e REAL,
  scope1_process_tco2e REAL,
  scope2_grid_tco2e REAL,
  total_gross_tco2e REAL,
  combustion_offset_allowance_pct REAL DEFAULT 15.0,
  fugitive_process_offset_allowance_pct REAL DEFAULT 10.0,
  max_offset_allowance_tco2e REAL,
  credits_applied_tco2e REAL DEFAULT 0,
  tax_liability_zar REAL,
  tax_after_offset_zar REAL,
  filing_deadline TEXT,
  chain_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(chain_status IN
      ('draft','data_entered','scope_calculated','allowance_computed','credits_selected',
       'coas_submitted','credits_retired','sars_prepared','efiling_ready',
       'sars_submitted','accepted','queried','responded','final','appeal')),
  cbt_account_ref TEXT,
  coas_retirement_refs TEXT,
  efiling_ready INTEGER DEFAULT 0,
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_carbon_budget_obligations (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES oe_carbon_budget_registrations(id),
  reporting_year INTEGER NOT NULL,
  obligation_type TEXT NOT NULL CHECK(obligation_type IN
    ('annual_return','quarterly_estimate','coas_submission','sars_payment',
     'cbam_report','dffe_ncs_update','audit_submission')),
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','in_progress','submitted','overdue','waived','completed')),
  days_overdue INTEGER DEFAULT 0,
  penalty_zar REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Certificate Bundle ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oe_certificate_bundles (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  bundle_type TEXT NOT NULL CHECK(bundle_type IN
    ('rec_only','vcm_only','carbon_tax_offset','rec_vcm_bundled','full_cert_bundle')),
  rec_holding_ids TEXT,
  vcm_holding_ids TEXT,
  carbon_budget_reg_id TEXT,
  scope3_disclosure_id TEXT,
  bundle_status TEXT NOT NULL DEFAULT 'assembling'
    CHECK(bundle_status IN
      ('assembling','validated','issued','applied','retired','expired','cancelled')),
  total_tco2e REAL DEFAULT 0,
  total_mwh_rec REAL DEFAULT 0,
  zar_value REAL,
  reporting_framework TEXT CHECK(reporting_framework IN
    ('ghg_protocol_scope2','re100','sbti','cdp','iso14064','jse_esg','tcfd','issb_ifrs_s2','gbcsa')),
  certificate_number TEXT UNIQUE,
  issued_at TEXT,
  expiry_date TEXT,
  pdf_r2_key TEXT,
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rec_devices_participant
  ON oe_rec_devices(participant_id, chain_status);
CREATE INDEX IF NOT EXISTS idx_rec_issuance_participant
  ON oe_rec_issuance_requests(participant_id, chain_status);
CREATE INDEX IF NOT EXISTS idx_rec_holdings_participant
  ON oe_rec_holdings(participant_id, status);
CREATE INDEX IF NOT EXISTS idx_vcm_projects_participant
  ON oe_vcm_projects(participant_id, chain_status);
CREATE INDEX IF NOT EXISTS idx_vcm_orders_open
  ON oe_vcm_orders(status, methodology, registry_standard, vintage_year);
CREATE INDEX IF NOT EXISTS idx_carbon_budget_participant
  ON oe_carbon_budget_registrations(participant_id, chain_status);
CREATE INDEX IF NOT EXISTS idx_cert_bundles_participant
  ON oe_certificate_bundles(participant_id, bundle_status);
