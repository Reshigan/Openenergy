-- migrations/postgres/001_metering_schema.sql
-- Postgres schema for the high-volume metering tables. Reached via
-- Cloudflare Hyperdrive (binding: HYPERDRIVE_DB).
--
-- This is the target schema for the national-scale migration described in
-- docs/runbooks/data-tier-scaling-plan.md. Tables are partitioned by
-- RANGE on reading_date so 40k meters × 48 half-hours × 365 days doesn't
-- hammer a single heap. Partitions are monthly.
--
-- Apply with:
--   psql "$HYPERDRIVE_PG_URL" -f migrations/postgres/001_metering_schema.sql
--
-- The Workers code writes via `env.HYPERDRIVE_DB` (see
-- src/utils/hyperdrive.ts). During the cut-over the D1 `metering_readings`
-- stays in dual-write mode for 2 weeks; afterwards the D1 copy is dropped.

BEGIN;

-- Partitioned parent table. Declarative partitioning keeps SELECT and
-- INSERT simple — Postgres routes to the correct partition on date range.
CREATE TABLE IF NOT EXISTS metering_readings (
  id               TEXT PRIMARY KEY,
  connection_id    TEXT NOT NULL,
  reading_date     TIMESTAMPTZ NOT NULL,
  export_kwh       DOUBLE PRECISION,
  import_kwh       DOUBLE PRECISION,
  peak_demand_kw   DOUBLE PRECISION,
  power_factor     DOUBLE PRECISION,
  reading_type     TEXT NOT NULL DEFAULT 'actual'
    CHECK (reading_type IN ('actual','estimated','adjusted')),
  validated        BOOLEAN NOT NULL DEFAULT FALSE,
  ona_ingested     BOOLEAN NOT NULL DEFAULT FALSE,
  source           TEXT,       -- ingest channel id
  tenant_id        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (reading_date);

CREATE INDEX IF NOT EXISTS idx_mr_conn_date
  ON metering_readings (connection_id, reading_date DESC);
CREATE INDEX IF NOT EXISTS idx_mr_tenant_date
  ON metering_readings (tenant_id, reading_date DESC);

-- Seed partitions for the current and prior 12 months. A scheduled job
-- (pg_partman or a simple cron) extends the window forward each month.
DO $$
DECLARE
  month_start DATE;
  partition_name TEXT;
  i INT;
BEGIN
  FOR i IN -12..3 LOOP
    month_start := date_trunc('month', NOW())::DATE + (i || ' months')::INTERVAL;
    partition_name := format('metering_readings_%s', to_char(month_start, 'YYYY_MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF metering_readings
         FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      month_start,
      (month_start + INTERVAL '1 month')::DATE
    );
  END LOOP;
END $$;

-- Ingest raw buffer stays in D1 (small, append-only, used for dedup).
-- Only normalised readings live here. The Workers ingest endpoint writes
-- both — raw to D1, normalised here.

-- Daily rollup table (also replicated from D1 via the existing cron).
CREATE TABLE IF NOT EXISTS metering_readings_daily (
  id               TEXT PRIMARY KEY,
  connection_id    TEXT NOT NULL,
  reading_day      DATE NOT NULL,
  month_bucket     CHAR(7) NOT NULL,
  total_export_kwh DOUBLE PRECISION DEFAULT 0,
  total_import_kwh DOUBLE PRECISION DEFAULT 0,
  max_peak_demand_kw DOUBLE PRECISION,
  avg_power_factor   DOUBLE PRECISION,
  reading_count    INTEGER DEFAULT 0,
  validated_count  INTEGER DEFAULT 0,
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, reading_day)
);
CREATE INDEX IF NOT EXISTS idx_mrd_conn_month
  ON metering_readings_daily (connection_id, month_bucket DESC);

COMMIT;
