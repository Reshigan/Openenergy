-- Wave 117 - IPP Change Orders & Variations chain.
-- 12th IPP-pure chain - TARGET-CLOSING for the Phase-A 12-chain IPP gold
-- standard (W1/W10/W19/W20/W23/W27/W112/W113/W114/W115/W116/W117). SIXTH
-- and final Phase-A world-class wave. Sibling of W112 schedule, W113
-- cost/EVM, W114 doc control, W115 submittals, W116 RFIs. W117 owns the
-- CHANGE ORDER lifecycle - the formal route by which scope/cost/schedule
-- changes are proposed, priced, negotiated, approved, scheduled, executed
-- and closed out under FIDIC sec.13 / NEC4 sec.60-65 / AIA G701/G714 /
-- CSI 01 26 00 / REIPPPP variations protocol / DMRE EPC change control.
--
-- Beats Procore Change Mgmt / Aconex Cost Mgmt CRs / Oracle Aconex
-- Variations / Autodesk Construction Cloud Cost / e-Builder Change Mgmt
-- / Asite CRs / Coreworx Change / SAP S/4HANA EPC variations / Deltek
-- Cobra change mgmt / InEight Control change mgmt. Each surfaces CRs as
-- a list with status; W117 turns it into a 12-state P6 CR chain with
-- INVERTED SLA polarity (HOURS), FLOOR-AT-MAJOR on 5 contextual flags
-- (scope_baseline_change / regulatory_re_consent_required /
-- schedule_impact_critical_path / lender_consent_required /
-- safety_design_change), 4-step authority ladder (PM -> engineer ->
-- owner_rep -> IPP_CEO), 22-field LIVE CR battery and the SIGNATURE
-- SCOPE-BASELINE-CHANGE-APPROVE EVERY-tier hard line.
--
-- 12-state forward path + 4 branch states:
--   change_proposed -> impact_assessed -> cost_quoted -> owner_review
--     -> negotiated -> approved -> issued_for_execution -> scheduled
--     -> executing -> executed -> closed_out -> archived (HARD terminal)
--   any non-terminal -> reject -> rejected (TERMINAL - out of scope)
--   pre-approval -> void -> void (TERMINAL - withdrawn before approval)
--   pre-execution states -> hold_resume -> on_hold (SOFT)
--   review-touch states -> dispute -> disputed (SOFT)
--
-- Tier RE-DERIVED on every transition from change_value_zar with
-- FLOOR-AT-MAJOR on 5 contextual flags; floor lifts to transformational
-- with 2+ flags:
--   minor / material / major / transformational
-- INVERTED polarity - larger CR-value = MORE TIME for diligence.
--
-- INVERTED SLA polarity (HOURS) anchored on owner_review:
--   minor 168h / material 336h / major 720h / transformational 1080h.
--
-- SIGNATURE Phase-A IPP regulator crossings:
--   approve -> EVERY tier when scope_baseline_change ||
--               regulatory_re_consent_required
--               (W117 SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE hard line)
--   reject  -> EVERY tier when cumulative_change_value_pct >= 15
--               (REIPPPP cumulative CR cap signal)
--   dispute -> major + transformational only
--   close_out, archive, void, hold_resume -> no regulator
--   sla_breached -> major + transformational only
--
-- Write {admin, ipp_developer}. Read all 9 personas. 4-party split:
--   PM        : propose, submit_for_review, hold_resume, void
--   engineer  : assess_impact, quote_cost
--   owner_rep : negotiate, reject, dispute
--   IPP_CEO   : approve, issue, schedule, commence_execution,
--               complete_execution, close_out, archive

