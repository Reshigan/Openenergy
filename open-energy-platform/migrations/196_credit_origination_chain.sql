-- Wave 53 — Lender Credit Facility Origination & Credit Approval chain.
-- National Credit Act 34 of 2005 (responsible-lending / affordability) + Banks
-- Act 94 of 1990 + the Basel III credit-risk framework + the SARB large-exposure
-- framework + an LMA-style facility agreement.
--
-- The FRONT-END of the project-finance lifecycle: the credit-approval gate a
-- borrower passes BEFORE any money is committed. Sits UPSTREAM of every other
-- Lender chain (W21 drawdown, W30 disbursement, W38 covenant certificate, W6
-- dunning, W45 loan default) — a `facility_available` terminal here is the
-- precondition for a W21 drawdown.
--
-- 12-state P6 lifecycle:
--   application_received → screening → credit_assessment → committee_review
--     → approved → agreement_issued → cp_satisfied → facility_available
--   conditional-approval loop:  committee_review → conditions_pending → approved
--   referral loop:              committee_review → referred_back → credit_assessment
--   decline:  screening|credit_assessment|committee_review|referred_back|conditions_pending → declined
--   withdraw: any non-terminal pre-activation state → withdrawn
--
-- Facility-size tiers (drive the INVERTED SLA + large-exposure reportability):
--   small (<R50m) / medium (<R250m) / large (<R1bn) / major (<R5bn) / systemic (>=R5bn)
--
-- INVERTED SLA: the bigger the facility, the MORE time every window allows.
--
-- Reportability: activate crosses the SARB large-exposure inbox for major +
-- systemic tiers (the W53 signature — making the facility live puts a large
-- exposure on the book); decline crosses for systemic only; sla_breached crosses
-- for major + systemic.
--
-- Two-party split write: the applicant (borrower / ipp_developer) satisfies
-- conditions / CPs and may withdraw; the lender drives screening, assessment,
-- committee, issuance, activation and decline. actor_party (applicant / lender)
-- records the function per step.

CREATE TABLE IF NOT EXISTS oe_credit_facility_applications (
  id                            TEXT PRIMARY KEY,
  application_number            TEXT UNIQUE NOT NULL,

  -- Provenance (pipeline / origination source)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party write)
  applicant_party_id            TEXT NOT NULL,     -- the borrower / project company
  applicant_party_name          TEXT NOT NULL,
  lender_name                   TEXT,              -- lender of record
  sponsor_name                  TEXT,              -- project sponsor

  -- Facility identity
  facility_tier                 TEXT NOT NULL CHECK (facility_tier IN (
    'small','medium','large','major','systemic'
  )),
  facility_name                 TEXT NOT NULL,
  facility_type                 TEXT,              -- term_loan / revolving / bridge / mezzanine / construction / refinance
  facility_purpose              TEXT,
  facility_limit_zar_m          REAL,              -- facility limit in millions ZAR (drives the tier)
  tenor_months                  INTEGER,
  margin_bps                    REAL,
  pricing_basis                 TEXT,              -- jibar_plus / fixed / prime_linked
  project_id                    TEXT,
  project_name                  TEXT,
  sector                        TEXT,              -- solar_pv / wind / bess / chp / grid / hydro

  -- Credit metrics
  credit_rating                 TEXT,              -- internal grade
  ltv_pct                       REAL,
  dscr_base                     REAL,
  gearing_pct                   REAL,
  pd_pct                        REAL,              -- probability of default
  lgd_pct                       REAL,              -- loss given default
  ead_zar_m                     REAL,              -- exposure at default
  approved_amount_zar_m         REAL,
  conditions_count              INTEGER,
  cp_count                      INTEGER,

  -- Refs (per stage)
  screening_ref                 TEXT,
  assessment_ref                TEXT,
  committee_ref                 TEXT,
  approval_ref                  TEXT,
  agreement_ref                 TEXT,
  cp_ref                        TEXT,
  activation_ref                TEXT,
  decline_ref                   TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  screening_basis               TEXT,
  assessment_basis              TEXT,
  committee_basis               TEXT,
  approval_basis                TEXT,
  conditions_basis              TEXT,
  cp_basis                      TEXT,
  activation_basis              TEXT,
  decline_basis                 TEXT,
  reason_code                   TEXT,
  decision_notes                TEXT,
  notes                         TEXT,

  referral_round                INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'application_received','screening','credit_assessment','committee_review',
    'referred_back','conditions_pending','approved','agreement_issued',
    'cp_satisfied','facility_available','declined','withdrawn'
  )),
  application_received_at       TEXT NOT NULL,
  screening_at                  TEXT,
  credit_assessment_at          TEXT,
  committee_review_at           TEXT,
  referred_back_at              TEXT,
  conditions_pending_at         TEXT,
  approved_at                   TEXT,
  agreement_issued_at           TEXT,
  cp_satisfied_at               TEXT,
  facility_available_at         TEXT,
  declined_at                   TEXT,
  withdrawn_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cfa_status    ON oe_credit_facility_applications(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cfa_tier      ON oe_credit_facility_applications(facility_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cfa_applicant ON oe_credit_facility_applications(applicant_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_cfa_received  ON oe_credit_facility_applications(application_received_at);
CREATE INDEX IF NOT EXISTS idx_oe_cfa_sla       ON oe_credit_facility_applications(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_credit_facility_applications_events (
  id                 TEXT PRIMARY KEY,
  application_id     TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cfa_events_app  ON oe_credit_facility_applications_events(application_id);
CREATE INDEX IF NOT EXISTS idx_oe_cfa_events_type ON oe_credit_facility_applications_events(event_type);
