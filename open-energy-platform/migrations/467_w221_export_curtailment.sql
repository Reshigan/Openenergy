-- W221: Esums Grid Export Curtailment & Compensation Claim
-- IEC 61724 / NERSA Grid Code §CSC-2 — plant-side curtailment compensation claim
CREATE TABLE IF NOT EXISTS oe_export_curtailments (
  id                        TEXT PRIMARY KEY,
  participant_id            TEXT NOT NULL,   -- Esums plant operator

  -- Curtailment classification
  curtailment_tier          TEXT NOT NULL CHECK(curtailment_tier IN (
    'minor','moderate','significant','systemic'
  )),
  curtailment_type          TEXT CHECK(curtailment_type IN (
    'network_congestion','load_management','emergency_curtailment',
    'planned_maintenance','frequency_deviation','voltage_violation',NULL
  )),

  -- Asset references
  site_id                   TEXT,            -- Esums site
  meter_id                  TEXT,            -- metering point
  so_curtailment_ref        TEXT,            -- System Operator curtailment reference
  ppa_ref                   TEXT,            -- PPA under which compensation due (W22)

  -- Curtailment event
  curtailment_start         TEXT,
  curtailment_end           TEXT,
  curtailment_duration_h    REAL,            -- hours of curtailment
  available_capacity_mw     REAL,            -- installed capacity available at curtailment
  actual_generation_mwh     REAL,            -- actual generation during period
  deemed_energy_mwh         REAL,            -- lost generation (deemed MWh)
  irradiance_ghi_kwh_m2     REAL,           -- measured irradiance for solar verification

  -- Claim financials
  tariff_rate_per_mwh       REAL,
  claim_amount_zar          REAL,
  compensation_paid_zar     REAL,
  settlement_ref            TEXT,

  -- Dispute
  dispute_grounds           TEXT,
  arbitration_ref           TEXT,
  rejection_reason          TEXT,

  chain_status              TEXT NOT NULL DEFAULT 'curtailment_detected' CHECK(chain_status IN (
    'curtailment_detected','notification_logged','energy_calculation','claim_prepared',
    'claim_submitted','under_review','disputed','arbitration',
    'settled','rejected','withdrawn','cancelled'
  )),
  sla_deadline              TEXT NOT NULL,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  regulator_notified        INTEGER NOT NULL DEFAULT 0,

  actor_id                  TEXT,
  reason                    TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ec_status
  ON oe_export_curtailments(chain_status);

CREATE INDEX IF NOT EXISTS idx_ec_participant
  ON oe_export_curtailments(participant_id);

CREATE INDEX IF NOT EXISTS idx_ec_site
  ON oe_export_curtailments(site_id);
