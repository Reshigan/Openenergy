-- W203: Basel III Regulatory Capital & RWA Adequacy Report
-- SARB BA 900 + Basel III / CRR III Pillar 2 ICAAP + SARB Directive 1/2014
CREATE TABLE IF NOT EXISTS oe_capital_adequacy_reports (
  id                      TEXT PRIMARY KEY,
  participant_id          TEXT NOT NULL,
  bank_tier               TEXT NOT NULL CHECK(bank_tier IN ('smaller','mid_tier','large','systemically_important')),
  report_period           TEXT NOT NULL, -- e.g. "2026-Q1"
  reporting_date          TEXT NOT NULL, -- quarter end date

  -- Capital ratios (percentages)
  cet1_ratio              REAL,          -- Common Equity Tier 1
  tier1_ratio             REAL,          -- Total Tier 1
  total_capital_ratio     REAL,          -- Total Capital
  leverage_ratio          REAL,          -- Basel III Leverage Ratio

  -- RWA breakdown (ZAR)
  rwa_credit_risk         REAL,
  rwa_market_risk         REAL,
  rwa_operational_risk    REAL,
  rwa_total               REAL,

  -- Capital buffers
  capital_conservation_buffer REAL DEFAULT 2.5,
  countercyclical_buffer  REAL DEFAULT 0,
  systemic_risk_buffer    REAL DEFAULT 0,

  -- SARB reference
  sarb_submission_ref     TEXT,
  sarb_accepted_at        TEXT,
  ba900_form_ref          TEXT,

  -- Queries
  query_count             INTEGER DEFAULT 0,
  last_query_at           TEXT,
  last_response_at        TEXT,

  -- Remediation
  remediation_description TEXT,
  remediation_deadline    TEXT,

  -- Breach details
  breach_description      TEXT,
  breach_cet1_ratio       REAL,          -- actual CET1 at time of breach

  -- State machine
  chain_status            TEXT NOT NULL DEFAULT 'data_gathering' CHECK(chain_status IN (
    'data_gathering','rwa_calculation','capital_aggregation','icaap_review',
    'board_review','submitted_sarb','under_review','queries_raised',
    'queries_responded','accepted','remediation_required','remediation',
    'capital_breach','withdrawn'
  )),
  sla_deadline            TEXT NOT NULL,
  sla_breached            INTEGER NOT NULL DEFAULT 0,
  regulator_notified      INTEGER NOT NULL DEFAULT 0,

  actor_id                TEXT,
  reason                  TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_cap_adequacy_period
  ON oe_capital_adequacy_reports(participant_id, report_period);

CREATE INDEX IF NOT EXISTS idx_cap_adequacy_status
  ON oe_capital_adequacy_reports(chain_status);

CREATE INDEX IF NOT EXISTS idx_cap_adequacy_participant
  ON oe_capital_adequacy_reports(participant_id);
