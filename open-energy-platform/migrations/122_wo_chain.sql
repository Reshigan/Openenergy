-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 16 — Work Order chain (P6 dispatch lifecycle layered on om_work_orders).
--
-- Adds:
--   • om_work_orders.chain_status            (defaults to 'created')
--   • om_work_orders.last_sla_breach_at      (throttle for cron)
--   • om_work_orders.escalation_level        (0..3)
--   • om_wo_chain_events                     (audit chain)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE om_work_orders ADD COLUMN chain_status TEXT NOT NULL DEFAULT 'created';
ALTER TABLE om_work_orders ADD COLUMN last_sla_breach_at TEXT;
ALTER TABLE om_work_orders ADD COLUMN escalation_level INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_om_wo_chain_status ON om_work_orders(chain_status);
CREATE INDEX IF NOT EXISTS idx_om_wo_chain_sla    ON om_work_orders(sla_deadline);

CREATE TABLE IF NOT EXISTS om_wo_chain_events (
  id              TEXT PRIMARY KEY,
  wo_id           TEXT NOT NULL,
  event_type      TEXT NOT NULL,         -- assigned | acknowledged | departed | arrived |
                                          -- diagnosed | repair_started | tested | completed |
                                          -- verified | closed | cancelled | sla_breached
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  notes           TEXT,
  payload         TEXT,                  -- JSON
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_om_wo_chain_events_wo   ON om_wo_chain_events(wo_id, created_at);
CREATE INDEX IF NOT EXISTS idx_om_wo_chain_events_type ON om_wo_chain_events(event_type);
