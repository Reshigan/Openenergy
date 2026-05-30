-- Wave 111 - Trader Daily P&L Attribution & Risk-Adjusted Returns chain.
-- 11th Trader chain. EOD P&L decomposition + risk-decomp + benchmark
-- comparison + IFRS9 stage classification engine. Distinct from W2
-- (rolling VaR), W9 (MM-compliance), W29 (position limits), W36
-- (best-execution), W44 (trade reporting), W52 (market-abuse), W60
-- (algo-cert), W68 (counterparty-margin), W76 (trade-allocation), W107
-- (pre-trade credit).
--
-- Beats Murex MX.3 / Calypso / Bloomberg PORT / FIS Adaptiv / OpenLink
-- Endur / OneTick / Imagine Risk / Kondor+ / Front Arena / SunGard
-- FastVal. Each surfaces daily P&L as a flat MTM tape plus an Excel-
-- glued attribution; W111 turns it into a 12-state P6 chain with
-- URGENT SLA polarity stored in HOURS, FLOOR-AT-MATERIAL tier overlay,
-- 4-step authority ladder, 17-field LIVE battery, 3-bridge architecture
-- to W2 / W107 / W44, and signature regulator crossings.
--
-- Standards: FMA Ch.X + FSCA Conduct Standard 1/2020 + IFRS 9 + IFRS 13
-- + Basel III FRTB IMA + SA + GIPS 2020 + MAR.
--
-- 12-state P6 lifecycle plus 3 branch states:
--   day_open -> run_mtm -> mtm_run -> compute_realised
--     -> realised_computed -> compute_unrealised -> unrealised_computed
--     -> decompose_attribution -> attribution_decomposed
--     -> decompose_risk -> risk_decomposed -> compare_to_benchmark
--     -> benchmark_compared -> submit_to_review -> reviewed
--     -> approve_pnl -> approved -> publish_pnl -> published
--     -> reconcile -> reconciled -> archive_pnl -> archived
--                                                  (HARD terminal)
--   reviewed -> hold_for_review -> held_for_review -> override_hold
--     -> reviewed (LOOP)
--   attribution_decomposed -> flag_variance_investigation
--     -> variance_investigation -> decompose_attribution (LOOP)
--   published/reconciled -> restate_pnl -> restated -> run_mtm (LOOP;
--                                                                W111
--                                                                SIGNATURE
--                                                                when
--                                                                second
--                                                                within
--                                                                30d)
--
-- Tier RE-DERIVED on every transition from gross_notional_zar:
--   minor    : <R10m
--   standard : R10m - R500m
--   material : R500m - R5b OR 1 floor flag
--   systemic : >=R5b OR 2+ floor flags OR FRTB_IMA OR cross-border
-- FLOOR-AT-MATERIAL on any one of 5 floor flags.
-- FLOOR-AT-SYSTEMIC on 2+ flags OR regulatory_book_FRTB_IMA OR
-- cross_border_consolidation.
--
-- URGENT SLA polarity stored as HOURS. day_open anchor:
--   minor 24h / standard 18h / material 12h / systemic 6h
--
-- SIGNATURE regulator crossings (FMA + FSCA + IFRS 9):
--   restate_pnl                 -> regulator EVERY tier when
--                                   restated_within_30d (W111 SIGNATURE)
--   flag_variance_investigation -> regulator material+systemic when
--                                   attribution_gap_pct>=10%
--   approve_pnl                 -> regulator systemic only when
--                                   stress_period_active
--   publish_pnl                 -> regulator systemic only when
--                                   FRTB_IMA
--   sla_breached                -> material+systemic
--
-- Write {admin, trader}. Read all 9 personas. actor_party split:
--   trader               : open_day, run_mtm, compute_realised,
--                          compute_unrealised
--   risk_analyst         : decompose_attribution, decompose_risk,
--                          compare_to_benchmark, submit_to_review,
--                          flag_variance_investigation
--   desk_head            : approve_pnl, hold_for_review, override_hold
--   market_risk_manager  : publish_pnl
--   finance              : reconcile, archive_pnl
--   CFO                  : restate_pnl

