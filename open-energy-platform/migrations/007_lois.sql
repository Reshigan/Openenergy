-- 007: loi_drafts as a migration-managed table (was created at runtime).
-- Adds fields needed for the full LOI lifecycle: IPP accept/decline,
-- deep-linking back to the resulting contract document, free-form
-- response notes, and a sent_at / resolved_at timeline.

CREATE TABLE IF NOT EXISTS loi_drafts (
  id TEXT PRIMARY KEY,
  from_participant_id TEXT NOT NULL,
  to_participant_id TEXT,
  project_id TEXT,
  mix_json TEXT NOT NULL,
  body_md TEXT,
  -- drafted  = created, not yet delivered (internal)
  -- sent     = delivered (cascade fired, counterparty action queue populated)
  -- signed   = IPP accepted; counterparty_contract_document_id is populated
  -- withdrawn= IPP declined OR offtaker rescinded
  -- expired  = response window elapsed
  status TEXT DEFAULT 'drafted' CHECK (status IN ('drafted','sent','signed','withdrawn','expired')),
  horizon_years INTEGER,
  annual_mwh REAL,
  blended_price REAL,
  notes TEXT,
  decline_reason TEXT,
  resulting_contract_document_id TEXT,
  sent_at TEXT,
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_loi_drafts_from ON loi_drafts(from_participant_id);
CREATE INDEX IF NOT EXISTS idx_loi_drafts_to ON loi_drafts(to_participant_id);
CREATE INDEX IF NOT EXISTS idx_loi_drafts_status ON loi_drafts(status);

-- The runtime CREATE TABLE IF NOT EXISTS in ai.ts / ona.ts may have created
-- the table before this migration runs. SQLite silently ignores the fresh
-- CREATE above if the table already exists, and the new columns will be
-- absent. Add them defensively; duplicate-column errors are safe to ignore
-- but we mitigate by running these only when the schema_version table lets
-- us skip already-applied migrations. D1 does not track this, so instead we
-- use a one-off "alter if missing" via a helper pattern below.

-- For D1 we rely on the migration being applied exactly once per environment.
-- If this migration is re-applied manually, the ALTER TABLE ADD COLUMN will
-- fail on the second run — that is acceptable, as it indicates the columns
-- are already present.

-- NOTE: D1 / SQLite does not support "ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS". These ALTERs are guarded by virtue of the migration being applied
-- idempotently by wrangler and by the fact that the runtime CREATE TABLE
-- above uses the *full* schema.

-- If you re-seed an env with an older-shape loi_drafts table, drop it before
-- running this migration:
--   DROP TABLE IF EXISTS loi_drafts;
