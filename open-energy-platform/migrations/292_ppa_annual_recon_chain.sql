-- Wave 101 — Offtaker PPA Annual Reconciliation & True-Up chain (P6). The
-- annual financial-close gate of a PPA. Aggregates 12 months of W87
-- nominations + deviations + settlements, the W32 annual take-or-pay
-- residual, the W39 CPI tariff indexation true-up, the W46 deemed-energy
-- curtailment credits, the W54 payment-security release/redraw, and the
-- capacity payment annual roll into ONE closed-year ledger with auditor +
-- counterparty signoff, a restate-after-settlement door, and a regulator
-- hard line on year re-opens. Beats EnPowered PPA Settlement + DNV Synergi
-- PPA + Schneider PPA Manager + Open Energi Reconciliation + KPMG PPA Recon
-- + Power Advocate Annual + Aurora Energy Research PPA Annual + Wood
-- Mackenzie PPA Annual by surfacing every annual-close metric LIVE on the
-- row.
--
-- 12-state P6 lifecycle:
--   year_opened -> collect_data -> data_collected
--     -> classify_variance -> variance_classified
--       -> compute_top_residual -> top_residual_computed
--         -> apply_cpi_capacity -> cpi_capacity_applied
--           -> reconcile -> reconciled
--             -> sign_off -> signed_off
--               -> invoice -> invoiced
--                 -> settle -> settled (rest state)
--                   -> restate_year -> restated (terminal)
--   reconciled -> raise_dispute -> disputed -> resolve_dispute -> reconciled
--   year_opened / data_collected -> cancel_year -> cancelled (terminal)
--
-- Tier — RE-DERIVED on every transition from MAX(variance_pct band,
-- top_residual_zar band) with FLOOR-AT-MATERIAL on any of:
--   top_residual_zar          > R100m
--   cpi_true_up_zar           > R50m
--   offtake_shortfall_pct     > 20
--   contract_year_end_strict  = 1
--
-- INVERTED SLA polarity (larger variance + residual = MORE time for joint
-- forensic reconciliation, audit walkthroughs, counterparty signoff).
--
-- SIGNATURE (W101 — IFRS 15 + NERSA s34 financial-close hard line):
--   restate_year   -> regulator EVERY tier (post-signoff restatement)
--   raise_dispute  -> regulator EVERY tier (NERSA s30, sister of W87/W66)
--   sign_off       -> material + major (large signoff disclosable)
--   cancel_year    -> regulator EVERY tier when year had any delivery
--   sla_breached   -> material + major
--
-- Write {admin, offtaker}. Read all 9 personas. actor_party functional
-- (settlement_analyst, counterparty, finance_controller, auditor,
-- regulator_observer).

