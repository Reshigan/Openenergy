-- Wave 102 — Esums Plant Soiling, Cleaning Authorisation & Recovery-Gain
-- Audit chain (P6). PV soiling is one of the single biggest controllable
-- production losses on a South African solar plant. W102 is the soiling
-- audit + cleaning authorisation chain: periodic soiling-ratio measurement
-- (reference cell + dirty/clean pair), inspection record (visual + IR +
-- drone fly-over evidence), economic assessment (lost MWh tariff vs cleaning
-- ZAR + water m3), cleaning authorisation gate (water restrictions,
-- neighbour notices, DFFE conditions), field cleaning execution by
-- contractor, post-clean PR-delta validation, settled audit ledger feeding
-- W79 generation revenue assurance, and a counterparty dispute branch.
-- Beats NTT Data Soiling Maps + Power Factors Drive Soiling + AlsoEnergy
-- Soiling Loss Index + 3E SynaptiQ Soiling + Above Surveying drone IR +
-- Heliolytics aerial PV + Atonometrics RSE-1 + DEWA-RTC + DroneDeploy by
-- making soiling a 12-state P6 chain with auto-tier, urgency-band SLA,
-- water-restriction gate, cleaning-ROI ledger, regulator crossings on
-- skipped-cleanings for >=50MW plants, and a 4-step authority ladder.
--
-- 12-state P6 lifecycle:
--   soiling_period_open -> schedule_inspection -> inspection_scheduled
--     -> record_inspection -> field_inspected
--       -> measure_soiling -> soiling_measured
--         -> assess_economics -> economic_assessment_done
--           -> authorize_cleaning -> cleaning_authorized
--             -> start_cleaning -> cleaning_in_progress
--               -> complete_cleaning -> post_clean_measured
--                 -> measure_post_clean -> gain_validated
--                   -> settle_audit / validate_gain -> settled (terminal)
--   soiling_measured / economic_assessment_done / gain_validated
--     -> raise_dispute -> disputed -> resolve_dispute -> economic_assessment_done
--   any non-terminal -> cancel_audit -> cancelled (terminal)
--
-- Tier RE-DERIVED on every transition from current soiling_ratio_pct:
--   minor    : soiling_ratio < 2 %
--   standard : 2 % <= soiling_ratio < 4 %
--   material : 4 % <= soiling_ratio < 8 %
--   severe   : soiling_ratio >= 8 %
-- FLOOR-AT-MATERIAL on any of: rainy_season_window_strict,
-- post_dust_storm_event, neighbour_complaint_filed, water_restriction_active.
--
-- URGENT SLA polarity (higher soiling band = TIGHTER windows). Production-
-- loss + neighbour-impact family (W34/W50/W51/W67/W75/W84/W85/W86/W87/W88).
--
-- SIGNATURE (W102 - NERSA REIPPPP production reporting + DFFE water-use):
--   raise_dispute        -> regulator EVERY tier (production-loss dispute is
--                           always reportable -> W102 signature)
--   cancel_audit         -> regulator EVERY tier on material+severe
--   authorize_cleaning   -> regulator EVERY tier when water_consumption_m3
--                           >= 100 OR installed_capacity_mw >= 50
--   sla_breached         -> material + severe
--
-- Write {admin, support}. Read all 9 personas. actor_party functional:
-- site_supervisor, cleaning_contractor, plant_owner, regulator_observer.

