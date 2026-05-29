-- Wave 85 — Trader Settlement Fails Management & CSDR-style Buy-In/Sell-Out (P6).
-- The DELIVERY-INTEGRITY engine of the trading book. SA Financial Markets Act 19/2012
-- + JSE SRL Schedule SC + STRATE Settlement Rules + FSCA Conduct Standard 1/2020
-- (best-execution extends to settlement) + FMA Chapter X (transparency on failed
-- trades). The platform implements the CSDR-equivalent rate schedule (1bp/day for
-- equity-like, 0.5bp/day for fixed-income & ETFs, 0.05bp/day for cash-equivalents)
-- and a buy-in process modelled on CSDR Article 7 adapted for SA market practice.
--
-- 12-state P6 lifecycle:
--   instruction_pending -> fail_recorded -> (extension_granted ->) penalty_accruing
--     -> buy_in_initiated -> buy_in_executing -> (buy_in_settled | cash_compensation)
--     -> closed_resolved                                            (clean terminal)
--   Branches: dispute_raised <-> penalty_accruing
--             force_majeure_suspended <-> penalty_accruing
--   Terminal: written_off (from any open state).
--
-- Tiers by gross fail value (ZAR): minor<100k / standard<1M / material<10M /
-- systemic>=10M. FLOOR at 'material' when systemic_instrument_flag OR
-- fail_age_days>=5 (long-aging fails are systemic-risk indicators irrespective
-- of size).
--
-- URGENT SLA — larger fail = tighter every window. Same family as W34/W50/W67/
-- W75/W84 + Trader counterparty-margin (W68).
--
-- Reportability (DELIVERY-INTEGRITY signature):
--   write_off           crosses EVERY tier (W85 hard line — uncollectable loss).
--   close_cash          crosses material+systemic (basis-risk cash settlement).
--   initiate_buy_in     crosses material+systemic (formal market intervention).
--   sla_breached        crosses material+systemic.
--
-- Single trader desk write {admin, support, trader}. actor_party tags the
-- function performing each step (trader_desk / buy_in_agent / settlement_ops /
-- counterparty_credit) for audit attribution only, NOT access.

