-- ════════════════════════════════════════════════════════════════════════
-- 071_late_fees_variations.sql — late-payment fees + PPA variation orders
--
-- Late-payment fees: daily cron computes simple-interest fees against
-- overdue invoices using the prevailing prime rate + 1%, with a 90-day
-- accrual cap. Stored separately so the original invoice total is
-- immutable; the operator sees fees as a sidecar.
--
-- Variation orders: PPA construction projects routinely need scope or
-- budget changes. A variation order is a structured amendment proposal
-- that requires explicit lender + offtaker approval before it takes
-- effect on the underlying contract. Mirrors REIPPPP variation procedure.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Late-payment fees ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oe_late_payment_fees (
  id              TEXT PRIMARY KEY,
  invoice_id      TEXT NOT NULL REFERENCES invoices(id),
  participant_id  TEXT NOT NULL REFERENCES participants(id),
  invoice_total   REAL NOT NULL,
  days_overdue    INTEGER NOT NULL,
  annual_rate_pct REAL NOT NULL,                   -- prime + 1% snapshot
  fee_zar         REAL NOT NULL,
  computed_at     TEXT NOT NULL DEFAULT (datetime('now')),
  status          TEXT NOT NULL DEFAULT 'pending', -- pending|waived|charged|settled
  waived_by       TEXT,
  waiver_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_late_fees_invoice  ON oe_late_payment_fees(invoice_id);
CREATE INDEX IF NOT EXISTS idx_oe_late_fees_party    ON oe_late_payment_fees(participant_id, status);

-- ─── PPA Variation orders ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oe_variation_orders (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL,
  raised_by           TEXT NOT NULL,                 -- participant_id of raiser (typically EPC or IPP)
  raised_at           TEXT NOT NULL DEFAULT (datetime('now')),
  vo_number           TEXT NOT NULL,                 -- VO-001, VO-002 etc.
  category            TEXT NOT NULL,                 -- scope|cost|schedule|equipment|other
  scope_change        TEXT NOT NULL,                 -- description of change
  cost_delta_zar      REAL,                          -- + or - vs original baseline
  schedule_delta_days INTEGER,                       -- + days slippage
  rationale           TEXT NOT NULL,
  evidence_r2_key     TEXT,
  status              TEXT NOT NULL DEFAULT 'raised',
                                                     -- raised|lender_review|offtaker_review|approved|rejected|withdrawn
  lender_decision     TEXT,                          -- pending|approved|rejected
  lender_decided_by   TEXT,
  lender_decided_at   TEXT,
  lender_comment      TEXT,
  offtaker_decision   TEXT,
  offtaker_decided_by TEXT,
  offtaker_decided_at TEXT,
  offtaker_comment    TEXT,
  approved_at         TEXT,
  rejected_at         TEXT,
  rejected_reason     TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_vo_project ON oe_variation_orders(project_id, status);
CREATE INDEX IF NOT EXISTS idx_oe_vo_status  ON oe_variation_orders(status, raised_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_vo_project_number ON oe_variation_orders(project_id, vo_number);

-- ─── Prime rate snapshot (drives the late fee accrual) ─────────────────
-- Operator can update via /api/business-depth/prime-rate. Defaults to
-- the SARB published rate. Stored as a tiny time series so any past fee
-- can be reconstructed from the rate effective on its accrual day.
CREATE TABLE IF NOT EXISTS oe_prime_rate (
  effective_from   TEXT PRIMARY KEY,                  -- YYYY-MM-DD
  rate_pct         REAL NOT NULL,
  source           TEXT,                              -- SARB | manual | other
  updated_by       TEXT,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed an initial baseline rate so the cron has something to multiply.
INSERT OR IGNORE INTO oe_prime_rate (effective_from, rate_pct, source, updated_by)
VALUES ('2024-01-01', 11.75, 'SARB', 'system');
