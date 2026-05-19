-- ════════════════════════════════════════════════════════════════════════
-- 065_regulator_l5.sql — Regulator L5.
--
-- Public participation portal, hearings, MYPD methodology, decision
-- publication, appeals, compliance audit, State of Energy report.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_tariff_applications (
  id                  TEXT PRIMARY KEY,
  applicant_id        TEXT NOT NULL,
  application_ref     TEXT NOT NULL UNIQUE,
  application_type    TEXT NOT NULL,            -- mypd | annual_revision | special_review
  filing_date         TEXT NOT NULL,
  comment_period_ends TEXT NOT NULL,
  hearing_scheduled_at TEXT,
  status              TEXT NOT NULL DEFAULT 'filed',
                                                 -- filed | in_comment_period |
                                                 -- comment_period_closed | scheduled_for_hearing |
                                                 -- heard | decision_pending | decided |
                                                 -- on_appeal | withdrawn
  requested_revenue_zar REAL,
  current_revenue_zar  REAL,
  pct_change           REAL,
  documents_r2_prefix  TEXT,
  decision_id          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT
);

CREATE TABLE IF NOT EXISTS oe_public_comments (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL,
  commenter_email TEXT NOT NULL,
  commenter_name  TEXT,
  commenter_org   TEXT,
  comment_body    TEXT NOT NULL,
  position        TEXT NOT NULL,                 -- support | oppose | qualified | neutral
  ip              TEXT,
  attachment_r2_key TEXT,
  status          TEXT NOT NULL DEFAULT 'submitted',
                                                  -- submitted | published | rejected | spam
  reviewer_id     TEXT,
  reviewed_at     TEXT,
  submitted_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_comments_app ON oe_public_comments(application_id, status);

CREATE TABLE IF NOT EXISTS oe_hearings (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL,
  scheduled_at    TEXT NOT NULL,
  venue           TEXT,
  panel_members   TEXT,                          -- JSON
  agenda          TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled',
                                                  -- scheduled | in_progress | concluded |
                                                  -- adjourned | cancelled
  transcript_r2_key TEXT,
  recording_r2_key  TEXT,
  attendee_count  INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_hearings_app ON oe_hearings(application_id);

CREATE TABLE IF NOT EXISTS oe_mypd_methodology (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL,
  rab_zar_m       REAL NOT NULL,
  opex_zar_m      REAL NOT NULL,
  depreciation_zar_m REAL NOT NULL,
  wacc_pre_tax    REAL NOT NULL,
  wacc_post_tax   REAL,
  sales_gwh       REAL NOT NULL,
  allowed_revenue_zar_m REAL NOT NULL,           -- opex + dep + WACC × RAB
  allowed_tariff_zar_kwh REAL NOT NULL,
  rate_of_return_pct REAL,
  efficiency_factor REAL,                        -- X-factor on RPI-X
  computed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  computed_by     TEXT,
  approved_by     TEXT,
  approved_at     TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_mypd_app ON oe_mypd_methodology(application_id);

CREATE TABLE IF NOT EXISTS oe_regulator_decisions (
  id                  TEXT PRIMARY KEY,
  application_id      TEXT NOT NULL,
  decision_ref        TEXT NOT NULL UNIQUE,
  decision_type       TEXT NOT NULL,             -- granted | refused | modified | deferred
  approved_revenue_zar REAL,
  approved_tariff_zar_kwh REAL,
  effective_from      TEXT,
  effective_to        TEXT,
  reasons_body        TEXT,                      -- written reasons
  decision_doc_r2_key TEXT,
  decided_at          TEXT NOT NULL DEFAULT (datetime('now')),
  decided_by          TEXT NOT NULL,
  panel_signatories   TEXT,                      -- JSON
  published_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_decisions_app ON oe_regulator_decisions(application_id);

CREATE TABLE IF NOT EXISTS oe_appeals (
  id              TEXT PRIMARY KEY,
  decision_id     TEXT NOT NULL,
  appellant_id    TEXT NOT NULL,
  forum           TEXT NOT NULL,                 -- nersa_review | high_court_jhb |
                                                  -- supreme_court_of_appeal | constitutional_court
  grounds         TEXT NOT NULL,
  filed_at        TEXT NOT NULL DEFAULT (datetime('now')),
  status          TEXT NOT NULL DEFAULT 'filed',
                                                  -- filed | heard | dismissed | upheld |
                                                  -- remitted_for_reconsideration | settled
  outcome_body    TEXT,
  outcome_at      TEXT,
  matter_number   TEXT,                          -- court case number
  doc_r2_prefix   TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_appeals_dec ON oe_appeals(decision_id);

CREATE TABLE IF NOT EXISTS oe_compliance_audits (
  id              TEXT PRIMARY KEY,
  licensee_id     TEXT NOT NULL,
  audit_type      TEXT NOT NULL,                 -- routine | targeted | post_incident
  scope           TEXT,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  concluded_at    TEXT,
  lead_auditor    TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
                                                  -- open | site_visited | report_drafted |
                                                  -- report_issued | closed
  findings_count  INTEGER NOT NULL DEFAULT 0,
  penalty_zar     REAL DEFAULT 0,
  report_r2_key   TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_audits_lic ON oe_compliance_audits(licensee_id, status);

CREATE TABLE IF NOT EXISTS oe_audit_findings (
  id          TEXT PRIMARY KEY,
  audit_id    TEXT NOT NULL,
  finding_ref TEXT NOT NULL,
  severity    TEXT NOT NULL,                     -- minor | major | critical
  category    TEXT NOT NULL,                     -- licence_condition | grid_code |
                                                  -- safety | reporting | financial
  description TEXT NOT NULL,
  remediation_required TEXT,
  remediation_deadline TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
                                                  -- open | remediated | escalated | closed
  remediated_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_findings_audit ON oe_audit_findings(audit_id, status);

CREATE TABLE IF NOT EXISTS oe_state_of_energy_reports (
  id                  TEXT PRIMARY KEY,
  year                INTEGER NOT NULL UNIQUE,
  total_generation_twh REAL,
  peak_demand_mw      REAL,
  renewable_pct       REAL,
  load_shedding_hours INTEGER,
  customer_count      INTEGER,
  active_licences     INTEGER,
  active_tariffs      INTEGER,
  report_doc_r2_key   TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',
                                                  -- draft | published | superseded
  published_at        TEXT,
  generated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  generated_by        TEXT
);
