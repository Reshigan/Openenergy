-- Wave 36 — Trader Best-Execution / RFQ Compliance chain.
-- Every client / counterparty RFQ on the exchange must take all sufficient
-- steps to obtain the best possible result (total consideration = price + cost
-- + speed + likelihood) for the client. This chain governs the
-- RFQ → quotes → best-ex evaluation → execution → TCA review lifecycle and the
-- documented-override / exception-escalation branches.
--
-- Standards: FSCA Conduct Standard 1 of 2020 (General Code of Conduct for
-- Authorised FSPs) best-execution duty + FAIS Act 2002 + JSE Equities /
-- Derivatives best-execution rules.
--
-- Operational complement to W2 VaR (quality), W9 MM compliance (consistency),
-- W29 position limits (quantity): this enforces best EXECUTION on each order.
--
-- 11-state P6 lifecycle (8 forward + 3 branch states):
--   rfq_received → quotes_solicited → quotes_received → best_ex_evaluated →
--   execution_approved → executed → tca_reviewed → closed
--   + override_executed (away from best quote, documented) / exception_escalated
--   / rfq_expired
--
-- Tiers (FSCA client classification — drive SLA + reportability):
--   retail                — strongest best-ex protection (tightest TCA)
--   professional          — best-ex applies, lighter
--   eligible_counterparty — largely waived best-ex (ECP)
--
-- MIXED SLA: quote/approval/execution windows are hard market windows (same
-- across tiers); evaluation + TCA review are protection-graded (retail tightest).
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (W2 VaR / W9 MM / W29 position limit cases can spawn an RFQ
-- best-ex review).

CREATE TABLE IF NOT EXISTS oe_best_execution (
  id                      TEXT PRIMARY KEY,
  rfq_number              TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event            TEXT,
  source_entity_type      TEXT,
  source_entity_id        TEXT,
  source_wave             TEXT,

  -- Desk (front office) party
  desk_party_id           TEXT NOT NULL,
  desk_party_name         TEXT NOT NULL,

  -- Client / counterparty party
  client_party_id         TEXT NOT NULL,
  client_party_name       TEXT NOT NULL,

  -- FSCA client classification tier
  client_tier             TEXT NOT NULL CHECK (client_tier IN (
    'retail', 'professional', 'eligible_counterparty'
  )),

  -- Instrument / order
  instrument              TEXT NOT NULL,
  energy_type             TEXT,
  side                    TEXT,
  quantity_mwh            REAL,
  delivery_day            TEXT,

  -- Best-ex evaluation economics (total consideration)
  quotes_count            INTEGER NOT NULL DEFAULT 0,
  best_quote_price_zar    REAL,
  best_quote_counterparty TEXT,
  executed_price_zar      REAL,
  executed_counterparty   TEXT,
  total_consideration_zar REAL,
  notional_zar            REAL,
  price_improvement_bps   REAL,
  slippage_bps            REAL,

  -- Refs
  rfq_ref                 TEXT,
  evaluation_ref          TEXT,
  approval_ref            TEXT,
  execution_ref           TEXT,
  override_ref            TEXT,
  tca_ref                 TEXT,
  exception_ref           TEXT,

  -- Narrative
  best_ex_basis           TEXT,
  approval_basis          TEXT,
  override_basis          TEXT,
  tca_findings            TEXT,
  exception_basis         TEXT,
  expiry_basis            TEXT,
  reason_code             TEXT,
  rod_notes               TEXT,

  -- State + lifecycle
  chain_status            TEXT NOT NULL CHECK (chain_status IN (
    'rfq_received','quotes_solicited','quotes_received','best_ex_evaluated',
    'execution_approved','executed','override_executed','tca_reviewed',
    'closed','exception_escalated','rfq_expired'
  )),
  rfq_received_at         TEXT NOT NULL,
  quotes_solicited_at     TEXT,
  quotes_received_at      TEXT,
  best_ex_evaluated_at    TEXT,
  execution_approved_at   TEXT,
  executed_at             TEXT,
  override_executed_at    TEXT,
  tca_reviewed_at         TEXT,
  closed_at               TEXT,
  exception_escalated_at  TEXT,
  rfq_expired_at          TEXT,

  sla_deadline_at         TEXT,
  last_sla_breach_at      TEXT,
  escalation_level        INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_best_execution_status   ON oe_best_execution(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_best_execution_tier     ON oe_best_execution(client_tier);
CREATE INDEX IF NOT EXISTS idx_oe_best_execution_desk     ON oe_best_execution(desk_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_best_execution_client   ON oe_best_execution(client_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_best_execution_received ON oe_best_execution(rfq_received_at);
CREATE INDEX IF NOT EXISTS idx_oe_best_execution_sla      ON oe_best_execution(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_best_execution_events (
  id              TEXT PRIMARY KEY,
  rfq_id          TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_best_execution_events_rfq  ON oe_best_execution_events(rfq_id);
CREATE INDEX IF NOT EXISTS idx_oe_best_execution_events_type ON oe_best_execution_events(event_type);
