-- W204: Offtaker SLB KPI & Sustainability-Linked PPA Ratchet
-- ICMA SLB Principles 2023 + JSE Sustainability Rules + NERSA ERA §4
CREATE TABLE IF NOT EXISTS oe_slb_kpi_ratchets (
  id                      TEXT PRIMARY KEY,
  participant_id          TEXT NOT NULL,
  ppa_ref                 TEXT,          -- reference to oe_ppa_contracts or W22
  slb_tier                TEXT NOT NULL CHECK(slb_tier IN ('voluntary','green_finance','listed','regulatory')),
  kpi_period              TEXT NOT NULL, -- e.g. "2026-Q2"
  period_start            TEXT NOT NULL,
  period_end              TEXT NOT NULL,

  -- KPI targets
  kpi_name                TEXT,          -- e.g. "RE percentage" or "Carbon intensity gCO2/kWh"
  kpi_target_value        REAL,
  kpi_unit                TEXT,          -- "%", "gCO2/kWh", "MWh"

  -- Actuals
  kpi_actual_value        REAL,
  kpi_data_source         TEXT,          -- "solax_api", "metering", "manual"
  kpi_measured_at         TEXT,

  -- Verification
  verifier_name           TEXT,
  verifier_report_ref     TEXT,
  verified_at             TEXT,
  kpi_met                 INTEGER,       -- 0/1/null

  -- Ratchet quantum
  ratchet_basis_points    REAL,          -- coupon step in bps
  ratchet_zar             REAL,          -- or ZAR equivalent
  ratchet_direction       TEXT CHECK(ratchet_direction IN ('step_up','step_down','neutral') OR ratchet_direction IS NULL),

  -- Dispute / arbitration
  dispute_ref             TEXT,
  arbitration_ref         TEXT,
  arbitration_outcome     TEXT,

  -- Disagreement
  dispute_description     TEXT,

  chain_status            TEXT NOT NULL DEFAULT 'kpi_pending' CHECK(chain_status IN (
    'kpi_pending','kpi_measurement','kpi_verification','kpi_certified',
    'ratchet_calculation','ratchet_agreed','ratchet_disputed','arbitration',
    'ratchet_applied','ratchet_waived','kpi_missed','withdrawn'
  )),
  sla_deadline            TEXT NOT NULL,
  sla_breached            INTEGER NOT NULL DEFAULT 0,
  regulator_notified      INTEGER NOT NULL DEFAULT 0,

  actor_id                TEXT,
  reason                  TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_slb_kpi_period
  ON oe_slb_kpi_ratchets(participant_id, kpi_period)
  WHERE ppa_ref IS NULL;

CREATE INDEX IF NOT EXISTS idx_slb_kpi_status
  ON oe_slb_kpi_ratchets(chain_status);

CREATE INDEX IF NOT EXISTS idx_slb_kpi_participant
  ON oe_slb_kpi_ratchets(participant_id);
