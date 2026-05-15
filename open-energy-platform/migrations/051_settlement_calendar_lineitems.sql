-- ════════════════════════════════════════════════════════════════════════
-- 051 · Settlement calendar + structured invoice line items
--
-- Phase 3 of the trading-depth deepening sequence. Phase 1 added
-- pre-trade gating; Phase 2 fleshed out the order lifecycle. This phase
-- gives settlement the same treatment by introducing the missing
-- primitives that make settlement runs predictable + auditable rather
-- than ad-hoc cron triggers:
--
--   settlement_calendar — one row per trading_day per market_zone
--     carrying the four T+N timestamps that gate the settlement chain:
--     gate_close_at  (no more nominations)        T+0 18:00
--     metering_close_at (meter cut-off)           T+1 06:00
--     invoice_run_at (settlement engine fires)    T+1 12:00
--     payment_due_at (cash must clear)            T+5 17:00
--   The cron + the settlement-auto runs route can both look up
--   "what's due" from a single source of truth, and the SPA Calendar
--   tab can render the next 7 days at a glance.
--
--   invoice_line_items — replaces the opaque `line_items TEXT` blob
--     on `invoices` with a structured per-charge breakdown so:
--       - the invoice PDF can show energy_charge / take_or_pay_uplift /
--         wheeling_charge / system_charge / tax / adjustment as
--         separate rows with formula explanations
--       - regulator audit pulls per-line history without parsing JSON
--       - credit-note / debit-note adjustments append cleanly later
--     The legacy `line_items` column stays writable for backward compat
--     but is no longer the source of truth.
--
--   invoice_sequences — per-tenant per-year monotonic counter for the
--     real "OE-{tenant}-{YYYY}-{NNNNNN}" invoice numbering scheme.
--     Replaces the previous "slice the random id" approach.
--
-- All ALTERs are additive; existing rows are not touched. A backfill
-- pass is intentionally NOT run — old invoices keep their JSON line_items
-- blob and their existing numbers.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settlement_calendar (
  id                 TEXT PRIMARY KEY,
  trading_day        TEXT NOT NULL,                  -- YYYY-MM-DD (T+0)
  market_zone        TEXT NOT NULL DEFAULT 'ZA',
  gate_close_at      TEXT NOT NULL,                  -- ISO; nominations cut-off
  metering_close_at  TEXT NOT NULL,                  -- ISO; metering cut-off (T+1)
  invoice_run_at     TEXT NOT NULL,                  -- ISO; settlement engine fires (T+1)
  payment_due_at     TEXT NOT NULL,                  -- ISO; cash clearing deadline (T+5)
  status             TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','gate_closed','metering_closed','invoiced','settled','disputed','cancelled')),
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (trading_day, market_zone)
);
CREATE INDEX IF NOT EXISTS idx_settlement_calendar_day
  ON settlement_calendar (trading_day);
CREATE INDEX IF NOT EXISTS idx_settlement_calendar_status_invoice_run
  ON settlement_calendar (status, invoice_run_at);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id                  TEXT PRIMARY KEY,
  invoice_id          TEXT NOT NULL,
  sequence_no         INTEGER NOT NULL,
  line_type           TEXT NOT NULL CHECK (line_type IN (
    'energy_charge','take_or_pay_uplift','wheeling_charge','system_charge',
    'imbalance_charge','ancillary_charge','tax','adjustment','credit_note'
  )),
  description         TEXT NOT NULL,
  quantity            REAL,                           -- e.g. MWh delivered; null for fixed-fee lines
  unit                TEXT,                           -- 'MWh' | 'kWh' | 'unit'
  unit_price_zar      REAL,                           -- null for fixed-fee lines
  amount_zar          REAL NOT NULL,                  -- signed; +ve owed, -ve credit
  contract_id         TEXT,
  period_start        TEXT,
  period_end          TEXT,
  formula_explanation TEXT,                           -- e.g. "27.4 MWh × R1,650/MWh = R45,210"
  meta_json           TEXT,                           -- arbitrary structured context (rule applied, etc.)
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice
  ON invoice_line_items (invoice_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_type
  ON invoice_line_items (line_type);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  tenant_id    TEXT NOT NULL,
  year         INTEGER NOT NULL,
  next_value   INTEGER NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, year)
);
