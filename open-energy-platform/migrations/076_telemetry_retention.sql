-- ════════════════════════════════════════════════════════════════════════
-- 076_telemetry_retention.sql — bound D1 storage via rollups + purge.
--
-- The 15-min om_telemetry stream is operationally useful but financially
-- expensive: a single 50 MW solar site with 30 inverters produces ~2.9M
-- rows/year. We collapse it to durable daily and weekly aggregates, then
-- purge the raw stream past 14 days. All historical analytics — PR/CUF
-- trends, opportunity detectors, lender packs — read from the rollups.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Per-day rollup: one row per (device, day) ──────────────────────────
CREATE TABLE IF NOT EXISTS om_telemetry_daily (
  device_id          TEXT NOT NULL,
  site_id            TEXT NOT NULL,
  day                TEXT NOT NULL,                  -- YYYY-MM-DD
  -- Energy
  kwh                REAL,
  ac_kw_avg          REAL,
  ac_kw_peak         REAL,
  -- Water
  flow_kl            REAL,
  pressure_bar_avg   REAL,
  level_m_end_of_day REAL,
  treated_kl         REAL,
  raw_kl             REAL,
  pump_kwh           REAL,
  -- Counts
  readings_n         INTEGER NOT NULL DEFAULT 0,
  -- Quality
  gap_minutes        INTEGER NOT NULL DEFAULT 0,
  -- Bookkeeping
  rolled_at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (device_id, day)
);
CREATE INDEX IF NOT EXISTS idx_om_telemetry_daily_site_day ON om_telemetry_daily(site_id, day);

-- ─── Per-week rollup: cheap dashboards over 2-5 years ──────────────────
CREATE TABLE IF NOT EXISTS om_telemetry_weekly (
  site_id           TEXT NOT NULL,
  iso_week          TEXT NOT NULL,                   -- YYYY-WW
  kwh               REAL,
  flow_kl           REAL,
  treated_kl        REAL,
  raw_kl            REAL,
  pump_kwh          REAL,
  capacity_factor   REAL,
  rolled_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (site_id, iso_week)
);

-- ─── Retention bookkeeping ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS om_retention_policy (
  k                   TEXT PRIMARY KEY,
  raw_keep_days       INTEGER NOT NULL DEFAULT 14,    -- om_telemetry
  daily_keep_days     INTEGER NOT NULL DEFAULT 1825,  -- 5 years
  weekly_keep_days    INTEGER NOT NULL DEFAULT 3650,  -- 10 years
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO om_retention_policy (k) VALUES ('default');
