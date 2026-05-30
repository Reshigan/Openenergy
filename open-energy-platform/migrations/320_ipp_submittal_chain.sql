-- Wave 115 - IPP Submittal / Transmittal Lifecycle chain.
-- 10th IPP chain. FOURTH Phase-A IPP wave (sibling of W112 schedule,
-- W113 EVM, W114 document control). W112 owns the SCHEDULE; W113 owns
-- the COST BOOK; W114 owns the DRAWING REGISTER; W115 owns the
-- SUBMITTAL / TRANSMITTAL workflow - the rolling contractor -> engineer
-- -> owner_rep delivery loop where every package can cycle through
-- CSI 01 33 00 stamps A/B/C/D/E.
--
-- Beats Procore Submittals / Aconex Workflows / Newforma Transmittals /
-- Autodesk Construction Cloud Submittals / e-Builder Submittals / Asite
-- Workflows / Conject Submittals / Oracle CCS Submittals / Coreworx EDMS
-- / SmartUse Submittals. Each surfaces submittals as a list with a stamp
-- + ball-in-court; W115 turns it into a 12-state P6 submittal chain with
-- URGENT SLA polarity (HOURS), FLOOR-AT-CRITICAL-SAFETY on 5 contextual
-- flags (long_lead_item, commissioning_critical,
-- regulatory_witness_required, lender_information_covenant,
-- dispute_history), 3-step authority ladder (contractor_PM -> engineer
-- -> owner_rep), 20-field LIVE submittal battery, and the SIGNATURE
-- STAMP-E-REJECT-CRITICAL EVERY-tier hard line.
--
-- Standards: ISO 19650-2 sec.5.7 (information delivery workflows) + CSI
-- 01 33 00 (Submittal Procedures - STAMPS A/B/C/D/E) + FIDIC Silver
-- Book sec.6 (engineer review) + NEC4 sec.54 (contractor information) +
-- REIPPPP Schedule 4 (submittal protocol) + DMRE EPC submittal
-- requirements.
--
-- 12-state forward path + 3 branch states:
--   contractor_drafted -> package_assembled -> submitted -> screening
--     -> assigned_to_reviewer -> under_review -> coordination_review
--     -> response_drafted -> stamped_returned -> resubmission_requested
--     (loops back via assemble_package) OR close_out -> closed_out
--     -> archive -> archived (HARD terminal)
--   any non-terminal -> reject -> rejected (TERMINAL - stamp E)
--   pre-assignment   -> void   -> void     (TERMINAL - issuer pull)
--   review-touch states -> escalate -> escalated (SOFT) -> close_out
--
-- Tier RE-DERIVED on every transition from submittal_class with
-- FLOOR-AT-CRITICAL-SAFETY on 5 contextual flags:
--   om_manual / material_approval / shop_drawing / critical_safety
-- Higher submittal-criticality = TIGHTEST window.
--
-- URGENT SLA polarity (HOURS) anchored on submitted:
--   critical_safety 24h / shop_drawing 168h / material_approval 240h /
--   om_manual 480h.
--
-- SIGNATURE Phase-A IPP regulator crossings:
--   stamp_return -> EVERY tier when stamp_code='E' AND
--                   (critical_safety || commissioning_critical)
--                   (W115 SIGNATURE STAMP-E-REJECT-CRITICAL hard line)
--   reject       -> EVERY tier when long_lead_item AND cycle_count>=3
--   escalate     -> critical_safety + material_approval only when
--                   regulatory_witness_required
--   close_out    -> no regulator
--   sla_breached -> critical_safety + shop_drawing only
--
-- Write {admin, ipp_developer}. Read all 9 personas. 4-party split:
--   contractor_PM : draft_package, assemble_package, submit, void
--   doc_controller: screen, assign_reviewer
--   engineer      : commence_review, coordinate_review, draft_response,
--                   stamp_return, request_resubmission,
--                   approve_with_comments
--   owner_rep     : close_out, archive, reject, escalate