CREATE TABLE IF NOT EXISTS oe_soiling_audit (
  id                                  TEXT PRIMARY KEY,
  audit_number                        TEXT UNIQUE NOT NULL,

  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,

  facility_id                         TEXT NOT NULL,
  facility_name                       TEXT,
  plant_owner_party_id                TEXT,
  plant_owner_party_name              TEXT,
  installed_capacity_mw               REAL,
  technology                          TEXT,
  site_region                         TEXT,

  period_opened_at                    TEXT,
  period_label                        TEXT,
  inspection_method                   TEXT,
  evidence_photo_uploaded             INTEGER NOT NULL DEFAULT 0,

  soiling_ratio_pct                   REAL NOT NULL DEFAULT 0,
  baseline_ratio_pct                  REAL,
  days_since_baseline                 INTEGER,
  soiling_velocity_pct_per_day        REAL,
  expected_pr_clean_pct               REAL,
  current_pr_dirty_pct                REAL,
  pr_loss_pct                         REAL,
  peak_sun_hours_per_day              REAL,
  mwh_loss_per_day                    REAL,
  tariff_zar_per_mwh                  REAL,
  zar_loss_per_day                    REAL,
  zar_loss_to_date                    REAL,

  cleaning_method                     TEXT,
  cleaning_cost_zar                   REAL,
  water_consumption_m3                REAL,
  recovery_horizon_days               INTEGER,
  cleaning_roi_ratio                  REAL,
  days_to_breakeven                   REAL,

  post_clean_pr_pct                   REAL,
  recovered_zar                       REAL,
  recovery_documented                 INTEGER NOT NULL DEFAULT 0,

  rainy_season_window_strict          INTEGER NOT NULL DEFAULT 0,
  post_dust_storm_event               INTEGER NOT NULL DEFAULT 0,
  neighbour_complaint_filed           INTEGER NOT NULL DEFAULT 0,
  water_restriction_active            INTEGER NOT NULL DEFAULT 0,

  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'minor','standard','material','severe'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'site_supervisor','plant_manager','asset_director','cfo'
  )),

  dispute_count                       INTEGER NOT NULL DEFAULT 0,
  cancel_count                        INTEGER NOT NULL DEFAULT 0,

  parent_audit_id                     TEXT,
  prior_audit_id                      TEXT,
  regulator_ref                       TEXT,
  cleaning_contractor_id              TEXT,
  cleaning_contractor_name            TEXT,
  wul_licence_ref                     TEXT,

  title                               TEXT,
  narrative                           TEXT,
  result_text                         TEXT,
  disputed_reason                     TEXT,
  cancelled_reason                    TEXT,
  reason_code                         TEXT,

  current_ball_in_court_party         TEXT,
  last_responder_party                TEXT,
  supervisor_party                    TEXT,
  contractor_party                    TEXT,
  owner_party                         TEXT,

  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'soiling_period_open','inspection_scheduled','field_inspected',
    'soiling_measured','economic_assessment_done','cleaning_authorized',
    'cleaning_in_progress','post_clean_measured','gain_validated',
    'settled','disputed','cancelled'
  )),
  soiling_period_opened_at            TEXT,
  inspection_scheduled_at             TEXT,
  field_inspected_at                  TEXT,
  soiling_measured_at                 TEXT,
  economic_assessment_done_at         TEXT,
  cleaning_authorized_at              TEXT,
  cleaning_in_progress_at             TEXT,
  post_clean_measured_at              TEXT,
  gain_validated_at                   TEXT,
  settled_at                          TEXT,
  disputed_at                         TEXT,
  cancelled_at                        TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  regulator_crossed_at                TEXT,
  regulator_inbox_ref                 TEXT,
  sla_deadline_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_soil_status    ON oe_soiling_audit(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_soil_tier      ON oe_soiling_audit(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_soil_facility  ON oe_soiling_audit(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_soil_owner     ON oe_soiling_audit(plant_owner_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_soil_sla       ON oe_soiling_audit(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_soil_ball      ON oe_soiling_audit(current_ball_in_court_party);
CREATE INDEX IF NOT EXISTS idx_oe_soil_rain      ON oe_soiling_audit(rainy_season_window_strict);
CREATE INDEX IF NOT EXISTS idx_oe_soil_dust      ON oe_soiling_audit(post_dust_storm_event);
CREATE INDEX IF NOT EXISTS idx_oe_soil_neighbour ON oe_soiling_audit(neighbour_complaint_filed);
CREATE INDEX IF NOT EXISTS idx_oe_soil_water     ON oe_soiling_audit(water_restriction_active);

CREATE TABLE IF NOT EXISTS oe_soiling_audit_events (
  id                  TEXT PRIMARY KEY,
  audit_id            TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_soil_events_a    ON oe_soiling_audit_events(audit_id);
CREATE INDEX IF NOT EXISTS idx_oe_soil_events_type ON oe_soiling_audit_events(event_type);
