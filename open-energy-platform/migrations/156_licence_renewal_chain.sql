-- Wave 33 — Regulator Licence Renewal / Amendment chain
-- 11-state P6 lifecycle for NERSA-issued energy licence renewals under
-- Electricity Regulation Act 2006 sections 14-16 (generation / distribution /
-- trading + import-export). Renewals lodged 6-12 months pre-expiry per
-- s14(2)(b); processed via completeness → s10 public consultation →
-- technical+financial evaluation → Council vote → Record of Decision.

CREATE TABLE IF NOT EXISTS oe_licence_renewals (
  id                          TEXT PRIMARY KEY,
  case_number                 TEXT NOT NULL UNIQUE,
  licence_id                  TEXT NOT NULL,
  licence_number              TEXT,
  licence_type                TEXT NOT NULL CHECK (licence_type IN ('generation','distribution','trading')),
  licence_class               TEXT NOT NULL CHECK (licence_class IN ('generation_utility','generation_embedded','generation_sseg','distribution','trading')),
  capacity_mw                 REAL,
  source_event                TEXT,
  source_entity_type          TEXT,
  source_entity_id            TEXT,
  source_wave                 TEXT,
  applicant_party_id          TEXT NOT NULL,
  applicant_party_name        TEXT NOT NULL,
  facility_name               TEXT,
  facility_province           TEXT,
  current_expiry_date         TEXT NOT NULL,
  requested_expiry_date       TEXT,
  granted_expiry_date         TEXT,
  application_pack_ref        TEXT,
  completeness_findings       TEXT,
  completeness_ref            TEXT,
  consultation_notice_ref     TEXT,
  consultation_responses_count INTEGER DEFAULT 0,
  technical_findings          TEXT,
  technical_evaluation_ref    TEXT,
  financial_findings          TEXT,
  financial_evaluation_ref    TEXT,
  decision_rod_ref            TEXT,
  council_meeting_ref         TEXT,
  council_vote_outcome        TEXT,
  conditions_attached         TEXT,
  amendment_summary           TEXT,
  refusal_grounds             TEXT,
  withdrawal_basis            TEXT,
  withdrawal_minute_ref       TEXT,
  appeal_filed                INTEGER NOT NULL DEFAULT 0,
  appeal_filing_ref           TEXT,
  tribunal_case_ref           TEXT,
  reason_code                 TEXT,
  rod_notes                   TEXT,
  chain_status                TEXT NOT NULL DEFAULT 'renewal_initiated',
  initiated_at                TEXT NOT NULL,
  application_filed_at        TEXT,
  completeness_checked_at     TEXT,
  consultation_opened_at      TEXT,
  evaluation_started_at       TEXT,
  decision_drafted_at         TEXT,
  council_voted_at            TEXT,
  granted_at                  TEXT,
  amended_at                  TEXT,
  refused_at                  TEXT,
  withdrawn_at                TEXT,
  sla_deadline_at             TEXT,
  last_sla_breach_at          TEXT,
  escalation_level            INTEGER NOT NULL DEFAULT 0,
  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_licence_renewals_status     ON oe_licence_renewals(chain_status);
CREATE INDEX IF NOT EXISTS idx_licence_renewals_class      ON oe_licence_renewals(licence_class);
CREATE INDEX IF NOT EXISTS idx_licence_renewals_applicant  ON oe_licence_renewals(applicant_party_id);
CREATE INDEX IF NOT EXISTS idx_licence_renewals_licence    ON oe_licence_renewals(licence_id);
CREATE INDEX IF NOT EXISTS idx_licence_renewals_expiry     ON oe_licence_renewals(current_expiry_date);
CREATE INDEX IF NOT EXISTS idx_licence_renewals_sla        ON oe_licence_renewals(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_licence_renewal_events (
  id              TEXT PRIMARY KEY,
  renewal_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_licence_renewal_events_renewal ON oe_licence_renewal_events(renewal_id);
CREATE INDEX IF NOT EXISTS idx_licence_renewal_events_created ON oe_licence_renewal_events(created_at);
