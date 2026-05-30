-- Wave 100 — IPP Mechanical / Electrical Handover Dossier + Turnover-to-
-- Operations chain (P6). The construction-to-O&M turnover package a best-in-
-- class IPP-PM stack ships at practical completion. Beats Procore Handover +
-- Aconex Handover + BIM 360 Handover + Bentley ProjectWise/AssetWise + e-
-- Builder Closeout + ServiceNow Handover + SAP S/4HANA Asset Handover + IBM
-- Maximo Asset Handover by chaining witnessed acceptance + as-built + spare-
-- parts + training + warranty activation + ownership-of-operations into a
-- regulator inbox with floor-at-high tier override and a 0-130 handover
-- completeness index gated on the four package-clear sub-indices.
--
-- 12-state P6 lifecycle:
--   dossier_compiled -> submit -> submitted
--     -> open_review -> under_review
--       -> require_revision -> revision_required (loop)
--          -> revise_and_resubmit -> submitted (rejoin)
--       -> approve -> approved
--         -> schedule_witnessed_acceptance ->
--            witnessed_acceptance_scheduled
--           -> complete_witnessed_acceptance -> witnessed_acceptance
--             -> remediate_punch -> punch_remediated
--               -> transfer_training -> training_transferred
--                 -> activate_warranty -> warranty_activated
--                   -> transfer_to_operations -> operations_owned
--                     -> archive -> archived
--   reject       -> rejected   (terminal — submitted / under_review only)
--   withdraw     -> withdrawn  (terminal — dossier / submitted only)
--   void         -> voided     (terminal — any non-terminal)
--
-- Tier — RE-DERIVED from priority_class × workflow_class with FLOOR-AT-HIGH
-- for any of the 4 coverage flags (blocks_warranty_start,
-- blocks_om_handover, incomplete_as_built, untransferred_spares).
--
-- URGENT SLA polarity (warranty-clock-running = tightest — warranty cost meter
-- is live and a single day of slippage materially erodes OEM coverage).
--
-- SIGNATURE (W100 — REIPPPP O&M handover + NERSA §C-5 + OHSA s24):
--   approve              -> regulator EVERY tier when blocks_warranty_start
--   transfer_to_operations -> regulator EVERY tier when blocks_warranty_start
--                             OR blocks_om_handover
--   void                 -> regulator EVERY tier when incomplete_as_built
--                             OR untransferred_spares
--   sla_breached         -> regulator EVERY tier when blocks_warranty_start;
--                             high+critical when blocks_om_handover
--
-- Write {admin, ipp, ipp_developer, wind, support}. Read all 9 personas.
-- actor_party functional (commissioning_engineer, operations_manager,
-- contractor, independent_engineer, owner, warranty_administrator,
-- handover_coordinator, training_lead).

CREATE TABLE IF NOT EXISTS oe_handover_dossier (
  id                                  TEXT PRIMARY KEY,
  dossier_number                      TEXT UNIQUE NOT NULL,

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
  independent_engineer_party_id       TEXT,
  independent_engineer_party_name     TEXT,

  workflow_class                      TEXT NOT NULL CHECK (workflow_class IN (
    'mechanical_drivetrain','electrical_balance_of_plant','inverter_skid',
    'transformer_bay','battery_storage_skid','scada_dms_integration',
    'civil_structural','protection_relay_package','spare_parts_kit',
    'training_documentation_pack'
  )),
  priority_class                      TEXT NOT NULL CHECK (priority_class IN (
    'critical','high','standard','low'
  )),

  dossier_scope                       TEXT,
  drawing_register_ref                TEXT,
  spec_register_ref                   TEXT,
  acceptance_criteria                 TEXT,
  compiled_at                         TEXT,

  blocks_warranty_start               INTEGER NOT NULL DEFAULT 0,
  blocks_om_handover                  INTEGER NOT NULL DEFAULT 0,
  incomplete_as_built                 INTEGER NOT NULL DEFAULT 0,
  untransferred_spares                INTEGER NOT NULL DEFAULT 0,

  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'critical','high','standard','low'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'project_engineer','commissioning_engineer','operations_manager','handover_director'
  )),

  revision_count                      INTEGER NOT NULL DEFAULT 0,
  punch_count_open                    INTEGER NOT NULL DEFAULT 0,
  as_built_completeness_pct           REAL NOT NULL DEFAULT 0,
  spare_parts_completeness_pct        REAL NOT NULL DEFAULT 0,
  training_completion_pct             REAL NOT NULL DEFAULT 0,
  witnessed_acceptance_clear          INTEGER NOT NULL DEFAULT 0,
  warranty_activated                  INTEGER NOT NULL DEFAULT 0,
  warranty_start_date                 TEXT,
  warranty_end_date                   TEXT,
  warranty_admin_party_id             TEXT,
  warranty_admin_party_name           TEXT,

  dossier_cost_zar                    REAL,
  handover_cost_zar                   REAL,

  parent_dossier_id                   TEXT,
  om_handover_blocker_ref             TEXT,
  warranty_blocker_ref                TEXT,
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
    'dossier_compiled','submitted','under_review','revision_required',
    'approved','witnessed_acceptance_scheduled','witnessed_acceptance',
    'punch_remediated','training_transferred','warranty_activated',
    'operations_owned','archived',
    'rejected','withdrawn','voided'
  )),
  submitted_at                        TEXT,
  under_review_at                     TEXT,
  revision_required_at                TEXT,
  approved_at                         TEXT,
  witnessed_acceptance_scheduled_at   TEXT,
  witnessed_acceptance_at             TEXT,
  punch_remediated_at                 TEXT,
  training_transferred_at             TEXT,
  warranty_activated_at               TEXT,
  operations_owned_at                 TEXT,
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

CREATE INDEX IF NOT EXISTS idx_oe_hndvr_status     ON oe_handover_dossier(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_tier       ON oe_handover_dossier(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_project    ON oe_handover_dossier(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_facility   ON oe_handover_dossier(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_class      ON oe_handover_dossier(workflow_class);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_priority   ON oe_handover_dossier(priority_class);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_compiled   ON oe_handover_dossier(compiled_at);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_sla        ON oe_handover_dossier(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_ball       ON oe_handover_dossier(current_ball_in_court_party);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_warranty   ON oe_handover_dossier(blocks_warranty_start);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_om         ON oe_handover_dossier(blocks_om_handover);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_asbuilt    ON oe_handover_dossier(incomplete_as_built);

CREATE TABLE IF NOT EXISTS oe_handover_dossier_events (
  id                  TEXT PRIMARY KEY,
  dossier_id          TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_hndvr_events_p    ON oe_handover_dossier_events(dossier_id);
CREATE INDEX IF NOT EXISTS idx_oe_hndvr_events_type ON oe_handover_dossier_events(event_type);
