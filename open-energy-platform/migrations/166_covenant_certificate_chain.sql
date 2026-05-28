-- Wave 38 — Lender Covenant Compliance Certificate chain.
-- The ONGOING monitoring backbone of project finance: after financial close,
-- every facility imposes a periodic (quarterly / semi-annual) information
-- covenant requiring the borrower to deliver a signed Compliance Certificate
-- evidencing the financial covenants (DSCR, LLCR, gearing) for the test period.
-- The facility agent reviews and either confirms compliance or declares a
-- breach; a breach routes through the waiver / cure / acceleration branches.
--
-- Sits downstream of the one-off W21 drawdown and W30 disbursement-UoP chains;
-- wraps the static covenant evaluator in src/utils/covenants.ts in a formal
-- certification lifecycle.
--
-- Frameworks: LMA (Loan Market Association) project-finance compliance-
-- certificate framework + Equator Principles covenant monitoring + SARB
-- large-exposure reporting.
--
-- 11-state P6 lifecycle (4 forward-to-compliant + breach branch + 4 terminals):
--   certificate_due → certificate_submitted → under_review → ratios_verified
--     → compliant
--   breach branch: breach_identified → waiver_requested → waiver_granted
--                                    → cure_period → cured
--                                    → accelerated (event of default)
--
-- Tiers (facility seniority — drive SLA + reportability):
--   senior_secured — strongest lender protection; closest monitoring (tightest SLA)
--   mezzanine      — mid
--   subordinated   — junior; loosest monitoring
--
-- URGENT SLA: senior secured gets the TIGHTEST windows across every state.
--
-- Borrower-write split: borrower submits certificates + requests waivers;
-- facility agent reviews / verifies / requires cure; lenders grant waivers +
-- accelerate. actor_party derived from the ACTION, not the JWT role.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (e.g. a W21 drawdown facility or W30 disbursement diversion can
-- spawn / feed a covenant breach).

CREATE TABLE IF NOT EXISTS oe_covenant_certificates (
  id                      TEXT PRIMARY KEY,
  certificate_number      TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event            TEXT,
  source_entity_type      TEXT,
  source_entity_id        TEXT,
  source_wave             TEXT,

  -- Borrower (project company / SPV)
  borrower_party_id       TEXT NOT NULL,
  borrower_party_name     TEXT NOT NULL,

  -- Facility agent + lender of record
  facility_agent_name     TEXT,
  lender_name             TEXT,

  -- Facility descriptors
  facility_name           TEXT NOT NULL,
  facility_tier           TEXT NOT NULL CHECK (facility_tier IN (
    'senior_secured', 'mezzanine', 'subordinated'
  )),
  facility_limit          REAL,            -- committed facility size (ZAR)
  outstanding_principal   REAL,            -- drawn + outstanding (ZAR)
  test_period             TEXT,            -- e.g. 2026-Q1 / 2025-H2
  test_period_end         TEXT,            -- period-end date (ISO)

  -- Measured covenant ratios + thresholds (snapshot for this certificate)
  dscr_actual             REAL,
  dscr_threshold          REAL,
  llcr_actual             REAL,
  llcr_threshold          REAL,
  gearing_actual          REAL,            -- debt / (debt+equity), as a ratio
  gearing_threshold       REAL,
  breached_covenants      TEXT,            -- comma list e.g. 'DSCR,GEARING'

  -- Refs
  certificate_ref         TEXT,
  review_ref              TEXT,
  breach_ref              TEXT,
  waiver_ref              TEXT,
  cure_ref                TEXT,
  acceleration_ref        TEXT,

  -- Narrative
  submission_basis        TEXT,
  review_basis            TEXT,
  breach_basis            TEXT,
  waiver_basis            TEXT,
  cure_basis              TEXT,
  acceleration_basis      TEXT,
  reason_code             TEXT,
  rod_notes               TEXT,

  -- State + lifecycle
  chain_status            TEXT NOT NULL CHECK (chain_status IN (
    'certificate_due','certificate_submitted','under_review','ratios_verified',
    'compliant','breach_identified','waiver_requested','waiver_granted',
    'cure_period','cured','accelerated'
  )),
  certificate_due_at        TEXT NOT NULL,
  certificate_submitted_at  TEXT,
  under_review_at           TEXT,
  ratios_verified_at        TEXT,
  compliant_at              TEXT,
  breach_identified_at      TEXT,
  waiver_requested_at       TEXT,
  waiver_granted_at         TEXT,
  cure_period_at            TEXT,
  cured_at                  TEXT,
  accelerated_at            TEXT,

  waiver_round             INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_covcert_status    ON oe_covenant_certificates(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_covcert_tier      ON oe_covenant_certificates(facility_tier);
CREATE INDEX IF NOT EXISTS idx_oe_covcert_borrower  ON oe_covenant_certificates(borrower_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_covcert_period    ON oe_covenant_certificates(test_period);
CREATE INDEX IF NOT EXISTS idx_oe_covcert_due       ON oe_covenant_certificates(certificate_due_at);
CREATE INDEX IF NOT EXISTS idx_oe_covcert_sla       ON oe_covenant_certificates(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_covenant_certificate_events (
  id              TEXT PRIMARY KEY,
  certificate_id  TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_covcert_events_cert ON oe_covenant_certificate_events(certificate_id);
CREATE INDEX IF NOT EXISTS idx_oe_covcert_events_type ON oe_covenant_certificate_events(event_type);
