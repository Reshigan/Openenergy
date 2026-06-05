-- W216: Trader FSCA Periodic Conduct Report
-- FSCA Conduct Standard 1/2020 + FMA Chapter X + FAIS s18
CREATE TABLE IF NOT EXISTS oe_fsca_conduct_reports (
  id                       TEXT PRIMARY KEY,
  participant_id           TEXT NOT NULL,   -- trading participant

  -- Report classification
  report_tier              TEXT NOT NULL CHECK(report_tier IN (
    'retail','professional','market_maker','systemic'
  )),
  reporting_period         TEXT NOT NULL,   -- e.g. 'Q4-2025', 'Annual-2025'
  reporting_year           INTEGER NOT NULL,
  is_annual                INTEGER NOT NULL DEFAULT 0,  -- 0=quarterly, 1=annual

  -- Business metrics
  total_notional_zar       REAL,
  client_count             INTEGER,
  complaint_count          INTEGER,
  complaint_upheld_count   INTEGER,
  best_ex_exceptions       INTEGER DEFAULT 0,
  algo_incidents           INTEGER DEFAULT 0,
  conduct_breaches         INTEGER DEFAULT 0,

  -- Review process
  compliance_officer       TEXT,
  board_sign_off_date      TEXT,
  board_signatory          TEXT,

  -- Submission
  fsca_submission_ref      TEXT,
  submitted_at             TEXT,
  fsca_acknowledgement_ref TEXT,

  -- Queries
  query_summary            TEXT,
  query_raised_at          TEXT,
  query_responded_at       TEXT,
  query_response_ref       TEXT,

  -- Outcome
  accepted_at              TEXT,
  rejected_at              TEXT,
  rejection_reason         TEXT,
  escalation_reason        TEXT,

  chain_status             TEXT NOT NULL DEFAULT 'draft' CHECK(chain_status IN (
    'draft','internal_review','board_approved','submitted_to_fsca',
    'fsca_queries','queries_responded','accepted','rejected','escalated','withdrawn'
  )),
  sla_deadline             TEXT NOT NULL,
  sla_breached             INTEGER NOT NULL DEFAULT 0,
  regulator_notified       INTEGER NOT NULL DEFAULT 0,

  actor_id                 TEXT,
  reason                   TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fcr_status
  ON oe_fsca_conduct_reports(chain_status);

CREATE INDEX IF NOT EXISTS idx_fcr_participant
  ON oe_fsca_conduct_reports(participant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fcr_period
  ON oe_fsca_conduct_reports(participant_id, reporting_period)
  WHERE fsca_submission_ref IS NULL;
