-- Wave 83 — NERSA Consultation Notice & Public-Comment Period chain (P6).
-- The PUBLIC-ENGAGEMENT engine of the energy regulator. NERSA must publish a notice
-- and invite comment before adopting any material rule, methodology, licence
-- condition or tariff determination — Electricity Regulation Act 4 of 2006 s.10,
-- Promotion of Administrative Justice Act 3 of 2000 s.4, and NERSA's Rules of
-- Procedure all anchor it. THIS chain governs the notice lifecycle: draft -> publish
-- (Gazette) -> open comment period -> optional extension -> close -> optional
-- public hearing -> analysis -> consolidated response with reasons -> adopted
-- decision; with on-hold for legal review and withdrawn/cancelled terminals.
--
-- DISTINCT from every other regulator chain by SUBJECT:
--   - W5 portal: inbox/SLA materializer.
--   - W31 disposition: OUTCOME of a NERSA s10 case; W83 is the DUE-PROCESS engine
--     that PRECEDES it.
--   - W33/W49/W57: licence lifecycle.
--   - W40: PROACTIVE compliance supervision.
--   - W43: WHAT a licensee charges (the determination itself; its consultation may
--     flow through W83).
--   - W66: REACTIVE external complaints.
--   - W74: what licensees OWE NERSA.
--
-- The DISTINCTIVE move (beat best-in-class — ACER EU consultation portal, FERC
-- eFiling consultation system, Ofgem consultation hub, AER consultation register,
-- BEREC public-consultation system — all of which run essentially linear publish-
-- comment-respond workflows with manual procedural-validity tracking): live
-- calculated consultation-health battery on every record — comments received,
-- stakeholder-balance index, representativeness coverage, statutory-period
-- validity flag, judicial-review risk score, days remaining, extension-count
-- visibility — all derived from the same inputs each transition.
--
-- 12-state P6 lifecycle:
--   drafted -> published -> open_for_comment -> comment_period_closed
--     -> analysis -> response_drafted -> adopted                      (clean path)
--   Optional hearing branch:
--     comment_period_closed -> hearing_scheduled -> hearing_held -> analysis
--   on_hold       — legal review or extended notice pause; resume -> analysis.
--   withdrawn     — NERSA pulls the consultation notice. Terminal.
--   cancelled     — admin cancel (drafting error / duplicate). Terminal.
--
-- Tiers — by ESTIMATED affected_parties_count: minor <50 / standard <500 /
--   material <5000 / landmark >=5000. Binding consultation_class floors at material.
--
-- INVERTED SLA: the LARGER the consultation, the LONGER every window. A landmark
--   structural-policy consultation warrants extended notice/comment/analysis;
--   a minor procedural notice runs the shortest. Same family as W19/W20/W43/W49/
--   W56/W65/W70/W73/W81/W82.
--
-- Reportability (the W83 SIGNATURE is TRANSPARENCY-driven):
--   withdraw_notice crosses for EVERY tier — pulling a published consultation is
--                   ALWAYS notifiable to PAJA / Council oversight (W83 SIGNATURE).
--   adopt_decision crosses for EVERY tier when the consultation is binding-class
--                  (binding determinations carry downstream legal effect); else
--                  for the large tiers (material + landmark) only.
--   extend_comment_period crosses for the large tiers (extensions on big
--                  consultations are procedurally sensitive).
--   sla_breached crosses for the large tiers (material + landmark).
--
-- Single regulator desk write {admin, regulator} — NERSA secretariat records the
-- whole lifecycle (same single-party model as W31/W40/W57/W66/W74).
-- actor_party (secretariat / panel / presiding_member / stakeholder) records the
-- functional owner per step, not the JWT role.

