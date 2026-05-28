-- Wave 45 — Lender Loan Default & Enforcement / Step-in chain.
-- The ENFORCEMENT backbone of project finance: when a borrower defaults — a
-- payment miss, a covenant breach crystallising into an event of default, an
-- insolvency trigger — the lender works the position through reservation of
-- rights, a formal default notice, a cure window, acceleration, standstill
-- (forbearance), and ultimately security enforcement / step-in, restructure, or
-- write-off.
--
-- Sits DOWNSTREAM of the monitoring chains: W38 covenant certificates (an
-- accelerated certificate feeds a default flag), the W6 dunning cycles (a
-- cycle-3 expiry feeds a default flag), and the one-off W21 drawdown / W30
-- disbursement-UoP chains (a UoP diversion is an event of default). Where W38
-- ENDS at acceleration, W45 PICKS UP at the default and runs to enforcement.
--
-- Frameworks: LMA (Loan Market Association) facility-agreement event-of-default
-- framework + SARB large-exposure / impairment reporting + the SA Insolvency
-- Act / Companies Act business-rescue (step-in) regime.
--
-- 12-state P6 lifecycle (forward-to-cure path + enforcement branch + 4 terminals):
--   default_flagged → under_review → reservation_of_rights
--     → default_notice_issued → cure_period → cured
--   enforcement: accelerated → standstill → enforcement_commenced
--                → restructured / enforced_closed / written_off
--   dismiss (false alarm): default_flagged|under_review → cured
--
-- Tiers (facility seniority — drive SLA + reportability):
--   senior_secured — strongest lender protection; worked fastest (tightest SLA)
--   mezzanine      — mid
--   subordinated   — junior; loosest monitoring
--
-- URGENT SLA: senior secured gets the TIGHTEST windows across every state.
--
-- Borrower-write split: the borrower effects the cure (confirm_cure); the lender
-- drives the workout; the security agent (trustee) commences + closes
-- enforcement. actor_party derived from the ACTION, not the JWT role.
--
-- Reportability: write_off (loss crystallised → SARB impairment) crosses for
-- EVERY tier (universal hard line); accelerate (EoD) + commence_enforcement
-- (security enforcement / step-in) + SLA breaches cross for senior + mezz only.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (e.g. a W38 accelerated certificate or W30 disbursement diversion
-- can spawn / feed a default).

CREATE TABLE IF NOT EXISTS oe_loan_defaults (
  id                      TEXT PRIMARY KEY,
  default_number          TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event            TEXT,
  source_entity_type      TEXT,
  source_entity_id        TEXT,
  source_wave             TEXT,

  -- Borrower (project company / SPV)
  borrower_party_id       TEXT NOT NULL,
  borrower_party_name     TEXT NOT NULL,

  -- Lender of record + security agent (trustee)
  lender_name             TEXT,
  security_agent_name     TEXT,

  -- Facility descriptors
  facility_name           TEXT NOT NULL,
  facility_tier           TEXT NOT NULL CHECK (facility_tier IN (
    'senior_secured', 'mezzanine', 'subordinated'
  )),
  facility_limit          REAL,            -- committed facility size (ZAR)
  outstanding_principal   REAL,            -- drawn + outstanding at default (ZAR)
  accelerated_amount      REAL,            -- amount called on acceleration (ZAR)
  recovery_amount         REAL,            -- realised / recovered (ZAR)
  write_off_amount        REAL,            -- crystallised loss (ZAR)

  -- Default descriptors
  default_type            TEXT,            -- payment / covenant / insolvency / cross_default / moratorium
  default_event           TEXT,            -- short label of the triggering event
  days_past_due           INTEGER,         -- for payment defaults

  -- Refs
  flag_ref                TEXT,
  notice_ref              TEXT,
  cure_ref                TEXT,
  acceleration_ref        TEXT,
  standstill_ref          TEXT,
  enforcement_ref         TEXT,
  restructure_ref         TEXT,

  -- Narrative
  flag_basis              TEXT,
  review_basis            TEXT,
  notice_basis            TEXT,
  cure_basis              TEXT,
  acceleration_basis      TEXT,
  standstill_basis        TEXT,
  enforcement_basis       TEXT,
  restructure_basis       TEXT,
  reason_code             TEXT,
  rod_notes               TEXT,

  -- State + lifecycle
  chain_status            TEXT NOT NULL CHECK (chain_status IN (
    'default_flagged','under_review','reservation_of_rights','default_notice_issued',
    'cure_period','accelerated','standstill','enforcement_commenced',
    'cured','restructured','enforced_closed','written_off'
  )),
  default_flagged_at        TEXT NOT NULL,
  under_review_at           TEXT,
  reservation_of_rights_at  TEXT,
  default_notice_issued_at  TEXT,
  cure_period_at            TEXT,
  accelerated_at            TEXT,
  standstill_at             TEXT,
  enforcement_commenced_at  TEXT,
  cured_at                  TEXT,
  restructured_at           TEXT,
  enforced_closed_at        TEXT,
  written_off_at            TEXT,

  cure_deadline_at         TEXT,           -- contractual cure expiry
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ldef_status    ON oe_loan_defaults(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ldef_tier      ON oe_loan_defaults(facility_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ldef_borrower  ON oe_loan_defaults(borrower_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_ldef_type      ON oe_loan_defaults(default_type);
CREATE INDEX IF NOT EXISTS idx_oe_ldef_flagged   ON oe_loan_defaults(default_flagged_at);
CREATE INDEX IF NOT EXISTS idx_oe_ldef_sla       ON oe_loan_defaults(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_loan_defaults_events (
  id              TEXT PRIMARY KEY,
  default_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ldef_events_def  ON oe_loan_defaults_events(default_id);
CREATE INDEX IF NOT EXISTS idx_oe_ldef_events_type ON oe_loan_defaults_events(event_type);
