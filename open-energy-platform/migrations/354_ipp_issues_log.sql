-- Wave 132: IPP Issues Log & Resolution Chain
-- PMBOK 7 issue register + P6 state machine for IPP project issues.
-- URGENT SLA polarity (P1 critical = 24h tightest; P5 = 720h loosest).
-- SIGNATURE: escalate_to_regulator crosses regulator EVERY tier when
-- category = 'safety' OR 'regulatory' (OHSA s24 + ERA s35 notifiable).
-- Joins existing 'ipp' audit namespace.

CREATE TABLE IF NOT EXISTS oe_ipp_issues (
  id                        TEXT PRIMARY KEY,
  project_id                TEXT NOT NULL,
  project_name              TEXT,

  -- Issue metadata
  title                     TEXT NOT NULL,
  description               TEXT,
  category                  TEXT NOT NULL DEFAULT 'general'
                            CHECK (category IN (
                              'safety','regulatory','technical','commercial',
                              'environmental','stakeholder','legal','financial','general'
                            )),
  priority                  TEXT NOT NULL DEFAULT 'p3_medium'
                            CHECK (priority IN (
                              'p1_critical','p2_high','p3_medium','p4_low','p5_informational'
                            )),

  -- Chain state
  chain_status              TEXT NOT NULL DEFAULT 'raised'
                            CHECK (chain_status IN (
                              'raised','triaged','assigned','acknowledged',
                              'in_progress','blocked','under_review','resolved',
                              'verified','evidence_filed','closed','archived',
                              'escalated','deferred','cancelled','overdue_flagged'
                            )),

  -- Ownership
  raised_by                 TEXT,
  assigned_to               TEXT,
  owner_name                TEXT,

  -- SLA (URGENT: P1=24h, P2=72h, P3=168h, P4=336h, P5=720h)
  sla_target_hours          INTEGER,
  sla_deadline_at           TEXT,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  last_sla_breach_at        TEXT,
  escalation_level          INTEGER NOT NULL DEFAULT 0,

  -- Regulator crossing fields (SIGNATURE)
  is_reportable             INTEGER NOT NULL DEFAULT 0,
  regulator_relevant        INTEGER NOT NULL DEFAULT 0,
  regulator_ref             TEXT,
  regulator_crossed_at      TEXT,
  inbox_ref                 TEXT,

  -- Resolution details
  resolution_summary        TEXT,
  root_cause                TEXT,
  preventive_action         TEXT,
  lessons_learned           TEXT,
  evidence_ref              TEXT,

  -- Context flags (for SLA floor + regulator crossing logic)
  is_safety                 INTEGER NOT NULL DEFAULT 0,
  is_regulatory             INTEGER NOT NULL DEFAULT 0,
  is_commercial             INTEGER NOT NULL DEFAULT 0,
  is_lender_notifiable      INTEGER NOT NULL DEFAULT 0,
  is_nersa_notifiable       INTEGER NOT NULL DEFAULT 0,

  -- Bridge references
  rfi_ref                   TEXT,   -- W116 linked RFI
  change_order_ref          TEXT,   -- W117 linked CR
  stage_gate_ref            TEXT,   -- W131 linked stage gate
  hse_incident_ref          TEXT,   -- W25 linked HSE incident
  w118_block_ref            TEXT,   -- W118 MANDATORY at evidence_filed

  -- Live computed flags (persisted, refreshed at fetch)
  bridges_to_rfi_live       INTEGER NOT NULL DEFAULT 0,
  bridges_to_co_live        INTEGER NOT NULL DEFAULT 0,
  bridges_to_sg_live        INTEGER NOT NULL DEFAULT 0,
  bridges_to_hse_live       INTEGER NOT NULL DEFAULT 0,
  bridges_to_w118_live      INTEGER NOT NULL DEFAULT 0,

  -- State timestamps (12 forward + 4 branch)
  raised_at                 TEXT,
  triaged_at                TEXT,
  assigned_at               TEXT,
  acknowledged_at           TEXT,
  in_progress_at            TEXT,
  blocked_at                TEXT,
  under_review_at           TEXT,
  resolved_at               TEXT,
  verified_at               TEXT,
  evidence_filed_at         TEXT,
  closed_at                 TEXT,
  archived_at               TEXT,
  escalated_at              TEXT,
  deferred_at               TEXT,
  cancelled_at              TEXT,
  overdue_flagged_at        TEXT,

  -- Audit
  created_by                TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_ipp_issue_events (
  id          TEXT PRIMARY KEY,
  issue_id    TEXT NOT NULL REFERENCES oe_ipp_issues(id),
  event_type  TEXT NOT NULL,
  actor_id    TEXT,
  from_status TEXT,
  to_status   TEXT,
  payload     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_issues_status   ON oe_ipp_issues(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_issues_priority  ON oe_ipp_issues(priority);
CREATE INDEX IF NOT EXISTS idx_ipp_issues_project   ON oe_ipp_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_ipp_issues_category  ON oe_ipp_issues(category);
CREATE INDEX IF NOT EXISTS idx_ipp_issues_breached  ON oe_ipp_issues(sla_breached);
CREATE INDEX IF NOT EXISTS idx_ipp_issues_safety    ON oe_ipp_issues(is_safety);
CREATE INDEX IF NOT EXISTS idx_ipp_issues_reg       ON oe_ipp_issues(regulator_relevant);
CREATE INDEX IF NOT EXISTS idx_ipp_issues_created   ON oe_ipp_issues(created_at);
CREATE INDEX IF NOT EXISTS idx_ipp_issues_w118      ON oe_ipp_issues(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_ipp_issues_sg_ref    ON oe_ipp_issues(stage_gate_ref);
CREATE INDEX IF NOT EXISTS idx_ipp_issue_events_iss ON oe_ipp_issue_events(issue_id);
