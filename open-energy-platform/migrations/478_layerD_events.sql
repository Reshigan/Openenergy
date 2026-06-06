-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 478 — Ecosystem Layer D: analytics event sink
-- Append-only log of every PlatformEvent. The nightly rollup cron aggregates
-- this into oe_metrics_daily / oe_chain_metrics (migration 479). Dashboards
-- read rollups, never this raw table, so it can grow + be R2-archived monthly.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_platform_events (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  chain_key TEXT,
  entity_type TEXT,
  entity_id TEXT,
  actor_id TEXT,
  source_chain_status TEXT,
  affected_roles TEXT,                       -- JSON array of PlatformRole
  entity_value REAL,
  data_json TEXT DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_events_event
  ON oe_platform_events(event, occurred_at);
CREATE INDEX IF NOT EXISTS idx_platform_events_chain
  ON oe_platform_events(chain_key, occurred_at);
CREATE INDEX IF NOT EXISTS idx_platform_events_entity
  ON oe_platform_events(entity_type, entity_id);
