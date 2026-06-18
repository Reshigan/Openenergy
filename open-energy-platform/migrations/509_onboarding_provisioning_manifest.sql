-- 509 — Add manifest column to oe_onboarding_provisioning_log
--
-- Batch 1 (onboarding activation): every onboarding.completed now writes a
-- getting-started MANIFEST onto its provisioning-log row — a per-role JSON of
-- { headline, profile_summary, next_actions[] } that GET /api/onboarding/state
-- returns so the SPA can render a real "what next" card instead of a dead end.
--
-- The column is nullable with a '{}' default: pre-existing log rows (written
-- before this migration) read back as an empty manifest, and the cascade rule
-- always supplies a value for new rows.
--
-- Prod note: SQLite ALTER ADD COLUMN is not idempotent, so on prod this is
-- applied by the deploy.yml "Pre-migration column reconcile" step (duplicate
-- column name treated as benign). This file lands the column on fresh/local
-- DBs (and in the vitest createTestDb migration apply).

ALTER TABLE oe_onboarding_provisioning_log
  ADD COLUMN manifest TEXT DEFAULT '{}';
