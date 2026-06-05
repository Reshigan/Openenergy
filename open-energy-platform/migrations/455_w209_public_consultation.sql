-- W209: Regulator Public Consultation & Stakeholder Engagement
-- ERA 2006 §10 + NERSA Public Participation Framework + PAJA §3-4
CREATE TABLE IF NOT EXISTS oe_public_consultations (
  id                       TEXT PRIMARY KEY,
  participant_id           TEXT NOT NULL,   -- initiating regulator/admin

  -- Consultation subject
  consultation_type        TEXT NOT NULL CHECK(consultation_type IN (
    'tariff_determination','licence_application','licence_amendment',
    'code_revision','policy_review','emergency_determination'
  )),
  consultation_tier        TEXT NOT NULL CHECK(consultation_tier IN (
    'routine','significant','national','emergency'
  )),
  title                    TEXT NOT NULL,
  description              TEXT,
  reference_number         TEXT,            -- NERSA/DMRE reference number

  -- Related entities
  licence_ref              TEXT,            -- link to W33 licence renewal or W49 application
  tariff_ref               TEXT,            -- link to W43 MYPD determination
  ppa_ref                  TEXT,            -- link to W22 PPA contract

  -- Publication
  publication_date         TEXT,
  gazette_number           TEXT,
  gazette_date             TEXT,
  comment_deadline         TEXT,
  objection_deadline       TEXT,

  -- Submissions tracking
  submissions_count        INTEGER DEFAULT 0,
  objections_count         INTEGER DEFAULT 0,
  submissions_summary      TEXT,            -- analyst summary of submissions

  -- Analysis & determination
  analysis_completed_at    TEXT,
  determination_summary    TEXT,
  determination_issued_at  TEXT,
  determination_ref        TEXT,

  -- Appeal
  appeal_filed_by          TEXT,
  appeal_grounds           TEXT,
  appeal_resolved_at       TEXT,
  appeal_outcome           TEXT CHECK(appeal_outcome IN ('upheld','dismissed','settled',NULL)),

  chain_status             TEXT NOT NULL DEFAULT 'draft' CHECK(chain_status IN (
    'draft','published','objection_period','submissions_closed',
    'analysis','determination_draft','determination_notice',
    'appealed','appeal_resolved','closed','withdrawn'
  )),
  sla_deadline             TEXT NOT NULL,
  sla_breached             INTEGER NOT NULL DEFAULT 0,
  regulator_notified       INTEGER NOT NULL DEFAULT 0,

  actor_id                 TEXT,
  reason                   TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pc_status
  ON oe_public_consultations(chain_status);

CREATE INDEX IF NOT EXISTS idx_pc_participant
  ON oe_public_consultations(participant_id);

CREATE INDEX IF NOT EXISTS idx_pc_type
  ON oe_public_consultations(consultation_type);
