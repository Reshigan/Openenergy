-- 513 — Resumable SolaX history backfill jobs + per-station tariff step.
--
-- The historic import pulls SolaX device history one ~7-day chunk at a time
-- (12h API cap → 11h windows), walking backward up to 2 years. A full
-- portfolio backfill can run for hours, so progress must survive across the
-- many short requests that drive it and be queryable for a frontend status
-- panel. One job row per station; the driver (frontend loop or cron drain)
-- advances cursor_end_ms backward each tick until window_start_ms is reached.
--
-- Idempotent: site_accruals upserts on (station_id, period_hour), so re-running
-- a chunk is safe; the job row only tracks progress.

CREATE TABLE IF NOT EXISTS solax_backfill_jobs (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  station_id      TEXT NOT NULL,
  device_sn       TEXT,
  plant_name      TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  window_start_ms INTEGER NOT NULL,                -- oldest instant to fetch (ms epoch)
  run_end_ms      INTEGER NOT NULL,                -- newest instant (job creation - 1h)
  cursor_end_ms   INTEGER NOT NULL,                -- end of the NEXT chunk to process
  hours_written   INTEGER NOT NULL DEFAULT 0,
  kwh_total       REAL    NOT NULL DEFAULT 0,
  empty_streak    INTEGER NOT NULL DEFAULT 0,        -- consecutive empty chunks after data started; stops the walk at commissioning
  last_error      TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE(participant_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_backfill_jobs_participant ON solax_backfill_jobs(participant_id, status);

-- Per-station tariff step: PPA tariffs escalate (e.g. Goldrush R1.23/kWh stepping
-- to R1.3038 from 2026-04-01). On/after tariff_step_date, revenue_zar uses
-- tariff_step_rate instead of tariff_rate_zar_per_kwh. Both nullable; absent =
-- flat tariff_rate_zar_per_kwh for the whole history.
ALTER TABLE solax_stations ADD COLUMN tariff_step_date TEXT;
ALTER TABLE solax_stations ADD COLUMN tariff_step_rate REAL;
