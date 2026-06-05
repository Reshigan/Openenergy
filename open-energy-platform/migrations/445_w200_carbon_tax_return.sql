-- Wave 200: Carbon Tax Quarterly Return & SARS Filing
-- Carbon Tax Act 15/2019 §16 · SARS Notice 1541 · National Treasury
-- Tracks taxpayer's carbon tax return from period open through SARS
-- assessment and payment, including offset allowance claims.

CREATE TABLE IF NOT EXISTS oe_carbon_tax_returns (
  id                    TEXT PRIMARY KEY,
  chain_status          TEXT NOT NULL DEFAULT 'period_open',
  sla_deadline          TEXT,
  sla_breached          INTEGER NOT NULL DEFAULT 0,
  regulator_notified    INTEGER NOT NULL DEFAULT 0,
  actor_id              TEXT,
  reason                TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),

  -- Taxpayer context
  participant_id        TEXT NOT NULL,
  tax_class             TEXT NOT NULL DEFAULT 'standard'
                          CHECK (tax_class IN ('micro','standard','large','major')),
  tax_period            TEXT NOT NULL,       -- 'Q1-2025', 'Q2-2025', etc.
  fiscal_year           INTEGER NOT NULL,

  -- Emissions data
  scope1_tco2e          REAL NOT NULL DEFAULT 0,
  scope2_tco2e          REAL NOT NULL DEFAULT 0,
  process_emissions_tco2e REAL NOT NULL DEFAULT 0,
  total_emissions_tco2e REAL NOT NULL DEFAULT 0,

  -- Allowances (Carbon Tax Act Schedule 2)
  basic_allowance_pct   REAL NOT NULL DEFAULT 0,
  offset_allowance_pct  REAL NOT NULL DEFAULT 0,   -- max 10% Annex 2 / 5% general
  total_allowance_pct   REAL NOT NULL DEFAULT 0,

  -- Financial
  tax_rate_per_tco2     REAL NOT NULL DEFAULT 190,  -- 2025 rate (ZAR)
  gross_tax_liability   REAL,
  allowances_value      REAL,
  net_tax_payable       REAL,
  payment_reference     TEXT,
  paid_amount           REAL,
  paid_at               TEXT,

  -- SARS tracking
  sars_submission_ref   TEXT,
  sars_assessment_ref   TEXT,
  assessment_amount     REAL,
  dispute_reason        TEXT
);

CREATE INDEX IF NOT EXISTS idx_ctr_participant ON oe_carbon_tax_returns(participant_id);
CREATE INDEX IF NOT EXISTS idx_ctr_status      ON oe_carbon_tax_returns(chain_status);
CREATE INDEX IF NOT EXISTS idx_ctr_period      ON oe_carbon_tax_returns(tax_period, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_ctr_class       ON oe_carbon_tax_returns(tax_class);
