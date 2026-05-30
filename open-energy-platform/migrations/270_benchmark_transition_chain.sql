-- Wave 90 — Trader JIBAR Cessation Benchmark Transition & Fallback chain (P6).
--
-- Per-contract benchmark transition lifecycle for the JIBAR -> ZARONIA
-- migration mandated by SARB MPG Reform Plan. One row per IBOR-referencing
-- contract (IRS, basis swap, FRA, syndicated loan, FRN, structured note,
-- cross-currency swap). The chain governs inventory -> impact assessment
-- -> fallback classification -> counterparty notification -> response
-- -> bilateral amendment drafting + execution -> value-transfer settlement
-- -> transitioned_clean (terminal). Branches: disputed / on_hold (loop back
-- to classified on resolve). Terminal alternatives: terminated_legacy
-- (counterparty refuses repapering — ALWAYS regulator-crossing under SARB
-- MPG transition-failure reporting) / cancelled (pre-execution withdraw).
--
-- 12-state P6 lifecycle:
--   inventoried -> impact_assessed -> classified -> notified -> responded
--     -> amendment_drafted -> amendment_executed -> vt_settled
--     -> transitioned_clean (terminal)
--   open(class/notified/responded/amendment_*) -> raise_dispute -> disputed
--     -> resolve_dispute -> classified
--   open(impact/class/notified/responded/amendment_drafted) -> place_on_hold
--     -> on_hold -> resume -> classified
--   class/notified/responded/amendment_drafted/disputed/on_hold
--     -> terminate_legacy -> terminated_legacy (terminal)
--   inventoried / impact_assessed -> cancel -> cancelled (terminal)
--
-- Tier RE-DERIVED on every transition from absolute notional_zar
-- (interbank or <30d-to-cessation floors at material):
--   minor      < R10m
--   standard   < R100m
--   material   < R1bn
--   systemic   >= R1bn
--
-- URGENT SLA — systemic = tightest. Same family as W34/W50/W67/W75/W84/W85.
--
-- TRANSITION-INTEGRITY SIGNATURE (W90 hard line):
--   terminate_legacy        EVERY tier always (SARB MPG transition-failure
--                           hard line; sister of W85 write_off / W82 dispute /
--                           W84 fail_drill / W89 cancel_campaign).
--   complete_transition     material + systemic.
--   raise_dispute           systemic only (ISDA DC referral).
--   sla_breached            material + systemic.
--
-- Write {admin, trader}. actor_party tags whether the step represents
-- transition_desk / counterparty_credit / docs_legal / risk_validation
-- for audit attribution only, NOT access.

