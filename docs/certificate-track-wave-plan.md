# Open Energy Platform — Certificate Track & Platform Parity Wave Plan

## Executive Summary

This plan extends the Open Energy Platform into South Africa's certificate and compliance markets, covering I-REC/zaRECs issuance (Track A), Voluntary Carbon Market project development and trading (Track B), and Carbon Tax Act Phase 2 compliance workflow (Track C). It also closes the 40 platform parity gaps identified across all roles (W226–W280). The certificate track creates a standalone entry point for IPPs, C&I generators, and corporate buyers who do not need power trading, with a structured upgrade path to the full platform.

---

## 1. Certificate Track Architecture

### Overview

Three tracks share a common data backbone (oe_certificate_participants, oe_certificate_bundles) but have distinct chain lifecycles, API integrations, and revenue models. All tracks are accessible to a `certificate_only` participant type without requiring FSCA FSP licensing or clearing membership.

```
certificate_only participant
        │
        ├── Track A: REC  ─────── W70 rec-lifecycle + new W226 REC Issuance Engine
        │                          zaRECs / I-REC / SAREC registry bridges
        │
        ├── Track B: VCM  ─────── W37 registration + W11 MRV + W17 retirement
        │                          AI PDD generation, Verra/GS/Art6.4 methodologies
        │
        └── Track C: Carbon Tax ─ W48 offset claim (existing) + new W226 COAS Workflow
                                   SARS eFiling bridge, Phase 2 budget tracking
```

---

### Track A: Renewable Energy Certificates (REC)

#### Data Model

**New tables required:**

```sql
-- Device registration (generator-side, one per facility)
CREATE TABLE oe_rec_devices (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
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
  registry_device_id TEXT,       -- assigned by issuer after registration
  registration_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(registration_status IN ('pending','submitted','registered','suspended','expired')),
  registration_expiry TEXT,
  metering_arrangement TEXT CHECK(metering_arrangement IN
    ('utility_meter','scada','inverter_api','third_party_audited')),
  inverter_api_type TEXT CHECK(inverter_api_type IN
    ('solax','huawei_fusion','fronius','sma','solis','none')),
  inverter_api_credential_ref TEXT,  -- KV key for encrypted API credentials
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Metering periods and production data
CREATE TABLE oe_rec_metering_periods (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES oe_rec_devices(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  gross_mwh REAL NOT NULL,
  net_mwh REAL NOT NULL,                -- net exported (what is certified)
  meter_source TEXT NOT NULL CHECK(meter_source IN
    ('utility_invoice','scada_export','inverter_api','manual_upload')),
  evidence_r2_key TEXT,                 -- raw meter data in R2 vault
  fractional_carry_mwh REAL DEFAULT 0, -- sub-1MWh rolled forward
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK(status IN ('pending_verification','verified','submitted','issued','rejected')),
  verification_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Issuance requests and issued certificates
CREATE TABLE oe_rec_issuance_requests (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES oe_rec_devices(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  net_mwh REAL NOT NULL,
  certificates_requested INTEGER NOT NULL,  -- floor(net_mwh)
  registry_submission_ref TEXT,
  issuer_invoice_ref TEXT,
  fee_zar REAL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN
      ('draft','submitted_to_issuer','payment_pending','payment_confirmed',
       'processing','issued','rejected','cancelled')),
  issued_certificate_ids TEXT,  -- JSON array of registry cert IDs
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Certificate holdings (post-issuance, pre-retirement)
CREATE TABLE oe_rec_holdings (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Retirement records (irrevocable)
CREATE TABLE oe_rec_retirements (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  beneficiary_name TEXT NOT NULL,
  beneficiary_purpose TEXT NOT NULL CHECK(beneficiary_purpose IN
    ('scope2_ghg_protocol','re100','sbti','cdp','iso14064','jse_esg','gbcsa_green_star','other')),
  registry_standard TEXT NOT NULL,
  total_mwh INTEGER NOT NULL,
  total_zar REAL,
  holding_ids TEXT NOT NULL,   -- JSON array
  registry_redemption_statement_r2_key TEXT,
  registry_retirement_codes TEXT,  -- JSON
  retired_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Indexes:**
```sql
CREATE INDEX idx_rec_devices_participant ON oe_rec_devices(participant_id, registration_status);
CREATE INDEX idx_rec_holdings_participant ON oe_rec_holdings(participant_id, status, vintage_start);
CREATE INDEX idx_rec_retirements_participant ON oe_rec_retirements(participant_id, retired_at);
```

#### Backend Chains

| Wave | Chain | Route | States | SLA Tier Logic | Regulator Crossings |
|------|-------|-------|---------|----------------|---------------------|
| W226 | REC Device Registration | `/api/rec/device-registration` | 10-state (draft→submitted→issuer_review→queries→responded→approved→registered→active/rejected/suspended) | Larger capacity = longer review | registered crosses NERSA (bulk utility tier) |
| W226 | REC Metering & Issuance | `/api/rec/issuance` | 10-state (period_open→data_collected→verified→submitted→payment_pending→paid→processing→issued/rejected/cancelled) | Volume-tiered SLA | issued crosses regulator at >10,000 MWh batches |
| W226 | REC Transfer | `/api/rec/transfer` | 6-state (initiated→registry_transfer→confirmed/disputed/failed/cancelled) | URGENT — 24h | N/A |
| W226 | REC Retirement | `/api/rec/retirement` | 5-state (initiated→registry_processed→statement_issued/failed/cancelled) | Immediate | retired crosses regulator EVERY tier (double-counting integrity signature) |

**Note:** W70 (existing rec-lifecycle-chain) handles the issuer-side. The new W226 REC chains are the generator/holder-side workflow sitting above the registry interaction.

#### AI Assist Opportunities

1. **Meter anomaly detection** — compare this month's kWh to weather-normalised expected output (using site GPS + Workers AI); flag if >15% deviation before issuance submission.
2. **Vintage optimisation** — suggest whether to issue certificates now or roll forward fractional MWh given SA price trends (USD 0.20–0.80/MWh seasonal variation).
3. **Registry selection assistant** — given project size, buyer profile, and intended use (RE100, CDP, carbon tax), recommend zaRECs vs I-REC Standard with fee comparison.
4. **Retirement statement auto-draft** — generate a GHG Protocol Scope 2 market-based claim statement from retirement data, ready for CDP portal submission.
5. **Double-counting check** — before issuance, cross-reference against W37 VCM registrations and W48 carbon tax claims to prevent the same MWh being claimed under two schemes.

#### API Integrations (Track A)

| API | Purpose | Priority | Auth |
|-----|---------|----------|------|
| Solax Cloud API (api.solaxcloud.com) | Inverter meter data ingestion | P0 — existing Goldrush integration | API token in KV |
| Huawei FusionSolar API | Inverter meter data for Huawei inverters | P0 | OAuth2 |
| Fronius Solar API v1 | Inverter meter data for Fronius | P1 | Basic auth per inverter |
| SMA Sunny Portal REST | Inverter meter data for SMA | P1 | OAuth2 |
| zaRECs Registry (portal automation) | Device registration, issuance submission | P0 | Form-based; use Workers fetch with session cookie management |
| Evident Registry API (I-REC) | Programmatic issuance, transfer, retirement | P1 | Requires Platform Accreditation by I-TRACK Foundation |
| GCC (Green Certificate Company) | SA I-REC Issuer — submission portal | P0 | Email/form initially; API post-accreditation |

#### ROI / Value Calculation Engine

```typescript
// New endpoint: GET /api/rec/roi-calculator
interface RecRoiInput {
  installed_kw: number;
  capacity_factor: number;    // e.g. 0.22 for SA solar, 0.32 for SA wind
  registry_standard: 'i_rec' | 'zarecs';
  expected_cert_price_usd_per_mwh: number;  // default 0.40
  facility_years: number;
}

