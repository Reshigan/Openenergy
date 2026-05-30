-- Wave 99 — IPP Quality / Inspection & Test Plan (ITP) chain (P6). The
-- forward-looking quality register a best-in-class IPP-PM stack drives at
-- every construction stage. Beats Procore Quality + Aconex ITR + Bentley
-- AssetWise + e-Builder ITR + Autodesk Construction Cloud Quality + Bluebeam
-- Studio Quality by chaining hold-points + safety-critical tests + COD-
-- blocker flags into a regulator inbox with floor-at-high tier override and
-- a 0-130 quality index with witness, photo and first-time-pass bonuses.
--
-- 12-state P6 lifecycle:
--   itp_drafted -> submit -> submitted
--     -> open_review -> under_review
--       -> approve -> approved -> release -> released_to_site
--         -> schedule_inspection -> inspection_scheduled
--           -> begin_inspection -> in_inspection
--             -> attend_witness -> witness_attended
--               -> record_result -> result_recorded
--                 -> pass        -> passed -> release_for_use ->
--                                  released_for_use -> archive -> archived
--                 -> fail        -> failed -> raise_corrective_action ->
--                                  corrective_action -> re_inspect ->
--                                  in_inspection (rejoin)
--   reject       -> rejected   (terminal)
--   withdraw     -> withdrawn  (terminal)
--   void         -> voided     (terminal)
--
-- Tier — RE-DERIVED from priority_class × workflow_class with FLOOR-AT-HIGH
-- for any of the 4 coverage flags (blocks_handover_milestone,
-- blocks_commercial_operation, safety_critical_test, regulator_hold_point).
--
-- URGENT SLA polarity (safety / COD blocker = tightest — ITPs gate handover).
--
-- SIGNATURE (W99 — NERSA §C-5 + REIPPPP + OHSA s24 + IEC 61508):
--   submit                 -> regulator EVERY tier when safety_critical_test
--   approve                -> regulator EVERY tier when blocks_commercial_operation
--   record_result (failed) -> regulator EVERY tier when safety_critical_test
--                             OR blocks_commercial_operation
--   void                   -> regulator EVERY tier when blocks_commercial_operation
--                             OR safety_critical_test
--   sla_breached           -> regulator EVERY tier when safety_critical_test;
--                             high+critical when blocks_commercial_operation
--
-- Write {admin, ipp, ipp_developer, wind}. Read all 9 personas. actor_party
-- functional (site_supervisor, quality_engineer, contractor,
-- independent_engineer, witness, owner, commissioning_engineer,
-- project_manager).

CREATE TABLE IF NOT EXISTS oe_itp_inspection (
  id                                  TEXT PRIMARY KEY,
  itp_number                          TEXT UNIQUE NOT NULL,

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
    'itp_civil_foundation','itp_mechanical_assembly','itp_electrical_lv',
    'itp_electrical_mv_hv','itp_instrumentation_scada','itp_pressure_vessel',
    'itp_protection_relay','itp_grid_synchronisation','itp_commissioning_test',
    'itp_handover_doc_pack'
  )),
  priority_class                      TEXT NOT NULL CHECK (priority_class IN (
    'critical','high','standard','low'
  )),

  construction_stage                  TEXT,
  hold_point_ref                      TEXT,
  drawing_ref                         TEXT,
  specification_ref                   TEXT,
  acceptance_criteria                 TEXT,
  identified_at                       TEXT,

  blocks_handover_milestone           INTEGER NOT NULL DEFAULT 0,
  blocks_commercial_operation         INTEGER NOT NULL DEFAULT 0,
  safety_critical_test                INTEGER NOT NULL DEFAULT 0,
  regulator_hold_point                INTEGER NOT NULL DEFAULT 0,

  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'critical','high','standard','low'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'site_supervisor','quality_engineer','project_manager','project_director'
  )),

  reinspection_count                  INTEGER NOT NULL DEFAULT 0,
  photo_evidence_count                INTEGER NOT NULL DEFAULT 0,
  witness_attended                    INTEGER NOT NULL DEFAULT 0,
  first_time_pass                     INTEGER NOT NULL DEFAULT 0,
  root_cause_documented               INTEGER NOT NULL DEFAULT 0,

  inspection_cost_zar                 REAL,
  rework_cost_zar                     REAL,

  parent_itp_id                       TEXT,
  cod_blocker_ref                     TEXT,
  handover_blocker_ref                TEXT,
  regulator_ref                       TEXT,

  title                               TEXT,
  narrative                           TEXT,
  result_text                         TEXT,
  rejected_reason                     TEXT,
  voided_reason                       TEXT,
  withdrawn_reason                    TEXT,
  reason_code                         TEXT,

  current_ball_in_court_party         TEXT,
  last_responder_party                TEXT,
  requester_party                     TEXT,
  approver_party                      TEXT,
  witness_party                       TEXT,

  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'itp_drafted','submitted','under_review','approved','released_to_site',
    'inspection_scheduled','in_inspection','witness_attended','result_recorded',
    'passed','failed','corrective_action','released_for_use','archived',
    'rejected','withdrawn','voided'
  )),
  submitted_at                        TEXT,
  under_review_at                     TEXT,
  approved_at                         TEXT,
  released_to_site_at                 TEXT,
  inspection_scheduled_at             TEXT,
  in_inspection_at                    TEXT,
  witness_attended_at                 TEXT,
  result_recorded_at                  TEXT,
  passed_at                           TEXT,
  failed_at                           TEXT,
  corrective_action_at                TEXT,
  released_for_use_at                 TEXT,
  archived_at                         TEXT,
  rejected_at                         TEXT,
  withdrawn_at                        TEXT,
  voided_at                           TEXT,

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

CREATE INDEX IF NOT EXISTS idx_oe_itp_status     ON oe_itp_inspection(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_itp_tier       ON oe_itp_inspection(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_itp_project    ON oe_itp_inspection(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_itp_facility   ON oe_itp_inspection(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_itp_class      ON oe_itp_inspection(workflow_class);
CREATE INDEX IF NOT EXISTS idx_oe_itp_priority   ON oe_itp_inspection(priority_class);
CREATE INDEX IF NOT EXISTS idx_oe_itp_ident      ON oe_itp_inspection(identified_at);
CREATE INDEX IF NOT EXISTS idx_oe_itp_sla        ON oe_itp_inspection(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_itp_ball       ON oe_itp_inspection(current_ball_in_court_party);
CREATE INDEX IF NOT EXISTS idx_oe_itp_cod        ON oe_itp_inspection(blocks_commercial_operation);
CREATE INDEX IF NOT EXISTS idx_oe_itp_safety     ON oe_itp_inspection(safety_critical_test);
CREATE INDEX IF NOT EXISTS idx_oe_itp_hold       ON oe_itp_inspection(regulator_hold_point);

CREATE TABLE IF NOT EXISTS oe_itp_inspection_events (
  id                  TEXT PRIMARY KEY,
  itp_id              TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_itp_events_p    ON oe_itp_inspection_events(itp_id);
CREATE INDEX IF NOT EXISTS idx_oe_itp_events_type ON oe_itp_inspection_events(event_type);
