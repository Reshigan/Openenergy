-- ════════════════════════════════════════════════════════════════════════
-- 038 · Watershed-grade ESG transaction ledger
--
-- Brings the ESG module to a Watershed / Persefoni level of detail:
--   • Per-transaction Scope 1/2/3 emissions accounting (15 Scope 3 cats)
--   • Emission factors library (DEFRA, IPCC, EPA, Eskom, custom)
--   • Activity data with full audit-ready data lineage
--   • REC / GO matching for Scope 2 market-based accounting
--   • Targets aligned to SBTi (1.5°C, well-below 2°C, near-term, net-zero)
--   • Reduction initiatives with abatement curves
--   • Supplier engagement + Scope 3 surveys (cat 1, 4, 11)
--   • Disclosure submissions: CDP, TCFD, CSRD, ISSB IFRS S2, JSE-SRL,
--     SEC climate rule, NERSA carbon tax (SA s.13 offset claims live in
--     carbon_tax_offset_claims via migration 026)
--
-- All tables are tenant-scoped (`tenant_id` defaulted to 'default' for
-- backward compat) and link back to the existing participants table.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Emission factors ─────────────────────────────────────────────────────
-- Per-(activity, region, year) factor with units. The "official" providers
-- (DEFRA, EPA, IPCC AR6, Eskom GHG factors) are seeded; tenants can publish
-- custom factors for their own supplier data.
CREATE TABLE IF NOT EXISTS esg_emission_factors (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,                  -- DEFRA | EPA | IPCC | ESKOM | CUSTOM | SUPPLIER_DECLARED
  source_version  TEXT,                            -- e.g. "AR6 2021"
  region          TEXT,                            -- ISO 3166 alpha-2 ('ZA','GB','US','GLB')
  activity_code   TEXT NOT NULL,                   -- e.g. 'electricity.grid', 'fuel.diesel', 'flight.short-haul'
  activity_name   TEXT NOT NULL,
  scope           INTEGER NOT NULL CHECK (scope IN (1,2,3)),
  scope3_category INTEGER CHECK (scope3_category BETWEEN 1 AND 15),
  unit_in         TEXT NOT NULL,                   -- 'kWh','litre','tkm','ZAR','tCO2e','kg'
  unit_out        TEXT NOT NULL DEFAULT 'kgCO2e',
  -- The factor itself, in kgCO2e per unit_in (or whatever unit_out specifies).
  factor          REAL NOT NULL,
  factor_ch4      REAL DEFAULT 0,
  factor_n2o      REAL DEFAULT 0,
  gwp_horizon     INTEGER DEFAULT 100,             -- 100yr GWP (AR6)
  valid_from      TEXT NOT NULL,
  valid_to        TEXT,
  certainty       TEXT DEFAULT 'medium' CHECK (certainty IN ('high','medium','low')),
  notes           TEXT,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_esg_factors_lookup
  ON esg_emission_factors(activity_code, region, valid_from, tenant_id);

-- ─── Activity-data transactions (every fuel litre, kWh, supplier order) ───
-- One row per audit-grade event. We DO NOT aggregate at ingest — that lets
-- the auditor drill back to source. Re-calculation happens on read /
-- materialised view.
CREATE TABLE IF NOT EXISTS esg_activity_transactions (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT NOT NULL REFERENCES participants(id),
  tenant_id             TEXT DEFAULT 'default' NOT NULL,
  -- Activity reference
  activity_code         TEXT NOT NULL,            -- joins to esg_emission_factors.activity_code
  scope                 INTEGER NOT NULL CHECK (scope IN (1,2,3)),
  scope3_category       INTEGER CHECK (scope3_category BETWEEN 1 AND 15),
  -- Where the activity happened
  region                TEXT,                     -- ISO 3166 alpha-2
  facility_id           TEXT,                     -- optional reference to a site / facility
  delivery_point_id     TEXT,                     -- offtaker metering point if Scope 2
  -- The activity itself
  activity_date         TEXT NOT NULL,            -- the date the emission occurred
  period_start          TEXT,                     -- for span-aggregated reads (electricity bills, fleet logs)
  period_end            TEXT,
  quantity              REAL NOT NULL,
  unit                  TEXT NOT NULL,            -- 'kWh','litre','tkm','ZAR','passenger-km'…
  -- Counterparty
  counterparty_id       TEXT,                     -- supplier participant if Scope 3 cat 1
  counterparty_name     TEXT,
  invoice_id            TEXT,                     -- joins to invoices.id if applicable
  -- Calculation result (auto-computed by the engine, stored for audit)
  factor_id             TEXT REFERENCES esg_emission_factors(id),
  factor_value          REAL,                     -- the factor at calc time (audit trail)
  emissions_kg_co2e     REAL,                     -- computed = quantity * factor_value
  -- Scope 2 market-based
  rec_certificate_id    TEXT,                     -- if matched against an REC
  scope2_method         TEXT DEFAULT 'location' CHECK (scope2_method IN ('location','market','both')),
  -- Data quality
  data_source           TEXT,                     -- 'meter','invoice','estimate','supplier_declared','industry_avg'
  data_quality          TEXT DEFAULT 'measured' CHECK (data_quality IN ('measured','calculated','estimated','industry_average')),
  uncertainty_pct       REAL,                     -- e.g. 5.0 = ±5%
  evidence_r2_key       TEXT,                     -- vault file id (PDF invoice, meter reading photo)
  -- Status + audit
  status                TEXT DEFAULT 'final' CHECK (status IN ('draft','final','restated','voided')),
  restated_from_id      TEXT REFERENCES esg_activity_transactions(id),
  notes                 TEXT,
  tags                  TEXT,                     -- JSON array of free-form labels
  created_by            TEXT,
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_esg_act_part_date
  ON esg_activity_transactions(participant_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_esg_act_scope
  ON esg_activity_transactions(scope, scope3_category, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_esg_act_counterparty
  ON esg_activity_transactions(counterparty_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_esg_act_tenant
  ON esg_activity_transactions(tenant_id, scope, activity_date DESC);

-- ─── Targets (SBTi-style) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS esg_targets (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL REFERENCES participants(id),
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  target_type         TEXT NOT NULL CHECK (target_type IN ('absolute','intensity','net_zero','renewable_mix','sbti_15c','sbti_2c')),
  framework           TEXT,                       -- 'SBTi','SA NDC','Custom'
  scopes_covered      TEXT NOT NULL,              -- JSON: ['scope_1','scope_2','scope_3_cat_1',…]
  base_year           INTEGER NOT NULL,
  base_value          REAL NOT NULL,              -- kgCO2e or intensity
  base_intensity_unit TEXT,                       -- 'kgCO2e/MWh','kgCO2e/ZAR_revenue'
  target_year         INTEGER NOT NULL,
  target_value        REAL NOT NULL,              -- absolute reduction target value
  target_pct          REAL,                       -- % reduction (computed but stored for query convenience)
  validated_by        TEXT,                       -- 'SBTi','third-party assurance', null
  validated_at        TEXT,
  status              TEXT DEFAULT 'committed' CHECK (status IN ('committed','approved','progressing','achieved','revised','retired')),
  description         TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ─── Reduction initiatives ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS esg_initiatives (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT NOT NULL REFERENCES participants(id),
  tenant_id             TEXT DEFAULT 'default' NOT NULL,
  name                  TEXT NOT NULL,
  category              TEXT,                     -- 'energy_efficiency','renewable_purchase','fleet_electrification',…
  scopes_targeted       TEXT,                     -- JSON
  abatement_tco2e_yr    REAL,                     -- annual reduction estimate (tCO2e/yr)
  capex_zar             REAL,
  opex_zar_yr           REAL,
  lifetime_years        INTEGER,
  marginal_abatement_cost_zar_tco2e REAL,         -- MACC point — computed
  start_date            TEXT,
  end_date              TEXT,
  status                TEXT DEFAULT 'planned' CHECK (status IN ('planned','approved','in_progress','delivered','cancelled')),
  -- Linkage to actuals
  reduces_target_id     TEXT REFERENCES esg_targets(id),
  description           TEXT,
  created_at            TEXT DEFAULT (datetime('now'))
);

-- ─── Supplier engagement (Scope 3 Cat 1, 4, 11 surveys) ──────────────────
CREATE TABLE IF NOT EXISTS esg_supplier_engagements (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT NOT NULL REFERENCES participants(id),
  supplier_id           TEXT NOT NULL,            -- another participant or external_supplier_id
  supplier_name         TEXT,
  scope3_category       INTEGER NOT NULL CHECK (scope3_category BETWEEN 1 AND 15),
  survey_type           TEXT,                     -- 'CDP_supply_chain','custom','SBTi_PRTS'
  invited_at            TEXT DEFAULT (datetime('now')),
  responded_at          TEXT,
  status                TEXT DEFAULT 'invited' CHECK (status IN ('invited','reminded','partial','complete','declined','expired')),
  response_emissions_kg REAL,                     -- supplier-declared emissions for the period
  response_period_start TEXT,
  response_period_end   TEXT,
  data_quality          TEXT,
  evidence_r2_key       TEXT,
  notes                 TEXT,
  tenant_id             TEXT DEFAULT 'default' NOT NULL,
  created_at            TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_esg_supplier_part
  ON esg_supplier_engagements(participant_id, status, supplier_id);

-- ─── REC / Guarantee-of-Origin certificates ──────────────────────────────
-- Used for Scope 2 market-based accounting. Match against an
-- esg_activity_transactions row in scope=2 to reduce its market-based
-- emissions to (approximately) zero.
CREATE TABLE IF NOT EXISTS esg_rec_certificates (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT NOT NULL REFERENCES participants(id),
  tenant_id             TEXT DEFAULT 'default' NOT NULL,
  serial_number         TEXT UNIQUE NOT NULL,
  registry              TEXT NOT NULL,            -- 'I-REC','GO_EU','SAREMI','VCS','GS','custom'
  source_project_id     TEXT,                     -- references ipp_projects.id when issued domestically
  technology            TEXT,                     -- 'solar_pv','wind','hydro','biomass'
  vintage_year          INTEGER NOT NULL,
  vintage_month         INTEGER,
  mwh_certified         REAL NOT NULL,
  mwh_remaining         REAL NOT NULL,
  issue_date            TEXT,
  expiry_date           TEXT,
  status                TEXT DEFAULT 'active' CHECK (status IN ('active','partially_retired','retired','expired','cancelled')),
  acquisition_cost_zar  REAL,
  acquisition_date      TEXT,
  notes                 TEXT,
  created_at            TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS esg_rec_retirements (
  id                  TEXT PRIMARY KEY,
  certificate_id      TEXT NOT NULL REFERENCES esg_rec_certificates(id),
  participant_id      TEXT NOT NULL,
  mwh_retired         REAL NOT NULL,
  reporting_year      INTEGER NOT NULL,
  scope2_method       TEXT DEFAULT 'market',
  beneficiary         TEXT,
  reason              TEXT,
  retired_at          TEXT DEFAULT (datetime('now')),
  tenant_id           TEXT DEFAULT 'default' NOT NULL
);

-- ─── Disclosure submissions ──────────────────────────────────────────────
-- Tracks each external-facing report so the audit + supersession story is
-- preserved.
CREATE TABLE IF NOT EXISTS esg_disclosures (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL REFERENCES participants(id),
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  framework           TEXT NOT NULL,              -- 'CDP','TCFD','CSRD','ISSB_S2','JSE_SRL','SEC_CLIMATE','GHG_PROTOCOL','SA_CARBON_TAX'
  reporting_year      INTEGER NOT NULL,
  period_start        TEXT NOT NULL,
  period_end          TEXT NOT NULL,
  scope1_tco2e        REAL,
  scope2_location_tco2e REAL,
  scope2_market_tco2e REAL,
  scope3_tco2e        REAL,
  intensity_value     REAL,
  intensity_unit      TEXT,
  renewable_pct       REAL,
  assurance_level     TEXT,                       -- 'reasonable','limited','none'
  assurance_provider  TEXT,
  status              TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','published','restated','withdrawn')),
  submitted_at        TEXT,
  submitted_to        TEXT,                       -- registry / regulator endpoint
  external_reference  TEXT,                       -- e.g. CDP submission ID
  r2_pdf_key          TEXT,
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_esg_disclosures
  ON esg_disclosures(participant_id, reporting_year, framework);

-- ─── Materiality assessments (CSRD double materiality) ──────────────────
CREATE TABLE IF NOT EXISTS esg_materiality_topics (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  topic_code          TEXT NOT NULL,              -- e.g. 'climate_mitigation','water_use'
  topic_name          TEXT NOT NULL,
  esrs_alignment      TEXT,                       -- 'E1','E3','S1','S4','G1'…
  impact_materiality  REAL,                       -- 0..1 (impact on people/planet)
  financial_materiality REAL,                     -- 0..1 (impact on enterprise value)
  assessed_at         TEXT,
  assessed_by         TEXT,
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ─── Risk register (climate physical + transition risks per TCFD) ───────
CREATE TABLE IF NOT EXISTS esg_risks (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  risk_type           TEXT NOT NULL CHECK (risk_type IN ('physical_acute','physical_chronic','transition_policy','transition_market','transition_technology','transition_reputation')),
  title               TEXT NOT NULL,
  description         TEXT,
  time_horizon        TEXT,                       -- 'short','medium','long'
  likelihood          REAL,                       -- 0..1
  impact_zar          REAL,                       -- estimated annual financial impact
  scenario            TEXT,                       -- 'NGFS Orderly','NGFS Disorderly','NGFS Hot House','IEA NZE'
  mitigation          TEXT,
  status              TEXT DEFAULT 'identified',
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ─── Materialised rollup view (re-computed by /api/esg/rollup nightly) ──
-- Holds the annual aggregates per (participant, year) — feeds the
-- disclosure exports without re-scanning all transactions.
CREATE TABLE IF NOT EXISTS esg_annual_rollup (
  participant_id        TEXT NOT NULL,
  tenant_id             TEXT DEFAULT 'default' NOT NULL,
  reporting_year        INTEGER NOT NULL,
  scope1_tco2e          REAL DEFAULT 0,
  scope2_location_tco2e REAL DEFAULT 0,
  scope2_market_tco2e   REAL DEFAULT 0,
  scope3_tco2e          REAL DEFAULT 0,
  scope3_by_category    TEXT,                     -- JSON {1: …, 2: …}
  total_tco2e_location  REAL DEFAULT 0,
  total_tco2e_market    REAL DEFAULT 0,
  energy_consumption_mwh REAL DEFAULT 0,
  renewable_mwh         REAL DEFAULT 0,
  renewable_pct         REAL DEFAULT 0,
  revenue_zar           REAL,                     -- if known, drives intensity
  intensity_kgco2e_zar  REAL,
  data_quality_score    REAL,                     -- 0..100
  computed_at           TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, reporting_year, tenant_id)
);

-- ─── Seed core emission factors (DEFRA + IPCC + Eskom) ──────────────────
-- A representative subset — production deployments should sync from
-- DEFRA / IPCC AR6 published tables. These cover the most common SA
-- activities so the calc engine produces a sensible answer out of the box.
INSERT OR IGNORE INTO esg_emission_factors
  (id, source, source_version, region, activity_code, activity_name, scope, scope3_category, unit_in, unit_out, factor, valid_from, certainty, notes)
VALUES
  -- Scope 1 — direct combustion (DEFRA 2024 generic factors)
  ('ef_diesel_litre',   'DEFRA',  '2024', 'GLB', 'fuel.diesel.litre',          'Diesel (litre)',          1, NULL, 'litre',     'kgCO2e', 2.5448,  '2024-01-01', 'high', 'CO2 + CH4 + N2O combined per DEFRA'),
  ('ef_petrol_litre',   'DEFRA',  '2024', 'GLB', 'fuel.petrol.litre',          'Petrol (litre)',          1, NULL, 'litre',     'kgCO2e', 2.1671,  '2024-01-01', 'high', NULL),
  ('ef_lpg_kg',         'DEFRA',  '2024', 'GLB', 'fuel.lpg.kg',                'LPG (kg)',                1, NULL, 'kg',        'kgCO2e', 2.9385,  '2024-01-01', 'high', NULL),
  ('ef_natgas_m3',      'DEFRA',  '2024', 'GLB', 'fuel.natural_gas.m3',        'Natural gas (m³)',        1, NULL, 'm3',        'kgCO2e', 2.0353,  '2024-01-01', 'high', NULL),
  ('ef_coal_t',         'IPCC',   'AR6',  'GLB', 'fuel.coal.tonne',            'Coal (tonne, sub-bituminous)', 1, NULL, 'tonne', 'kgCO2e', 2400.00, '2021-01-01', 'medium', NULL),
  -- Scope 2 — grid electricity (location-based)
  ('ef_eskom_kwh',      'ESKOM',  '2023', 'ZA',  'electricity.grid.kwh',       'Eskom grid (kWh)',        2, NULL, 'kWh',       'kgCO2e', 0.94,    '2023-01-01', 'high', 'Eskom GHG Inventory 2022/23'),
  ('ef_eu_grid_kwh',    'EEA',    '2023', 'EU',  'electricity.grid.kwh',       'EU residual mix (kWh)',   2, NULL, 'kWh',       'kgCO2e', 0.295,   '2023-01-01', 'high', NULL),
  ('ef_us_grid_kwh',    'EPA',    '2024', 'US',  'electricity.grid.kwh',       'US eGRID national avg',   2, NULL, 'kWh',       'kgCO2e', 0.385,   '2024-01-01', 'high', NULL),
  -- Scope 3 cat 4 — upstream transport
  ('ef_road_freight',   'DEFRA',  '2024', 'GLB', 'transport.road.tkm',         'HGV freight (tonne-km)',  3,    4, 'tkm',       'kgCO2e', 0.107,   '2024-01-01', 'high', NULL),
  ('ef_rail_freight',   'DEFRA',  '2024', 'GLB', 'transport.rail.tkm',         'Rail freight (tonne-km)', 3,    4, 'tkm',       'kgCO2e', 0.028,   '2024-01-01', 'medium', NULL),
  ('ef_sea_freight',    'DEFRA',  '2024', 'GLB', 'transport.sea.tkm',          'Ocean freight (tonne-km)',3,    4, 'tkm',       'kgCO2e', 0.012,   '2024-01-01', 'medium', NULL),
  -- Scope 3 cat 6 — business travel
  ('ef_flight_short',   'DEFRA',  '2024', 'GLB', 'travel.flight.short_haul',   'Short-haul flight (pkm)', 3,    6, 'passenger-km', 'kgCO2e', 0.1535, '2024-01-01', 'high', NULL),
  ('ef_flight_long',    'DEFRA',  '2024', 'GLB', 'travel.flight.long_haul',    'Long-haul flight (pkm)',  3,    6, 'passenger-km', 'kgCO2e', 0.1481, '2024-01-01', 'high', NULL),
  ('ef_hotel_night',    'CHO',    '2023', 'ZA',  'travel.hotel.night',         'Hotel-night (ZA)',        3,    6, 'night',     'kgCO2e', 12.5,    '2023-01-01', 'medium', NULL),
  -- Scope 3 cat 1 — purchased goods/services (spend-based, EEIO)
  ('ef_eeio_services',  'EXIOBASE', 'v3.8', 'ZA','spend.services.zar',         'Services spend (ZAR)',    3,    1, 'ZAR',       'kgCO2e', 0.115,   '2023-01-01', 'low', 'EEIO South Africa services aggregate'),
  ('ef_eeio_construction', 'EXIOBASE', 'v3.8', 'ZA','spend.construction.zar','Construction spend (ZAR)',3,    2, 'ZAR',       'kgCO2e', 0.385,   '2023-01-01', 'low', NULL),
  -- Scope 3 cat 11 — use of sold products (energy products)
  ('ef_use_electricity_kwh','IPCC','AR6','GLB','use.electricity_product.kwh', 'Electricity sold (kWh)',  3,   11, 'kWh',       'kgCO2e', 0.475,   '2021-01-01', 'medium', 'Global avg grid intensity');
