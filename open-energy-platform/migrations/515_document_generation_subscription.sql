-- 515 — Standard-document generation (paid subscription feature)
--
-- Carbon funds (and funds/lenders) can subscribe to auto-generate the standard
-- submission documents for a project straight from its existing platform data:
--   • PDD               — Project Design Document (Verra / Gold Standard / Pure Earth)
--   • MRV               — Monitoring & Verification report
--   • validation_report — third-party validation summary
--   • rec_issuance_request — I-REC / GO issuance request
--   • term_sheet        — funding term sheet (lenders/funds)
--   • info_memo         — funding information memorandum
-- The generator pulls from ipp_projects / oe_carbon_projects / oe_mrv_submissions /
-- oe_carbon_registration and renders a standardised submission-format body, then
-- manages the whole lifecycle (draft → generated → review → submitted).
--
-- oe_feature_entitlements gates the feature per participant; the doc-gen endpoint
-- offers a 1-click enable that writes an 'active' row (the "subscription").
--
-- Prod note: CREATE TABLE IF NOT EXISTS is idempotent.

CREATE TABLE IF NOT EXISTS oe_feature_entitlements (
  participant_id TEXT NOT NULL,
  feature        TEXT NOT NULL,   -- e.g. 'doc_generation'
  status         TEXT NOT NULL DEFAULT 'active',
  tier           TEXT,            -- starter | professional | enterprise (informational)
  activated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  tenant_id      TEXT NOT NULL DEFAULT 'default',
  PRIMARY KEY (participant_id, feature)
);

CREATE TABLE IF NOT EXISTS oe_doc_jobs (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,    -- subscriber who runs the generation
  owner_role        TEXT NOT NULL,    -- carbon_fund | lender | ipp_developer ...
  subject_type      TEXT NOT NULL,    -- ipp_projects | oe_carbon_projects | fund_facility
  subject_id        TEXT NOT NULL,
  subject_label     TEXT,
  doc_type          TEXT NOT NULL,    -- pdd | mrv | validation_report | rec_issuance_request | term_sheet | info_memo
  registry_standard TEXT,             -- gold_standard | verra_vcs | pure_earth | i_rec | article_6_4 | cdm
  status            TEXT NOT NULL DEFAULT 'generated',  -- generated | in_review | submitted | accepted | rejected
  title             TEXT NOT NULL,
  content_md        TEXT NOT NULL DEFAULT '',   -- rendered submission-format body (markdown)
  meta_json         TEXT NOT NULL DEFAULT '{}', -- source refs + computed figures
  r2_key            TEXT,             -- set when persisted to vault
  tenant_id         TEXT NOT NULL DEFAULT 'default',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_docjob_owner   ON oe_doc_jobs (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_docjob_subject ON oe_doc_jobs (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_docjob_type    ON oe_doc_jobs (doc_type);
