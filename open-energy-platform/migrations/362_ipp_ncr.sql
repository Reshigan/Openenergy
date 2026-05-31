-- Wave 136 — IPP Non-Conformance Report (NCR) Management
-- ISO 9001:2015 §8.7 + Equator Principles IV QA + REIPPPP quality requirements
-- URGENT SLA: safety_critical 24h (tightest) → cosmetic 720h (loosest)
-- SIGNATURE: reject_escalate EVERY tier; accept_as_is crosses when IE/NERSA flag
-- Beats Procore NCR (shallow workflow, no P6 state machine) +
--         Oracle Aconex Quality (generic workflow, no REIPPPP-specific disposition logic)

CREATE TABLE IF NOT EXISTS oe_ipp_ncrs (
  -- Identity
  id                              TEXT PRIMARY KEY,                             -- ncr-001
  project_id                      TEXT NOT NULL,
  project_name                    TEXT,                                         -- denormalized
  ncr_number                      TEXT,                                         -- K500-NCR-001

  -- State machine
  chain_status                    TEXT NOT NULL DEFAULT 'raised',

  -- Classification
  ncr_category                    TEXT,  -- workmanship/materials/design/documentation/safety/environmental/commissioning/testing
  ncr_severity                    TEXT,  -- safety_critical/structural/functional/minor/cosmetic
  discipline                      TEXT,  -- civil/structural/electrical/mechanical/instrumentation/hvac/process
  work_area                       TEXT,
  specification_ref               TEXT,  -- drawing/spec/standard violated

  -- Content
  description                     TEXT NOT NULL,
  detected_by                     TEXT,
  detection_method                TEXT,  -- inspection/audit/testing/observation
  disposition                     TEXT,  -- accept_as_is/rework/repair/replace/scrap
  disposition_justification       TEXT,
  rework_scope                    TEXT,
  corrective_action               TEXT,
  preventive_action               TEXT,
  root_cause                      TEXT,
  rca_method                      TEXT,  -- five_whys/fishbone/fmea/none
  reinspection_notes              TEXT,
  closure_notes                   TEXT,
  ie_comments                     TEXT,
  lender_notified                 INTEGER NOT NULL DEFAULT 0,

  -- Quantified impact
  rework_cost_zar                 INTEGER,
  schedule_impact_days            INTEGER,

  -- Floor flags (5)
  floor_ie_notification_required  INTEGER NOT NULL DEFAULT 0,
  floor_lender_consent_required   INTEGER NOT NULL DEFAULT 0,
  floor_nersa_reportable          INTEGER NOT NULL DEFAULT 0,
  floor_hold_point_triggered      INTEGER NOT NULL DEFAULT 0,
  floor_safety_stop_work          INTEGER NOT NULL DEFAULT 0,

  -- SLA
  sla_target_hours                INTEGER,
  sla_deadline_at                 TEXT,
  sla_breached                    INTEGER NOT NULL DEFAULT 0,
  sla_breach_count                INTEGER NOT NULL DEFAULT 0,

  -- Regulator / SIGNATURE
  is_reportable                   INTEGER NOT NULL DEFAULT 0,
  regulator_ref                   TEXT,

  -- Cross-references
  itp_ref                         TEXT,
  issue_ref                       TEXT,
  rfi_ref                         TEXT,
  submittal_ref                   TEXT,
  hse_incident_ref                TEXT,
  change_order_ref                TEXT,

  -- State timestamps (12)
  raised_at                       TEXT,
  acknowledged_at                 TEXT,
  under_investigation_at          TEXT,
  disposition_proposed_at         TEXT,
  disposition_reviewed_at         TEXT,
  rework_in_progress_at           TEXT,
  reinspection_at                 TEXT,
  corrective_action_planned_at    TEXT,
  closed_at                       TEXT,
  accepted_as_is_at               TEXT,
  rejected_escalated_at           TEXT,
  voided_at                       TEXT,

  -- Meta
  created_by                      TEXT,
  created_at                      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_ipp_ncr_events (
  id               TEXT PRIMARY KEY,
  ncr_id           TEXT NOT NULL,
  action           TEXT NOT NULL,
  from_status      TEXT NOT NULL,
  to_status        TEXT NOT NULL,
  actor_id         TEXT,
  actor_role       TEXT,
  notes            TEXT,
  regulator_crossed INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ncrs_chain_status       ON oe_ipp_ncrs (chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ncrs_ncr_severity        ON oe_ipp_ncrs (ncr_severity);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ncrs_ncr_category        ON oe_ipp_ncrs (ncr_category);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ncrs_project_id          ON oe_ipp_ncrs (project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ncrs_sla_breached        ON oe_ipp_ncrs (sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ncrs_is_reportable       ON oe_ipp_ncrs (is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ncrs_hold_point          ON oe_ipp_ncrs (floor_hold_point_triggered);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ncrs_safety_stop_work    ON oe_ipp_ncrs (floor_safety_stop_work);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ncr_events_ncr_id        ON oe_ipp_ncr_events (ncr_id);
