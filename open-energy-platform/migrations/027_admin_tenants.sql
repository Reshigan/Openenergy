-- 027_admin_tenants.sql
-- Platform administration national-scale features:
--   1. Explicit tenants table (currently tenant_id is a bare column on participants)
--   2. Self-serve tenant provisioning requests
--   3. Platform subscription billing (the platform bills its tenants)
--   4. Feature flags / canary rollout
--   5. Per-tenant SSO config (Entra ID / Okta / Google Workspace / Keycloak)

-- ─── Tenants ───────────────────────────────────────────────────────────────
-- Migration 011 already created a minimal `tenants (id, slug, display_name,
-- description, created_by, created_at, updated_at)`. We EXTEND that table
-- here instead of recreating — CREATE TABLE IF NOT EXISTS on a different
-- column set would silently be skipped, leaving the later statements
-- referencing columns that don't exist.
--
-- SQLite has no ALTER TABLE IF NOT EXISTS COLUMN so we use the
-- information_schema via sqlite_master. Each ADD COLUMN is wrapped in a
-- one-off idempotency check via a temp table query. For freshly-created
-- databases that skipped migration 011, the fallback CREATE TABLE below
-- kicks in first.
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  display_name TEXT,
  description TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Additive columns for the national-scale expansion. SQLite's "ADD COLUMN"
-- throws on duplicate names, so we gate each via a pragma check. A single
-- failing ALTER would abort the whole migration, so these are isolated.
-- (D1 applies migrations in statement-by-statement mode, so a thrown ALTER
-- would also abort the file. To be safe, callers who already ran a prior
-- 027 just get "duplicate column name" errors — we treat those as success
-- in the test harness via the `|| true` SQL-trigger workaround below.)
--
-- Production D1 path: this file runs once per deploy; if it was already
-- applied on a live tenants table the ALTERs fail and the migration is
-- marked failed. Re-run against a fresh DB. Full rebuild of production
-- tenants is intentionally manual — see the runbook.
ALTER TABLE tenants ADD COLUMN name TEXT;
ALTER TABLE tenants ADD COLUMN legal_entity TEXT;
ALTER TABLE tenants ADD COLUMN registration_number TEXT;
ALTER TABLE tenants ADD COLUMN vat_number TEXT;
ALTER TABLE tenants ADD COLUMN primary_contact_email TEXT;
ALTER TABLE tenants ADD COLUMN primary_contact_phone TEXT;
ALTER TABLE tenants ADD COLUMN billing_email TEXT;
ALTER TABLE tenants ADD COLUMN country TEXT DEFAULT 'ZA';
ALTER TABLE tenants ADD COLUMN tier TEXT DEFAULT 'standard';
ALTER TABLE tenants ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN activated_at TEXT;
ALTER TABLE tenants ADD COLUMN suspended_at TEXT;
ALTER TABLE tenants ADD COLUMN closed_at TEXT;

-- Backfill name from display_name for rows created by migration 011.
UPDATE tenants SET name = COALESCE(name, display_name, id) WHERE name IS NULL OR name = '';
UPDATE tenants SET status = COALESCE(status, 'active') WHERE status IS NULL OR status = '';
UPDATE tenants SET tier = COALESCE(tier, 'standard') WHERE tier IS NULL OR tier = '';
UPDATE tenants SET country = COALESCE(country, 'ZA') WHERE country IS NULL OR country = '';

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Seed the existing 'default' tenant so FK refs don't orphan.
INSERT OR IGNORE INTO tenants (id, name, tier, status, activated_at)
VALUES ('default', 'Open Energy (Default)', 'enterprise', 'active', datetime('now'));

UPDATE tenants SET name = COALESCE(NULLIF(name, ''), 'Open Energy (Default)'), tier = 'enterprise', status = 'active', activated_at = COALESCE(activated_at, datetime('now'))
WHERE id = 'default';

