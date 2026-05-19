-- ════════════════════════════════════════════════════════════════════════
-- 067_audit_l5.sql — Audit L5: Merkle batching + third-party attestation
-- + per-event inclusion proofs.
--
-- The existing audit_chain (057) gives SHA-256 hash chains per entity.
-- This layer adds:
--   • Daily Merkle root computed over the day's audit_events. Anyone
--     can verify a single event's inclusion against the published root
--     with a O(log n) Merkle path.
--   • Roots are signed with the platform's attestation key (Ed25519
--     stored as Wrangler secret; verification key is published).
--   • Optional third-party co-sign (an external attestor signs the same
--     root and that signature is stored alongside).
--   • Proof requests + verification log.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_audit_merkle_roots (
  id                  TEXT PRIMARY KEY,
  entity_type         TEXT NOT NULL,
  day                 TEXT NOT NULL,        -- YYYY-MM-DD (UTC)
  event_count         INTEGER NOT NULL,
  first_sequence_no   INTEGER NOT NULL,
  last_sequence_no    INTEGER NOT NULL,
  merkle_root         TEXT NOT NULL,        -- hex SHA-256
  platform_signature  TEXT,                 -- base64 Ed25519 sig of root
  attestor_id         TEXT,
  attestor_signature  TEXT,                 -- third-party co-sign
  attestor_received_at TEXT,
  generated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_type, day)
);
CREATE INDEX IF NOT EXISTS idx_oe_merkle_day ON oe_audit_merkle_roots(day, entity_type);

CREATE TABLE IF NOT EXISTS oe_audit_proof_requests (
  id                  TEXT PRIMARY KEY,
  event_id            TEXT NOT NULL,
  requester_email     TEXT,
  requester_role      TEXT,
  proof_path          TEXT,                 -- JSON Merkle inclusion proof
  computed_root       TEXT,
  matches_root        INTEGER,              -- 0/1
  generated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_proof_event ON oe_audit_proof_requests(event_id);

CREATE TABLE IF NOT EXISTS oe_audit_attestors (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  organisation        TEXT,
  public_key_b64      TEXT NOT NULL,        -- Ed25519
  contact_email       TEXT,
  scope_entity_types  TEXT,                 -- JSON; NULL = all
  active              INTEGER NOT NULL DEFAULT 1,
  added_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