CREATE TABLE IF NOT EXISTS oe_pnl_attribution (
  id                                          TEXT PRIMARY KEY,
  pnl_number                                  TEXT UNIQUE NOT NULL,

  -- Book + period
  book_id                                     TEXT NOT NULL,
  book_label                                  TEXT,
  desk_id                                     TEXT,
  business_date                               TEXT NOT NULL,
  gross_notional_zar                          REAL NOT NULL DEFAULT 0,

  -- Cross-chain bridges (W2 / W107 / W44)
  trading_risk_ref                            TEXT,
  pretrade_credit_ref                         TEXT,
  trade_reporting_ref                         TEXT,

  -- P&L decomposition (ZAR)
  mtm_zar                                     REAL NOT NULL DEFAULT 0,
  realised_pnl_zar                            REAL NOT NULL DEFAULT 0,
  unrealised_pnl_zar                          REAL NOT NULL DEFAULT 0,
  total_daily_pnl_zar                         REAL NOT NULL DEFAULT 0,
  mtd_pnl_zar                                 REAL NOT NULL DEFAULT 0,
  ytd_pnl_zar                                 REAL NOT NULL DEFAULT 0,

  -- Attribution (greeks + carry + residual ZAR)
  delta_zar                                   REAL NOT NULL DEFAULT 0,
  gamma_zar                                   REAL NOT NULL DEFAULT 0,
  vega_zar                                    REAL NOT NULL DEFAULT 0,
  theta_zar                                   REAL NOT NULL DEFAULT 0,
  fx_zar                                      REAL NOT NULL DEFAULT 0,
  carry_zar                                   REAL NOT NULL DEFAULT 0,
  residual_zar                                REAL NOT NULL DEFAULT 0,
  attribution_gap_pct                         REAL NOT NULL DEFAULT 0,

  -- Risk decomposition
  var_contribution_zar                        REAL NOT NULL DEFAULT 0,
  scenario_impact_zar                         REAL NOT NULL DEFAULT 0,
  kri_exceedance_count                        INTEGER NOT NULL DEFAULT 0,

  -- Benchmark comparison
  benchmark_label                             TEXT,
  benchmark_return_pct                        REAL NOT NULL DEFAULT 0,
  alpha_pct                                   REAL NOT NULL DEFAULT 0,
  tracking_error_pct                          REAL NOT NULL DEFAULT 0,

  -- Risk-adjusted ratios (GIPS 2020)
  sharpe_ratio                                REAL NOT NULL DEFAULT 0,
  sortino_ratio                               REAL NOT NULL DEFAULT 0,
  information_ratio                           REAL NOT NULL DEFAULT 0,
  max_drawdown_pct                            REAL NOT NULL DEFAULT 0,

  -- Restatement counter (rolling 30d)
  restate_count                               INTEGER NOT NULL DEFAULT 0,
  last_restate_at                             TEXT,

  -- IFRS 9 stage classification
  ifrs9_stage                                 TEXT,

  -- 5 floor flags
  stress_period_active                        INTEGER NOT NULL DEFAULT 0,
  restated_within_30d                         INTEGER NOT NULL DEFAULT 0,
  large_attribution_gap_pct_5_plus            INTEGER NOT NULL DEFAULT 0,
  regulatory_book_FRTB_IMA                    INTEGER NOT NULL DEFAULT 0,
  cross_border_consolidation                  INTEGER NOT NULL DEFAULT 0,

  -- Tier + authority + completeness battery
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'minor','standard','material','systemic'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'trader','desk_head','market_risk_manager','CFO'
  )),
  urgency_band                                TEXT,
  pnl_completeness_index                      INTEGER NOT NULL DEFAULT 0,

  -- Narrative
  title                                       TEXT,
  narrative                                   TEXT,
  reason_code                                 TEXT,
  hold_reason                                 TEXT,
  variance_reason                             TEXT,
  restate_reason                              TEXT,

  current_ball_in_court_party                 TEXT,
  last_responder_party                        TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- 12 lifecycle + 3 branch status timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'day_open','mtm_run','realised_computed','unrealised_computed',
    'attribution_decomposed','risk_decomposed','benchmark_compared',
    'reviewed','approved','published','reconciled','archived',
    'held_for_review','variance_investigation','restated'
  )),
  day_open_at                                 TEXT,
  mtm_run_at                                  TEXT,
  realised_computed_at                        TEXT,
  unrealised_computed_at                      TEXT,
  attribution_decomposed_at                   TEXT,
  risk_decomposed_at                          TEXT,
  benchmark_compared_at                       TEXT,
  reviewed_at                                 TEXT,
  approved_at                                 TEXT,
  published_at                                TEXT,
  reconciled_at                               TEXT,
  archived_at                                 TEXT,
  held_for_review_at                          TEXT,
  variance_investigation_at                   TEXT,
  restated_at                                 TEXT,

  -- Regulator crossing
  regulator_crossed_at                        TEXT,
  regulator_inbox_ref                         TEXT,
  regulator_ref                               TEXT,

  -- SLA
  sla_target_hours                            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                             TEXT,
  last_sla_breach_at                          TEXT,
  sla_breached                                INTEGER NOT NULL DEFAULT 0,
  escalation_level                            INTEGER NOT NULL DEFAULT 0,

  tenant_id                                   TEXT,
  created_by                                  TEXT NOT NULL,
  created_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pna_status      ON oe_pnl_attribution(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_pna_tier        ON oe_pnl_attribution(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_pna_tenant      ON oe_pnl_attribution(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_pna_book        ON oe_pnl_attribution(book_id);
CREATE INDEX IF NOT EXISTS idx_oe_pna_desk        ON oe_pnl_attribution(desk_id);
CREATE INDEX IF NOT EXISTS idx_oe_pna_sla         ON oe_pnl_attribution(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_pna_breached    ON oe_pnl_attribution(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_pna_reportable  ON oe_pnl_attribution(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_pna_date        ON oe_pnl_attribution(business_date);
CREATE INDEX IF NOT EXISTS idx_oe_pna_ifrs9       ON oe_pnl_attribution(ifrs9_stage);

CREATE TABLE IF NOT EXISTS oe_pnl_attribution_events (
  id                  TEXT PRIMARY KEY,
  pnl_id              TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pna_events_pid  ON oe_pnl_attribution_events(pnl_id);
CREATE INDEX IF NOT EXISTS idx_oe_pna_events_type ON oe_pnl_attribution_events(event_type);
