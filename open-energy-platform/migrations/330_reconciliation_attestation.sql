-- Wave 120 - ICFR Reconciliation Attestation.
--
-- THIRD Phase-B wave. Attests that every cross-chain row + external-
-- system feed (SAP S/4HANA + Oracle Financials + SAGE 300 + Workday +
-- STRATE + SWIFT MT940 + NERSA/IPPO/DMRE inboxes + bank statements)
-- reconciles against W118 published audit blocks, with the resulting
-- attestation lodged as a W119 export pack. W118 = spine; W119 =
-- output; W120 = ATTESTATION that the books tie out.
--
-- Goal: beat BlackLine + Trintech Cadency + FloQast + OneStream + Adra
-- + FIS Reconciliation Hub + Broadridge + Duco + Gresham Clareti.
--
-- Standards: ICFR (SOX s404 / King IV / JSE Listings 8.62 ICFR) + COSO
-- Internal Control - Integrated Framework + AICPA Trust Services
-- Criteria + ISO 27001 A.18 + ISA 315 (Revised 2019) + ISA 540 + ISA
-- 600 + IFRS 9 ECL + IAS 1 + IAS 8 errors + JSE Listings 8.62 +
-- Companies Act 71 of 2008 s30 + POPIA s19 + ETSI TS 119 312.
--
-- 12-state forward path + 4 branch states:
--   attestation_proposed -> scope_defined -> feeds_ingested ->
--     blocks_paired -> variance_computed -> break_classified ->
--     root_cause_logged -> remediation_proposed ->
--     counter_party_signoff -> independent_review ->
--     attestation_signed -> archived (HARD terminal)
--   any non-terminal -> reject -> rejected (TERMINAL)
--   pre-sign -> suspend -> suspended (SOFT - resume to
--     remediation_proposed)
--   post-sign -> restate -> restated (SOFT)
--   pre-sign -> escalate_to_audit_committee -> escalated (SOFT - lift
--     to remediation_proposed)
--
-- Tier RE-DERIVED on every transition from cadence with
-- FLOOR-AT-QUARTERLY on 5 contextual flags; floor lifts to annual on
-- 2+ flags:
--   daily_tactical / weekly_management / monthly_management /
--   quarterly_attestation / annual_audit
-- INVERTED polarity - LONGER cadence = MORE preparation time. Stored
-- as HOURS (daily_tactical 24h .. annual_audit 720h).
--
-- SIGNATURE Phase-B regulator crossings:
--   escalate_to_audit_committee -> EVERY tier (W120 SIGNATURE
--     ICFR-DEFICIENCY-ATTEST hard line - audit committee escalation
--     always crosses; JSE 8.62 + Companies Act s30 + COSO Monitoring
--     ALWAYS).
--   reject -> EVERY tier WHEN material_variance_unresolved AND
--     icfr_deficiency_suspected.
--   restate -> quarterly_attestation + annual_audit only (IAS 8).
--   sla_breached -> quarterly_attestation + annual_audit only.
--   sign_attestation -> never crosses (normal flow).
--
-- Write {admin ONLY}. READ all 9 personas. External-auditor read via
-- signed JWT (NOT mTLS) on
-- /api/reconciliation-attestation/external/:id.
--
-- Persisted column budget kept under D1 100-col limit. ~80 persisted
-- cols. LIVE 24-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_reconciliation_attestation (
  id                                          TEXT PRIMARY KEY,
  attestation_number                          TEXT UNIQUE NOT NULL,
  cadence                                     TEXT NOT NULL CHECK (cadence IN (
    'daily_tactical','weekly_management','monthly_management','quarterly_attestation','annual_audit'
  )),
  period_label                                TEXT NOT NULL,
  period_start                                TEXT,
  period_end                                  TEXT,

  -- 7 cross-chain bridges (W118 + W119 mandatory + W113/W114/W115/W116/W117)
  w113_evm_ref                                TEXT,
  w114_doc_control_ref                        TEXT,
  w115_submittal_ref                          TEXT,
  w116_rfi_ref                                TEXT,
  w117_change_order_ref                       TEXT,
  w118_block_height_range_low                 INTEGER,
  w118_block_height_range_high                INTEGER,
  w119_export_pack_ref                        TEXT,
  parent_attestation_id                       TEXT,

  -- 5 floor flags (FLOOR-AT-QUARTERLY 1+ / FLOOR-AT-ANNUAL 2+)
  material_variance_unresolved                INTEGER NOT NULL DEFAULT 0,
  external_auditor_request_active             INTEGER NOT NULL DEFAULT 0,
  regulator_audit_in_progress                 INTEGER NOT NULL DEFAULT 0,
  cross_border_feed_break                     INTEGER NOT NULL DEFAULT 0,
  icfr_deficiency_suspected                   INTEGER NOT NULL DEFAULT 0,

  -- Feed inventory (counters; feed details in events payload)
  feeds_in_scope                              INTEGER NOT NULL DEFAULT 0,
  feeds_ingested_count                        INTEGER NOT NULL DEFAULT 0,
  feeds_paired_count                          INTEGER NOT NULL DEFAULT 0,
  feeds_paired_pct                            INTEGER NOT NULL DEFAULT 0,
  feed_sources_csv                            TEXT,

  -- Variance ledger (ZAR)
  total_variance_zar                          INTEGER NOT NULL DEFAULT 0,
  materiality_threshold_zar                   INTEGER NOT NULL DEFAULT 0,
  net_variance_explained_zar                  INTEGER NOT NULL DEFAULT 0,
  unresolved_variance_zar                     INTEGER NOT NULL DEFAULT 0,
  variance_explained_pct                      INTEGER NOT NULL DEFAULT 0,

  -- Break classification + root cause
  break_classification                        TEXT,
  break_classified_pct                        INTEGER NOT NULL DEFAULT 0,
  root_cause_taxonomy                         TEXT,

  -- ICFR controls (COSO + TSC)
  coso_components_tested                      INTEGER NOT NULL DEFAULT 0,
  tsc_categories_tested                       INTEGER NOT NULL DEFAULT 0,
  material_weakness_open                      INTEGER NOT NULL DEFAULT 0,

  -- Remediation
  remediation_progress_pct                    INTEGER NOT NULL DEFAULT 0,
  remediation_closed_pct                      INTEGER NOT NULL DEFAULT 0,
  action_plan_drafted                         INTEGER NOT NULL DEFAULT 0,
  owner_assigned                              INTEGER NOT NULL DEFAULT 0,
  target_date_set                             INTEGER NOT NULL DEFAULT 0,
  evidence_attached                           INTEGER NOT NULL DEFAULT 0,
  followup_test_passed                        INTEGER NOT NULL DEFAULT 0,

  -- Sign-offs
  counter_party_signed_off                    INTEGER NOT NULL DEFAULT 0,
  independent_review_passed                   INTEGER NOT NULL DEFAULT 0,
  cfo_attestation_signed                      INTEGER NOT NULL DEFAULT 0,
  audit_committee_briefed                     INTEGER NOT NULL DEFAULT 0,

  -- Composite indexes + bands
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'daily_tactical','weekly_management','monthly_management','quarterly_attestation','annual_audit'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'reconciler','controller','CFO','audit_committee_chair'
  )),
  urgency_band                                TEXT,
  attestation_health_band                     TEXT,
  reconciliation_completeness_index           INTEGER NOT NULL DEFAULT 0,
  icfr_control_effectiveness_index            INTEGER NOT NULL DEFAULT 0,
  variance_score_index                        INTEGER NOT NULL DEFAULT 0,
  remediation_progress_index                  INTEGER NOT NULL DEFAULT 0,
  attestation_window_hours                    INTEGER NOT NULL DEFAULT 0,
  days_to_quarterly_attestation               INTEGER NOT NULL DEFAULT 0,

  -- Narrative + reason codes
  title                                       TEXT,
  reason_code                                 TEXT,
  reject_reason                               TEXT,
  suspend_reason                              TEXT,
  restate_reason                              TEXT,
  escalation_reason                           TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- External-auditor (signed JWT)
  external_auditor_firm                       TEXT,
  external_auditor_engagement_ref             TEXT,
  external_auditor_jwt_jti                    TEXT,

  -- 12 forward + 4 branch lifecycle timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'attestation_proposed','scope_defined','feeds_ingested',
    'blocks_paired','variance_computed','break_classified',
    'root_cause_logged','remediation_proposed','counter_party_signoff',
    'independent_review','attestation_signed','archived',
    'rejected','suspended','restated','escalated_to_audit_committee'
  )),
  attestation_proposed_at                     TEXT,
  scope_defined_at                            TEXT,
  feeds_ingested_at                           TEXT,
  blocks_paired_at                            TEXT,
  variance_computed_at                        TEXT,
  break_classified_at                         TEXT,
  root_cause_logged_at                        TEXT,
  remediation_proposed_at                     TEXT,
  counter_party_signoff_at                    TEXT,
  independent_review_at                       TEXT,
  attestation_signed_at                       TEXT,
  archived_at                                 TEXT,
  rejected_at                                 TEXT,
  suspended_at                                TEXT,
  restated_at                                 TEXT,
  escalated_at                                TEXT,

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

  tenant_id                                   TEXT,
  created_by                                  TEXT NOT NULL,
  created_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ratt_status        ON oe_reconciliation_attestation(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_tier          ON oe_reconciliation_attestation(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_cadence       ON oe_reconciliation_attestation(cadence);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_breached      ON oe_reconciliation_attestation(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_created       ON oe_reconciliation_attestation(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_w118_low      ON oe_reconciliation_attestation(w118_block_height_range_low);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_w119_pack     ON oe_reconciliation_attestation(w119_export_pack_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_regulator_ref ON oe_reconciliation_attestation(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_inbox_ref     ON oe_reconciliation_attestation(regulator_inbox_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_parent        ON oe_reconciliation_attestation(parent_attestation_id);

CREATE TABLE IF NOT EXISTS oe_reconciliation_attestation_events (
  id                  TEXT PRIMARY KEY,
  attestation_id      TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  from_tier           TEXT,
  to_tier             TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ratt_events_att  ON oe_reconciliation_attestation_events(attestation_id);
CREATE INDEX IF NOT EXISTS idx_oe_ratt_events_type ON oe_reconciliation_attestation_events(event_type);
