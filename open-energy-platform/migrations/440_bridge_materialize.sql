-- Migration 440: Ledger-first bridge materialisation
--
-- Principle: site_accruals is the immutable event ledger. All financial aggregations
-- (settlement invoices, carbon credits, carbon holdings) are materialized views that
-- are always derivable from it. This migration backfills 8+ months of real Goldrush
-- data (181,164 kWh / R231,890 / 172 tCO2e) into the financial layer.
--
-- Bridges materialised:
--   site_accruals  →  esums_settlement_invoices   (offtaker billing per station/month)
--   site_accruals  →  esums_carbon_credits         (tCO2e per station/month)
--   esums_carbon_credits  →  carbon_holdings        (annual vintage buckets for fund)

-- ─── 1. Carbon project record for the Goldrush C&I fleet ─────────────────────
-- Required FK for carbon_holdings. Goldrush 10-site fleet is registered as a
-- single VCS/ACM0002 project (grid-connected solar, <1 MWp each).
INSERT OR IGNORE INTO carbon_projects (
  id, project_name, project_number, project_type, methodology,
  host_country, developer_id, credits_issued, credits_available,
  credits_retired, status, registration_date, created_at, updated_at
) VALUES (
  'cp_goldrush_fleet',
  'NXT Energy Goldrush C&I Solar Fleet — 10 Sites (KZN & Gauteng)',
  'ZA-SOLAR-NXT-GR-001',
  'renewable_energy',
  'ACM0002',
  'ZA',
  'id_7c352b86da89907a85266a250e15db95',
  0, 0, 0,
  'active',
  '2024-03-01',
  datetime('now'), datetime('now')
);

-- ─── 2. Materialize esums_settlement_invoices from site_accruals ──────────────
-- One row per (station, calendar month). Past months → status='issued'.
-- Current month → status='draft' (pending issuance by NXT Energy).
-- tariff_rate taken from the accrual rows themselves (already computed at ingest).
-- issued_at = first of the following month for historical invoices.
INSERT OR REPLACE INTO esums_settlement_invoices (
  id, station_id, from_participant_id, to_participant_id,
  period_start, period_end, kwh_delivered,
  tariff_rate_zar_per_kwh, gross_revenue_zar, vat_rate_pct,
  vat_amount_zar, total_zar, status, invoice_number,
  issued_at, created_at, updated_at
)
SELECT
  'esi_' || sa.station_id || '_' || strftime('%Y-%m-01', sa.period_hour)  AS id,
  sa.station_id                                                           AS station_id,
  sa.participant_id                                                       AS from_participant_id,
  ss.offtaker_participant_id                                              AS to_participant_id,
  strftime('%Y-%m-01', sa.period_hour)                                   AS period_start,
  date(strftime('%Y-%m-01', sa.period_hour), '+1 month', '-1 day')       AS period_end,
  ROUND(SUM(sa.kwh_delta), 3)                                            AS kwh_delivered,
  MAX(sa.tariff_rate_used)                                               AS tariff_rate_zar_per_kwh,
  ROUND(SUM(sa.revenue_zar), 2)                                          AS gross_revenue_zar,
  15                                                                      AS vat_rate_pct,
  ROUND(SUM(sa.revenue_zar) * 0.15, 2)                                   AS vat_amount_zar,
  ROUND(SUM(sa.revenue_zar) * 1.15, 2)                                   AS total_zar,
  CASE
    WHEN strftime('%Y-%m', sa.period_hour) < strftime('%Y-%m', 'now')
    THEN 'issued'
    ELSE 'draft'
  END                                                                     AS status,
  CASE
    WHEN strftime('%Y-%m', sa.period_hour) < strftime('%Y-%m', 'now')
    THEN 'INV-NXT-' || strftime('%Y%m', sa.period_hour) || '-' || upper(substr(sa.station_id, -6, 4))
    ELSE NULL
  END                                                                     AS invoice_number,
  CASE
    WHEN strftime('%Y-%m', sa.period_hour) < strftime('%Y-%m', 'now')
    THEN date(strftime('%Y-%m-01', sa.period_hour), '+1 month')
    ELSE NULL
  END                                                                     AS issued_at,
  datetime('now')                                                        AS created_at,
  datetime('now')                                                        AS updated_at
FROM site_accruals sa
JOIN solax_stations ss ON ss.id = sa.station_id
WHERE sa.participant_id = 'id_7c352b86da89907a85266a250e15db95'
  AND ss.offtaker_participant_id IS NOT NULL
  AND ss.offtaker_participant_id != ''
  AND sa.kwh_delta > 0
GROUP BY sa.station_id, strftime('%Y-%m', sa.period_hour)
HAVING SUM(sa.kwh_delta) > 0;

