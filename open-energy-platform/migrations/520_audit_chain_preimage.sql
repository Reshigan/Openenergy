-- ════════════════════════════════════════════════════════════════════════
-- Migration 520 — audit-chain preimage hardening + external anchoring
--
-- P0 fix: the original content_hash was SHA256(prev_hash || payload_json)
-- only. actor_id / entity_type / entity_id / event_type were NOT in the
-- hashed material, so an attacker with DB write access could alter who-did-
-- what without breaking the chain. This migration:
--
--   1. Adds audit_events.preimage_version (1 = legacy preimage, 2 = hardened
--      preimage that folds actor_id/entity_type/entity_id/event_type into the
--      canonical envelope). Existing rows backfill to 1 — that is the
--      "recompute pass marker": every legacy row carries version 1 so the
--      verifier can distinguish pre-fix rows (actor not provable) from
--      post-fix rows (actor bound into the hash). We do NOT rehash legacy
--      rows in place — that would break the chain. Instead verifyChain
--      flags them as `legacy_unverified` and continues.
--
--   2. Adds audit_chain_anchors — idempotency ledger for the hourly R2
--      external anchor write (publishChainHeadToR2). One row per
--      (anchor_date, anchor_hour); the R2 object key + snapshot head_hash is
--      recorded so a re-run within the same hour is a no-op.
-- ════════════════════════════════════════════════════════════════════════

-- 2.1 — preimage version per row. DEFAULT 1 backfills every existing row to
--      legacy; appendAudit now writes 2.
ALTER TABLE audit_events ADD COLUMN preimage_version INTEGER NOT NULL DEFAULT 1;

-- Index so the verifier can count legacy rows per chain cheaply.
CREATE INDEX IF NOT EXISTS idx_audit_events_preimage_version
  ON audit_events (entity_type, preimage_version);

-- 2.2 — hourly external-anchor idempotency ledger.
CREATE TABLE IF NOT EXISTS audit_chain_anchors (
  anchor_date   TEXT NOT NULL,           -- YYYY-MM-DD (UTC)
  anchor_hour   TEXT NOT NULL,           -- HH (UTC, 00-23)
  r2_key        TEXT NOT NULL,           -- object-lock bucket path written
  chain_count   INTEGER NOT NULL,        -- number of chains snapshotted
  head_count    INTEGER NOT NULL,        -- total rows across snapshotted chains
  anchor_hash   TEXT NOT NULL,           -- SHA256 over the snapshot envelope
  anchored_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (anchor_date, anchor_hour)
);