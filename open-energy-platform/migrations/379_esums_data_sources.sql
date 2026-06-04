-- Migration 379: Esums data source connections
-- Each row is one sensor, inverter bank, MQTT broker, or REST API that
-- feeds telemetry into a site. Credential fields stored in config_json
-- (application-level encryption responsibility).

CREATE TABLE IF NOT EXISTS esums_data_sources (
  id                   TEXT PRIMARY KEY,
  participant_id       TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  site_id              TEXT REFERENCES om_sites(id) ON DELETE SET NULL,
  label                TEXT NOT NULL,
  source_type          TEXT NOT NULL CHECK (source_type IN (
                         'modbus_tcp','sunspec','modbus_rtu_ip',
                         'mqtt','rest_api','opc_ua','push_ingest')),
  -- TCP/IP fields (modbus_tcp, sunspec, modbus_rtu_ip, opc_ua)
  host                 TEXT,
  port                 INTEGER,
  unit_id              INTEGER,         -- Modbus unit ID 1–247
  -- MQTT fields
  topic_prefix         TEXT,
  -- REST API fields
  api_url              TEXT,
  api_method           TEXT DEFAULT 'GET',
  api_auth_type        TEXT DEFAULT 'none', -- none | bearer | basic | api_key
  api_json_path        TEXT,             -- dot-path to reading value
  -- Common
  polling_interval_sec INTEGER DEFAULT 60,
  status               TEXT NOT NULL DEFAULT 'inactive'
                         CHECK (status IN ('inactive','active','error','testing')),
  last_read_at         TEXT,
  last_error           TEXT,
  config_json          TEXT NOT NULL DEFAULT '{}',
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_esums_ds_participant ON esums_data_sources(participant_id);
CREATE INDEX IF NOT EXISTS idx_esums_ds_site ON esums_data_sources(site_id);
