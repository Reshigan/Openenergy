-- Wave 66 — Regulator Complaints & Dispute Resolution chain (P6).
-- NERSA acting as the quasi-judicial dispute forum under the Electricity
-- Regulation Act 4 of 2006 section 30 (Disputes), the National Energy Regulator
-- Act 40 of 2004, and NERSAs Complaints and Compliance Procedures. An external
-- party (end-customer, licensee, IPP, offtaker) lodges a complaint/dispute against
-- a licensee. NERSA registers it, screens admissibility, FIRST refers it to the
-- respondent licensee for first-level resolution, and on failure escalates to a
-- formal investigation, attempts mediation, convenes an adjudication hearing,
-- issues a binding ruling, monitors the remedy and closes it resolved. A matter
-- may instead be dismissed (no jurisdiction / no merit), appealed (judicial
-- review), or withdrawn by the complainant.
--
-- This is DISTINCT from the regulators other chains by INTAKE SOURCE:
--   - W31 disposition triages matters CROSS-REFERRED into the NERSA inbox from
--     every other wave (internal compliance intake).
--   - W40 compliance-inspection is a PROACTIVE inspection NERSA itself initiates.
--   - W66 is REACTIVE: an EXTERNAL party brings a grievance and NERSA adjudicates.
--
-- 12-state P6 lifecycle (forward path + first-level resolution + dismiss + appeal + withdraw):
--   complaint_lodged → admissibility_review → referred_to_licensee
--     → under_investigation → mediation → adjudication_hearing
--     → ruling_issued → remedy_monitoring → resolved          (full adjudication)
--   first-level: referred_to_licensee → resolved              (settle_at_licensee)
--   short-circuit: under_investigation → adjudication_hearing  (convene_hearing)
--   dismiss:  admissibility_review | under_investigation | adjudication_hearing → dismissed
--   appeal:   ruling_issued | remedy_monitoring → appealed
--   withdraw: complaint_lodged | admissibility_review | referred_to_licensee
--               | under_investigation | mediation → withdrawn
--
-- Tiers (by affected parties / customers): minor <10 / moderate <100 /
-- significant <1000 / major <10000 / systemic >=10000.
--
-- URGENT SLA — the LARGER the affected population, the TIGHTER every window
-- (same flavour as W40 compliance-inspection / W34 load-curtailment; OPPOSITE of
-- the INVERTED licensing / renewal / SSEG SLAs).
--
-- Single-party regulator-owned write {admin, regulator}; actor_party records the
-- functional party (complainant / respondent / adjudicator) for audit only.
--
-- Reportability (NERSA Council oversight queue):
--   lodge_appeal crosses for EVERY tier (judicial review is always material — the
--     W66 signature). issue_ruling crosses for major + systemic. dismiss crosses
--     for systemic only. SLA breaches cross for major + systemic.

CREATE TABLE IF NOT EXISTS oe_regulator_complaints (
  id                       TEXT PRIMARY KEY,
  complaint_number         TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,

  -- Parties
  complainant_id           TEXT NOT NULL,
  complainant_name         TEXT NOT NULL,
  complainant_type         TEXT NOT NULL CHECK (complainant_type IN (
    'customer','licensee','ipp','offtaker','municipality','other'
  )),
  respondent_id            TEXT NOT NULL,
  respondent_name          TEXT NOT NULL,
  respondent_licence_no    TEXT,

  -- Classification
  complaint_category       TEXT NOT NULL CHECK (complaint_category IN (
    'billing','supply_quality','connection','tariff','metering','service','market_conduct','other'
  )),
  complaint_tier           TEXT NOT NULL CHECK (complaint_tier IN (
    'minor','moderate','significant','major','systemic'
  )),
  affected_customers       INTEGER,           -- drives the tier
  jurisdiction_basis       TEXT,              -- statutory basis for NERSA jurisdiction

  -- Refs
  complaint_ref            TEXT,
  referral_ref             TEXT,
  investigation_ref        TEXT,
  mediation_ref            TEXT,
  hearing_ref              TEXT,
  ruling_ref               TEXT,
  appeal_ref               TEXT,

  -- Narrative
  lodgement_basis          TEXT,
  admissibility_basis      TEXT,
  referral_basis           TEXT,
  settlement_basis         TEXT,
  investigation_basis      TEXT,
  mediation_basis          TEXT,
  hearing_basis            TEXT,
  ruling_basis             TEXT,
  remedy_basis             TEXT,
  dismissal_basis          TEXT,
  appeal_basis             TEXT,
  reason_code              TEXT,
  complaint_summary        TEXT,
  remedy_directed          TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'complaint_lodged','admissibility_review','referred_to_licensee','under_investigation',
    'mediation','adjudication_hearing','ruling_issued','remedy_monitoring',
    'resolved','dismissed','appealed','withdrawn'
  )),
  lodged_at                TEXT NOT NULL,
  admissibility_review_at  TEXT,
  referred_to_licensee_at  TEXT,
  under_investigation_at   TEXT,
  mediation_at             TEXT,
  adjudication_hearing_at  TEXT,
  ruling_issued_at         TEXT,
  remedy_monitoring_at     TEXT,
  resolved_at              TEXT,
  dismissed_at             TEXT,
  appealed_at              TEXT,
  withdrawn_at             TEXT,

  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_complaint_status     ON oe_regulator_complaints(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_complaint_tier       ON oe_regulator_complaints(complaint_tier);
CREATE INDEX IF NOT EXISTS idx_oe_complaint_respondent ON oe_regulator_complaints(respondent_id);
CREATE INDEX IF NOT EXISTS idx_oe_complaint_category   ON oe_regulator_complaints(complaint_category);
CREATE INDEX IF NOT EXISTS idx_oe_complaint_sla        ON oe_regulator_complaints(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_regulator_complaints_events (
  id              TEXT PRIMARY KEY,
  complaint_id    TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_complaint_events_complaint ON oe_regulator_complaints_events(complaint_id);
CREATE INDEX IF NOT EXISTS idx_oe_complaint_events_type      ON oe_regulator_complaints_events(event_type);
