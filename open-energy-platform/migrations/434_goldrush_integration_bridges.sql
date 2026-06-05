-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 434 — Goldrush Integration Bridges
--
-- Extends solax_stations with offtaker and carbon project links,
-- and introduces two bridge tables for auto-generated carbon credits and
-- settlement invoices from Esums generation accruals.
--
-- Note: lender_participant_id and carbon_participant_id already exist on
-- solax_stations from a previous out-of-band migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. New participant link columns on solax_stations ───────────────────────
ALTER TABLE solax_stations ADD COLUMN offtaker_participant_id TEXT;
ALTER TABLE solax_stations ADD COLUMN carbon_project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_solax_stations_lender
  ON solax_stations(lender_participant_id);
CREATE INDEX IF NOT EXISTS idx_solax_stations_carbon
  ON solax_stations(carbon_participant_id);
CREATE INDEX IF NOT EXISTS idx_solax_stations_offtaker
  ON solax_stations(offtaker_participant_id);

-- ─── 2. esums_carbon_credits — generation-sourced carbon credits ─────────────
-- Tracks tCO2e generated per station per billing month.
-- Decoupled from carbon_holdings (which requires a formal carbon project).
-- Monthly roll-up: ON CONFLICT upserts accumulate kwh/tco2e within the month.

CREATE TABLE IF NOT EXISTS esums_carbon_credits (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES solax_stations(id),
  participant_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  kwh_generated REAL NOT NULL DEFAULT 0,
  carbon_tco2e REAL NOT NULL DEFAULT 0,
  carbon_intensity_gco2_per_kwh REAL NOT NULL DEFAULT 950,
  tariff_rate_zar_per_kwh REAL NOT NULL DEFAULT 0,
  revenue_zar REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'provisional'
    CHECK (status IN ('provisional', 'verified', 'retired', 'voided')),
  cascade_fired INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_esums_carbon_credits_station
  ON esums_carbon_credits(station_id, period_start);
CREATE INDEX IF NOT EXISTS idx_esums_carbon_credits_participant
  ON esums_carbon_credits(participant_id);
CREATE INDEX IF NOT EXISTS idx_esums_carbon_credits_status
  ON esums_carbon_credits(status);

-- ─── 3. esums_settlement_invoices — auto-generated settlement invoices ────────
-- Monthly invoices generated from site accruals.
-- from_participant_id = generation participant (station owner)
-- to_participant_id   = offtaker_participant_id on the station

CREATE TABLE IF NOT EXISTS esums_settlement_invoices (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES solax_stations(id),
  from_participant_id TEXT NOT NULL,
  to_participant_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  kwh_delivered REAL NOT NULL DEFAULT 0,
  tariff_rate_zar_per_kwh REAL NOT NULL DEFAULT 0,
  gross_revenue_zar REAL NOT NULL DEFAULT 0,
  vat_rate_pct REAL NOT NULL DEFAULT 15,
  vat_amount_zar REAL NOT NULL DEFAULT 0,
  total_zar REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'paid', 'disputed', 'voided')),
  invoice_number TEXT,
  issued_at TEXT,
  paid_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_esums_settlement_invoices_station
  ON esums_settlement_invoices(station_id, period_start);
CREATE INDEX IF NOT EXISTS idx_esums_settlement_invoices_from
  ON esums_settlement_invoices(from_participant_id);
CREATE INDEX IF NOT EXISTS idx_esums_settlement_invoices_to
  ON esums_settlement_invoices(to_participant_id);
CREATE INDEX IF NOT EXISTS idx_esums_settlement_invoices_status
  ON esums_settlement_invoices(status);

-- ─── 4. Seed: link Goldrush stations to demo_lender_001 ──────────────────────
-- NXT Energy participant: id_7c352b86da89907a85266a250e15db95
-- Lender: demo_lender_001 (GreenBank Africa — Thandi van der Merwe)

UPDATE solax_stations
SET lender_participant_id = 'demo_lender_001'
WHERE participant_id = 'id_7c352b86da89907a85266a250e15db95'
  AND (lender_participant_id IS NULL OR lender_participant_id = '');
