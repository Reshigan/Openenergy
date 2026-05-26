-- ═══════════════════════════════════════════════════════════════════════════
-- 092 — IPP Project Schedule (P6-grade)
--
-- Per docs/superpowers/specs/2026-05-26-wave1-ipp-pm-design.md
-- WBS + activities + deps + calendars + resources + assignments + baselines.
-- All CREATE TABLE IF NOT EXISTS; safe to re-apply.
-- ═══════════════════════════════════════════════════════════════════════════

-- WBS + activity in one table; type discriminates.
CREATE TABLE IF NOT EXISTS project_activities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  wbs_code TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('summary','task','milestone')),
  duration_days REAL NOT NULL DEFAULT 0,
  planned_start TEXT,
  planned_finish TEXT,
  early_start TEXT,
  early_finish TEXT,
  late_start TEXT,
  late_finish TEXT,
  total_float REAL,
  free_float REAL,
  is_critical INTEGER DEFAULT 0,
  actual_start TEXT,
  actual_finish TEXT,
  percent_complete REAL DEFAULT 0,
  constraint_type TEXT CHECK (constraint_type IN ('ASAP','SNET','FNLT','MSO','MFO')),
  constraint_date TEXT,
  calendar_id TEXT,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, wbs_code)
);
CREATE INDEX IF NOT EXISTS idx_activities_project ON project_activities(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_activities_parent  ON project_activities(parent_id);
CREATE INDEX IF NOT EXISTS idx_activities_critical ON project_activities(project_id, is_critical);

CREATE TABLE IF NOT EXISTS activity_dependencies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  predecessor_id TEXT NOT NULL,
  successor_id TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('FS','SS','FF','SF')),
  lag_days REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(predecessor_id, successor_id)
);
CREATE INDEX IF NOT EXISTS idx_deps_project ON activity_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_deps_succ    ON activity_dependencies(successor_id);
CREATE INDEX IF NOT EXISTS idx_deps_pred    ON activity_dependencies(predecessor_id);

CREATE TABLE IF NOT EXISTS project_calendars (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  workdays TEXT NOT NULL,                 -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendars_project ON project_calendars(project_id);

CREATE TABLE IF NOT EXISTS calendar_exceptions (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  exception_date TEXT NOT NULL,
  hours REAL NOT NULL,
  reason TEXT,
  UNIQUE(calendar_id, exception_date)
);

CREATE TABLE IF NOT EXISTS project_resources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('labor','equipment','material')),
  unit TEXT,
  max_units REAL NOT NULL DEFAULT 1,
  rate_per_unit REAL,
  calendar_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resources_project ON project_resources(project_id);

CREATE TABLE IF NOT EXISTS resource_assignments (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  units REAL NOT NULL DEFAULT 1,
  UNIQUE(activity_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_activity ON resource_assignments(activity_id);
CREATE INDEX IF NOT EXISTS idx_assignments_resource ON resource_assignments(resource_id);

CREATE TABLE IF NOT EXISTS project_baselines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  saved_by TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  notes TEXT,
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS baseline_activities (
  baseline_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  planned_start TEXT,
  planned_finish TEXT,
  duration_days REAL,
  PRIMARY KEY(baseline_id, activity_id)
);

CREATE TABLE IF NOT EXISTS project_schedule_state (
  project_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  status_date TEXT,
  last_computed_at TEXT,
  total_duration_days REAL,
  start_date TEXT,
  finish_date TEXT,
  has_cycles INTEGER DEFAULT 0
);

-- Backfill: existing project_milestones gets a nullable link to schedule activities.
-- Per CLAUDE.md migration discipline, "duplicate column name" is benign on re-apply.
ALTER TABLE project_milestones ADD COLUMN linked_activity_id TEXT;
