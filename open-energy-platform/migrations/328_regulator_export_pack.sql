-- Wave 119 - Certified Regulator Export Packs.
--
-- SECOND Phase-B wave. Consumes W118 published audit blocks and
-- assembles per-regulator certified export packs (NERSA / IPPO / SARB
-- / DMRE / FSCA / DFFE / DTI / JSE-SRL / SARS / CIPC) for lodgement
-- via the regulator API. Where W118 is the tamper-evident SPINE, W119
-- is the regulator-facing OUTPUT.
--
-- Standards: XBRL 2.1 + iXBRL + IFRS Taxonomy + IFRS S1/S2 + GRI 1/2/3
-- + SASB Standards + TCFD Recommendations + ISSB IFRS S1/S2 + ESRS
-- + SOC 2 Type II CC Series + COSO Internal Control Integrated
-- Framework + AICPA TSC + NERSA s14 (record keeping) + NERSA s10/s14
-- (licence returns) + IPPO Quarterly Reporting Standard + SARB ExCon
-- Filing Manual + DMRE REIPPPP Bid Window Returns + FSCA Conduct
-- Standard 1/2020 + DFFE Carbon Tax Act Returns + DTI BBBEE Status
-- + JSE SRL Listed-Issuer Continuing Obligations + SARS BizFin
-- returns + CIPC annual return + ETSI TS 119 312 (signature policy)
-- + RFC 5652 CMS + ISO 32000 PDF/A-3 (long-term archival).
--
-- 12-state forward path + 4 branch states:
--   pack_proposed -> blocks_selected -> leaves_filtered ->
--     xbrl_assembled -> narratives_attached -> internal_qa ->
--     counterparty_signoff -> packaged -> countersigned ->
--     lodged_via_api -> acknowledged_by_regulator -> archived
--     (HARD terminal)
--   any non-terminal -> reject_pack -> rejected_by_regulator (TERMINAL)
--   pre-lodgement -> withdraw -> withdrawn (TERMINAL)
--   post-acknowledgement correction -> restate -> restated (SOFT)
--   regulator audit pause -> suspend -> suspended (SOFT)
--
-- Tier RE-DERIVED on every transition from pack_cadence with
-- FLOOR-AT-QUARTERLY on 5 contextual flags; floor lifts to annual on
-- 2+ flags:
--   ad_hoc / monthly_return / quarterly_attestation / half_year /
--   annual_audit
-- INVERTED polarity - LONGER lodgement cadence = MORE preparation
-- time. Stored as HOURS (ad_hoc 24h .. annual_audit 480h).
--
-- SIGNATURE Phase-B regulator crossings:
--   reject_pack -> EVERY tier (W119 SIGNATURE REGULATOR-REJECT-PACK
--     hard line - filing failed = disclosure event across NERSA s14
--     + IPPO + SARB + JSE SRL ALWAYS)
--   withdraw -> EVERY tier WHEN blocks_selected included published
--     blocks (audit-trail concern)
--   restate -> quarterly_attestation + annual_audit only
--   sla_breached -> quarterly_attestation + half_year + annual_audit
--   lodge_via_api -> never crosses (normal flow)
--
-- Write {admin, regulator}. READ all 9 personas + external
-- regulator_filer pseudo-persona via mTLS-gated
-- /api/regulator-exports/lodge/:target endpoint.
--
-- Persisted column budget kept under D1 100-col limit. ~75 persisted
-- cols. LIVE 22-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_regulator_export_pack (
  id                                          TEXT PRIMARY KEY,
  pack_number                                 TEXT UNIQUE NOT NULL,
  pack_cadence                                TEXT NOT NULL CHECK (pack_cadence IN (
    'ad_hoc','monthly_return','quarterly_attestation','half_year','annual_audit'
  )),
  regulator_target                            TEXT NOT NULL CHECK (regulator_target IN (
    'nersa','ippo','sarb','dmre','fsca','dffe','dti','jse_srl','sars','cipc'
  )),

  -- 6 cross-chain bridges (W118 mandatory + W113/W114/W115/W116/W117)
  w113_evm_ref                                TEXT,
  w114_doc_control_ref                        TEXT,
  w115_submittal_ref                          TEXT,
  w116_rfi_ref                                TEXT,
  w117_change_order_ref                       TEXT,
  w118_block_height_range_low                 INTEGER,
  w118_block_height_range_high                INTEGER,
  parent_pack_id                              TEXT,

  -- 5 floor flags (FLOOR-AT-QUARTERLY 1+ / FLOOR-AT-ANNUAL 2+)
  cross_regulator_pack                        INTEGER NOT NULL DEFAULT 0,
  material_restatement                        INTEGER NOT NULL DEFAULT 0,
  esg_double_materiality_trigger              INTEGER NOT NULL DEFAULT 0,
  lender_distribution_required                INTEGER NOT NULL DEFAULT 0,
  regulator_audit_in_progress                 INTEGER NOT NULL DEFAULT 0,

  -- XBRL conformance (taxonomy elements + iXBRL/PDF-A3/ETSI/CMS sigs)
  taxonomy_version_set                        INTEGER NOT NULL DEFAULT 0,
  schema_well_formed                          INTEGER NOT NULL DEFAULT 0,
  required_element_assets                     INTEGER NOT NULL DEFAULT 0,
  required_element_liabilities                INTEGER NOT NULL DEFAULT 0,
  required_element_equity                     INTEGER NOT NULL DEFAULT 0,
  required_element_revenue                    INTEGER NOT NULL DEFAULT 0,
  required_element_profit_loss                INTEGER NOT NULL DEFAULT 0,
  required_element_cash_equivalents           INTEGER NOT NULL DEFAULT 0,
  required_element_segments_reported          INTEGER NOT NULL DEFAULT 0,
  ixbrl_inline_html_valid                     INTEGER NOT NULL DEFAULT 0,
  pdf_a3_archival_attached                    INTEGER NOT NULL DEFAULT 0,
  signing_policy_etsi_119312                  INTEGER NOT NULL DEFAULT 0,
  cms_signature_rfc5652                       INTEGER NOT NULL DEFAULT 0,
  xbrl_conformance_score                      INTEGER NOT NULL DEFAULT 0,

  -- ESG taxonomy coverage (GRI / SASB / TCFD / ISSB)
  gri_standards_attached                      INTEGER NOT NULL DEFAULT 0,
  sasb_standards_attached                     INTEGER NOT NULL DEFAULT 0,
  tcfd_recommendations_attached               INTEGER NOT NULL DEFAULT 0,
  issb_ifrs_s1_s2_attached                    INTEGER NOT NULL DEFAULT 0,
  esg_taxonomy_coverage_pct                   INTEGER NOT NULL DEFAULT 0,

  -- COSO + SOC2 TSC + management/auditor narratives
  coso_components_present                     INTEGER NOT NULL DEFAULT 0,
  tsc_trust_categories_present                INTEGER NOT NULL DEFAULT 0,
  management_assertion_signed                 INTEGER NOT NULL DEFAULT 0,
  auditor_opinion_attached                    INTEGER NOT NULL DEFAULT 0,
  bridge_letter_attached                      INTEGER NOT NULL DEFAULT 0,
  controls_narrative_completeness             INTEGER NOT NULL DEFAULT 0,

  -- Internal QA + counterparty sign-off + ACK
  internal_qa_passed                          INTEGER NOT NULL DEFAULT 0,
  counterparty_signoff_obtained               INTEGER NOT NULL DEFAULT 0,
  regulator_ack_received                      INTEGER NOT NULL DEFAULT 0,

  -- Composite indexes + bands
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'ad_hoc','monthly_return','quarterly_attestation','half_year','annual_audit'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'preparer','controller','CFO','CEO'
  )),
  urgency_band                                TEXT,
  pack_health_band                            TEXT,
  pack_completeness_index                     INTEGER NOT NULL DEFAULT 0,
  integrity_index                             INTEGER NOT NULL DEFAULT 0,
  regulator_export_window_hours               INTEGER NOT NULL DEFAULT 0,
  days_to_quarterly_attestation               INTEGER NOT NULL DEFAULT 0,

  -- Narrative + reason codes
  title                                       TEXT,
  reason_code                                 TEXT,
  reject_reason                               TEXT,
  withdraw_reason                             TEXT,
  restate_reason                              TEXT,
  suspend_reason                              TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- mTLS counterparty fingerprint + ack codes
  mtls_cert_fingerprint                       TEXT,
  regulator_ack_code                          TEXT,
  regulator_reject_code                       TEXT,

  -- 12 forward + 4 branch lifecycle timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'pack_proposed','blocks_selected','leaves_filtered',
    'xbrl_assembled','narratives_attached','internal_qa',
    'counterparty_signoff','packaged','countersigned',
    'lodged_via_api','acknowledged_by_regulator','archived',
    'rejected_by_regulator','withdrawn','restated','suspended'
  )),
  pack_proposed_at                            TEXT,
  blocks_selected_at                          TEXT,
  leaves_filtered_at                          TEXT,
  xbrl_assembled_at                           TEXT,
  narratives_attached_at                      TEXT,
  internal_qa_at                              TEXT,
  counterparty_signoff_at                     TEXT,
  packaged_at                                 TEXT,
  countersigned_at                            TEXT,
  lodged_via_api_at                           TEXT,
  acknowledged_by_regulator_at                TEXT,
  archived_at                                 TEXT,
  rejected_at                                 TEXT,
  withdrawn_at                                TEXT,
  restated_at                                 TEXT,
  suspended_at                                TEXT,

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

