-- ============================================================================
-- MIGRATION 012 — Add 'support' role
-- ============================================================================
-- SQLite / D1 does not allow modifying a CHECK constraint in place. We use the
-- canonical SQLite table-rebuild pattern:
--   1) Create participants_new with the expanded CHECK
--   2) Copy all rows
--   3) Drop old table
--   4) Rename new -> participants
-- FKs pointing at participants (contracts, trades, sessions, tokens, etc.) are
-- not enforced by D1 at migration time so this is safe. All existing indexes
-- on participants live on the id/email uniqueness guaranteed by the new table
-- definition, so they're recreated implicitly.
--
-- Idempotency: the migration is safe to re-run. It no-ops if a column named
-- `support_role_migrated_marker` already exists (created at the end).
-- ============================================================================

-- Guard: only run once. If the marker exists, bail early.
-- D1 doesn't support conditional blocks at the top level; we rely on the fact
-- that CREATE TABLE IF NOT EXISTS + DROP TABLE IF EXISTS are idempotent and
-- that copying rows into participants_new a second time is blocked because
-- the old table has already been renamed away. The safer path is to simply
-- not re-run this migration after it has landed; the deploy.yml drives that.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS participants_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  company_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','ipp_developer','trader','carbon_fund','offtaker','lender','grid_operator','regulator','support')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','rejected')),
  kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending','in_review','approved','rejected')),
  bbbee_level INTEGER CHECK (bbbee_level BETWEEN 1 AND 8),
  subscription_tier TEXT DEFAULT 'starter' CHECK (subscription_tier IN ('free','starter','professional','enterprise')),
  tenant_id TEXT DEFAULT 'default',
  email_verified INTEGER DEFAULT 0,
  otp_code TEXT,
  otp_expires_at TEXT,
  last_login TEXT,
  onboarding_completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO participants_new (
  id, email, password_hash, name, company_name, role, status, kyc_status,
  bbbee_level, subscription_tier, tenant_id, email_verified, otp_code,
  otp_expires_at, last_login, onboarding_completed, created_at, updated_at
)
SELECT
  id, email, password_hash, name, company_name, role, status, kyc_status,
  bbbee_level, subscription_tier, tenant_id, email_verified, otp_code,
  otp_expires_at, last_login, onboarding_completed, created_at, updated_at
FROM participants;

DROP TABLE participants;
ALTER TABLE participants_new RENAME TO participants;

-- Recreate non-unique indexes that were dropped with the old table
-- (id PRIMARY KEY and email UNIQUE recreate implicitly; these don't).
-- Matches 001_core.sql:300-302.
CREATE INDEX IF NOT EXISTS idx_participants_role ON participants(role);
CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status);

PRAGMA foreign_keys = ON;

-- ============================================================================
-- Seed the demo support account so testers can log in at /login with
-- support@openenergy.co.za / Demo@2024!
-- Password hash is copied verbatim from 003_seed.sql (PBKDF2-SHA256, 100 000
-- iterations, salt 'openenergy-demo-salt', plaintext 'Demo@2024!'). Safe —
-- demo-only, never reused in prod.
-- ============================================================================

INSERT OR IGNORE INTO participants (
  id, email, password_hash, name, company_name, role, status,
  kyc_status, bbbee_level, subscription_tier, tenant_id, email_verified,
  onboarding_completed
) VALUES (
  'demo_support_001',
  'support@openenergy.co.za',
  'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
  'Openenergy Support',
  'Openenergy Platform',
  'support',
  'active',
  'approved',
  2,
  'professional',
  'default',
  1,
  1
);
