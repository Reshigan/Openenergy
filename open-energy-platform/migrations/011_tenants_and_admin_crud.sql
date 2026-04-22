-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 011 — Tenants table for admin CRUD (PR-Prod-Admin-CRUD)
--
-- Prior to this migration, `participants.tenant_id` was a free-text column
-- with no referential source-of-truth. The admin console now has full CRUD on
-- tenants backed by a first-class `tenants` table; the 'default' tenant is
-- seeded and remains the fallback used by auth middleware.
--
-- All statements are idempotent (IF NOT EXISTS / INSERT OR IGNORE) so this
-- migration can be re-applied safely by the deploy workflow.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- Seed the default tenant so the relationship is consistent. Any participant
-- whose tenant_id is NULL or missing a matching row continues to resolve to
-- 'default' via the fall-back in auth middleware.
INSERT OR IGNORE INTO tenants (id, slug, display_name, description, created_at)
VALUES ('default', 'default', 'Default tenant', 'Auto-provisioned default tenant for the Open Energy platform.', datetime('now'));
