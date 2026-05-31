-- Wave 118 - Hash-Chain Audit Trees & Tamper-Evident Ledger.
--
-- FIRST Phase-B wave - opens the L5 regulator-grade hardening series.
-- W118 is the platform-wide tamper-evident cross-chain audit tree -
-- NOT another IPP chain. It is the cryptographic spine that ACTIVATES
-- the hash_chain_position + merkle_root_segment pre-stages embedded in
-- W113 EVM / W114 Document Control / W115 Submittals / W116 RFIs /
-- W117 Change Orders LIVE batteries.
--
-- Sister of cascade.ts. Foundation for the rest of Phase B
-- (W119 certified exports, W120 reconciliation attestation,
-- W121 control-environment audit).
--
-- Standards: NIST SP 800-92 (log management) + ISO 27037 (digital
-- evidence) + RFC 6962 (Certificate Transparency Merkle tree spec) +
-- Bitcoin-style chained-block hashing + XBRL audit pack + IFRS
-- audit-trail requirements + SOC 2 Type II Common Criteria CC7.2
-- (anomaly detection) + AICPA TSC + COSO Internal Control Integrated
-- Framework + NERSA s14 Record Keeping + POPIA s14 (record integrity)
-- + JSE SRL listed-issuer audit requirements + RFC 3161 TSA +
-- Certificate Transparency log + OpenTimestamps protocol.
--
-- 12-state forward path + 4 branch states:
--   block_proposed -> segments_collected -> merkle_built ->
--   integrity_verified -> block_signed -> anchored -> published ->
--   independently_verifiable -> reconciled -> archived (HARD terminal)
--   any non-terminal -> reject -> rejected
--   verification dispute -> suspend -> suspended (SOFT)
--   post-correction -> restate -> restated (SOFT)
--   emergency hard line -> fork / emergency_seal -> forked
--
-- Tier RE-DERIVED on every transition from block_cadence with
-- FLOOR-AT-MONTHLY on 5 contextual flags; floor lifts to quarterly
-- with 2+ flags:
--   hourly / daily / weekly / monthly / quarterly
-- INVERTED polarity - larger block volume = MORE cryptographic
-- verification time. Stored as HOURS.
--
-- SIGNATURE Phase-B regulator crossings:
--   emergency_seal -> EVERY tier (W118 SIGNATURE
--     SIGNATURE-CHAIN-BREAK-SEAL hard line)
--   reject -> EVERY tier when signature_chain_break_detected ||
--     hash_collision_suspected
--   restate -> monthly + quarterly only (recasting a published block =
--     listed-issuer JSE SRL disclosure event)
--   publish_block -> no regulator
--   sla_breached -> monthly + quarterly only
--
-- Write {admin} ONLY. READ all 9 personas + external audit_verifier
-- pseudo-persona via /api/audit-chain/verify (no auth required).
--
-- Persisted column budget kept under D1 100-col limit. ~73 persisted
-- cols + 14 state timestamps + 5 reconciliation status cols. Remaining
-- LIVE battery fields are decorated at fetch time, never persisted.

