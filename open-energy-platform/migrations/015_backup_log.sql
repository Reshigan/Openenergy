-- ═══════════════════════════════════════════════════════════════════════════
-- 015 — Backup Catalog (PR-Prod-6)
-- ═══════════════════════════════════════════════════════════════════════════
-- Small catalog row written by POST /api/backup/run after each D1 → R2
-- dump. Operators use this table (joined with R2 metadata) to pick a backup
-- to restore — never wipe this table without also clearing old R2 objects.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS backup_log (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  total_rows    INTEGER NOT NULL,
  table_count   INTEGER NOT NULL,
  generated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_backup_log_generated_at ON backup_log(generated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_backup_log_key   ON backup_log(key);
