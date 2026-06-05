-- W217: Support SLA Performance Report & Root Cause Analysis
-- ITIL 4 Service Level Management + ISO 20000-1 + NCC SIEM reporting
CREATE TABLE IF NOT EXISTS oe_sla_performance_reports (
  id                       TEXT PRIMARY KEY,
  participant_id           TEXT NOT NULL,   -- support / OEM operator

  -- Report scope
  report_tier              TEXT NOT NULL CHECK(report_tier IN (
    'standard','enhanced','critical','enterprise'
  )),
  reporting_period         TEXT NOT NULL,   -- e.g. 'Dec-2025', 'W50-2025'
  period_start             TEXT NOT NULL,
  period_end               TEXT NOT NULL,

  -- SLA metrics
  total_incidents          INTEGER DEFAULT 0,
  p1_count                 INTEGER DEFAULT 0,
  p2_count                 INTEGER DEFAULT 0,
  p3_count                 INTEGER DEFAULT 0,
  p4_count                 INTEGER DEFAULT 0,
  p1_sla_met               INTEGER DEFAULT 0,
  p2_sla_met               INTEGER DEFAULT 0,
  p3_sla_met               INTEGER DEFAULT 0,
  p4_sla_met               INTEGER DEFAULT 0,
  p1_sla_pct               REAL,            -- % of P1s resolved within SLA
  p2_sla_pct               REAL,
  p3_sla_pct               REAL,
  p4_sla_pct               REAL,
  overall_sla_pct          REAL,
  target_sla_pct           REAL NOT NULL DEFAULT 95.0,

  -- RCA
  rca_triggered            INTEGER DEFAULT 0,  -- 0/1 any misses warranting RCA
  rca_lead                 TEXT,
  rca_findings             TEXT,
  rca_completed_at         TEXT,
  root_causes              TEXT,            -- JSON array
  remediation_actions      TEXT,            -- JSON array

  -- Review
  reviewer_name            TEXT,
  review_completed_at      TEXT,
  remediation_plan_ref     TEXT,

  chain_status             TEXT NOT NULL DEFAULT 'data_collection' CHECK(chain_status IN (
    'data_collection','metrics_calculated','rca_in_progress','rca_complete',
    'management_review','approved','disputed','remediation_plan','withdrawn'
  )),
  sla_deadline             TEXT NOT NULL,
  sla_breached             INTEGER NOT NULL DEFAULT 0,
  regulator_notified       INTEGER NOT NULL DEFAULT 0,

  actor_id                 TEXT,
  reason                   TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spr_status
  ON oe_sla_performance_reports(chain_status);

CREATE INDEX IF NOT EXISTS idx_spr_participant
  ON oe_sla_performance_reports(participant_id);
