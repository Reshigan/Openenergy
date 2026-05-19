-- ════════════════════════════════════════════════════════════════════════
-- 061_depth.sql — depth additions across MFA / KYC / Status / POPIA /
-- Reports. Drives the L2/L3 features shipped in 060 to L4/L5: state
-- machines, business rules, screening, scoring, statutory deadlines.
-- ════════════════════════════════════════════════════════════════════════

-- ─── MFA policy + WebAuthn + step-up + device trust + lockout ──────────
CREATE TABLE IF NOT EXISTS oe_mfa_policies (
  role                  TEXT PRIMARY KEY,
  required              INTEGER NOT NULL DEFAULT 0,
  allowed_methods       TEXT NOT NULL DEFAULT '["totp"]',  -- JSON
  step_up_grace_seconds INTEGER NOT NULL DEFAULT 900,
  device_trust_days     INTEGER NOT NULL DEFAULT 30,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by            TEXT
);

CREATE TABLE IF NOT EXISTS oe_webauthn_credentials (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  credential_id   TEXT NOT NULL UNIQUE,      -- base64url WebAuthn credential id
  public_key      TEXT NOT NULL,             -- base64 COSE
  counter         INTEGER NOT NULL DEFAULT 0,
  transports      TEXT,                      -- JSON
  device_name     TEXT,
  last_used_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_webauthn_part ON oe_webauthn_credentials(participant_id);

CREATE TABLE IF NOT EXISTS oe_trusted_devices (
  id                TEXT PRIMARY KEY,
  participant_id    TEXT NOT NULL,
  fingerprint_hash  TEXT NOT NULL,
  device_label      TEXT,
  user_agent        TEXT,
  ip                TEXT,
  last_seen_at      TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at        TEXT NOT NULL,
  revoked           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_trusted_part ON oe_trusted_devices(participant_id, revoked);

CREATE TABLE IF NOT EXISTS oe_mfa_lockouts (
  participant_id  TEXT NOT NULL,
  ip              TEXT NOT NULL DEFAULT '*',
  attempts        INTEGER NOT NULL DEFAULT 1,
  locked_until    TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, ip)
);

CREATE TABLE IF NOT EXISTS oe_step_up_sessions (
  id               TEXT PRIMARY KEY,
  participant_id   TEXT NOT NULL,
  op_type          TEXT NOT NULL,             -- 'invoice.issue.high' | 'settlement.transfer' |
                                              -- 'licence.action'    | 'mfa.reset' |
                                              -- 'api_key.create'    | etc.
  method           TEXT NOT NULL,             -- totp | webauthn | recovery
  authenticated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at       TEXT NOT NULL              -- per-policy grace
);
CREATE INDEX IF NOT EXISTS idx_oe_stepup_part_op ON oe_step_up_sessions(participant_id, op_type);

-- Default MFA policies (idempotent)
INSERT OR IGNORE INTO oe_mfa_policies (role, required, allowed_methods, step_up_grace_seconds, device_trust_days, updated_at)
VALUES
  ('admin',     1, '["totp","webauthn"]',          900,  7, datetime('now')),
  ('regulator', 1, '["totp","webauthn"]',          900, 30, datetime('now')),
  ('trader',    1, '["totp","webauthn"]',          600,  7, datetime('now')),
  ('lender',    1, '["totp","webauthn"]',         1800, 30, datetime('now')),
  ('grid_operator', 1, '["totp","webauthn"]',      900, 14, datetime('now')),
  ('ipp',       0, '["totp"]',                    1800, 30, datetime('now')),
  ('offtaker',  0, '["totp"]',                    3600, 30, datetime('now')),
  ('carbon_fund', 0, '["totp"]',                  1800, 30, datetime('now')),
  ('support',   1, '["totp","webauthn"]',          600,  7, datetime('now'));

-- ─── KYC depth — tiers + screening + risk + beneficial owners ──────────
CREATE TABLE IF NOT EXISTS oe_kyc_tiers (
  participant_id           TEXT PRIMARY KEY,
  current_tier             INTEGER NOT NULL DEFAULT 0,   -- 0..3
  per_trade_limit_zar      REAL NOT NULL DEFAULT 0,
  monthly_volume_limit_zar REAL NOT NULL DEFAULT 0,
  evidence_status          TEXT,                          -- JSON {tier1:'approved', ...}
  upgraded_by              TEXT,
  upgraded_at              TEXT,
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_kyc_screenings (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  screening_type  TEXT NOT NULL,                 -- pep | sanctions | adverse_media
  list_source     TEXT NOT NULL,                 -- un_consolidated | ofac_sdn | eu_consolidated | uk_hmt | sa_dwc_pep
  match_count     INTEGER NOT NULL DEFAULT 0,
  matches_json    TEXT,                          -- JSON of match details
  max_match_score REAL,                          -- 0..1 highest similarity
  status          TEXT NOT NULL DEFAULT 'pending_review',
                                                  -- pending_review | cleared | confirmed_match |
                                                  -- escalated | false_positive
  reviewer_id     TEXT,
  reviewed_at     TEXT,
  notes           TEXT,
  screened_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_kyc_screen_part ON oe_kyc_screenings(participant_id, status);

CREATE TABLE IF NOT EXISTS oe_kyc_risk_scores (
  participant_id           TEXT PRIMARY KEY,
  geographic_risk          REAL NOT NULL DEFAULT 0,   -- 0..100
  occupation_risk          REAL NOT NULL DEFAULT 0,
  product_risk             REAL NOT NULL DEFAULT 0,
  transaction_pattern_risk REAL NOT NULL DEFAULT 0,
  total_score              REAL NOT NULL DEFAULT 0,
  risk_tier                TEXT NOT NULL DEFAULT 'low',  -- low | medium | high
  inputs_json              TEXT,                          -- audit trail of inputs
  last_assessed_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_kyc_beneficial_owners (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,                  -- the corporate entity
  full_name       TEXT NOT NULL,
  id_number       TEXT,
  date_of_birth   TEXT,
  ownership_pct   REAL,
  is_pep          INTEGER NOT NULL DEFAULT 0,
  declared_at     TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at     TEXT,
  verified_by     TEXT,
  source_of_funds TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_kyc_bo_part ON oe_kyc_beneficial_owners(participant_id);

-- ─── Status depth — incidents + maintenance + subscribers + history ───
CREATE TABLE IF NOT EXISTS oe_status_incidents (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  body                TEXT,
  severity            TEXT NOT NULL,                  -- info | minor | major | critical
  status              TEXT NOT NULL DEFAULT 'investigating',
                                                       -- investigating | identified | monitoring |
                                                       -- resolved | postmortem_published
  affected_components TEXT NOT NULL,                  -- JSON array
  started_at          TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at         TEXT,
  postmortem_url      TEXT,
  postmortem_body     TEXT,
  created_by          TEXT NOT NULL,
  updated_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_incidents_started ON oe_status_incidents(started_at);

CREATE TABLE IF NOT EXISTS oe_status_incident_updates (
  id          TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  status      TEXT NOT NULL,
  message     TEXT NOT NULL,
  author_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_incident_updates_inc ON oe_status_incident_updates(incident_id, created_at);

CREATE TABLE IF NOT EXISTS oe_status_maintenance_windows (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  body                TEXT,
  affected_components TEXT NOT NULL,                  -- JSON
  starts_at           TEXT NOT NULL,
  ends_at             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'scheduled',
                                                       -- scheduled | in_progress | completed | cancelled
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_maintenance_starts ON oe_status_maintenance_windows(starts_at, status);

CREATE TABLE IF NOT EXISTS oe_status_subscribers (
  id                   TEXT PRIMARY KEY,
  channel              TEXT NOT NULL,                  -- email | webhook
  destination          TEXT NOT NULL,
  components           TEXT,                           -- JSON, NULL = all
  verified             INTEGER NOT NULL DEFAULT 0,
  verification_token   TEXT,
  unsubscribed_at      TEXT,
  unsubscribe_token    TEXT NOT NULL,                  -- one-click unsub
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_status_subs_chan ON oe_status_subscribers(channel, unsubscribed_at);

-- ─── Reports depth — submission tracking ──────────────────────────────
CREATE TABLE IF NOT EXISTS oe_report_submissions (
  id                          TEXT PRIMARY KEY,
  report_kind                 TEXT NOT NULL,        -- nersa_quarterly | sars_vat201 | sars_irp6 | sars_carbon_tax
  report_id                   TEXT NOT NULL,        -- ref to oe_nersa_reports.id or oe_sars_reports.id
  submitted_to                TEXT NOT NULL,        -- e.g. 'NERSA' | 'SARS_efiling'
  submitted_by                TEXT,
  submission_envelope_r2_key  TEXT,                 -- XML envelope archived
  acknowledgment_id           TEXT,                 -- regulator-assigned id
  acknowledgment_received_at  TEXT,
  status                      TEXT NOT NULL DEFAULT 'queued',
                                                     -- queued | submitted | acknowledged |
                                                     -- accepted | rejected | resubmitted
  rejection_reason            TEXT,
  resubmission_of_id          TEXT,                 -- if this is a re-submit
  submitted_at                TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_report_subs_kind ON oe_report_submissions(report_kind, status);

-- ─── POPIA depth — Info Officer dashboard ──────────────────────────────
CREATE TABLE IF NOT EXISTS oe_popia_retention_policies (
  data_type       TEXT PRIMARY KEY,                 -- 'session_logs' | 'audit_events' | 'pii_access_log' | etc
  retention_days  INTEGER NOT NULL,
  lawful_basis    TEXT NOT NULL,                    -- contract | legal_obligation |
                                                     -- legitimate_interest | consent
  legal_reference TEXT,                             -- e.g. 'POPIA s.14(2)(d)'
  notes           TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed standard SA retention defaults
INSERT OR IGNORE INTO oe_popia_retention_policies
  (data_type, retention_days, lawful_basis, legal_reference)
VALUES
  ('session_logs',       180,  'legitimate_interest', 'POPIA s.11(1)(d)'),
  ('audit_events',      2555,  'legal_obligation',    'Companies Act 2008 s.24 (7 years)'),
  ('pii_access_log',    2555,  'legal_obligation',    'POPIA s.14(2)(c)'),
  ('settlement_records',3650,  'legal_obligation',    'Tax Admin Act 28 (5y minimum, 10y prudent)'),
  ('mfa_attempts',       365,  'legitimate_interest', 'POPIA s.11(1)(d)'),
  ('kyc_documents',     1825,  'legal_obligation',    'FICA s.42(3)(b) (5 years)');

CREATE TABLE IF NOT EXISTS oe_popia_sar_requests (
  id                  TEXT PRIMARY KEY,
  subject_email       TEXT NOT NULL,
  subject_name        TEXT,
  participant_id      TEXT,                          -- linked if known
  request_type        TEXT NOT NULL,                 -- access | rectification | erasure |
                                                     -- portability | objection | restriction
  request_body        TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
                                                     -- open | acknowledged | in_progress |
                                                     -- fulfilled | rejected | escalated
  received_at         TEXT NOT NULL DEFAULT (datetime('now')),
  due_at              TEXT NOT NULL,                 -- 30 days from received_at
  acknowledged_at     TEXT,
  responded_at        TEXT,
  assigned_to         TEXT,
  response_summary    TEXT,
  rejection_reason    TEXT,
  ip                  TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_sar_status_due ON oe_popia_sar_requests(status, due_at);

-- ─── Daily uptime rollup — computed by cron from oe_status_metrics ────
CREATE TABLE IF NOT EXISTS oe_status_uptime_daily (
  day            TEXT NOT NULL,                       -- YYYY-MM-DD
  component      TEXT NOT NULL,
  uptime_pct     REAL NOT NULL,
  incident_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, component)
);
CREATE INDEX IF NOT EXISTS idx_oe_uptime_comp ON oe_status_uptime_daily(component, day);
