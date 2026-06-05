-- W223: Lender Financial Close — Conditions Precedent (CP) Clearance
-- LMA project finance closing conditions; upstream gate for W21 drawdown
CREATE TABLE IF NOT EXISTS oe_cp_clearances (
  id                        TEXT PRIMARY KEY,
  participant_id            TEXT NOT NULL,   -- lender originating the CP register

  -- Classification
  cp_tier                   TEXT NOT NULL CHECK(cp_tier IN (
    'minor','standard','major','systemic'
  )),
  facility_ref              TEXT,            -- W53 credit facility application
  project_ref               TEXT,            -- underlying project / W1 IPP-PM ref
  borrower_name             TEXT,

  -- CP counts (tracked for KPI dashboard)
  cp_count_total            INTEGER,
  cp_count_satisfied        INTEGER DEFAULT 0,
  cp_count_waived           INTEGER DEFAULT 0,
  cp_count_failed           INTEGER DEFAULT 0,

  -- Timeline
  register_submitted_at     TEXT,
  register_agreed_at        TEXT,
  satisfaction_commenced_at TEXT,
  evidence_submitted_at     TEXT,
  review_commenced_at       TEXT,
  cps_cleared_at            TEXT,
  drawdown_authorized_at    TEXT,
  closing_deadline          TEXT,            -- long-stop date negotiated in term sheet

  -- Default / failure
  cp_failed_reason          TEXT,
  cp_failed_at              TEXT,

  chain_status              TEXT NOT NULL DEFAULT 'cp_register_draft' CHECK(chain_status IN (
    'cp_register_draft','cp_register_submitted','cp_register_agreed',
    'satisfying_cps','cps_submitted','under_lender_review',
    'cps_satisfied','cps_partially_waived',
    'drawdown_authorized','cp_defaulted','withdrawn','expired'
  )),
  sla_deadline              TEXT NOT NULL,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  regulator_notified        INTEGER NOT NULL DEFAULT 0,

  actor_id                  TEXT,
  reason                    TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cp_clearance_status
  ON oe_cp_clearances(chain_status);

CREATE INDEX IF NOT EXISTS idx_cp_clearance_participant
  ON oe_cp_clearances(participant_id);

CREATE INDEX IF NOT EXISTS idx_cp_clearance_facility
  ON oe_cp_clearances(facility_ref);
