-- ════════════════════════════════════════════════════════════════════════
-- 059_platform_features.sql — cross-cutting platform features.
--
--   • oe_api_keys              — programmatic API key auth for B2B clients
--   • oe_saved_filters         — named views/filters on every CRUD surface
--   • oe_webhook_subscriptions — tenant-managed outbound webhook subs
--   • oe_webhook_deliveries    — delivery history with retry state
--   • oe_tenant_usage          — daily rollup of D1/Worker/KV usage per tenant
--   • oe_digest_subscriptions  — email / WhatsApp / SMS digest preferences
--   • oe_digest_deliveries     — outbound digest history
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_api_keys (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT NOT NULL,
  key_hash              TEXT NOT NULL UNIQUE,  -- SHA-256 of the raw key
  key_preview           TEXT NOT NULL,         -- last 4 chars + prefix shown in UI
  name                  TEXT NOT NULL,
  scopes                TEXT,                  -- JSON array of allowed scopes
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  last_used_at          TEXT,
  last_used_ip          TEXT,
  expires_at            TEXT,                  -- NULL = no expiry
  revoked               INTEGER NOT NULL DEFAULT 0,
  revoked_reason        TEXT,
  created_by            TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_api_keys_part ON oe_api_keys(participant_id, revoked);
CREATE INDEX IF NOT EXISTS idx_oe_api_keys_hash ON oe_api_keys(key_hash);

CREATE TABLE IF NOT EXISTS oe_saved_filters (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT NOT NULL,
  surface               TEXT NOT NULL,   -- 'faults' | 'workorders' | 'invoices' | 'orders' | ...
  name                  TEXT NOT NULL,
  filter_json           TEXT NOT NULL,   -- {status, severity, site_id, ...} per surface
  shared                INTEGER NOT NULL DEFAULT 0,
  is_default            INTEGER NOT NULL DEFAULT 0,
  use_count             INTEGER NOT NULL DEFAULT 0,
  last_used_at          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_saved_filters_part_surf ON oe_saved_filters(participant_id, surface);

CREATE TABLE IF NOT EXISTS oe_webhook_subscriptions (
  id                       TEXT PRIMARY KEY,
  participant_id           TEXT NOT NULL,
  target_url               TEXT NOT NULL,
  secret                   TEXT NOT NULL,    -- HMAC-SHA256 shared secret
  events                   TEXT NOT NULL,    -- JSON array of event_type values
  description              TEXT,
  enabled                  INTEGER NOT NULL DEFAULT 1,
  last_delivery_at         TEXT,
  last_status_code         INTEGER,
  consecutive_failures     INTEGER NOT NULL DEFAULT 0,
  disabled_at              TEXT,             -- auto-disable after N failures
  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_webhook_subs_part ON oe_webhook_subscriptions(participant_id, enabled);

CREATE TABLE IF NOT EXISTS oe_webhook_deliveries (
  id                TEXT PRIMARY KEY,
  subscription_id   TEXT NOT NULL,
  event             TEXT NOT NULL,
  payload_json      TEXT NOT NULL,
  status            TEXT NOT NULL,        -- queued | delivered | failed
  status_code       INTEGER,
  response_body     TEXT,
  attempt           INTEGER NOT NULL DEFAULT 1,
  delivered_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_webhook_deliveries_sub ON oe_webhook_deliveries(subscription_id, created_at);

CREATE TABLE IF NOT EXISTS oe_tenant_usage (
  participant_id       TEXT NOT NULL,
  day                  TEXT NOT NULL,        -- YYYY-MM-DD
  worker_requests      INTEGER NOT NULL DEFAULT 0,
  d1_reads_est         INTEGER NOT NULL DEFAULT 0,
  d1_writes_est        INTEGER NOT NULL DEFAULT 0,
  kv_reads_est         INTEGER NOT NULL DEFAULT 0,
  kv_writes_est        INTEGER NOT NULL DEFAULT 0,
  r2_storage_mb        REAL    NOT NULL DEFAULT 0,
  api_key_calls        INTEGER NOT NULL DEFAULT 0,
  webhook_deliveries   INTEGER NOT NULL DEFAULT 0,
  digest_sends         INTEGER NOT NULL DEFAULT 0,
  est_cost_usd         REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (participant_id, day)
);
CREATE INDEX IF NOT EXISTS idx_oe_tenant_usage_day ON oe_tenant_usage(day);

CREATE TABLE IF NOT EXISTS oe_digest_subscriptions (
  id                  TEXT PRIMARY KEY,
  participant_id      TEXT NOT NULL,
  channel             TEXT NOT NULL,      -- email | whatsapp | sms
  destination         TEXT NOT NULL,      -- email or +27...
  digest_type         TEXT NOT NULL,      -- morning_briefing | weekly_summary |
                                           -- lender_monthly | offtaker_weekly
  enabled             INTEGER NOT NULL DEFAULT 1,
  send_hour_sast      INTEGER NOT NULL DEFAULT 7,  -- 0–23 SAST
  send_days           TEXT NOT NULL DEFAULT 'mon,tue,wed,thu,fri',
  last_sent_at        TEXT,
  next_send_at        TEXT,
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_digest_subs_send ON oe_digest_subscriptions(enabled, next_send_at);

CREATE TABLE IF NOT EXISTS oe_digest_deliveries (
  id                  TEXT PRIMARY KEY,
  subscription_id     TEXT NOT NULL,
  channel             TEXT NOT NULL,
  destination         TEXT NOT NULL,
  status              TEXT NOT NULL,      -- queued | sent | failed | bounced | would_send
  body_preview        TEXT,
  provider_id         TEXT,               -- external provider message id
  sent_at             TEXT,
  error               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_digest_deliveries_sub ON oe_digest_deliveries(subscription_id, created_at);

-- ─── Seed: one demo digest subscription so the UI shows real data ──────
INSERT OR IGNORE INTO oe_digest_subscriptions
  (id, participant_id, channel, destination, digest_type, send_hour_sast, send_days, created_by)
VALUES
  ('dgsub_demo_admin', 'demo_admin_001', 'email', 'reshigan@gonxt.tech',
   'morning_briefing', 7, 'mon,tue,wed,thu,fri', 'demo_admin_001'),
  ('dgsub_demo_ipp',   'demo_ipp_001',   'whatsapp', '+27821000000',
   'morning_briefing', 6, 'mon,tue,wed,thu,fri,sat,sun', 'demo_admin_001');
