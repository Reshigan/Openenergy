-- 017_regulator_filings_consolidate.sql
-- Follow-up to 016_role_crud.sql.
--
-- Migration 016 introduced `regulator_filings_store` but every regulator CRUD
-- route in src/routes/regulator.ts reads and writes `regulator_filings`
-- (created on-demand via ensureTable). The *_store table was therefore an
-- orphan that no code path touches. This migration:
--   1) drops the orphan `regulator_filings_store` table and its index;
--   2) ensures the canonical `regulator_filings` table exists with the same
--      shape the application code uses (idempotent — on production D1 the
--      ensureTable in regulator.ts has already created it with this schema).
-- We intentionally keep the application-level schema (filed_by, reporting_period,
-- narrative, evidence_json) rather than the *_store proposal because changing
-- column names would require a wider refactor of every regulator handler and
-- break rows already produced by ensureTable in production.

DROP INDEX IF EXISTS idx_reg_filings_participant_status;
DROP TABLE IF EXISTS regulator_filings_store;

CREATE TABLE IF NOT EXISTS regulator_filings (
  id TEXT PRIMARY KEY,
  filing_type TEXT NOT NULL,
  reporting_period TEXT NOT NULL,
  filed_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  narrative TEXT,
  evidence_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reg_filings_filed_status
  ON regulator_filings(filed_by, status, created_at DESC);
