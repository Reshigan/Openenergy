-- Wave 134: IPP Stakeholder Register & Engagement Tracking
-- PMBOK 7 Stakeholder Management (Section 13) + ISO 21500:2021 stakeholder management
-- + REIPPPP Section 4 community participation + IFC Performance Standard 1 (PS1)
-- + Equator Principles IV (EP4 community engagement) + NERSA licence conditions.
--
-- URGENT SLA polarity (HOURS) — strategic_ally 24h TIGHTEST (daily contact):
--   strategic_ally  24h   (daily contact required)
--   key_player      48h   (every 2 days)
--   keep_satisfied  168h  (weekly)
--   keep_informed   336h  (bi-weekly)
--   monitor         720h  (monthly)
--
-- W134 SIGNATURE:
--   escalate_engagement EVERY tier (any escalation is universally reportable)
--   flag_resistant crosses regulator when power_score >= 4
--     (high-power resistant stakeholder = REIPPPP community-participation risk)
--
-- P×I×U engagement matrix (1-5 each, engagement_score = P×I×U, max 125)
-- Tier derivation: power>=5 AND interest>=5 → strategic_ally
--                  power>=4 AND interest>=4 → key_player
--                  power>=4 → keep_satisfied
--                  interest>=4 → keep_informed
--                  else → monitor
--
-- Joins existing 'ipp' audit namespace.

CREATE TABLE IF NOT EXISTS oe_ipp_stakeholders (
  id                        TEXT PRIMARY KEY,
  project_id                TEXT NOT NULL,
  project_name              TEXT,

  -- Stakeholder identity
  stakeholder_name          TEXT NOT NULL,
  organization              TEXT,
  stakeholder_type          TEXT NOT NULL
                            CHECK (stakeholder_type IN (
                              'community_leader','municipality','traditional_authority',
                              'regulator','funder','offtaker','contractor','consultant',
                              'ngo','government_dept','media','internal'
                            )),

  -- Chain state (12-state engagement lifecycle)
  chain_status              TEXT NOT NULL DEFAULT 'identified'
                            CHECK (chain_status IN (
                              'identified','analyzed','classified','engagement_planned',
                              'active_engagement','responsive','supportive','champion',
                              'resistant','disengaged','escalated','archived'
                            )),

  -- Engagement scoring (P×I×U matrix, 1-5 each)
  power_score               INTEGER CHECK (power_score BETWEEN 1 AND 5),
  interest_score            INTEGER CHECK (interest_score BETWEEN 1 AND 5),
  urgency_score             INTEGER CHECK (urgency_score BETWEEN 1 AND 5),
  -- NOTE: engagement_score computed in application layer (P×I×U max 125)
  -- SQLite GENERATED ALWAYS ... STORED not supported on D1 for expressions with COALESCE
  engagement_score          INTEGER,

  -- Stakeholder tier (derived from P×I matrix)
  stakeholder_tier          TEXT CHECK (stakeholder_tier IN (
                              'strategic_ally','key_player','keep_satisfied',
                              'keep_informed','monitor'
                            )),

  -- Engagement level (current vs desired)
  current_engagement_level  TEXT CHECK (current_engagement_level IN (
                              'unaware','resistant','neutral','supportive','leading'
                            )),
  desired_engagement_level  TEXT CHECK (desired_engagement_level IN (
                              'unaware','resistant','neutral','supportive','leading'
                            )),

  -- Communication plan
  communication_frequency   TEXT CHECK (communication_frequency IN (
                              'daily','weekly','biweekly','monthly'
                            )),
  communication_channel     TEXT CHECK (communication_channel IN (
                              'meeting','email','phone','workshop','site_visit','formal_report'
                            )),
  communication_plan        TEXT,
  last_engagement_at        TEXT,
  next_engagement_due_at    TEXT,
  engagement_notes          TEXT,

  -- Contact info
  contact_person            TEXT,
  contact_email             TEXT,
  contact_phone             TEXT,

  -- SLA (URGENT polarity: strategic_ally 24h TIGHTEST)
  sla_target_hours          INTEGER,
  sla_deadline_at           TEXT,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  sla_breach_count          INTEGER NOT NULL DEFAULT 0,
  last_sla_breach_at        TEXT,

  -- Context floor flags (caller-supplied, not gate_index-derived)
  floor_ep4_required        INTEGER NOT NULL DEFAULT 0,  -- REIPPPP Section 4 community participation
  floor_board_notify        INTEGER NOT NULL DEFAULT 0,  -- Board-level stakeholder
  floor_legal_risk          INTEGER NOT NULL DEFAULT 0,  -- Litigation/legal risk
  floor_nersa_required      INTEGER NOT NULL DEFAULT 0,  -- Required for NERSA process
  floor_lender_required     INTEGER NOT NULL DEFAULT 0,  -- Required for lender/DFI

  -- Regulator crossing fields
  is_reportable             INTEGER NOT NULL DEFAULT 0,
  regulator_relevant        INTEGER NOT NULL DEFAULT 0,
  regulator_ref             TEXT,
  regulator_crossed_at      TEXT,

  -- Bridge references (cross-links to other IPP chains)
  stage_gate_ref            TEXT,    -- W131 stage gate
  issue_ref                 TEXT,    -- W132 issues log
  risk_ref                  TEXT,    -- W133 risk register
  ed_commitment_ref         TEXT,    -- W27 ED commitment
  hse_incident_ref          TEXT,    -- W25 HSE incident

  -- State timestamps (one per chain state)
  identified_at             TEXT,
  analyzed_at               TEXT,
  classified_at             TEXT,
  engagement_planned_at     TEXT,
  active_engagement_at      TEXT,
  responsive_at             TEXT,
  supportive_at             TEXT,
  champion_at               TEXT,
  resistant_at              TEXT,
  disengaged_at             TEXT,
  escalated_at              TEXT,
  archived_at               TEXT,

  -- Audit
  created_by                TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_ipp_stakeholder_events (
  id                TEXT PRIMARY KEY,
  stakeholder_id    TEXT NOT NULL REFERENCES oe_ipp_stakeholders(id),
  action            TEXT NOT NULL,
  from_status       TEXT,
  to_status         TEXT,
  actor_id          TEXT,
  actor_role        TEXT,
  notes             TEXT,
  regulator_crossed INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ipp_sth_status       ON oe_ipp_stakeholders(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_sth_tier         ON oe_ipp_stakeholders(stakeholder_tier);
CREATE INDEX IF NOT EXISTS idx_ipp_sth_type         ON oe_ipp_stakeholders(stakeholder_type);
CREATE INDEX IF NOT EXISTS idx_ipp_sth_project      ON oe_ipp_stakeholders(project_id);
CREATE INDEX IF NOT EXISTS idx_ipp_sth_breached     ON oe_ipp_stakeholders(sla_breached);
CREATE INDEX IF NOT EXISTS idx_ipp_sth_ep4          ON oe_ipp_stakeholders(floor_ep4_required);
CREATE INDEX IF NOT EXISTS idx_ipp_sth_reportable   ON oe_ipp_stakeholders(is_reportable);
CREATE INDEX IF NOT EXISTS idx_ipp_sth_power        ON oe_ipp_stakeholders(power_score);
CREATE INDEX IF NOT EXISTS idx_ipp_sth_events       ON oe_ipp_stakeholder_events(stakeholder_id);
