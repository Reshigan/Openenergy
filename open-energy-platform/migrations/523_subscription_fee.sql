-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 523 — fee_schedule row for the monthly subscription invoice.
--
-- The oe_subscription_invoices row itself carries the actual tier-priced
-- amount + 15% VAT (see SUBSCRIPTION_AMOUNTS_ZAR in subscription-billing-spec).
-- This fee_schedule entry exists so the fee engine and revenue reporting can
-- recognise the monthly subscription invoice event alongside the other platform
-- fees. Idempotent via INSERT OR IGNORE; fee_type='platform' is the closest
-- existing CHECK-bound category (fee_schedule does not define a dedicated
-- 'subscription' fee_type).
--
-- The fee_schedule table is created by 003_seed.sql. The CREATE TABLE IF NOT
-- EXISTS below is a no-op on prod (where 003 has run) and a safety net for
-- clean-room replays that skip seed migrations (e.g. the integration test
-- harness), so this migration never fails on a missing fee_schedule table.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fee_schedule (
  id TEXT PRIMARY KEY,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('trading_commission','carbon_transaction','escrow','disbursement','management','platform','currency')),
  description TEXT,
  rate_type TEXT NOT NULL CHECK (rate_type IN ('fixed','percentage','tiered')),
  rate_value REAL NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  min_amount REAL,
  max_amount REAL,
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO fee_schedule
  (id, fee_type, description, rate_type, rate_value, currency, effective_from)
VALUES
  ('fee_sub_invoice', 'platform', 'Monthly SaaS subscription invoice (tier-priced; see oe_subscription_invoices)', 'fixed', 0, 'ZAR', '2024-01-01');