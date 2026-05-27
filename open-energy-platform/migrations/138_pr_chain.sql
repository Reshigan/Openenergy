-- Wave 24: Esums Performance-Ratio sustained-underperformance chain
-- 9-state lifecycle on sites whose PR drops below baseline for sustained window
-- Tiers: utility ≥50MW, midscale ≥10MW, ci ≥1MW, microgrid <1MW

CREATE TABLE IF NOT EXISTS oe_pr_chain (
  id                       TEXT PRIMARY KEY,
  case_number              TEXT NOT NULL UNIQUE,
  site_id                  TEXT NOT NULL,
  site_name                TEXT NOT NULL,
  technology               TEXT NOT NULL,            -- 'solar_pv', 'wind', 'bess', 'hybrid'
  capacity_mw              REAL NOT NULL,
  capacity_tier            TEXT NOT NULL,            -- utility|midscale|ci|microgrid
  baseline_pr              REAL NOT NULL,            -- e.g. 0.85
  observed_pr              REAL NOT NULL,            -- e.g. 0.71
  pr_shortfall             REAL NOT NULL,            -- baseline - observed
  window_days              INTEGER NOT NULL,         -- consecutive days under threshold
  detected_at              TEXT NOT NULL,
  primary_cause            TEXT,                     -- 'soiling', 'inverter_fault', 'string_loss', 'shading', 'OEM_defect', 'weather', etc
  rca_summary              TEXT,
  action_plan              TEXT,
  linked_wo_id             TEXT,                     -- W16 work order (intervention_executing onwards)
  linked_warranty_claim_id TEXT,                     -- W15 warranty claim (escalated)
  revenue_loss_zar         REAL,                     -- cumulative ZAR loss while underperforming
  chain_status             TEXT NOT NULL,            -- monitoring|warning|investigating|intervention_planned|intervention_executing|verified|escalated|closed|false_alarm
  warning_at               TEXT,
  investigating_at         TEXT,
  intervention_planned_at  TEXT,
  intervention_executing_at TEXT,
  verified_at              TEXT,
  escalated_at             TEXT,
  closed_at                TEXT,
  false_alarm_at           TEXT,
  closure_notes            TEXT,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,
  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_pr_chain_status   ON oe_pr_chain(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_pr_chain_tier     ON oe_pr_chain(capacity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_pr_chain_site     ON oe_pr_chain(site_id);
CREATE INDEX IF NOT EXISTS idx_oe_pr_chain_sla      ON oe_pr_chain(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_pr_chain_detected ON oe_pr_chain(detected_at);

CREATE TABLE IF NOT EXISTS oe_pr_chain_events (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  actor_id    TEXT,
  notes       TEXT,
  payload     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_pr_chain_evt_case ON oe_pr_chain_events(case_id);
CREATE INDEX IF NOT EXISTS idx_oe_pr_chain_evt_time ON oe_pr_chain_events(created_at);
