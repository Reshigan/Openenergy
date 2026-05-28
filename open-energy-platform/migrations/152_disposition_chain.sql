-- Wave 31 — Regulator Compliance Notice Disposition chain — NERSA Act §10
-- 11-state P6 lifecycle for how Regulator disposes of every inbox notice
-- crossed in by other waves.

CREATE TABLE IF NOT EXISTS oe_disposition_cases (
  id                          TEXT PRIMARY KEY,
  case_number                 TEXT NOT NULL UNIQUE,
  source_inbox_id             TEXT,
  source_event                TEXT,
  source_entity_type          TEXT,
  source_entity_id            TEXT,
  source_wave                 TEXT,
  source_party                TEXT,
  notice_subject              TEXT NOT NULL,
  severity_tier               TEXT NOT NULL CHECK (severity_tier IN ('critical','high','medium','low')),
  assigned_officer            TEXT,
  assigned_directorate        TEXT,
  investigation_findings      TEXT,
  required_action             TEXT,
  action_evidence_ref         TEXT,
  disposition_outcome         TEXT,
  referred_authority          TEXT,
  referred_ref                TEXT,
  council_panel_ref           TEXT,
  council_minute_ref          TEXT,
  section10_report_ref        TEXT,
  reason_code                 TEXT,
  rod_notes                   TEXT,
  regulator_authority         TEXT NOT NULL DEFAULT 'NERSA',
  regulator_ref               TEXT,
  chain_status                TEXT NOT NULL DEFAULT 'received',
  received_at                 TEXT NOT NULL,
  triaged_at                  TEXT,
  assigned_at                 TEXT,
  investigating_at            TEXT,
  action_required_at          TEXT,
  action_in_progress_at       TEXT,
  action_completed_at         TEXT,
  closed_at                   TEXT,
  escalated_at                TEXT,
  dismissed_at                TEXT,
  referred_at                 TEXT,
  sla_deadline_at             TEXT,
  last_sla_breach_at          TEXT,
  escalation_level            INTEGER NOT NULL DEFAULT 0,
  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disposition_cases_status     ON oe_disposition_cases(chain_status);
CREATE INDEX IF NOT EXISTS idx_disposition_cases_tier       ON oe_disposition_cases(severity_tier);
CREATE INDEX IF NOT EXISTS idx_disposition_cases_officer    ON oe_disposition_cases(assigned_officer);
CREATE INDEX IF NOT EXISTS idx_disposition_cases_wave       ON oe_disposition_cases(source_wave);
CREATE INDEX IF NOT EXISTS idx_disposition_cases_party      ON oe_disposition_cases(source_party);
CREATE INDEX IF NOT EXISTS idx_disposition_cases_sla        ON oe_disposition_cases(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_disposition_events (
  id              TEXT PRIMARY KEY,
  disposition_id  TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disposition_events_disposition ON oe_disposition_events(disposition_id);
CREATE INDEX IF NOT EXISTS idx_disposition_events_created     ON oe_disposition_events(created_at);