CREATE TABLE IF NOT EXISTS oe_consultation_notices (
  id                              TEXT PRIMARY KEY,
  notice_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (the upstream wave that triggered the consultation — typically W43
  -- tariff determination, W33 licence renewal or a generic NERSA rulemaking)
  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  -- Notice identity
  notice_title                    TEXT NOT NULL,
  era_section                     TEXT,                       -- e.g. 's.10', 'sch2'
  gazette_number                  TEXT,
  gazette_publication_at          TEXT,

  -- Classification
  consultation_kind               TEXT NOT NULL CHECK (consultation_kind IN (
    'rulemaking','methodology','licence_condition','code_amendment','policy','rates_decision'
  )),
  consultation_class              TEXT NOT NULL CHECK (consultation_class IN (
    'binding','guidance','consultative'
  )),
  consultation_tier               TEXT NOT NULL CHECK (consultation_tier IN (
    'minor','standard','material','landmark'
  )),
  affected_parties_estimate       INTEGER NOT NULL DEFAULT 0,   -- drives the tier
  is_binding_class                INTEGER NOT NULL DEFAULT 0,   -- mirrors consultation_class='binding'

  -- Comment period
  comment_period_start_at         TEXT,
  comment_period_end_at           TEXT,
  comment_period_minimum_days     INTEGER DEFAULT 30,           -- statutory floor
  extension_count                 INTEGER NOT NULL DEFAULT 0,
  comments_received_count         INTEGER NOT NULL DEFAULT 0,

  -- Stakeholder balance + coverage (input metrics — battery is derived live)
  industry_comments_count         INTEGER NOT NULL DEFAULT 0,
  consumer_comments_count         INTEGER NOT NULL DEFAULT 0,
  civil_society_comments_count    INTEGER NOT NULL DEFAULT 0,
  ipp_comments_count              INTEGER NOT NULL DEFAULT 0,
  government_comments_count       INTEGER NOT NULL DEFAULT 0,
  provinces_represented           INTEGER NOT NULL DEFAULT 0,
  sectors_represented             INTEGER NOT NULL DEFAULT 0,
  questions_total                 INTEGER NOT NULL DEFAULT 0,
  questions_answered              INTEGER NOT NULL DEFAULT 0,

  -- Hearing
  hearing_scheduled_at            TEXT,
  hearing_held_at                 TEXT,
  hearing_venue                   TEXT,
  presiding_member_name           TEXT,

  -- Response + adoption
  response_document_ref           TEXT,
  decision_reasons                TEXT,
  adopted_decision_ref            TEXT,

  -- Live battery snapshots (decorated live by route too, but persisted for audit)
  procedural_validity_flag        INTEGER NOT NULL DEFAULT 0,
  judicial_review_risk_score      INTEGER NOT NULL DEFAULT 0,
  predicted_consultation_days     INTEGER DEFAULT 0,

  -- Gates
  published_flag                  INTEGER NOT NULL DEFAULT 0,
  comment_period_opened_flag      INTEGER NOT NULL DEFAULT 0,
  comment_period_closed_flag      INTEGER NOT NULL DEFAULT 0,
  hearing_held_flag               INTEGER NOT NULL DEFAULT 0,
  response_drafted_flag           INTEGER NOT NULL DEFAULT 0,
  adopted_flag                    INTEGER NOT NULL DEFAULT 0,

  -- Refs
  draft_ref                       TEXT,
  publish_ref                     TEXT,
  open_ref                        TEXT,
  extension_ref                   TEXT,
  close_ref                       TEXT,
  reopen_ref                      TEXT,
  hearing_schedule_ref            TEXT,
  hearing_ref                     TEXT,
  analysis_ref                    TEXT,
  response_ref                    TEXT,
  adoption_ref                    TEXT,
  hold_ref                        TEXT,
  withdrawal_ref                  TEXT,
  cancellation_ref                TEXT,
  regulator_ref                   TEXT,

  -- Narrative
  draft_basis                     TEXT,
  publish_basis                   TEXT,
  open_basis                      TEXT,
  extension_basis                 TEXT,
  close_basis                     TEXT,
  hearing_basis                   TEXT,
  analysis_basis                  TEXT,
  response_basis                  TEXT,
  adoption_basis                  TEXT,
  hold_basis                      TEXT,
  withdrawal_basis                TEXT,
  cancellation_basis              TEXT,
  reason_code                     TEXT,
  consultation_summary            TEXT,

  -- State + lifecycle
  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'drafted','published','open_for_comment','comment_period_closed',
    'hearing_scheduled','hearing_held','analysis','response_drafted',
    'adopted','on_hold','withdrawn','cancelled'
  )),
  drafted_at                      TEXT NOT NULL,
  published_at                    TEXT,
  open_for_comment_at             TEXT,
  comment_period_closed_at        TEXT,
  hearing_scheduled_at_status     TEXT,
  hearing_held_at_status          TEXT,
  analysis_at                     TEXT,
  response_drafted_at             TEXT,
  adopted_at                      TEXT,
  on_hold_at                      TEXT,
  withdrawn_at                    TEXT,
  cancelled_at                    TEXT,

  is_reportable                   INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,

  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cnotice_status     ON oe_consultation_notices(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cnotice_tier       ON oe_consultation_notices(consultation_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cnotice_kind       ON oe_consultation_notices(consultation_kind);
CREATE INDEX IF NOT EXISTS idx_oe_cnotice_class      ON oe_consultation_notices(consultation_class);
CREATE INDEX IF NOT EXISTS idx_oe_cnotice_gazette    ON oe_consultation_notices(gazette_publication_at);
CREATE INDEX IF NOT EXISTS idx_oe_cnotice_drafted    ON oe_consultation_notices(drafted_at);
CREATE INDEX IF NOT EXISTS idx_oe_cnotice_sla        ON oe_consultation_notices(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_consultation_notices_events (
  id                 TEXT PRIMARY KEY,
  notice_id          TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cnotice_events_n    ON oe_consultation_notices_events(notice_id);
CREATE INDEX IF NOT EXISTS idx_oe_cnotice_events_type ON oe_consultation_notices_events(event_type);
