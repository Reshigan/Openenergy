-- Wave 87 — Offtaker PPA Scheduled-Energy Nomination & Deviation Settlement (P6).
-- The daily/monthly operational pulse of any PPA. The offtaker submits a
-- day-ahead nomination, the seller confirms, intra-day revisions may post,
-- delivery happens, meter data flows, deviation is reconciled and SETTLED
-- against the deviation tariff. Excused branches catch force-majeure /
-- curtailment relief; dispute branch crosses into the regulator.
--
-- 12-state P6 lifecycle:
--   nomination_window_open -> da_nominated -> da_confirmed -> delivery_in_progress
--     -> delivery_complete -> meter_data_received -> reconciled -> deviation_settled (terminal)
--   da_confirmed -> id_revised (re-entrant) -> close_gate -> delivery_in_progress
--   da_nominated -> reject_da -> nomination_window_open  (renominate loop)
--   reconciled -> raise_dispute -> dispute_raised -> resolve_dispute -> reconciled
--   any non-terminal -> excuse_period -> excused           (terminal)
--   nomination_window_open / da_nominated -> cancel -> cancelled  (terminal)
--
-- Tier RE-DERIVED on every transition from absolute deviation pct:
--   minor    |dev| <  5%   (well within tolerance)
--   standard 5% <= |dev| < 10%
--   material 10% <= |dev| < 20%
--   major   |dev| >= 20%  (severe — grid balance concern)
--
-- URGENT SLA — larger deviation = tighter window. Same family as W34/W50/W67/
-- W75/W84/W85/W86 day-operations URGENT band.
--
-- Reportability (NOMINATION-INTEGRITY signature — W87 hard line):
--   raise_dispute    crosses EVERY tier   — PPA disputes always to NERSA s30.
--   excuse_period    material + major     — large excused volumes reportable.
--   settle_deviation material + major     — large penalty settlements disclosed.
--   sla_breached     material + major.
--
-- Write {admin, offtaker}. actor_party tags the function performing each step
-- (offtaker / seller / system_operator / independent_meter) for audit
-- attribution only, NOT access.

CREATE TABLE IF NOT EXISTS oe_ppa_nominations (
  id                              TEXT PRIMARY KEY,
  nomination_number               TEXT UNIQUE NOT NULL,

  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  ppa_id                          TEXT NOT NULL,
  ppa_reference                   TEXT NOT NULL,
  offtaker_id                     TEXT NOT NULL,
  offtaker_name                   TEXT NOT NULL,
  seller_id                       TEXT NOT NULL,
  seller_name                     TEXT NOT NULL,
  facility_id                     TEXT NOT NULL,
  facility_name                   TEXT NOT NULL,
  system_operator_id              TEXT,
  system_operator_name            TEXT,
  meter_operator_id               TEXT,
  meter_operator_name             TEXT,

  -- Period
  delivery_period_label           TEXT NOT NULL,
  delivery_period_start           TEXT NOT NULL,
  delivery_period_end             TEXT NOT NULL,
  delivery_period_hours           INTEGER NOT NULL DEFAULT 744,
  installed_capacity_mw           REAL NOT NULL DEFAULT 0,

  -- Nomination + delivery
  da_nominated_mwh                REAL NOT NULL DEFAULT 0,
  id_revised_mwh                  REAL,
  effective_nominated_mwh         REAL NOT NULL DEFAULT 0,
  metered_mwh                     REAL,

  -- Deviation analytics
  signed_deviation_mwh            REAL NOT NULL DEFAULT 0,
  absolute_deviation_mwh          REAL NOT NULL DEFAULT 0,
  absolute_deviation_pct          REAL NOT NULL DEFAULT 0,
  weather_attributable_pct        REAL NOT NULL DEFAULT 0,
  prior_pct_1                     REAL,
  prior_pct_2                     REAL,
  prior_pct_3                     REAL,

  -- Tariffs (ZAR / MWh)
  ppa_tariff_zar_per_mwh          REAL NOT NULL DEFAULT 0,
  deviation_tariff_zar_per_mwh    REAL NOT NULL DEFAULT 0,
  penalty_tariff_zar_per_mwh      REAL NOT NULL DEFAULT 0,

  -- Settlement (ZAR)
  contract_value_zar              REAL NOT NULL DEFAULT 0,
  deviation_value_zar             REAL NOT NULL DEFAULT 0,
  predicted_penalty_zar           REAL NOT NULL DEFAULT 0,
  settled_amount_zar              REAL,

  -- Excuse / dispute
  excuse_reason                   TEXT,
  excuse_evidence_ref             TEXT,
  dispute_ground                  TEXT,
  dispute_resolution_ref          TEXT,
  id_revision_count               INTEGER NOT NULL DEFAULT 0,

  -- Tier (RE-DERIVED)
  deviation_tier                  TEXT NOT NULL CHECK (deviation_tier IN ('minor','standard','material','major')),

  -- Lifecycle flags
  da_nominated_flag               INTEGER NOT NULL DEFAULT 0,
  da_confirmed_flag               INTEGER NOT NULL DEFAULT 0,
  id_revised_flag                 INTEGER NOT NULL DEFAULT 0,
  delivery_in_progress_flag       INTEGER NOT NULL DEFAULT 0,
  delivery_complete_flag          INTEGER NOT NULL DEFAULT 0,
  meter_data_flag                 INTEGER NOT NULL DEFAULT 0,
  reconciled_flag                 INTEGER NOT NULL DEFAULT 0,
  dispute_flag                    INTEGER NOT NULL DEFAULT 0,
  settled_flag                    INTEGER NOT NULL DEFAULT 0,
  excused_flag                    INTEGER NOT NULL DEFAULT 0,
  cancelled_flag                  INTEGER NOT NULL DEFAULT 0,

  -- Refs
  last_action_ref                 TEXT,
  regulator_ref                   TEXT,
  chain_basis                     TEXT,
  reason_code                     TEXT,
  nomination_summary              TEXT,

  -- State machine
  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'nomination_window_open','da_nominated','da_confirmed','id_revised',
    'delivery_in_progress','delivery_complete','meter_data_received','reconciled',
    'dispute_raised','deviation_settled','excused','cancelled'
  )),
  nomination_window_open_at       TEXT NOT NULL,
  da_nominated_at                 TEXT,
  da_confirmed_at                 TEXT,
  id_revised_at                   TEXT,
  delivery_in_progress_at         TEXT,
  delivery_complete_at            TEXT,
  meter_data_received_at          TEXT,
  reconciled_at                   TEXT,
  dispute_raised_at               TEXT,
  deviation_settled_at            TEXT,
  excused_at                      TEXT,
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

CREATE INDEX IF NOT EXISTS idx_oe_ppa_nominations_status      ON oe_ppa_nominations(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_nominations_tier        ON oe_ppa_nominations(deviation_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_nominations_ppa         ON oe_ppa_nominations(ppa_id);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_nominations_offtaker    ON oe_ppa_nominations(offtaker_id);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_nominations_seller      ON oe_ppa_nominations(seller_id);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_nominations_facility    ON oe_ppa_nominations(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_nominations_reportable  ON oe_ppa_nominations(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_nominations_sla         ON oe_ppa_nominations(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_ppa_nomination_events (
  id                 TEXT PRIMARY KEY,
  nomination_id      TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ppa_nom_events_n    ON oe_ppa_nomination_events(nomination_id);
CREATE INDEX IF NOT EXISTS idx_oe_ppa_nom_events_type ON oe_ppa_nomination_events(event_type);
