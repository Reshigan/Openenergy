-- ════════════════════════════════════════════════════════════════════════
-- 072_ux_personal_state.sql — per-user UI state.
--
-- oe_saved_filters was added in 059 with participant_id; this migration
-- only adds the new shared_role column + the two never-before-seen
-- tables for onboarding completion and help dismissals.
-- ════════════════════════════════════════════════════════════════════════

-- ALTER TABLE — add the shared_role column the ux-state router writes.
-- Wrap in a no-op if the column already exists; SQLite has no "IF NOT
-- EXISTS" on ALTER, so the migration helper treats a "duplicate column"
-- error as already-applied (see CLAUDE.md migration-discipline section).
ALTER TABLE oe_saved_filters ADD COLUMN shared_role TEXT;
ALTER TABLE oe_saved_filters ADD COLUMN updated_at TEXT;

-- Re-key uniqueness on (participant_id, surface, name) so the upsert in
-- POST /api/ux-state/filters works.
CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_saved_filters_pid_surf_name
  ON oe_saved_filters(participant_id, surface, name);
CREATE INDEX IF NOT EXISTS idx_oe_saved_filters_shared
  ON oe_saved_filters(shared, shared_role, surface);

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
