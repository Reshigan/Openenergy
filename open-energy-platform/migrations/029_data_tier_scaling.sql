-- 029_data_tier_scaling.sql
-- Data-tier scaling: partitioning + archival + shard-routing for the three
-- highest-volume tables:
--   1. metering_readings    → monthly table partitions, per-day summary
--   2. audit_logs           → R2 archive after 90 days, index stays in D1
--   3. ona_forecasts        → per-site rollup
--
-- Approach: we don't try to "partition" inside SQLite (it doesn't natively
-- support partitions). Instead:
--   - Add shard_key / bucket_month columns that route rows to sibling
--     tables when the platform scales out (metering_readings_2026_04,
--     metering_readings_2026_05, etc.).
--   - Add archive pointer tables that index rows persisted in R2.
--   - Add summary tables that the dashboards / regulator queries hit
--     instead of the raw fact tables.

-- ─── metering_readings monthly summary ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS metering_readings_daily (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  reading_day TEXT NOT NULL,           -- YYYY-MM-DD
  month_bucket TEXT NOT NULL,          -- YYYY-MM (covering index column)
  total_export_kwh REAL DEFAULT 0,
  total_import_kwh REAL DEFAULT 0,
  max_peak_demand_kw REAL,
  avg_power_factor REAL,
  reading_count INTEGER DEFAULT 0,
  validated_count INTEGER DEFAULT 0,
  last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (connection_id, reading_day)
);
CREATE INDEX IF NOT EXISTS idx_mrd_conn_month ON metering_readings_daily(connection_id, month_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_mrd_month ON metering_readings_daily(month_bucket DESC);

-- Archive pointer: after 12 months, the raw 30-min readings are gzipped
-- and uploaded to R2 under archive/metering/<year>/<month>/<connection>.json.gz
-- This table keeps a pointer so searches can still find historical data.
CREATE TABLE IF NOT EXISTS metering_readings_archives (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  month_bucket TEXT NOT NULL,          -- YYYY-MM
  r2_key TEXT NOT NULL,
  row_count INTEGER,
  bytes_compressed INTEGER,
  sha256 TEXT,
  archived_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mra_conn_month ON metering_readings_archives(connection_id, month_bucket DESC);

-- ─── audit_logs archival ───────────────────────────────────────────────────
-- Keep the last 90 days hot in audit_logs; move older rows to R2 with a
-- per-day manifest for fast lookup. Lives side-by-side with the existing
-- audit_logs table (unchanged).
CREATE TABLE IF NOT EXISTS audit_log_archives (
  id TEXT PRIMARY KEY,
  day_bucket TEXT NOT NULL,            -- YYYY-MM-DD
  r2_key TEXT NOT NULL,
  row_count INTEGER,
  bytes_compressed INTEGER,
  sha256 TEXT,
  earliest_created_at TEXT,
  latest_created_at TEXT,
  archived_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ala_day ON audit_log_archives(day_bucket DESC);

-- ─── ONA forecast rollups ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ona_forecast_summary (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  forecast_day TEXT NOT NULL,          -- YYYY-MM-DD the forecast is FOR
  day_ahead_mwh REAL,
  intra_day_mwh REAL,
  weekly_mwh REAL,
  actual_mwh REAL,
  variance_pct REAL,
  last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (site_id, forecast_day)
);
CREATE INDEX IF NOT EXISTS idx_ofs_day ON ona_forecast_summary(forecast_day DESC);

-- ─── Tenant quotas (enforced by middleware) ────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_rate_limits (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  route_prefix TEXT NOT NULL,          -- e.g. '/api/trading' or '*'
  window_seconds INTEGER NOT NULL,
  max_requests INTEGER NOT NULL,
  burst_capacity INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, route_prefix)
);

CREATE TABLE IF NOT EXISTS tenant_rate_limit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  route_prefix TEXT NOT NULL,
  window_start TEXT NOT NULL,
  denied_count INTEGER DEFAULT 0,
  allowed_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trle_tenant ON tenant_rate_limit_events(tenant_id, window_start DESC);

-- ─── Data tier snapshot (for admin monitoring) ─────────────────────────────
CREATE TABLE IF NOT EXISTS data_tier_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_at TEXT NOT NULL DEFAULT (datetime('now')),
  metering_rows INTEGER,
  metering_bytes INTEGER,
  audit_log_rows INTEGER,
  audit_log_bytes INTEGER,
  ona_forecast_rows INTEGER,
  archives_rows INTEGER,
  archives_bytes INTEGER,
  total_db_bytes INTEGER,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_dts_at ON data_tier_snapshots(snapshot_at DESC);
