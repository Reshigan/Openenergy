-- 026_carbon_registry.sql
-- Carbon market national-scale extensions:
--   1. External registry integration (Verra, Gold Standard, SA Carbon Tax registry)
--   2. MRV (Measurement-Reporting-Verification) workflow with auditor role
--   3. Serial-number tracking per credit (vintage, tranche, serials issued → retired)
--   4. Carbon Tax Act s.13 offset allowance tracking
--
-- Statutory basis: Carbon Tax Act 15 of 2019 (ss. 12–14 allowances),
-- Regulations on Carbon Offset GNR 1556/2019,
-- DFFE GHG Inventory Annual Report.

-- ─── External registry config ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carbon_registries (
  id TEXT PRIMARY KEY,
  registry_code TEXT UNIQUE NOT NULL,
  registry_name TEXT NOT NULL,
  registry_type TEXT NOT NULL CHECK (registry_type IN (
    'voluntary','compliance','domestic'
  )),
  api_base_url TEXT,
  webhook_url TEXT,
  accepts_methodologies_json TEXT,
  sa_carbon_tax_eligible BOOLEAN DEFAULT 0,  -- per DFFE list 1
  enabled BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO carbon_registries (id, registry_code, registry_name, registry_type, sa_carbon_tax_eligible) VALUES
  ('creg_verra',  'VCS',    'Verified Carbon Standard (Verra)',  'voluntary',  1),
  ('creg_gs',     'GS',     'Gold Standard',                     'voluntary',  1),
  ('creg_cdm',    'CDM',    'Clean Development Mechanism',       'compliance', 1),
  ('creg_sacr',   'SA-REDD','SA Carbon Offset Registry (DFFE)',  'domestic',   1),
  ('creg_csa',    'CSA',    'Climate Action Reserve',            'voluntary',  0),
  ('creg_acr',    'ACR',    'American Carbon Registry',          'voluntary',  0);

-- Sync log so we can retry / debug registry API failures.
CREATE TABLE IF NOT EXISTS carbon_registry_sync_log (
  id TEXT PRIMARY KEY,
  registry_id TEXT NOT NULL REFERENCES carbon_registries(id),
  sync_type TEXT NOT NULL,                 -- 'project_metadata','credit_issuance','retirement_push'
  external_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','success','failed','retrying')),
  request_body TEXT,
  response_body TEXT,
  error_message TEXT,
  attempt INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_creg_sync_registry ON carbon_registry_sync_log(registry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creg_sync_status ON carbon_registry_sync_log(status);

-- ─── Credit vintages & serials ─────────────────────────────────────────────
-- A 'vintage' is a year of generation for a project. Each vintage issues
-- credits with contiguous serial numbers; retirements reference those serials.
CREATE TABLE IF NOT EXISTS credit_vintages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES carbon_projects(id),
  registry_id TEXT NOT NULL REFERENCES carbon_registries(id),
  vintage_year INTEGER NOT NULL,
  serial_prefix TEXT NOT NULL,
  serial_start INTEGER NOT NULL,
  serial_end INTEGER NOT NULL,
  credits_issued INTEGER NOT NULL,
  credits_retired INTEGER DEFAULT 0,
  methodology TEXT,
  issuance_date TEXT NOT NULL,
  sa_carbon_tax_eligible BOOLEAN DEFAULT 0,
  verification_id TEXT,                     -- ref to MRV verification
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, registry_id, vintage_year)
);
CREATE INDEX IF NOT EXISTS idx_vintages_project ON credit_vintages(project_id, vintage_year DESC);

-- Individual serial ranges owned by a participant. On transfer, the owner
-- changes; on retirement, rows flip to 'retired' and become immutable.
CREATE TABLE IF NOT EXISTS credit_serials (
  id TEXT PRIMARY KEY,
  vintage_id TEXT NOT NULL REFERENCES credit_vintages(id),
  owner_participant_id TEXT REFERENCES participants(id),
  serial_start INTEGER NOT NULL,
  serial_end INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','transferred','retired','cancelled')),
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  retired_at TEXT,
  retirement_ref TEXT REFERENCES carbon_retirements(id)
);
CREATE INDEX IF NOT EXISTS idx_serials_owner ON credit_serials(owner_participant_id, status);
CREATE INDEX IF NOT EXISTS idx_serials_vintage ON credit_serials(vintage_id);

-- ─── MRV (Measurement-Reporting-Verification) workflow ────────────────────
CREATE TABLE IF NOT EXISTS mrv_submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES carbon_projects(id),
  reporting_period_start TEXT NOT NULL,
  reporting_period_end TEXT NOT NULL,
  submitted_by TEXT REFERENCES participants(id),
  claimed_reductions_tco2e REAL NOT NULL,
  monitoring_methodology TEXT,
  monitoring_plan_r2_key TEXT,
  activity_data_r2_key TEXT,
  emission_factors_json TEXT,
  baseline_methodology TEXT,
  baseline_emissions_tco2e REAL,
  project_emissions_tco2e REAL,
  leakage_tco2e REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','submitted','validation','verified','rejected','issued'
  )),
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mrv_project ON mrv_submissions(project_id, reporting_period_start DESC);
CREATE INDEX IF NOT EXISTS idx_mrv_status ON mrv_submissions(status);

CREATE TABLE IF NOT EXISTS mrv_verifications (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES mrv_submissions(id),
  verifier_participant_id TEXT NOT NULL REFERENCES participants(id),
  verifier_accreditation TEXT,             -- 'ISO 14065','UNFCCC DOE','DFFE-accredited'
  site_visit_date TEXT,
  desk_review_date TEXT,
  verified_reductions_tco2e REAL,
  qualifications TEXT,
  opinion TEXT CHECK (opinion IN ('positive','qualified','adverse','disclaimer')),
  verification_report_r2_key TEXT,
  verification_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mrv_verif_submission ON mrv_verifications(submission_id);

-- ─── SA Carbon Tax offset allowance tracking ───────────────────────────────
-- Per Carbon Tax Act s.13 and GNR 1556/2019: a taxpayer can offset up to
-- 5% (most industries) or 10% (petroleum/mining) of their liability using
-- eligible domestic credits. Credits used here become locked against that
-- tax period and cannot be re-applied.
CREATE TABLE IF NOT EXISTS carbon_tax_offset_claims (
  id TEXT PRIMARY KEY,
  taxpayer_participant_id TEXT NOT NULL REFERENCES participants(id),
  tax_year INTEGER NOT NULL,
  gross_tax_liability_zar REAL NOT NULL,
  offset_limit_pct REAL NOT NULL,         -- 5 or 10 per industry
  offset_limit_zar REAL NOT NULL,
  credits_applied_tco2e REAL,
  offset_value_zar REAL,                  -- credits × prevailing CT rate
  net_tax_liability_zar REAL,
  sars_reference TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','accepted','rejected','adjusted')),
  submitted_at TEXT,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cto_taxpayer ON carbon_tax_offset_claims(taxpayer_participant_id, tax_year);

-- Link credits (retirement-specific) to a tax claim. One retirement must not
-- count twice across different years.
CREATE TABLE IF NOT EXISTS carbon_tax_offset_retirements (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES carbon_tax_offset_claims(id) ON DELETE CASCADE,
  retirement_id TEXT NOT NULL REFERENCES carbon_retirements(id),
  credits_applied_tco2e REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (retirement_id)                   -- one retirement → one claim, by law
);
CREATE INDEX IF NOT EXISTS idx_cto_ret_claim ON carbon_tax_offset_retirements(claim_id);
