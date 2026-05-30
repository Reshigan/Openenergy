-- Wave 107 - Trader Pre-Trade Credit Check & Settlement-Risk Exposure (P6).
-- 10th Trader chain. PRE-TRADE GATE upstream of W2 trading-risk, W9 MM
-- compliance, W29 position-limit, W36 best-execution, W44 trade-reporting,
-- W52 market-abuse, W60 algo-cert, W68 counterparty-margin, W76 trade-
-- allocation. The synchronous front-end every other Trader chain assumes
-- was cleared.
--
-- Beats Numerix CrossAsset Pre-Trade / Calypso Pre-Trade Limits / Bloomberg
-- AIM Pre-Trade Compliance / Murex MX.3 PFE / FIS Front Arena / OpenLink
-- Endur Pre-Deal / SAS Risk Management / Misys Kondor+ / Wall Street Systems
-- Front-Arena. These surface pre-trade as one large blocking rule-set
-- evaluator. W107 makes it a 12-state P6 chain with LIVE 14-field battery,
-- FLOOR-AT-MATERIAL tier overlay, URGENT sub-second SLA (systemic 500ms,
-- material 2s, standard 10s, micro 30s), 4-step authority ladder
-- (junior_trader -> desk_head -> market_risk_manager -> CRO), 3-bridge
-- architecture to W2 + W29 + W68, and signature regulator crossings.
--
-- Standards: FMA Ch.X section 50 + FSCA Conduct Standard 1/2020 +
-- BIS PFMI section 3.5 (CCP credit risk) + CFTC Reg 1.73 (clearing FCM
-- risk) + MiFID II Art 17 (algorithmic trading pre-trade controls).
--
-- 12-state P6 lifecycle plus branches:
--   order_submitted -> verify_kyc -> kyc_verified
--     -> check_credit_line -> credit_line_checked
--       -> assess_settlement_risk -> settlement_risk_assessed
--         -> check_concentration -> concentration_checked
--           -> verify_halt_status -> halt_status_verified
--             -> validate_mark_age -> mark_age_validated
--               -> clear_order -> cleared (soft terminal)
--                 -> archive_check -> archived (hard terminal)
--   any pre-clear gate -> reject_order -> rejected (soft terminal)
--   any pre-clear gate -> hold_for_review -> held_for_review
--     -> manually_clear -> manually_cleared -> clear_order -> cleared
--     OR manually_reject -> manually_rejected -> reject_order -> rejected
--   rejected -> override_rejection -> cleared (compliance override)
--
-- Tier RE-DERIVED on every transition from notional_exposure_zar:
--   micro    : <R1m
--   standard : R1m-R10m
--   material : R10m-R100m
--   systemic : >=R100m
-- FLOOR-AT-MATERIAL on any one of 5 floor flags. FLOOR-AT-SYSTEMIC on
-- cross_border_settlement OR counterparty_credit_grade_below_B.
--
-- URGENT SLA polarity (higher tier = TIGHTER, sub-second on order_submitted)
-- stored as sla_target_ms BIGINT for ms precision: systemic 500ms /
-- material 2s / standard 10s / micro 30s on order_submitted.
--
-- SIGNATURE regulator crossings (FMA Ch.X s50 + FSCA Conduct Standard
-- 1/2020 + BIS PFMI s3.5 + CFTC Reg 1.73 + MiFID II Art 17):
--   reject_order       -> regulator EVERY tier when
--                          counterparty_credit_grade_below_B=TRUE
--                          (B-grade hard line - W107 signature)
--   override_rejection -> regulator EVERY tier (compliance override is
--                          itself reportable)
--   hold_for_review    -> regulator material+systemic when SLA-triggered
--   sla_breached       -> regulator systemic only (BIS PFMI s3.5)
--
-- Write {admin, trader}. Read all 9 personas. actor_party derived from
-- action: trader / risk_system / compliance / archiver.

