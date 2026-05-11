-- ════════════════════════════════════════════════════════════════════════
-- 039 · Universal transaction ledger + reporting registry
--
-- Mirrors the ESG audit-grade depth (migration 038) into every other
-- domain. Each module — trading, settlement, carbon, procurement,
-- funder, grid, ipp — already has its own normalised tables; this layer
-- sits *on top* and captures the cross-cutting fields every regulator,
-- auditor and counterparty expects to see:
--
--   • Who did what to whom, when, for how much, in what currency,
--     under what reference, with what evidence, in what status,
--     against which counterparty, with which audit trail.
--
-- It does not replace the per-module tables — it's a write-once audit
-- ledger that points back at the source row via (source_table, source_id).
-- Every module's create/update path can fire a single
-- writeLedger(...) helper that lands a row here, giving regulators a
-- single pane of glass.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT DEFAULT 'default' NOT NULL,

  -- WHAT happened (module + business event)
  module              TEXT NOT NULL CHECK (module IN (
                        'trading','settlement','carbon','carbon_registry',
                        'procurement','funder','grid','grid_operator',
                        'ipp','ona','esg','offtaker','admin'
                      )),
  event_type          TEXT NOT NULL,                -- e.g. 'order.placed','invoice.issued','rec.retired'
  business_date       TEXT NOT NULL,                -- the economic date (trade date, invoice date)
  effective_date      TEXT,                          -- when value transferred (settlement date)

  -- WHO (parties + actor)
  actor_id            TEXT NOT NULL REFERENCES participants(id),
  actor_role          TEXT NOT NULL,
  party_a_id          TEXT,                          -- e.g. buyer
  party_a_role        TEXT,
  party_b_id          TEXT,                          -- e.g. seller / counterparty
  party_b_role        TEXT,

  -- AMOUNTS (one or both depending on event)
  amount_zar          REAL,                          -- ZAR value
  amount_currency     TEXT DEFAULT 'ZAR',
  fx_rate             REAL,                          -- vs ZAR if not ZAR
  amount_zar_equiv    REAL,                          -- computed if foreign
  quantity            REAL,                          -- units (MWh, tCO2e, kWh, etc.)
  quantity_unit       TEXT,                          -- 'MWh','tCO2e','kWh','REC',…
  price               REAL,                          -- price per unit
  price_unit          TEXT,                          -- 'ZAR/MWh', etc.

  -- WHERE the source row lives (full audit drill-down)
  source_table        TEXT NOT NULL,
  source_id           TEXT NOT NULL,

  -- LINKED entities
  contract_id         TEXT,
  project_id          TEXT,
  rfp_id              TEXT,
  loi_id              TEXT,
  invoice_id          TEXT,
  facility_id         TEXT,
  certificate_id      TEXT,

  -- STATUS + LIFECYCLE
  status              TEXT NOT NULL DEFAULT 'recorded'
                       CHECK (status IN ('draft','recorded','settled','reversed','disputed','void')),
  reversed_by_id      TEXT REFERENCES ledger_transactions(id),
  reverses_id         TEXT REFERENCES ledger_transactions(id),

  -- AUDIT + EVIDENCE
  external_reference  TEXT,                          -- bank ref, ESKOM meter ref, etc.
  evidence_r2_keys    TEXT,                          -- JSON array of vault file ids
  ip_address          TEXT,
  user_agent          TEXT,
  hash_prev           TEXT,                          -- previous ledger row hash (tamper-evident chain)
  hash_self           TEXT,                          -- this row's content hash

  -- TAGS + NOTES (free-form)
  tags                TEXT,                          -- JSON array
  notes               TEXT,

  -- TIMESTAMPS
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_module_date     ON ledger_transactions(module, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_actor_date      ON ledger_transactions(actor_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_party_a_date    ON ledger_transactions(party_a_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_party_b_date    ON ledger_transactions(party_b_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_source          ON ledger_transactions(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_ledger_contract        ON ledger_transactions(contract_id);
CREATE INDEX IF NOT EXISTS idx_ledger_project         ON ledger_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_module   ON ledger_transactions(tenant_id, module, business_date DESC);

-- ─── Report registry ────────────────────────────────────────────────────
-- Each "report" the platform produces (statutory filing, internal mgmt
-- pack, regulator submission) gets a row so we can serve a fresh URL,
-- track who pulled it, and re-issue with corrections.
CREATE TABLE IF NOT EXISTS reports_registry (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  tenant_id       TEXT DEFAULT 'default' NOT NULL,
  module          TEXT NOT NULL,                    -- 'trading','settlement','esg','funder','procurement',…
  report_code     TEXT NOT NULL,                    -- 'trade_blotter','aged_debtors','scope_inventory','aml_filing'
  report_name     TEXT NOT NULL,
  reporting_period_start TEXT,
  reporting_period_end   TEXT,
  framework       TEXT,                              -- regulator / framework if applicable
  params          TEXT,                              -- JSON of parameters that produced the report
  payload_json    TEXT,                              -- inline JSON for small reports
  r2_payload_key  TEXT,                              -- vault id for big ones
  row_count       INTEGER,
  total_value_zar REAL,
  status          TEXT DEFAULT 'generated'
                   CHECK (status IN ('queued','generating','generated','distributed','superseded','withdrawn')),
  superseded_by   TEXT REFERENCES reports_registry(id),
  distributed_to  TEXT,                              -- JSON array of email / regulator endpoint
  generated_at    TEXT DEFAULT (datetime('now')),
  distributed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_part_module ON reports_registry(participant_id, module, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_code_period ON reports_registry(report_code, reporting_period_end DESC);

-- ─── Per-role report catalogue ───────────────────────────────────────────
-- Tiny lookup table so the UI can render a uniform "Reports" tab per role
-- without hard-coding the list. Seeded with the canonical Watershed-style
-- report set every regulator expects to see.
CREATE TABLE IF NOT EXISTS report_catalog (
  code            TEXT PRIMARY KEY,
  role            TEXT NOT NULL,
  module          TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  framework       TEXT,
  default_period  TEXT NOT NULL DEFAULT 'monthly'    -- 'daily','monthly','quarterly','annual'
);

INSERT OR IGNORE INTO report_catalog (code, role, module, name, description, framework, default_period) VALUES
-- Trader
('trade_blotter',        'trader',        'trading',     'Trade Blotter',                       'All executed trades for the period',                'FSCA Conduct of Business',  'daily'),
('algo_compliance',      'trader',        'trading',     'Algorithmic trading compliance',      'Rule firings, parameter audit, supervisor signoffs','MAR / JSE Equities Rules',  'monthly'),
('best_execution',       'trader',        'trading',     'Best-execution report',               'RTS 27/28-style price + cost analysis',             'RTS 27/28 (EU equiv)',      'quarterly'),
-- Offtaker
('procurement_log',      'offtaker',      'procurement', 'Procurement transaction log',         'RFPs issued, bids received, awards',                NULL,                        'monthly'),
('supplier_diversity',   'offtaker',      'procurement', 'Supplier diversity & B-BBEE',         'Spend by supplier ownership category',              'B-BBEE Codes',              'annual'),
('demand_register',      'offtaker',      'offtaker_suite','Demand-side register',              'Per-delivery-point consumption + tariff lines',     NULL,                        'monthly'),
-- Lender / funder
('facility_utilisation', 'lender',        'funder',      'Facility utilisation',                'Commitment / drawn / available by tranche',         NULL,                        'monthly'),
('covenant_compliance',  'lender',        'funder',      'Covenant compliance pack',            'Quarterly covenant test results + waivers',         NULL,                        'quarterly'),
('disbursement_log',     'lender',        'funder',      'Disbursement transaction log',        'All disbursements with milestone evidence',         NULL,                        'monthly'),
('nav_history',          'lender',        'funder',      'NAV history',                         'Monthly NAV with attribution',                      NULL,                        'monthly'),
-- IPP developer / generator
('project_milestones',   'ipp_developer', 'ipp',         'Project milestone burn-up',           'Milestones achieved vs plan by project',            NULL,                        'monthly'),
('generation_register',  'ipp_developer', 'ona',         'Generation register',                 'Daily generation by site, with availability',       'NERSA returns',             'monthly'),
('ppa_settlements',      'ipp_developer', 'settlement',  'PPA settlement statements',           'Monthly settlement per PPA with TOU breakdown',     NULL,                        'monthly'),
('o_m_fault_log',        'ipp_developer', 'ona',         'O&M fault & maintenance log',         'All faults + maintenance windows with MTTR',        NULL,                        'monthly'),
-- Carbon fund
('carbon_holdings',      'carbon_fund',   'carbon',      'Carbon holdings inventory',           'Holdings by methodology / vintage with mark',       'VCS / Gold Standard',       'monthly'),
('retirement_chain',     'carbon_fund',   'carbon',      'Retirement chain',                    'Per-retirement certificate trail with beneficiary', NULL,                        'monthly'),
('mrv_submissions',      'carbon_fund',   'carbon_registry','MRV submission log',               'Submissions to registries with status',             'CDM / VCS',                 'monthly'),
('carbon_tax_offset',    'carbon_fund',   'carbon_registry','Carbon Tax s.13 offset claim',     'SA Carbon Tax Act s.13 offset eligibility & claim','SA Carbon Tax Act',         'annual'),
-- Grid operator
('imbalance_settlement', 'grid_operator', 'grid',        'Imbalance settlement run',            'Period imbalance with BRP attribution',             'SA Grid Code',              'daily'),
('dispatch_compliance',  'grid_operator', 'grid_operator','Dispatch compliance',                'Instructions vs delivered, compliance %',           'SA Grid Code',              'monthly'),
('ancillary_clearing',   'grid_operator', 'grid_operator','Ancillary services clearing',        'Reserve, regulation, voltage support clearing',     'NERSA Ancillary Rules',     'monthly'),
('outage_log',           'grid_operator', 'grid_operator','Outage register',                    'Planned + unplanned outage durations',              'SA Grid Code',              'monthly'),
-- Regulator
('market_surveillance',  'regulator',     'regulator',   'Market surveillance alerts',          'Surveillance rule firings + actions',               'MAR / NERSA Market Conduct','monthly'),
('licensing_register',   'regulator',     'regulator',   'Licensing register',                  'All ERA 2006 s.8 licences + conditions',            'ERA 2006',                  'annual'),
('hhi_concentration',    'regulator',     'regulator',   'HHI market concentration',            'Herfindahl-Hirschman index by tech + region',       NULL,                        'quarterly'),
('enforcement_log',      'regulator',     'regulator',   'Enforcement case log',                'Open + closed enforcement cases',                   'ERA 2006 / NERSA Rules',    'monthly'),
-- Admin / platform
('platform_audit',       'admin',         'admin',       'Platform audit trail',                'All admin actions for the period',                  'POPIA / King IV',           'monthly'),
('kyc_status',           'admin',         'admin',       'KYC status report',                   'Participants by KYC stage',                         'FICA',                      'monthly'),
('tenant_invoices',      'admin',         'admin_platform','Tenant invoices',                   'Per-tenant subscription + usage billing',           NULL,                        'monthly'),
('siem_dispatch',        'admin',         'siem',        'SIEM event dispatch log',             'Forwarder deliveries + retries',                    'POPIA / King IV',           'monthly'),
('cron_health',          'admin',         'admin',       'Cron + worker health',                'Last-run timestamps for every scheduled job',       NULL,                        'daily'),
-- ESG (every role can run these for self)
('scope_inventory',      'admin',         'esg',         'Scope 1/2/3 inventory',               'Per-transaction GHG accounting ledger',             'GHG Protocol',              'annual'),
('cdp_disclosure',       'admin',         'esg',         'CDP disclosure pack',                 'CDP questionnaire-ready submission',                'CDP',                       'annual'),
('tcfd_disclosure',      'admin',         'esg',         'TCFD disclosure pack',                'TCFD 4-pillar disclosure',                          'TCFD',                      'annual'),
('csrd_disclosure',      'admin',         'esg',         'CSRD / ESRS disclosure pack',         'CSRD ESRS E1 + double-materiality',                 'CSRD / ESRS',               'annual');
