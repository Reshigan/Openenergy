-- W211: Grid Transformer / Substation Asset Lifecycle
-- NERSA Grid Code Chapter 3 + NRS 048-2 + IEC 60076 + NRS 097
CREATE TABLE IF NOT EXISTS oe_substation_assets (
  id                       TEXT PRIMARY KEY,
  participant_id           TEXT NOT NULL,   -- grid operator (NTCSA/Eskom/MV distributor)

  -- Asset identity
  asset_number             TEXT NOT NULL UNIQUE,  -- utility asset tag
  asset_type               TEXT NOT NULL CHECK(asset_type IN (
    'power_transformer','auto_transformer','instrument_transformer',
    'circuit_breaker','disconnector','busbar','cable','overhead_line',
    'reactor','capacitor_bank','substation_battery','protection_relay'
  )),
  asset_tier               TEXT NOT NULL CHECK(asset_tier IN (
    'distribution','subtransmission','transmission','critical_node'
  )),
  name                     TEXT NOT NULL,
  location_name            TEXT,
  gps_latitude             REAL,
  gps_longitude            REAL,
  voltage_kv               REAL,
  rated_mva                REAL,
  manufacturer             TEXT,
  model                    TEXT,
  serial_number            TEXT,
  year_manufactured        INTEGER,

  -- Service history
  commissioned_at          TEXT,
  last_assessed_at         TEXT,
  condition_score          REAL CHECK(condition_score BETWEEN 0 AND 10 OR condition_score IS NULL),
  age_years                INTEGER,
  expected_life_years      INTEGER DEFAULT 40,
  remaining_life_years     INTEGER,

  -- Refurbishment
  refurbishment_type       TEXT,            -- minor/major/rewind/replacement
  refurbishment_cost_zar   REAL,
  refurbishment_started_at TEXT,
  refurbishment_completed_at TEXT,

  -- Decommission
  decommission_reason      TEXT CHECK(decommission_reason IN ('end_of_life','failure','replacement','stranded_asset',NULL)),
  decommissioned_at        TEXT,

  -- Failure
  failure_mode             TEXT,
  failure_reported_at      TEXT,
  failure_investigation_ref TEXT,

  chain_status             TEXT NOT NULL DEFAULT 'registered' CHECK(chain_status IN (
    'registered','commissioning','energised','condition_assessment',
    'assessment_complete','refurbishment_planned','out_of_service',
    'refurbishment','returned_to_service','decommission_decision',
    'decommissioned','failed'
  )),
  sla_deadline             TEXT NOT NULL,
  sla_breached             INTEGER NOT NULL DEFAULT 0,
  regulator_notified       INTEGER NOT NULL DEFAULT 0,

  actor_id                 TEXT,
  reason                   TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sas_status
  ON oe_substation_assets(chain_status);

CREATE INDEX IF NOT EXISTS idx_sas_participant
  ON oe_substation_assets(participant_id);

CREATE INDEX IF NOT EXISTS idx_sas_tier
  ON oe_substation_assets(asset_tier);