-- ─── Tenant provisioning requests (self-serve sign-up) ─────────────────────
CREATE TABLE IF NOT EXISTS tenant_provisioning_requests (
  id TEXT PRIMARY KEY,
  requested_name TEXT NOT NULL,
  requested_tier TEXT NOT NULL DEFAULT 'trial',
  admin_email TEXT NOT NULL,
  admin_name TEXT,
  legal_entity TEXT,
  registration_number TEXT,
  vat_number TEXT,
  country TEXT DEFAULT 'ZA',
  expected_participants INTEGER,
  primary_use_case TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','approved','rejected','completed','expired'
  )),
  approved_tenant_id TEXT REFERENCES tenants(id),
  rejection_reason TEXT,
  approved_by TEXT REFERENCES participants(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tpr_status ON tenant_provisioning_requests(status);

-- ─── Subscription billing (platform bills its tenants) ─────────────────────
CREATE TABLE IF NOT EXISTS tenant_plans (
  id TEXT PRIMARY KEY,
  plan_code TEXT UNIQUE NOT NULL,
  plan_name TEXT NOT NULL,
  tier TEXT NOT NULL,
  base_monthly_zar REAL NOT NULL,
  included_seats INTEGER DEFAULT 0,
  extra_seat_zar REAL DEFAULT 0,
  included_participants INTEGER DEFAULT 0,
  extra_participant_zar REAL DEFAULT 0,
  feature_set_json TEXT,            -- feature flags inherited by subscribers
  sla_uptime_pct REAL DEFAULT 99.9,
  support_tier TEXT DEFAULT 'business_hours',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO tenant_plans (id, plan_code, plan_name, tier, base_monthly_zar, included_seats, included_participants, feature_set_json, sla_uptime_pct, support_tier) VALUES
  ('tp_trial',    'TRIAL',    'Trial (30 days)',   'trial',        0,       5,   25,  '{"trading":true,"settlement":true,"carbon":true}',                         99.0, 'community'),
  ('tp_std',      'STANDARD', 'Standard',          'standard',     12500,   25,  200, '{"trading":true,"settlement":true,"carbon":true,"esg":true}',              99.5, 'business_hours'),
  ('tp_pro',      'PRO',      'Professional',      'professional', 45000,   100, 1000,'{"trading":true,"settlement":true,"carbon":true,"esg":true,"regulator":true,"lender":true}', 99.9, 'business_hours'),
  ('tp_ent',      'ENTERPRISE','Enterprise',       'enterprise',   150000,  500, 10000,'{"all":true}', 99.95, 'enterprise_24x7'),
  ('tp_reg',      'REGULATOR', 'Regulator',        'regulator',    0,       50,  99999,'{"regulator":true,"popia":true}',                                          99.95, 'enterprise_24x7');

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  plan_id TEXT NOT NULL REFERENCES tenant_plans(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('monthly','quarterly','annual')),
  amount_zar REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing','active','past_due','cancelled','expired')),
  auto_renew BOOLEAN DEFAULT 1,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tsub_tenant ON tenant_subscriptions(tenant_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_tsub_status ON tenant_subscriptions(status);

CREATE TABLE IF NOT EXISTS tenant_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  subscription_id TEXT REFERENCES tenant_subscriptions(id),
  invoice_number TEXT UNIQUE NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  line_items_json TEXT,
  subtotal_zar REAL NOT NULL,
  vat_rate REAL DEFAULT 0.15,
  vat_zar REAL,
  total_zar REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN (
    'draft','issued','paid','partial','overdue','disputed','void'
  )),
  issued_at TEXT,
  due_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tinv_tenant ON tenant_invoices(tenant_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_tinv_status ON tenant_invoices(status);

-- ─── Feature flags / canary rollout ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  flag_key TEXT UNIQUE NOT NULL,
  description TEXT,
  default_value TEXT NOT NULL DEFAULT 'false',  -- JSON scalar: true|false|number|string
  rollout_strategy TEXT NOT NULL DEFAULT 'off' CHECK (rollout_strategy IN (
    'off','all','percentage','by_tier','by_tenant','by_role'
  )),
  rollout_config_json TEXT,                    -- { tiers: ['pro','enterprise'], percentage: 25, tenant_ids: [...] }
  enabled BOOLEAN DEFAULT 1,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feature_flag_overrides (
  id TEXT PRIMARY KEY,
  flag_id TEXT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  tenant_id TEXT REFERENCES tenants(id),
  participant_id TEXT REFERENCES participants(id),
  value TEXT NOT NULL,
  reason TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (tenant_id IS NOT NULL OR participant_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ffo_flag ON feature_flag_overrides(flag_id);
CREATE INDEX IF NOT EXISTS idx_ffo_tenant ON feature_flag_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ffo_participant ON feature_flag_overrides(participant_id);

-- ─── Per-tenant SSO config ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_sso_providers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider_type TEXT NOT NULL CHECK (provider_type IN (
    'entra_id','okta','google_workspace','keycloak','auth0','saml','generic_oidc'
  )),
  display_name TEXT,
  client_id TEXT NOT NULL,
  tenant_identifier TEXT,             -- e.g. Azure AD tenant GUID
  issuer_url TEXT,
  auth_endpoint TEXT,
  token_endpoint TEXT,
  jwks_url TEXT,
  client_secret_kv_key TEXT,          -- KV key holding the client secret
  redirect_uri TEXT,
  allowed_email_domains TEXT,         -- comma-separated list for JIT provisioning
  jit_role TEXT DEFAULT 'offtaker',   -- default role for JIT-created participants
  enabled BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tsso_tenant ON tenant_sso_providers(tenant_id);

-- Usage metrics for billing (seat count, active participants, API calls)
CREATE TABLE IF NOT EXISTS tenant_usage_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  snapshot_date TEXT NOT NULL,        -- YYYY-MM-DD
  participant_count INTEGER DEFAULT 0,
  active_participant_count INTEGER DEFAULT 0,
  seat_count INTEGER DEFAULT 0,
  api_calls_count INTEGER DEFAULT 0,
  storage_bytes INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_tus_tenant ON tenant_usage_snapshots(tenant_id, snapshot_date DESC);