CREATE TABLE IF NOT EXISTS oe_settlement_fails (
  id                              TEXT PRIMARY KEY,
  fail_number                     TEXT UNIQUE NOT NULL,

  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  trader_desk_id                  TEXT NOT NULL,
  trader_desk_name                TEXT NOT NULL,
  counterparty_id                 TEXT NOT NULL,
  counterparty_name               TEXT NOT NULL,
  buy_in_agent_id                 TEXT,
  buy_in_agent_name               TEXT,

  trade_ref                       TEXT,
  allocation_ref                  TEXT,
  isin                            TEXT,
  instrument_name                 TEXT,
  instrument_class                TEXT NOT NULL CHECK (instrument_class IN (
    'equity','bond','etf','derivative','cash_equivalent'
  )),
  systemic_instrument_flag        INTEGER NOT NULL DEFAULT 0,

  instructed_settlement_date      TEXT NOT NULL,
  fail_recorded_at_t              TEXT,
  fail_quantity                   REAL NOT NULL DEFAULT 0,
  fail_unit                       TEXT,
  fail_price_zar                  REAL NOT NULL DEFAULT 0,
  fail_value_zar                  REAL NOT NULL DEFAULT 0,
  fail_reason_code                TEXT CHECK (fail_reason_code IN (
    'insufficient_securities','insufficient_cash','instruction_mismatch',
    'late_matching','counterparty_default','operational_error','systemic_disruption'
  )),

  fail_tier                       TEXT NOT NULL CHECK (fail_tier IN (
    'minor','standard','material','systemic'
  )),
  is_systemic_carrier             INTEGER NOT NULL DEFAULT 0,

  extension_granted_until         TEXT,
  buy_in_agent_appointed_at       TEXT,
  buy_in_executed_at              TEXT,
  buy_in_settled_at               TEXT,
  buy_in_price_zar                REAL DEFAULT 0,
  buy_in_value_zar                REAL DEFAULT 0,
  cash_compensation_value_zar     REAL DEFAULT 0,

  fail_age_days                   INTEGER NOT NULL DEFAULT 0,
  accrued_penalty_zar             REAL NOT NULL DEFAULT 0,
  buy_in_window_remaining_days    INTEGER DEFAULT 0,
  recovery_rate_pct               REAL DEFAULT 0,
  penalty_to_nav_ratio_pct        REAL DEFAULT 0,
  counterparty_concentration_pct  REAL DEFAULT 0,
  repeat_fail_score               INTEGER NOT NULL DEFAULT 0,
  substitute_inventory_flag       INTEGER NOT NULL DEFAULT 0,
  cross_default_risk_flag         INTEGER NOT NULL DEFAULT 0,
  urgency_band                    TEXT DEFAULT 'green' CHECK (urgency_band IN (
    'green','amber','red','critical'
  )),
  predicted_resolution_days       INTEGER DEFAULT 0,

  counterparty_nav_zar            REAL DEFAULT 0,
  counterparty_open_fails_zar     REAL DEFAULT 0,
  counterparty_open_fail_count    INTEGER NOT NULL DEFAULT 0,
  counterparty_prior_fails_90d    INTEGER NOT NULL DEFAULT 0,
  alternative_inventory_qty       REAL DEFAULT 0,

  penalty_started_flag            INTEGER NOT NULL DEFAULT 0,
  buy_in_initiated_flag           INTEGER NOT NULL DEFAULT 0,
  buy_in_settled_flag             INTEGER NOT NULL DEFAULT 0,
  cash_compensation_flag          INTEGER NOT NULL DEFAULT 0,
  dispute_raised_flag             INTEGER NOT NULL DEFAULT 0,
  force_majeure_flag              INTEGER NOT NULL DEFAULT 0,
  written_off_flag                INTEGER NOT NULL DEFAULT 0,
  closed_resolved_flag            INTEGER NOT NULL DEFAULT 0,

  last_action_ref                 TEXT,
  regulator_ref                   TEXT,

  chain_basis                     TEXT,
  reason_code                     TEXT,
  fail_summary                    TEXT,

  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'instruction_pending','fail_recorded','extension_granted','penalty_accruing',
    'buy_in_initiated','buy_in_executing','buy_in_settled','cash_compensation',
    'closed_resolved','dispute_raised','force_majeure_suspended','written_off'
  )),
  instruction_pending_at          TEXT NOT NULL,
  fail_recorded_at                TEXT,
  extension_granted_at            TEXT,
  penalty_accruing_at             TEXT,
  buy_in_initiated_at             TEXT,
  buy_in_executing_at             TEXT,
  buy_in_settled_status_at        TEXT,
  cash_compensation_at            TEXT,
  closed_resolved_at              TEXT,
  dispute_raised_at               TEXT,
  force_majeure_suspended_at      TEXT,
  written_off_at                  TEXT,

  is_reportable                   INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,

  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_settlement_fails_status         ON oe_settlement_fails(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_settlement_fails_tier           ON oe_settlement_fails(fail_tier);
CREATE INDEX IF NOT EXISTS idx_oe_settlement_fails_counterparty   ON oe_settlement_fails(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_oe_settlement_fails_reportable     ON oe_settlement_fails(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_settlement_fails_sla_deadline   ON oe_settlement_fails(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_settlement_fails_isin           ON oe_settlement_fails(isin);

CREATE TABLE IF NOT EXISTS oe_settlement_fails_events (
  id                 TEXT PRIMARY KEY,
  fail_id            TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_sf_events_f    ON oe_settlement_fails_events(fail_id);
CREATE INDEX IF NOT EXISTS idx_oe_sf_events_type ON oe_settlement_fails_events(event_type);
