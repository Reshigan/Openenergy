-- Wave 26: Cybersecurity / POPIA Section 22 breach incident chain
-- 10-state lifecycle for digital security incidents — POPIA s22
-- (Information Regulator + data subjects) and Cybercrimes Act s54 (SAPS).
-- Tiers: catastrophic | major | personal_data | operational | low
-- Reportable tiers (catastrophic/major/personal_data) cross into regulator inbox.

CREATE TABLE IF NOT EXISTS oe_cyber_incidents (
  id                              TEXT PRIMARY KEY,
  case_number                     TEXT NOT NULL UNIQUE,
  asset_scope                     TEXT NOT NULL,    -- e.g. "trading-vpn" | "settlement-api" | "broker-dashboard" | "dr-storage"
  affected_system                 TEXT NOT NULL,    -- system name / cluster
  project_id                      TEXT,             -- optional IPP link
  detected_at                     TEXT NOT NULL,
  reported_at                     TEXT NOT NULL,
  reported_by                     TEXT NOT NULL,
  incident_type                   TEXT NOT NULL,    -- 'unauthorised_access' | 'data_exfiltration' | 'ransomware' | 'phishing' | 'ddos' | 'insider_threat' | 'config_drift' | 'credential_compromise'
  incident_tier                   TEXT NOT NULL,    -- catastrophic|major|personal_data|operational|low
  threat_vector                   TEXT NOT NULL,    -- e.g. "spear-phishing", "exploited 0-day", "supply chain"
  records_affected                INTEGER NOT NULL DEFAULT 0,
  data_categories                 TEXT,             -- 'PII;banking;biometrics' semicolon-separated tags
  containment_summary             TEXT,
  rca_summary                     TEXT,
  remediation_plan                TEXT,
  linked_wo_id                    TEXT,             -- W16 work order if remediation dispatched as WO
  regulator_notified              INTEGER NOT NULL DEFAULT 0,
  regulator_authority             TEXT,             -- 'IR' (POPIA s22) | 'SAPS_CYBERCRIME' (Cybercrimes Act s54) | 'IR;SAPS_CYBERCRIME'
  regulator_ref                   TEXT,             -- IR / SAPS reference number(s)
  subjects_notified               INTEGER NOT NULL DEFAULT 0,
  subjects_notified_count         INTEGER NOT NULL DEFAULT 0,
  chain_status                    TEXT NOT NULL,    -- detected|triaged|contained|notified_regulator|notified_subjects|investigating|remediation_planned|remediation_executing|verified|closed|escalated|false_alarm
  triaged_at                      TEXT,
  contained_at                    TEXT,
  notified_regulator_at           TEXT,
  notified_subjects_at            TEXT,
  investigating_at                TEXT,
  remediation_planned_at          TEXT,
  remediation_executing_at        TEXT,
  verified_at                     TEXT,
  escalated_at                    TEXT,
  false_alarm_at                  TEXT,
  closed_at                       TEXT,
  closure_notes                   TEXT,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,
  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_cyber_incidents_status   ON oe_cyber_incidents(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cyber_incidents_tier     ON oe_cyber_incidents(incident_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cyber_incidents_asset    ON oe_cyber_incidents(asset_scope);
CREATE INDEX IF NOT EXISTS idx_oe_cyber_incidents_project  ON oe_cyber_incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_cyber_incidents_detected ON oe_cyber_incidents(detected_at);
CREATE INDEX IF NOT EXISTS idx_oe_cyber_incidents_sla      ON oe_cyber_incidents(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_cyber_incident_events (
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

CREATE INDEX IF NOT EXISTS idx_oe_cyber_incident_evt_case ON oe_cyber_incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_oe_cyber_incident_evt_time ON oe_cyber_incident_events(created_at);
