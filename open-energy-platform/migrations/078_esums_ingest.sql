-- ════════════════════════════════════════════════════════════════════════
-- 078 · Esums native ingestion — per-site ingest keys + connector run log
--
-- Purpose: lets devices, gateways, and CSV uploads push readings into
-- om_telemetry WITHOUT a user JWT. The /api/esums/ingest/* router checks
-- the bearer token against om_ingest_keys.token_hash (SHA-256 hex) and
-- enforces site scoping, so a leaked key only exposes the assigned site.
--
-- om_connector_runs records every batch (push, csv upload, scheduled poll)
-- so operators can debug ingestion problems from the Live tab UI.
--
-- Both tables are idempotent (IF NOT EXISTS); safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS om_ingest_keys (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL,
  label           TEXT NOT NULL,
  token_hash      TEXT NOT NULL UNIQUE,    -- SHA-256 of the raw token, hex
  token_prefix    TEXT NOT NULL,           -- first 8 chars of raw, for UI list
  scope           TEXT NOT NULL DEFAULT 'write_telemetry',  -- write_telemetry | write_faults | full
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at    TEXT,
  use_count       INTEGER NOT NULL DEFAULT 0,
  expires_at      TEXT,
  revoked         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_om_ingest_keys_site ON om_ingest_keys(site_id);
CREATE INDEX IF NOT EXISTS idx_om_ingest_keys_hash ON om_ingest_keys(token_hash);

CREATE TABLE IF NOT EXISTS om_connector_runs (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL,
  source          TEXT NOT NULL,            -- 'api_push' | 'csv_upload' | 'modbus_poll' | 'sungrow_cloud' | …
  ingest_key_id   TEXT,                     -- null for authenticated uploads
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at     TEXT,
  status          TEXT NOT NULL DEFAULT 'running',  -- running | ok | partial | failed
  rows_received   INTEGER NOT NULL DEFAULT 0,
  rows_written    INTEGER NOT NULL DEFAULT 0,
  rows_rejected   INTEGER NOT NULL DEFAULT 0,
  first_ts        TEXT,                     -- min(ts) of accepted rows
  last_ts         TEXT,                     -- max(ts) of accepted rows
  error_sample    TEXT,                     -- first error message if rejected > 0
  metadata        TEXT                      -- JSON: filename, sha256, user_agent, etc.
);
CREATE INDEX IF NOT EXISTS idx_om_connector_runs_site_started ON om_connector_runs(site_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_om_connector_runs_status      ON om_connector_runs(status);
