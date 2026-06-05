-- Wave 198: Participant KYC / FICA Entity Verification
-- FICA Act 38/2001 · FIC Guidance Notes · POPIA · National Treasury AML-CFT
-- Tracks the full lifecycle of identity & entity verification for every
-- platform participant — onboarding gate before trading or covenant access.

CREATE TABLE IF NOT EXISTS oe_kyc_verifications (
  id                   TEXT PRIMARY KEY,
  chain_status         TEXT NOT NULL DEFAULT 'pending_submission',
  sla_deadline         TEXT,
  sla_breached         INTEGER NOT NULL DEFAULT 0,
  regulator_notified   INTEGER NOT NULL DEFAULT 0,
  actor_id             TEXT,
  reason               TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),

  -- Subject
  participant_id       TEXT NOT NULL,
  entity_type          TEXT NOT NULL DEFAULT 'company'
                         CHECK (entity_type IN ('individual','company','trust','fund','foreign_entity')),
  risk_level           TEXT NOT NULL DEFAULT 'standard'
                         CHECK (risk_level IN ('standard','medium','high_risk','pep')),

  -- Document refs (R2 vault keys)
  id_document_ref      TEXT,
  proof_of_address_ref TEXT,
  company_docs_ref     TEXT,
  beneficial_owner_ref TEXT,
  edd_report_ref       TEXT,

  -- Screening outcomes
  pep_match            INTEGER NOT NULL DEFAULT 0,
  sanctions_match      INTEGER NOT NULL DEFAULT 0,
  adverse_media_match  INTEGER NOT NULL DEFAULT 0,

  -- Conditions (conditionally_approved)
  conditions_text      TEXT,
  conditions_met_at    TEXT,
  verified_at          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_participant ON oe_kyc_verifications(participant_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status            ON oe_kyc_verifications(chain_status);
CREATE INDEX IF NOT EXISTS idx_kyc_risk              ON oe_kyc_verifications(risk_level);
