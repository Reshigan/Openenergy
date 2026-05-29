-- Wave 84 — Grid Black-Start Capability Contracting & System-Restoration Drill (P6).
-- The RESTORATION engine of the System Operator. SA Grid Code Sections OC-1 / OC-12
-- + NTCSA Grid-Code Annex on Black-Start + NERSA System Defence & Restoration Plan
-- + IEC 60870-5-101/104 + IEEE Std 1547 + NRS 048-2. Each contracted Black-Start
-- Capability (BSC) unit demonstrates readiness annually under a witnessed drill:
-- start on cranking power, energise dead bus, hold f/V, pick up aux load, backfeed
-- to SO restoration path within contracted window.
--
-- 12-state P6: needs_assessed -> solicitation_issued -> bid_evaluation
--   -> contract_awarded -> contract_executed -> drill_scheduled -> drill_in_progress
--   -> drill_completed -> recertified                                  (clean path).
--   drill_completed -> drill_failed -> remediation_required -> drill_scheduled (loop).
--   contract_terminated terminal from any non-terminal.
--
-- Tiers by black_start_capacity_mw: minor<50/standard<250/material<500/island_critical>=500.
-- FLOOR at material when voltage_class in (transmission/bulk) OR role=cranking_anchor.
--
-- URGENT SLA — larger BSC unit = tighter every window. Same family as W34/W50/W67/W75.
--
-- Reportability (RELIABILITY-driven signature):
--   fail_drill          crosses EVERY tier (W84 hard line).
--   terminate_contract  crosses EVERY tier (loss of restoration capability).
--   recertify           crosses material+island_critical.
--   require_remediation crosses material+island_critical.
--   sla_breached        crosses material+island_critical.
--
-- Single SO desk write {admin, support, grid_operator}. actor_party records the
-- functional owner per step (system_operator / bsc_provider / drill_observer /
-- restoration_planner), not the JWT role.

