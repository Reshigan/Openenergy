-- Wave 59 — Esums Preventive-Maintenance Schedule Compliance & Deferral chain.
-- IEC 62446 (PV inspection / maintenance) + IEC 61724 + standard REIPPPP O&M
-- service-agreement PM-program discipline. 12-state P6 lifecycle for a single
-- scheduled PM task instance on the maintenance calendar.
--
-- The PROACTIVE maintenance-program counterpart UPSTREAM of W51 (availability
-- guarantee) and W24 (PR underperformance): keeping PMs on schedule is what
-- keeps availability and PR within guarantee. A skipped safety-critical PM is
-- the leading indicator of the availability shortfall W51 later books.
--
-- 12-state P6 lifecycle:
--   pm_scheduled → work_assigned → in_progress → completed
--     → verification_pending → closed                          (happy path)
--   rework:   verification_pending → rework_required → in_progress
--   on-hold:  in_progress → on_hold → in_progress
--   deferral: pm_scheduled|work_assigned|on_hold → deferral_requested
--               → deferred   (approve), or → work_assigned (reject)
--   skip:     pm_scheduled|work_assigned|on_hold|deferral_requested → skipped
--   cancel:   pm_scheduled|work_assigned → cancelled
--
-- Maintenance-criticality tiers (RCM-style equipment criticality index 0..100;
-- drive URGENT SLA + reportability):
--   routine         — < 20
--   standard        — < 40
--   significant     — < 60
--   critical        — < 80
--   safety_critical — >= 80
--
-- URGENT SLA: the more critical the PM, the TIGHTER the response window.
--
-- Reportability: skip_pm + sla_breached cross for critical tiers
-- {critical, safety_critical}; approve_deferral crosses for safety_critical
-- only (deferring a safety PM is reportable even when granted).
--
-- Single-party write (no O&M-contractor login): Esums O&M operators record
-- every party's action; actor_party (asset_owner / om_contractor) records the
-- contractual function per step.

CREATE TABLE IF NOT EXISTS oe_pm_compliance (
  id                            TEXT PRIMARY KEY,
  case_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (e.g. a WO-dispatch escalation or a maintenance-calendar rollup)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (single-party write; contractual party captured via actor_party)
  owner_party_id                TEXT NOT NULL,
  owner_party_name              TEXT NOT NULL,
  contractor_party_id           TEXT NOT NULL,
  contractor_party_name         TEXT NOT NULL,

  -- Asset + PM task
  site_id                       TEXT,
  site_name                     TEXT NOT NULL,
  site_province                 TEXT,
  technology                    TEXT NOT NULL,     -- solar_pv / wind / bess / hydro / hybrid
  asset_tag                     TEXT,              -- equipment tag (inverter / transformer / etc.)
  asset_class                   TEXT,              -- inverter / transformer / protection / tracker / general
  contract_ref                  TEXT,              -- O&M service agreement ref
  pm_code                       TEXT,              -- PM procedure code (e.g. IEC62446-VIS)
  pm_title                      TEXT NOT NULL,     -- human title of the PM task
  pm_frequency                  TEXT,              -- monthly / quarterly / annual / biennial

  -- Schedule window
  scheduled_date                TEXT,              -- planned due date
  window_start                  TEXT,
  window_end                    TEXT,              -- the compliance deadline (lapse = skip risk)
  deferred_to_date              TEXT,              -- new date if deferred

  -- Criticality
  criticality_score             REAL NOT NULL,     -- RCM index 0..100
  criticality_tier              TEXT NOT NULL CHECK (criticality_tier IN (
    'routine','standard','significant','critical','safety_critical'
  )),

  -- Execution figures
  checklist_total_items         INTEGER,
  checklist_passed_items        INTEGER,
  labour_hours                  REAL,
  estimated_cost_zar            REAL,
  actual_cost_zar               REAL,

  -- Refs
  assignment_ref                TEXT,
  completion_ref                TEXT,
  verification_ref              TEXT,
  rework_ref                    TEXT,
  deferral_ref                  TEXT,
  skip_ref                      TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  assignment_basis              TEXT,
  hold_basis                    TEXT,
  completion_basis              TEXT,
  verification_basis            TEXT,
  rework_basis                  TEXT,
  deferral_basis                TEXT,
  skip_basis                    TEXT,
  reason_code                   TEXT,
  notes                         TEXT,

  rework_round                  INTEGER NOT NULL DEFAULT 0,
  deferral_round                INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'pm_scheduled','work_assigned','in_progress','on_hold','completed',
    'verification_pending','rework_required','deferral_requested',
    'closed','deferred','skipped','cancelled'
  )),
  pm_scheduled_at               TEXT NOT NULL,
  work_assigned_at              TEXT,
  in_progress_at                TEXT,
  on_hold_at                    TEXT,
  completed_at                  TEXT,
  verification_pending_at       TEXT,
  rework_required_at            TEXT,
  deferral_requested_at         TEXT,
  closed_at                     TEXT,
  deferred_at                   TEXT,
  skipped_at                    TEXT,
  cancelled_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pmc_status     ON oe_pm_compliance(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_pmc_tier       ON oe_pm_compliance(criticality_tier);
CREATE INDEX IF NOT EXISTS idx_oe_pmc_contractor ON oe_pm_compliance(contractor_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_pmc_site       ON oe_pm_compliance(site_id);
CREATE INDEX IF NOT EXISTS idx_oe_pmc_scheduled  ON oe_pm_compliance(pm_scheduled_at);
CREATE INDEX IF NOT EXISTS idx_oe_pmc_sla        ON oe_pm_compliance(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_pm_compliance_events (
  id                 TEXT PRIMARY KEY,
  pm_id              TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pmc_events_p    ON oe_pm_compliance_events(pm_id);
CREATE INDEX IF NOT EXISTS idx_oe_pmc_events_type ON oe_pm_compliance_events(event_type);
