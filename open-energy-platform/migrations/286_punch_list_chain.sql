-- Wave 98 — IPP Punch List / COD Snag Handover (P6). The construction-completion
-- deficiency lifecycle for a best-in-class IPP-PM stack. Beats Procore Punch
-- List, BIM 360 Field, PlanGrid Punch List, Fieldwire snag, Autodesk
-- Construction Cloud Punch List, Bluebeam Revu Snag, Aconex Defects.
--
-- 11-state P6 lifecycle:
--   identified -> assess -> assessed
--     -> assign -> assigned
--       -> begin_remediation -> in_remediation
--         -> request_reinspection -> reinspect_requested
--           -> reinspect -> reinspected
--             -> accept -> accepted -> close -> closed (terminal clean)
--             -> reject_reinspection -> assigned (rejoin)
--           -> park -> on_hold -> resume -> in_remediation (rejoin)
--   void     -> voided    (terminal)
--   withdraw -> withdrawn (terminal)
--
-- Tier — RE-DERIVED from priority_class × workflow_class with FLOOR-AT-HIGH
-- for blocks_commercial_operation | blocks_handover | life_safety_critical
-- | warranty_critical.
--
-- URGENT SLA polarity (COD-blocking = tightest, punch is hours-money).
--
-- SIGNATURE (W98 — NERSA §C-5 + REIPPPP COD):
--   close                -> regulator EVERY tier when
--                           blocks_commercial_operation
--                           OR life_safety_critical
--   accept               -> regulator high+critical when life_safety_critical
--   reject_reinspection  -> regulator high+critical when
--                           blocks_commercial_operation
--   void                 -> regulator EVERY tier when blocks_handover
--                                                  OR life_safety_critical
--   sla_breached         -> regulator high+critical when
--                           blocks_commercial_operation
--                           OR life_safety_critical
--
-- Write {admin, ipp, ipp_developer, wind}. Read all 9 personas. actor_party
-- functional (site_supervisor, quality_engineer, contractor, subcontractor,
-- reviewer, independent_engineer, project_manager, owner,
-- commissioning_engineer).

CREATE TABLE IF NOT EXISTS oe_punch_list (
  id                                  TEXT PRIMARY KEY,
  punch_number                        TEXT UNIQUE NOT NULL,

  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,

  project_id                          TEXT NOT NULL,
  project_name                        TEXT,
  facility_id                         TEXT,
  facility_name                       TEXT,
  contractor_id                       TEXT,
  contractor_name                     TEXT,
  owner_party_id                      TEXT,
  owner_party_name                    TEXT,

  workflow_class                      TEXT NOT NULL CHECK (workflow_class IN (
    'punch_safety_critical','punch_functional_performance','punch_cosmetic',
    'punch_documentation','punch_commissioning','punch_handover_blocker',
    'punch_warranty_carryover','snag_post_handover'
  )),
  priority_class                      TEXT NOT NULL CHECK (priority_class IN (
    'critical','high','standard','low'
  )),

  identified_location                 TEXT,
  identified_zone                     TEXT,
  identified_drawing_ref              TEXT,
  identified_specification_ref        TEXT,
  identified_at                       TEXT,

  blocks_commercial_operation         INTEGER NOT NULL DEFAULT 0,
  blocks_handover                     INTEGER NOT NULL DEFAULT 0,
  life_safety_critical                INTEGER NOT NULL DEFAULT 0,
  warranty_critical                   INTEGER NOT NULL DEFAULT 0,

  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'critical','high','standard','low'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'site_supervisor','quality_engineer','project_manager','project_director'
  )),

  rejection_count                     INTEGER NOT NULL DEFAULT 0,
  reinspection_count                  INTEGER NOT NULL DEFAULT 0,
  photo_evidence_count                INTEGER NOT NULL DEFAULT 0,
  root_cause_documented               INTEGER NOT NULL DEFAULT 0,
  commissioning_evidence              INTEGER NOT NULL DEFAULT 0,

  remediation_cost_zar                REAL,
  recovered_from_contractor_zar       REAL,

  parent_punch_id                     TEXT,
  cod_blocker_ref                     TEXT,
  handover_blocker_ref                TEXT,
  warranty_ref                        TEXT,
  regulator_ref                       TEXT,

  title                               TEXT,
  narrative                           TEXT,
  response_text                       TEXT,
  voided_reason                       TEXT,
  withdrawn_reason                    TEXT,
  reason_code                         TEXT,

  current_ball_in_court_party         TEXT,
  last_responder_party                TEXT,
  requester_party                     TEXT,
  approver_party                      TEXT,

  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'identified','assessed','assigned','in_remediation','reinspect_requested',
    'reinspected','accepted','closed','on_hold','voided','withdrawn'
  )),
  assessed_at                         TEXT,
  assigned_at                         TEXT,
  in_remediation_at                   TEXT,
  reinspect_requested_at              TEXT,
  reinspected_at                      TEXT,
  accepted_at                         TEXT,
  closed_at                           TEXT,
  on_hold_at                          TEXT,
  voided_at                           TEXT,
  withdrawn_at                        TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  regulator_crossed_at                TEXT,
  regulator_inbox_ref                 TEXT,
  sla_deadline_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_punch_status     ON oe_punch_list(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_punch_tier       ON oe_punch_list(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_punch_project    ON oe_punch_list(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_punch_facility   ON oe_punch_list(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_punch_class      ON oe_punch_list(workflow_class);
CREATE INDEX IF NOT EXISTS idx_oe_punch_priority   ON oe_punch_list(priority_class);
CREATE INDEX IF NOT EXISTS idx_oe_punch_ident      ON oe_punch_list(identified_at);
CREATE INDEX IF NOT EXISTS idx_oe_punch_sla        ON oe_punch_list(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_punch_ball       ON oe_punch_list(current_ball_in_court_party);
CREATE INDEX IF NOT EXISTS idx_oe_punch_cod        ON oe_punch_list(blocks_commercial_operation);
CREATE INDEX IF NOT EXISTS idx_oe_punch_life       ON oe_punch_list(life_safety_critical);

CREATE TABLE IF NOT EXISTS oe_punch_list_events (
  id                  TEXT PRIMARY KEY,
  punch_id            TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_punch_events_p    ON oe_punch_list_events(punch_id);
CREATE INDEX IF NOT EXISTS idx_oe_punch_events_type ON oe_punch_list_events(event_type);
