-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 17 — Carbon credit retirement chain (P6 lifecycle on carbon_retirements).
--
-- Adds:
--   • carbon_retirements.chain_status, scope, sla_deadline_at,
--     last_sla_breach_at, escalation_level, validation_notes,
--     rejection_reason, certificate_hash
--   • oe_retirement_chain_events                 (audit chain)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE carbon_retirements ADD COLUMN chain_status TEXT NOT NULL DEFAULT 'requested';
ALTER TABLE carbon_retirements ADD COLUMN scope TEXT NOT NULL DEFAULT 'voluntary';
ALTER TABLE carbon_retirements ADD COLUMN sla_deadline_at TEXT;
ALTER TABLE carbon_retirements ADD COLUMN last_sla_breach_at TEXT;
ALTER TABLE carbon_retirements ADD COLUMN escalation_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE carbon_retirements ADD COLUMN validation_notes TEXT;
ALTER TABLE carbon_retirements ADD COLUMN rejection_reason TEXT;
ALTER TABLE carbon_retirements ADD COLUMN certificate_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_carbon_retire_chain   ON carbon_retirements(chain_status);
CREATE INDEX IF NOT EXISTS idx_carbon_retire_scope   ON carbon_retirements(scope);
CREATE INDEX IF NOT EXISTS idx_carbon_retire_sla     ON carbon_retirements(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_retirement_chain_events (
  id           TEXT PRIMARY KEY,
  retirement_id TEXT NOT NULL,
  event_type   TEXT NOT NULL,        -- validation_started | adjustment_pending |
                                      -- adjusted | retired | rejected | cancelled |
                                      -- sla_breached
  from_status  TEXT,
  to_status    TEXT,
  actor_id     TEXT,
  notes        TEXT,
  payload      TEXT,                  -- JSON
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_retire_events_ret  ON oe_retirement_chain_events(retirement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_retire_events_type ON oe_retirement_chain_events(event_type);
