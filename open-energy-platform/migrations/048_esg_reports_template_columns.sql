-- ════════════════════════════════════════════════════════════════════════
-- 048 · esg_reports — align with the template-driven handler in
--                     src/routes/esg-reports.ts
--
-- The /api/esg-reports/* endpoints (template gallery + report generation
-- for TCFD / CDP / GRI / JSE SRL / King IV) read and write columns the v2
-- migration didn't ship:
--   template_id   — which template was used (tcfd / cdp / gri / combined …)
--   title         — generated title (the v2 table has report_title only)
--   period_start, period_end — explicit date range for the report
--   generated_at  — timestamp when generation finished
--   r2_key        — pointer to the rendered PDF in R2
--   narrative     — the generated long-form narrative text
--
-- Without these the endpoint 500s on every GET / POST. Add them as
-- additive ALTERs so existing rows keep their current shape.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE esg_reports ADD COLUMN template_id  TEXT;
ALTER TABLE esg_reports ADD COLUMN title        TEXT;
ALTER TABLE esg_reports ADD COLUMN period_start TEXT;
ALTER TABLE esg_reports ADD COLUMN period_end   TEXT;
ALTER TABLE esg_reports ADD COLUMN generated_at TEXT;
ALTER TABLE esg_reports ADD COLUMN r2_key       TEXT;
ALTER TABLE esg_reports ADD COLUMN narrative    TEXT;

-- Backfill `title` from the existing `report_title` so legacy rows still
-- render in the UI list view (the SPA only reads `title`).
UPDATE esg_reports SET title = report_title WHERE title IS NULL;

CREATE INDEX IF NOT EXISTS idx_esg_reports_participant_created
  ON esg_reports (participant_id, created_at DESC);
