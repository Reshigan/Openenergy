-- Wave 88 — Esums BESS State-of-Health Monitoring & Capacity-Augmentation Programme (P6).
-- Every grid-connected BESS in SA carries a contractual capacity guarantee (SOH floor).
-- Capacity fades through calendar + cycle ageing. Once SOH dips below the contracted
-- floor the operator owes either an AUGMENTATION (install fresh modules to top up) or
-- a financial make-good. W88 is the live 12-state chain for that lifecycle.
--
-- 12-state P6 lifecycle:
--   baseline_set -> monitoring_active -> drift_detected -> assessment_pending
--     -> augmentation_required -> augmentation_planned -> augmentation_in_progress
--     -> augmentation_complete -> recommissioned (terminal)
--   drift_detected / assessment_pending / augmentation_required -> raise_dispute
--     -> disputed -> resolve_dispute -> assessment_pending
--   monitoring_active / drift_detected / assessment_pending / augmentation_required
--     / augmentation_planned / augmentation_in_progress / augmentation_complete
--     / disputed -> decommission -> decommissioned (terminal)
--   baseline_set -> cancel_programme -> cancelled (terminal)
--
-- Tier RE-DERIVED on every transition from current_soh_pct vs contractual_floor_pct:
--   nominal  soh >= floor + 10
--   watch    floor + 5  <= soh < floor + 10
--   material floor      <= soh < floor + 5    (close to breach)
--   critical soh < floor                      (contractual breach)
--
-- URGENT SLA — lower SOH band = tighter window. Same family as W34/W50/W51/W67/W75/
-- W84/W85/W86/W87 security-of-supply URGENT band.
--
-- Reportability (SECURITY-OF-SUPPLY signature — W88 hard line):
--   require_augmentation EVERY tier when installed_capacity_mw >= 50 MW
--                        (NERSA Grid Code threshold), heavy tiers otherwise.
--   decommission         EVERY tier  — loss of grid capacity is always reportable.
--   raise_dispute        heavy tiers only.
--   sla_breached         heavy tiers.
--
-- Write {admin, support}. actor_party tags the function performing each step
-- (operator / oem / owner / regulator) for audit attribution only, NOT access.

