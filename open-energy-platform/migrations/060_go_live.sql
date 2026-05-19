-- ════════════════════════════════════════════════════════════════════════
-- 060_go_live.sql — compliance + security tables for go-live readiness.
--
--   oe_mfa_enrollments        — TOTP shared secrets per participant
--   oe_mfa_recovery_codes     — single-use recovery codes (hashed)
--   oe_mfa_attempts           — rate-limit + audit trail for verify calls
--   oe_kyc_submissions        — KYC document uploads + review state
--   oe_consent_records        — cookies / T&Cs / privacy accepts
--   oe_data_export_requests   — POPIA right-to-access (Section 23)
--   oe_deletion_requests      — POPIA right-to-erasure (Section 24)
--   oe_nersa_reports          — quarterly regulator-pack history
--   oe_sars_reports           — VAT201 / IRP6 / Carbon Tax pack history
--   oe_status_metrics         — per-minute SLO points for /status page
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_mfa_enrollments (
  participant_id     TEXT PRIMARY KEY,
  secret_b32         TEXT NOT NULL,              -- TOTP shared secret (RFC 6238)
  verified           INTEGER NOT NULL DEFAULT 0, -- 0 until first successful verify
  enrolled_at        TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at        TEXT,
  last_used_at       TEXT,
  algorithm          TEXT NOT NULL DEFAULT 'SHA1',
  digits             INTEGER NOT NULL DEFAULT 6,
  period_seconds     INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS oe_mfa_recovery_codes (
  id                 TEXT PRIMARY KEY,
  participant_id     TEXT NOT NULL,
  code_hash          TEXT NOT NULL,              -- SHA-256 of single-use code
  used_at            TEXT,                       -- NULL = available
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_mfa_recovery_part ON oe_mfa_recovery_codes(participant_id, used_at);

CREATE TABLE IF NOT EXISTS oe_mfa_attempts (
  id                 TEXT PRIMARY KEY,
  participant_id     TEXT NOT NULL,
  method             TEXT NOT NULL,              -- totp | recovery
  ok                 INTEGER NOT NULL,
  ip                 TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_mfa_attempts_part ON oe_mfa_attempts(participant_id, created_at);

CREATE TABLE IF NOT EXISTS oe_kyc_submissions (
  id                 TEXT PRIMARY KEY,
  participant_id     TEXT NOT NULL,
  document_type      TEXT NOT NULL,              -- id_document | proof_of_address |
                                                  -- company_registration | tax_clearance |
                                                  -- bank_confirmation | nersa_licence
  r2_key             TEXT NOT NULL,
  file_name          TEXT,
  mime_type          TEXT,
  size_bytes         INTEGER,
  status             TEXT NOT NULL DEFAULT 'pending',
                                                  -- pending | approved | rejected | expired
  reviewer_id        TEXT,
  reviewed_at        TEXT,
  notes              TEXT,
  expires_at         TEXT,                       -- e.g. 12 months for proof of address
  submitted_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_kyc_subs_part   ON oe_kyc_submissions(participant_id, status);
CREATE INDEX IF NOT EXISTS idx_oe_kyc_subs_status ON oe_kyc_submissions(status, submitted_at);

CREATE TABLE IF NOT EXISTS oe_consent_records (
  id                 TEXT PRIMARY KEY,
  participant_id     TEXT,                        -- NULL for pre-auth cookie consent
  session_id         TEXT,                        -- shared id for anonymous tracking
  consent_type       TEXT NOT NULL,               -- cookies_necessary | cookies_analytics |
                                                   -- cookies_marketing | terms_of_service |
                                                   -- privacy_policy | aml_disclosure
  version            TEXT NOT NULL,               -- policy version string
  accepted           INTEGER NOT NULL,            -- 0/1
  ip                 TEXT,
  user_agent         TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_consent_part ON oe_consent_records(participant_id, consent_type);
CREATE INDEX IF NOT EXISTS idx_oe_consent_sess ON oe_consent_records(session_id, consent_type);

CREATE TABLE IF NOT EXISTS oe_data_export_requests (
  id                 TEXT PRIMARY KEY,
  participant_id     TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'queued',
                                                  -- queued | processing | ready | downloaded |
                                                  -- expired | failed
  r2_key             TEXT,                        -- zip in R2 once ready
  byte_size          INTEGER,
  requested_at       TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at       TEXT,
  downloaded_at      TEXT,
  expires_at         TEXT,                        -- 7 days after ready
  error              TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_export_part ON oe_data_export_requests(participant_id, status);

CREATE TABLE IF NOT EXISTS oe_deletion_requests (
  id                 TEXT PRIMARY KEY,
  participant_id     TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'queued',
                                                  -- queued | cooling_off | completed |
                                                  -- cancelled | blocked
  reason             TEXT,                        -- user-supplied
  block_reason       TEXT,                        -- legal hold / open dispute / lender lien
  requested_at       TEXT NOT NULL DEFAULT (datetime('now')),
  scheduled_for      TEXT,                        -- 30-day cooling-off
  cancelled_at       TEXT,
  completed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_deletion_part ON oe_deletion_requests(participant_id, status);

CREATE TABLE IF NOT EXISTS oe_nersa_reports (
  id                 TEXT PRIMARY KEY,
  year               INTEGER NOT NULL,
  quarter            INTEGER NOT NULL,            -- 1..4
  status             TEXT NOT NULL DEFAULT 'draft',
                                                  -- draft | generated | submitted | accepted
  r2_key             TEXT,
  summary_json       TEXT,                        -- key totals for inline UI
  generated_at       TEXT,
  submitted_at       TEXT,
  generated_by       TEXT,
  UNIQUE (year, quarter)
);
CREATE INDEX IF NOT EXISTS idx_oe_nersa_status ON oe_nersa_reports(status, year DESC, quarter DESC);

CREATE TABLE IF NOT EXISTS oe_sars_reports (
  id                 TEXT PRIMARY KEY,
  period_type        TEXT NOT NULL,               -- vat201 | irp6 | carbon_tax
  period_label       TEXT NOT NULL,               -- '2026/02' for VAT, '2026' for IRP6, etc.
  status             TEXT NOT NULL DEFAULT 'draft',
  r2_key             TEXT,
  summary_json       TEXT,
  generated_at       TEXT,
  submitted_at       TEXT,
  generated_by       TEXT,
  UNIQUE (period_type, period_label)
);
CREATE INDEX IF NOT EXISTS idx_oe_sars_status ON oe_sars_reports(status, period_label DESC);

CREATE TABLE IF NOT EXISTS oe_status_metrics (
  ts                 TEXT NOT NULL,               -- minute-truncated UTC
  metric             TEXT NOT NULL,               -- api_latency_p50 | api_latency_p95 |
                                                  -- error_rate | cron_lag_seconds |
                                                  -- d1_query_ms | up
  value              REAL NOT NULL,
  PRIMARY KEY (ts, metric)
);
CREATE INDEX IF NOT EXISTS idx_oe_status_metric_ts ON oe_status_metrics(metric, ts);

-- ─── Seed minimal consent versions so the UI has something to ask for ─
-- (no other seed — production starts empty and grows via real activity)
