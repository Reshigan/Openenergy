-- 448 — W202 IPP Green Bond Allocation & Climate Finance Report
-- ICMA GBP 2021 + JSE Green Bond Segment Rules + CBI Climate Bonds Standard
CREATE TABLE IF NOT EXISTS oe_green_bond_reports (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT NOT NULL,
  bond_isin             TEXT,
  bond_class            TEXT NOT NULL DEFAULT 'project'
                          CHECK (bond_class IN ('project','corporate','sovereign','securitised')),
  report_year           INTEGER NOT NULL,
  issuance_size_zar     REAL NOT NULL DEFAULT 0,
  reporting_period_start TEXT NOT NULL,
  reporting_period_end   TEXT NOT NULL,
  chain_status          TEXT NOT NULL DEFAULT 'period_open'
                          CHECK (chain_status IN (
                            'period_open','data_gathering','impact_calculation',
                            'external_review','board_approval','submitted_jse',
                            'under_review','queries_raised','queries_responded',
                            'approved','published','deficiency_noted','remediation','rejected'
                          )),
  -- Impact metrics
  kwh_generated         REAL,
  carbon_avoided_tco2e  REAL,
  green_capex_deployed_zar REAL,
  eligible_projects_count INTEGER,
  -- External review
  external_reviewer      TEXT,
  review_type            TEXT CHECK (review_type IN ('second_party','certification','verification','rating')),
  review_completed_at    TEXT,
  review_ref             TEXT,
  -- Board
  board_approved_at      TEXT,
  board_resolution_ref   TEXT,
  -- JSE tracking
  jse_submission_ref     TEXT,
  jse_approved_at        TEXT,
  published_at           TEXT,
  -- Queries
  query_count            INTEGER NOT NULL DEFAULT 0,
  last_query_at          TEXT,
  last_response_at       TEXT,
  -- Deficiency
  deficiency_description TEXT,
  rejection_reason       TEXT,
  -- SLA
  sla_deadline           TEXT NOT NULL,
  sla_breached           INTEGER NOT NULL DEFAULT 0,
  regulator_notified     INTEGER NOT NULL DEFAULT 0,
  actor_id               TEXT NOT NULL,
  reason                 TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gbr_participant ON oe_green_bond_reports(participant_id, report_year);
CREATE INDEX IF NOT EXISTS idx_gbr_status      ON oe_green_bond_reports(chain_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gbr_isin_year
  ON oe_green_bond_reports(bond_isin, report_year) WHERE bond_isin IS NOT NULL;
