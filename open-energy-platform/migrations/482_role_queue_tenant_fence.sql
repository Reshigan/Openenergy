-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 482 — Tenant fence on oe_role_action_queue (GL-002 go-live fix).
-- Adds tenant_id so role-wide rows (target_participant_id NULL) are never
-- visible across tenants. Existing rows default to 'default' (single-tenant
-- demo data). The SCOPE predicate in role-actions.ts gains AND tenant_id = ?.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE oe_role_action_queue ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_role_queue_tenant_role_status
  ON oe_role_action_queue(tenant_id, target_role, status);
