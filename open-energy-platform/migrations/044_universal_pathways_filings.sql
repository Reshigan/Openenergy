-- ════════════════════════════════════════════════════════════════════════
-- 044 · Universal pathway library + regulatory filings + category registry
--
-- Closes the last three Watershed-vs-platform gaps:
--
--   1. Universal pathway library — extends sectoral_pathways concept to
--      non-climate domains: REIPPPP procurement, SA demand growth, NPL
--      ratio expectations, JSE listings, SAPP capacity, tariff path.
--
--   2. Universal regulatory filings registry — extends climate-only
--      disclosure_jurisdictions to financial / energy / environmental /
--      labour / tax / info-regulator reporting bodies (JSE, FSCA, SARB,
--      SARS, NERSA, DFFE, DWS, NCR, B-BBEE, Information Regulator).
--
--   3. Universal category registries — per-domain catalogues so the
--      platform UI can render "Categories" tabs consistently (instrument
--      classes for trading, license classes for regulator, etc.).
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1. Universal pathway library
-- ────────────────────────────────────────────────────────────────────────
-- Coexists with sectoral_pathways (042 climate-specific). This table
-- captures any time-series reference curve relevant to a domain. The
-- frontend renders these on the Pathways tab of each role suite.

CREATE TABLE IF NOT EXISTS universal_pathways (
  id              TEXT PRIMARY KEY,
  pathway_code    TEXT NOT NULL,                     -- 'REIPPPP_AWARDS','SA_DEMAND','JSE_LISTINGS','NPL_RATIO','SAPP_CAPACITY','REG_TARIFF_PATH'
  domain          TEXT NOT NULL CHECK (domain IN (
                    'trading','grid','ipp_project','regulator_tariff','lender_credit',
                    'offtaker_demand','climate','platform'
                  )),
  series_name     TEXT NOT NULL,                     -- 'BW1' / 'national' / 'top_40' / 'BB-rated' etc.
  year            INTEGER NOT NULL,
  value           REAL NOT NULL,
  unit            TEXT NOT NULL,
  source          TEXT,
  notes           TEXT,
  UNIQUE (pathway_code, series_name, year)
);
CREATE INDEX IF NOT EXISTS idx_universal_pathways_dom ON universal_pathways(domain, pathway_code, year);