CREATE TABLE IF NOT EXISTS oe_black_start_capabilities (
  id                              TEXT PRIMARY KEY,
  capability_number               TEXT UNIQUE NOT NULL,

  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  system_operator_id              TEXT NOT NULL,
  system_operator_name            TEXT NOT NULL,
  bsc_provider_id                 TEXT,
  bsc_provider_name               TEXT,
  facility_id                     TEXT,
  facility_name                   TEXT,

  province                        TEXT,
  restoration_zone                TEXT,
  voltage_class                   TEXT NOT NULL CHECK (voltage_class IN (
    'distribution','sub_transmission','transmission','bulk'
  )),
  restoration_role                TEXT NOT NULL CHECK (restoration_role IN (
    'cranking_anchor','restoration_unit','auxiliary_unit'
  )),
  cranking_source                 TEXT NOT NULL CHECK (cranking_source IN (
    'hydro','diesel_starter','battery_inverter','compressed_air'
  )),
  black_start_capacity_mw         REAL NOT NULL DEFAULT 0,
  target_capacity_mw              REAL DEFAULT 0,
  cranking_time_target_minutes    INTEGER DEFAULT 0,
  backfeed_time_target_minutes    INTEGER DEFAULT 0,

  capability_tier                 TEXT NOT NULL CHECK (capability_tier IN (
    'minor','standard','material','island_critical'
  )),
  is_system_critical              INTEGER NOT NULL DEFAULT 0,

  contract_ref                    TEXT,
  contract_value_zar              REAL DEFAULT 0,
  contract_start_at               TEXT,
  contract_end_at                 TEXT,

  drill_scheduled_at              TEXT,
  drill_window_minutes            INTEGER DEFAULT 0,
  drill_commenced_at              TEXT,
  drill_completed_at              TEXT,
  last_drill_at                   TEXT,
  drills_passed_count             INTEGER NOT NULL DEFAULT 0,
  drills_total_count              INTEGER NOT NULL DEFAULT 0,
  consecutive_failures            INTEGER NOT NULL DEFAULT 0,

  zone_provinces_represented      INTEGER NOT NULL DEFAULT 0,
  zone_voltage_classes_covered    INTEGER NOT NULL DEFAULT 0,
  zone_fuel_hydro_count           INTEGER NOT NULL DEFAULT 0,
  zone_fuel_diesel_count          INTEGER NOT NULL DEFAULT 0,
  zone_fuel_battery_count         INTEGER NOT NULL DEFAULT 0,
  zone_fuel_compressed_air_count  INTEGER NOT NULL DEFAULT 0,

  cranking_source_confirmed_flag  INTEGER NOT NULL DEFAULT 0,
  dead_bus_energisation_flag      INTEGER NOT NULL DEFAULT 0,
  frequency_hold_flag             INTEGER NOT NULL DEFAULT 0,
  voltage_hold_flag               INTEGER NOT NULL DEFAULT 0,
  auxiliary_load_pickup_flag      INTEGER NOT NULL DEFAULT 0,
  backfeed_within_sla_flag        INTEGER NOT NULL DEFAULT 0,

  restoration_coverage_ratio      REAL DEFAULT 0,
  geographic_diversity_index      REAL DEFAULT 0,
  fuel_diversity_index            REAL DEFAULT 0,
  voltage_class_coverage          REAL DEFAULT 0,
  drill_pass_rate                 REAL DEFAULT 0,
  restoration_path_valid_flag     INTEGER NOT NULL DEFAULT 0,
  criticality_score               INTEGER NOT NULL DEFAULT 0,
  predicted_lifecycle_days        INTEGER DEFAULT 0,

  solicitation_issued_flag        INTEGER NOT NULL DEFAULT 0,
  contract_awarded_flag           INTEGER NOT NULL DEFAULT 0,
  contract_executed_flag          INTEGER NOT NULL DEFAULT 0,
  drill_scheduled_flag            INTEGER NOT NULL DEFAULT 0,
  drill_completed_flag            INTEGER NOT NULL DEFAULT 0,
  recertified_flag                INTEGER NOT NULL DEFAULT 0,
  drill_failed_flag               INTEGER NOT NULL DEFAULT 0,
  remediation_required_flag       INTEGER NOT NULL DEFAULT 0,
  terminated_flag                 INTEGER NOT NULL DEFAULT 0,

  last_action_ref                 TEXT,
  regulator_ref                   TEXT,

  chain_basis                     TEXT,
  reason_code                     TEXT,
  capability_summary              TEXT,

  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'needs_assessed','solicitation_issued','bid_evaluation','contract_awarded',
    'contract_executed','drill_scheduled','drill_in_progress','drill_completed',
    'recertified','drill_failed','remediation_required','contract_terminated'
  )),
  needs_assessed_at               TEXT NOT NULL,
  solicitation_issued_at          TEXT,
  bid_evaluation_at               TEXT,
  contract_awarded_at             TEXT,
  contract_executed_at            TEXT,
  drill_scheduled_status_at       TEXT,
  drill_in_progress_at            TEXT,
  drill_completed_status_at       TEXT,
  recertified_at                  TEXT,
  drill_failed_at                 TEXT,
  remediation_required_at         TEXT,
  contract_terminated_at          TEXT,

  is_reportable                   INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,

  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_bsc_status     ON oe_black_start_capabilities(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_bsc_tier       ON oe_black_start_capabilities(capability_tier);
CREATE INDEX IF NOT EXISTS idx_oe_bsc_role       ON oe_black_start_capabilities(restoration_role);
CREATE INDEX IF NOT EXISTS idx_oe_bsc_voltage    ON oe_black_start_capabilities(voltage_class);
CREATE INDEX IF NOT EXISTS idx_oe_bsc_cranking   ON oe_black_start_capabilities(cranking_source);
CREATE INDEX IF NOT EXISTS idx_oe_bsc_zone       ON oe_black_start_capabilities(restoration_zone);
CREATE INDEX IF NOT EXISTS idx_oe_bsc_assessed   ON oe_black_start_capabilities(needs_assessed_at);
CREATE INDEX IF NOT EXISTS idx_oe_bsc_sla        ON oe_black_start_capabilities(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_black_start_capabilities_events (
  id                 TEXT PRIMARY KEY,
  capability_id      TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_bsc_events_c    ON oe_black_start_capabilities_events(capability_id);
CREATE INDEX IF NOT EXISTS idx_oe_bsc_events_type ON oe_black_start_capabilities_events(event_type);
