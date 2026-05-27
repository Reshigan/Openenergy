-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 18 — Planned outage / maintenance submission chain (NERSA Grid Code).
--
-- Adds:
--   • oe_planned_outages              (submission lifecycle table)
--   • oe_planned_outage_events        (audit chain)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_planned_outages (
  id                  TEXT PRIMARY KEY,
  outage_number       TEXT UNIQUE NOT NULL,
  participant_id      TEXT NOT NULL,                  -- submitting IPP / operator
  asset_id            TEXT,                            -- om site / generator / line
  asset_name          TEXT,
  category            TEXT NOT NULL DEFAULT 'maintenance', -- maintenance|inspection|upgrade|emergency
  severity            TEXT NOT NULL DEFAULT 'medium',  -- critical|high|medium|low
  chain_status        TEXT NOT NULL DEFAULT 'draft',
  affected_mw         REAL,
  affected_zone       TEXT,
  start_at            TEXT,                            -- planned start
  end_at              TEXT,                            -- planned end
  duration_minutes    INTEGER,
  reason              TEXT,
  contingency_notes   TEXT,                            -- N-1 risk assessment
  rejection_reason    TEXT,
  sla_deadline_at     TEXT,
  last_sla_breach_at  TEXT,
  escalation_level    INTEGER NOT NULL DEFAULT 0,
  approved_by         TEXT,
  approved_at         TEXT,
  notified_at         TEXT,
  commenced_at        TEXT,
  restored_at         TEXT,
  closed_at           TEXT,
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_outages_chain     ON oe_planned_outages(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_outages_severity  ON oe_planned_outages(severity);
CREATE INDEX IF NOT EXISTS idx_oe_outages_sla       ON oe_planned_outages(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_outages_part      ON oe_planned_outages(participant_id);
CREATE INDEX IF NOT EXISTS idx_oe_outages_start     ON oe_planned_outages(start_at);

CREATE TABLE IF NOT EXISTS oe_planned_outage_events (
  id          TEXT PRIMARY KEY,
  outage_id   TEXT NOT NULL,
  event_type  TEXT NOT NULL,    -- submitted|review_started|approved|rejected|
                                 -- rescheduled|notified|commenced|restore_started|
                                 -- restored|closed|cancelled|sla_breached
  from_status TEXT,
  to_status   TEXT,
  actor_id    TEXT,
  notes       TEXT,
  payload     TEXT,              -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_outage_events_ret  ON oe_planned_outage_events(outage_id, created_at);
CREATE INDEX IF NOT EXISTS idx_oe_outage_events_type ON oe_planned_outage_events(event_type);