-- REIPPPP procurement (cumulative MW awarded under each bid window)
INSERT OR IGNORE INTO universal_pathways (id, pathway_code, domain, series_name, year, value, unit, source, notes) VALUES
  ('rep_bw1','REIPPPP_AWARDS','ipp_project','cumulative_mw',2011, 1416,'MW','DOE','BW1 awarded'),
  ('rep_bw2','REIPPPP_AWARDS','ipp_project','cumulative_mw',2012, 2456,'MW','DOE','BW2 awarded'),
  ('rep_bw3','REIPPPP_AWARDS','ipp_project','cumulative_mw',2013, 3922,'MW','DOE','BW3 awarded'),
  ('rep_bw4','REIPPPP_AWARDS','ipp_project','cumulative_mw',2015, 6328,'MW','DOE','BW4 awarded'),
  ('rep_bw5','REIPPPP_AWARDS','ipp_project','cumulative_mw',2021, 8528,'MW','DMRE','BW5 awarded'),
  ('rep_bw6','REIPPPP_AWARDS','ipp_project','cumulative_mw',2022, 9388,'MW','DMRE','BW6 awarded'),
  ('rep_bw7','REIPPPP_AWARDS','ipp_project','cumulative_mw',2024,12188,'MW','DMRE','BW7 expected'),
  ('rep_bw8','REIPPPP_AWARDS','ipp_project','cumulative_mw',2025,15188,'MW','DMRE','BW8 indicative'),
  ('rep_bw9','REIPPPP_AWARDS','ipp_project','cumulative_mw',2026,18188,'MW','DMRE','BW9 indicative'),
  ('rep_irp_2030','REIPPPP_AWARDS','ipp_project','irp_target_mw',2030,29500,'MW','IRP 2019','Renewables target by 2030 per IRP'),
  ('rep_irp_2040','REIPPPP_AWARDS','ipp_project','irp_target_mw',2040,55000,'MW','IRP 2019','Renewables target by 2040'),
  -- SA electricity demand growth
  ('dem_2020','SA_DEMAND','grid','national_twh',2020, 223,'TWh','Eskom IRP','National demand'),
  ('dem_2024','SA_DEMAND','grid','national_twh',2024, 218,'TWh','Eskom','Demand contraction during load-shedding'),
  ('dem_2025','SA_DEMAND','grid','national_twh',2025, 224,'TWh','Forecast','Demand recovery'),
  ('dem_2030','SA_DEMAND','grid','national_twh',2030, 260,'TWh','IRP 2019','Mid-case'),
  ('dem_2040','SA_DEMAND','grid','national_twh',2040, 310,'TWh','IRP 2019','Mid-case'),
  ('dem_peak_2020','SA_DEMAND','grid','peak_gw',2020, 34.7,'GW','Eskom','Peak demand'),
  ('dem_peak_2030','SA_DEMAND','grid','peak_gw',2030, 40.0,'GW','IRP forecast',NULL),
  -- JSE listings activity (pathway by year)
  ('jse_2020','JSE_LISTINGS','trading','equity_listings',2020, 318,'companies','JSE','Listed equity issuers'),
  ('jse_2022','JSE_LISTINGS','trading','equity_listings',2022, 285,'companies','JSE','Continued delisting trend'),
  ('jse_2024','JSE_LISTINGS','trading','equity_listings',2024, 272,'companies','JSE',NULL),
  ('jse_2026','JSE_LISTINGS','trading','equity_listings',2026, 268,'companies','JSE forecast',NULL),
  ('jse_bond_2024','JSE_LISTINGS','trading','bond_listings',2024,1850,'instruments','JSE','Bond market depth'),
  -- NPL ratio expectations (project finance + corporate)
  ('npl_pf_2024','NPL_RATIO','lender_credit','project_finance_pct',2024, 3.2,'%','SARB BSD','Project finance NPL ratio'),
  ('npl_pf_2026','NPL_RATIO','lender_credit','project_finance_pct',2026, 4.1,'%','SARB BSD forecast','Stress-case PF NPL'),
  ('npl_corp_2024','NPL_RATIO','lender_credit','corporate_pct',2024, 4.5,'%','SARB BSD','Corporate NPL'),
  ('npl_renewables_2026','NPL_RATIO','lender_credit','renewables_pct',2026, 1.8,'%','PCAF SA','Renewables financing NPL'),
  -- SAPP capacity (Southern African Power Pool)
  ('sapp_2020','SAPP_CAPACITY','grid','installed_gw',2020, 78,'GW','SAPP','Southern African Power Pool'),
  ('sapp_2025','SAPP_CAPACITY','grid','installed_gw',2025, 86,'GW','SAPP','Capacity additions'),
  ('sapp_2030','SAPP_CAPACITY','grid','installed_gw',2030, 110,'GW','SAPP plan','Plan target'),
  -- Tariff path (regulator)
  ('tar_2024','REG_TARIFF_PATH','regulator_tariff','annual_increase_pct',2024,18.65,'%','NERSA MYPD5','Approved increase'),
  ('tar_2025','REG_TARIFF_PATH','regulator_tariff','annual_increase_pct',2025,12.74,'%','NERSA MYPD5',NULL),
  ('tar_2026','REG_TARIFF_PATH','regulator_tariff','annual_increase_pct',2026, 9.10,'%','NERSA MYPD5',NULL),
  -- Carbon price pathways (regulator + offtaker relevance)
  ('cp_2024','CARBON_PRICE','offtaker_demand','sa_carbon_tax_zar',2024,190,'ZAR/tCO2e','SA Carbon Tax Act','Statutory rate'),
  ('cp_2025','CARBON_PRICE','offtaker_demand','sa_carbon_tax_zar',2025,236,'ZAR/tCO2e','SA Carbon Tax Act',NULL),
  ('cp_2030','CARBON_PRICE','offtaker_demand','sa_carbon_tax_zar',2030,462,'ZAR/tCO2e','Projected',NULL);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Universal regulatory filings registry
