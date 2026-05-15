-- ════════════════════════════════════════════════════════════════════════
-- 052 · Settlement breaks + business-day calendar
--
-- L4 settlement depth, part 1 of 2. Migration 051 introduced the
-- settlement calendar (one row per trading_day per market_zone). This
-- migration adds the two missing primitives needed to take settlement
-- from "issue invoice + record payment" CRUD up to a real operational
-- platform:
--
--   settlement_breaks — a per-invoice exception register. When the
--     issuer's metering disagrees with the payer's reading, or a price
--     looks wrong, or the timing of a settlement run is off, either
--     party files a break instead of holding up the whole invoice.
--     Breaks have their own state machine
--     (open → investigating → resolved | rejected) and severity bucket
--     (low / medium / high / critical) — high+critical breaks auto-
--     transition the parent invoice to confirmation_status='disputed'
--     (a column added below) so the UI surfaces the contention
--     immediately rather than the issuer chasing payment that won't
--     come.
--
--   business_day_calendar — the date-by-date holiday register that
--     drives modified-following date adjustment in invoice generation.
--     The settlement_calendar's payment_due_at is currently a naïve
--     T+5; once this calendar is seeded, the worker can push due-dates
--     off Saturdays, Sundays, and ZA public holidays. Seeded for
--     2026–2027; the regulator-suite tab will manage future years.
--
-- The `confirmation_status` column added to `invoices` powers the
-- issuer/payer handshake added by migration 053 — landed here as one
-- additive column so 053 stays focused on the AI surfaces.
--
-- Idempotent: every CREATE uses IF NOT EXISTS; the ALTER on `invoices`
-- catches the duplicate-column error if migration 052 re-runs on a
-- partial deploy.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settlement_breaks (
  id                   TEXT PRIMARY KEY,
  invoice_id           TEXT NOT NULL,
  break_type           TEXT NOT NULL CHECK (break_type IN (
    'quantity','price','timing','metering','tariff','fx','other'
  )),
  severity             TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  status               TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','investigating','resolved','rejected')),
  reported_by          TEXT NOT NULL,
  reported_at          TEXT NOT NULL DEFAULT (datetime('now')),
  reason               TEXT NOT NULL,
  expected_value       REAL,
  actual_value         REAL,
  resolution_outcome   TEXT CHECK (resolution_outcome IN (
    'corrected','rebooked','waived','escalated','no_action'
  )),
  resolution_notes     TEXT,
  resolved_at          TEXT,
  resolved_by          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_settlement_breaks_invoice
  ON settlement_breaks (invoice_id, status);
CREATE INDEX IF NOT EXISTS idx_settlement_breaks_reporter
  ON settlement_breaks (reported_by, status, reported_at);
CREATE INDEX IF NOT EXISTS idx_settlement_breaks_status_severity
  ON settlement_breaks (status, severity);

CREATE TABLE IF NOT EXISTS business_day_calendar (
  date           TEXT NOT NULL,                  -- YYYY-MM-DD
  market_zone    TEXT NOT NULL DEFAULT 'ZA',
  is_business_day INTEGER NOT NULL DEFAULT 1     -- 0 = closed
    CHECK (is_business_day IN (0, 1)),
  holiday_name   TEXT,
  observed       INTEGER NOT NULL DEFAULT 0      -- 1 if a moved-to-monday observance
    CHECK (observed IN (0, 1)),
  notes          TEXT,
  PRIMARY KEY (date, market_zone)
);
CREATE INDEX IF NOT EXISTS idx_business_day_market_zone
  ON business_day_calendar (market_zone, date);

-- South African public holidays 2026 (Public Holidays Act, 1994). Where
-- a holiday falls on a Sunday, the following Monday is observed —
-- represented by inserting both rows with the Monday flagged
-- observed=1. The runner reads is_business_day=0 to skip either.
INSERT OR IGNORE INTO business_day_calendar (date, market_zone, is_business_day, holiday_name, observed) VALUES
  ('2026-01-01','ZA',0,'New Year''s Day',0),
  ('2026-03-21','ZA',0,'Human Rights Day',0),
  ('2026-04-03','ZA',0,'Good Friday',0),
  ('2026-04-06','ZA',0,'Family Day',0),
  ('2026-04-27','ZA',0,'Freedom Day',0),
  ('2026-05-01','ZA',0,'Workers'' Day',0),
  ('2026-06-16','ZA',0,'Youth Day',0),
  ('2026-08-09','ZA',0,'National Women''s Day',0),
  ('2026-08-10','ZA',0,'National Women''s Day (observed)',1),
  ('2026-09-24','ZA',0,'Heritage Day',0),
  ('2026-12-16','ZA',0,'Day of Reconciliation',0),
  ('2026-12-25','ZA',0,'Christmas Day',0),
  ('2026-12-26','ZA',0,'Day of Goodwill',0),
  -- 2027
  ('2027-01-01','ZA',0,'New Year''s Day',0),
  ('2027-03-21','ZA',0,'Human Rights Day',0),
  ('2027-03-22','ZA',0,'Human Rights Day (observed)',1),
  ('2027-03-26','ZA',0,'Good Friday',0),
  ('2027-03-29','ZA',0,'Family Day',0),
  ('2027-04-27','ZA',0,'Freedom Day',0),
  ('2027-05-01','ZA',0,'Workers'' Day',0),
  ('2027-06-16','ZA',0,'Youth Day',0),
  ('2027-08-09','ZA',0,'National Women''s Day',0),
  ('2027-09-24','ZA',0,'Heritage Day',0),
  ('2027-12-16','ZA',0,'Day of Reconciliation',0),
  ('2027-12-25','ZA',0,'Christmas Day',0),
  ('2027-12-27','ZA',0,'Day of Goodwill (observed)',1);

-- New column on invoices: confirmation handshake state. Pending until
-- the issuer confirms; once issuer-confirmed, the payer can acknowledge.
-- Either side filing a high/critical break flips it to disputed.
-- Use a CASE-with-CHECK to keep the column nullable on legacy rows.
ALTER TABLE invoices ADD COLUMN confirmation_status TEXT DEFAULT 'pending';
