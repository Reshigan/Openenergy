-- Wave 140: IPP Subcontractor Management
-- OHSA SA Construction Regulations 2014 Reg.6 (principal contractor responsibilities)
-- ISO 45001:2018 contractor management
-- REIPPPP ED local content requirements (W27)
-- Equator Principles EP4 supply chain ESG
-- Beats Oracle Aconex (documents only) + Procore Subcontractors (no performance scoring or OHSA lifecycle)
-- URGENT SLA: critical_trade 24h TIGHTEST → labor_only 168h loosest
-- SIGNATURE: terminate_subcontractor EVERY tier on safety_violation; suspend_subcontractor when floor_ohsa_notification;
--            close_subcontract when floor_lender_escrow_release.

CREATE TABLE IF NOT EXISTS oe_ipp_subcontractors (
  -- Core
  id                        TEXT PRIMARY KEY,
  project_id                TEXT NOT NULL,
  project_name              TEXT,
  company_name              TEXT NOT NULL,
  chain_status              TEXT NOT NULL DEFAULT 'registered',
  trade_category            TEXT,
  subcontractor_tier        TEXT,
  contract_ref              TEXT,
  contract_value_zar        INTEGER,
  scope_description         TEXT NOT NULL,
  scheduled_start_date      TEXT,
  scheduled_end_date        TEXT,
  actual_start_date         TEXT,
  actual_end_date           TEXT,

  -- Compliance & credentials
  bee_level                 INTEGER,
  local_content_pct         REAL,
  sa_employee_count         INTEGER,
  insurance_expiry_date     TEXT,
  cidb_grade                TEXT,
  registration_number       TEXT,

  -- Performance tracking
  performance_score         REAL,
  hse_incident_count        INTEGER NOT NULL DEFAULT 0,
  ncr_count                 INTEGER NOT NULL DEFAULT 0,
  review_notes              TEXT,
  termination_cause         TEXT,
  suspension_reason         TEXT,
  reinstatement_conditions  TEXT,

  -- Key contacts
  site_representative       TEXT,
  site_representative_phone TEXT,
  safety_officer            TEXT,
  safety_officer_phone      TEXT,

  -- Floor flags (5)
  floor_ohsa_notification     INTEGER NOT NULL DEFAULT 0,
  floor_lender_escrow_release INTEGER NOT NULL DEFAULT 0,
  floor_reipppp_ed_reporting  INTEGER NOT NULL DEFAULT 0,
  floor_bee_verification      INTEGER NOT NULL DEFAULT 0,
  floor_ie_oversight          INTEGER NOT NULL DEFAULT 0,

  -- SLA fields
  sla_target_hours          INTEGER,
  sla_deadline_at           TEXT,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  sla_breach_count          INTEGER NOT NULL DEFAULT 0,

  -- Regulator
  is_reportable             INTEGER NOT NULL DEFAULT 0,
  regulator_ref             TEXT,

  -- Cross-refs
  ed_commitment_ref         TEXT,
  hse_incident_ref          TEXT,
  ncr_ref                   TEXT,
  ms_ref                    TEXT,

  -- State timestamps (12 states; barred shares terminated_at)
  registered_at             TEXT,
  pre_qualification_at      TEXT,
  inducted_at               TEXT,
  mobilized_at              TEXT,
  performing_at             TEXT,
  under_review_at           TEXT,
  good_standing_at          TEXT,
  work_complete_at          TEXT,
  demobilized_at            TEXT,
  closed_at                 TEXT,
  suspended_at              TEXT,
  terminated_at             TEXT,

  -- Meta
  created_by                TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_ipp_subcontractor_events (
  id                TEXT PRIMARY KEY,
  subcontractor_id  TEXT NOT NULL,
  action            TEXT NOT NULL,
  from_status       TEXT,
  to_status         TEXT,
  actor_id          TEXT,
  actor_role        TEXT,
  notes             TEXT,
  regulator_crossed INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_sub_chain_status      ON oe_ipp_subcontractors (chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_sub_tier              ON oe_ipp_subcontractors (subcontractor_tier);
CREATE INDEX IF NOT EXISTS idx_ipp_sub_trade_category    ON oe_ipp_subcontractors (trade_category);
CREATE INDEX IF NOT EXISTS idx_ipp_sub_project_id        ON oe_ipp_subcontractors (project_id);
CREATE INDEX IF NOT EXISTS idx_ipp_sub_sla_breached      ON oe_ipp_subcontractors (sla_breached);
CREATE INDEX IF NOT EXISTS idx_ipp_sub_is_reportable     ON oe_ipp_subcontractors (is_reportable);
CREATE INDEX IF NOT EXISTS idx_ipp_sub_ohsa_notification ON oe_ipp_subcontractors (floor_ohsa_notification);
CREATE INDEX IF NOT EXISTS idx_ipp_sub_ed_reporting      ON oe_ipp_subcontractors (floor_reipppp_ed_reporting);
