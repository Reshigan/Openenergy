-- Wave 116 - IPP RFI (Request For Information) Management chain.
-- 11th IPP-pure chain. FIFTH Phase-A IPP wave (sibling of W112 schedule,
-- W113 EVM, W114 document control, W115 submittals). W112 owns the
-- SCHEDULE; W113 owns the COST BOOK; W114 owns the DRAWING REGISTER;
-- W115 owns the SUBMITTAL workflow; W116 owns the RFI LIFECYCLE - the
-- rolling contractor -> engineer -> owner_rep question/answer loop where
-- every information request can escalate through AIA G716 / FIDIC sec.1.3
-- notice channels and feed W117 change orders downstream.
--
-- Beats Procore RFIs / Aconex RFIs / Newforma RFIs / Autodesk
-- Construction Cloud RFIs / e-Builder RFIs / Asite RFIs / SmartUse RFIs
-- / Bluebeam Studio / Fieldwire RFIs / Bentley AssetWise RFIs. Each
-- surfaces RFIs as a list with a status + ball-in-court; W116 turns it
-- into a 12-state P6 RFI chain with URGENT SLA polarity (HOURS),
-- FLOOR-AT-EMERGENCY-SAFETY on 5 contextual flags
-- (safety_hazard_identified / construction_stoppage_in_effect /
-- contractor_claim_basis / dispute_basis_referenced /
-- regulatory_inquiry_triggered), 3-step authority ladder (contractor_PM
-- -> engineer -> owner_rep), 20-field LIVE RFI battery, and the
-- SIGNATURE SAFETY-RFI-ESCALATE EVERY-tier hard line.
--
-- Standards: CSI 01 31 19 (Project Meetings + RFI flow) + ISO 19650-2
-- sec.5.7 (information delivery) + FIDIC Silver sec.1.3 (notices) + AIA
-- G716 (RFI standard form) + NEC4 sec.61 (compensation events from
-- instructions) + REIPPPP technical-coordination protocol.
--
-- 12-state forward path + 3 branch states:
--   question_drafted -> submitted -> triage -> assigned_to_responder
--     -> research_in_progress -> response_drafted -> cross_discipline_review
--     -> answer_returned -> clarification_requested -> closed_out
--     -> archive -> archived (HARD terminal)
--   any non-terminal -> reject -> rejected (TERMINAL - invalid scope)
--   pre-triage       -> void   -> void     (TERMINAL - pulled before triage)
--   review-touch states -> escalate -> escalated (SOFT) -> close_out
--
-- Tier RE-DERIVED on every transition from rfi_class with
-- FLOOR-AT-EMERGENCY-SAFETY on 5 contextual flags:
--   clarification / coordination / construction_blocking / emergency_safety
-- Higher RFI-criticality = TIGHTEST window.
--
-- URGENT SLA polarity (HOURS) anchored on submitted:
--   emergency_safety 4h / construction_blocking 24h /
--   coordination 72h / clarification 168h.
--
-- SIGNATURE Phase-A IPP regulator crossings:
--   escalate -> EVERY tier when safety_hazard_identified ||
--                regulatory_inquiry_triggered
--                (W116 SIGNATURE SAFETY-RFI-ESCALATE hard line)
--   reject   -> EVERY tier when contractor_claim_basis AND
--                cost_impact_zar >= R10m
--   convert_to_change_order -> construction_blocking + emergency_safety
--                              only (W117 auto-link)
--   link_to_dispute -> EVERY tier when dispute_basis_referenced AND
--                       (claim || stoppage)
--   close_out -> no regulator
--   sla_breached -> emergency_safety + construction_blocking only
--
-- Write {admin, ipp_developer}. Read all 9 personas. 4-party split:
--   contractor_PM : draft_question, submit, void, link_to_dispute
--   doc_controller: triage, assign_responder
--   engineer      : commence_research, draft_response, coordinate_review,
--                   return_answer, request_clarification,
--                   convert_to_change_order
--   owner_rep     : close_out, archive, reject, escalate