-- ────────────────────────────────────────────────────────────────────────
-- Extends disclosure_jurisdictions (which is climate-only) to all
-- regulatory bodies a participant might need to file with.

CREATE TABLE IF NOT EXISTS regulatory_bodies (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  jurisdiction    TEXT NOT NULL,                     -- 'ZA','EU','US','UK','GLB' etc.
  kind            TEXT NOT NULL CHECK (kind IN (
                    'financial','energy','environmental','tax','labour',
                    'info_regulator','consumer','health_safety','listings',
                    'competition','climate','other'
                  )),
  applies_to_roles TEXT,                             -- comma-separated role list
  frequency       TEXT,                              -- 'annual','quarterly','monthly','event'
  mandatory       INTEGER DEFAULT 1,
  description     TEXT,
  filing_doc_url  TEXT
);

INSERT OR IGNORE INTO regulatory_bodies (code, name, jurisdiction, kind, applies_to_roles, frequency, mandatory, description) VALUES
  -- Financial
  ('JSE_LISTINGS_RULES', 'JSE Listings Requirements',      'ZA','listings',
   'all_listed','event',1,'JSE listing rules — SENS announcements, annual + interim reports, paragraph 8.10 etc.'),
  ('JSE_DEBT_LISTING',   'JSE Debt Listings Requirements', 'ZA','listings',
   'lender,trader','event',1,'JSE Debt Listings rules for bond issuers'),
  ('FSCA_CONDUCT',       'FSCA Conduct of Business',       'ZA','financial',
   'trader,lender,carbon_fund','quarterly',1,'Financial Sector Conduct Authority — market conduct reporting'),
  ('FSCA_OMNI_CBR',      'FSCA Omnibus COFI Bill',         'ZA','financial',
   'trader,lender','annual',1,'COFI consolidated conduct returns'),
  ('SARB_BA200',         'SARB BA 200 (capital adequacy)', 'ZA','financial',
   'lender','quarterly',1,'SARB Bank Supervision Department capital adequacy return'),
  ('SARB_BA700',         'SARB BA 700 (liquidity)',        'ZA','financial',
   'lender','monthly',1,'SARB liquidity coverage ratio return'),
  ('SARB_BA325',         'SARB BA 325 (credit risk)',      'ZA','financial',
   'lender','quarterly',1,'Credit risk concentration return'),
  ('NCR_RETURNS',        'NCR consumer credit returns',    'ZA','consumer',
   'lender,offtaker','quarterly',1,'National Credit Regulator quarterly returns'),
  ('CIPC_AR',            'CIPC Annual Return',             'ZA','other',
   'all','annual',1,'Companies and Intellectual Property Commission annual return'),
  -- Energy / utilities
  ('NERSA_QUARTERLY',    'NERSA quarterly returns',        'ZA','energy',
   'ipp_developer,offtaker,trader,grid_operator','quarterly',1,'NERSA quarterly operational + financial returns'),
  ('NERSA_ANNUAL',       'NERSA annual returns',           'ZA','energy',
   'ipp_developer,offtaker,trader,grid_operator','annual',1,'NERSA annual return'),
  ('NERSA_LICENCE_VAR',  'NERSA licence variation',        'ZA','energy',
   'ipp_developer,offtaker,trader,grid_operator','event',1,'Licence variation application'),
  ('SAPP_SO',            'SAPP System Operator return',    'GLB','energy',
   'grid_operator','daily',1,'Southern African Power Pool system operator return'),
  ('NTCSA_GRID_CODE',    'NTCSA Grid Code compliance',     'ZA','energy',
   'ipp_developer,grid_operator','event',1,'Compliance with SA Grid Code'),
  -- Environmental
  ('DFFE_AEL',           'DFFE Air Emissions Licence',     'ZA','environmental',
   'ipp_developer,offtaker','annual',1,'NEM:AQA Air Emissions Licence return'),
  ('DWS_WUL',            'DWS Water Use Licence',          'ZA','environmental',
   'ipp_developer,offtaker','annual',1,'Water Use Licence (s.21 NWA)'),
  ('DFFE_EA',            'DFFE Environmental Authorisation','ZA','environmental',
   'ipp_developer','event',1,'EIA Environmental Authorisation compliance'),
  ('DFFE_GHG',           'DFFE GHG Emissions Report',      'ZA','environmental',
   'ipp_developer,offtaker','annual',1,'NGER Regulations annual report'),
  -- Tax
  ('SARS_VAT201',        'SARS VAT 201',                   'ZA','tax',
   'all','monthly',1,'VAT return'),
  ('SARS_IT14',          'SARS IT14 (Company Income Tax)', 'ZA','tax',
   'all','annual',1,'Annual income tax return'),
  ('SARS_CARBON_TAX',    'SARS Carbon Tax (CBT01)',        'ZA','tax',
   'ipp_developer,offtaker','annual',1,'Carbon Tax Act s.13 returns'),
  ('SARS_PAYE',          'SARS PAYE / UIF / SDL',          'ZA','tax',
   'all','monthly',1,'Employee tax returns'),
  -- Labour
  ('DOL_EE_EA2',         'DOL Employment Equity Report',   'ZA','labour',
   'all','annual',1,'Employment Equity Act report'),
  ('DOL_WSP',            'DOL Workplace Skills Plan',      'ZA','labour',
   'all','annual',1,'Skills Development Act WSP/ATR'),
  -- Info regulator + competition
  ('INFO_REG_POPIA',     'Information Regulator (POPIA)',  'ZA','info_regulator',
   'all','event',1,'POPIA breach notifications + section 33 reports'),
  ('COMP_COMMISSION',    'Competition Commission',         'ZA','competition',
   'all','event',1,'Merger notifications + prohibited-practice complaints'),
  -- B-BBEE
  ('BEE_SANAS',          'B-BBEE Certificate (SANAS)',     'ZA','other',
   'all','annual',1,'B-BBEE verified certificate'),
  -- Health & Safety
  ('OHS_REGS',           'OHS Act regulations',            'ZA','health_safety',
   'all','event',1,'Occupational Health & Safety incident reports'),
  -- Climate (cross-reference to disclosure_jurisdictions which keeps climate-only)
  ('CLIMATE_NGER',       'NGER (climate-aligned)',         'ZA','climate',
   'all','annual',1,'Cross-references DFFE GHG annual report');