CREATE TABLE IF NOT EXISTS oe_ppa_annual_recon (
  id                                  TEXT PRIMARY KEY,
  recon_number                        TEXT UNIQUE NOT NULL,

  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,

  ppa_id                              TEXT NOT NULL,
  ppa_name                            TEXT,
  buyer_party_id                      TEXT,
  buyer_party_name                    TEXT,
  seller_party_id                     TEXT,
  seller_party_name                   TEXT,
  facility_id                         TEXT,
  facility_name                       TEXT,
  contract_year                       INTEGER NOT NULL,
  contract_year_label                 TEXT,
  contract_year_end_strict            INTEGER NOT NULL DEFAULT 0,
  year_period_start                   TEXT,
  year_period_end                     TEXT,

  contracted_mwh                      REAL,
  delivered_mwh                       REAL,
  metered_mwh                         REAL,
  curtailed_mwh                       REAL,
  variance_mwh                        REAL,
  variance_pct                        REAL,

  base_tariff_zar_per_mwh             REAL,
  indexed_tariff_zar_per_mwh          REAL,
  deviation_tariff_zar_per_mwh        REAL,
  deemed_tariff_zar_per_mwh           REAL,
  capacity_tariff_zar_per_mw_year     REAL,
  installed_capacity_mw               REAL,
  availability_factor_decimal         REAL,

  energy_revenue_zar                  REAL,
  capacity_payment_zar                REAL,
  deemed_energy_credit_zar            REAL,
  cpi_true_up_zar                     REAL,
  top_residual_zar                    REAL,
  prior_year_overpayment_zar          REAL,
  net_cash_position_zar               REAL,

  min_offtake_mwh                     REAL,
  offtake_shortfall_pct               REAL,

  top_residual_over_r100m             INTEGER NOT NULL DEFAULT 0,
  cpi_true_up_over_r50m               INTEGER NOT NULL DEFAULT 0,
  offtake_shortfall_over_20_pct       INTEGER NOT NULL DEFAULT 0,

  current_tier                        TEXT NOT NULL CHECK (current_tier IN (
    'minor','standard','material','major'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'settlement_analyst','finance_controller','finance_director','cfo'
  )),

  dispute_count                       INTEGER NOT NULL DEFAULT 0,
  restate_count                       INTEGER NOT NULL DEFAULT 0,
  year_had_delivery                   INTEGER NOT NULL DEFAULT 0,

  parent_recon_id                     TEXT,
  prior_year_recon_id                 TEXT,
  regulator_ref                       TEXT,
  invoice_ref                         TEXT,
  payment_ref                         TEXT,
  ppa_contract_ref                    TEXT,

  title                               TEXT,
  narrative                           TEXT,
  result_text                         TEXT,
  disputed_reason                     TEXT,
  restated_reason                     TEXT,
  cancelled_reason                    TEXT,
  reason_code                         TEXT,

  current_ball_in_court_party         TEXT,
  last_responder_party                TEXT,
  analyst_party                       TEXT,
  counterparty_party                  TEXT,
  auditor_party                       TEXT,

  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'year_opened','data_collected','variance_classified',
    'top_residual_computed','cpi_capacity_applied','reconciled',
    'disputed','signed_off','invoiced','settled',
    'restated','cancelled'
  )),
  year_opened_at                      TEXT,
  data_collected_at                   TEXT,
  variance_classified_at              TEXT,
  top_residual_computed_at            TEXT,
  cpi_capacity_applied_at             TEXT,
  reconciled_at                       TEXT,
  disputed_at                         TEXT,
  signed_off_at                       TEXT,
  invoiced_at                         TEXT,
  settled_at                          TEXT,
  restated_at                         TEXT,
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

CREATE INDEX IF NOT EXISTS idx_oe_par_status    ON oe_ppa_annual_recon(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_par_tier      ON oe_ppa_annual_recon(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_par_ppa       ON oe_ppa_annual_recon(ppa_id);
CREATE INDEX IF NOT EXISTS idx_oe_par_facility  ON oe_ppa_annual_recon(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_par_year      ON oe_ppa_annual_recon(contract_year);
CREATE INDEX IF NOT EXISTS idx_oe_par_buyer     ON oe_ppa_annual_recon(buyer_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_par_seller    ON oe_ppa_annual_recon(seller_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_par_sla       ON oe_ppa_annual_recon(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_par_ball      ON oe_ppa_annual_recon(current_ball_in_court_party);
CREATE INDEX IF NOT EXISTS idx_oe_par_top_flag  ON oe_ppa_annual_recon(top_residual_over_r100m);
CREATE INDEX IF NOT EXISTS idx_oe_par_cpi_flag  ON oe_ppa_annual_recon(cpi_true_up_over_r50m);
CREATE INDEX IF NOT EXISTS idx_oe_par_yend_flag ON oe_ppa_annual_recon(contract_year_end_strict);

CREATE TABLE IF NOT EXISTS oe_ppa_annual_recon_events (
  id                  TEXT PRIMARY KEY,
  recon_id            TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_par_events_r    ON oe_ppa_annual_recon_events(recon_id);
CREATE INDEX IF NOT EXISTS idx_oe_par_events_type ON oe_ppa_annual_recon_events(event_type);
