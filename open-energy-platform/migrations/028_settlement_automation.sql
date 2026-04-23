-- 028_settlement_automation.sql
-- Event-driven settlement + real-time meter ingest scaffolding.
--
-- Concepts:
--   1. Settlement runs — deterministic, idempotent job that walks
--      metering_readings + active PPAs to generate invoices for a period.
--   2. Meter ingest channels — config per connection for SCADA/MQTT/HTTPS push.
--   3. Ingest sessions — track open SCADA sessions and last-seen timestamps.
--   4. Dead-letter queue for settlement errors so they can be retried.

-- ─── Settlement runs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlement_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL CHECK (run_type IN (
    'ppa_energy','wheeling','imbalance','ancillary','adhoc'
  )),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  initiated_by TEXT REFERENCES participants(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
    'running','completed','failed','partial','cancelled'
  )),
  contracts_considered INTEGER DEFAULT 0,
  invoices_generated INTEGER DEFAULT 0,
  total_value_zar REAL DEFAULT 0,
  error_message TEXT,
  idempotency_key TEXT UNIQUE            -- prevents double-runs for the same period/type
);
CREATE INDEX IF NOT EXISTS idx_sr_period ON settlement_runs(period_start DESC, run_type);
CREATE INDEX IF NOT EXISTS idx_sr_status ON settlement_runs(status);

CREATE TABLE IF NOT EXISTS settlement_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES settlement_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,             -- 'contract_processed','invoice_created','error','warning'
  entity_type TEXT,
  entity_id TEXT,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sre_run ON settlement_run_events(run_id, created_at);

CREATE TABLE IF NOT EXISTS settlement_dlq (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES settlement_runs(id),
  contract_id TEXT,
  period_start TEXT,
  period_end TEXT,
  error_message TEXT NOT NULL,
  error_context_json TEXT,
  attempt_count INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','retrying','resolved','abandoned')),
  last_attempt_at TEXT,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES participants(id),
  resolution_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sdlq_status ON settlement_dlq(status);

-- ─── Meter ingest channels ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meter_ingest_channels (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,          -- references grid_connections(id); kept loose for external connections
  channel_type TEXT NOT NULL CHECK (channel_type IN (
    'scada_mqtt','scada_opc_ua','https_push','sftp','manual','modbus'
  )),
  endpoint_url TEXT,
  auth_method TEXT,                     -- 'mtls','hmac','bearer','ip_allowlist'
  auth_ref_kv_key TEXT,                 -- KV key for credentials (never in DB)
  protocol_version TEXT,
  sampling_interval_seconds INTEGER DEFAULT 60,
  expected_points_per_day INTEGER,
  last_received_at TEXT,
  last_error_at TEXT,
  last_error_message TEXT,
  health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy','degraded','offline','unknown')),
  enabled BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mic_connection ON meter_ingest_channels(connection_id);
CREATE INDEX IF NOT EXISTS idx_mic_health ON meter_ingest_channels(health_status);

-- ─── Meter ingest sessions (per-connection streams) ────────────────────────
CREATE TABLE IF NOT EXISTS meter_ingest_sessions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES meter_ingest_channels(id),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  points_received INTEGER DEFAULT 0,
  bytes_received INTEGER DEFAULT 0,
  peer_ip TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','closed','errored'))
);
CREATE INDEX IF NOT EXISTS idx_mis_channel ON meter_ingest_sessions(channel_id, opened_at DESC);

-- ─── Raw ingest buffer (for replay and validation) ─────────────────────────
-- Keeps the raw payload as received before validation/normalisation writes
-- to metering_readings. Rows older than 30 days should be archived to R2.
CREATE TABLE IF NOT EXISTS meter_ingest_raw (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES meter_ingest_channels(id),
  session_id TEXT REFERENCES meter_ingest_sessions(id),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  timestamp_utc TEXT,                  -- payload timestamp, if declared
  raw_payload TEXT NOT NULL,
  normalised BOOLEAN DEFAULT 0,
  normalised_reading_id TEXT,
  normalisation_error TEXT,
  hash_sha256 TEXT                     -- dedupe key
);
CREATE INDEX IF NOT EXISTS idx_mir_channel ON meter_ingest_raw(channel_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mir_normalised ON meter_ingest_raw(normalised);
CREATE INDEX IF NOT EXISTS idx_mir_hash ON meter_ingest_raw(hash_sha256);
