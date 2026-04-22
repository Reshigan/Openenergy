-- 016_role_crud.sql
-- Per-role CRUD support: notification preferences (all roles), offtaker
-- delivery points, and regulator filing storage.
--
-- 1) participant_preferences — single-row-per-user key/value store for
--    profile bits that don't fit on participants. Notifications, locale,
--    currency, default dashboard card order, etc.
-- 2) offtaker_delivery_points — the set of meters/sites an offtaker
--    procures energy into. Used by the bill→mix→LOI flow and will feed
--    consumption-profile editing in /settings/offtaker.
-- 3) regulator_filings — persisted filings (as opposed to the transient
--    /regulator/filing/:type/generate response). Filings have a lifecycle
--    of draft → submitted → archived.

CREATE TABLE IF NOT EXISTS participant_preferences (
  participant_id TEXT PRIMARY KEY,
  notify_email_contracts INTEGER DEFAULT 1,
  notify_email_settlement INTEGER DEFAULT 1,
  notify_email_covenants INTEGER DEFAULT 1,
  notify_email_lois INTEGER DEFAULT 1,
  notify_in_app INTEGER DEFAULT 1,
  locale TEXT DEFAULT 'en-ZA',
  currency TEXT DEFAULT 'ZAR',
  timezone TEXT DEFAULT 'Africa/Johannesburg',
  date_format TEXT DEFAULT 'YYYY-MM-DD',
  dashboard_layout TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS offtaker_delivery_points (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  meter_id TEXT,
  voltage_kv REAL,
  nmd_kva REAL,
  annual_kwh REAL,
  tariff_category TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_points_participant
  ON offtaker_delivery_points(participant_id, status);

CREATE TABLE IF NOT EXISTS regulator_filings_store (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  filing_type TEXT NOT NULL,
  title TEXT,
  period_start TEXT,
  period_end TEXT,
  body_md TEXT,
  body_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TEXT,
  archived_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  CHECK (status IN ('draft', 'submitted', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_reg_filings_participant_status
  ON regulator_filings_store(participant_id, status, created_at DESC);