CREATE TABLE IF NOT EXISTS oe_benchmark_transitions (
  id                              TEXT PRIMARY KEY,
  transition_number               TEXT UNIQUE NOT NULL,

  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  -- Trade identity
  trade_ref                       TEXT NOT NULL,
  instrument_type                 TEXT NOT NULL CHECK (instrument_type IN (
    'irs','basis_swap','fra','syndicated_loan','frn','structured_note','cross_currency_swap'
  )),
  legacy_benchmark                TEXT NOT NULL CHECK (legacy_benchmark IN (
    'jibar_1m','jibar_3m','jibar_6m','jibar_12m'
  )),
  replacement_rate                TEXT CHECK (replacement_rate IN (
    'zaronia_overnight','compounded_zaronia_1m','compounded_zaronia_3m',
    'compounded_zaronia_6m','term_zaronia_1m','term_zaronia_3m','term_zaronia_6m'
  )),
  fallback_class                  TEXT CHECK (fallback_class IN (
    'isda_protocol','bilateral_amendment','tough_legacy','pre_cessation'
  )),

  -- Counterparty
  counterparty_id                 TEXT NOT NULL,
  counterparty_name               TEXT NOT NULL,
  counterparty_interbank          INTEGER NOT NULL DEFAULT 0,
  counterparty_nav_zar            REAL NOT NULL DEFAULT 0,

  -- Economics
  notional_zar                    REAL NOT NULL,
  remaining_years                 REAL NOT NULL DEFAULT 0,
  trade_start_at                  TEXT,
  trade_maturity_at               TEXT,
  cessation_date                  TEXT NOT NULL,
  zaronia_overnight               REAL NOT NULL DEFAULT 0,
  isda_spread_bps                 REAL NOT NULL DEFAULT 0,
  pv01_zar                        REAL NOT NULL DEFAULT 0,
  value_transfer_zar              REAL NOT NULL DEFAULT 0,
  compounded_zaronia_rate         REAL NOT NULL DEFAULT 0,
  hedge_effective_flag            INTEGER NOT NULL DEFAULT 1,
  protocol_adherence_flag         INTEGER NOT NULL DEFAULT 0,
  counterparty_response_pct       REAL NOT NULL DEFAULT 0,
  dispute_concentration           REAL NOT NULL DEFAULT 0,
  predicted_resolution_days       REAL,
  days_to_cessation               INTEGER,

  -- Tier (RE-DERIVED)
  transition_tier                 TEXT NOT NULL CHECK (transition_tier IN (
    'minor','standard','material','systemic'
  )),

  -- Lifecycle flags
  inventoried_flag                INTEGER NOT NULL DEFAULT 1,
  impact_assessed_flag            INTEGER NOT NULL DEFAULT 0,
  classified_flag                 INTEGER NOT NULL DEFAULT 0,
  notified_flag                   INTEGER NOT NULL DEFAULT 0,
  responded_flag                  INTEGER NOT NULL DEFAULT 0,
  amendment_drafted_flag          INTEGER NOT NULL DEFAULT 0,
  amendment_executed_flag         INTEGER NOT NULL DEFAULT 0,
  vt_settled_flag                 INTEGER NOT NULL DEFAULT 0,
  transitioned_clean_flag         INTEGER NOT NULL DEFAULT 0,
  disputed_flag                   INTEGER NOT NULL DEFAULT 0,
  on_hold_flag                    INTEGER NOT NULL DEFAULT 0,
  terminated_legacy_flag          INTEGER NOT NULL DEFAULT 0,
  cancelled_flag                  INTEGER NOT NULL DEFAULT 0,

  -- Refs
  last_action_ref                 TEXT,
  regulator_ref                   TEXT,
  transition_summary              TEXT,

  -- State machine
  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'inventoried','impact_assessed','classified','notified','responded',
    'amendment_drafted','amendment_executed','vt_settled','transitioned_clean',
    'disputed','on_hold','terminated_legacy','cancelled'
  )),
  inventoried_at                  TEXT NOT NULL,
  impact_assessed_at              TEXT,
  classified_at                   TEXT,
  notified_at                     TEXT,
  responded_at                    TEXT,
  amendment_drafted_at            TEXT,
  amendment_executed_at           TEXT,
  vt_settled_at                   TEXT,
  transitioned_clean_at           TEXT,
  disputed_at                     TEXT,
  on_hold_at                      TEXT,
  terminated_legacy_at            TEXT,
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

CREATE INDEX IF NOT EXISTS idx_oe_bxt_status        ON oe_benchmark_transitions(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_bxt_tier          ON oe_benchmark_transitions(transition_tier);
CREATE INDEX IF NOT EXISTS idx_oe_bxt_legacy        ON oe_benchmark_transitions(legacy_benchmark);
CREATE INDEX IF NOT EXISTS idx_oe_bxt_instrument    ON oe_benchmark_transitions(instrument_type);
CREATE INDEX IF NOT EXISTS idx_oe_bxt_cp            ON oe_benchmark_transitions(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_oe_bxt_reportable    ON oe_benchmark_transitions(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_bxt_sla           ON oe_benchmark_transitions(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_benchmark_transition_events (
  id                 TEXT PRIMARY KEY,
  transition_id      TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_bxt_events_t    ON oe_benchmark_transition_events(transition_id);
CREATE INDEX IF NOT EXISTS idx_oe_bxt_events_type ON oe_benchmark_transition_events(event_type);
