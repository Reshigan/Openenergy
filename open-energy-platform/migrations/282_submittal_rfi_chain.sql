-- Wave 96 — IPP Submittal Log & RFI Register (P6). The construction-document
-- review pipeline for a best-in-class IPP-PM stack. Beats Procore (submittal
-- log + ball-in-court), Aconex (document control), Newforma + Asite + Kahua
-- + e-Builder (spec coverage + tier-derived SLA + regulator-inbox crossings).
--
-- 13-state P6 lifecycle:
--   drafted -> submit -> submitted -> distribute -> distributed
--     -> start_review -> under_review
--       -> request_clarification -> clarification_requested
--         -> provide_clarification -> under_review (rejoin)
--       -> respond -> responded
--         -> approve -> approved
--           -> distribute_for_construction -> distributed_for_construction
--             -> incorporate -> incorporated
--               -> close -> closed_clean             (terminal)
--         -> return_for_revision -> returned_for_revision
--           -> resubmit -> revised -> distribute -> distributed (rejoin)
--   void      -> voided                              (terminal)
--   withdraw  -> withdrawn                           (terminal)
--
-- Tier — RE-DERIVED from priority_class × workflow_class with FLOOR-AT-HIGH
-- for affects_grid_code | affects_life_safety | affects_bid_envelope |
-- holds_construction.
--
-- URGENT SLA polarity (tighter at higher tier — construction is time-money).
--
-- Reportability (W96 SIGNATURE — NERSA Grid Code C-1/C-3 + REIPPPP bid-env):
--   approve              -> regulator EVERY tier when affects_grid_code OR
--                                                     affects_bid_envelope
--   void                 -> regulator EVERY tier when affects_grid_code OR
--                                                     affects_life_safety
--   distribute_for_construction -> regulator high+critical when grid_code
--   return_for_revision  -> regulator high+critical when grid_code
--   sla_breached         -> regulator high+critical when grid_code OR
--                                                     holds_construction
--
-- Write {admin, ipp_developer, wind}. Read all 9 personas. actor_party
-- functional (author, coordinator, reviewer, designer, owner,
-- independent_engineer, contractor).

