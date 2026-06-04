-- Migration 384: tariff rate per manufacturer credential + solax stations
-- Allows per-participant per-manufacturer energy tariff so ZAR revenue
-- can be derived from kWh telemetry without a separate billing system.

ALTER TABLE manufacturer_credentials
  ADD COLUMN tariff_rate_zar_per_kwh REAL;

ALTER TABLE solax_stations
  ADD COLUMN tariff_rate_zar_per_kwh REAL;