CREATE TABLE IF NOT EXISTS oe_ipp_rfi (
  id                                          TEXT PRIMARY KEY,
  rfi_number                                  TEXT UNIQUE NOT NULL,

  -- Project linkage
  project_id                                  TEXT NOT NULL,
  project_name                                TEXT,
  project_capacity_mw                         REAL NOT NULL DEFAULT 0,
  project_type                                TEXT,

  -- Cross-chain bridges (W114 doc-control + W115 submittals + W112
  -- schedule + W113 EVM + W19 procurement + W20 COD)
  document_control_ref                        TEXT,
  submittal_ref                               TEXT,
  schedule_ref                                TEXT,
  evm_ref                                     TEXT,
  procurement_ref                             TEXT,
  cod_ref                                     TEXT,
  linked_change_order_ref                     TEXT,

  -- RFI identity (CSI 01 31 19 + AIA G716)
  rfi_class                                   TEXT,
  rfi_type                                    TEXT,
  discipline                                  TEXT,
  package_code                                TEXT,
  drawing_number                              TEXT,
  spec_section                                TEXT,
  csi_section                                 TEXT,
  contractor_name                             TEXT,
  question_short                              TEXT,
  question_long                               TEXT,
  proposed_answer                             TEXT,

  -- Parties + ball-in-court
  contractor_pm_name                          TEXT,
  doc_controller_name                         TEXT,
  responder_name                              TEXT,
  responder_party                             TEXT,
  owner_rep_name                              TEXT,
  current_ball_in_court_party                 TEXT,
  last_responder_party                        TEXT,

  -- 5 floor flags
  safety_hazard_identified                    INTEGER NOT NULL DEFAULT 0,
  construction_stoppage_in_effect             INTEGER NOT NULL DEFAULT 0,
  contractor_claim_basis                      INTEGER NOT NULL DEFAULT 0,
  dispute_basis_referenced                    INTEGER NOT NULL DEFAULT 0,
  regulatory_inquiry_triggered                INTEGER NOT NULL DEFAULT 0,

  -- Stoppage clock (drives days_construction_blocked)
  stoppage_started_at                         TEXT,

  -- Impact ledger
  cost_impact_zar                             REAL NOT NULL DEFAULT 0,
  schedule_impact_days                        INTEGER NOT NULL DEFAULT 0,

  -- Tier + authority + completeness battery
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'clarification','coordination','construction_blocking','emergency_safety'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'contractor_PM','engineer','owner_rep'
  )),
  urgency_band                                TEXT,
  rfi_health_band                             TEXT,
  rfi_completeness_index                      INTEGER NOT NULL DEFAULT 0,
  rfi_age_days                                INTEGER NOT NULL DEFAULT 0,
  escalation_count                            INTEGER NOT NULL DEFAULT 0,
  regulator_filing_window_hours               INTEGER NOT NULL DEFAULT 0,
  coordination_disciplines                    TEXT,
  comments_open                               INTEGER NOT NULL DEFAULT 0,

  -- Narrative + reason codes
  title                                       TEXT,
  reason_code                                 TEXT,
  reject_reason                               TEXT,
  void_reason                                 TEXT,
  escalation_reason                           TEXT,
  comments_summary                            TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- 12 lifecycle + 3 branch status timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'question_drafted','submitted','triage','assigned_to_responder',
    'research_in_progress','response_drafted','cross_discipline_review',
    'answer_returned','clarification_requested','closed_out','archived',
    'rejected','void','escalated'
  )),
  question_drafted_at                         TEXT,
  submitted_at                                TEXT,
  triage_at                                   TEXT,
  assigned_to_responder_at                    TEXT,
  research_in_progress_at                     TEXT,
  response_drafted_at                         TEXT,
  cross_discipline_review_at                  TEXT,
  answer_returned_at                          TEXT,
  clarification_requested_at                  TEXT,
  closed_out_at                               TEXT,
  archived_at                                 TEXT,
  rejected_at                                 TEXT,
  void_at                                     TEXT,
  escalated_at                                TEXT,
  resumed_at                                  TEXT,

  -- Regulator crossing
  regulator_crossed_at                        TEXT,
  regulator_inbox_ref                         TEXT,
  regulator_ref                               TEXT,

  -- SLA (HOURS, URGENT polarity)
  sla_target_hours                            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                             TEXT,
  last_sla_breach_at                          TEXT,
  sla_breached                                INTEGER NOT NULL DEFAULT 0,
  escalation_level                            INTEGER NOT NULL DEFAULT 0,

  -- Hash-chain pre-stage for W118 (inert today)
  hash_chain_position                         INTEGER NOT NULL DEFAULT 0,
  merkle_root_segment                         TEXT,

  tenant_id                                   TEXT,
  created_by                                  TEXT NOT NULL,
  created_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ipr_status      ON oe_ipp_rfi(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_tier        ON oe_ipp_rfi(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_tenant      ON oe_ipp_rfi(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_project     ON oe_ipp_rfi(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_sla         ON oe_ipp_rfi(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_breached    ON oe_ipp_rfi(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_reportable  ON oe_ipp_rfi(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_health      ON oe_ipp_rfi(rfi_health_band);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_class       ON oe_ipp_rfi(rfi_class);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_doc_ref     ON oe_ipp_rfi(document_control_ref);

CREATE TABLE IF NOT EXISTS oe_ipp_rfi_events (
  id                  TEXT PRIMARY KEY,
  rfi_id              TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ipr_events_rid  ON oe_ipp_rfi_events(rfi_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipr_events_type ON oe_ipp_rfi_events(event_type);
