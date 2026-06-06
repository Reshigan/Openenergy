-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 475 — Ecosystem Layer B: Commercial Intercept
-- Fee schedule (config), recorded platform revenue, and per-party splits.
-- Fees ship ALL FREE: oe_fee_schedule rows default is_enabled=0; the engine
-- records R0 'waived' revenue until an operator flips a row on (no deploy).
-- Payer is per-fee: payer_role + payer_resolution(initiator|beneficiary|split|platform).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_fee_schedule (
  id TEXT PRIMARY KEY,
  trigger_event TEXT NOT NULL UNIQUE,        -- the PlatformEvent that bills (e.g. ppa_evt_activated)
  fee_type TEXT NOT NULL CHECK(fee_type IN ('bps','flat_zar','pct')),
  rate REAL NOT NULL DEFAULT 0,              -- bps: basis points; flat_zar: ZAR; pct: 0..1
  min_fee_zar REAL DEFAULT 0,
  max_fee_zar REAL,                          -- NULL = uncapped
  applicable_tiers TEXT DEFAULT '[]',        -- JSON array of tier strings; [] = all
  payer_role TEXT,                           -- explicit payer when resolution=initiator override
  payer_resolution TEXT NOT NULL DEFAULT 'initiator'
    CHECK(payer_resolution IN ('initiator','beneficiary','split','platform')),
  is_enabled INTEGER NOT NULL DEFAULT 0,     -- ALL FREE at launch
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_platform_revenue (
  id TEXT PRIMARY KEY,
  trigger_event TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT,
  participant_id TEXT,
  payer_role TEXT,
  entity_value REAL,                         -- the ZAR value the fee was computed against
  fee_zar REAL NOT NULL DEFAULT 0,
  fee_schedule_id TEXT,
  billing_period TEXT,                       -- YYYY-MM
  invoice_id TEXT,                           -- set when rolled into a subscription invoice
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','invoiced','paid','waived')),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_revenue_period
  ON oe_platform_revenue(billing_period, status);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_participant
  ON oe_platform_revenue(participant_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_event
  ON oe_platform_revenue(trigger_event, recorded_at);

CREATE TABLE IF NOT EXISTS oe_revenue_splits (
  id TEXT PRIMARY KEY,
  revenue_id TEXT NOT NULL,
  party_role TEXT NOT NULL,
  party_id TEXT,
  share_pct REAL NOT NULL,                   -- 0..1
  amount_zar REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_revenue_splits_revenue
  ON oe_revenue_splits(revenue_id);