interface RecRoiOutput {
  annual_mwh: number;
  annual_certs: number;
  annual_cert_revenue_zar: number;
  platform_fee_zar_per_year: number;
  registry_fee_zar_per_year: number;
  net_annual_revenue_zar: number;
  five_year_npv_zar: number;
  payback_months: number;
  dffe_emission_factor: number;     // 0.942 tCO2e/MWh (2023)
  scope2_abatement_tco2e_per_year: number;
}
```

The calculator uses the DFFE DGGEF (0.942 tCO2e/MWh, 2023) via the Climatiq API for live emission factor lookups, with a fallback to the hardcoded gazette value.

---

### Track B: Voluntary Carbon Market (VCM)

#### Data Model

**New tables required:**

```sql
-- VCM project registration (upstream of W37 carbon-registration-chain)
CREATE TABLE oe_vcm_projects (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  project_name TEXT NOT NULL,
  methodology TEXT NOT NULL CHECK(methodology IN
    ('acm0002','ams_i_d','gs4gg_re','vmr0017','gs4gg_poa','art64_a6_4','custom')),
  registry_standard TEXT NOT NULL CHECK(registry_standard IN
    ('verra_vcs','gold_standard','cdm_legacy','art64','dffe_domestic')),
  crediting_period_start TEXT,
  crediting_period_end TEXT,
  project_boundary_geojson TEXT,  -- stored as JSON string
  technology TEXT NOT NULL,
  installed_capacity_kw REAL,
  reipppp_bid_ref TEXT,
  nersa_licence_ref TEXT,
  dffe_ea_ref TEXT,               -- Environmental Authorisation reference
  dffe_dggef_vintage TEXT,        -- e.g. '2023'
  dggef_tco2e_per_mwh REAL DEFAULT 0.942,
  sdg_targets TEXT,               -- JSON array, GS mandatory min 3 inc SDG13
  additionality_basis TEXT CHECK(additionality_basis IN
    ('investment_barrier','regulatory_surplus','common_practice','combined')),
  vvb_name TEXT,
  vvb_accreditation_ref TEXT,
  registry_project_id TEXT,       -- assigned post-registration
  chain_status TEXT NOT NULL DEFAULT 'conception'
    CHECK(chain_status IN
      ('conception','pdd_draft','pdd_ai_generated','stakeholder_consultation',
       'preliminary_review','validation_submitted','validation_complete',
       'registration','implementation','monitoring','verification_submitted',
       'credits_issued','active','expired','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI-generated PDD sections
CREATE TABLE oe_vcm_pdd_sections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES oe_vcm_projects(id),
  section_code TEXT NOT NULL,  -- 'S1_description','S2_baseline','S3_er_calc','S4_monitoring','S5_safeguards','S6_sdg'
  content_md TEXT NOT NULL,    -- AI-generated markdown
  data_inputs TEXT,            -- JSON: what data was used
  generated_by TEXT DEFAULT 'workers_ai',
  model_version TEXT,
  human_reviewed INTEGER DEFAULT 0,
  reviewer_id TEXT,
  reviewed_at TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- VCM credit holdings (post-issuance)
CREATE TABLE oe_vcm_holdings (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
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
  coas_transfer_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- VCM Order Book (spot market)
CREATE TABLE oe_vcm_order_book (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  side TEXT NOT NULL CHECK(side IN ('bid','offer')),
  methodology TEXT NOT NULL,
  registry_standard TEXT NOT NULL CHECK(registry_standard IN
    ('verra_vcs','gold_standard','cdm_legacy','art64','dffe_domestic')),
  vintage_year INTEGER NOT NULL,
  quantity_tco2e REAL NOT NULL,
  min_lot_tco2e REAL DEFAULT 1.0,
  price_zar_per_tco2e REAL NOT NULL,
  price_usd_per_tco2e REAL,
  carbon_tax_eligible INTEGER DEFAULT 0,
  sylvera_min_rating TEXT,
  expiry TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','partially_filled','filled','cancelled','expired')),
  filled_quantity_tco2e REAL DEFAULT 0,
  matched_trade_ids TEXT,  -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- VCM confirmed trades
CREATE TABLE oe_vcm_trades (
  id TEXT PRIMARY KEY,
  bid_order_id TEXT NOT NULL REFERENCES oe_vcm_order_book(id),
  offer_order_id TEXT NOT NULL REFERENCES oe_vcm_order_book(id),
  buyer_id TEXT NOT NULL REFERENCES participants(id),
  seller_id TEXT NOT NULL REFERENCES participants(id),
  methodology TEXT NOT NULL,
  registry_standard TEXT NOT NULL,
  vintage_year INTEGER NOT NULL,
  quantity_tco2e REAL NOT NULL,
  price_zar_per_tco2e REAL NOT NULL,
  total_zar REAL NOT NULL,
  platform_fee_zar REAL NOT NULL,  -- 1% of total_zar
  fx_rate_zar_usd REAL,
  settlement_date TEXT NOT NULL,
  registry_transfer_ref TEXT,
  carbon_tax_eligible INTEGER DEFAULT 0,
  rec_bundled INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'matched'
    CHECK(status IN
      ('matched','settlement_pending','registry_transfer_initiated',
       'settled','disputed','failed','cancelled')),
  dispute_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- VCM market data (VWAP cache, refreshed by cron)
CREATE TABLE oe_vcm_market_data (
  id TEXT PRIMARY KEY,
  methodology TEXT NOT NULL,
  registry_standard TEXT NOT NULL,
  vintage_year INTEGER NOT NULL,
  vwap_30d_zar REAL,
  vwap_30d_usd REAL,
  last_price_zar REAL,
  volume_30d_tco2e REAL,
  bid_count INTEGER DEFAULT 0,
  offer_count INTEGER DEFAULT 0,
  best_bid_zar REAL,
  best_offer_zar REAL,
  reference_price_cbl_usd REAL,   -- fetched via Workers AI web enrichment
  dffe_dggef REAL DEFAULT 0.942,
  climatiq_emission_factor_id TEXT DEFAULT '90ffe15b-a32a-4a4e-9a49-eccbe3231ca1',
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(methodology, registry_standard, vintage_year)
);
```

#### Backend Chains

| Wave | Chain | Route | States | Key Design Points |
|------|-------|-------|---------|-------------------|
| W226 | VCM Project Development | `/api/vcm/project-development` | 12-state | conception→pdd_draft→ai_generation→stakeholder_consult→preliminary_review→validation→design_certified→monitoring→monitoring_report→verification→credits_issued/rejected/cancelled. INVERTED SLA (larger project = more time). AI PDD generation is a state transition, not just a tool. |
| W226 | VCM Order Book & Matching | `/api/vcm/order-book` | Order lifecycle: open→partial→filled/cancelled/expired | Price-time priority matching within methodology+standard+vintage shard. POST /orders, GET /depth, POST /orders/:id/cancel, GET /trades. Rate-limited 20 orders/5min. Auto-fires cascade on match. |
| W226 | VCM Trade Settlement | `/api/vcm/trade-settlement` | 8-state (matched→payment_instructed→payment_confirmed→registry_transfer→transfer_confirmed→settled/disputed/failed) | Bridges to W48 for carbon-tax-eligible credits; bridges to W206 for registry transfer event. |
| W226 | VCM Monitoring Report | `/api/vcm/monitoring-report` | 10-state (period_open→data_collected→er_calculated→report_drafted→vvb_submitted→vvb_complete→registry_submitted→registry_reviewed→issued/rejected) | AI auto-populates ER calculation from SCADA data + DFFE DGGEF. |

**AI PDD Generation Engine (new utility function):**

```typescript
// src/utils/vcm-pdd-generator.ts
interface PddGenerationInput {
  project: OeVcmProject;
  facility_data: OeEsumsProject;
  financial_model?: { irr: number; wacc: number; capex_zar: number };
  employment_data?: { construction_jobs: number; om_jobs: number };
  eia_summary?: string;
  dggef_vintage: string;  // '2023'
}

async function generatePddSection(
  section: 'S1_description'|'S2_baseline'|'S3_er_calc'|'S4_monitoring'|'S5_safeguards'|'S6_sdg',
  input: PddGenerationInput,
  env: Env
): Promise<string>  // returns markdown content

// Calls Workers AI (llama-3.3-70b-instruct or equivalent)
// with section-specific prompt templates per methodology
// S3 (ER calculation) uses deterministic formula: net_mwh × dggef = tCO2e
// S2 (baseline/additionality) requires human review flag = true
```

#### AI Assist Opportunities

1. **PDD section auto-draft** — given facility data from oe_esums_projects, generate S1 (project description), S3 (ER calculation), and S4 (monitoring plan) automatically. Flag S2 (additionality) and S5 (safeguards) for mandatory human review.
2. **Additionality pre-screen** — before PDD drafting, run the investment barrier test using project IRR from lender data (if available) and flag if project IRR without carbon revenue exceeds sector WACC (common practice test would fail).
3. **SDG impact quantification** — auto-calculate SDG7 (MWh generated → estimated households powered using StatsSA electrification factor), SDG13 (tCO2e reduced vs SA NDC trajectory), SDG8 (job-years from esums employment data).
4. **VVB cost estimator** — suggest estimated audit cost range ($10,000–$80,000) based on project type, scale, and methodology, with recommended SA VVBs.
5. **Credit price forecast** — on the order book, show AI-derived fair-value range based on methodology, vintage, and recent CBL/JSE-V trades.
6. **Deviation alert** — during monitoring, compare actual vs projected ER and alert if the next verification cycle will show a significant under-delivery (triggering buffer pool draw).

#### API Integrations (Track B)

| API | Purpose | Priority | Notes |
|-----|---------|----------|-------|
| Climatiq API | Live DFFE DGGEF for ER calculations | P0 | Emission factor ID: `90ffe15b-a32a-4a4e-9a49-eccbe3231ca1` |
| Verra Registry (public unauthenticated) | Project status lookups, methodology validation | P0 | ~9,000 VCS project records accessible |
| Xpansiv CBL / Developer API | VCM price reference, JSE-V trades | P1 | developer.xpansiv.com, OAuth2, post-account setup |
| Verra Registry (authenticated) | Issuance/transfer/retirement requests | P1 | Account required; S&P partnership API in 2026 |
| Gold Standard Impact Registry | Project lookups, GSVER status | P1 | registry.goldstandard.org; web-UI primary, API emerging |
| UNFCCC Article 6.4 Registry | ITMOs, corresponding adjustments | P2 | Draft specs not yet released; build adapter interface now |
| World Bank Carbon Pricing Dashboard | SA carbon tax price reference | P1 | Dataset 0042051, CC BY 4.0 |
| Sylvera CCA API | Credit quality ratings | P2 | Enterprise subscription; display on order book |
| JSE Ventures Carbon Market | Local price discovery | P1 | Xpansiv Connect channel; contact JSE Ventures |

---

### Track C: Carbon Tax Compliance

The existing W48 (Carbon Offset Claim & Allowance chain) covers the SARS submission lifecycle. Track C adds the upstream budget management and downstream reporting layer.

#### Data Model

**New tables required:**

```sql
-- Carbon budget registration (DFFE National Carbon System)
CREATE TABLE oe_carbon_budget_registrations (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  ncs_account_number TEXT,
  facility_name TEXT NOT NULL,
  sector TEXT NOT NULL CHECK(sector IN
    ('electricity','mining','manufacturing','transport','construction','waste','agriculture','other')),
  naics_code TEXT,
  annual_threshold_tco2e REAL NOT NULL,  -- must be >30,000 for Phase 2 mandatory
  reporting_year INTEGER NOT NULL,
  scope1_combustion_tco2e REAL,
  scope1_fugitive_tco2e REAL,
  scope1_process_tco2e REAL,
  scope2_grid_tco2e REAL,
  total_gross_tco2e REAL,
  -- Phase 2 allowances
  combustion_offset_allowance_pct REAL DEFAULT 15.0,  -- Phase 2 from Jan 2026
  fugitive_process_offset_allowance_pct REAL DEFAULT 10.0,
  max_offset_allowance_tco2e REAL,  -- computed: (combustion × 15%) + (fugitive × 10%)
  credits_applied_tco2e REAL DEFAULT 0,
  tax_liability_zar REAL,            -- gross tCO2e × ZAR 236/tCO2e (2025 rate)
  tax_after_offset_zar REAL,
  filing_deadline TEXT,
  chain_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(chain_status IN
      ('draft','data_entered','calculated','credits_applied','reviewed',
       'sars_submitted','sars_accepted','sars_queried','responded','final','appeal')),
  cbt_account_ref TEXT,              -- SARS Carbon Tax Account
  coas_retirement_refs TEXT,         -- JSON array of COAS retirement IDs
  efiling_ready INTEGER DEFAULT 0,   -- 1 when SARS-ready CBT export generated
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Carbon budget obligation tracking (annual cycle)
CREATE TABLE oe_carbon_budget_obligations (
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
  penalty_zar REAL,                  -- R640/tCO2e for Carbon Budget Regulations non-compliance
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- CBAM (EU Carbon Border Adjustment Mechanism) readiness tracker
CREATE TABLE oe_cbam_exposures (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  product_category TEXT NOT NULL CHECK(product_category IN
    ('steel','aluminium','cement','fertiliser','electricity','hydrogen','other')),
  eu_export_tonnes_per_year REAL,
  embedded_emissions_tco2e_per_tonne REAL,
  total_embedded_tco2e REAL,
  cbam_certificate_price_eur REAL,   -- reference from EU ETS, ~€70-100/tCO2e
  estimated_cbam_liability_eur REAL,
  recs_applicable INTEGER DEFAULT 0, -- can Scope 2 RECs reduce embedded?
  verified_intensity_report_ref TEXT,
  status TEXT NOT NULL DEFAULT 'assessment'
    CHECK(status IN ('assessment','data_collection','verified','declared','filed')),
  filing_year INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Backend Chains

| Wave | Chain | Route | States | SLA Logic |
|------|-------|-------|---------|-----------|
| W226 | Carbon Budget Management | `/api/carbon-tax/budget` | 12-state (draft→data_entered→scope_calculated→allowance_computed→credits_selected→coas_submitted→credits_retired→sars_prepared→efiling_ready→sars_submitted→accepted/queried/appeal) | INVERTED: larger emitter (>150,000 tCO2e) gets more time (deeper audit). Penalty crossing at overdue EVERY tier. |
| W226 | CBAM Readiness Assessment | `/api/carbon-tax/cbam` | 8-state (assessment→product_inventory→intensity_verified→reduction_plan→rec_applied→certified→filed/withdrawn) | URGENT: EU filing deadline-driven. Crosses DFFE EVERY tier. |
| W226 | Carbon Budget Obligation Calendar | `/api/carbon-tax/obligations` | Cron-driven (no user-initiated chain) | Generates oe_carbon_budget_obligations records from registration, fires SLA sweep in */15 cron slot. |

#### AI Assist Opportunities

1. **SARS-ready CBT export** — auto-generate the Carbon Tax Account eFiling-compatible XML/CSV from oe_carbon_budget_registrations data.
2. **Offset strategy optimiser** — given available credits in oe_vcm_holdings and oe_rec_holdings, recommend which to apply first against carbon tax liability to minimise total cost (carbon tax rate vs credit market price).
3. **Phase 2 impact calculator** — show the emitter how their liability changes from Phase 1 to Phase 2 allowances (10%→15% combustion, 5%→10% fugitive) with credit-sourcing recommendation.
4. **CBAM exposure scanner** — from facility and product data, auto-calculate CBAM liability exposure and recommend minimum embedded emission verification needed.
5. **NDC trajectory tracker** — show company's emission trajectory vs SA NDC (peak by 2025, 43% reduction by 2030), with gap-to-target in tCO2e and estimated credit cost to close.

#### API Integrations (Track C)

| API | Purpose | Priority |
|-----|---------|----------|
| SARS eFiling API (where available) | CBT account submission | P0 — manual export fallback initially |
| COAS (DoE/DMRE) | COAS retirement confirmation | P1 — form-based initially |
| Climatiq API | Live DFFE DGGEF for scope calculations | P0 |
| World Bank Carbon Pricing Dashboard | SA carbon tax rate reference | P1 |
| DFFE NGGEF gazette data | National grid emission factor | P1 — manual sync from PDF until API exists |

---

### Cross-Track: Certificate Bundle

The certificate bundle ties all three tracks into a single attestation instrument for CDP/JSE ESG disclosure.

```sql
CREATE TABLE oe_certificate_bundles (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  bundle_type TEXT NOT NULL CHECK(bundle_type IN
    ('rec_only','vcm_only','carbon_tax_offset','rec_vcm_bundled','full_cert_bundle')),
  rec_holding_ids TEXT,           -- JSON array from oe_rec_holdings
  vcm_holding_ids TEXT,           -- JSON array from oe_vcm_holdings
  carbon_offset_claim_id TEXT REFERENCES oe_carbon_offset_claims(id),
  scope3_disclosure_id TEXT REFERENCES oe_carbon_scope3_disclosures(id),
  carbon_budget_reg_id TEXT REFERENCES oe_carbon_budget_registrations(id),
  bundle_status TEXT NOT NULL DEFAULT 'assembling'
    CHECK(bundle_status IN
      ('assembling','validated','issued','applied','retired','expired','cancelled')),
  total_tco2e REAL NOT NULL,
  total_mwh_rec REAL,
  zar_value REAL,
  reporting_framework TEXT CHECK(reporting_framework IN
    ('ghg_protocol_scope2','re100','sbti','cdp','iso14064','jse_esg','tcfd','issb_ifrs_s2','gbcsa')),
  certificate_number TEXT UNIQUE,  -- platform-issued attestation number
  issued_at TEXT,
  expiry_date TEXT,               -- typically reporting year end + 12 months
  pdf_r2_key TEXT,                -- generated certificate PDF in R2
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE oe_certificate_bundle_events (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES oe_certificate_bundles(id),
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  data TEXT,  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Certificate Bundle Chain (10-state):**

`initiated → rec_requested → vcm_purchased → carbon_offset_applied → bundle_assembled → validation_submitted → validated → certificate_issued → applied_to_disclosure → retired`

Terminals: `expired`, `cancelled`

SIGNATURE: `retire` crosses regulator EVERY tier (double-counting integrity). SLA tiered by bundle_type (full_cert_bundle: 72h validation target).

---

## 2. Standalone IPP Registration Flow

### Onboarding Steps for `certificate_only` Participants

```
Step 1: welcome
  - Platform overview, certificate-track introduction
  - Role selection: generator (IPP/solar/wind) vs corporate buyer

Step 2: company_profile
  - Company name, CIPC registration number
  - Contact details, physical address
  - Sector classification

Step 3: market_access_selection [GATE — must explicitly choose before KYB]
  - "I want to trade power on the exchange" → full_trading path (existing onboarding)
  - "I want to issue/trade certificates only" → certificate_only path
  - Displays: what is included, what is excluded, subscription pricing comparison

Step 4: kyb_entity_verification (lighter KYB for certificate_only)
  Required checks:
  - CIPC company registration number → active status verification
  - Beneficial ownership declaration (FIC Act s.21B) — upload form
  - OFAC / UN / SA designated entities sanctions screening
  - PEP (Politically Exposed Person) check
  - Source of funds declaration
  NOT required for certificate_only:
  - FSCA FSP licence
  - JSE clearing membership
  - SARB credit line confirmation
  - Algo-trading certification
  SLA: 72h (vs 240h for full_trading)

Step 5: registry_connection
  - Connect inverter API (Solax / Huawei / Fronius / SMA)
    OR upload meter data CSV template
    OR link NERSA metering reference
  - For VCM: indicate if project has existing NERSA licence / REIPPPP reference
  - Select registries to connect: zaRECs, I-REC Standard, Verra, Gold Standard

Step 6: first_cert_bundle (guided)
  - For generators: "Register your first device" → begins W226 REC Device Registration
  - For buyers: "Purchase your first credits" → opens VCM Order Book
  - For compliance: "Start your carbon tax calculation" → begins W226 Carbon Budget Management

Step 7: complete
  - Dashboard activated at /launch/certificate
  - Subscription plan confirmed (free tier initially)
  - Upgrade options surfaced
```

### Authentication Integration

```typescript
// New field on participants table
ALTER TABLE participants ADD COLUMN participant_market_access TEXT
  DEFAULT 'full_trading'
  CHECK(participant_market_access IN ('full_trading','certificate_only','read_only'));

// JWT payload addition
interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  participant_market_access: 'full_trading' | 'certificate_only' | 'read_only';
  exp: number;
}

// certOnlyGuard middleware
// File: src/middleware/cert-only.ts
const BLOCKED_PREFIXES_FOR_CERT_ONLY = [
  '/api/trading/', '/api/order-book/', '/api/settlement/',
  '/api/clearing-disclosure/', '/api/margin-gate/', '/api/poslimit/',
  '/api/algo-cert/', '/api/market-abuse/', '/api/trade-reporting/',
  '/api/best-execution/', '/api/trade-allocation/', '/api/counterparty-margin/',
  '/api/cross-border-trade/', '/api/imbalance-settlement/', '/api/benchmark-transition/'
];
```

### Free Tier Constraints

| Constraint | Free Tier | Starter | Standard | Professional |
|------------|-----------|---------|----------|--------------|
| REC issuance (MWh/yr) | 500 | 21,900 (10MW) | 87,600 (40MW) | Unlimited |
| VCM project registrations | 0 | 0 | 1 | 5 |
| Carbon tax facilities | 1 (read-only COAS) | 1 (full workflow) | 5 | Unlimited |
| Certificate bundles | 2 | 12 | Unlimited | Unlimited |
| Meter API connections | 1 | 3 | 10 | Unlimited |
| AI PDD generation | No | No | Yes (2/yr) | Yes (unlimited) |
| VCM order book access | Read only | Yes | Yes | Yes |

---

## 3. Upgrade Path

### Three-Gate Freemium Model

```
FREE ──[Gate 1: Volume]──► STARTER (R3,500/yr)
                                │
                          [Gate 2: Projects]
                                │
                        STANDARD (R8,500/yr) ──► VCM PDD Service (R45,000–120,000 once)
                                │
                        [Gate 3: Enterprise Compliance]
                                │
                      PROFESSIONAL (R18,000/yr) ──► ENTERPRISE (R45,000+/yr)
                                │
                        [Gate 4: Power Trading]
                                │
                      FULL PLATFORM (existing subscription)
```

**Gate 1 — Volume trigger:**
Automatically prompts upgrade when the generator's cumulative REC issuance in the current calendar year exceeds 500 MWh, or when they attempt to connect a second inverter API.

**Gate 2 — VCM Projects trigger:**
Unlocked when participant attempts to initiate W226 VCM Project Development chain. One-time PDD service fee (R45,000–R120,000) separate from annual subscription. Converts to Standard plan minimum.

**Gate 3 — Enterprise Compliance trigger:**
Unlocked when participant adds a second facility to Carbon Budget Management, requests SARS eFiling export, or activates CBAM readiness module.

**Gate 4 — Full Platform trigger:**
When certificate_only participant wants to access the power order book, W3 settlement, or post bids on the energy exchange. Requires FSCA FSP licence verification and clearing membership before certOnlyGuard is lifted.

### Conversion Messaging (AI-assisted)

At each gate, the LaunchBoard AI card shows:
- Cost of the upgrade
- Expected revenue uplift from the additional capability
- Time-to-first-value estimate
- One-click "start upgrade" that routes to onboarding step 3 (market_access_selection) with new tier pre-selected

---

## 4. Platform Parity Wave Plan (W226–W280)

### Priority Classification

- **P0** — Go-live blockers: missing mandatory regulatory processes or fundamental data integrity gaps
- **P1** — High business value: significant revenue or risk impact, commonly exercised workflows
- **P2** — Completeness: important for comprehensive platform but not blocking go-live

---

### P0 — Go-Live Blockers

| Wave | Chain | Role | Rationale |
|------|-------|------|-----------|
| W226 | Certificate Track Core (REC Device Registration + Issuance + VCM Order Book + Carbon Budget Management) | carbon_fund, offtaker, ipp_developer | Entire new revenue vertical — all three tracks need base chains simultaneously |
| W226 | Platform Participant Onboarding KYB/AML chain | support | FIC Act 38/2001 requires CDD for all accountable institutions; auth registration has no verification workflow |
| W226 | Regulatory Reporting Obligation Calendar chain | admin | Multi-regulator filing calendar with hard deadlines; missing = platform operating without compliance governance |
| W227 | NERSA Board Decision & Committee Resolution chain | regulator | ERA s.4-6: NERSA decisions must be taken by Council in quorate meeting; W31 and W49 dispositions lack source event |
| W227 | Platform Tenant Billing & Invoice Reconciliation chain | admin | Revenue leakage without auditable billing state machine; tenant_invoices table has status fields but no SLA sweep |
| W227 | Platform Incident & Major Outage Communication chain | support | POPIA s.22 + FSCA FMI obligations: settlement-affecting outages must be reported within defined windows |
| W228 | Wash-Trade / Spoofing Detection & STOR-Auto-File chain | trader | FMA Chapter X + FSCA STOR Guidance 1/2022: automated surveillance required; go-live regulator audit would flag immediately |
| W228 | FSCA Market-Infrastructure Registration chain | admin | Platform must be registered as FMI under FMA 2012; admin has no chain for its own licence lifecycle |
| W228 | Participant Offboarding & POPIA DSAR Exit chain | support | POPIA s.14 data erasure obligations; no structured offboarding with obligation-clearance gate |
| W229 | Intraday Day-Ahead Energy Auction Clearing chain | trader | NERSA Grid Code requires formal day-ahead scheduling with published market-clearing prices and auditable trail |
| W229 | NRS 048 Power Quality Monitoring chain | grid_operator | NRS 048-2: every point-of-delivery non-compliance must be documented with SLA-driven resolution |
| W230 | DMRE REIPPPP Bid Window Prequalification chain | ipp_developer | Most fundamental IPP business process in SA; W49 licensing cannot auto-trigger at preferred-bidder without this |

---

### P1 — High Business Value

| Wave | Chain | Role | Business Value |
|------|-------|------|----------------|
| W231 | Energy Derivatives Pricing & Structured Products | trader | Required for JSE-SRL-cleared derivatives book; upstream of W44 and W76 |
| W232 | XVA / CVA / FVA Credit-Valuation Adjustment Reporting | trader | Basel III + SARB BA 900 compliance; lenders cannot sign off ICAAP without |
| W233 | Syndicated Loan / Club-Deal Participation chain | lender | SA project finance: 4-8 lenders per deal; W45 acceleration requires majority-lender voting threshold |
| W234 | Corporate PPA Procurement & Competitive Tender chain | offtaker | IRP2023 framework: large offtakers must evidence competitive procurement; offtaker can currently only receive a PPA |
| W235 | VCM Spot Credit Order Book AI Analytics | carbon_fund | Most fundamental gap for carbon market participant; no structured matching for VCM bids/offers |
| W236 | NERSA Grid Code Amendment & Public Consultation chain | regulator | Grid Code revisions are primary mechanism for new technical obligations; no state machine exists |
| W237 | NERSA TCS (Technical Compliance Schedule) Submission chain | ipp_developer | Annual submission to Eskom/NTCSA; failure = W67 non-conformance; Grid Code C-4 SLA |
| W238 | NUoS Tariff Billing & Dispute chain | grid_operator | NUoS disputes most common grid-to-IPP interactions; grid workstation cannot track outstanding receivables |
| W239 | Day-Ahead Generation Forecast Submission chain | wind_solar | NERSA Grid Code requires day-ahead + 4h-ahead forecasts; imbalance charges without this |
| W240 | Hedging Facility & Interest Rate Swap Lifecycle chain | lender | SA project finance universally requires IRS; SARB BA 700 + FMA s.29 reporting mandatory |
| W241 | National Carbon System / DFFE Carbon Budget Allocation chain | carbon_fund | Carbon Tax Phase 2 (2026+): large emitters must maintain NCS accounts; funds acting as advisors |
| W242 | RE100 / CDP Target Setting & Annual Progress chain | offtaker | Multinational offtakers: mandatory annual P6 process; RECs retired in W70 but no rollup to RE100 dashboard |
| W243 | REIPPPP Implementation Agreement Compliance Reporting chain | wind_solar | IA compliance reports filed by project company (wind/solar operator), not developer entity |
| W244 | Environmental & Social Action Plan Lender-Monitoring chain | lender | EP4: IESC must file monitoring reports directly; lender write access missing from esap chains |
| W245 | Intraday Balancing Instruction & SAPP Real-Time Exchange chain | grid_operator | Primary SO tool used every 30 minutes; sits between W13 dispatch and W50 reserve activation |
| W246 | REIPPPP Bid Window Prequalification & Submission chain | ipp_developer | See W230 note — this is the full P6 elaboration after the P0 base chain |
| W247 | NERSA REIPPPP / IRP Project Pipeline Monitoring chain | regulator | NERSA's primary IRP tracking duty; connects IPP bid submissions to capacity milestone reporting |
| W248 | Carbon Credit Portfolio Valuation & MTM chain | carbon_fund | IFRS 9/13: carbon funds manage multi-million ZAR portfolios requiring fair-value for investor reporting |
| W249 | Curtailment Notice Response & Deemed-Energy Claim chain | wind_solar | Split-write SO-to-generator side missing; W46 curtailment claim feeds from here |
| W250 | Project Refinancing & Senior Debt Amendment chain | ipp_developer | Frequent mid-project event on 20-year SA renewable assets; W38 covenant not bridged to refinancing |

---

### P2 — Completeness

| Wave | Chain | Role | Notes |
|------|-------|------|-------|
| W251 | Trader Onboarding & CPA Lifecycle chain | trader | FSCA Conduct Standard 1/2020; CPA must be evidenced in tamper-evident audit trail |
| W252 | Energy Efficiency & Carbon Reduction Obligation Tracking chain | offtaker | Bridges to W225 Scope 3; DEA Carbon Budget Phase 2 |
| W253 | Municipal / Distribution PPA Compliance & NERSA Licence-Return chain | offtaker | ERA s.27: NERSA must approve all municipal electricity tariffs annually |
| W254 | Lender Exit / Prepayment & Make-Whole Calculation chain | lender | Voluntary prepayments common at refinancing; security register cannot be unwound without this |
| W255 | IFRS 9 ECL Staging & Impairment Reporting chain | lender | SARB BA 120 submission; lender dashboard shows DSCR but not provision reserve position |
| W256 | Article 6.4 Supervisory Body Correspondence & Appeal chain | carbon_fund | W37 ends at registry issuance; no SB correspondence state machine |
| W257 | Carbon Credit Insurance & Loss Recovery chain | carbon_fund | Buffer-pool draw (W42) → insurer → indemnity; essential for high-value ERPA forwards (W65) |
| W258 | EA Amendment & DEA/DFFE Approval chain | ipp_developer | NEMA s24C; ipp-ea-amendment.ts is CRUD stub; W117 change orders have no downstream handoff |
| W259 | Water Use Licence Application & DWS Amendment chain | ipp_developer | NWA Section 21; 18-24 month lead time; gates W20 COD |
| W260 | Consumer Tariff Approval & Affordability Impact Assessment chain | regulator | ERA s.27: NERSA must approve all municipal electricity tariffs |
| W261 | Cross-Border Interconnector Capacity & SAPP Nomination chain | regulator | NERSA competent authority for SAPP obligations; annual interconnector utilisation reports |
| W262 | Supplier PPA Invoice Dispute & NERSA Metering Dispute chain | offtaker | NRS 048-9 revenue metering disputes; offtaker cannot challenge meter reading through platform |
| W263 | Soiling & Performance Degradation Reporting chain | wind_solar | Explicit wind/solar write access needed; soiling-audit-chain.ts has no wind_solar role |
| W264 | Grid Fault Ride-Through Test & Compliance chain | wind_solar | NERSA Grid Code Chapter E; FRT prerequisite for W28 GCA and W67 compliance |
| W265 | Metering Code Audit & Revenue Meter Recertification chain | grid_operator | NERSA Metering Code Rule 6.4; 5-year recertification schedule; feeds W46 curtailment disputes |
| W266 | Grid Development Plan / CIP Project Approval chain | grid_operator | GDP approval required before W58 capacity allocation can be offered |
| W267 | Contract SLA & Escalation Management chain | support | ITIL service-management certification requirement |
| W268 | Software License & Subscription Renewal chain | support | Platform-critical: mTLS certs, API integrations, Workers AI subscriptions |
| W269 | POPIA Information Officer Annual Report chain | admin | Information Regulator fines up to R10M; no evidence of systematic POPIA governance without |
| W270 | Multi-Tenant Disaster Recovery & BCP Testing chain | admin | FSCA FMI Guidance Note 2/2022; institutional participants require tested DR attestation |

---

### Complete Wave Registry (W226–W270)

| Wave | Name | Role(s) | Priority | Table(s) | Route |
|------|------|---------|----------|---------|-------|
| W226 | Certificate Track Core | carbon_fund, offtaker, ipp_developer, support, admin | P0 | oe_rec_devices, oe_rec_holdings, oe_vcm_projects, oe_vcm_order_book, oe_vcm_trades, oe_carbon_budget_registrations, oe_certificate_bundles, oe_certificate_bundle_events | `/api/rec/*`, `/api/vcm/*`, `/api/carbon-tax/*`, `/api/certificate-track/*` |
| W227 | NERSA Board Decision & Committee Resolution | regulator | P0 | oe_nersa_council_resolutions | `/api/regulator/council-resolution` |
| W227 | Platform Tenant Billing chain | admin | P0 | tenant_invoices (extend) | `/api/admin/billing-cycle` |
| W227 | Platform Incident & Outage Communication | support | P0 | oe_platform_incidents | `/api/support/incident-comms` |
| W228 | Wash-Trade / Spoofing Detection chain | trader | P0 | oe_surveillance_alerts | `/api/trading/surveillance` |
| W228 | FSCA FMI Registration chain | admin | P0 | oe_fmi_registrations | `/api/admin/fmi-registration` |
| W228 | Participant Offboarding & POPIA Exit chain | support | P0 | oe_offboarding_cases | `/api/support/offboarding` |
| W229 | Day-Ahead Energy Auction Clearing | trader | P0 | oe_energy_auctions, oe_auction_bids, oe_clearing_prices | `/api/trading/auction` |
| W229 | NRS 048 Power Quality Monitoring | grid_operator | P0 | oe_power_quality_events | `/api/grid/power-quality` |
| W230 | DMRE REIPPPP Bid Window Base chain | ipp_developer | P0 | oe_reipppp_bids | `/api/ipp/reipppp-bid` |
| W231 | Energy Derivatives Pricing & Structured Products | trader | P1 | oe_energy_derivatives | `/api/trading/derivatives` |
| W232 | XVA / CVA / FVA Reporting | trader | P1 | oe_xva_positions | `/api/trading/xva` |
| W233 | Syndicated Loan / Club-Deal Participation | lender | P1 | oe_syndicated_loans | `/api/lender/syndication` |
| W234 | Corporate PPA Procurement & Tender | offtaker | P1 | oe_ppa_tenders | `/api/offtaker/ppa-tender` |
| W235 | VCM Portfolio Analytics | carbon_fund | P1 | oe_vcm_market_data | `/api/vcm/market-data` |
| W236 | NERSA Grid Code Amendment & Consultation | regulator | P1 | oe_grid_code_amendments | `/api/regulator/grid-code-amendment` |
| W237 | NERSA TCS Submission | ipp_developer | P1 | oe_technical_compliance_schedules | `/api/ipp/tcs-submission` |
| W238 | NUoS Tariff Billing & Dispute | grid_operator | P1 | oe_nuos_billing | `/api/grid/nuos-billing` |
| W239 | Day-Ahead Generation Forecast Submission | wind_solar | P1 | oe_generation_forecasts | `/api/wind-solar/forecast` |
| W240 | Hedging Facility & IRS Lifecycle | lender | P1 | oe_hedging_facilities | `/api/lender/hedging` |
| W241 | National Carbon System Budget Allocation | carbon_fund | P1 | oe_ncs_budget_accounts | `/api/carbon/ncs-budget` |
| W242 | RE100 / CDP Target Setting | offtaker | P1 | oe_re100_commitments | `/api/offtaker/re100` |
| W243 | REIPPPP IA Compliance Reporting | wind_solar | P1 | oe_ia_compliance_reports | `/api/wind-solar/ia-compliance` |
| W244 | ESAP Lender Monitoring | lender | P1 | oe_esap_lender_reports | `/api/lender/esap-monitoring` |
| W245 | Intraday Balancing & SAPP Exchange | grid_operator | P1 | oe_balancing_instructions | `/api/grid/intraday-balancing` |
| W246 | REIPPPP Bid Window Full P6 | ipp_developer | P1 | oe_reipppp_bids (extend) | `/api/ipp/reipppp-bid-full` |
| W247 | IRP Project Pipeline Monitoring | regulator | P1 | oe_irp_pipeline | `/api/regulator/irp-pipeline` |
| W248 | Carbon Credit Portfolio MTM | carbon_fund | P1 | oe_vcm_portfolio_valuations | `/api/carbon/portfolio-mtm` |
| W249 | Curtailment Notice Response | wind_solar | P1 | oe_curtailment_responses | `/api/wind-solar/curtailment-response` |
| W250 | Project Refinancing chain | ipp_developer | P1 | oe_project_refinancings | `/api/ipp/refinancing` |
| W251 | Trader CPA Lifecycle | trader | P2 | oe_clearing_participation_agreements | `/api/trading/cpa` |
| W252 | Energy Efficiency Obligation Tracking | offtaker | P2 | oe_energy_efficiency_obligations | `/api/offtaker/ee-obligations` |
| W253 | Municipal PPA NERSA Licence-Return | offtaker | P2 | oe_municipal_licence_returns | `/api/offtaker/municipal-return` |
| W254 | Lender Prepayment & Make-Whole | lender | P2 | oe_prepayment_calculations | `/api/lender/prepayment` |
| W255 | IFRS 9 ECL Staging & Impairment | lender | P2 | oe_ecl_staging | `/api/lender/ecl-staging` |
| W256 | Article 6.4 SB Correspondence | carbon_fund | P2 | oe_art64_sb_correspondence | `/api/carbon/art64-sb` |
| W257 | Carbon Credit Insurance | carbon_fund | P2 | oe_carbon_insurance_claims | `/api/carbon/insurance` |
| W258 | EA Amendment & DFFE Approval | ipp_developer | P2 | oe_ea_amendments | `/api/ipp/ea-amendment` |
| W259 | Water Use Licence Application | ipp_developer | P2 | oe_wul_applications | `/api/ipp/wul` |
| W260 | Consumer Tariff Approval | regulator | P2 | oe_municipal_tariff_approvals | `/api/regulator/consumer-tariff` |
| W261 | SAPP Interconnector Capacity | regulator | P2 | oe_sapp_capacity_allocations | `/api/regulator/sapp-capacity` |
| W262 | PPA Invoice Dispute & Metering | offtaker | P2 | oe_ppa_invoice_disputes | `/api/offtaker/invoice-dispute` |
| W263 | Soiling & Degradation Reporting | wind_solar | P2 | oe_soiling_reports (extend existing) | `/api/wind-solar/soiling` |
| W264 | Grid FRT Test & Compliance | wind_solar | P2 | oe_frt_tests | `/api/wind-solar/frt-compliance` |
| W265 | Revenue Meter Recertification | grid_operator | P2 | oe_meter_recertifications | `/api/grid/meter-recertification` |
| W266 | Grid Development Plan chain | grid_operator | P2 | oe_gdp_projects | `/api/grid/gdp` |
| W267 | Contract SLA Management | support | P2 | oe_contract_sla_measurements | `/api/support/contract-sla` |
| W268 | Software License Renewal | support | P2 | oe_software_licenses | `/api/support/software-licenses` |
| W269 | POPIA IO Annual Report | admin | P2 | oe_popia_annual_filings | `/api/admin/popia-annual` |
| W270 | DR / BCP Testing | admin | P2 | oe_dr_test_records | `/api/admin/dr-bcp` |

---

## 5. Revenue Model

### Fee Structure by Track

#### Track A — REC Issuance

| Component | Free | Starter | Standard | Professional | Enterprise |
|-----------|------|---------|----------|--------------|------------|
| Annual subscription | R0 | R3,500 | R8,500 | R18,000 | R45,000+ |
| Facility size | —  | 0.5–5MW | 5–20MW | 20–100MW | >100MW |
| Platform fee per MWh issued | R0 (up to 500 MWh) | R1.20/MWh | R1.00/MWh | R0.80/MWh | R0.50/MWh |
| Pass-through registry fee | R1.98/MWh (zaRECs) | same | same | same | negotiated |
| Volume discount threshold | N/A | N/A | N/A | 50,000+ MWh → R0.50 | custom |
| Transfer fee | N/A | R0.40/MWh | R0.40/MWh | R0.30/MWh | R0.20/MWh |
| Annual discount (vs monthly) | N/A | 15% | 15% | 15% | 20% |

**Example economics — 10MW solar IPP (25% CF, 21,900 MWh/yr):**
- Standard plan: R8,500 subscription + (21,900 × R1.00) = R30,400/yr platform revenue
- Registry pass-through: 21,900 × R1.98 = R43,362/yr (flows to zaRECs/GCC)
- IPP certificate revenue at R20/MWh market price: R438,000/yr
- Platform net margin: R30,400 on R438,000 certificate revenue = 6.9% take rate

#### Track B — VCM Project Development

| Component | Fee | Notes |
|-----------|-----|-------|
| AI PDD generation (S1, S3, S4, S6) | Included in Standard+ | Workers AI cost ~R0.05/page |
| Full PDD facilitation (all sections + human QA) | R45,000–R80,000 one-time | Methodology-dependent; undercuts consultants by 40-60% |
| Complex methodology (GS4GG PoA, Art 6.4) | R80,000–R120,000 one-time | Additional SB correspondence management |
| Audit coordination facilitation fee | R15,000–R30,000 per cycle | Per verification event |
| First issuance platform levy | 1.5% of credit batch value | Capped at R150,000 |
| Ongoing issuance levy | 0.75% of credit batch value | Each subsequent verification cycle |
| VCM Order Book transaction fee | 1.0% of trade value | Paid by seller; min R500 |
| VCM trade settlement fee | R250 per trade | Admin/registry transfer coordination |
| VCM market data API | R2,500/mo | External consumers of price feed |

**Example economics — 50MW wind project (Verra VCS, ACM0002):**
- Annual ER: ~150,000 MWh × 0.942 = 141,300 tCO2e
- Credit value at $10/tCO2e (R185/tCO2e at R18.5:$1): R26,140,500
- PDD facilitation: R80,000 (one-time)
- First issuance levy (1.5%): R392,108
- Ongoing issuance levy (0.75%): R196,054/yr
- VCM trades (assume 50% traded on platform at 1%): R130,703/yr
- Year 1 platform revenue from this project: ~R602,000
- Years 2-10 average: ~R327,000/yr

#### Track C — Carbon Tax Compliance

| Component | Free | Basic | Business | Enterprise |
|-----------|------|-------|----------|------------|
| Annual subscription | R0 | R18,000 | R48,000 | R120,000+ |
| Facilities included | 1 (read-only) | 1 | 1–5 | Unlimited |
| Annual emissions threshold | Any | <30,000 tCO2e | <150,000 tCO2e | Unlimited |
| COAS offset claim submission | Manual export | Guided workflow | Automated | API integration |
| SARS eFiling-ready CBT export | No | Yes | Yes | Yes |
| CBAM readiness module | No | No | Add-on R24,000/yr | Included |
| Per-claim transaction fee | N/A | R850/claim | R650/claim | R450/claim |
| Carbon Budget Regulations penalty alert | No | Yes | Yes | Yes |
| NCS account management | No | No | Yes | Yes |
| Annual discount | N/A | 15% | 15% | 20% |

**Example economics — Large industrial emitter (200,000 tCO2e/yr):**
- Enterprise plan: R120,000/yr
- Credits applied: ~30,000 tCO2e (Phase 2: 15% combustion allowance) × R850/claim = R25,500 in claim fees (multiple claims)
- CBAM readiness (steel): R24,000/yr add-on (included in Enterprise)
- Total platform revenue: ~R120,000–R145,000/yr
- Platform value delivered: R236/tCO2e × 30,000 tCO2e offset = R7,080,000 tax saving enabled

#### Bundle Pricing

| Bundle | Discount |
|--------|---------|
| REC Track A + Carbon Tax Track C | 15% on combined annual subscription |
| REC Track A + VCM Track B | 15% on combined annual subscription |
| All three tracks | 25% on combined annual subscription |
| Certificate track → Full platform upgrade | First 3 months of full platform at 50% (migration incentive) |

#### Platform Revenue Projection (3-Year)

| Year | REC Revenue | VCM Revenue | Carbon Tax Revenue | Total |
|------|-------------|-------------|-------------------|-------|
| Y1 (10 generator accounts, 5 corporate) | R430,000 | R200,000 (2 PDDs) | R300,000 (5 facilities) | R930,000 |
| Y2 (30 generators, 15 corporate, 2 VCM projects) | R1,200,000 | R850,000 | R720,000 | R2,770,000 |
| Y3 (75 generators, 40 corporate, 8 VCM projects) | R2,900,000 | R3,100,000 | R1,800,000 | R7,800,000 |

---

## 6. API Integration Plan

### Priority Order

#### P0 — Required for Free Tier Minimum Viable Product

| # | API | Purpose | Integration Method | Estimated Effort |
|---|-----|---------|-------------------|-----------------|
| 1 | Solax Cloud API (`api.solaxcloud.com`) | Inverter meter data ingestion — already partially integrated for Goldrush | Workers fetch with API token from KV; existing pattern in esums | 1 day |
| 2 | Climatiq Emission Factors API | Live DFFE DGGEF (0.942 tCO2e/MWh); emission factor ID `90ffe15b-a32a-4a4e-9a49-eccbe3231ca1` | Workers fetch, JSON response, cache in KV with 24h TTL | 0.5 day |
| 3 | GCC (Green Certificate Company) — SA I-REC Issuer | Device registration submission, issuance request tracking | Form-based initially; Workers fetch with session management; API post-accreditation | 2 days |
| 4 | zaRECs Registry (`zarecs.co.za`) | SA domestic EECS-aligned certificate issuance | Form-based portal automation; WebSockets for status updates | 2 days |

#### P1 — Required for Paid Tier Launch

| # | API | Purpose | Integration Method | Estimated Effort |
|---|-----|---------|-------------------|-----------------|
| 5 | Huawei FusionSolar API (`api.fusionsolar.huawei.com`) | Inverter data for Huawei inverters (dominant in SA REIPPPP) | OAuth2, Workers fetch, 15-min interval aggregation | 1.5 days |
| 6 | Fronius Solar API v1 | Inverter data for Fronius | Basic auth per inverter, REST, Workers fetch | 1 day |
| 7 | SMA Sunny Portal REST | Inverter data for SMA | OAuth2, Workers fetch | 1 day |
| 8 | Verra Registry (public unauthenticated) | Project status lookups, methodology validation, VCS project search | REST, no auth; cache responses in KV 1h TTL | 0.5 day |
| 9 | Evident Registry API (I-REC) | Programmatic issuance, transfer, retirement post-Platform Accreditation | REST, I-TRACK Foundation onboarding required first | 3 days (+ 4-6 weeks onboarding) |
| 10 | World Bank Carbon Pricing Dashboard | SA carbon tax rate reference, Dataset 0042051 | Public API via World Bank Data Catalog (CC BY 4.0) | 0.5 day |
| 11 | JSE Ventures Carbon Market (Xpansiv Connect channel) | Local SA VCM price discovery | Contact JSE Ventures; Xpansiv OAuth2 | 2 days |

#### P2 — Required for Full Certificate Track Feature Parity

| # | API | Purpose | Integration Method | Estimated Effort |
|---|-----|---------|-------------------|-----------------|
| 12 | Xpansiv CBL Developer API (`developer.xpansiv.com`) | Global VCM reference prices; connects to 17+ registries | OAuth2, REST, developer.xpansiv.com portal | 2 days |
| 13 | Verra Registry (authenticated) | VCU issuance/transfer/retirement requests | Account registration + authenticated REST; S&P partnership API from 2026 | 3 days |
| 14 | Gold Standard Impact Registry | GSVER status lookups, project page scraping (no REST API yet) | Apify scraper workaround until GS Open API initiative delivers; Workers fetch to registry.goldstandard.org | 1.5 days |
| 15 | Sylvera CCA API | Credit quality ratings for VCM order book display | Enterprise subscription + REST API | 1 day + procurement |
| 16 | NAR Registry API (`developer.xpansiv.com/developer-portal/nar-registry`) | Cross-registry transfer support; US REC standards | OAuth2, REST with sandbox available | 1.5 days |
| 17 | SARS eFiling (Carbon Tax) | CBT account submission automation | No public API documented; generate eFiling-compatible XML/CSV for manual upload initially; investigate SARS Data API programme | 3 days (manual export) |
| 18 | COAS (DoE/DMRE) | Carbon offset retirement confirmation for SA carbon tax | Form-based initially (`carbon.energy.gov.za`); API being developed (2025 upgrade) | 2 days (form scraping) |
| 19 | EnergyTag Granular Certificate API | Hourly certificate issuance for advanced buyers | API Spec v2.0; depends on Evident or Granular Energy as accredited issuer | 3 days |
| 20 | UNFCCC Article 6.4 Registry | ITMO issuance/transfer/retirement (future) | Draft specs not yet released; build adapter interface with feature flag | 2 days (interface only) |

### Integration Architecture

All external APIs are called via Cloudflare Workers fetch (no server-side intermediary). API credentials stored in KV under namespaced keys with encryption at rest. Rate limiting applied per-API using the existing locks.ts advisory lock pattern.

```typescript
// src/utils/external-apis.ts — new utility module

export const EXTERNAL_APIS = {
  climatiq: {
    base: 'https://api.climatiq.io',
    kv_key: 'ext_api_climatiq_key',
    rate_limit: { requests: 100, window_minutes: 1 }
  },
  solax: {
    base: 'https://api.solaxcloud.com',
    kv_key: 'ext_api_solax_key',
    rate_limit: { requests: 10, window_minutes: 1 }
  },
  huawei_fusion: {
    base: 'https://api.fusionsolar.huawei.com',
    kv_key: 'ext_api_huawei_fusion_key',
    rate_limit: { requests: 60, window_minutes: 1 }
  },
  verra_public: {
    base: 'https://registry.verra.org/api',
    kv_key: null,  // unauthenticated
    rate_limit: { requests: 30, window_minutes: 1 },
    cache_ttl_seconds: 3600
  },
  xpansiv_cbl: {
    base: 'https://api.xpansiv.com',
    kv_key: 'ext_api_xpansiv_key',
    rate_limit: { requests: 30, window_minutes: 1 }
  },
  worldbank_carbon: {
    base: 'https://api.worldbank.org/v2',
    kv_key: null,  // public
    rate_limit: { requests: 120, window_minutes: 1 },
    cache_ttl_seconds: 86400  // 24h — data updates monthly
  }
} as const;
```

### Cron Extensions for Certificate Track

Add to `wrangler.toml` `[triggers]`:

```toml
# Certificate track SLA sweep (runs in existing */15 slot — extend scheduled() handler)
# VCM order book expiry sweep (add to 0 * * * * VWAP slot)
# REC metering period close sweep (add to 5 0 * * * metering rollup slot)
# Carbon budget obligation deadline check (add to 45 0 * * * maturity refresh slot)
```

No new cron schedules needed — all certificate track sweeps fit into existing slots by extending the `scheduled()` handler in `src/index.ts`.

---

## Migration Plan

### Migration 472: Certificate Track Foundation

Filename: `open-energy-platform/migrations/472_certificate_track.sql`

```sql
-- Execution order matters: base tables before dependents

ALTER TABLE participants ADD COLUMN participant_market_access TEXT DEFAULT 'full_trading'
  CHECK(participant_market_access IN ('full_trading','certificate_only','read_only'));

CREATE TABLE IF NOT EXISTS oe_certificate_participants (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL UNIQUE REFERENCES participants(id),
  cert_track_enabled INTEGER DEFAULT 1,
  vcm_enabled INTEGER DEFAULT 0,
  rec_enabled INTEGER DEFAULT 1,
  carbon_tax_enabled INTEGER DEFAULT 0,
  onboarding_completed_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- All tables from Track A, B, C data models above --
-- [oe_rec_devices, oe_rec_metering_periods, oe_rec_issuance_requests,
--  oe_rec_holdings, oe_rec_retirements,
--  oe_vcm_projects, oe_vcm_pdd_sections, oe_vcm_holdings,
--  oe_vcm_order_book, oe_vcm_trades, oe_vcm_market_data,
--  oe_carbon_budget_registrations, oe_carbon_budget_obligations, oe_cbam_exposures,
--  oe_certificate_bundles, oe_certificate_bundle_events]

-- All indexes --
```

### Migration 473: Platform Parity P0 Chains

Filename: `open-energy-platform/migrations/473_platform_parity_p0.sql`

Covers: `oe_nersa_council_resolutions`, `oe_platform_incidents`, `oe_offboarding_cases`, `oe_fmi_registrations`, `oe_surveillance_alerts`, `oe_energy_auctions`, `oe_auction_bids`, `oe_clearing_prices`, `oe_power_quality_events`, `oe_reipppp_bids`.

---

## Implementation Sequence

### Sprint 1 (Weeks 1–2): Foundation
1. Migration 472 — all certificate track tables
2. `src/middleware/cert-only.ts` — certOnlyGuard
3. `participant_market_access` field + JWT claim
4. Onboarding steps 1–7 for `certificate_only` path
5. `/launch/certificate` LaunchBoard variant

### Sprint 2 (Weeks 3–4): Track A — REC
1. W226 REC Device Registration chain (`/api/rec/device-registration`)
2. W226 REC Issuance chain (`/api/rec/issuance`)
3. Inverter API integrations: Solax (P0), Huawei FusionSolar (P1)
4. Climatiq emission factor integration
5. REC ROI calculator endpoint
6. REC module on LaunchBoard: Device Registration card, Issuance card, Holdings list

### Sprint 3 (Weeks 5–6): Track B — VCM Base
1. W226 VCM Project Development chain (`/api/vcm/project-development`)
2. VCM PDD generator utility (`src/utils/vcm-pdd-generator.ts`)
3. W226 VCM Order Book & Matching (`/api/vcm/order-book`)
4. W226 VCM Market Data feed (`/api/vcm/market-data`)
5. Verra public registry integration
6. VCM module on LaunchBoard: Order Book widget, Project Development card

### Sprint 4 (Week 7): Track C — Carbon Tax
1. W226 Carbon Budget Management chain (`/api/carbon-tax/budget`)
2. W226 CBAM Readiness Assessment chain (`/api/carbon-tax/cbam`)
3. Carbon Budget Obligation Calendar (cron-driven)
4. SARS eFiling-ready export (XML/CSV generation)
5. Carbon Tax module on LaunchBoard: Obligation Calendar, Credit Application card

### Sprint 5 (Week 8): Certificate Bundle + Billing
1. Certificate Bundle chain (`/api/certificate-track/chain`)
2. Subscription tier management in admin-platform.ts
3. Platform invoice cron: certificate_only fee computation
4. Migration 473: P0 platform parity tables
5. W226 KYB/AML chain, W227 Tenant Billing chain, W227 Incident Comms chain

### Sprint 6+ (Weeks 9–12): P0 Platform Parity Chains
W228 Wash-Trade Detection, W228 FSCA FMI Registration, W228 Offboarding, W229 Day-Ahead Auction, W229 NRS 048 Power Quality, W230 REIPPPP Bid Base

---

## Appendix: Key Regulatory Reference Points

| Regulation | Relevance | Chain(s) |
|------------|-----------|---------|
| ERA 2006 s.4-6 | NERSA Council decision-making | W227 |
| ERA 2006 s.27 | Municipal tariff approval | W260 |
| FMA 2012 Ch.X | Market abuse, STOR | W228 |
| FMA 2012 s.29 | IRS exposure reporting | W240 |
| Carbon Tax Act Phase 2 (Jan 2026) | 15%/10% offset allowances | Track C |
| Carbon Budget Regulations | R640/tCO2e penalty | Track C |
| FIC Act 38/2001 s.21B | Beneficial ownership, KYB | W226 KYB |
| POPIA s.14 | Data erasure on offboarding | W228 |
| POPIA s.22 | Breach notification within 72h | W227 |
| POPIA s.55 | Information Officer annual report | W269 |
| FSCA FMI Guidance Note 2/2022 | DR/BCP testing attestation | W270 |
| NERSA Grid Code Ch.C-4 | TCS submission SLA | W237 |
| NERSA Grid Code Ch.E | FRT compliance | W264 |
| NERSA Metering Code Rule 6.4 | 5-year meter recertification | W265 |
| NRS 048-2 | Power quality monitoring | W229 |
| NRS 048-9 | Revenue metering disputes | W262 |
| NWA Section 21 | Water Use Licence | W259 |
| NEMA s24C | EA amendments | W258 |
| LMA secondary-trading | Loan transfer | W61 (existing) |
| Basel III / SARB BA 900 | XVA reserves | W232 |
| SARB BA 120 | ECL staging submission | W255 |
| IFRS 9 | ECL staging, fair value | W255, W248 |
| OHSA + SANS 10142 | Permit-to-work (existing W64) | — |
| I-REC Standard (Evident) | REC issuance | Track A |
| EECS Release 6.1 | zaRECs/RECSA alignment | Track A |
| ACM0002 / AMS-I.D / GS4GG | VCM methodologies | Track B |
| Verra VCS Rules v4.5 | VCU issuance | Track B |
| GS4GG v3.1 (Dec 2024) | GSVER issuance | Track B |
| DFFE DGGEF 2023 (0.942 tCO2e/MWh) | Baseline ER calculations | Track B |
| Paris Agreement Art 6.4 | ITMO issuance (future) | W256 |