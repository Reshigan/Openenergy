-- ---------------------------------------------------------------------------
-- OPEN ENERGY PLATFORM - DOMAIN SCHEMA
-- Migration 002: Carbon, IPP, ESG, Grid, Ona, Procurement, DealRoom, Funds, Vault
-- ---------------------------------------------------------------------------

-- ---- CARBON MARKET ----
CREATE TABLE IF NOT EXISTS carbon_projects (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  project_number TEXT UNIQUE NOT NULL,
  project_type TEXT NOT NULL,
  methodology TEXT NOT NULL,
  host_country TEXT NOT NULL,
  developer_id TEXT NOT NULL REFERENCES participants(id),
  credits_issued REAL DEFAULT 0,
  credits_available REAL DEFAULT 0,
  credits_retired REAL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','verified','suspended','expired')),
  registration_date TEXT,
  verification_date TEXT,
  expiry_date TEXT,
  registry_link TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_trades (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES participants(id),
  seller_id TEXT NOT NULL REFERENCES participants(id),
  project_id TEXT NOT NULL REFERENCES carbon_projects(id),
  credit_type TEXT NOT NULL CHECK (credit_type IN ('CER','VER','EUA','SAEA')),
  volume_tco2 REAL NOT NULL,
  price_per_tco2 REAL NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'pending' CHECK (status IN ('matched','settled','cancelled')),
  certificate_reference TEXT,
  vintage_year INTEGER,
  settlement_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_holdings (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  project_id TEXT NOT NULL REFERENCES carbon_projects(id),
  credit_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  vintage_year INTEGER,
  acquisition_date TEXT,
  cost_basis REAL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available','reserved','retired')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_retirements (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  project_id TEXT NOT NULL REFERENCES carbon_projects(id),
  quantity REAL NOT NULL,
  retirement_reason TEXT,
  certificate_number TEXT,
  beneficiary_name TEXT,
  beneficiary_country TEXT,
  retirement_date TEXT,
  created_by TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_options (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES participants(id),
  project_id TEXT NOT NULL REFERENCES carbon_projects(id),
  option_type TEXT NOT NULL CHECK (option_type IN ('call','put')),
  strike_price REAL NOT NULL,
  volume_tco2 REAL NOT NULL,
  expiry_date TEXT NOT NULL,
  premium_per_tco2 REAL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','exercised','expired','cancelled')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_fund_nav (
  id TEXT PRIMARY KEY,
  fund_id TEXT NOT NULL REFERENCES participants(id),
  nav_date TEXT NOT NULL,
  total_units REAL NOT NULL,
  nav_per_unit REAL NOT NULL,
  assets_under_management REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- IPP / PROJECT FINANCE ----
CREATE TABLE IF NOT EXISTS ipp_projects (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  developer_id TEXT NOT NULL REFERENCES participants(id),
  structure_type TEXT NOT NULL CHECK (structure_type IN ('build_operate_transfer','build_own_operate','private_wire','direct_agreement')),
  technology TEXT NOT NULL,
  capacity_mw REAL NOT NULL,
  location TEXT NOT NULL,
  coordinates TEXT,
  grid_connection_point TEXT,
  interconnection_capacity_mw REAL,
  status TEXT DEFAULT 'development' CHECK (status IN ('development','construction','commissioning','commercial_operations','decommissioned')),
  construction_start_date TEXT,
  commercial_operation_date TEXT,
  expiry_date TEXT,
  ppa_volume_mwh REAL,
  ppa_price_per_mwh REAL,
  ppa_duration_years INTEGER,
  renewable_energy_certificate_eligible INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  milestone_name TEXT NOT NULL,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN ('financial_close','construction_start','construction_complete','commissioning','cod','operational','termination')),
  order_index INTEGER NOT NULL,
  target_date TEXT NOT NULL,
  satisfied_date TEXT,
  evidence_keys TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','satisfied','waived','failed')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_disbursements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  disbursement_number TEXT UNIQUE NOT NULL,
  tranche TEXT NOT NULL,
  requested_amount REAL NOT NULL,
  approved_amount REAL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested','ie_review','ie_approved','lender_review','lender_approved','disbursed','cancelled')),
  requested_by TEXT NOT NULL REFERENCES participants(id),
  requested_at TEXT DEFAULT (datetime('now')),
  ie_reviewer_id TEXT,
  ie_reviewed_at TEXT,
  ie_approved INTEGER DEFAULT 0,
  lender_reviewer_id TEXT,
  lender_reviewed_at TEXT,
  lender_approved INTEGER DEFAULT 0,
  disbursed_at TEXT,
  bank_reference TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_financials (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  equity_percentage REAL,
  debt_amount REAL,
  interest_rate REAL,
  tenor_years INTEGER,
  dsra_percentage REAL,
  projected_irr REAL,
  npv_usd REAL,
  debt_service_coverage_ratio REAL,
  loan_life_coverage_ratio REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_cp_readiness (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  cp_name TEXT NOT NULL,
  target_date TEXT NOT NULL,
  days_until_date INTEGER,
  status TEXT DEFAULT 'not_ready' CHECK (status IN ('not_ready','at_risk','on_track','achieved','waived')),
  readiness_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_generation (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  availability_percentage REAL,
  capacity_factor_percentage REAL,
  generation_mwh REAL,
  availability_adjustment REAL,
  efficiency_adjustment REAL,
  penalty_amount REAL,
  bonus_amount REAL,
  net_payment_due REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- ESG & SUSTAINABILITY ----
CREATE TABLE IF NOT EXISTS esg_metrics (
  id TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('environmental','social','governance')),
  unit TEXT NOT NULL,
  description TEXT,
  calculation_method TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS esg_data (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  metric_id TEXT NOT NULL REFERENCES esg_metrics(id),
  reporting_period TEXT NOT NULL,
  value REAL NOT NULL,
  quality_evidence TEXT,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS esg_reports (
  id TEXT PRIMARY KEY,
  report_title TEXT NOT NULL,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  reporting_year INTEGER NOT NULL,
  reporting_period TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','verified')),
  total_ghg_emissions_tco2e REAL,
  renewable_energy_percentage REAL,
  water_usage_m3 REAL,
  waste_recycled_percentage REAL,
  safety_incidents INTEGER,
  training_hours REAL,
  board_diversity_percentage REAL,
  transparency_score INTEGER,
  published_at TEXT,
  created_by TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS esg_reports_sections (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES esg_reports(id),
  section_type TEXT NOT NULL CHECK (section_type IN ('tcfd','cdp','gri','jse_srl','king_iv','ai_narrative')),
  content TEXT,
  narrative_ai_generated TEXT,
  file_key TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS esg_decarbonisation_pathways (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  scope TEXT NOT NULL CHECK (scope IN ('scope1','scope2','scope3')),
  baseline_year INTEGER,
  baseline_emissions REAL,
  target_year INTEGER,
  target_reduction_percentage REAL,
  actions TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','achieved','superseded')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ---- GRID & METERING ----
CREATE TABLE IF NOT EXISTS grid_connections (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES ipp_projects(id),
  connection_point TEXT NOT NULL,
  voltage_kv REAL,
  export_capacity_mw REAL,
  import_capacity_mw REAL,
  meter_id TEXT,
  connected_date TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','disconnected')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grid_constraints (
  id TEXT PRIMARY KEY,
  constraint_type TEXT NOT NULL CHECK (constraint_type IN ('transmission','distribution','generation','demand')),
  location TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  available_capacity_mw REAL,
  affected_participants TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT DEFAULT 'forecast' CHECK (status IN ('forecast','active','resolved')),
  description TEXT,
  resolution_notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metering_readings (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES grid_connections(id),
  reading_date TEXT NOT NULL,
  export_kwh REAL,
  import_kwh REAL,
  peak_demand_kw REAL,
  power_factor REAL,
  reading_type TEXT DEFAULT 'actual' CHECK (reading_type IN ('actual','estimated','adjusted')),
  validated INTEGER DEFAULT 0,
  validated_by TEXT,
  validated_at TEXT,
  ona_ingested INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grid_wheeling_agreements (
  id TEXT PRIMARY KEY,
  host_participant_id TEXT NOT NULL REFERENCES participants(id),
  wheeling_participant_id TEXT NOT NULL REFERENCES participants(id),
  injection_point TEXT NOT NULL,
  offtake_point TEXT NOT NULL,
  capacity_mw REAL NOT NULL,
  energy_kwh REAL NOT NULL,
  wheeling_rate_per_kwh REAL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft','pending','active','suspended','terminated')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grid_imbalance (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  scheduled_kwh REAL,
  actual_kwh REAL,
  imbalance_kwh REAL,
  imbalance_rate REAL,
  imbalance_charge REAL,
  within_tolerance INTEGER DEFAULT 0,
  settled INTEGER DEFAULT 0,
  settled_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- ONA (Operational Nomination & Analysis) ----
CREATE TABLE IF NOT EXISTS ona_sites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  site_name TEXT NOT NULL,
  ona_site_id TEXT UNIQUE,
  latitude REAL,
  longitude REAL,
  capacity_mw REAL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance')),
  last_sync_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ona_forecasts (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES ona_sites(id),
  forecast_date TEXT NOT NULL,
  forecast_type TEXT NOT NULL CHECK (forecast_type IN ('day_ahead','intra_day','weekly','monthly')),
  generation_mwh REAL,
  availability_percentage REAL,
  confidence_percentage REAL,
  synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ona_faults (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES ona_sites(id),
  fault_code TEXT,
  fault_description TEXT,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_minutes INTEGER,
  generation_lost_mwh REAL,
  estimated_revenue_impact REAL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','escalated')),
  resolution TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ona_maintenance (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES ona_sites(id),
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('scheduled','unscheduled','inspection','upgrade')),
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_hours REAL,
  generation_impact_mwh REAL,
  description TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ona_nominations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES ona_sites(id),
  nomination_date TEXT NOT NULL,
  nominated_mwh REAL,
  available_capacity_mw REAL,
  forecast_mwh REAL,
  actual_mwh REAL,
  variance_mwh REAL,
  status TEXT DEFAULT 'nomination' CHECK (status IN ('nomination','confirmed','actual','disputed')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ---- PROCUREMENT & PIPELINE ----
CREATE TABLE IF NOT EXISTS procurement_rfps (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  rfp_reference TEXT UNIQUE,
  created_by TEXT NOT NULL REFERENCES participants(id),
  closing_date TEXT,
  evaluation_date TEXT,
  budget REAL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','evaluation','awarded','cancelled')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS procurement_bids (
  id TEXT PRIMARY KEY,
  rfp_id TEXT NOT NULL REFERENCES procurement_rfps(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  technical_proposal_key TEXT,
  commercial_proposal_key TEXT,
  bid_amount REAL,
  currency TEXT DEFAULT 'ZAR',
  score REAL,
  rank INTEGER,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','shortlisted','awarded','rejected')),
  submitted_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS procurement_awards (
  id TEXT PRIMARY KEY,
  rfp_id TEXT NOT NULL REFERENCES procurement_rfps(id),
  winning_bid_id TEXT NOT NULL REFERENCES procurement_bids(id),
  award_value REAL,
  currency TEXT DEFAULT 'ZAR',
  contract_id TEXT,
  awarded_at TEXT,
  awarded_by TEXT NOT NULL REFERENCES participants(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_deals (
  id TEXT PRIMARY KEY,
  deal_name TEXT NOT NULL,
  client_participant_id TEXT NOT NULL REFERENCES participants(id),
  deal_type TEXT,
  estimated_value REAL,
  currency TEXT DEFAULT 'ZAR',
  probability_percentage INTEGER,
  stage TEXT DEFAULT 'identification' CHECK (stage IN ('identification','qualification','proposal','negotiation','contracting','closed')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','won','lost','cancelled')),
  submission_deadline TEXT,
  award_date TEXT,
  contract_value REAL,
  created_by TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_activities (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES pipeline_deals(id),
  activity_type TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- DEAL ROOMS ----
CREATE TABLE IF NOT EXISTS deal_rooms (
  id TEXT PRIMARY KEY,
  deal_name TEXT NOT NULL,
  deal_type TEXT NOT NULL,
  target_amount REAL,
  currency TEXT DEFAULT 'ZAR',
  sector TEXT,
  stage TEXT DEFAULT 'sourcing' CHECK (stage IN ('sourcing','diligence','term_sheet','closing','funded','exited')),
  issuer_participant_id TEXT NOT NULL REFERENCES participants(id),
  target_irr_percentage REAL,
  min_investment REAL,
  term_sheet_key TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deal_room_terms (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  term_key TEXT NOT NULL,
  term_value TEXT NOT NULL,
  proposed_by TEXT NOT NULL REFERENCES participants(id),
  proposed_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','rejected','amended')),
  responded_by TEXT,
  responded_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS deal_room_investors (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  investor_participant_id TEXT NOT NULL REFERENCES participants(id),
  status TEXT DEFAULT 'interested' CHECK (status IN ('interested','diligence','committed','rejected')),
  interest_level TEXT,
  committed_amount REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deal_room_messages (
  id TEXT PRIMARY KEY,
  deal_room_id TEXT NOT NULL REFERENCES deal_rooms(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  message TEXT NOT NULL,
  attachments TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- FUND MANAGEMENT ----
CREATE TABLE IF NOT EXISTS energy_funds (
  id TEXT PRIMARY KEY,
  fund_name TEXT NOT NULL,
  fund_type TEXT NOT NULL,
  target_size REAL,
  currency TEXT DEFAULT 'ZAR',
  vintage_year INTEGER,
  tenure_years INTEGER,
  deployment_start_date TEXT,
  deployment_end_date TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','closed','liquidating')),
  total_commitments REAL DEFAULT 0,
  total_deployed REAL DEFAULT 0,
  total_distributions REAL DEFAULT 0,
  irr_percentage REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fund_commitments (
  id TEXT PRIMARY KEY,
  fund_id TEXT NOT NULL REFERENCES energy_funds(id),
  investor_participant_id TEXT NOT NULL REFERENCES participants(id),
  commitment_amount REAL NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  called_amount REAL DEFAULT 0,
  contributed_amount REAL DEFAULT 0,
  distributed_amount REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fund_investments (
  id TEXT PRIMARY KEY,
  fund_id TEXT NOT NULL REFERENCES energy_funds(id),
  project_id TEXT REFERENCES ipp_projects(id),
  investment_type TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  investment_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- VAULT (R2 Document Storage) ----
CREATE TABLE IF NOT EXISTS vault_files (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by TEXT NOT NULL REFERENCES participants(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- MARKETPLACE ----
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES participants(id),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('energy','capacity','carbon','equipment','service')),
  title TEXT NOT NULL,
  description TEXT,
  price REAL,
  price_unit TEXT,
  currency TEXT DEFAULT 'ZAR',
  volume_available REAL,
  volume_unit TEXT,
  delivery_start TEXT,
  delivery_end TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','pending','sold','withdrawn')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketplace_inquiries (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES marketplace_listings(id),
  buyer_id TEXT NOT NULL REFERENCES participants(id),
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','responded','accepted','rejected')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- POPIA / DATA MANAGEMENT ----
CREATE TABLE IF NOT EXISTS popia_data_requests (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('export','correction','erasure','objection','consent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected')),
  data_export_key TEXT,
  processed_at TEXT,
  processed_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS popia_consent_records (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  consent_type TEXT NOT NULL,
  granted INTEGER DEFAULT 1,
  consent_date TEXT,
  withdrawal_date TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---- BRIEFING ----
CREATE TABLE IF NOT EXISTS briefing_reports (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  report_date TEXT NOT NULL,
  market_summary TEXT,
  priorities TEXT,
  portfolio_positions TEXT,
  intelligence_summary TEXT,
  generated_at TEXT DEFAULT (datetime('now'))
);

-- Additional Indexes
CREATE INDEX IF NOT EXISTS idx_carbon_projects_developer ON carbon_projects(developer_id);
CREATE INDEX IF NOT EXISTS idx_carbon_projects_status ON carbon_projects(status);
CREATE INDEX IF NOT EXISTS idx_carbon_trades_buyer ON carbon_trades(buyer_id);
CREATE INDEX IF NOT EXISTS idx_carbon_trades_seller ON carbon_trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_carbon_holdings_participant ON carbon_holdings(participant_id);
CREATE INDEX IF NOT EXISTS idx_ipp_projects_developer ON ipp_projects(developer_id);
CREATE INDEX IF NOT EXISTS idx_ipp_projects_status ON ipp_projects(status);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_project_disbursements_project ON project_disbursements(project_id);
CREATE INDEX IF NOT EXISTS idx_project_cp_readiness_project ON project_cp_readiness(project_id);
CREATE INDEX IF NOT EXISTS idx_esg_data_participant ON esg_data(participant_id);
CREATE INDEX IF NOT EXISTS idx_esg_reports_participant ON esg_reports(participant_id);
CREATE INDEX IF NOT EXISTS idx_grid_connections_project ON grid_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_metering_readings_connection ON metering_readings(connection_id);
CREATE INDEX IF NOT EXISTS idx_ona_sites_project ON ona_sites(project_id);
CREATE INDEX IF NOT EXISTS idx_ona_faults_site ON ona_faults(site_id);
CREATE INDEX IF NOT EXISTS idx_ona_nominations_site ON ona_nominations(site_id);
CREATE INDEX IF NOT EXISTS idx_procurement_bids_rfp ON procurement_bids(rfp_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_deals_client ON pipeline_deals(client_participant_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_investors_room ON deal_room_investors(deal_room_id);
CREATE INDEX IF NOT EXISTS idx_fund_commitments_fund ON fund_commitments(fund_id);
CREATE INDEX IF NOT EXISTS idx_vault_files_entity ON vault_files(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller ON marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_popia_requests_participant ON popia_data_requests(participant_id);