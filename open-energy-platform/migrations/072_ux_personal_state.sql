-- ════════════════════════════════════════════════════════════════════════
-- 072_ux_personal_state.sql — per-user UI state.
--
-- Saved filters: each user can name and store filter configurations
-- per workstation surface. Shared filters (visible to all in same role)
-- are flagged by `shared = 1`.
--
-- Onboarding completion: which first-run tour steps the user has dismissed,
-- so the SPA only ever shows each step once.
--
-- Help dismissals: tooltips / inline help cards have a dismiss button
-- and the choice persists so we don't nag.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_saved_filters (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  surface         TEXT NOT NULL,            -- e.g. 'trading.orders', 'esums.faults'
  name            TEXT NOT NULL,
  filter_json     TEXT NOT NULL,            -- arbitrary JSON serialised by the UI
  shared          INTEGER NOT NULL DEFAULT 0, -- visible to other users with same role
  shared_role     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_saved_filters_user ON oe_saved_filters(user_id, surface);
CREATE INDEX IF NOT EXISTS idx_oe_saved_filters_shared ON oe_saved_filters(shared, shared_role, surface);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_saved_filters_name ON oe_saved_filters(user_id, surface, name);

CREATE TABLE IF NOT EXISTS oe_onboarding_state (
  user_id         TEXT NOT NULL,
  step_key        TEXT NOT NULL,
  completed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, step_key)
);

CREATE TABLE IF NOT EXISTS oe_help_dismissals (
  user_id         TEXT NOT NULL,
  help_key        TEXT NOT NULL,
  dismissed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, help_key)
);
