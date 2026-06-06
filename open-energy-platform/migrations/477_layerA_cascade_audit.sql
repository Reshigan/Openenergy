-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 477 — Ecosystem Layer A: cascade-rule audit + algo trading blocks
-- oe_cascade_rule_audit: one row per registry rule evaluation (ran/skipped/
--   blocked/error) — observability for the new event bus.
-- oe_algo_trading_blocks: a kill-switch/cert-failure block list the pre-trade
--   guard reads (W2 wires the guard; the table lands now so the seam exists).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_cascade_rule_audit (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  source_event TEXT NOT NULL,
  source_entity_type TEXT,
  source_entity_id TEXT,
  mode TEXT,                                 -- drive | block
  outcome TEXT NOT NULL CHECK(outcome IN ('ran','skipped','blocked','error')),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cascade_rule_audit_rule
  ON oe_cascade_rule_audit(rule_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cascade_rule_audit_source
  ON oe_cascade_rule_audit(source_entity_type, source_entity_id);

CREATE TABLE IF NOT EXISTS oe_algo_trading_blocks (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  algo_cert_id TEXT,
  block_reason TEXT NOT NULL,
  source_event TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  lifted_at TEXT,
  lifted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_algo_blocks_participant
  ON oe_algo_trading_blocks(participant_id, is_active);
