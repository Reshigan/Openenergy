-- Wave 133: IPP Risk Register & Treatment Chain
-- PMBOK 7 Risk Management + ISO 31000:2018 + IEC 31010:2019 + REIPPPP risk allocation.
-- INVERTED SLA polarity (catastrophic 2160h → low_impact 168h — higher impact = more treatment time).
-- SIGNATURE: escalate_risk EVERY tier when safety AND (critical|catastrophic)
--   (OHSA s24 critical risk materialisation is universally reportable).
-- flag_triggered catastrophic EVERY tier (universal hard line — catastrophic events always cross).
-- Joins existing 'ipp' audit namespace.

CREATE TABLE IF NOT EXISTS oe_ipp_risks (
  id                          TEXT PRIMARY KEY,
  project_id                  TEXT NOT NULL,
  project_name                TEXT,

  -- Risk identification
  title                       TEXT NOT NULL,
  description                 TEXT,
  risk_category               TEXT NOT NULL DEFAULT 'technical'
                              CHECK (risk_category IN (
                                'construction','technical','financial','regulatory',
                                'environmental','safety','geopolitical','commercial',
                                'force_majeure','legal'
                              )),

  -- Risk tier (INVERTED SLA: catastrophic gets most time for response planning)
  risk_tier                   TEXT NOT NULL DEFAULT 'medium_impact'
                              CHECK (risk_tier IN (
                                'low_impact','medium_impact','high_impact',
                                'critical_impact','catastrophic'
                              )),

  -- Chain state
  chain_status                TEXT NOT NULL DEFAULT 'identified'
                              CHECK (chain_status IN (
                                'identified','assessed','quantified','response_planned',
                                'owner_assigned','monitoring','triggered','responding',
                                'outcome_recorded','closed','archived',
                                'escalated','deferred','cancelled','overdue_flagged'
                              )),

  -- Probability × Impact matrix (1–5 scale, PMBOK 7 Table 11-3)
  probability_score           INTEGER CHECK (probability_score BETWEEN 1 AND 5),
  impact_score                INTEGER CHECK (impact_score BETWEEN 1 AND 5),
  risk_score                  INTEGER,   -- probability_score × impact_score (1–25)
  residual_probability_score  INTEGER CHECK (residual_probability_score BETWEEN 1 AND 5),
  residual_impact_score       INTEGER CHECK (residual_impact_score BETWEEN 1 AND 5),
  residual_risk_score         INTEGER,   -- after mitigation

  -- Response strategy
  response_strategy           TEXT CHECK (response_strategy IN (
                                'avoid','mitigate','transfer','accept','escalate'
                              )),
  response_plan               TEXT,
  contingency_reserve_zar     REAL,
  risk_trigger_description    TEXT,   -- what happened when risk materialised
  treatment_outcome           TEXT,   -- result after response
  lessons_learned             TEXT,
  evidence_ref                TEXT,

  -- Ownership
  risk_owner                  TEXT,
  assigned_to                 TEXT,

  -- SLA (INVERTED: catastrophic 2160h > critical 1440h > high 720h > medium 336h > low 168h)
  sla_target_hours            INTEGER,
  sla_deadline_at             TEXT,
  sla_breached                INTEGER NOT NULL DEFAULT 0,
  last_sla_breach_at          TEXT,
  escalation_level            INTEGER NOT NULL DEFAULT 0,

  -- Regulator crossing fields (SIGNATURE)
  is_reportable               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant          INTEGER NOT NULL DEFAULT 0,
  regulator_ref               TEXT,
  regulator_crossed_at        TEXT,

  -- Context flags
  is_safety                   INTEGER NOT NULL DEFAULT 0,
  is_regulatory               INTEGER NOT NULL DEFAULT 0,

  -- Floor flags (INVERTED SLA drivers — caller-supplied)
  floor_board_notify          INTEGER NOT NULL DEFAULT 0,  -- ≥20 risk_score OR safety critical
  floor_ep4_action_required   INTEGER NOT NULL DEFAULT 0,  -- Equator Principles IV action plan
  floor_lender_notifiable     INTEGER NOT NULL DEFAULT 0,  -- lender covenant trigger
  floor_nersa_notifiable      INTEGER NOT NULL DEFAULT 0,  -- regulatory notification
  floor_insurance_applicable  INTEGER NOT NULL DEFAULT 0,  -- insurance claim applicable

  -- Bridge references
  issue_ref                   TEXT,   -- W132 linked issue (when triggered)
  stage_gate_ref              TEXT,   -- W131 gate-blocking risk
  procurement_ref             TEXT,   -- W19 procurement risk
  hse_incident_ref            TEXT,   -- W25 safety risk
  w118_block_ref              TEXT,   -- W118 MANDATORY at outcome_recorded

  -- Live bridge flags
  bridges_to_issue_live       INTEGER NOT NULL DEFAULT 0,
  bridges_to_sg_live          INTEGER NOT NULL DEFAULT 0,
  bridges_to_w118_live        INTEGER NOT NULL DEFAULT 0,

  -- State timestamps
  identified_at               TEXT,
  assessed_at                 TEXT,
  quantified_at               TEXT,
  response_planned_at         TEXT,
  owner_assigned_at           TEXT,
  monitoring_at               TEXT,
  triggered_at                TEXT,
  responding_at               TEXT,
  outcome_recorded_at         TEXT,
  closed_at                   TEXT,
  archived_at                 TEXT,
  escalated_at                TEXT,
  deferred_at                 TEXT,
  cancelled_at                TEXT,
  overdue_flagged_at          TEXT,

  -- Audit
  created_by                  TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_ipp_risk_events (
  id          TEXT PRIMARY KEY,
  risk_id     TEXT NOT NULL REFERENCES oe_ipp_risks(id),
  event_type  TEXT NOT NULL,
  actor_id    TEXT,
  from_status TEXT,
  to_status   TEXT,
  payload     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_risks_status    ON oe_ipp_risks(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_risks_tier       ON oe_ipp_risks(risk_tier);
CREATE INDEX IF NOT EXISTS idx_ipp_risks_project    ON oe_ipp_risks(project_id);
CREATE INDEX IF NOT EXISTS idx_ipp_risks_category   ON oe_ipp_risks(risk_category);
CREATE INDEX IF NOT EXISTS idx_ipp_risks_breached   ON oe_ipp_risks(sla_breached);
CREATE INDEX IF NOT EXISTS idx_ipp_risks_safety     ON oe_ipp_risks(is_safety);
CREATE INDEX IF NOT EXISTS idx_ipp_risks_score      ON oe_ipp_risks(risk_score);
CREATE INDEX IF NOT EXISTS idx_ipp_risks_triggered  ON oe_ipp_risks(triggered_at);
CREATE INDEX IF NOT EXISTS idx_ipp_risks_w118       ON oe_ipp_risks(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_ipp_risks_sg_ref     ON oe_ipp_risks(stage_gate_ref);
CREATE INDEX IF NOT EXISTS idx_ipp_risk_events_risk ON oe_ipp_risk_events(risk_id);