-- Per-participant filings to these bodies.
CREATE TABLE IF NOT EXISTS regulatory_filings (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  body_code       TEXT NOT NULL REFERENCES regulatory_bodies(code),
  reporting_period TEXT NOT NULL,                    -- '2026-Q1' / '2026-01' / '2026' etc.
  due_date        TEXT,
  status          TEXT DEFAULT 'draft' CHECK (status IN (
                    'draft','queued','submitted','accepted','rejected','withdrawn','overdue'
                  )),
  submitted_at    TEXT,
  acknowledged_at TEXT,
  external_reference TEXT,
  filing_pack_r2_key TEXT,
  filed_by        TEXT,                              -- user id
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_filings_part ON regulatory_filings(participant_id, status, reporting_period);
CREATE INDEX IF NOT EXISTS idx_reg_filings_body ON regulatory_filings(body_code, reporting_period);

-- ────────────────────────────────────────────────────────────────────────
-- 3. Universal category registry
-- ────────────────────────────────────────────────────────────────────────
-- Each domain has implicit categories (instrument classes, license
-- classes, contract types, etc.). Formalise as a universal registry so
-- the UI can render a Categories tab consistently.

CREATE TABLE IF NOT EXISTS universal_categories (
  code            TEXT PRIMARY KEY,
  domain          TEXT NOT NULL,                     -- 'trading','grid','ipp_project','regulator_tariff','lender_credit','offtaker_demand','climate'
  category_name   TEXT NOT NULL,
  parent_code     TEXT REFERENCES universal_categories(code),
  description     TEXT,
  display_order   INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO universal_categories (code, domain, category_name, description, display_order) VALUES
  -- Trading instrument classes
  ('TR_INSTR_SPOT',     'trading','Spot electricity',      'Day-ahead and intraday spot trades',1),
  ('TR_INSTR_FWD',      'trading','Forward electricity',   'Forward contracts up to 5 years',2),
  ('TR_INSTR_REC',      'trading','RECs / GoOs',            'Renewable energy certificates',3),
  ('TR_INSTR_CARBON',   'trading','Carbon credits',         'VCS, Gold Standard, SA Carbon Tax-eligible',4),
  ('TR_INSTR_CAPACITY', 'trading','Capacity rights',        'Transmission capacity allocations',5),
  -- Grid connection classes
  ('GR_CONN_400KV',     'grid','400kV transmission',       'Strategic transmission corridors',1),
  ('GR_CONN_132KV',     'grid','132kV sub-transmission',   'Regional sub-transmission',2),
  ('GR_CONN_66KV',      'grid','66kV distribution',        'Industrial distribution',3),
  ('GR_CONN_22KV',      'grid','22kV distribution',        'Industrial/commercial distribution',4),
  ('GR_CONN_LV',        'grid','LV / municipal',            'Residential/commercial low-voltage',5),
  -- IPP project classes
  ('IPP_TECH_SOLAR',    'ipp_project','Solar PV',          'Utility-scale solar PV',1),
  ('IPP_TECH_WIND',     'ipp_project','Wind',              'Utility-scale onshore wind',2),
  ('IPP_TECH_BESS',     'ipp_project','BESS',              'Battery storage',3),
  ('IPP_TECH_HYBRID',   'ipp_project','Hybrid (PV+BESS)',  'Solar plus storage hybrid',4),
  ('IPP_TECH_CSP',      'ipp_project','CSP',               'Concentrated solar power',5),
  ('IPP_TECH_HYDRO',    'ipp_project','Pumped storage',    'Pumped hydro storage',6),
  ('IPP_TECH_GAS',      'ipp_project','Gas peaker',        'Gas turbine peaking plant',7),
  -- Regulator licence classes
  ('REG_LIC_GEN',       'regulator_tariff','Generation licence', 'Licence to generate electricity',1),
  ('REG_LIC_DIST',      'regulator_tariff','Distribution licence','Licence to distribute',2),
  ('REG_LIC_TRADE',     'regulator_tariff','Trading licence',    'Licence to trade in electricity',3),
  ('REG_LIC_TRANS',     'regulator_tariff','Transmission licence','Licence to transmit',4),
  ('REG_LIC_RES',       'regulator_tariff','Reseller licence',   'Licence to resell',5),
  ('REG_LIC_EXEMPT',    'regulator_tariff','Schedule 2 exempt',  'Sub-100MW exempt generators',6),
  -- Lender facility classes
  ('LD_FAC_TERM',       'lender_credit','Term loan',        'Standard term loan facility',1),
  ('LD_FAC_REVOLVING',  'lender_credit','Revolving credit', 'Revolving credit facility',2),
  ('LD_FAC_SYNDICATED', 'lender_credit','Syndicated loan',  'Multi-lender syndicated facility',3),
  ('LD_FAC_BRIDGE',     'lender_credit','Bridge loan',      'Short-term bridge financing',4),
  ('LD_FAC_MEZZ',       'lender_credit','Mezzanine',        'Mezzanine debt',5),
  ('LD_FAC_GREEN_BOND', 'lender_credit','Green bond',       'Use-of-proceeds green bond',6),
  ('LD_FAC_SLB',        'lender_credit','Sustainability-linked loan','SLL with KPI margins',7),
  -- Offtaker demand classes
  ('OFF_INDUSTRIAL',    'offtaker_demand','Industrial',     '24/7 baseload industrial',1),
  ('OFF_COMMERCIAL',    'offtaker_demand','Commercial',     'Office + retail',2),
  ('OFF_MUNICIPAL',     'offtaker_demand','Municipal',      'Municipal distribution',3),
  ('OFF_MINING',        'offtaker_demand','Mining',         'Mining operations',4),
  ('OFF_HEAVY_INDUSTRY','offtaker_demand','Heavy industry', 'Smelting, refining, cement',5);
