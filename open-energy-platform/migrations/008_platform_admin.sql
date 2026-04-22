-- ============================================================================
-- Migration 008: Platform admin + POPIA + per-participant module toggles
-- Adds tables referenced by modules.ts, popia.ts, admin.ts that were never
-- created in 001 or 002 so the routes silently 500'd on first use.
-- ============================================================================

-- Per-participant module enablement (separate from the platform-wide `modules`
-- catalog table in 001_core). Enables admins to grant/revoke access to
-- individual participants without touching billing/tier.
CREATE TABLE IF NOT EXISTS platform_modules (
  participant_id TEXT NOT NULL REFERENCES participants(id),
  module_id TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  granted_by TEXT REFERENCES participants(id),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_modules_participant ON platform_modules(participant_id);

-- POPIA consent ledger. One row per participant; updated in place so we have
-- a current snapshot. For an audit trail, audit_logs already captures the
-- old/new values on every write.
CREATE TABLE IF NOT EXISTS popia_consents (
  participant_id TEXT PRIMARY KEY REFERENCES participants(id),
  marketing INTEGER DEFAULT 0,
  data_sharing INTEGER DEFAULT 0,
  third_party INTEGER DEFAULT 0,
  analytics INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- POPIA Right-to-Erasure requests (Section 24 POPIA 4 of 2013).
CREATE TABLE IF NOT EXISTS popia_erasure_requests (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_review','completed','rejected')),
  processed_by TEXT REFERENCES participants(id),
  processed_at TEXT,
  resolution_notes TEXT,
  requested_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_popia_erasure_status ON popia_erasure_requests(status);

-- POPIA Data-Access (DSAR) requests — Section 23.
CREATE TABLE IF NOT EXISTS popia_dsar_requests (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  scope TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_review','completed','rejected')),
  export_r2_key TEXT,
  processed_by TEXT REFERENCES participants(id),
  processed_at TEXT,
  requested_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_popia_dsar_status ON popia_dsar_requests(status);
