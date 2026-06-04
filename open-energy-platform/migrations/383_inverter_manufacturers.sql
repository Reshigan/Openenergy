-- Migration 383: Generic inverter manufacturer integration layer
--
-- Extends solax_stations into a manufacturer-agnostic device registry.
-- Each manufacturer (solax, solaredge, huawei, fronius, sungrow, victron, etc.)
-- gets its own API adapter but shares this common station table.
--
-- solax_stations (382) stays as-is for backward compat; this adds:
--   1. manufacturer column to solax_stations (default 'solax')
--   2. manufacturer_credentials table — per-participant OAuth/API-key store
--   3. manufacturer_api_log — last sync result per station

-- Add manufacturer discriminator to existing solax_stations table
ALTER TABLE solax_stations ADD COLUMN manufacturer TEXT NOT NULL DEFAULT 'solax';

CREATE INDEX IF NOT EXISTS idx_solax_stations_manufacturer
  ON solax_stations(participant_id, manufacturer);

-- Per-participant credentials for each manufacturer integration.
-- Credentials are stored encrypted-at-rest by Cloudflare D1's SQLite layer;
-- production deployments should additionally use wrangler secrets for the
-- platform-level defaults (SOLAX_CLIENT_ID, SOLAREDGE_API_KEY, etc.).
CREATE TABLE IF NOT EXISTS manufacturer_credentials (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  manufacturer    TEXT NOT NULL,   -- 'solax' | 'solaredge' | 'huawei' | 'fronius' | 'sungrow' | 'victron' | 'growatt' | 'deye' | 'sma'
  auth_type       TEXT NOT NULL,   -- 'oauth2_client_creds' | 'api_key' | 'basic' | 'token'
  -- OAuth2 client_credentials
  client_id       TEXT,
  client_secret   TEXT,
  -- API key / token
  api_key         TEXT,
  token           TEXT,
  -- Basic auth
  username        TEXT,
  password        TEXT,
  -- Cached access token (refreshed automatically)
  access_token    TEXT,
  token_expires_at TEXT,
  -- Integration config
  base_url        TEXT,            -- override default API base URL
  site_id         TEXT,            -- manufacturer-level portfolio/site ID
  extra_config    TEXT,            -- JSON: additional params (e.g. business_type)
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active','inactive','error')),
  last_tested_at  TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturer_creds_unique
  ON manufacturer_credentials(participant_id, manufacturer);

CREATE INDEX IF NOT EXISTS idx_manufacturer_creds_participant
  ON manufacturer_credentials(participant_id);

-- Normalised realtime snapshot per station — written by the sync/poll job.
-- Lets the frontend show "last known" values without hitting the upstream API.
CREATE TABLE IF NOT EXISTS station_telemetry_snapshot (
  station_id      TEXT PRIMARY KEY REFERENCES solax_stations(id) ON DELETE CASCADE,
  ts              TEXT NOT NULL,   -- ISO8601 UTC of the data point
  ac_kw           REAL,            -- AC output power, kW
  dc_kw           REAL,            -- DC input power, kW (PV side)
  daily_kwh       REAL,            -- Daily yield, kWh
  total_kwh       REAL,            -- Lifetime yield, kWh
  battery_soc     REAL,            -- Battery state of charge, % (null if no battery)
  temperature_c   REAL,            -- Inverter temperature, °C
  online          INTEGER NOT NULL DEFAULT 0,
  raw_json        TEXT,            -- Full manufacturer response (for debugging)
  updated_at      TEXT NOT NULL
);
