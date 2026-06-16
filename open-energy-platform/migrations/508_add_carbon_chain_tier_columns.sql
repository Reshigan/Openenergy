-- 508 — Add missing tier columns to three carbon-chain tables
--
-- The create handlers INSERT a tier column the table never had, which made
-- POST return 500 ("table … has no column named …") for every real user:
--   carbon-budget-chain.ts            → oe_carbon_budget_registrations.cb_tier
--   vcm-project-development-chain.ts  → oe_vcm_projects.vcm_tier
--   certificate-bundle-chain.ts       → oe_certificate_bundles.bundle_tier
--
-- The tier drives the SLA window (deriveCbSla / deriveVcmSla / deriveBundleSla)
-- and the regulator-inbox crossing, so it is load-bearing — the column must
-- exist, not be dropped from the INSERT.
--
-- CHECK options mirror the CbTier / VcmTier / BundleTier spec unions verbatim
-- (carbon-budget-spec.ts:41, vcm-spec.ts:39, certificate-bundle-spec.ts:25).
-- Columns are nullable: the handler always supplies a value (now constrained
-- to the same set at the create form via the MERIDIAN_CHAINS enum field), and
-- a nullable ADD COLUMN avoids needing a backfill default for existing rows.
--
-- Prod note: SQLite ALTER ADD COLUMN is not idempotent, so on prod these are
-- applied per-statement by the deploy.yml "Pre-migration column reconcile"
-- step (duplicate-column treated as benign). This file lands the columns on
-- fresh/local DBs.

ALTER TABLE oe_carbon_budget_registrations
  ADD COLUMN cb_tier TEXT CHECK(cb_tier IN ('small','medium','large','major'));

ALTER TABLE oe_vcm_projects
  ADD COLUMN vcm_tier TEXT CHECK(vcm_tier IN ('micro','small','large','mega'));

ALTER TABLE oe_certificate_bundles
  ADD COLUMN bundle_tier TEXT CHECK(bundle_tier IN ('basic','dual','comprehensive','institutional'));