CREATE TABLE IF NOT EXISTS oe_ipp_change_order (
  id                                          TEXT PRIMARY KEY,
  change_order_number                         TEXT UNIQUE NOT NULL,

  -- Project linkage
  project_id                                  TEXT NOT NULL,
  project_name                                TEXT,
  project_capacity_mw                         REAL NOT NULL DEFAULT 0,
  project_type                                TEXT,
  contract_ref                                TEXT,
  contract_value_zar                          REAL NOT NULL DEFAULT 0,

  -- Cross-chain bridges (W116 RFIs + W115 submittals + W114 doc-control
  -- + W112 schedule + W113 EVM + W19 procurement + W20 COD)
  rfi_ref                                     TEXT,
  submittal_ref                               TEXT,
  document_control_ref                        TEXT,
  schedule_ref                                TEXT,
  evm_ref                                     TEXT,
  procurement_ref                             TEXT,
  cod_ref                                     TEXT,

  -- CR identity (FIDIC sec.13 + NEC4 sec.60-65 + AIA G701/G714 + CSI 01 26 00)
  change_type                                 TEXT,
  change_class                                TEXT,
  initiator_role                              TEXT,
  discipline                                  TEXT,
  package_code                                TEXT,
  drawing_number                              TEXT,
  spec_section                                TEXT,
  csi_section                                 TEXT,
  basis_clause                                TEXT,
  scope_summary_short                         TEXT,
  scope_summary_long                          TEXT,
  proposed_resolution                         TEXT,

  -- Parties + ball-in-court
  pm_name                                     TEXT,
  engineer_name                               TEXT,
  owner_rep_name                              TEXT,
  ceo_name                                    TEXT,
  current_ball_in_court_party                 TEXT,
  last_actor_party                            TEXT,

  -- 5 floor flags
  scope_baseline_change                       INTEGER NOT NULL DEFAULT 0,
  regulatory_re_consent_required              INTEGER NOT NULL DEFAULT 0,
  schedule_impact_critical_path               INTEGER NOT NULL DEFAULT 0,
  lender_consent_required                     INTEGER NOT NULL DEFAULT 0,
  safety_design_change                        INTEGER NOT NULL DEFAULT 0,

  -- Impact ledger
  change_value_zar                            REAL NOT NULL DEFAULT 0,
  schedule_impact_days                        INTEGER NOT NULL DEFAULT 0,
  eac_delta_zar                               REAL NOT NULL DEFAULT 0,
  cumulative_change_value_zar                 REAL NOT NULL DEFAULT 0,
  cumulative_change_value_pct                 REAL NOT NULL DEFAULT 0,
  cumulative_cap_band                         TEXT,

  -- Tier + authority + completeness battery
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'minor','material','major','transformational'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'PM','engineer','owner_rep','IPP_CEO'
  )),
  urgency_band                                TEXT,
  change_order_health_band                    TEXT,
  change_order_completeness_index             INTEGER NOT NULL DEFAULT 0,
  change_order_age_days                       INTEGER NOT NULL DEFAULT 0,
  days_to_critical_path_recovery              INTEGER,
  regulator_filing_window_hours               INTEGER NOT NULL DEFAULT 0,

  -- Narrative + reason codes
  title                                       TEXT,
  reason_code                                 TEXT,
  reject_reason                               TEXT,
  void_reason                                 TEXT,
  hold_reason                                 TEXT,
  dispute_reason                              TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- 12 lifecycle + 4 branch status timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'change_proposed','impact_assessed','cost_quoted','owner_review',
    'negotiated','approved','issued_for_execution','scheduled',
    'executing','executed','closed_out','archived',
    'rejected','void','on_hold','disputed'
  )),
  change_proposed_at                          TEXT,
  impact_assessed_at                          TEXT,
  cost_quoted_at                              TEXT,
  owner_review_at                             TEXT,
  negotiated_at                               TEXT,
  approved_at                                 TEXT,
  issued_for_execution_at                     TEXT,
  scheduled_at                                TEXT,
  executing_at                                TEXT,
  executed_at                                 TEXT,
  closed_out_at                               TEXT,
  archived_at                                 TEXT,
  rejected_at                                 TEXT,
  void_at                                     TEXT,
  on_hold_at                                  TEXT,
  disputed_at                                 TEXT,

  -- Regulator crossing
  regulator_crossed_at                        TEXT,
  regulator_inbox_ref                         TEXT,
  regulator_ref                               TEXT,

  -- SLA (HOURS, INVERTED polarity)
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

CREATE INDEX IF NOT EXISTS idx_oe_ico_status      ON oe_ipp_change_order(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ico_tier        ON oe_ipp_change_order(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ico_tenant      ON oe_ipp_change_order(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_ico_project     ON oe_ipp_change_order(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ico_sla         ON oe_ipp_change_order(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_ico_breached    ON oe_ipp_change_order(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ico_reportable  ON oe_ipp_change_order(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ico_health      ON oe_ipp_change_order(change_order_health_band);
CREATE INDEX IF NOT EXISTS idx_oe_ico_class       ON oe_ipp_change_order(change_class);
CREATE INDEX IF NOT EXISTS idx_oe_ico_rfi_ref     ON oe_ipp_change_order(rfi_ref);

CREATE TABLE IF NOT EXISTS oe_ipp_change_order_events (
  id                  TEXT PRIMARY KEY,
  change_order_id     TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ico_events_coid ON oe_ipp_change_order_events(change_order_id);
CREATE INDEX IF NOT EXISTS idx_oe_ico_events_type ON oe_ipp_change_order_events(event_type);
