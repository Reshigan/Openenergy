-- Migration 385: GoldRush site accrual ledger
--
-- Tracks three value streams per inverter station per hour:
--   1. carbon_tco2e  — tCO₂e avoided (kwh × SA grid intensity)
--   2. revenue_zar   — fund revenue   (kwh × tariff_rate)
--   3. savings_zar   — customer savings (kwh × customer_tariff_rate)
--
-- On first sync, kwh_delta covers full lifetime generation (backfill from 0).
-- Subsequent hourly runs use delta from previous snapshot.
--
-- SA Eskom grid emission factor default: 950 gCO₂e/kWh (DEFF 2023 gazette).
-- Customer tariff default: 2.50 ZAR/kWh (typical C&I Megaflex rate).

-- Extend manufacturer_credentials with customer tariff + carbon intensity
ALTER TABLE manufacturer_credentials
  ADD COLUMN customer_tariff_rate_zar_per_kwh REAL;   -- what customer pays grid (ZAR/kWh)

ALTER TABLE manufacturer_credentials
  ADD COLUMN carbon_intensity_gco2_per_kwh REAL NOT NULL DEFAULT 950; -- gCO₂e/kWh

-- Hourly accrual ledger
CREATE TABLE IF NOT EXISTS site_accruals (
  id                       TEXT PRIMARY KEY,
  station_id               TEXT NOT NULL REFERENCES solax_stations(id) ON DELETE CASCADE,
  site_id                  TEXT REFERENCES om_sites(id) ON DELETE SET NULL,
  participant_id           TEXT NOT NULL,
  period_hour              TEXT NOT NULL,   -- ISO8601 UTC truncated to hour: "2026-06-04T07:00:00Z"
  kwh_delta                REAL NOT NULL DEFAULT 0,     -- kWh generated in this period
  cumulative_kwh           REAL NOT NULL DEFAULT 0,     -- total_kwh snapshot at end of period
  carbon_tco2e             REAL NOT NULL DEFAULT 0,     -- tCO₂e avoided this period
  revenue_zar              REAL NOT NULL DEFAULT 0,     -- ZAR revenue to fund
  savings_zar              REAL NOT NULL DEFAULT 0,     -- ZAR savings for customer
  tariff_rate_used         REAL,                        -- snapshot of fund tariff used
  customer_tariff_rate_used REAL,                       -- snapshot of customer tariff used
  carbon_intensity_used    REAL,                        -- gCO₂e/kWh used
  is_backfill              INTEGER NOT NULL DEFAULT 0,  -- 1 if this is the historical catch-up row
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_accruals_station_hour
  ON site_accruals(station_id, period_hour);

CREATE INDEX IF NOT EXISTS idx_site_accruals_site
  ON site_accruals(site_id);

CREATE INDEX IF NOT EXISTS idx_site_accruals_participant
  ON site_accruals(participant_id);

CREATE INDEX IF NOT EXISTS idx_site_accruals_period
  ON site_accruals(period_hour DESC);
