-- 524: per-user view preferences — the Ease customisation engine.
-- Stores pins / hidden / order per surface scope_key (e.g. 'horizon:ipp_developer',
-- 'atlas') for one participant. User- and tenant-scoped; the role default is the
-- starting layout and these rows are the user's overrides on top. Idempotent.
CREATE TABLE IF NOT EXISTS user_view_prefs (
  id             TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  tenant_id      TEXT,
  scope_key      TEXT NOT NULL,
  prefs_json     TEXT NOT NULL DEFAULT '{}',
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (participant_id, scope_key)
);
CREATE INDEX IF NOT EXISTS idx_user_view_prefs_owner ON user_view_prefs(participant_id);
