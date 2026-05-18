-- ════════════════════════════════════════════════════════════════════════
-- Migration 057 — Tamper-evident audit chain (L5 primitive)
--
-- Adds the cross-feature audit primitive used by all L5 surfaces:
--   • audit_events       — append-only event log with SHA-256 hash chain
--   • audit_chain_state  — current head per (entity_type) for O(1) lookup
--   • audit_exports      — record of certified-export packages written to R2
--   • audit_recon_runs   — counterparty/registry reconciliation runs
--   • audit_recon_breaks — line-level mismatches surfaced by a recon run
--
-- Hash-chain shape:
--   content_hash_i = SHA256( prev_hash_i || canonical_json(payload_i) )
--   prev_hash_i    = content_hash_(i-1) for the same entity_type
--                    ('0000…' for the first event)
--   sequence_no    = monotonic per entity_type
--
-- Why entity_type (not entity_id) is the chain key:
--   A regulator export wants ONE chain per feature ("trading", "settlement",
--   etc.) so verification scans a single ledger. Per-entity chains are too
--   granular and a verifier would have to walk thousands of short chains
--   to certify the whole feature.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL,         -- 'trading' | 'settlement' | …
  entity_id     TEXT,                  -- the affected row's id (nullable for bulk events)
  event_type    TEXT NOT NULL,         -- 'order.placed' | 'order.amended' | …
  actor_id      TEXT NOT NULL,         -- participant id that caused the event
  payload_json  TEXT NOT NULL,         -- canonical JSON (sorted keys)
  prev_hash     TEXT NOT NULL,         -- 64-char hex; '00…' for sequence_no=1
  content_hash  TEXT NOT NULL,         -- SHA256(prev_hash || payload_json)
  sequence_no   INTEGER NOT NULL,      -- 1-indexed, monotonic per entity_type
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_type, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON audit_events (entity_type, sequence_no DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity_id
  ON audit_events (entity_id);

-- One row per entity_type; updated under the same advisory lock as the
-- corresponding audit_events insert so reads can find the current head
-- without scanning.
CREATE TABLE IF NOT EXISTS audit_chain_state (
  entity_type     TEXT PRIMARY KEY,
  head_hash       TEXT NOT NULL,
  head_sequence   INTEGER NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_verified_at TEXT,
  last_verified_seq INTEGER
);

-- ── Certified exports ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_exports (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL,
  from_ts         TEXT NOT NULL,
  to_ts           TEXT NOT NULL,
  row_count       INTEGER NOT NULL,
  csv_r2_key      TEXT NOT NULL,        -- the data file in open-energy-vault
  manifest_r2_key TEXT NOT NULL,        -- the SHA-256 manifest + chain head
  chain_head_hash TEXT NOT NULL,        -- the audit_chain_state head at export time
  generated_by    TEXT NOT NULL,        -- actor_id
  generated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_exports_entity
  ON audit_exports (entity_type, generated_at DESC);

-- ── External reconciliation ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_recon_runs (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL,
  source          TEXT NOT NULL,        -- 'counterparty' | 'verra' | 'eskom' | …
  uploaded_csv_r2_key TEXT NOT NULL,
  row_count       INTEGER NOT NULL,
  matched_count   INTEGER NOT NULL DEFAULT 0,
  break_count     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','complete','failed')),
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at     TEXT,
  started_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_recon_runs_entity
  ON audit_recon_runs (entity_type, started_at DESC);

CREATE TABLE IF NOT EXISTS audit_recon_breaks (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  break_type    TEXT NOT NULL,           -- 'missing_in_ours' | 'missing_in_theirs' | 'field_mismatch'
  external_ref  TEXT,
  our_value     TEXT,                    -- canonical JSON of our row
  their_value   TEXT,                    -- canonical JSON of their row
  field         TEXT,                    -- which field differs (when break_type='field_mismatch')
  resolution    TEXT,                    -- 'open' | 'investigating' | 'accepted_ours' | 'accepted_theirs' | 'cancelled'
  resolution_notes TEXT,
  resolved_at   TEXT,
  resolved_by   TEXT,
  FOREIGN KEY (run_id) REFERENCES audit_recon_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_recon_breaks_run
  ON audit_recon_breaks (run_id);