-- ─── 3. Materialize esums_carbon_credits from site_accruals ──────────────────
-- One row per (station, calendar month). Past months → status='verified'.
-- Current month → status='provisional'.
INSERT OR REPLACE INTO esums_carbon_credits (
  id, station_id, participant_id, period_start, period_end,
  kwh_generated, carbon_tco2e, carbon_intensity_gco2_per_kwh,
  tariff_rate_zar_per_kwh, revenue_zar, status, created_at, updated_at
)
SELECT
  'ecc_' || sa.station_id || '_' || strftime('%Y-%m-01', sa.period_hour) AS id,
  sa.station_id                                                          AS station_id,
  ss.carbon_participant_id                                               AS participant_id,
  strftime('%Y-%m-01', sa.period_hour)                                  AS period_start,
  date(strftime('%Y-%m-01', sa.period_hour), '+1 month', '-1 day')      AS period_end,
  ROUND(SUM(sa.kwh_delta), 3)                                           AS kwh_generated,
  ROUND(SUM(sa.carbon_tco2e), 6)                                        AS carbon_tco2e,
  MAX(sa.carbon_intensity_used)                                         AS carbon_intensity_gco2_per_kwh,
  MAX(sa.tariff_rate_used)                                              AS tariff_rate_zar_per_kwh,
  ROUND(SUM(sa.revenue_zar), 2)                                         AS revenue_zar,
  CASE
    WHEN strftime('%Y-%m', sa.period_hour) < strftime('%Y-%m', 'now')
    THEN 'verified'
    ELSE 'provisional'
  END                                                                    AS status,
  datetime('now')                                                       AS created_at,
  datetime('now')                                                       AS updated_at
FROM site_accruals sa
JOIN solax_stations ss ON ss.id = sa.station_id
WHERE sa.participant_id = 'id_7c352b86da89907a85266a250e15db95'
  AND ss.carbon_participant_id IS NOT NULL
  AND ss.carbon_participant_id != ''
  AND sa.carbon_tco2e > 0
GROUP BY sa.station_id, strftime('%Y-%m', sa.period_hour)
HAVING SUM(sa.carbon_tco2e) > 0;

-- ─── 4. Update carbon_project totals ─────────────────────────────────────────
UPDATE carbon_projects
SET
  credits_issued    = (
    SELECT ROUND(COALESCE(SUM(sa.carbon_tco2e), 0), 6)
    FROM site_accruals sa
    JOIN solax_stations ss ON ss.id = sa.station_id
    WHERE sa.participant_id = 'id_7c352b86da89907a85266a250e15db95'
      AND ss.carbon_participant_id IS NOT NULL
      AND ss.carbon_participant_id != ''
  ),
  credits_available = (
    SELECT ROUND(COALESCE(SUM(sa.carbon_tco2e), 0), 6)
    FROM site_accruals sa
    JOIN solax_stations ss ON ss.id = sa.station_id
    WHERE sa.participant_id = 'id_7c352b86da89907a85266a250e15db95'
      AND ss.carbon_participant_id IS NOT NULL
      AND ss.carbon_participant_id != ''
  ),
  updated_at = datetime('now')
WHERE id = 'cp_goldrush_fleet';

-- ─── 5. Bridge carbon credits → carbon_holdings (annual vintage buckets) ─────
-- Aggregates all tCO2e per vintage year into a single holding per year.
-- project_id = cp_goldrush_fleet; credit_type = VER (Voluntary Emission Reduction).
-- cost_basis = 0 (developer-originated credits, not purchased on market).
INSERT OR REPLACE INTO carbon_holdings (
  id, participant_id, project_id, credit_type, quantity,
  vintage_year, acquisition_date, cost_basis, status
)
SELECT
  'ch_demo_carbon_001_goldrush_' || strftime('%Y', sa.period_hour)       AS id,
  ss.carbon_participant_id                                               AS participant_id,
  'cp_goldrush_fleet'                                                    AS project_id,
  'VER'                                                                  AS credit_type,
  ROUND(SUM(sa.carbon_tco2e), 6)                                        AS quantity,
  CAST(strftime('%Y', sa.period_hour) AS INTEGER)                       AS vintage_year,
  date(strftime('%Y', sa.period_hour) || '-12-31')                      AS acquisition_date,
  0.0                                                                    AS cost_basis,
  'available'                                                            AS status
FROM site_accruals sa
JOIN solax_stations ss ON ss.id = sa.station_id
WHERE sa.participant_id = 'id_7c352b86da89907a85266a250e15db95'
  AND ss.carbon_participant_id IS NOT NULL
  AND ss.carbon_participant_id != ''
  AND sa.carbon_tco2e > 0
GROUP BY ss.carbon_participant_id, strftime('%Y', sa.period_hour)
HAVING SUM(sa.carbon_tco2e) > 0;
