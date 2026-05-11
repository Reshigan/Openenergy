-- ════════════════════════════════════════════════════════════════════════
-- 040 · Watershed-parity feature set
--
-- Brings the platform's ESG/climate surface to feature parity with the
-- watershed.com product. Adds:
--
--   1. PCAF financed emissions (asset-class-by-asset-class)
--   2. Removals marketplace (CDR project catalogue + offtake agreements)
--   3. 24/7 carbon-free energy (hourly REC matching)
--   4. Product carbon footprints (PCFs) for SKU-level reporting
--   5. Assurance workflow (auditor review, evidence pack assembly)
--   6. Climate maturity score + industry benchmarks
--   7. Spend categorisation hints (EEIO auto-tag suggestions)
--   8. Anomaly flags on emission transactions
--   9. Multi-jurisdiction disclosure registry (one event, many regulators)
--  10. Capital-markets specifics (PCAF + GFANZ + NZBA + SBTi-FI)
--
-- All tables tenant-scoped and tie back to participants + projects + the
-- existing 038 ESG ledger.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1. PCAF Financed Emissions — banks, asset managers, insurers
-- ────────────────────────────────────────────────────────────────────────

-- PCAF asset class registry (the 7 published classes + 3 emerging).
CREATE TABLE IF NOT EXISTS pcaf_asset_classes (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,   -- 'lending','investment','insurance'
  guidance_doc    TEXT,
  display_order   INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO pcaf_asset_classes (code, name, category, guidance_doc, display_order) VALUES
  ('listed_equity',          'Listed equity & corporate bonds',         'investment', 'PCAF Part A § 5.1',  1),
  ('business_loans',         'Business loans & unlisted equity',         'lending',    'PCAF Part A § 5.2',  2),
  ('project_finance',        'Project finance',                          'lending',    'PCAF Part A § 5.3',  3),
  ('commercial_real_estate', 'Commercial real estate',                   'lending',    'PCAF Part A § 5.4',  4),
  ('mortgages',              'Mortgages',                                 'lending',    'PCAF Part A § 5.5',  5),
  ('motor_vehicle_loans',    'Motor vehicle loans',                       'lending',    'PCAF Part A § 5.6',  6),
  ('sovereign_debt',         'Sovereign debt',                            'investment', 'PCAF Part A § 5.7',  7),
  ('insurance_underwriting', 'Insurance-associated emissions',           'insurance',  'PCAF Part C',        8),
  ('capital_markets',        'Capital markets facilitated emissions',    'investment', 'PCAF Part B',        9),
  ('derivatives',            'Derivatives & other off-balance-sheet',    'investment', 'Emerging',          10);

-- Financed emissions ledger — one row per financed/insured/facilitated
-- exposure for the reporting year. Computation persists for audit.
CREATE TABLE IF NOT EXISTS pcaf_financed_emissions (
  id                          TEXT PRIMARY KEY,
  participant_id              TEXT NOT NULL REFERENCES participants(id),  -- the bank / fund
  tenant_id                   TEXT DEFAULT 'default' NOT NULL,
  reporting_year              INTEGER NOT NULL,
  asset_class                 TEXT NOT NULL REFERENCES pcaf_asset_classes(code),

  -- Counterparty / asset
  counterparty_id             TEXT,                 -- participant if internal
  counterparty_name           TEXT NOT NULL,
  counterparty_country        TEXT,
  counterparty_sector_nace    TEXT,                 -- NACE/GICS sector code
  counterparty_revenue_zar    REAL,
  counterparty_evic_zar       REAL,                 -- enterprise value incl. cash
  property_address            TEXT,                  -- CRE / mortgage
  vehicle_make_model          TEXT,                  -- motor vehicle loans
  project_id                  TEXT,                  -- project finance

  -- Exposure
  outstanding_amount_zar      REAL NOT NULL,
  commitment_amount_zar       REAL,
  fx_rate                     REAL DEFAULT 1.0,
  attribution_method          TEXT DEFAULT 'evic'
                              CHECK (attribution_method IN ('evic','total_equity','property_value','vehicle_value','revenue','asset_value')),

  -- Counterparty emissions
  counterparty_scope1_tco2e   REAL,
  counterparty_scope2_tco2e   REAL,
  counterparty_scope3_tco2e   REAL,
  emissions_data_source       TEXT,                 -- 'CDP','reported','proxy','sector_average'
  pcaf_data_quality_score     INTEGER CHECK (pcaf_data_quality_score BETWEEN 1 AND 5),

  -- Computed (stored for audit re-creation)
  attribution_factor          REAL,                 -- outstanding / EVIC etc.
  financed_scope1_tco2e       REAL,
  financed_scope2_tco2e       REAL,
  financed_scope3_tco2e       REAL,
  financed_total_tco2e        REAL,
  emission_intensity          REAL,                 -- tCO2e per ZAR financed

  -- Lifecycle
  status                      TEXT DEFAULT 'recorded'
                              CHECK (status IN ('draft','recorded','assured','restated','retired')),
  notes                       TEXT,
  evidence_r2_key             TEXT,
  computed_at                 TEXT DEFAULT (datetime('now')),
  created_at                  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pcaf_part_year ON pcaf_financed_emissions(participant_id, reporting_year, asset_class);

-- PCAF target schedule — banks committing under NZBA / SBTi-FI track
-- portfolio temperature alignment per sector.
CREATE TABLE IF NOT EXISTS pcaf_targets (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  framework       TEXT NOT NULL,                    -- 'NZBA','SBTi_FI','GFANZ'
  scope           TEXT NOT NULL,                    -- 'portfolio_wide','sector','asset_class'
  sector          TEXT,                              -- e.g. 'power','oil_gas','steel','aluminum','cement','aviation','shipping','real_estate'
  asset_class     TEXT,
  base_year       INTEGER NOT NULL,
  base_intensity  REAL,                              -- kgCO2e/MWh, kgCO2e/tonne, etc.
  target_year     INTEGER NOT NULL,
  target_intensity REAL,
  pathway_alignment TEXT,                            -- 'IEA NZE 2050','SDA','1.5C','well-below-2C'
  status          TEXT DEFAULT 'committed' CHECK (status IN ('committed','approved','on_track','off_track','revised','retired')),
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Removals marketplace — Carbon Dioxide Removal projects
-- ────────────────────────────────────────────────────────────────────────

-- Project catalogue — buyers browse this and place offtake.
CREATE TABLE IF NOT EXISTS cdr_projects (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  developer_id        TEXT REFERENCES participants(id),
  project_name        TEXT NOT NULL,
  technology          TEXT NOT NULL CHECK (technology IN (
                        'afforestation','reforestation','soil_carbon','biochar',
                        'enhanced_weathering','direct_air_capture','ocean_alkalinity',
                        'beccs','blue_carbon','peatland','agroforestry','rock_dust',
                        'mineralisation','mceor','wood_burial','other'
                      )),
  category            TEXT NOT NULL CHECK (category IN ('nature','engineered','hybrid')),
  permanence_years    INTEGER,                          -- expected storage horizon
  registry            TEXT,                              -- 'puro_earth','verra_vcs','isometric','carbonplan','custom'
  registry_id         TEXT,
  host_country        TEXT,
  description         TEXT,
  expected_tco2e_yr   REAL,
  total_tco2e_committed REAL,
  price_zar_per_tco2e REAL,
  vintage_first_year  INTEGER,
  status              TEXT DEFAULT 'listed'
                       CHECK (status IN ('listed','contracted','delivering','delivered','retired','withdrawn')),
  third_party_audit   TEXT,
  evidence_r2_key     TEXT,
  cobenefits          TEXT,                              -- JSON: biodiversity, community, water
  risk_rating         TEXT,                              -- 'high','medium','low'
  created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cdr_projects_status_cat ON cdr_projects(status, category);

-- Offtake agreement — one buyer commits to multi-year removal volume.
CREATE TABLE IF NOT EXISTS cdr_offtakes (
  id                  TEXT PRIMARY KEY,
  buyer_id            TEXT NOT NULL REFERENCES participants(id),
  project_id          TEXT NOT NULL REFERENCES cdr_projects(id),
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  total_tco2e         REAL NOT NULL,
  delivered_tco2e     REAL DEFAULT 0,
  retired_tco2e       REAL DEFAULT 0,
  price_zar_per_tco2e REAL NOT NULL,
  total_zar           REAL,
  start_vintage_year  INTEGER NOT NULL,
  end_vintage_year    INTEGER,
  status              TEXT DEFAULT 'contracted'
                       CHECK (status IN ('drafted','contracted','active','complete','cancelled','disputed')),
  payment_schedule    TEXT,                              -- JSON
  delivery_schedule   TEXT,                              -- JSON
  evidence_r2_key     TEXT,
  signed_at           TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- Retirement chain — each chunk retired with serial-tracked certs.
CREATE TABLE IF NOT EXISTS cdr_retirements (
  id              TEXT PRIMARY KEY,
  offtake_id      TEXT NOT NULL REFERENCES cdr_offtakes(id),
  participant_id  TEXT NOT NULL,
  tco2e_retired   REAL NOT NULL,
  vintage_year    INTEGER,
  reporting_year  INTEGER NOT NULL,
  serial_number   TEXT,
  beneficiary     TEXT,
  reason          TEXT,
  retired_at      TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- 3. 24/7 Carbon-Free Energy hourly matching
-- ────────────────────────────────────────────────────────────────────────

-- Hourly load profile per consumption site.
CREATE TABLE IF NOT EXISTS cfe_hourly_load (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  site_id         TEXT,
  hour_utc        TEXT NOT NULL,                     -- ISO datetime truncated to hour
  load_kwh        REAL NOT NULL,
  grid_zone       TEXT,                              -- 'ZA-NPC','ZA-Western',… (for grid intensity lookup)
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cfe_load_part_hour ON cfe_hourly_load(participant_id, hour_utc);

-- Hourly generation profile from a contracted PPA / on-site / REC source.
CREATE TABLE IF NOT EXISTS cfe_hourly_generation (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  source_type     TEXT NOT NULL CHECK (source_type IN ('ppa','on_site','rec_unbundled','rec_hourly_certified','grid_clean')),
  source_ref      TEXT,                              -- contract / rec serial / project id
  technology      TEXT,                              -- 'solar','wind','battery'
  hour_utc        TEXT NOT NULL,
  generation_kwh  REAL NOT NULL,
  grid_zone       TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cfe_gen_part_hour ON cfe_hourly_generation(participant_id, hour_utc);

-- Per-period CFE score (computed by /api/esg/cfe/score).
CREATE TABLE IF NOT EXISTS cfe_match_summary (
  participant_id          TEXT NOT NULL,
  tenant_id               TEXT DEFAULT 'default' NOT NULL,
  reporting_period_start  TEXT NOT NULL,
  reporting_period_end    TEXT NOT NULL,
  total_load_kwh          REAL,
  total_carbon_free_kwh   REAL,
  cfe_match_pct           REAL,                        -- carbon-free / total load
  hours_with_full_match   INTEGER,
  hours_with_zero_match   INTEGER,
  avg_grid_intensity_kg_kwh REAL,
  emissions_avoided_tco2e REAL,
  computed_at             TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, reporting_period_start, reporting_period_end, tenant_id)
);

-- ────────────────────────────────────────────────────────────────────────
-- 4. Product Carbon Footprints (PCFs) — SKU / unit level
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_carbon_footprints (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  product_code        TEXT NOT NULL,
  product_name        TEXT NOT NULL,
  functional_unit     TEXT NOT NULL,                -- '1 kg cement', '1 MWh electricity', '1 unit'
  reporting_year      INTEGER NOT NULL,
  methodology         TEXT,                          -- 'ISO 14067','PEFCR','PAS 2050','custom'
  -- Cradle-to-gate emissions split (modular per ISO 14067)
  upstream_tco2e_per_unit    REAL DEFAULT 0,
  manufacturing_tco2e_per_unit REAL DEFAULT 0,
  distribution_tco2e_per_unit REAL DEFAULT 0,
  use_phase_tco2e_per_unit   REAL DEFAULT 0,
  end_of_life_tco2e_per_unit REAL DEFAULT 0,
  total_tco2e_per_unit       REAL DEFAULT 0,
  units_sold                 REAL,
  total_lifecycle_tco2e      REAL,
  data_quality_score         REAL,                   -- 0..100
  assurance_status           TEXT,
  evidence_r2_key            TEXT,
  notes                      TEXT,
  created_at                 TEXT DEFAULT (datetime('now')),
  UNIQUE (participant_id, product_code, reporting_year)
);

-- ────────────────────────────────────────────────────────────────────────
-- 5. Assurance workflow — auditor review + evidence pack
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assurance_engagements (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL REFERENCES participants(id),
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  reporting_year      INTEGER NOT NULL,
  scope               TEXT NOT NULL,                 -- 'scope1','scope2_location','scope2_market','scope3_all','scope3_cat1','financed_emissions'
  auditor_name        TEXT,                          -- e.g. 'KPMG','Deloitte','EY','PwC','SGS','Bureau Veritas'
  auditor_email       TEXT,
  assurance_standard  TEXT NOT NULL CHECK (assurance_standard IN ('ISAE_3000','ISAE_3410','AA1000AS','ISO_14064_3','custom')),
  assurance_level     TEXT NOT NULL CHECK (assurance_level IN ('limited','reasonable')),
  engagement_status   TEXT DEFAULT 'planned'
                       CHECK (engagement_status IN ('planned','in_progress','field_work','draft_opinion','final_opinion','withdrawn')),
  opinion             TEXT,                          -- 'clean','qualified','adverse','disclaimer'
  opinion_letter_r2_key TEXT,
  opinion_date        TEXT,
  scope_emissions_assured REAL,
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- Each finding raised by the auditor against a specific transaction or
-- methodology. Tracked to resolution.
CREATE TABLE IF NOT EXISTS assurance_findings (
  id                  TEXT PRIMARY KEY,
  engagement_id       TEXT NOT NULL REFERENCES assurance_engagements(id),
  finding_ref         TEXT,                          -- auditor's reference code
  severity            TEXT CHECK (severity IN ('observation','minor','significant','material','critical')),
  category            TEXT,                          -- 'data_quality','methodology','boundary','factor_age','restatement'
  title               TEXT NOT NULL,
  description         TEXT,
  affected_table      TEXT,                          -- e.g. 'esg_activity_transactions'
  affected_id         TEXT,
  management_response TEXT,
  status              TEXT DEFAULT 'open'
                       CHECK (status IN ('open','in_remediation','remediated','accepted','rejected')),
  due_date            TEXT,
  resolved_at         TEXT,
  resolved_by         TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- Evidence pack — every artefact rolled up for an audit (invoices,
-- meter reads, methodology docs, source-system snapshots).
CREATE TABLE IF NOT EXISTS assurance_evidence (
  id                  TEXT PRIMARY KEY,
  engagement_id       TEXT NOT NULL REFERENCES assurance_engagements(id),
  artefact_type       TEXT NOT NULL,                 -- 'invoice','meter_read','contract','methodology','calculation_workbook','transaction_export'
  description         TEXT,
  source_table        TEXT,
  source_id           TEXT,
  r2_key              TEXT NOT NULL,
  uploaded_by         TEXT,
  uploaded_at         TEXT DEFAULT (datetime('now')),
  hash_sha256         TEXT
);

-- ────────────────────────────────────────────────────────────────────────
-- 6. Climate maturity + industry benchmarks
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS climate_maturity_assessments (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  reporting_year      INTEGER NOT NULL,
  -- Five maturity pillars, each scored 0..100
  measurement_score   REAL,        -- How completely they measure emissions
  governance_score    REAL,        -- Board oversight, climate policies
  target_score        REAL,        -- SBTi-aligned, net-zero
  action_score        REAL,        -- Reduction initiatives delivered
  disclosure_score    REAL,        -- CDP/TCFD/etc. submission quality
  overall_score       REAL,        -- weighted composite
  band                TEXT CHECK (band IN ('starter','beginner','intermediate','advanced','leader')),
  assessed_at         TEXT DEFAULT (datetime('now')),
  notes               TEXT
);

-- Sector benchmarks (published by sector, region, year). Seeded with
-- 2024 reference values for SA + global headline industries.
CREATE TABLE IF NOT EXISTS industry_benchmarks (
  id              TEXT PRIMARY KEY,
  sector_nace     TEXT NOT NULL,
  sector_name     TEXT NOT NULL,
  region          TEXT NOT NULL,
  reporting_year  INTEGER NOT NULL,
  metric          TEXT NOT NULL,                     -- 'scope1_per_revenue','scope2_per_kwh','total_per_employee','renewable_pct'
  p25             REAL,
  p50             REAL,
  p75             REAL,
  unit            TEXT,
  sample_size     INTEGER,
  source          TEXT,
  UNIQUE (sector_nace, region, reporting_year, metric)
);

INSERT OR IGNORE INTO industry_benchmarks (id, sector_nace, sector_name, region, reporting_year, metric, p25, p50, p75, unit, sample_size, source) VALUES
  ('bm_power_za_24_int',    'D35.1', 'Electric power generation',      'ZA', 2024, 'scope1_intensity', 0.45, 0.78, 0.96, 'kgCO2e/kWh', 80, 'Eskom GHG + JSE ENV-04'),
  ('bm_power_global_24',    'D35.1', 'Electric power generation',      'GLB',2024, 'scope1_intensity', 0.28, 0.42, 0.65, 'kgCO2e/kWh', 540,'IEA + CDP'),
  ('bm_mining_za_24_int',   'B05',   'Mining of coal & lignite',       'ZA', 2024, 'scope1_per_revenue', 0.18, 0.28, 0.44, 'kgCO2e/ZAR', 32,'Carbon Disclosure SA'),
  ('bm_banking_za_24_fe',   'K64',   'Financial services',             'ZA', 2024, 'financed_per_loan_zar', 0.05, 0.11, 0.21, 'kgCO2e/ZAR', 12, 'PCAF SA'),
  ('bm_realestate_za_24',   'L68',   'Real estate (commercial)',       'ZA', 2024, 'scope2_per_m2', 0.045, 0.085, 0.130, 'kgCO2e/m2/yr', 28, 'GRESB SA'),
  ('bm_retail_za_24_int',   'G47',   'Retail trade',                   'ZA', 2024, 'scope2_per_revenue', 0.012, 0.022, 0.038, 'kgCO2e/ZAR', 55, 'JSE Retailers'),
  ('bm_telco_za_24_renew',  'J61',   'Telecommunications',             'ZA', 2024, 'renewable_pct',     20.0, 40.0, 65.0, '%',          18, 'CDP Climate'),
  ('bm_steel_global_24_t',  'C24.1', 'Steel manufacturing',            'GLB',2024, 'tco2e_per_tonne',   1.4,  1.8,  2.4,  'tCO2e/t steel', 87, 'ResponsibleSteel'),
  ('bm_aviation_global_24', 'H51',   'Aviation (passenger)',           'GLB',2024, 'gco2e_per_pkm',     65,   88,   110,  'gCO2e/pkm',    34, 'IATA'),
  ('bm_cement_global_24',   'C23.5', 'Cement manufacturing',           'GLB',2024, 'tco2e_per_tonne',   0.55, 0.65, 0.78, 'tCO2e/t cement',64, 'GCCA');

-- ────────────────────────────────────────────────────────────────────────
-- 7. Spend categorisation hints (EEIO auto-tag)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spend_category_hints (
  id              TEXT PRIMARY KEY,
  pattern         TEXT NOT NULL,                     -- regex / phrase
  pattern_type    TEXT DEFAULT 'phrase' CHECK (pattern_type IN ('phrase','regex','exact')),
  suggested_activity_code TEXT NOT NULL,             -- joins to esg_emission_factors.activity_code
  suggested_scope INTEGER NOT NULL,
  suggested_scope3_category INTEGER,
  confidence      REAL,
  notes           TEXT
);

INSERT OR IGNORE INTO spend_category_hints (id, pattern, pattern_type, suggested_activity_code, suggested_scope, suggested_scope3_category, confidence, notes) VALUES
  ('sch_diesel',  'diesel',       'phrase', 'fuel.diesel.litre',      1, NULL, 0.95, NULL),
  ('sch_petrol',  'petrol|gasoline','regex','fuel.petrol.litre',     1, NULL, 0.95, NULL),
  ('sch_elec',    'eskom|electricity|kwh','regex','electricity.grid.kwh',2, NULL, 0.90, NULL),
  ('sch_flight',  'flight|airline|airways|sa.express','regex','travel.flight.short_haul', 3, 6, 0.80, NULL),
  ('sch_hotel',   'hotel|protea|tsogo|sun international','regex','travel.hotel.night',3,6, 0.75, NULL),
  ('sch_freight', 'freight|courier|transnet','regex','transport.road.tkm',3,4, 0.70, NULL),
  ('sch_natgas',  'natural gas|sasol gas|natgas','regex','fuel.natural_gas.m3',1,NULL,0.90,NULL),
  ('sch_lpg',     'lpg|liquefied petroleum','regex','fuel.lpg.kg',1,NULL,0.85,NULL),
  ('sch_coal',    'coal|anthracite','regex','fuel.coal.tonne',1,NULL,0.85,NULL),
  ('sch_construction','construction|building|epc','regex','spend.construction.zar',3,2,0.65,NULL),
  ('sch_services','consulting|advisory|legal|audit','regex','spend.services.zar',3,1,0.60,NULL);

-- ────────────────────────────────────────────────────────────────────────
-- 8. Anomaly flags on ESG transactions
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS esg_anomaly_flags (
  id                      TEXT PRIMARY KEY,
  transaction_id          TEXT NOT NULL REFERENCES esg_activity_transactions(id),
  participant_id          TEXT NOT NULL,
  tenant_id               TEXT DEFAULT 'default' NOT NULL,
  rule                    TEXT NOT NULL,             -- 'spike_30d','factor_mismatch','duplicate','unit_inconsistency','restatement_needed','impossible_value'
  severity                TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  detail                  TEXT,
  expected_value          REAL,
  observed_value          REAL,
  status                  TEXT DEFAULT 'open' CHECK (status IN ('open','dismissed','resolved')),
  detected_at             TEXT DEFAULT (datetime('now')),
  resolved_at             TEXT,
  resolved_by             TEXT
);
CREATE INDEX IF NOT EXISTS idx_anomaly_part_status ON esg_anomaly_flags(participant_id, status);

-- ────────────────────────────────────────────────────────────────────────
-- 9. Multi-jurisdiction disclosure registry
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS disclosure_jurisdictions (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  region          TEXT,
  effective_year  INTEGER,
  mandatory       INTEGER DEFAULT 1,
  description     TEXT
);

INSERT OR IGNORE INTO disclosure_jurisdictions (code, name, region, effective_year, mandatory, description) VALUES
  ('CDP',         'CDP Climate Change',           'GLB', 2003, 0, 'Voluntary global climate disclosure'),
  ('TCFD',        'TCFD Recommendations',         'GLB', 2017, 0, 'Task Force on Climate-related Financial Disclosures'),
  ('ISSB_S2',     'ISSB IFRS S2 Climate',         'GLB', 2024, 1, 'IFRS Sustainability Disclosure Standards — Climate'),
  ('CSRD',        'EU CSRD / ESRS E1',            'EU',  2024, 1, 'Corporate Sustainability Reporting Directive — large EU + foreign-listed'),
  ('SEC_CLIMATE', 'US SEC Climate Disclosure',    'US',  2024, 1, 'SEC Rule for Enhancement and Standardization of Climate-Related Disclosures'),
  ('CA_SB253',    'California SB-253',            'US',  2026, 1, 'CA Climate Corporate Data Accountability Act — Scope 1/2/3 for $1B+ revenue'),
  ('CA_SB261',    'California SB-261',            'US',  2026, 1, 'CA Climate-Related Financial Risk Act — biennial TCFD-aligned risk report'),
  ('UK_SECR',     'UK Streamlined Energy & Carbon','UK', 2019, 1, 'UK Companies Act mandatory energy + carbon disclosure'),
  ('UK_TCFD',     'UK Mandatory TCFD',            'UK',  2022, 1, 'FCA TCFD-aligned disclosure for premium listed companies'),
  ('SG_SGX',      'Singapore SGX Climate',        'SG',  2025, 1, 'SGX mandatory climate reporting (TCFD-aligned)'),
  ('JP_TCFD',     'Japan TCFD',                   'JP',  2022, 1, 'Tokyo Stock Exchange Prime Market mandatory TCFD'),
  ('AU_NCT',      'Australia National Climate',   'AU',  2025, 1, 'Australian Sustainability Reporting Standards (TCFD + ISSB aligned)'),
  ('ZA_NERSA',    'NERSA returns',                'ZA',  2010, 1, 'South Africa NERSA quarterly + annual returns'),
  ('ZA_CARBON_TAX','SA Carbon Tax Act',           'ZA',  2019, 1, 'Carbon Tax Act 15 of 2019 — s.13 offset claims'),
  ('JSE_SRL',     'JSE Sustainability + Climate', 'ZA',  2022, 1, 'JSE Sustainability Disclosure Guidance + Climate Change Disclosure Guidance'),
  ('GHG_PROTOCOL','GHG Protocol Corporate',       'GLB', 2001, 0, 'Foundational corporate accounting standard'),
  ('PCAF',        'PCAF Financed Emissions',      'GLB', 2020, 0, 'Partnership for Carbon Accounting Financials'),
  ('NZBA',        'Net Zero Banking Alliance',    'GLB', 2021, 0, 'UNEP-FI banking net-zero alignment'),
  ('GFANZ',       'GFANZ',                        'GLB', 2021, 0, 'Glasgow Financial Alliance for Net Zero'),
  ('SBTI',        'SBTi Target Validation',       'GLB', 2015, 0, 'Science Based Targets initiative');

-- Per-participant submissions to each jurisdiction (separate from
-- esg_disclosures so one fiscal-year scope dataset can be filed to many
-- regulators).
CREATE TABLE IF NOT EXISTS disclosure_submissions (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  jurisdiction        TEXT NOT NULL REFERENCES disclosure_jurisdictions(code),
  reporting_year      INTEGER NOT NULL,
  source_disclosure_id TEXT REFERENCES esg_disclosures(id),  -- the underlying scope rollup
  status              TEXT DEFAULT 'draft'
                       CHECK (status IN ('draft','queued','submitted','accepted','rejected','withdrawn')),
  submitted_at        TEXT,
  acknowledged_at     TEXT,
  external_reference  TEXT,
  filing_pack_r2_key  TEXT,
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_disc_subs_part_year ON disclosure_submissions(participant_id, reporting_year, jurisdiction);

-- ────────────────────────────────────────────────────────────────────────
-- 10. Capital-markets specifics
-- ────────────────────────────────────────────────────────────────────────

-- Capital markets facilitated emissions (PCAF Part B for banks +
-- underwriters acting on capital-raising).
CREATE TABLE IF NOT EXISTS pcaf_facilitated_emissions (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  reporting_year      INTEGER NOT NULL,
  transaction_type    TEXT NOT NULL,                 -- 'equity_underwriting','debt_underwriting','syndicated_loan','green_bond'
  issuer_id           TEXT,
  issuer_name         TEXT,
  facilitation_zar    REAL NOT NULL,                 -- value placed
  issuer_sector       TEXT,
  issuer_evic_zar     REAL,
  issuer_scope1_tco2e REAL,
  issuer_scope2_tco2e REAL,
  issuer_scope3_tco2e REAL,
  weighting_factor    REAL DEFAULT 0.33,             -- PCAF default for facilitated emissions
  facilitated_tco2e   REAL,
  status              TEXT DEFAULT 'recorded',
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- Portfolio temperature alignment (SBTi-FI / 1.5°C alignment by sector).
CREATE TABLE IF NOT EXISTS portfolio_temperature_alignment (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  reporting_year  INTEGER NOT NULL,
  sector          TEXT,                              -- 'power','oil_gas',… or 'portfolio'
  methodology     TEXT,                              -- 'SDA','GEVA','PACTA'
  temperature_c   REAL NOT NULL,                     -- implied temperature rise (°C)
  pathway         TEXT,                              -- 'IEA NZE','PRIMAP',…
  computed_at     TEXT DEFAULT (datetime('now')),
  notes           TEXT
);
