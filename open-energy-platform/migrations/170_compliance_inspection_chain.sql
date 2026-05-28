-- Wave 40 — Regulator Compliance Inspection & Enforcement chain.
-- NERSA's PROACTIVE, own-initiative enforcement arm. NERSA schedules a
-- compliance inspection of a licensee (routine, complaint-driven, incident-
-- driven, or thematic), conducts it, drafts and issues findings, may issue a
-- compliance directive requiring remediation, verifies the remediation, and
-- closes the matter — or escalates to a financial penalty / sanction with a
-- statutory appeal route to the NERSA Tribunal.
--
-- This is the ACTIVE ENFORCEMENT complement to the regulator's two existing
-- chains: the reactive intake/triage of W31 disposition (incoming complaints +
-- cross-wave escalations) and the periodic W33 licence-renewal (licence
-- lifecycle). Disposition routes what comes IN; this chain is what the
-- regulator initiates OUT.
--
-- Frameworks: NERSA ERA 2006 §10 (monitoring + compliance) + §34/§35
-- (enforcement powers, penalties, sanctions) + NERSA Tribunal appeal route.
--
-- 12-state P6 lifecycle (8 forward-to-compliant + enforcement/appeal branches
-- + 3 terminals):
--   inspection_scheduled → inspection_in_progress → findings_drafted
--     → findings_issued → directive_issued → remediation_underway
--     → remediation_verified → compliant_closed
--   clean short-circuit: in_progress|findings_drafted → compliant_closed
--   enforcement branch: findings_issued|directive_issued|remediation_underway
--     → penalty_imposed → enforcement_closed
--   appeal branch: penalty_imposed|directive_issued → appealed → enforcement_closed
--   early withdraw: scheduled|in_progress|findings_drafted → withdrawn
--
-- Tiers (contravention severity — drive SLA windows + reportability):
--   critical — safety / security-of-supply contravention; fastest regulator action
--   serious  — material licence-condition breach; mid
--   minor    — administrative / reporting contravention; lightest
--
-- URGENT SLA: the more severe the contravention, the TIGHTER every window.
--
-- Officer/respondent split: the regulator officer drives the inspection +
-- enforcement machinery; the respondent licensee begins remediation and lodges
-- any appeal. actor_party derived from the ACTION, not the JWT role.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (e.g. a W31 disposition escalation or a W25 HSE incident can
-- spawn an own-initiative compliance inspection).

CREATE TABLE IF NOT EXISTS oe_compliance_inspections (
  id                       TEXT PRIMARY KEY,
  inspection_number        TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,

  -- Regulator (NERSA officer / inspectorate)
  officer_party_id         TEXT NOT NULL,
  officer_party_name       TEXT NOT NULL,

  -- Respondent (licensee under inspection)
  respondent_party_id      TEXT NOT NULL,
  respondent_party_name    TEXT NOT NULL,

  -- Inspection descriptors
  licence_ref              TEXT,
  facility_name            TEXT NOT NULL,
  inspection_trigger       TEXT,             -- routine / complaint / incident / thematic
  contravention_tier       TEXT NOT NULL CHECK (contravention_tier IN (
    'critical', 'serious', 'minor'
  )),
  licence_condition_ref    TEXT,             -- breached condition (e.g. ERA s10(g))

  -- Enforcement arithmetic
  penalty_amount_zar       REAL,             -- imposed financial penalty / sanction
  daily_penalty_zar        REAL,             -- per-day continuing-contravention penalty
  remediation_cost_zar     REAL,             -- respondent's estimated remediation cost

  -- Refs
  findings_ref             TEXT,
  directive_ref            TEXT,
  penalty_ref              TEXT,
  appeal_ref               TEXT,
  tribunal_ref             TEXT,

  -- Narrative
  inspection_basis         TEXT,
  findings_basis           TEXT,
  directive_basis          TEXT,
  remediation_basis        TEXT,
  penalty_basis            TEXT,
  appeal_basis             TEXT,
  reason_code              TEXT,
  rod_notes                TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'inspection_scheduled','inspection_in_progress','findings_drafted',
    'findings_issued','directive_issued','remediation_underway',
    'remediation_verified','penalty_imposed','appealed',
    'compliant_closed','enforcement_closed','withdrawn'
  )),
  inspection_scheduled_at   TEXT NOT NULL,
  inspection_in_progress_at TEXT,
  findings_drafted_at       TEXT,
  findings_issued_at        TEXT,
  directive_issued_at       TEXT,
  remediation_underway_at   TEXT,
  remediation_verified_at   TEXT,
  penalty_imposed_at        TEXT,
  appealed_at               TEXT,
  compliant_closed_at       TEXT,
  enforcement_closed_at     TEXT,
  withdrawn_at              TEXT,

  is_reportable            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cinsp_status     ON oe_compliance_inspections(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cinsp_tier       ON oe_compliance_inspections(contravention_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cinsp_officer    ON oe_compliance_inspections(officer_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_cinsp_respondent ON oe_compliance_inspections(respondent_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_cinsp_scheduled  ON oe_compliance_inspections(inspection_scheduled_at);
CREATE INDEX IF NOT EXISTS idx_oe_cinsp_sla        ON oe_compliance_inspections(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_compliance_inspections_events (
  id              TEXT PRIMARY KEY,
  inspection_id   TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cinsp_events_insp ON oe_compliance_inspections_events(inspection_id);
CREATE INDEX IF NOT EXISTS idx_oe_cinsp_events_type ON oe_compliance_inspections_events(event_type);
