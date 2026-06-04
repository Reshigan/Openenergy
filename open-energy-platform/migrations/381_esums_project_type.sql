-- Migration 381: Esums project type — ipp vs standalone
--
-- An esums_project is either:
--   ipp        — linked to an ipp_projects row (developer already has a tracked
--                IPP project; Esums O&M is the operational layer on top of it)
--   standalone — no IPP project link (asset-owner onboarding, community solar,
--                behind-the-meter BESS, etc.)
--
-- If a participant has no esums_projects when they first open Esums, the
-- application auto-creates one standalone project so they can immediately
-- proceed without a setup screen.

ALTER TABLE esums_projects ADD COLUMN project_type TEXT NOT NULL DEFAULT 'standalone'
  CHECK (project_type IN ('ipp', 'standalone'));

-- Nullable FK: populated only when project_type = 'ipp'.
-- ON DELETE SET NULL so retiring an IPP project does not cascade to Esums.
ALTER TABLE esums_projects ADD COLUMN ipp_project_id TEXT REFERENCES ipp_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_esums_projects_ipp ON esums_projects(ipp_project_id);
