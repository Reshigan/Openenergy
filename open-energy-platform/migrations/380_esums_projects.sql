-- Migration 380: Esums project layer
-- Groups om_sites under a named project so large portfolios can be isolated
-- into per-project D1 shards (ESUMS_DB_<shard_key>) or queried as a unit.
-- shard_key must be lowercase alphanumeric + underscore, max 32 chars.

CREATE TABLE IF NOT EXISTS esums_projects (
  id           TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  -- Lowercase token used as the DB binding suffix when this project is
  -- sharded: bind "ESUMS_DB_<shard_key>" in wrangler.toml.
  -- NULL means the project lives in the main DB (default).
  shard_key    TEXT UNIQUE,
  -- Denormalised counters kept fresh by application logic
  site_count   INTEGER NOT NULL DEFAULT 0,
  total_capacity_kw REAL NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','archived')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_esums_projects_participant
  ON esums_projects(participant_id);

-- Add project FK to om_sites. Existing rows get NULL (project = main shard).
ALTER TABLE om_sites ADD COLUMN project_id TEXT REFERENCES esums_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_om_sites_project ON om_sites(project_id);

-- Telemetry dedicated table for the ESUMS_TELEMETRY_DB shard.
-- Identical schema to om_telemetry in the main DB; lives in its own D1
-- so hot ingest doesn't contend with core business tables.
-- When ESUMS_TELEMETRY_DB is not bound, callers fall back to om_telemetry
-- in the main DB (same INSERT/SELECT surface).
CREATE TABLE IF NOT EXISTS esums_telemetry (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  site_id           TEXT NOT NULL,
  project_id        TEXT,
  ts                TEXT NOT NULL,
  ac_kw             REAL,
  dc_kw             REAL,
  yield_kwh         REAL,
  interval_kwh      REAL,
  voltage_v         REAL,
  current_a         REAL,
  frequency_hz      REAL,
  temperature_c     REAL,
  irradiance_w_m2   REAL,
  status_code       TEXT,
  quality           TEXT NOT NULL DEFAULT 'valid'
);

-- The two most common access patterns:
--   1. Recent readings for one device (sparklines, live dashboard)
--   2. Site-level aggregations for a time window
CREATE INDEX IF NOT EXISTS idx_esums_tel_device_ts
  ON esums_telemetry(device_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_esums_tel_site_ts
  ON esums_telemetry(site_id, ts DESC);