CREATE TABLE IF NOT EXISTS oe_audit_chain_block (
  id                                          TEXT PRIMARY KEY,
  block_height                                INTEGER NOT NULL,
  block_number                                TEXT UNIQUE NOT NULL,
  block_cadence                               TEXT NOT NULL CHECK (block_cadence IN (
    'hourly','daily','weekly','monthly','quarterly'
  )),

  -- Cross-chain bridges (W113 EVM + W114 doc control + W115 submittals
  -- + W116 RFIs + W117 change orders). Each Phase-A chain has its rows
  -- ingested into W118 blocks via merkle_root_segment fingerprint.
  w113_evm_ref                                TEXT,
  w114_doc_control_ref                        TEXT,
  w115_submittal_ref                          TEXT,
  w116_rfi_ref                                TEXT,
  w117_change_order_ref                       TEXT,

  -- 5 floor flags (FLOOR-AT-MONTHLY / FLOOR-AT-QUARTERLY at 2+)
  signature_chain_break_detected              INTEGER NOT NULL DEFAULT 0,
  hash_collision_suspected                    INTEGER NOT NULL DEFAULT 0,
  regulator_audit_active                      INTEGER NOT NULL DEFAULT 0,
  cross_border_witness_required               INTEGER NOT NULL DEFAULT 0,
  sox_404_attestation_pending                 INTEGER NOT NULL DEFAULT 0,

  -- Block content + cryptographic spine
  source_chain_count                          INTEGER NOT NULL DEFAULT 0,
  segment_count                               INTEGER NOT NULL DEFAULT 0,
  merkle_root                                 TEXT,
  parent_block_hash                           TEXT,
  block_self_hash                             TEXT,
  signing_pubkey_fingerprint                  TEXT,
  signature_bytes                             TEXT,
  anchor_method                               TEXT,
  anchor_uri                                  TEXT,

  -- Independent verification + Byzantine quorum
  independent_verifier_count                  INTEGER NOT NULL DEFAULT 0,
  independent_verifier_quorum_met             INTEGER NOT NULL DEFAULT 0,

  -- Reconciliation matrix (5 source chains)
  reconciliation_status_w113_evm              INTEGER NOT NULL DEFAULT 0,
  reconciliation_status_w114_doc              INTEGER NOT NULL DEFAULT 0,
  reconciliation_status_w115_sub              INTEGER NOT NULL DEFAULT 0,
  reconciliation_status_w116_rfi              INTEGER NOT NULL DEFAULT 0,
  reconciliation_status_w117_co               INTEGER NOT NULL DEFAULT 0,
  cross_chain_break_count                     INTEGER NOT NULL DEFAULT 0,

  -- Composite indexes + bands
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'hourly','daily','weekly','monthly','quarterly'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'auditor','CISO','CFO','BoardAudit'
  )),
  urgency_band                                TEXT,
  block_health_band                           TEXT,
  block_completeness_index                    INTEGER NOT NULL DEFAULT 0,
  integrity_index                             INTEGER NOT NULL DEFAULT 0,
  hash_collision_risk_score                   INTEGER NOT NULL DEFAULT 0,
  block_age_hours                             INTEGER NOT NULL DEFAULT 0,
  regulator_export_window_hours               INTEGER NOT NULL DEFAULT 0,
  days_to_quarterly_attestation               INTEGER NOT NULL DEFAULT 0,

  -- Narrative + reason codes
  title                                       TEXT,
  reason_code                                 TEXT,
  reject_reason                               TEXT,
  suspend_reason                              TEXT,
  restate_reason                              TEXT,
  fork_reason                                 TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- 10 forward + 4 branch lifecycle timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'block_proposed','segments_collected','merkle_built',
    'integrity_verified','block_signed','anchored','published',
    'independently_verifiable','reconciled','archived',
    'rejected','suspended','restated','forked'
  )),
  block_proposed_at                           TEXT,
  segments_collected_at                       TEXT,
  merkle_built_at                             TEXT,
  integrity_verified_at                       TEXT,
  block_signed_at                             TEXT,
  anchored_at                                 TEXT,
  published_at                                TEXT,
  independently_verifiable_at                 TEXT,
  reconciled_at                               TEXT,
  archived_at                                 TEXT,
  rejected_at                                 TEXT,
  suspended_at                                TEXT,
  restated_at                                 TEXT,
  forked_at                                   TEXT,

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

CREATE INDEX IF NOT EXISTS idx_oe_acb_status      ON oe_audit_chain_block(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_acb_tier        ON oe_audit_chain_block(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_acb_height      ON oe_audit_chain_block(block_height);
CREATE INDEX IF NOT EXISTS idx_oe_acb_tenant      ON oe_audit_chain_block(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_acb_sla         ON oe_audit_chain_block(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_acb_breached    ON oe_audit_chain_block(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_acb_reportable  ON oe_audit_chain_block(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_acb_health      ON oe_audit_chain_block(block_health_band);
CREATE INDEX IF NOT EXISTS idx_oe_acb_breaks      ON oe_audit_chain_block(cross_chain_break_count);
CREATE INDEX IF NOT EXISTS idx_oe_acb_cadence     ON oe_audit_chain_block(block_cadence);

CREATE TABLE IF NOT EXISTS oe_audit_chain_block_events (
  id                  TEXT PRIMARY KEY,
  block_id            TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_acb_events_block ON oe_audit_chain_block_events(block_id);
CREATE INDEX IF NOT EXISTS idx_oe_acb_events_type  ON oe_audit_chain_block_events(event_type);
