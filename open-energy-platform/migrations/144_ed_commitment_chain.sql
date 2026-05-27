-- Wave 27: REIPPPP Economic Development (ED) commitment monitoring chain
-- 9-state monitoring lifecycle for the 7 contractual ED commitments that
-- every REIPPPP project carries to IPPO/DMRE/DTI:
--   baseline_locked → monitoring → variance_flagged → cure_plan_required →
--   cure_plan_submitted → cure_executing → verified_compliant → closed
-- Penalty branch: cure_executing → penalty_issued → closed
-- Escalation:     cure_executing | penalty_issued → escalated → closed
-- False-alarm:    variance_flagged → false_alarm → closed
-- Tiers: ownership | local_content | jobs | skills | enterprise_dev | socio_economic | community_trust

CREATE TABLE IF NOT EXISTS oe_ed_commitments (
  id                              TEXT PRIMARY KEY,
  case_number                     TEXT NOT NULL UNIQUE,
  project_id                      TEXT NOT NULL,
  project_name                    TEXT NOT NULL,
  bid_window                      TEXT NOT NULL,    -- e.g. 'BW5', 'BW6', 'RMIPPPP'
  commitment_type                 TEXT NOT NULL,    -- ownership|local_content|jobs|skills|enterprise_dev|socio_economic|community_trust
  commitment_label                TEXT NOT NULL,    -- human label e.g. "Black ownership %", "Local content %", "FTE jobs"
  baseline_value                  REAL NOT NULL,    -- contractual commitment (e.g. 30 for 30%, or 450 for 450 FTE)
  baseline_unit                   TEXT NOT NULL,    -- 'percent' | 'fte' | 'zar' | 'count'
  reporting_period                TEXT NOT NULL,    -- 'YYYY-Qn' or 'YYYY' for the most recent reporting cycle
  current_value                   REAL,             -- latest reported value
  variance_pct                    REAL,             -- (current - baseline) / baseline * 100 — negative = under
  variance_threshold_pct          REAL NOT NULL DEFAULT -5.0, -- below this fires variance_flagged
  cure_plan_summary               TEXT,
  cure_plan_filed_at              TEXT,
  cure_plan_approved_at           TEXT,
  remediation_summary             TEXT,
  linked_wo_id                    TEXT,             -- W16 work order if remediation dispatched as WO
  penalty_amount_zar              REAL,
  penalty_ref                     TEXT,
  regulator_authority             TEXT,             -- 'IPPO' | 'DMRE' | 'DTI' | combined
  regulator_ref                   TEXT,             -- IPPO/DMRE/DTI reference number(s)
  chain_status                    TEXT NOT NULL,    -- 9 states + escalated + false_alarm
  baseline_locked_at              TEXT NOT NULL,
  monitoring_at                   TEXT,
  variance_flagged_at             TEXT,
  cure_plan_required_at           TEXT,
  cure_plan_submitted_at          TEXT,
  cure_executing_at               TEXT,
  verified_compliant_at           TEXT,
  penalty_issued_at               TEXT,
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

CREATE INDEX IF NOT EXISTS idx_oe_ed_commitments_status   ON oe_ed_commitments(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ed_commitments_type     ON oe_ed_commitments(commitment_type);
CREATE INDEX IF NOT EXISTS idx_oe_ed_commitments_project  ON oe_ed_commitments(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ed_commitments_bw       ON oe_ed_commitments(bid_window);
CREATE INDEX IF NOT EXISTS idx_oe_ed_commitments_period   ON oe_ed_commitments(reporting_period);
CREATE INDEX IF NOT EXISTS idx_oe_ed_commitments_sla      ON oe_ed_commitments(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_ed_commitment_events (
  id            TEXT PRIMARY KEY,
  commitment_id TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  actor_id      TEXT,
  notes         TEXT,
  payload       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_ed_commitment_evt_case ON oe_ed_commitment_events(commitment_id);
CREATE INDEX IF NOT EXISTS idx_oe_ed_commitment_evt_time ON oe_ed_commitment_events(created_at);