CREATE TABLE IF NOT EXISTS oe_pretrade_credit_check (
  id                                                  TEXT PRIMARY KEY,
  check_number                                        TEXT UNIQUE NOT NULL,

  order_ref                                           TEXT NOT NULL,
  trader_party_id                                     TEXT NOT NULL,
  trader_party_name                                   TEXT,
  counterparty_id                                     TEXT NOT NULL,
  counterparty_name                                   TEXT,
  desk                                                TEXT,
  venue                                               TEXT,
  product_class                                       TEXT,
  energy_type                                         TEXT,
  side                                                TEXT CHECK (side IN ('buy','sell')),
  volume_mwh                                          REAL NOT NULL DEFAULT 0,
  price_zar_per_mwh                                   REAL NOT NULL DEFAULT 0,
  notional_exposure_zar                               REAL NOT NULL DEFAULT 0,

  credit_line_limit_zar                               REAL NOT NULL DEFAULT 0,
  credit_line_used_zar                                REAL NOT NULL DEFAULT 0,
  credit_line_utilization_pct                         REAL NOT NULL DEFAULT 0,

  settlement_risk_score                               INTEGER NOT NULL DEFAULT 0,
  dvp_pvp_unavailable                                 INTEGER NOT NULL DEFAULT 0,
  currency_mismatch                                   INTEGER NOT NULL DEFAULT 0,
  tenor_days                                          INTEGER NOT NULL DEFAULT 0,

  single_name_exposure_zar                            REAL NOT NULL DEFAULT 0,
  book_value_zar                                      REAL NOT NULL DEFAULT 0,
  concentration_ratio_pct                             REAL NOT NULL DEFAULT 0,

  kyc_verified_at                                     TEXT,
  kyc_recency_days                                    INTEGER NOT NULL DEFAULT 9999,
  last_mark_at                                        TEXT,
  mark_age_seconds                                    INTEGER NOT NULL DEFAULT 9999,

  underlying_halted                                   INTEGER NOT NULL DEFAULT 0,
  partial_halt_flag                                   INTEGER NOT NULL DEFAULT 0,
  halt_status_band                                    TEXT CHECK (halt_status_band IN ('none','partial','full')),

  cross_border_settlement                             INTEGER NOT NULL DEFAULT 0,
  counterparty_credit_grade_below_B                   INTEGER NOT NULL DEFAULT 0,
  concentration_above_25pct                           INTEGER NOT NULL DEFAULT 0,
  halted_underlying                                   INTEGER NOT NULL DEFAULT 0,
  first_trade_with_counterparty                       INTEGER NOT NULL DEFAULT 0,

  hold_triggered_by_sla                               INTEGER NOT NULL DEFAULT 0,
  hold_reason                                         TEXT,
  reject_reason                                       TEXT,
  override_reason                                     TEXT,
  override_by                                         TEXT,

  var_limit_zar                                       REAL NOT NULL DEFAULT 0,
  current_position_zar                                REAL NOT NULL DEFAULT 0,
  position_limit_zar                                  REAL NOT NULL DEFAULT 0,
  counterparty_margin_ref                             TEXT,

  current_tier                                        TEXT NOT NULL CHECK (current_tier IN (
    'micro','standard','material','systemic'
  )),
  authority_required                                  TEXT CHECK (authority_required IN (
    'junior_trader','desk_head','market_risk_manager','CRO'
  )),
  urgency_band                                        TEXT,
  pretrade_gate_completeness_index                    INTEGER NOT NULL DEFAULT 0,

  title                                               TEXT,
  narrative                                           TEXT,
  reason_code                                         TEXT,
  cancel_reason                                       TEXT,

  current_ball_in_court_party                         TEXT,
  last_responder_party                                TEXT,

  is_reportable                                       INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                                  INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                               TEXT,

  chain_status                                        TEXT NOT NULL CHECK (chain_status IN (
    'order_submitted','kyc_verified','credit_line_checked',
    'settlement_risk_assessed','concentration_checked',
    'halt_status_verified','mark_age_validated','cleared','archived',
    'rejected','held_for_review','manually_cleared','manually_rejected'
  )),
  order_submitted_at                                  TEXT,
  kyc_verified_state_at                               TEXT,
  credit_line_checked_at                              TEXT,
  settlement_risk_assessed_at                         TEXT,
  concentration_checked_at                            TEXT,
  halt_status_verified_at                             TEXT,
  mark_age_validated_at                               TEXT,
  cleared_at                                          TEXT,
  archived_at                                         TEXT,
  rejected_at                                         TEXT,
  held_for_review_at                                  TEXT,
  manually_cleared_at                                 TEXT,
  manually_rejected_at                                TEXT,

  regulator_crossed_at                                TEXT,
  regulator_inbox_ref                                 TEXT,
  regulator_ref                                       TEXT,
  sla_target_ms                                       INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                                     TEXT,
  last_sla_breach_at                                  TEXT,
  sla_breached                                        INTEGER NOT NULL DEFAULT 0,
  escalation_level                                    INTEGER NOT NULL DEFAULT 0,

  tenant_id                                           TEXT,
  created_by                                          TEXT NOT NULL,
  created_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ptc_status        ON oe_pretrade_credit_check(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_tier          ON oe_pretrade_credit_check(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_tenant        ON oe_pretrade_credit_check(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_trader        ON oe_pretrade_credit_check(trader_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_counterparty  ON oe_pretrade_credit_check(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_order_ref     ON oe_pretrade_credit_check(order_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_submitted     ON oe_pretrade_credit_check(order_submitted_at);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_sla           ON oe_pretrade_credit_check(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_reportable    ON oe_pretrade_credit_check(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_breached      ON oe_pretrade_credit_check(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_ccm_ref       ON oe_pretrade_credit_check(counterparty_margin_ref);

CREATE TABLE IF NOT EXISTS oe_pretrade_credit_events (
  id                  TEXT PRIMARY KEY,
  check_id            TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ptc_events_check ON oe_pretrade_credit_events(check_id);
CREATE INDEX IF NOT EXISTS idx_oe_ptc_events_type  ON oe_pretrade_credit_events(event_type);
