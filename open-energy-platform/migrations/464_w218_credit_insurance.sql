-- W218: IPP Offtake Credit Insurance Lifecycle
-- ECIC / ATIDI / Lloyd's / World Bank MIGA political risk + credit insurance
CREATE TABLE IF NOT EXISTS oe_credit_insurance (
  id                        TEXT PRIMARY KEY,
  participant_id            TEXT NOT NULL,   -- IPP / project developer

  -- Policy classification
  insurance_tier            TEXT NOT NULL CHECK(insurance_tier IN (
    'short_term','medium_term','long_term','project_finance'
  )),
  insurance_type            TEXT CHECK(insurance_type IN (
    'political_risk','credit_risk','comprehensive','miga_guarantee',
    'ecic_cover','atidi_cover','lloyds_syndicate',NULL
  )),
  insurer_name              TEXT,
  policy_ref                TEXT,

  -- Underlying exposure
  project_ref               TEXT,           -- link to W20 project
  ppa_ref                   TEXT,           -- link to W22 PPA contract
  facility_ref              TEXT,           -- link to W53 credit facility

  -- Financial terms
  cover_amount_zar          REAL,
  premium_rate_pct          REAL,
  annual_premium_zar        REAL,
  policy_inception          TEXT,
  policy_expiry             TEXT,
  cover_period_years        REAL,

  -- Underwriting
  underwriting_started_at   TEXT,
  terms_issued_at           TEXT,
  terms_ref                 TEXT,
  negotiation_started_at    TEXT,
  bound_at                  TEXT,

  -- Renewal
  renewal_due_date          TEXT,
  renewed_at                TEXT,

  -- Claim
  claim_event               TEXT,           -- triggering event description
  claim_amount_zar          REAL,
  claim_lodged_at           TEXT,
  claim_assessed_at         TEXT,
  claim_paid_at             TEXT,
  claim_paid_amount_zar     REAL,
  claim_decline_reason      TEXT,

  chain_status              TEXT NOT NULL DEFAULT 'application' CHECK(chain_status IN (
    'application','underwriting','terms_issued','negotiation','bound','active',
    'renewal_due','claim_lodged','claim_assessed','claim_paid','lapsed','cancelled','declined'
  )),
  sla_deadline              TEXT NOT NULL,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  regulator_notified        INTEGER NOT NULL DEFAULT 0,

  actor_id                  TEXT,
  reason                    TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ci_status
  ON oe_credit_insurance(chain_status);

CREATE INDEX IF NOT EXISTS idx_ci_participant
  ON oe_credit_insurance(participant_id);

CREATE INDEX IF NOT EXISTS idx_ci_project
  ON oe_credit_insurance(project_ref);
