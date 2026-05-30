-- Wave 114 - IPP Document Control & Drawing Register chain.
-- 9th IPP chain. THIRD Phase-A IPP wave (sibling of W112 WBS+Gantt and
-- W113 Cost+EVM). W112 owns the SCHEDULE; W113 owns the COST BOOK;
-- W114 owns the DRAWING REGISTER + DOCUMENT CONTROL discipline.
--
-- Beats Aconex / Procore Documents / Bluebeam Studio / Newforma / Asite
-- / Oracle Aconex / Bentley ProjectWise / Autodesk Construction Cloud
-- Docs / SharePoint AECOM / e-Builder. Each surfaces docs as a folder +
-- transmittal PDF; W114 turns it into a 12-state P6 doc-control chain
-- with URGENT SLA polarity in HOURS, FLOOR-AT-SAFETY-CRITICAL on 5
-- contextual flags (hv_electrical, commissioning_critical_path,
-- safety_signoff_required, ifc_blocking, regulatory_submittal), 3-step
-- authority ladder (doc_controller -> engineer_of_record -> IPP_CEO),
-- 20-field LIVE document-control battery (latest revision / IDC status
-- / revisions count / authority / completeness / hash chain pre-stage /
-- merkle root pre-stage / bridges to W112, W113, W19, W20, W18), and
-- the SIGNATURE DOCUMENT-REJECT-CRITICAL EVERY-tier hard line.
--
-- Standards: ISO 19650-1/2/3 (BIM/CDE) + AECOOEM ED2-2024 transmittal
-- protocol + REIPPPP Schedule 2 document hand-over + DMRE site-records
-- discipline + IEC 61355 (Classification & designation of documents for
-- power plants) + ENAA EPC doc-control + FIDIC Silver Book Section 6.
--
-- 12-state forward path + 3 branch states:
--   draft_uploaded -> index_metadata -> metadata_indexed
--     -> open_revision -> revision_open -> assign_IDC -> IDC_assigned
--     -> transmit -> transmitted -> start_review -> reviewed
--     -> comment -> commented -> revise -> revised -> approve -> approved
--     -> issue_for_construction -> issued_for_construction
--     -> finalise_as_built -> as_built_finalised -> archive -> archived
--     (HARD terminal)
--   any non-terminal -> reject   -> rejected (TERMINAL - superseded)
--   any non-terminal -> withdraw -> withdrawn (TERMINAL - issuer pull)
--   review-touch states -> hold -> hold (SOFT PAUSE) -> resume -> reviewed
--
-- Tier RE-DERIVED on every transition from document_class with FLOOR-AT-
-- SAFETY-CRITICAL on 5 contextual flags:
--   civil           : civil/geotech/drainage
--   mechanical      : BOP piping/valve schedule
--   electrical      : LV electrical/controls/instrumentation
--   safety_critical : HV electrical SLDs/protection coordination
--                       OR any flag triggers floor
--
-- URGENT SLA polarity (HOURS) anchored on transmitted:
--   safety_critical 24h / electrical 72h / mechanical 120h / civil 168h
-- Higher discipline-criticality gets TIGHTEST window - HV protection
-- delay propagates straight into commissioning.
--
-- SIGNATURE Phase-A IPP regulator crossings:
--   reject   -> EVERY tier when safety_critical OR ifc_blocking flag set
--                (W114 SIGNATURE DOCUMENT-REJECT-CRITICAL hard line)
--   withdraw -> EVERY tier when issued_for_construction state was reached
--                (post-IFC withdrawal = construction-record void)
--   approve  -> safety_critical only when hv_electrical OR
--                commissioning_critical_path
--   archive  -> no regulator
--   sla_breached -> safety_critical + electrical only
--
-- Write {admin, ipp_developer}. Read all 9 personas. actor_party split:
--   doc_controller       : upload_drawing, index_metadata, open_revision,
--                          assign_IDC, transmit, hold, resume, archive
--   engineer_of_record   : start_review, comment, revise, approve,
--                          issue_for_construction, finalise_as_built,
--                          reject
--   IPP_CEO              : withdraw

