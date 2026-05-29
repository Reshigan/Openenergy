-- Wave 68 — Counterparty Margin Call & Default Management chain. A best-in-class
-- trading venue runs a clearing / risk function that manages the COUNTERPARTY
-- CREDIT and COLLATERAL relationship for every participant with an open position.
-- The Financial Markets Act 19/2012 (clearing houses / CCPs), the FSCA Conduct
-- Standards and the CPMI-IOSCO Principles for Financial Market Infrastructures
-- (PFMI Principle 4 credit risk, 5 collateral, 6 margin, 13 participant-default
-- rules) require a documented, time-bound default-management process: mark
-- exposure to market, call variation margin when utilisation breaches thresholds,
-- give the member a cure window, and — if it cannot or will not post — declare a
-- default, close out and net the positions, liquidate pledged collateral, and
-- (only if collateral is insufficient) draw on the mutualised DEFAULT FUND.
--
-- Distinct from the rest of the trading desk: W2 measures the venue's own MARKET
-- risk (VaR); W29 caps regulatory POSITION SIZE; W3 settles matched trades; W44
-- reports trades to the repository; W52 surveils for abuse; W60 certifies trading
-- SYSTEMS; kyc-deep admits the counterparty. W68 governs whether an admitted,
-- trading counterparty keeps MEETING its collateral obligations, and what happens
-- when it fails.
--
-- 12-state P6 lifecycle (forward cure path + restriction branch + default waterfall):
--   limit_active → exposure_warning → margin_call_issued → collateral_received
--     → (cure_breach) → limit_active
--   restriction:  {exposure_warning, margin_call_issued} → position_restriction
--   cure_period:  {margin_call_issued, position_restriction} → cure_period
--   waterfall:    {cure_period, position_restriction} → default_declared → close_out
--                   → default_fund_draw → recovered | written_off
--                 close_out → recovered | written_off (collateral sufficient)
--   withdrawn:    {exposure_warning, margin_call_issued} → withdrawn
--
-- Tiers (5) by EXPOSURE AT RISK (ZAR mark-to-market net of held collateral), with
-- a floor escalation for a systemically-important counterparty (a SIFI default
-- threatens the whole venue regardless of the day's exposure number):
--   minor <R5m / moderate <R50m / material <R250m / major <R1bn / systemic >=R1bn
--
-- URGENT SLA: the LARGER the exposure, the TIGHTER every window. Same flavour as
-- W34 / W50 / W67.
--
-- Reportability (the W68 signature — DEFAULT-driven):
--   declare_default crosses for EVERY tier (declaring a participant default is
--   always notifiable to the FSCA / Prudential Authority); draw_default_fund,
--   write_off and SLA breaches cross for the high tiers (major + systemic).
--
-- Single write: the clearing house / risk desk drives every step; the member
-- posts collateral out-of-band. actor_party records which side a step represents.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/source_wave.

CREATE TABLE IF NOT EXISTS oe_counterparty_margin (
  id                          TEXT PRIMARY KEY,
  case_number                 TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event                TEXT,
  source_entity_type          TEXT,
  source_entity_id            TEXT,
  source_wave                 TEXT,

  -- Counterparty / clearing member
  counterparty_id             TEXT NOT NULL,
  counterparty_name           TEXT NOT NULL,
  member_code                 TEXT,
  account_type                TEXT CHECK (account_type IN (
    'house','client','omnibus'
  )),
  systemically_important      INTEGER NOT NULL DEFAULT 0,

  -- Exposure / collateral descriptors
  product_class               TEXT CHECK (product_class IN (
    'power_forward','power_spot','carbon','financial_derivative','repo','mixed'
  )),
  exposure_zar                REAL,            -- mark-to-market exposure at risk
  collateral_held_zar         REAL,
  margin_call_zar             REAL,
  collateral_posted_zar       REAL,
  shortfall_zar               REAL,
  default_fund_draw_zar       REAL,
  recovery_zar                REAL,
  write_off_zar               REAL,
  utilisation_pct             REAL,            -- exposure / limit
  severity_tier               TEXT NOT NULL CHECK (severity_tier IN (
    'minor','moderate','material','major','systemic'
  )),

  -- Parties
  clearing_party_id           TEXT,
  clearing_party_name         TEXT,
  member_party_id             TEXT,
  member_party_name           TEXT,

  -- Refs
  warning_ref                 TEXT,
  margin_call_ref             TEXT,
  collateral_ref              TEXT,
  restriction_ref             TEXT,
  cure_ref                    TEXT,
  default_ref                 TEXT,
  close_out_ref               TEXT,
  default_fund_ref            TEXT,

  -- Narrative
  warning_basis               TEXT,
  margin_call_basis           TEXT,
  collateral_basis            TEXT,
  restriction_basis           TEXT,
  cure_basis                  TEXT,
  default_basis               TEXT,
  close_out_basis             TEXT,
  default_fund_basis          TEXT,
  recovery_basis              TEXT,
  write_off_basis             TEXT,
  reason_code                 TEXT,
  resolution_summary          TEXT,

  -- State + lifecycle
  chain_status                TEXT NOT NULL CHECK (chain_status IN (
    'limit_active','exposure_warning','margin_call_issued','collateral_received',
    'position_restriction','cure_period','default_declared','close_out',
    'default_fund_draw','recovered','written_off','withdrawn'
  )),
  limit_active_at             TEXT NOT NULL,
  exposure_warning_at         TEXT,
  margin_call_issued_at       TEXT,
  collateral_received_at      TEXT,
  position_restriction_at     TEXT,
  cure_period_at              TEXT,
  default_declared_at         TEXT,
  close_out_at                TEXT,
  default_fund_draw_at        TEXT,
  recovered_at                TEXT,
  written_off_at              TEXT,
  withdrawn_at                TEXT,

  cure_round                  INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at             TEXT,
  last_sla_breach_at          TEXT,
  is_reportable               INTEGER NOT NULL DEFAULT 0,
  escalation_level            INTEGER NOT NULL DEFAULT 0,

  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ccm_status        ON oe_counterparty_margin(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ccm_tier          ON oe_counterparty_margin(severity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ccm_counterparty  ON oe_counterparty_margin(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_oe_ccm_product       ON oe_counterparty_margin(product_class);
CREATE INDEX IF NOT EXISTS idx_oe_ccm_sla           ON oe_counterparty_margin(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_counterparty_margin_events (
  id              TEXT PRIMARY KEY,
  margin_id       TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ccm_events_case ON oe_counterparty_margin_events(margin_id);
CREATE INDEX IF NOT EXISTS idx_oe_ccm_events_type ON oe_counterparty_margin_events(event_type);
