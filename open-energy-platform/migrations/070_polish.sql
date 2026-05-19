-- ════════════════════════════════════════════════════════════════════════
-- 070_polish.sql — cross-platform polish for L5 readiness.
--
--   • E-signing of documents (PDF / contract / regulator pack)
--   • Feature flags
--   • Real User Monitoring (RUM) events
--   • Accessibility audit log
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_signatures (
  id              TEXT PRIMARY KEY,
  document_kind   TEXT NOT NULL,            -- contract | regulator_pack | nersa_submission |
                                            -- audit_export | wheeling_agreement | rfq_award
  document_ref    TEXT NOT NULL,            -- id of underlying record
  document_hash   TEXT NOT NULL,            -- SHA-256 of canonical document bytes
  signer_id       TEXT NOT NULL,
  signer_role     TEXT,                     -- 'buyer' | 'seller' | 'witness' | 'attestor'
  signature_b64   TEXT NOT NULL,            -- Ed25519 signature
  public_key_b64  TEXT NOT NULL,            -- signer's published verification key
  signed_at       TEXT NOT NULL DEFAULT (datetime('now')),
  ip              TEXT,
  user_agent      TEXT,
  signing_method  TEXT NOT NULL DEFAULT 'platform_key',
                                            -- platform_key | external_pki | id_doc_visual
  verified_at     TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_sig_doc ON oe_signatures(document_kind, document_ref);
CREATE INDEX IF NOT EXISTS idx_oe_sig_signer ON oe_signatures(signer_id);

CREATE TABLE IF NOT EXISTS oe_feature_flags (
  key             TEXT PRIMARY KEY,
  description     TEXT,
  default_enabled INTEGER NOT NULL DEFAULT 0,
  rollout_pct     REAL NOT NULL DEFAULT 0,    -- 0..100
  role_overrides  TEXT,                       -- JSON {admin: 100, trader: 50, ...}
  participant_allowlist TEXT,                 -- JSON array
  participant_blocklist TEXT,                 -- JSON array
  killed          INTEGER NOT NULL DEFAULT 0, -- emergency disable
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      TEXT
);

INSERT OR IGNORE INTO oe_feature_flags (key, description, default_enabled, rollout_pct)
VALUES
  ('ai_assistant.enabled',           'Cross-platform AI dock',                       1, 100),
  ('offline_field_pwa.enabled',      'IndexedDB offline mode for field-tech',        1, 100),
  ('algo_execution.twap_enabled',    'TWAP algo orders',                             1, 100),
  ('algo_execution.vwap_enabled',    'VWAP algo orders',                             1, 100),
  ('algo_execution.iceberg_enabled', 'Iceberg algo orders',                          0, 0),
  ('clearing_default_fund.enabled',  'Mutualised default fund waterfall',            0, 0),
  ('webauthn.enabled',               'WebAuthn / passkey enrollment',                1, 100),
  ('marketplace.reverse_auctions',   'Reverse-auction product type',                 1, 100);

CREATE TABLE IF NOT EXISTS oe_rum_events (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT,
  session_id      TEXT,
  page_path       TEXT NOT NULL,
  metric          TEXT NOT NULL,        -- LCP | FID | CLS | INP | TTFB | route_change |
                                        -- error | resource_slow
  value           REAL,
  user_agent      TEXT,
  network_type    TEXT,                 -- 4g | 3g | wifi | …
  device_category TEXT,                 -- mobile | tablet | desktop
  recorded_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_rum_metric_ts ON oe_rum_events(metric, recorded_at);
CREATE INDEX IF NOT EXISTS idx_oe_rum_path ON oe_rum_events(page_path, recorded_at);

CREATE TABLE IF NOT EXISTS oe_accessibility_audits (
  id              TEXT PRIMARY KEY,
  page_path       TEXT NOT NULL,
  audit_tool      TEXT NOT NULL,        -- axe-core | wave | manual
  wcag_level      TEXT NOT NULL DEFAULT 'AA',
  passes          INTEGER NOT NULL DEFAULT 0,
  violations      INTEGER NOT NULL DEFAULT 0,
  incomplete      INTEGER NOT NULL DEFAULT 0,
  details_r2_key  TEXT,
  audited_at      TEXT NOT NULL DEFAULT (datetime('now')),
  audited_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_a11y_path ON oe_accessibility_audits(page_path, audited_at);