CREATE INDEX IF NOT EXISTS idx_oe_rep_status        ON oe_regulator_export_pack(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_rep_tier          ON oe_regulator_export_pack(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_rep_target        ON oe_regulator_export_pack(regulator_target);
CREATE INDEX IF NOT EXISTS idx_oe_rep_breached      ON oe_regulator_export_pack(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_rep_created       ON oe_regulator_export_pack(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_rep_w118_low      ON oe_regulator_export_pack(w118_block_height_range_low);
CREATE INDEX IF NOT EXISTS idx_oe_rep_regulator_ref ON oe_regulator_export_pack(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_rep_inbox_ref     ON oe_regulator_export_pack(regulator_inbox_ref);
CREATE INDEX IF NOT EXISTS idx_oe_rep_audit_link    ON oe_regulator_export_pack(w118_block_height_range_high);
CREATE INDEX IF NOT EXISTS idx_oe_rep_parent        ON oe_regulator_export_pack(parent_pack_id);

CREATE TABLE IF NOT EXISTS oe_regulator_export_pack_events (
  id                  TEXT PRIMARY KEY,
  pack_id             TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_oe_rep_events_pack ON oe_regulator_export_pack_events(pack_id);
CREATE INDEX IF NOT EXISTS idx_oe_rep_events_type ON oe_regulator_export_pack_events(event_type);
