-- Wave 137 — IPP Method Statement (SWMS) Management
-- OHSA (SA) Construction Regulations 2014 Reg.7 + Equator Principles EP4 + REIPPPP site safety
-- URGENT SLA: high_risk 24h (tightest) → routine 336h (loosest)
-- SIGNATURE: approve_ms EVERY tier when is_critical_lift OR is_confined_space OR is_live_electrical
--            suspend_work crosses when floor_regulatory_notification
-- Companion planning document to Permit-to-Work (W64).

CREATE TABLE IF NOT EXISTS oe_ipp_method_statements (
  -- Core identity
  id                        TEXT    PRIMARY KEY,
  project_id                TEXT    NOT NULL,
  project_name              TEXT,
  ms_number                 TEXT,
  chain_status              TEXT    NOT NULL DEFAULT 'drafted',
  ms_title                  TEXT    NOT NULL,

  -- Classification
  work_type                 TEXT,   -- civil/structural/electrical/mechanical/instrumentation/scaffolding/demolition/excavation/commissioning/general
  risk_tier                 TEXT,   -- high_risk/medium_risk/low_risk/routine
  work_area                 TEXT,
  scheduled_start_date      TEXT,
  scheduled_duration_days   INTEGER,

  -- Safety flags (drive SIGNATURE logic)
  is_critical_lift          INTEGER NOT NULL DEFAULT 0,  -- Crane lift >80% SWL or >10t
  is_confined_space         INTEGER NOT NULL DEFAULT 0,  -- Confined space entry
  is_live_electrical        INTEGER NOT NULL DEFAULT 0,  -- Live electrical work
  is_hot_work               INTEGER NOT NULL DEFAULT 0,  -- Welding/cutting/grinding
  is_working_at_height      INTEGER NOT NULL DEFAULT 0,  -- Work at height >1.5m

  -- Content fields
  scope_of_work             TEXT    NOT NULL,
  work_sequence             TEXT,   -- step-by-step JSON or free text
  resources_personnel       TEXT,
  plant_equipment           TEXT,
  hazard_register           TEXT,
  ppe_requirements          TEXT,
  emergency_procedure       TEXT,
  environmental_controls    TEXT,
  toolbox_talk_notes        TEXT,
  suspension_reason         TEXT,
  revision_number           INTEGER NOT NULL DEFAULT 0,
  superseded_by_ref         TEXT,

  -- Floor flags (5)
  floor_ptw_required            INTEGER NOT NULL DEFAULT 0,  -- PTW must be issued (links W64)
  floor_ie_review_required      INTEGER NOT NULL DEFAULT 0,  -- IE must review
  floor_regulatory_notification INTEGER NOT NULL DEFAULT 0,  -- DOL/OHSA notification required
  floor_lender_notification     INTEGER NOT NULL DEFAULT 0,  -- Lender notification required
  floor_third_party_inspection  INTEGER NOT NULL DEFAULT 0,  -- Third-party inspection required

  -- SLA fields
  sla_target_hours          INTEGER,
  sla_deadline_at           TEXT,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  sla_breach_count          INTEGER NOT NULL DEFAULT 0,

  -- Regulator
  is_reportable             INTEGER NOT NULL DEFAULT 0,
  regulator_ref             TEXT,

  -- Cross-references
  ptw_ref                   TEXT,   -- Permit to Work (W64)
  ncr_ref                   TEXT,   -- linked NCR (W136)
  hse_incident_ref          TEXT,   -- linked HSE incident (W25)
  work_order_ref            TEXT,   -- linked work order (W16)
  risk_ref                  TEXT,   -- linked risk entry (W133)

  -- State timestamps (12)
  drafted_at                TEXT,
  reviewed_at               TEXT,
  risk_assessed_at          TEXT,
  approved_at               TEXT,
  toolbox_briefed_at        TEXT,
  active_at                 TEXT,
  work_completed_at         TEXT,
  closed_at                 TEXT,
  rejected_at               TEXT,
  superseded_at             TEXT,
  suspended_at              TEXT,
  archived_at               TEXT,

  -- Meta
  created_by                TEXT,
  created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Events table
CREATE TABLE IF NOT EXISTS oe_ipp_ms_events (
  id                TEXT    PRIMARY KEY,
  ms_id             TEXT    NOT NULL,
  action            TEXT    NOT NULL,
  from_status       TEXT    NOT NULL,
  to_status         TEXT    NOT NULL,
  actor_id          TEXT,
  actor_role        TEXT,
  notes             TEXT,
  regulator_crossed INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_chain_status     ON oe_ipp_method_statements(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_risk_tier         ON oe_ipp_method_statements(risk_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_work_type         ON oe_ipp_method_statements(work_type);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_project_id        ON oe_ipp_method_statements(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_sla_breached      ON oe_ipp_method_statements(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_is_reportable     ON oe_ipp_method_statements(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_critical_lift     ON oe_ipp_method_statements(is_critical_lift);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_confined_space    ON oe_ipp_method_statements(is_confined_space);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_live_electrical   ON oe_ipp_method_statements(is_live_electrical);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_ms_events_ms_id      ON oe_ipp_ms_events(ms_id);
