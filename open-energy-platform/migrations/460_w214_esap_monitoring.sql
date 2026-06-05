-- W214: Lender E&S Action Plan (ESAP) Monitoring
-- Equator Principles IV + IFC Performance Standards (PS1–PS8)
CREATE TABLE IF NOT EXISTS oe_esap_monitoring (
  id                       TEXT PRIMARY KEY,
  participant_id           TEXT NOT NULL,   -- lender / project finance institution

  -- Project references
  project_ref              TEXT,            -- link to W20 construction/COD project
  facility_ref             TEXT,            -- link to W53 credit facility application
  loan_ref                 TEXT,            -- loan agreement reference

  -- ESAP classification
  esap_tier                TEXT NOT NULL CHECK(esap_tier IN (
    'category_c','category_b','category_a','critical_ps'
  )),
  ep_category              TEXT CHECK(ep_category IN ('A','B','C',NULL)),  -- Equator Category
  ps_triggers              TEXT,            -- JSON array of IFC PS triggered e.g. ["PS1","PS6","PS7"]

  -- Monitoring details
  monitoring_cycle         TEXT,            -- e.g. "Annual 2025", "Semi-annual H1-2025"
  site_name                TEXT,
  site_location            TEXT,
  auditor_name             TEXT,
  auditor_firm             TEXT,
  visit_scheduled_date     TEXT,
  visit_completed_date     TEXT,

  -- Findings
  findings_summary         TEXT,
  finding_count_major      INTEGER DEFAULT 0,
  finding_count_minor      INTEGER DEFAULT 0,
  ps1_labour_compliant     INTEGER,         -- 0/1 per PS
  ps2_labour_compliant     INTEGER,
  ps3_resource_compliant   INTEGER,
  ps4_community_compliant  INTEGER,
  ps6_biodiversity_compliant INTEGER,
  ps7_indigenous_compliant INTEGER,

  -- CAP / Remediation
  cap_submitted_at         TEXT,
  cap_due_date             TEXT,
  cap_reference            TEXT,
  remediation_started_at   TEXT,
  remediation_completed_at TEXT,

  -- Third-party review
  tpa_firm                 TEXT,
  tpa_ref                  TEXT,
  tpa_completed_at         TEXT,
  tpa_outcome              TEXT CHECK(tpa_outcome IN ('satisfactory','conditional','unsatisfactory',NULL)),

  -- Closure
  closed_at                TEXT,
  escalation_reason        TEXT,
  non_compliance_ref       TEXT,

  chain_status             TEXT NOT NULL DEFAULT 'esap_issued' CHECK(chain_status IN (
    'esap_issued','site_visit_scheduled','site_visit_completed','action_identified',
    'corrective_action_plan','remediation_in_progress','third_party_review',
    'partial_close','closed_satisfactory','closed_escalated','non_compliant','withdrawn'
  )),
  sla_deadline             TEXT NOT NULL,
  sla_breached             INTEGER NOT NULL DEFAULT 0,
  regulator_notified       INTEGER NOT NULL DEFAULT 0,

  actor_id                 TEXT,
  reason                   TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_esap_status
  ON oe_esap_monitoring(chain_status);

CREATE INDEX IF NOT EXISTS idx_esap_participant
  ON oe_esap_monitoring(participant_id);

CREATE INDEX IF NOT EXISTS idx_esap_project
  ON oe_esap_monitoring(project_ref);
