-- Wave 25: HSE/SHEQ incident chain — OHSA Section 24 + NEMA Section 30
-- 9-state lifecycle for workplace-safety + environmental incidents
-- on IPP construction sites and Esums O&M sites.
-- Tiers: fatal | major | environmental | minor | near_miss
-- Reportable tiers (fatal/major/environmental) cross into regulator inbox.

CREATE TABLE IF NOT EXISTS oe_hse_incidents (
  id                                TEXT PRIMARY KEY,
  case_number                       TEXT NOT NULL UNIQUE,
  site_id                           TEXT NOT NULL,
  site_name                         TEXT NOT NULL,
  project_id                        TEXT,
  occurred_at                       TEXT NOT NULL,
  reported_at                       TEXT NOT NULL,
  reported_by                       TEXT NOT NULL,
  incident_type                     TEXT NOT NULL,    -- 'injury' | 'environmental_release' | 'near_miss' | 'fatality' | 'property_damage'
  incident_tier                     TEXT NOT NULL,    -- fatal|major|environmental|minor|near_miss
  location_description              TEXT NOT NULL,
  persons_affected                  INTEGER NOT NULL DEFAULT 0,
  injury_description                TEXT,
  environmental_release_description TEXT,
  immediate_actions_taken           TEXT,
  rca_summary                       TEXT,
  capa_plan                         TEXT,
  linked_wo_id                      TEXT,             -- W16 work order if capa dispatched
  authority_notified                INTEGER NOT NULL DEFAULT 0,
  authority                         TEXT,             -- 'DEL' (OHSA s24) | 'DFFE' (NEMA s30)
  authority_ref                     TEXT,             -- regulator reference number
  chain_status                      TEXT NOT NULL,    -- reported|triaged|notified_authority|investigating|corrective_actions_planned|corrective_actions_executing|verified|closed|escalated|false_alarm
  triaged_at                        TEXT,
  notified_authority_at             TEXT,
  investigating_at                  TEXT,
  corrective_actions_planned_at     TEXT,
  corrective_actions_executing_at   TEXT,
  verified_at                       TEXT,
  escalated_at                      TEXT,
  false_alarm_at                    TEXT,
  closed_at                         TEXT,
  closure_notes                     TEXT,
  sla_deadline_at                   TEXT,
  last_sla_breach_at                TEXT,
  escalation_level                  INTEGER NOT NULL DEFAULT 0,
  created_by                        TEXT NOT NULL,
  created_at                        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_hse_incidents_status   ON oe_hse_incidents(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_hse_incidents_tier     ON oe_hse_incidents(incident_tier);
CREATE INDEX IF NOT EXISTS idx_oe_hse_incidents_site     ON oe_hse_incidents(site_id);
CREATE INDEX IF NOT EXISTS idx_oe_hse_incidents_project  ON oe_hse_incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_hse_incidents_occurred ON oe_hse_incidents(occurred_at);
CREATE INDEX IF NOT EXISTS idx_oe_hse_incidents_sla      ON oe_hse_incidents(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_hse_incident_events (
  id          TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  actor_id    TEXT,
  notes       TEXT,
  payload     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_hse_incident_evt_case ON oe_hse_incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_oe_hse_incident_evt_time ON oe_hse_incident_events(created_at);
