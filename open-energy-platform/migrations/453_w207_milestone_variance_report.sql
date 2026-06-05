-- W207: IPP Milestone & Schedule Variance Report
-- REIPPPP Schedule of Compliance + NERSA Construction Permit + DBSA/DFI milestones
CREATE TABLE IF NOT EXISTS oe_milestone_variance_reports (
  id                      TEXT PRIMARY KEY,
  participant_id          TEXT NOT NULL,
  project_id              TEXT,            -- reference to IPP project
  report_period           TEXT NOT NULL,   -- e.g. "2026-Q2"
  reporting_date          TEXT NOT NULL,
  risk_tier               TEXT NOT NULL CHECK(risk_tier IN ('minor','moderate','significant','critical')),

  -- Milestone summary
  total_milestones        INTEGER DEFAULT 0,
  milestones_on_track     INTEGER DEFAULT 0,
  milestones_delayed      INTEGER DEFAULT 0,
  milestones_critical     INTEGER DEFAULT 0,

  -- Schedule variance
  overall_schedule_variance_days INTEGER,  -- positive = ahead, negative = behind
  critical_path_float_days INTEGER,
  cod_forecast_date       TEXT,            -- updated COD forecast
  original_cod_date       TEXT,            -- baseline COD from financial close

  -- IE certification
  ie_firm_name            TEXT,
  ie_report_ref           TEXT,
  ie_certified_at         TEXT,

  -- DFI details
  dfi_submission_ref      TEXT,
  dfi_query_count         INTEGER DEFAULT 0,
  dfi_last_query_at       TEXT,
  dfi_accepted_at         TEXT,

  -- Remediation
  remediation_plan_ref    TEXT,
  remediation_deadline    TEXT,

  -- Critical delay
  critical_delay_description TEXT,
  critical_delay_reported_at TEXT,

  chain_status            TEXT NOT NULL DEFAULT 'draft' CHECK(chain_status IN (
    'draft','ie_review','ie_certified','dfi_submitted','dfi_queries',
    'dfi_queries_responded','dfi_accepted','remediation_plan',
    'remediation_submitted','remediation_accepted','critical_delay','withdrawn'
  )),
  sla_deadline            TEXT NOT NULL,
  sla_breached            INTEGER NOT NULL DEFAULT 0,
  regulator_notified      INTEGER NOT NULL DEFAULT 0,

  actor_id                TEXT,
  reason                  TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_mvs_period
  ON oe_milestone_variance_reports(participant_id, report_period);

CREATE INDEX IF NOT EXISTS idx_mvs_status
  ON oe_milestone_variance_reports(chain_status);

CREATE INDEX IF NOT EXISTS idx_mvs_participant
  ON oe_milestone_variance_reports(participant_id);