CREATE TABLE IF NOT EXISTS oe_ipp_document_control (
  id                                          TEXT PRIMARY KEY,
  document_number                             TEXT UNIQUE NOT NULL,

  -- Project linkage
  project_id                                  TEXT NOT NULL,
  project_name                                TEXT,
  project_capacity_mw                         REAL NOT NULL DEFAULT 0,
  project_type                                TEXT,

  -- Cross-chain bridges (W112 schedule + W113 EVM + W19 procurement +
  -- W20 COD + W18 planned outage)
  schedule_ref                                TEXT,
  evm_ref                                     TEXT,
  procurement_ref                             TEXT,
  cod_ref                                     TEXT,
  planned_outage_ref                          TEXT,

  -- Document identity (IEC 61355)
  document_class                              TEXT,
  document_type                               TEXT,
  discipline                                  TEXT,
  package_code                                TEXT,
  drawing_number                              TEXT,
  drawing_title                               TEXT,
  iec_61355_code                              TEXT,

  -- Revision ledger
  current_revision                            TEXT,
  revisions_count                             INTEGER NOT NULL DEFAULT 0,
  last_transmittal_number                     TEXT,
  last_transmittal_at                         TEXT,
  reviewer_name                               TEXT,
  reviewer_party                              TEXT,
  approver_name                               TEXT,
  approver_party                              TEXT,

  -- IDC matrix (live)
  idc_status                                  TEXT CHECK (idc_status IN (
    'open','review','approved','closed'
  )),
  idc_matrix_recomputed_at                    TEXT,

  -- 5 floor flags
  hv_electrical                               INTEGER NOT NULL DEFAULT 0,
  commissioning_critical_path                 INTEGER NOT NULL DEFAULT 0,
  safety_signoff_required                     INTEGER NOT NULL DEFAULT 0,
  ifc_blocking                                INTEGER NOT NULL DEFAULT 0,
  regulatory_submittal                        INTEGER NOT NULL DEFAULT 0,

  -- Reached-IFC marker (sticky once true; drives withdraw crossing)
  reached_ifc                                 INTEGER NOT NULL DEFAULT 0,

  -- Tier + authority + completeness battery
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'civil','mechanical','electrical','safety_critical'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'doc_controller','engineer_of_record','IPP_CEO'
  )),
  urgency_band                                TEXT,
  doc_health_band                             TEXT,
  document_completeness_index                 INTEGER NOT NULL DEFAULT 0,

  -- Narrative
  title                                       TEXT,
  narrative                                   TEXT,
  reason_code                                 TEXT,
  reject_reason                               TEXT,
  withdraw_reason                             TEXT,
  hold_reason                                 TEXT,
  comments_summary                            TEXT,

  current_ball_in_court_party                 TEXT,
  last_responder_party                        TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- 12 lifecycle + 3 branch status timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'draft_uploaded','metadata_indexed','revision_open','IDC_assigned',
    'transmitted','reviewed','commented','revised','approved',
    'issued_for_construction','as_built_finalised','archived',
    'rejected','withdrawn','hold'
  )),
  draft_uploaded_at                           TEXT,
  metadata_indexed_at                         TEXT,
  revision_open_at                            TEXT,
  idc_assigned_at                             TEXT,
  transmitted_at                              TEXT,
  reviewed_at                                 TEXT,
  commented_at                                TEXT,
  revised_at                                  TEXT,
  approved_at                                 TEXT,
  issued_for_construction_at                  TEXT,
  as_built_finalised_at                       TEXT,
  archived_at                                 TEXT,
  rejected_at                                 TEXT,
  withdrawn_at                                TEXT,
  hold_at                                     TEXT,
  resumed_at                                  TEXT,
  signoff_at                                  TEXT,

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

CREATE INDEX IF NOT EXISTS idx_oe_ipd_status      ON oe_ipp_document_control(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_tier        ON oe_ipp_document_control(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_tenant      ON oe_ipp_document_control(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_project     ON oe_ipp_document_control(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_sla         ON oe_ipp_document_control(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_breached    ON oe_ipp_document_control(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_reportable  ON oe_ipp_document_control(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_health      ON oe_ipp_document_control(doc_health_band);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_idc         ON oe_ipp_document_control(idc_status);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_schedule    ON oe_ipp_document_control(schedule_ref);

CREATE TABLE IF NOT EXISTS oe_ipp_document_control_events (
  id                  TEXT PRIMARY KEY,
  document_id         TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ipd_events_did  ON oe_ipp_document_control_events(document_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipd_events_type ON oe_ipp_document_control_events(event_type);