CREATE TABLE IF NOT EXISTS oe_bess_soh (
  id                              TEXT PRIMARY KEY,
  programme_number                TEXT UNIQUE NOT NULL,

  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  bess_id                         TEXT NOT NULL,
  bess_reference                  TEXT NOT NULL,
  site_id                         TEXT NOT NULL,
  site_name                       TEXT NOT NULL,
  owner_id                        TEXT NOT NULL,
  owner_name                      TEXT NOT NULL,
  operator_id                     TEXT NOT NULL,
  operator_name                   TEXT NOT NULL,
  oem_id                          TEXT,
  oem_name                        TEXT,

  -- Asset
  installed_capacity_mw           REAL NOT NULL DEFAULT 0,
  nameplate_energy_mwh            REAL NOT NULL DEFAULT 0,
  duration_hours                  REAL NOT NULL DEFAULT 4,
  chemistry                       TEXT,
  commissioning_date              TEXT NOT NULL,
  years_in_service                REAL NOT NULL DEFAULT 0,

  -- SOH window
  baseline_soh_pct                REAL NOT NULL DEFAULT 100,
  current_soh_pct                 REAL NOT NULL DEFAULT 100,
  contractual_floor_pct           REAL NOT NULL DEFAULT 70,
  end_of_life_threshold_pct       REAL NOT NULL DEFAULT 50,
  warranty_end_date               TEXT,
  warranty_years_remaining        REAL NOT NULL DEFAULT 0,

  -- Cycling
  total_throughput_mwh            REAL NOT NULL DEFAULT 0,
  equivalent_full_cycles          REAL NOT NULL DEFAULT 0,
  avg_depth_of_discharge_pct      REAL NOT NULL DEFAULT 0,
  avg_c_rate                      REAL NOT NULL DEFAULT 0,
  avg_cell_temperature_c          REAL NOT NULL DEFAULT 25,
  cycle_fade_attribution_pct      REAL NOT NULL DEFAULT 50,
  annualised_fade_rate_pct        REAL NOT NULL DEFAULT 0,

  -- Augmentation economics
  capacity_shortfall_mwh          REAL NOT NULL DEFAULT 0,
  augmentation_capex_per_kwh      REAL NOT NULL DEFAULT 6500,
  augmentation_capex_zar          REAL NOT NULL DEFAULT 0,
  capacity_rate_per_mw_year       REAL NOT NULL DEFAULT 1200000,
  capacity_payment_at_risk_zar    REAL NOT NULL DEFAULT 0,
  discount_rate_pct               REAL NOT NULL DEFAULT 12,
  residual_warranty_years         REAL NOT NULL DEFAULT 0,
  augmentation_npv_zar            REAL NOT NULL DEFAULT 0,
  augmentation_works_ref          TEXT,
  augmentation_completed_mwh      REAL,

  -- Dispute
  dispute_ground                  TEXT,
  dispute_resolution_ref          TEXT,
  warranty_recovery_eligible      INTEGER NOT NULL DEFAULT 0,
  warranty_recovery_amount_zar    REAL,

  -- Tier (RE-DERIVED)
  soh_tier                        TEXT NOT NULL CHECK (soh_tier IN ('nominal','watch','material','critical')),

  -- Lifecycle flags
  monitoring_active_flag          INTEGER NOT NULL DEFAULT 0,
  drift_detected_flag             INTEGER NOT NULL DEFAULT 0,
  assessment_flag                 INTEGER NOT NULL DEFAULT 0,
  augmentation_required_flag      INTEGER NOT NULL DEFAULT 0,
  augmentation_planned_flag       INTEGER NOT NULL DEFAULT 0,
  works_started_flag              INTEGER NOT NULL DEFAULT 0,
  works_completed_flag            INTEGER NOT NULL DEFAULT 0,
  recommissioned_flag             INTEGER NOT NULL DEFAULT 0,
  dispute_flag                    INTEGER NOT NULL DEFAULT 0,
  decommissioned_flag             INTEGER NOT NULL DEFAULT 0,
  cancelled_flag                  INTEGER NOT NULL DEFAULT 0,

  -- Refs
  last_action_ref                 TEXT,
  regulator_ref                   TEXT,
  programme_basis                 TEXT,
  reason_code                     TEXT,
  programme_summary               TEXT,

  -- State machine
  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'baseline_set','monitoring_active','drift_detected','assessment_pending',
    'augmentation_required','augmentation_planned','augmentation_in_progress',
    'augmentation_complete','recommissioned','disputed','decommissioned','cancelled'
  )),
  baseline_set_at                 TEXT NOT NULL,
  monitoring_active_at            TEXT,
  drift_detected_at               TEXT,
  assessment_pending_at           TEXT,
  augmentation_required_at        TEXT,
  augmentation_planned_at         TEXT,
  augmentation_in_progress_at     TEXT,
  augmentation_complete_at        TEXT,
  recommissioned_at               TEXT,
  disputed_at                     TEXT,
  decommissioned_at               TEXT,
  cancelled_at                    TEXT,

  -- Audit / SLA
  is_reportable                   INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,

  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_status      ON oe_bess_soh(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_tier        ON oe_bess_soh(soh_tier);
CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_bess        ON oe_bess_soh(bess_id);
CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_site        ON oe_bess_soh(site_id);
CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_owner       ON oe_bess_soh(owner_id);
CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_operator    ON oe_bess_soh(operator_id);
CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_reportable  ON oe_bess_soh(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_sla         ON oe_bess_soh(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_bess_soh_events (
  id                 TEXT PRIMARY KEY,
  programme_id       TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_events_p    ON oe_bess_soh_events(programme_id);
CREATE INDEX IF NOT EXISTS idx_oe_bess_soh_events_type ON oe_bess_soh_events(event_type);
