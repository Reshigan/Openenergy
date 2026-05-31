-- Wave 135 — IPP Lessons Learned Register
-- PMBOK 7 / ISO 21502:2022 §12.6 dissemination tracking.
-- INVERTED SLA: critical_impact 720h (30d) MOST time; low_impact 168h (7d) LEAST time.
-- SIGNATURE: disseminate_finding EVERY tier when lesson_type='safety' OR prevents_fatality=1.
-- Beats Oracle Primavera Unifier (unstructured doc storage) + MS Project (no learning registry).

CREATE TABLE IF NOT EXISTS oe_ipp_lessons_learned (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_name TEXT,
  lesson_title TEXT NOT NULL,
  chain_status TEXT NOT NULL DEFAULT 'captured',

  -- Classification
  lesson_type TEXT,         -- positive / negative / safety
  lesson_category TEXT,     -- technical / schedule / cost / safety / procurement / stakeholder
                            -- / regulatory / environmental / quality / risk / financial / contractual
  lesson_phase TEXT,        -- development / permitting / procurement / construction
                            -- / commissioning / operations / decommissioning
  impact_tier TEXT,         -- critical_impact / high_impact / medium_impact / low_impact
  rca_method TEXT,          -- five_whys / fishbone / fmea / fault_tree / timeline_analysis / none

  -- Content fields
  description TEXT NOT NULL,
  root_cause TEXT,
  impact_summary TEXT,
  recommendation TEXT,
  review_notes TEXT,
  dissemination_audience TEXT,
  application_project_ref TEXT,
  application_notes TEXT,

  -- Quantified impacts
  cost_impact_zar INTEGER,
  schedule_impact_days INTEGER,

  -- Cross-references
  issue_ref TEXT,
  risk_ref TEXT,
  rfi_ref TEXT,
  hse_incident_ref TEXT,
  change_order_ref TEXT,

  -- Floor flags (5)
  floor_safety_critical INTEGER NOT NULL DEFAULT 0,
  floor_regulatory_change INTEGER NOT NULL DEFAULT 0,
  floor_contractual_impact INTEGER NOT NULL DEFAULT 0,
  floor_design_change INTEGER NOT NULL DEFAULT 0,
  floor_portfolio_impact INTEGER NOT NULL DEFAULT 0,

  -- SLA fields
  prevents_fatality INTEGER NOT NULL DEFAULT 0,
  sla_target_hours INTEGER,
  sla_deadline_at TEXT,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  sla_breach_count INTEGER NOT NULL DEFAULT 0,

  -- Regulator
  is_reportable INTEGER NOT NULL DEFAULT 0,
  regulator_ref TEXT,

  -- State timestamps
  captured_at TEXT,
  categorized_at TEXT,
  root_cause_analyzed_at TEXT,
  impact_assessed_at TEXT,
  recommendation_drafted_at TEXT,
  peer_reviewed_at TEXT,
  approved_at TEXT,
  disseminated_at TEXT,
  applied_at TEXT,
  archived_at TEXT,
  rejected_at TEXT,
  deferred_at TEXT,
  duplicate_at TEXT,

  -- Meta
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_chain_status ON oe_ipp_lessons_learned (chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_impact_tier ON oe_ipp_lessons_learned (impact_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_lesson_type ON oe_ipp_lessons_learned (lesson_type);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_lesson_category ON oe_ipp_lessons_learned (lesson_category);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_lesson_phase ON oe_ipp_lessons_learned (lesson_phase);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_project_id ON oe_ipp_lessons_learned (project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_sla_breached ON oe_ipp_lessons_learned (sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_is_reportable ON oe_ipp_lessons_learned (is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_floor_safety ON oe_ipp_lessons_learned (floor_safety_critical);
CREATE INDEX IF NOT EXISTS idx_oe_ipp_lessons_floor_portfolio ON oe_ipp_lessons_learned (floor_portfolio_impact);

-- Events table
CREATE TABLE IF NOT EXISTS oe_ipp_lesson_events (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_id TEXT,
  actor_role TEXT,
  notes TEXT,
  regulator_crossed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_ipp_lesson_events_lesson_id ON oe_ipp_lesson_events (lesson_id);
