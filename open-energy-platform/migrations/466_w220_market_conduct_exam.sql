-- W220: Regulator Market Conduct Examination
-- NERSA ERA §34 + FSCA Conduct Standard 1/2020 — proactive conduct examination
CREATE TABLE IF NOT EXISTS oe_market_conduct_exams (
  id                          TEXT PRIMARY KEY,
  participant_id              TEXT NOT NULL,   -- regulator conducting the examination

  -- Examination classification
  exam_tier                   TEXT NOT NULL CHECK(exam_tier IN (
    'routine','thematic','targeted','major_systemic'
  )),
  exam_type                   TEXT CHECK(exam_type IN (
    'pricing_conduct','transparency','consumer_protection','market_integrity',
    'cross_cutting','ad_hoc',NULL
  )),
  subject_participant_id      TEXT,            -- entity being examined
  subject_licence_class       TEXT,            -- licence class under examination
  examination_ref             TEXT,            -- internal NERSA/FSCA reference

  -- Notice & document request
  notice_issued_at            TEXT,
  notice_ref                  TEXT,
  document_request_ref        TEXT,
  document_deadline           TEXT,
  documents_received_at       TEXT,

  -- On-site review
  on_site_start_date          TEXT,
  on_site_end_date            TEXT,
  on_site_lead_examiner       TEXT,

  -- Findings
  preliminary_findings_ref    TEXT,
  preliminary_issued_at       TEXT,
  response_deadline           TEXT,
  subject_response_ref        TEXT,
  subject_response_at         TEXT,

  -- Final report
  final_report_ref            TEXT,
  final_report_issued_at      TEXT,
  findings_summary            TEXT,
  adverse_findings_count      INTEGER DEFAULT 0,

  -- Outcome
  remedial_action_ref         TEXT,
  remedial_action_deadline    TEXT,
  enforcement_ref             TEXT,            -- links to W40/W66 enforcement proceedings

  chain_status                TEXT NOT NULL DEFAULT 'examination_scheduled' CHECK(chain_status IN (
    'examination_scheduled','notice_issued','document_request','documents_submitted',
    'on_site_review','preliminary_findings','subject_response','final_report_draft',
    'report_issued','remedial_action_required','enforcement_action',
    'closed_satisfactory','withdrawn'
  )),
  sla_deadline                TEXT NOT NULL,
  sla_breached                INTEGER NOT NULL DEFAULT 0,
  regulator_notified          INTEGER NOT NULL DEFAULT 0,

  actor_id                    TEXT,
  reason                      TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mce_status
  ON oe_market_conduct_exams(chain_status);

CREATE INDEX IF NOT EXISTS idx_mce_participant
  ON oe_market_conduct_exams(participant_id);

CREATE INDEX IF NOT EXISTS idx_mce_subject
  ON oe_market_conduct_exams(subject_participant_id);
