-- ════════════════════════════════════════════════════════════════════════
-- 053 · Settlement fees + confirmations handshake + AI run-failure audit
--
-- L4 settlement depth, part 2 of 2. Completes the operational layer that
-- migration 052 starts:
--
--   settlement_fees — append-only ledger of fees attached to an invoice
--     after issuance. Different from invoice_line_items (migration 051):
--     line items are negotiated charges agreed before issuance; fees are
--     consequences that fire afterwards (dunning, late payment, rebooking,
--     admin). Each row carries calc_rule_version so the fees engine can
--     re-run idempotently — same (invoice, fee_type, rule_version) only
--     ever produces one row.
--
--   invoice_confirmations — per-side handshake on a single invoice.
--     issuer confirms it's correct → payer acknowledges they owe it.
--     Either side can reject; rejection auto-flips the invoice's
--     confirmation_status to 'disputed' (column added in 052).
--
--   ai_settlement_run_failures — when a settlement_run hits the DLQ,
--     the explainer turns the underlying error into a one-line cause +
--     suggested action. Mirrors src/utils/rejection-explainer.ts for
--     trading rejections: deterministic fallback for known codes, AI
--     gateway for novel ones, audit trail on acceptance.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settlement_fees (
  id                  TEXT PRIMARY KEY,
  invoice_id          TEXT NOT NULL,
  fee_type            TEXT NOT NULL CHECK (fee_type IN (
    'dunning','late_payment','rebooking','admin','wheeling_uplift','imbalance_uplift'
  )),
  basis               TEXT NOT NULL,             -- "2% of outstanding", "R0.50/MWh", "flat R250", etc.
  amount_zar          REAL NOT NULL,
  reason              TEXT,
  calc_rule_version   TEXT NOT NULL,             -- bumped when the rule changes
  applied_after       TEXT,                      -- the precondition date (e.g. payment_due_at)
  calculated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  applied_by          TEXT,                      -- system user id, or 'system' for engine
  UNIQUE (invoice_id, fee_type, calc_rule_version)
);
CREATE INDEX IF NOT EXISTS idx_settlement_fees_invoice
  ON settlement_fees (invoice_id);
CREATE INDEX IF NOT EXISTS idx_settlement_fees_type
  ON settlement_fees (fee_type, calculated_at);

CREATE TABLE IF NOT EXISTS invoice_confirmations (
  id               TEXT PRIMARY KEY,
  invoice_id       TEXT NOT NULL,
  party            TEXT NOT NULL CHECK (party IN ('issuer','payer')),
  confirmed_by     TEXT NOT NULL,                -- participant_id
  confirmed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  status           TEXT NOT NULL CHECK (status IN ('confirmed','rejected')),
  notes            TEXT,
  UNIQUE (invoice_id, party)                     -- one decision per side
);
CREATE INDEX IF NOT EXISTS idx_invoice_confirmations_invoice
  ON invoice_confirmations (invoice_id);

CREATE TABLE IF NOT EXISTS ai_settlement_run_failures (
  id                   TEXT PRIMARY KEY,
  run_id               TEXT,                     -- settlement_runs.id
  dlq_id               TEXT,                     -- settlement_dlq.id (if reachable)
  failure_code         TEXT,                     -- e.g. 'metering_gap', 'tariff_validation_failed'
  failure_message      TEXT,
  explanation          TEXT NOT NULL,
  suggested_action     TEXT,
  confidence           REAL,                     -- 0..1
  source               TEXT NOT NULL DEFAULT 'deterministic'
    CHECK (source IN ('deterministic','ai_gateway','fallback')),
  accepted_at          TEXT,
  accepted_by          TEXT,
  dismissed_at         TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_settlement_run_failures_run
  ON ai_settlement_run_failures (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_settlement_run_failures_failure
  ON ai_settlement_run_failures (failure_code, created_at);
