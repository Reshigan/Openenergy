-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 14 — Support ticket P6 chain.
--
-- Deepens the L2 support_tickets schema (mig 056) into a regulator-grade
-- state-machine + per-priority SLA chain.
--
-- States (7): open → triaged → in_progress → awaiting_user → resolved → closed
--             + escalated (terminal, regulator-inbox crossing for P1/compliance)
--
-- Per-priority SLA windows (NIST-/CSAT-aligned, minutes):
--   priority   triage    first_response   resolution
--   urgent (P1)   60         120              240
--   high   (P2)  120         240             1440
--   normal (P3)  240         480             7200
--   low    (P4)  480        1440            21600
--
-- POPIA-grade: cross-tenant access is already audited via
-- support_cross_tenant_access (mig 056); this wave adds chain audit
-- events for the ticket state machine.
--
-- ALTERs are idempotent — "duplicate column name" is treated as already-applied
-- by the irregular-band deploy script.
-- ═══════════════════════════════════════════════════════════════════════════

-- SLA + chain bookkeeping columns
ALTER TABLE support_tickets ADD COLUMN chain_status TEXT NOT NULL DEFAULT 'open'
  CHECK (chain_status IN (
    'open','triaged','in_progress','awaiting_user',
    'resolved','closed','escalated'
  ));
ALTER TABLE support_tickets ADD COLUMN triaged_at TEXT;
ALTER TABLE support_tickets ADD COLUMN first_responded_at TEXT;
ALTER TABLE support_tickets ADD COLUMN waiting_since TEXT;
ALTER TABLE support_tickets ADD COLUMN reopened_at TEXT;
ALTER TABLE support_tickets ADD COLUMN escalated_at TEXT;
ALTER TABLE support_tickets ADD COLUMN escalation_reason TEXT;
ALTER TABLE support_tickets ADD COLUMN next_sla_due_at TEXT;
ALTER TABLE support_tickets ADD COLUMN next_sla_window TEXT
  CHECK (next_sla_window IS NULL OR next_sla_window IN ('triage','first_response','resolution'));
ALTER TABLE support_tickets ADD COLUMN last_sla_breach_at TEXT;
ALTER TABLE support_tickets ADD COLUMN sla_breach_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN triaged_by TEXT;
ALTER TABLE support_tickets ADD COLUMN closed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_support_tickets_chain
  ON support_tickets (chain_status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla
  ON support_tickets (next_sla_due_at) WHERE next_sla_due_at IS NOT NULL;

-- Audit chain — append-only per-transition log.
CREATE TABLE IF NOT EXISTS oe_support_ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'opened','triaged','picked_up','wait_for_user',
    'user_responded','resolved','closed','reopened',
    'escalated','sla_breached','note'
  )),
  from_status TEXT,
  to_status TEXT,
  sla_window TEXT,
  actor_id TEXT,
  notes TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_evt_ticket
  ON oe_support_ticket_events (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ticket_evt_type
  ON oe_support_ticket_events (event_type);
