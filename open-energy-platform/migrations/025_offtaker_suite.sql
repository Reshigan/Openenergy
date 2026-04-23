-- 025_offtaker_suite.sql
-- Offtaker national-scale features:
--   1. Multi-site groupings & aggregation for group billing
--   2. Tariff comparison & TOU (time-of-use) optimisation
--   3. Budget vs actual tracking by cost centre
--   4. REC (renewable energy certificate) retirements linked to consumption
--   5. Scope 2 GHG export to ESG
--
-- Builds on offtaker_delivery_points (migration 016).

-- ─── Multi-site groups ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offtaker_site_groups (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  group_name TEXT NOT NULL,
  group_type TEXT CHECK (group_type IN ('company','division','brand','region','other')),
  billing_entity TEXT,
  vat_number TEXT,
  consolidated_invoice BOOLEAN DEFAULT 1,
  cost_centre TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_osg_participant ON offtaker_site_groups(participant_id);

CREATE TABLE IF NOT EXISTS offtaker_site_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES offtaker_site_groups(id) ON DELETE CASCADE,
  delivery_point_id TEXT NOT NULL REFERENCES offtaker_delivery_points(id),
  allocation_percentage REAL DEFAULT 100,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (group_id, delivery_point_id)
);
CREATE INDEX IF NOT EXISTS idx_osgm_group ON offtaker_site_group_members(group_id);

-- ─── Tariff registry ───────────────────────────────────────────────────────
-- Tariffs the offtaker is compared against — Eskom MegaFlex, Miniflex,
-- Homepower, municipality tariffs, etc. Populated by the platform operator
-- or scraped from NERSA publications.
CREATE TABLE IF NOT EXISTS tariff_products (
  id TEXT PRIMARY KEY,
  tariff_code TEXT UNIQUE NOT NULL,
  tariff_name TEXT NOT NULL,
  utility TEXT NOT NULL,            -- 'Eskom','City of Cape Town','City of Johannesburg','NMBM','eThekwini','other'
  category TEXT NOT NULL CHECK (category IN (
    'commercial','industrial','residential','agricultural','public_sector','wheeling'
  )),
  structure_type TEXT NOT NULL CHECK (structure_type IN (
    'flat','tou','stepped_block','demand_based','fixed_plus_energy','hybrid'
  )),
  tou_schedule_json TEXT,           -- { off_peak: {cents_per_kwh, hours: [[22,6]]}, standard: {...}, peak: {...} }
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  source_doc_r2_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tariff_products_utility ON tariff_products(utility, effective_from DESC);

-- ─── Consumption profiles & TOU analysis ───────────────────────────────────
CREATE TABLE IF NOT EXISTS consumption_profiles (
  id TEXT PRIMARY KEY,
  delivery_point_id TEXT NOT NULL REFERENCES offtaker_delivery_points(id),
  profile_date TEXT NOT NULL,        -- YYYY-MM-DD
  half_hour_kwh_json TEXT,           -- 48-element JSON array
  total_kwh REAL,
  peak_kw REAL,
  peak_time TEXT,
  load_factor REAL,
  source TEXT DEFAULT 'meter',       -- 'meter','estimated','aggregated'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cp_site_date ON consumption_profiles(delivery_point_id, profile_date);

-- ─── Budget vs actual ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offtaker_budgets (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  site_group_id TEXT REFERENCES offtaker_site_groups(id),
  delivery_point_id TEXT REFERENCES offtaker_delivery_points(id),
  period TEXT NOT NULL,             -- '2026-04' or '2026-Q2'
  budgeted_kwh REAL,
  budgeted_zar REAL,
  cost_centre TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ob_period ON offtaker_budgets(participant_id, period);

-- ─── REC retirements (consumption-matched green certificates) ──────────────
-- Different from carbon_retirements (which retires CO2 tonnes); RECs retire
-- 1 MWh of renewable generation per certificate to support Scope 2
-- market-based reporting (GHG Protocol Scope 2 Guidance 2015, "market-based
-- method").
CREATE TABLE IF NOT EXISTS rec_certificates (
  id TEXT PRIMARY KEY,
  certificate_serial TEXT UNIQUE NOT NULL,
  generator_participant_id TEXT REFERENCES participants(id),
  project_id TEXT REFERENCES ipp_projects(id),
  generation_period_start TEXT NOT NULL,
  generation_period_end TEXT NOT NULL,
  mwh_represented REAL NOT NULL,
  technology TEXT,
  registry TEXT,                    -- 'I-REC','SAREC','TIGRs','custom'
  issuance_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','transferred','retired','cancelled')),
  owner_participant_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rec_owner ON rec_certificates(owner_participant_id);
CREATE INDEX IF NOT EXISTS idx_rec_status ON rec_certificates(status);

CREATE TABLE IF NOT EXISTS rec_retirements (
  id TEXT PRIMARY KEY,
  rec_certificate_id TEXT NOT NULL REFERENCES rec_certificates(id),
  retiring_participant_id TEXT NOT NULL REFERENCES participants(id),
  retirement_purpose TEXT NOT NULL CHECK (retirement_purpose IN (
    'scope_2','voluntary','compliance','customer_claim','greenhouse_trade'
  )),
  consumption_period_start TEXT,
  consumption_period_end TEXT,
  consumption_site_group_id TEXT REFERENCES offtaker_site_groups(id),
  consumption_mwh REAL,             -- how much consumption this cert is matched to
  beneficiary_name TEXT,
  beneficiary_statement TEXT,       -- text for public / scope 2 disclosure
  retirement_certificate_number TEXT UNIQUE NOT NULL,
  retired_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT REFERENCES participants(id)
);
CREATE INDEX IF NOT EXISTS idx_rec_ret_participant ON rec_retirements(retiring_participant_id);
CREATE INDEX IF NOT EXISTS idx_rec_ret_cert ON rec_retirements(rec_certificate_id);

-- ─── Scope 2 disclosures (link consumption → RECs → claimed renewable %) ───
CREATE TABLE IF NOT EXISTS scope2_disclosures (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  reporting_year INTEGER NOT NULL,
  total_consumption_mwh REAL NOT NULL,
  location_based_emissions_tco2e REAL,
  market_based_emissions_tco2e REAL,
  renewable_mwh_claimed REAL,
  renewable_percentage REAL,
  grid_factor_tco2e_per_mwh REAL,    -- SA national grid factor; NERSA-published
  audit_reference TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','audited','revised')),
  published_at TEXT,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scope2_participant ON scope2_disclosures(participant_id, reporting_year);
