-- Migration 504: Performance indexes for oe_role_action_queue feed sort
-- and audit_logs actor/time queries. Safe to re-run (IF NOT EXISTS).

-- Covering index for the feed list query:
--   WHERE target_role=? AND status IN (...) ORDER BY priority, sla_due_at, created_at DESC
CREATE INDEX IF NOT EXISTS idx_role_queue_role_status_sla
  ON oe_role_action_queue(target_role, status, sla_due_at, created_at DESC);

-- Index for actor-filtered audit trail queries and regulator evidence exports
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON audit_logs(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs(created_at DESC);
