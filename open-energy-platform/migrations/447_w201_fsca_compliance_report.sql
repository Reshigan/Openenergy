-- 447 — W201 FSCA Annual Compliance Certificate & Compliance Officer Report
-- FAIS Act §17 + Conduct Standard 1/2021 mandatory annual compliance reporting
CREATE TABLE IF NOT EXISTS oe_fsca_compliance_reports (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  fsp_licence_number  TEXT,
  fsp_class           TEXT NOT NULL DEFAULT 'standard'
                        CHECK (fsp_class IN ('micro','standard','large','systemic')),
  report_year         INTEGER NOT NULL,
  reporting_period_start TEXT NOT NULL,
  reporting_period_end   TEXT NOT NULL,
  chain_status        TEXT NOT NULL DEFAULT 'report_scheduled'
                        CHECK (chain_status IN (
                          'report_scheduled','data_gathering','drafting',
                          'internal_review','co_sign_off','submitted',
                          'under_review','queries_received','queries_responded',
                          'filed','deficiency_found','remediation','refiled','revocation_risk'
                        )),
  -- Compliance officer
  compliance_officer_id   TEXT,
  compliance_officer_name TEXT,
  co_signed_at            TEXT,
  -- Submission tracking
  fsca_reference          TEXT,
  submitted_at            TEXT,
  filed_at                TEXT,
  refiled_at              TEXT,
  -- Queries
  query_count             INTEGER NOT NULL DEFAULT 0,
  last_query_at           TEXT,
  last_response_at        TEXT,
  -- Deficiency / remediation
  deficiency_description  TEXT,
  remediation_plan        TEXT,
  remediation_deadline    TEXT,
  -- Risk flag
  revocation_risk_reason  TEXT,
  -- SLA
  sla_deadline            TEXT NOT NULL,
  sla_breached            INTEGER NOT NULL DEFAULT 0,
  regulator_notified      INTEGER NOT NULL DEFAULT 0,
  actor_id                TEXT NOT NULL,
  reason                  TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fsca_report_participant
  ON oe_fsca_compliance_reports(participant_id, report_year);
CREATE INDEX IF NOT EXISTS idx_fsca_report_status
  ON oe_fsca_compliance_reports(chain_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fsca_report_year_participant
  ON oe_fsca_compliance_reports(participant_id, report_year);
