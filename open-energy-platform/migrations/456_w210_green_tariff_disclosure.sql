-- W210: Offtaker Green Tariff / PPA Labelling & Disclosure
-- GHG Protocol Scope 2 + I-REC Standard + CDP/SBTi + NERSA Green Energy Tariff
CREATE TABLE IF NOT EXISTS oe_green_tariff_disclosures (
  id                       TEXT PRIMARY KEY,
  participant_id           TEXT NOT NULL,   -- offtaker

  -- PPA / tariff reference
  ppa_ref                  TEXT,            -- link to W22 PPA contract
  tariff_contract_number   TEXT,
  green_tariff_class       TEXT NOT NULL CHECK(green_tariff_class IN (
    'voluntary','corporate_ppa','utility_green_tariff','sbti_aligned'
  )),

  -- Consumption period
  disclosure_period        TEXT NOT NULL,   -- e.g. "2025-Q4" or "2025"
  consumption_mwh          REAL,
  contracted_green_mwh     REAL,
  matched_rec_mwh          REAL,
  match_percentage         REAL,            -- matched_rec_mwh / consumption_mwh * 100

  -- Attribute matching details
  rec_serial_from          TEXT,
  rec_serial_to            TEXT,
  irec_registry            TEXT,            -- I-REC, SAREC, GO, etc.
  generation_technology    TEXT,            -- solar, wind, hydro, etc.
  generation_country       TEXT DEFAULT 'ZA',
  additionality_claim      INTEGER DEFAULT 0,  -- 0/1 — new capacity

  -- Independent review
  reviewer_name            TEXT,
  reviewer_ref             TEXT,
  review_approved_at       TEXT,
  review_report_url        TEXT,

  -- Label
  label_issued_at          TEXT,
  label_certificate_number TEXT,
  label_valid_until        TEXT,

  -- CDP/SBTi submission
  cdp_submission_ref       TEXT,
  sbti_target_ref          TEXT,
  cdp_submitted_at         TEXT,
  disclosure_date          TEXT,

  -- Rejection
  rejection_reason         TEXT,

  chain_status             TEXT NOT NULL DEFAULT 'application_received' CHECK(chain_status IN (
    'application_received','eligibility_check','attribute_matching',
    'independent_review','review_approved','label_issued',
    'cdp_submitted','disclosed','rejected','withdrawn'
  )),
  sla_deadline             TEXT NOT NULL,
  sla_breached             INTEGER NOT NULL DEFAULT 0,
  regulator_notified       INTEGER NOT NULL DEFAULT 0,

  actor_id                 TEXT,
  reason                   TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gt_status
  ON oe_green_tariff_disclosures(chain_status);

CREATE INDEX IF NOT EXISTS idx_gt_participant
  ON oe_green_tariff_disclosures(participant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gt_period
  ON oe_green_tariff_disclosures(participant_id, disclosure_period, green_tariff_class)
  WHERE ppa_ref IS NULL;
