-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 479 — Ecosystem Layer D: pre-aggregated rollups
-- oe_metrics_daily: per-day per-chain aggregates (events, value, breaches).
-- oe_chain_metrics: rolling current snapshot per chain (open/terminal/breach).
-- Refreshed by the nightly metrics-rollup cron (wired in Week 4).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_metrics_daily (
  id TEXT PRIMARY KEY,
  metric_date TEXT NOT NULL,                 -- YYYY-MM-DD
  chain_key TEXT NOT NULL,
  events_count INTEGER NOT NULL DEFAULT 0,
  value_total_zar REAL NOT NULL DEFAULT 0,
  sla_breaches INTEGER NOT NULL DEFAULT 0,
  regulator_crossings INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(metric_date, chain_key)
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_date
  ON oe_metrics_daily(metric_date);

CREATE TABLE IF NOT EXISTS oe_chain_metrics (
  chain_key TEXT PRIMARY KEY,
  open_count INTEGER NOT NULL DEFAULT 0,
  terminal_count INTEGER NOT NULL DEFAULT 0,
  breach_count INTEGER NOT NULL DEFAULT 0,
  value_total_zar REAL NOT NULL DEFAULT 0,
  last_event_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
