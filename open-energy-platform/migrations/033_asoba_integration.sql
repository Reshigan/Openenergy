-- ════════════════════════════════════════════════════════════════════════
-- 033 · ASOBA Cloud (Ona) integration
--
-- Backs the new /api/ona/asoba/* live proxy routes:
--   - ona_asoba_telemetry: per-asset 5-min telemetry pulled from ASOBA
--   - ona_asoba_alerts:    OODA fault feed pulled from ASOBA
--   - adds `source` column to ona_faults so synced ASOBA alerts can be
--     distinguished from manually-logged faults in the cockpit.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ona_asoba_telemetry (
  site_id     TEXT NOT NULL,
  asset_id    TEXT NOT NULL,
  timestamp   TEXT NOT NULL,
  power       REAL,
  kwh         REAL,
  run_state   TEXT,
  error_code  TEXT,
  synced_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (site_id, asset_id, timestamp)
);
CREATE INDEX IF NOT EXISTS idx_asoba_telemetry_site_ts ON ona_asoba_telemetry(site_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS ona_asoba_alerts (
  site_id            TEXT NOT NULL,
  terminal_device_id TEXT NOT NULL,
  timestamp          TEXT NOT NULL,
  severity           TEXT,
  alert_type         TEXT,
  description        TEXT,
  synced_at          TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (site_id, terminal_device_id, timestamp)
);
CREATE INDEX IF NOT EXISTS idx_asoba_alerts_site_ts ON ona_asoba_alerts(site_id, timestamp DESC);

-- Add `source` to ona_faults so ASOBA-derived faults are flagged.
-- D1 doesn't support IF NOT EXISTS on ALTER TABLE — wrap in a check via
-- pragma table_info wouldn't be portable, so we just attempt the ALTER and
-- accept the migration will fail-noisy if rerun on an upgraded DB. SQLite
-- ignores duplicate ALTER columns by raising — but we run migrations once.
ALTER TABLE ona_faults ADD COLUMN source TEXT DEFAULT 'manual';
