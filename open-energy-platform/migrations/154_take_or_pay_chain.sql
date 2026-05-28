-- Wave 32 — Offtaker Take-or-Pay Annual Reconciliation chain
-- 10-state P6 lifecycle for the calendar-year roll-up of monthly PPA
-- delivery shortfalls under IFRS 16 + DMRE PPA template + NERSA Section 34.

CREATE TABLE IF NOT EXISTS oe_top_cases (
  id                          TEXT PRIMARY KEY,
  case_number                 TEXT NOT NULL UNIQUE,
  ppa_contract_id             TEXT,
  ppa_chain_id                TEXT,
  source_event                TEXT,
  source_entity_type          TEXT,
  source_entity_id            TEXT,
  source_wave                 TEXT,
  ipp_party_id                TEXT NOT NULL,
  ipp_party_name              TEXT NOT NULL,
  offtaker_party_id           TEXT NOT NULL,
  offtaker_party_name         TEXT NOT NULL,
  reconciliation_year         INTEGER NOT NULL,
  contracted_mwh              REAL NOT NULL,
  delivered_mwh               REAL NOT NULL,
  credited_mwh                REAL NOT NULL DEFAULT 0,
  shortfall_mwh               REAL NOT NULL,
  shortfall_pct               REAL NOT NULL,
  severity_tier               TEXT NOT NULL CHECK (severity_tier IN ('catastrophic','major','moderate','minor')),
  top_rate_per_mwh            REAL NOT NULL,
  top_amount_proposed         REAL,
  top_amount_agreed           REAL,
  top_amount_settled          REAL,
  evidence_findings           TEXT,
  evidence_ref                TEXT,
  quantum_proposal_ref        TEXT,
  quantum_acceptance_ref      TEXT,
  settlement_ref              TEXT,
  dispute_panel_ref           TEXT,
  dispute_award_ref           TEXT,
  waiver_basis                TEXT,
  waiver_minute_ref           TEXT,
  reason_code                 TEXT,
  nersa_top_return_ref        TEXT,
  section34_filing_ref        TEXT,
  rod_notes                   TEXT,
  chain_status                TEXT NOT NULL DEFAULT 'accrual_open',
  accrual_opened_at           TEXT NOT NULL,
  year_end_at                 TEXT,
  statement_issued_at         TEXT,
  evidence_required_at        TEXT,
  evidence_submitted_at       TEXT,
  quantum_proposed_at         TEXT,
  quantum_agreed_at           TEXT,
  settled_at                  TEXT,
  disputed_at                 TEXT,
  waived_at                   TEXT,
  sla_deadline_at             TEXT,
  last_sla_breach_at          TEXT,
  escalation_level            INTEGER NOT NULL DEFAULT 0,
  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_top_cases_status      ON oe_top_cases(chain_status);
CREATE INDEX IF NOT EXISTS idx_top_cases_tier        ON oe_top_cases(severity_tier);
CREATE INDEX IF NOT EXISTS idx_top_cases_year        ON oe_top_cases(reconciliation_year);
CREATE INDEX IF NOT EXISTS idx_top_cases_ipp         ON oe_top_cases(ipp_party_id);
CREATE INDEX IF NOT EXISTS idx_top_cases_offtaker    ON oe_top_cases(offtaker_party_id);
CREATE INDEX IF NOT EXISTS idx_top_cases_ppa         ON oe_top_cases(ppa_contract_id);
CREATE INDEX IF NOT EXISTS idx_top_cases_sla         ON oe_top_cases(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_top_events (
  id              TEXT PRIMARY KEY,
  top_id          TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_top_events_top     ON oe_top_events(top_id);
CREATE INDEX IF NOT EXISTS idx_top_events_created ON oe_top_events(created_at);
