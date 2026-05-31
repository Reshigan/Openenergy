-- Wave 121 - Control-Environment Audit.
--
-- FOURTH and FINAL Phase-B wave. Closes Phase B (W118 spine + W119
-- exports + W120 attestation + W121 control-environment audit).
--
-- This is the unified control-environment EVIDENCE framework. Where
-- W118 publishes the canonical audit-block spine, W119 packages
-- regulator export files, W120 attests the cross-system books tie out,
-- W121 builds per-control evidence dossiers (Design / Test of Design
-- (ToD) / Test of Operating Effectiveness (ToOE) / deficiency
-- assessment / remediation) that close the SOC 2 Type II + COSO 2013
-- ICIF + ISO 27001:2022 ISMS certification loop.
--
-- Goal: beat AuditBoard CrossComply + LogicGate Risk Cloud + Hyperproof
-- + Drata + Vanta + Tugboat Logic + Resolver + Workiva + RSA Archer +
-- Galvanize HighBond.
--
-- Standards: AICPA SOC 2 Type II Trust Services Criteria + COSO 2013
-- ICIF (5 components x 17 principles) + ISO 27001:2022 Annex A 93 +
-- ISO 27002:2022 + NIST CSF 2.0 + NIST SP 800-53 Rev 5 + ISA 315
-- (Revised 2019) + ISA 330 audit responses + IIA IPPF + CMMC L3 +
-- COBIT 2019 + ITIL 4 + CIS Controls v8 + POPIA s19 + JSE SRL listed-
-- issuer ICFR + SARB op-risk capital (Basel III) + NERSA s14.
--
-- 12-state forward path + 4 branch states:
--   control_defined -> design_documented -> walkthrough_completed ->
--     tod_test_planned -> tod_evidence_collected -> tod_test_executed ->
--     tooe_test_planned -> tooe_evidence_collected ->
--     tooe_test_executed -> deficiency_assessed ->
--     remediation_completed -> archived (HARD terminal)
--   any non-terminal -> flag_deficient -> deficient (TERMINAL)
--   any pre-archive -> accept_with_exception -> excepted (SOFT)
--   any active state -> suspend -> suspended (SOFT - resume to
--     deficiency_assessed)
--   failed-ToD/ToOE / deficiency / remediation -> initiate_re_test ->
--     remediated_re_test (SOFT - resume to tooe_test_planned)
--
-- Tier RE-DERIVED on every transition from control_classification with
-- FLOOR-AT-DIRECTIVE on 5 contextual flags; floor lifts to governance
-- on 2+ flags:
--   preventive / detective / corrective / directive / governance
-- INVERTED polarity - LONGER classification = MORE prep time. Stored
-- as HOURS (preventive 168h .. governance 720h).
--
-- SIGNATURE Phase-B regulator crossings:
--   flag_deficient -> EVERY tier WHEN material_weakness_suspected
--     (W121 SIGNATURE MATERIAL-WEAKNESS-DEFICIENT hard line.)
--   accept_with_exception -> directive + governance only
--     (Management override of heavy control - listed-issuer disclosure.)
--   archive -> EVERY tier WHEN external_auditor_sign_off=1
--     (External auditor sign-off lodged - attestation-complete signal.)
--   complete_remediation -> never crosses (normal flow).
--   sla_breached -> directive + governance only.
--
-- Write {admin ONLY}. READ all 9 personas + external_auditor pseudo-
-- persona via signed JWT on /api/control-environment-audit/external/:id.
--
-- Persisted column budget kept under D1 100-col limit. ~85 persisted
-- cols. LIVE 26-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_control_environment_audit (
  id                                          TEXT PRIMARY KEY,
  control_number                              TEXT UNIQUE NOT NULL,
  control_classification                      TEXT NOT NULL CHECK (control_classification IN (
    'preventive','detective','corrective','directive','governance'
  )),
  control_framework                           TEXT,
  framework_control_ref                       TEXT,
  period_label                                TEXT NOT NULL,
  period_start                                TEXT,
  period_end                                  TEXT,

  -- 8 cross-chain bridges (W118 mandatory + W119/W120 + W113/W114/W115/W116/W117)
  w113_evm_ref                                TEXT,
  w114_doc_control_ref                        TEXT,
  w115_submittal_ref                          TEXT,
  w116_rfi_ref                                TEXT,
  w117_change_order_ref                       TEXT,
  w118_block_height_range_low                 INTEGER,
  w118_block_height_range_high                INTEGER,
  w119_export_pack_ref                        TEXT,
  w120_attestation_ref                        TEXT,
  parent_control_id                           TEXT,

  -- 5 floor flags (FLOOR-AT-DIRECTIVE 1+ / FLOOR-AT-GOVERNANCE 2+)
  material_weakness_suspected                 INTEGER NOT NULL DEFAULT 0,
  regulator_audit_in_progress                 INTEGER NOT NULL DEFAULT 0,
  soc2_type2_period_open                      INTEGER NOT NULL DEFAULT 0,
  iso27001_surveillance_audit_due             INTEGER NOT NULL DEFAULT 0,
  sox_404_attestation_pending                 INTEGER NOT NULL DEFAULT 0,

  -- Design documentation (COSO + SOC 2 + ISO 27001)
  control_description                         INTEGER NOT NULL DEFAULT 0,
  control_objective                           INTEGER NOT NULL DEFAULT 0,
  responsible_party                           INTEGER NOT NULL DEFAULT 0,
  frequency_documented                        INTEGER NOT NULL DEFAULT 0,
  inputs_documented                           INTEGER NOT NULL DEFAULT 0,
  outputs_documented                          INTEGER NOT NULL DEFAULT 0,
  ipe_documented                              INTEGER NOT NULL DEFAULT 0,
  manual_or_automated                         INTEGER NOT NULL DEFAULT 0,
  coso_principle_mapped                       INTEGER NOT NULL DEFAULT 0,
  iso27001_control_mapped                     INTEGER NOT NULL DEFAULT 0,
  soc2_criteria_mapped                        INTEGER NOT NULL DEFAULT 0,
  walkthrough_evidence                        INTEGER NOT NULL DEFAULT 0,
  soa_linked                                  INTEGER NOT NULL DEFAULT 0,

  -- ToD (Test of Design) - test_plan/evidence/executed derived from timestamps
  tod_sample_size                             INTEGER NOT NULL DEFAULT 0,
  tod_reviewer_signoff                        INTEGER NOT NULL DEFAULT 0,
  tod_pass_rate_pct                           INTEGER NOT NULL DEFAULT 0,
  tod_exceptions_logged                       INTEGER NOT NULL DEFAULT 0,
  tod_passed                                  INTEGER NOT NULL DEFAULT 0,

  -- ToOE (Test of Operating Effectiveness) - test_plan/evidence/executed derived from timestamps
  tooe_sample_size                            INTEGER NOT NULL DEFAULT 0,
  tooe_reviewer_signoff                       INTEGER NOT NULL DEFAULT 0,
  tooe_pass_rate_pct                          INTEGER NOT NULL DEFAULT 0,
  tooe_exceptions_logged                      INTEGER NOT NULL DEFAULT 0,
  tooe_passed                                 INTEGER NOT NULL DEFAULT 0,

  -- Deficiency + remediation
  deficiency_severity                         TEXT,
  remediation_progress_pct                    INTEGER NOT NULL DEFAULT 0,
  external_auditor_sign_off                   INTEGER NOT NULL DEFAULT 0,

  -- Composite indexes + bands
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'preventive','detective','corrective','directive','governance'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'control_owner','process_owner','CISO','audit_committee_chair'
  )),
  urgency_band                                TEXT,
  control_health_band                         TEXT,
  design_documentation_completeness_index     INTEGER NOT NULL DEFAULT 0,
  tod_test_completeness_index                 INTEGER NOT NULL DEFAULT 0,
  tooe_test_completeness_index                INTEGER NOT NULL DEFAULT 0,
  evidence_coverage_index                     INTEGER NOT NULL DEFAULT 0,
  audit_window_hours                          INTEGER NOT NULL DEFAULT 0,
  days_to_quarterly_cutoff                    INTEGER NOT NULL DEFAULT 0,
  days_to_annual_audit                        INTEGER NOT NULL DEFAULT 0,

  -- Narrative + reason codes
  title                                       TEXT,
  reason_code                                 TEXT,
  deficient_reason                            TEXT,
  exception_reason                            TEXT,
  suspend_reason                              TEXT,

  is_reportable_flag                          INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- External-auditor (signed JWT)
  external_auditor_firm                       TEXT,
  external_auditor_engagement_ref             TEXT,
  external_auditor_jwt_jti                    TEXT,

  -- 12 forward + 4 branch lifecycle timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'control_defined','design_documented','walkthrough_completed',
    'tod_test_planned','tod_evidence_collected','tod_test_executed',
    'tooe_test_planned','tooe_evidence_collected','tooe_test_executed',
    'deficiency_assessed','remediation_completed','archived',
    'deficient','excepted','suspended','remediated_re_test'
  )),
  control_defined_at                          TEXT,
  design_documented_at                        TEXT,
  walkthrough_completed_at                    TEXT,
  tod_test_planned_at                         TEXT,
  tod_evidence_collected_at                   TEXT,
  tod_test_executed_at                        TEXT,
  tooe_test_planned_at                        TEXT,
  tooe_evidence_collected_at                  TEXT,
  tooe_test_executed_at                       TEXT,
  deficiency_assessed_at                      TEXT,
  remediation_completed_at                    TEXT,
  archived_at                                 TEXT,
  deficient_at                                TEXT,
  excepted_at                                 TEXT,
  suspended_at                                TEXT,
  remediated_re_test_at                       TEXT,

  -- Regulator crossing
  regulator_crossed_at                        TEXT,
  regulator_inbox_ref                         TEXT,
  regulator_ref                               TEXT,

  -- SLA (HOURS, INVERTED polarity)
  sla_target_hours                            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                             TEXT,
  sla_breached                                INTEGER NOT NULL DEFAULT 0,
  escalation_level                            INTEGER NOT NULL DEFAULT 0,

  tenant_id                                   TEXT,
  created_by                                  TEXT NOT NULL,
  created_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cea_status        ON oe_control_environment_audit(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cea_tier          ON oe_control_environment_audit(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cea_classification ON oe_control_environment_audit(control_classification);
CREATE INDEX IF NOT EXISTS idx_oe_cea_framework     ON oe_control_environment_audit(control_framework);
CREATE INDEX IF NOT EXISTS idx_oe_cea_breached      ON oe_control_environment_audit(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_cea_created       ON oe_control_environment_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_cea_w118_low      ON oe_control_environment_audit(w118_block_height_range_low);
CREATE INDEX IF NOT EXISTS idx_oe_cea_w119_pack     ON oe_control_environment_audit(w119_export_pack_ref);
CREATE INDEX IF NOT EXISTS idx_oe_cea_w120_att      ON oe_control_environment_audit(w120_attestation_ref);
CREATE INDEX IF NOT EXISTS idx_oe_cea_regulator_ref ON oe_control_environment_audit(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_cea_inbox_ref     ON oe_control_environment_audit(regulator_inbox_ref);
CREATE INDEX IF NOT EXISTS idx_oe_cea_parent        ON oe_control_environment_audit(parent_control_id);

CREATE TABLE IF NOT EXISTS oe_control_environment_audit_events (
  id                  TEXT PRIMARY KEY,
  control_id          TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_oe_cea_events_ctl  ON oe_control_environment_audit_events(control_id);
CREATE INDEX IF NOT EXISTS idx_oe_cea_events_type ON oe_control_environment_audit_events(event_type);
