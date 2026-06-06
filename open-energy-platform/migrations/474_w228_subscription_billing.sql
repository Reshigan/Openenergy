-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 474 — W228 Platform Subscription Billing & Invoice Lifecycle
-- P6 chain on oe_subscription_invoices
--
-- Legal basis:
--  Consumer Protection Act §16-17   — service agreement billing obligations
--  Electronic Communications and Transactions Act §46-50 — e-invoicing
--  POPIA §19 — billing data must be kept accurate and secure
--  Revenue recognition: IFRS 15 (monthly recurring subscription)
--
-- SLA: INVERTED — enterprise gets longest payment window (most scrutiny before
-- suspension). starter=7d, professional=14d, enterprise=21d.
-- Regulator crossing: suspend_account/write_off ALL tiers (admin oversight);
-- reactivate enterprise-only.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_subscription_invoices (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,          -- the billed participant (company)
  billing_period TEXT NOT NULL,          -- YYYY-MM (e.g. 2026-06)
  subscription_tier TEXT NOT NULL CHECK(subscription_tier IN ('starter','professional','enterprise')),

  -- Amounts
  amount_zar REAL NOT NULL,              -- gross invoice amount
  vat_zar REAL NOT NULL,                 -- 15% VAT
  total_zar REAL NOT NULL,               -- amount_zar + vat_zar
  discount_zar REAL DEFAULT 0,           -- negotiated discount if any
  net_payable_zar REAL NOT NULL,         -- total_zar - discount_zar

  -- Line items (JSON array of {description, qty, unit_price_zar})
  line_items TEXT NOT NULL DEFAULT '[]',

  -- Payment details
  payment_method TEXT CHECK(payment_method IN ('eft','debit_order','bank_wire','card','credit_note')),
  payment_ref TEXT,
  payment_date TEXT,
  payment_amount_zar REAL,
  bank_reference TEXT,

  -- Dunning state
  dunning_notices_sent INTEGER DEFAULT 0,  -- 0, 1 (dunning_1), 2 (dunning_2)
  suspension_reason TEXT,
  waiver_reason TEXT,
  write_off_reason TEXT,

  -- Chain state
  chain_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(chain_status IN (
      'draft',           -- generated, not yet sent
      'issued',          -- sent to participant
      'payment_pending', -- acknowledged, awaiting payment
      'paid',            -- payment received; terminal
      'overdue',         -- past payment due date
      'dunning_1',       -- first dunning notice sent
      'dunning_2',       -- final dunning notice sent
      'suspended',       -- account suspended for non-payment; terminal
      'cancelled',       -- invoice voided before payment; terminal
      'waived',          -- debt forgiven by admin; terminal
      'written_off'      -- uncollectible, written off; terminal
    )),

  -- SLA
  sla_deadline TEXT,                     -- payment due date
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sub_invoice_participant
  ON oe_subscription_invoices(participant_id, chain_status);
CREATE INDEX IF NOT EXISTS idx_sub_invoice_period
  ON oe_subscription_invoices(billing_period, subscription_tier);
CREATE INDEX IF NOT EXISTS idx_sub_invoice_status
  ON oe_subscription_invoices(chain_status, sla_deadline);