CREATE TABLE IF NOT EXISTS oe_submittal_rfi (
  id                                  TEXT PRIMARY KEY,
  submittal_rfi_number                TEXT UNIQUE NOT NULL,

  -- Provenance — upstream chain that triggered the case
  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,

  -- Project / facility / parties
  project_id                          TEXT NOT NULL,
  project_name                        TEXT,
  facility_id                         TEXT,
  facility_name                       TEXT,
  contractor_id                       TEXT,
  contractor_name                     TEXT,
  designer_id                         TEXT,
  designer_name                       TEXT,
  vendor_id                           TEXT,
  vendor_name                         TEXT,
  owner_party_id                      TEXT,
  owner_party_name                    TEXT,

  -- Classification
  workflow_class                      TEXT NOT NULL CHECK (workflow_class IN (
    'submittal_design','submittal_product_data','submittal_mockup',
    'submittal_om_manuals','rfi_design_clarification','rfi_field_condition',
    'rfi_substitution_request','rfi_change_in_scope'
  )),
  priority_class                      TEXT NOT NULL CHECK (priority_class IN (
    'critical','high','standard','low'
  )),
  document_type                       TEXT,
  spec_section                        TEXT,
  csi_division                        TEXT,
  csi_section_code                    TEXT,
  uniclass_code                       TEXT,
  sans_section                        TEXT,
  transmittal_number                  TEXT,
  sequence_number                     INTEGER,

  -- Tier + authority (RE-DERIVED on every transition)
  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'critical','high','standard','low'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'construction_coordinator','lead_engineer','project_manager',
    'project_director'
  )),

  -- Coverage gates (drive tier floor + regulator crossings)
  affects_grid_code                   INTEGER NOT NULL DEFAULT 0,
  affects_life_safety                 INTEGER NOT NULL DEFAULT 0,
  affects_bid_envelope                INTEGER NOT NULL DEFAULT 0,
  holds_construction                  INTEGER NOT NULL DEFAULT 0,
  requires_designer_response          INTEGER NOT NULL DEFAULT 0,
  requires_ie_review                  INTEGER NOT NULL DEFAULT 0,
  requires_owner_review               INTEGER NOT NULL DEFAULT 0,

  -- Counts (live-wired against history)
  clarification_count                 INTEGER NOT NULL DEFAULT 0,
  revision_count                      INTEGER NOT NULL DEFAULT 0,
  rejection_count                     INTEGER NOT NULL DEFAULT 0,
  response_count                      INTEGER NOT NULL DEFAULT 0,

  -- Quantities (used in regulator crossing decisions + live battery)
  bid_envelope_drift_pct              REAL,
  grid_code_clauses_affected          INTEGER NOT NULL DEFAULT 0,
  estimated_cost_impact_zar           REAL,
  estimated_schedule_impact_days      INTEGER,

  -- Supersession / parent links
  parent_submittal_id                 TEXT,
  superseded_by_id                    TEXT,
  parent_rfi_id                       TEXT,

  -- Refs
  drawing_ref                         TEXT,
  attachments_json                    TEXT,
  spec_coverage_notes                 TEXT,
  regulator_ref                       TEXT,
  gca_ref                             TEXT,
  cod_ref                             TEXT,

  -- Narrative
  title                               TEXT,
  narrative                           TEXT,
  response_text                       TEXT,
  voided_reason                       TEXT,
  withdrawn_reason                    TEXT,
  reason_code                         TEXT,

  -- Party (current ball-in-court + history)
  current_ball_in_court_party         TEXT,
  last_responder_party                TEXT,
  requester_party                     TEXT,
  approver_party                      TEXT,

  -- State + lifecycle (13 statuses, listed; voided/withdrawn are exception
  -- terminals)
  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'drafted','submitted','distributed','under_review',
    'clarification_requested','responded','approved',
    'returned_for_revision','revised','distributed_for_construction',
    'incorporated','closed_clean','voided','withdrawn'
  )),
  drafted_at                          TEXT NOT NULL,
  submitted_at                        TEXT,
  distributed_at                      TEXT,
  under_review_at                     TEXT,
  clarification_requested_at          TEXT,
  responded_at                        TEXT,
  approved_at                         TEXT,
  returned_for_revision_at            TEXT,
  revised_at                          TEXT,
  distributed_for_construction_at     TEXT,
  incorporated_at                     TEXT,
  closed_clean_at                     TEXT,
  voided_at                           TEXT,
  withdrawn_at                        TEXT,
  construction_hold_started_at        TEXT,

  -- Reportability + SLA
  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  regulator_crossed_at                TEXT,
  regulator_inbox_ref                 TEXT,
  sla_deadline_at                     TEXT,
  response_due_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_submittal_status     ON oe_submittal_rfi(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_tier       ON oe_submittal_rfi(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_project    ON oe_submittal_rfi(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_facility   ON oe_submittal_rfi(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_class      ON oe_submittal_rfi(workflow_class);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_priority   ON oe_submittal_rfi(priority_class);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_section    ON oe_submittal_rfi(csi_section_code);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_parent     ON oe_submittal_rfi(parent_submittal_id);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_drafted    ON oe_submittal_rfi(drafted_at);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_sla        ON oe_submittal_rfi(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_resp_due   ON oe_submittal_rfi(response_due_at);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_ball       ON oe_submittal_rfi(current_ball_in_court_party);

CREATE TABLE IF NOT EXISTS oe_submittal_rfi_events (
  id                  TEXT PRIMARY KEY,
  submittal_rfi_id    TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_submittal_events_c    ON oe_submittal_rfi_events(submittal_rfi_id);
CREATE INDEX IF NOT EXISTS idx_oe_submittal_events_type ON oe_submittal_rfi_events(event_type);
