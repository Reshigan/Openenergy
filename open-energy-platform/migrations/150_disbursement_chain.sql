-- Wave 30 — Lender Disbursement UoP Reconciliation chain — SARB + Equator Principles
-- 10-state P6 lifecycle layered on every funded drawdown tranche from W21.

CREATE TABLE IF NOT EXISTS oe_disbursement_cases (
  id                          TEXT PRIMARY KEY,
  case_number                 TEXT NOT NULL UNIQUE,
  lender_party                TEXT NOT NULL,
  borrower_party              TEXT NOT NULL,
  project_id                  TEXT,
  project_name                TEXT,
  drawdown_ref                TEXT,
  facility_ref                TEXT NOT NULL,
  tranche_tier                TEXT NOT NULL CHECK (tranche_tier IN ('senior_a','senior_b','mezzanine','bridge')),
  tranche_amount_zar          REAL NOT NULL,
  released_zar                REAL,
  invoices_amount_zar         REAL,
  reconciled_amount_zar       REAL,
  clawback_amount_zar         REAL,
  invoice_count               INTEGER,
  uop_category                TEXT,
  ie_firm                     TEXT,
  ie_certificate_ref          TEXT,
  sarb_exchange_control_ref   TEXT,
  equator_principles_ref      TEXT,
  reason_code                 TEXT,
  rod_notes                   TEXT,
  regulator_authority         TEXT,
  regulator_ref               TEXT,
  chain_status                TEXT NOT NULL DEFAULT 'tranche_released',
  tranche_released_at         TEXT NOT NULL,
  invoices_pending_at         TEXT,
  invoices_submitted_at       TEXT,
  bank_validating_at          TEXT,
  ie_certifying_at            TEXT,
  uop_certified_at            TEXT,
  reconciled_at               TEXT,
  clawback_executed_at        TEXT,
  waived_at                   TEXT,
  sla_deadline_at             TEXT,
  last_sla_breach_at          TEXT,
  escalation_level            INTEGER NOT NULL DEFAULT 0,
  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disbursement_cases_status   ON oe_disbursement_cases(chain_status);
CREATE INDEX IF NOT EXISTS idx_disbursement_cases_tier     ON oe_disbursement_cases(tranche_tier);
CREATE INDEX IF NOT EXISTS idx_disbursement_cases_lender   ON oe_disbursement_cases(lender_party);
CREATE INDEX IF NOT EXISTS idx_disbursement_cases_borrower ON oe_disbursement_cases(borrower_party);
CREATE INDEX IF NOT EXISTS idx_disbursement_cases_project  ON oe_disbursement_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_disbursement_cases_sla      ON oe_disbursement_cases(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_disbursement_events (
  id              TEXT PRIMARY KEY,
  disbursement_id TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disbursement_events_disbursement ON oe_disbursement_events(disbursement_id);
CREATE INDEX IF NOT EXISTS idx_disbursement_events_created      ON oe_disbursement_events(created_at);