CREATE TABLE IF NOT EXISTS oe_ipp_submittal (
  id                                          TEXT PRIMARY KEY,
  submittal_number                            TEXT UNIQUE NOT NULL,

  -- Project linkage
  project_id                                  TEXT NOT NULL,
  project_name                                TEXT,
  project_capacity_mw                         REAL NOT NULL DEFAULT 0,
  project_type                                TEXT,

  -- Cross-chain bridges (W114 doc-control + W112 schedule + W113 EVM +
  -- W19 procurement + W23 insurance + W20 COD)
  document_control_ref                        TEXT,
  schedule_ref                                TEXT,
  evm_ref                                     TEXT,
  procurement_ref                             TEXT,
  insurance_ref                               TEXT,
  cod_ref                                     TEXT,

  -- Submittal identity (CSI 01 33 00)
  submittal_class                             TEXT,
  submittal_type                              TEXT,
  discipline                                  TEXT,
  package_code                                TEXT,
  drawing_number                              TEXT,
  drawing_title                               TEXT,
  csi_section                                 TEXT,
  contractor_name                             TEXT,
  supplier_name                               TEXT,

  -- Stamp + cycle ledger (CSI 01 33 00 A/B/C/D/E)
  stamp_code                                  TEXT CHECK (stamp_code IS NULL OR stamp_code IN ('A','B','C','D','E')),
  cycle_count                                 INTEGER NOT NULL DEFAULT 0,
  last_transmittal_number                     TEXT,
  last_transmittal_at                         TEXT,
  contractor_pm_name                          TEXT,
  doc_controller_name                         TEXT,
  reviewer_name                               TEXT,
  reviewer_party                              TEXT,
  owner_rep_name                              TEXT,

  -- 5 floor flags
  long_lead_item                              INTEGER NOT NULL DEFAULT 0,
  commissioning_critical                      INTEGER NOT NULL DEFAULT 0,
  regulatory_witness_required                 INTEGER NOT NULL DEFAULT 0,
  lender_information_covenant                 INTEGER NOT NULL DEFAULT 0,
  dispute_history                             INTEGER NOT NULL DEFAULT 0,

  -- Long-lead deadline (drives urgency)
  long_lead_deadline_at                       TEXT,

  -- Tier + authority + completeness battery
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'om_manual','material_approval','shop_drawing','critical_safety'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'contractor_PM','engineer','owner_rep'
  )),
  urgency_band                                TEXT,
  submittal_health_band                       TEXT,
  submittal_completeness_index                INTEGER NOT NULL DEFAULT 0,
  regulatory_witness_window_hours             INTEGER NOT NULL DEFAULT 0,
  coordination_disciplines                    TEXT,
  comments_open                               INTEGER NOT NULL DEFAULT 0,

  -- Narrative
  title                                       TEXT,
  narrative                                   TEXT,
  reason_code                                 TEXT,
  reject_reason                               TEXT,
  void_reason                                 TEXT,
  escalation_reason                           TEXT,
  comments_summary                            TEXT,

  current_ball_in_court_party                 TEXT,
  last_responder_party                        TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- 12 lifecycle + 3 branch status timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'contractor_drafted','package_assembled','submitted','screening',
    'assigned_to_reviewer','under_review','coordination_review',
    'response_drafted','stamped_returned','resubmission_requested',
    'closed_out','archived','rejected','void','escalated'
  )),
  contractor_drafted_at                       TEXT,
  package_assembled_at                        TEXT,
  submitted_at                                TEXT,
  screening_at                                TEXT,
  assigned_to_reviewer_at                     TEXT,
  under_review_at                             TEXT,
  coordination_review_at                      TEXT,
  response_drafted_at                         TEXT,
  stamped_returned_at                         TEXT,
  resubmission_requested_at                   TEXT,
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

CREATE INDEX IF NOT EXISTS idx_oe_ips_status      ON oe_ipp_submittal(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ips_tier        ON oe_ipp_submittal(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ips_tenant      ON oe_ipp_submittal(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_ips_project     ON oe_ipp_submittal(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ips_sla         ON oe_ipp_submittal(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_ips_breached    ON oe_ipp_submittal(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ips_reportable  ON oe_ipp_submittal(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ips_health      ON oe_ipp_submittal(submittal_health_band);
CREATE INDEX IF NOT EXISTS idx_oe_ips_stamp       ON oe_ipp_submittal(stamp_code);
CREATE INDEX IF NOT EXISTS idx_oe_ips_doc_ref     ON oe_ipp_submittal(document_control_ref);

CREATE TABLE IF NOT EXISTS oe_ipp_submittal_events (
  id                  TEXT PRIMARY KEY,
  submittal_id        TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  stamp_code          TEXT,
  cycle_count         INTEGER,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ips_events_sid  ON oe_ipp_submittal_events(submittal_id);
CREATE INDEX IF NOT EXISTS idx_oe_ips_events_type ON oe_ipp_submittal_events(event_type);
