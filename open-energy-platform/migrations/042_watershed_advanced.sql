-- ════════════════════════════════════════════════════════════════════════
-- 042 · Watershed-parity advanced features
--
-- Closes the remaining gaps vs. the watershed.com product surface:
--
--   1. PCAF Part C — Insurance-associated emissions
--   2. NGFS scenario analysis / climate stress testing
--   3. Counterparty data-collection portal (share-link tokens)
--   4. AI carbon-accountant classifier audit log
--   5. Sectoral pathway library (IEA NZE / NGFS curves)
--   6. Hash-chain immutable audit trail
--   7. Hourly REC marketplace
--
-- All tables tenant-scoped via tenant_id and pinned to participants where
-- applicable. Seeds the NGFS scenarios catalogue + IEA NZE pathways so
-- the new tabs surface meaningful data immediately.
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1. PCAF Part C — Insurance-associated emissions
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pcaf_insurance_emissions (
  id                            TEXT PRIMARY KEY,
  participant_id                TEXT NOT NULL REFERENCES participants(id),
  tenant_id                     TEXT DEFAULT 'default' NOT NULL,
  reporting_year                INTEGER NOT NULL,
  -- Insurance line of business per PCAF Part C
  line_of_business              TEXT NOT NULL CHECK (line_of_business IN (
                                  'commercial_lines','personal_motor','commercial_motor',
                                  'property','marine','aviation','energy','agriculture',
                                  'health','life','reinsurance'
                                )),
  -- Insured counterparty / asset
  insured_name                  TEXT NOT NULL,
  insured_country               TEXT,
  insured_sector_nace           TEXT,
  policy_reference              TEXT,
  premium_zar                   REAL NOT NULL,
  -- Attribution: PCAF Part C uses gross-written-premium / total-customer-revenue
  attribution_method            TEXT DEFAULT 'premium_to_revenue'
                                CHECK (attribution_method IN (
                                  'premium_to_revenue','premium_to_revenue_minus_claims',
                                  'activity_based','asset_value'
                                )),
  insured_revenue_zar           REAL,
  insured_scope1_tco2e          REAL,
  insured_scope2_tco2e          REAL,
  insured_scope3_tco2e          REAL,
  emissions_data_source         TEXT,
  pcaf_data_quality_score       INTEGER CHECK (pcaf_data_quality_score BETWEEN 1 AND 5),
  attribution_factor            REAL,
  insurance_associated_tco2e    REAL,
  status                        TEXT DEFAULT 'recorded'
                                CHECK (status IN ('draft','recorded','assured','restated','retired')),
  notes                         TEXT,
  created_at                    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pcaf_ins_part_year ON pcaf_insurance_emissions(participant_id, reporting_year, line_of_business);

-- ────────────────────────────────────────────────────────────────────────
-- 2. NGFS scenario analysis / climate stress testing
-- ────────────────────────────────────────────────────────────────────────

-- Reference scenarios catalogue. Seeded with NGFS Phase IV reference set.
CREATE TABLE IF NOT EXISTS climate_scenarios (
  code            TEXT PRIMARY KEY,
  family          TEXT NOT NULL,   -- 'NGFS','IEA','IPCC','Watershed_custom'
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,   -- 'orderly','disorderly','hot_house','too_little_too_late','net_zero'
  temperature_2100_c REAL,
  carbon_price_2030_usd REAL,
  carbon_price_2050_usd REAL,
  transition_risk TEXT,             -- 'low','medium','high','very_high'
  physical_risk   TEXT,             -- 'low','medium','high','very_high'
  description     TEXT,
  pathway_doc_url TEXT
);

INSERT OR IGNORE INTO climate_scenarios (code, family, name, category, temperature_2100_c, carbon_price_2030_usd, carbon_price_2050_usd, transition_risk, physical_risk, description) VALUES
  ('NGFS_NET_ZERO',     'NGFS','NGFS Net Zero 2050',                'net_zero',           1.4,  130, 250, 'high',      'low',       'Orderly transition reaching net zero 2050 with stringent climate policy.'),
  ('NGFS_BELOW_2C',     'NGFS','NGFS Below 2°C',                    'orderly',            1.7,   80, 160, 'medium',    'low',       'Below 2°C orderly transition with gradual policy tightening.'),
  ('NGFS_DELAYED',      'NGFS','NGFS Delayed Transition',           'disorderly',         1.8,   45, 220, 'very_high', 'medium',    'Delayed action requires aggressive policies post-2030 — high transition risk.'),
  ('NGFS_NDCs',         'NGFS','NGFS Nationally Determined',        'too_little_too_late',2.5,   30,  80, 'medium',    'high',      'Implementation of pledged NDCs only — insufficient for 1.5°C.'),
  ('NGFS_CURRENT',      'NGFS','NGFS Current Policies',             'hot_house',          3.0,   15,  35, 'low',       'very_high', 'Continuation of current policies — leads to ~3°C hot-house world.'),
  ('NGFS_FRAGMENTED',   'NGFS','NGFS Fragmented World',             'disorderly',         2.3,   55, 130, 'high',      'high',      'Geopolitical fragmentation, asymmetric carbon-pricing rollout.'),
  ('IEA_NZE_2050',      'IEA', 'IEA Net Zero Emissions 2050',       'net_zero',           1.4,  140, 250, 'high',      'low',       'IEA Net Zero by 2050 reference roadmap.'),
  ('IEA_APS',           'IEA', 'IEA Announced Pledges',             'orderly',            1.7,  100, 200, 'medium',    'medium',    'IEA Announced Pledges Scenario — full implementation of net-zero pledges.'),
  ('IEA_STEPS',         'IEA', 'IEA Stated Policies',               'hot_house',          2.4,   50, 100, 'low',       'high',      'IEA Stated Policies — only currently legislated measures.'),
  ('IPCC_SSP1_19',      'IPCC','IPCC SSP1-1.9',                     'net_zero',           1.4,  140, 270, 'high',      'low',       'IPCC SSP1-1.9 — limits warming to 1.5°C.'),
  ('IPCC_SSP2_45',      'IPCC','IPCC SSP2-4.5',                     'hot_house',          2.7,   25,  60, 'low',       'very_high', 'IPCC SSP2-4.5 middle-of-the-road scenario.'),
  ('IPCC_SSP5_85',      'IPCC','IPCC SSP5-8.5',                     'hot_house',          4.4,   10,  20, 'low',       'very_high', 'IPCC SSP5-8.5 fossil-fuel-development trajectory.');

-- Per-participant scenario runs (each row is one run of the bank's
-- portfolio through one scenario, generating sectoral impacts).
CREATE TABLE IF NOT EXISTS scenario_runs (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL REFERENCES participants(id),
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  scenario_code       TEXT NOT NULL REFERENCES climate_scenarios(code),
  horizon_years       INTEGER NOT NULL,             -- 5 / 10 / 30 yrs
  base_year           INTEGER NOT NULL,
  -- Aggregated outputs
  portfolio_emissions_base_tco2e   REAL,
  portfolio_emissions_target_tco2e REAL,
  emissions_at_risk_tco2e          REAL,
  financial_value_at_risk_zar      REAL,
  -- Worst-affected sector
  worst_sector_nace                TEXT,
  worst_sector_var_zar             REAL,
  -- Output detail (JSON: per-sector impact array)
  sector_impacts_json              TEXT,
  status              TEXT DEFAULT 'complete' CHECK (status IN ('queued','running','complete','failed')),
  computed_at         TEXT DEFAULT (datetime('now')),
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_scenario_runs_part ON scenario_runs(participant_id, scenario_code, computed_at);

-- ────────────────────────────────────────────────────────────────────────
-- 3. Counterparty data-collection portal
-- ────────────────────────────────────────────────────────────────────────

-- Each request is one share-link issued to a counterparty so they can
-- self-report emissions for PCAF DQ 1-2 sourcing.
CREATE TABLE IF NOT EXISTS counterparty_data_requests (
  id                  TEXT PRIMARY KEY,
  requestor_id        TEXT NOT NULL REFERENCES participants(id),
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  counterparty_name   TEXT NOT NULL,
  counterparty_email  TEXT,
  share_token         TEXT NOT NULL UNIQUE,         -- url-safe random token
  reporting_year      INTEGER NOT NULL,
  scope_requested     TEXT NOT NULL,                -- 'scope1_only','scope1_and_2','all_scopes','custom'
  asset_class         TEXT,                          -- joins to pcaf_asset_classes if PCAF-driven
  exposure_zar        REAL,
  status              TEXT DEFAULT 'sent'
                       CHECK (status IN ('drafted','sent','viewed','submitted','accepted','rejected','expired')),
  sent_at             TEXT,
  expires_at          TEXT,
  reminder_count      INTEGER DEFAULT 0,
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cp_req_token ON counterparty_data_requests(share_token);
CREATE INDEX IF NOT EXISTS idx_cp_req_part ON counterparty_data_requests(requestor_id, reporting_year);

-- What the counterparty actually submitted.
CREATE TABLE IF NOT EXISTS counterparty_submissions (
  id                  TEXT PRIMARY KEY,
  request_id          TEXT NOT NULL REFERENCES counterparty_data_requests(id),
  submitter_email     TEXT,
  submitter_role      TEXT,                          -- 'cfo','sustainability_head','operations','other'
  revenue_zar         REAL,
  evic_zar            REAL,
  scope1_tco2e        REAL,
  scope2_tco2e        REAL,
  scope3_tco2e        REAL,
  reporting_standard  TEXT,                          -- 'GHG Protocol','ISO 14064','custom'
  assurance_provider  TEXT,
  assurance_level     TEXT,                          -- 'none','limited','reasonable'
  evidence_r2_key     TEXT,
  attestation         TEXT,                          -- text attestation by submitter
  ip_address          TEXT,
  user_agent          TEXT,
  submitted_at        TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────────────
-- 4. AI carbon-accountant classifier audit log
-- ────────────────────────────────────────────────────────────────────────
-- Every AI classification call is recorded for audit (Watershed-style
-- explainability). Stored even if rejected by the user.

CREATE TABLE IF NOT EXISTS ai_classification_logs (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  input_text          TEXT NOT NULL,                 -- the line item / invoice description
  input_amount        REAL,
  input_unit          TEXT,
  -- Model output
  model_id            TEXT,                          -- e.g. '@cf/meta/llama-3.1-8b-instruct'
  suggested_activity_code TEXT,
  suggested_scope     INTEGER,
  suggested_scope3_category INTEGER,
  confidence          REAL,
  reasoning           TEXT,
  alternatives_json   TEXT,                          -- JSON array of top-3 alternatives
  -- User outcome
  user_accepted       INTEGER DEFAULT 0,             -- 0/1
  user_override_code  TEXT,
  resolved_at         TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_logs_part ON ai_classification_logs(participant_id, created_at);

-- ────────────────────────────────────────────────────────────────────────
-- 5. Sectoral pathway library (IEA NZE / NGFS curves)
-- ────────────────────────────────────────────────────────────────────────
-- Per-year decarbonisation pathways for SDA / 1.5°C alignment. The
-- /watershed/pathways endpoint returns these for benchmarking.

CREATE TABLE IF NOT EXISTS sectoral_pathways (
  id              TEXT PRIMARY KEY,
  pathway_code    TEXT NOT NULL,                     -- 'IEA_NZE_2050','NGFS_NET_ZERO'
  sector          TEXT NOT NULL,                     -- 'power','steel','cement','aluminum','aviation','shipping','road_freight','oil_gas','buildings'
  year            INTEGER NOT NULL,
  intensity_value REAL NOT NULL,                     -- intensity at this year
  unit            TEXT NOT NULL,                     -- 'kgCO2e/kWh','tCO2e/t','gCO2e/pkm'
  notes           TEXT,
  UNIQUE (pathway_code, sector, year)
);

-- Seed IEA NZE 2050 power-sector intensity curve (kgCO2e/kWh, global avg).
INSERT OR IGNORE INTO sectoral_pathways (id, pathway_code, sector, year, intensity_value, unit, notes) VALUES
  ('iea_nze_power_2020','IEA_NZE_2050','power',2020,0.460,'kgCO2e/kWh','Base year — IEA NZE 2050'),
  ('iea_nze_power_2025','IEA_NZE_2050','power',2025,0.320,'kgCO2e/kWh','IEA NZE pathway'),
  ('iea_nze_power_2030','IEA_NZE_2050','power',2030,0.140,'kgCO2e/kWh','IEA NZE pathway'),
  ('iea_nze_power_2035','IEA_NZE_2050','power',2035,0.050,'kgCO2e/kWh','IEA NZE pathway'),
  ('iea_nze_power_2040','IEA_NZE_2050','power',2040,0.005,'kgCO2e/kWh','IEA NZE pathway'),
  ('iea_nze_power_2050','IEA_NZE_2050','power',2050,0.000,'kgCO2e/kWh','Net zero power by 2050'),
  -- Steel
  ('iea_nze_steel_2020','IEA_NZE_2050','steel',2020,1.85,'tCO2e/t','Base year — IEA NZE 2050'),
  ('iea_nze_steel_2025','IEA_NZE_2050','steel',2025,1.55,'tCO2e/t','IEA NZE pathway'),
  ('iea_nze_steel_2030','IEA_NZE_2050','steel',2030,1.20,'tCO2e/t','IEA NZE pathway'),
  ('iea_nze_steel_2035','IEA_NZE_2050','steel',2035,0.80,'tCO2e/t','IEA NZE pathway'),
  ('iea_nze_steel_2040','IEA_NZE_2050','steel',2040,0.40,'tCO2e/t','IEA NZE pathway'),
  ('iea_nze_steel_2050','IEA_NZE_2050','steel',2050,0.10,'tCO2e/t','Near-zero steel'),
  -- Cement
  ('iea_nze_cement_2020','IEA_NZE_2050','cement',2020,0.620,'tCO2e/t','Base year'),
  ('iea_nze_cement_2025','IEA_NZE_2050','cement',2025,0.580,'tCO2e/t','IEA NZE pathway'),
  ('iea_nze_cement_2030','IEA_NZE_2050','cement',2030,0.480,'tCO2e/t','IEA NZE pathway'),
  ('iea_nze_cement_2035','IEA_NZE_2050','cement',2035,0.340,'tCO2e/t','IEA NZE pathway'),
  ('iea_nze_cement_2040','IEA_NZE_2050','cement',2040,0.210,'tCO2e/t','IEA NZE pathway'),
  ('iea_nze_cement_2050','IEA_NZE_2050','cement',2050,0.040,'tCO2e/t','Near-zero cement'),
  -- Aluminum
  ('iea_nze_alu_2020','IEA_NZE_2050','aluminum',2020,15.5,'tCO2e/t','Base year'),
  ('iea_nze_alu_2030','IEA_NZE_2050','aluminum',2030, 9.5,'tCO2e/t','IEA NZE pathway'),
  ('iea_nze_alu_2050','IEA_NZE_2050','aluminum',2050, 2.0,'tCO2e/t','Near-zero primary aluminum'),
  -- Aviation passenger (gCO2e/pkm)
  ('iea_nze_avia_2020','IEA_NZE_2050','aviation',2020,90,'gCO2e/pkm','Base year'),
  ('iea_nze_avia_2030','IEA_NZE_2050','aviation',2030,60,'gCO2e/pkm','IEA NZE pathway with SAF ramp'),
  ('iea_nze_avia_2050','IEA_NZE_2050','aviation',2050, 5,'gCO2e/pkm','Near-zero aviation via SAF + hydrogen'),
  -- Shipping (gCO2e/tkm)
  ('iea_nze_ship_2020','IEA_NZE_2050','shipping',2020,15,'gCO2e/tkm','Base year'),
  ('iea_nze_ship_2030','IEA_NZE_2050','shipping',2030,10,'gCO2e/tkm','IEA NZE pathway'),
  ('iea_nze_ship_2050','IEA_NZE_2050','shipping',2050, 1,'gCO2e/tkm','Near-zero shipping'),
  -- Road freight (gCO2e/tkm)
  ('iea_nze_road_2020','IEA_NZE_2050','road_freight',2020,95,'gCO2e/tkm','Base year'),
  ('iea_nze_road_2030','IEA_NZE_2050','road_freight',2030,60,'gCO2e/tkm','IEA NZE pathway with EV penetration'),
  ('iea_nze_road_2050','IEA_NZE_2050','road_freight',2050, 5,'gCO2e/tkm','Near-zero road freight'),
  -- Oil and gas
  ('iea_nze_og_2020','IEA_NZE_2050','oil_gas',2020,420,'kgCO2e/MWh','Base year primary energy'),
  ('iea_nze_og_2030','IEA_NZE_2050','oil_gas',2030,250,'kgCO2e/MWh','IEA NZE pathway'),
  ('iea_nze_og_2050','IEA_NZE_2050','oil_gas',2050, 30,'kgCO2e/MWh','Residual oil-and-gas under NZE'),
  -- Buildings (kgCO2e/m2/yr)
  ('iea_nze_bld_2020','IEA_NZE_2050','buildings',2020,0.085,'kgCO2e/m2/yr','Base year commercial buildings'),
  ('iea_nze_bld_2030','IEA_NZE_2050','buildings',2030,0.045,'kgCO2e/m2/yr','IEA NZE pathway'),
  ('iea_nze_bld_2050','IEA_NZE_2050','buildings',2050,0.005,'kgCO2e/m2/yr','Near-zero buildings');

-- NGFS Net Zero seeds (deliberately curve-aligned with IEA NZE for the
-- big sectors so consumers see a coherent pathway library).
INSERT OR IGNORE INTO sectoral_pathways (id, pathway_code, sector, year, intensity_value, unit, notes) VALUES
  ('ngfs_nz_power_2020','NGFS_NET_ZERO','power',2020,0.470,'kgCO2e/kWh','Base year'),
  ('ngfs_nz_power_2030','NGFS_NET_ZERO','power',2030,0.150,'kgCO2e/kWh','NGFS NZ pathway'),
  ('ngfs_nz_power_2050','NGFS_NET_ZERO','power',2050,0.005,'kgCO2e/kWh','NGFS NZ pathway'),
  ('ngfs_nz_og_2020','NGFS_NET_ZERO','oil_gas',2020,425,'kgCO2e/MWh','Base year'),
  ('ngfs_nz_og_2030','NGFS_NET_ZERO','oil_gas',2030,255,'kgCO2e/MWh','NGFS NZ pathway'),
  ('ngfs_nz_og_2050','NGFS_NET_ZERO','oil_gas',2050, 40,'kgCO2e/MWh','NGFS NZ pathway'),
  ('ngfs_nz_steel_2030','NGFS_NET_ZERO','steel',2030,1.25,'tCO2e/t','NGFS NZ pathway'),
  ('ngfs_nz_steel_2050','NGFS_NET_ZERO','steel',2050,0.15,'tCO2e/t','NGFS NZ pathway'),
  ('ngfs_nz_cement_2030','NGFS_NET_ZERO','cement',2030,0.50,'tCO2e/t','NGFS NZ pathway'),
  ('ngfs_nz_cement_2050','NGFS_NET_ZERO','cement',2050,0.05,'tCO2e/t','NGFS NZ pathway');

-- ────────────────────────────────────────────────────────────────────────
-- 6. Hash-chain immutable audit trail
-- ────────────────────────────────────────────────────────────────────────
-- Each row contains a SHA-256 hash of (prev_hash || canonical-record-json).
-- The chain breaks if any record is mutated, enabling external auditors
-- to detect tampering.

CREATE TABLE IF NOT EXISTS audit_chain (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT,
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  sequence_no     INTEGER NOT NULL,                  -- monotonically increasing within tenant
  entity_table    TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE','RESTATE','VOID')),
  actor_id        TEXT,
  payload_json    TEXT NOT NULL,                     -- canonical-JSON serialisation of the record
  prev_hash       TEXT,                               -- SHA-256 hex of prior chain entry
  this_hash       TEXT NOT NULL,                     -- SHA-256(prev_hash || payload_json)
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_chain_tenant ON audit_chain(tenant_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_audit_chain_entity ON audit_chain(entity_table, entity_id);

-- ────────────────────────────────────────────────────────────────────────
-- 7. Hourly REC marketplace
-- ────────────────────────────────────────────────────────────────────────
-- 24/7 CFE requires hourly RECs (also called "time-matched" or "T-EACs").
-- Watershed offers a marketplace for sourcing them. We model listings +
-- trades + retirement against a specific hour.

CREATE TABLE IF NOT EXISTS rec_hourly_listings (
  id                  TEXT PRIMARY KEY,
  seller_id           TEXT NOT NULL REFERENCES participants(id),
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  technology          TEXT NOT NULL CHECK (technology IN ('solar','wind','hydro','nuclear','geothermal','battery')),
  grid_zone           TEXT NOT NULL,
  hour_utc            TEXT NOT NULL,                  -- ISO hour-truncated UTC
  available_kwh       REAL NOT NULL,
  remaining_kwh       REAL NOT NULL,
  price_zar_per_kwh   REAL NOT NULL,
  certificate_ref     TEXT,                            -- IRECs / GO / equivalent serial
  status              TEXT DEFAULT 'listed'
                       CHECK (status IN ('listed','partial','sold_out','withdrawn')),
  created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rec_listing_hour ON rec_hourly_listings(grid_zone, hour_utc, status);

CREATE TABLE IF NOT EXISTS rec_hourly_trades (
  id                  TEXT PRIMARY KEY,
  listing_id          TEXT NOT NULL REFERENCES rec_hourly_listings(id),
  buyer_id            TEXT NOT NULL REFERENCES participants(id),
  tenant_id           TEXT DEFAULT 'default' NOT NULL,
  kwh                 REAL NOT NULL,
  price_zar_per_kwh   REAL NOT NULL,
  total_zar           REAL NOT NULL,
  hour_utc            TEXT NOT NULL,
  retired_at          TEXT,                            -- non-null once retired against a load hour
  retirement_purpose  TEXT,                            -- '24/7 CFE matching','annual scope 2','voluntary'
  created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rec_trades_buyer ON rec_hourly_trades(buyer_id, hour_utc);
