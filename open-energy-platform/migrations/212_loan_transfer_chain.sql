-- Wave 61 — Lender Loan Transfer / Secondary Participation & Syndication
-- (LMA Transfer Certificate) chain. LMA Standard Terms & Conditions for
-- secondary loan trading (Transfer Certificate / Assignment Agreement) + SARB
-- Exchange Control Rulings (transfer of a loan participation to a NON-RESIDENT
-- lender requires exchange-control approval) + FIC Act 38 of 2001 (KYC / AML /
-- sanctions screening of the incoming lender) + Banks Act large-exposure
-- re-aggregation + Equator Principles (EPFI status of the transferee).
-- 12-state P6 lifecycle for a SINGLE transfer of a loan participation from one
-- lender (the transferor) to an incoming lender (the transferee), administered
-- by the facility agent with the borrower (obligor) consenting.
--
-- The SECONDARY-MARKET dimension of the Lender lifecycle: who HOLDS the loan,
-- and how it changes hands AFTER the facility is originated (W53), drawn (W21)
-- and disbursed (W30). Mechanically distinct from the borrower-compliance
-- monitoring chains (W6 dunning, W38 covenant certificate) and the enforcement
-- chain (W45 default): a transfer is a TRANSACTION, gated by KYC/sanctions
-- screening, obligor consent and — for a non-resident transferee — SARB
-- exchange-control approval, then executed by an LMA Transfer Certificate and
-- settled.
--
-- 12-state P6 lifecycle:
--   transfer_requested → kyc_screening → consent_solicitation
--     → regulatory_review → transfer_approved → certificate_executed
--     → settled → completed                                     (clean path)
--   kyc remediation:  kyc_screening → screening_remediation → kyc_screening
--   reject (KYC/sanctions): kyc_screening → rejected
--   decline (obligor):      consent_solicitation → declined
--   withdraw (transferor):  any pre-completion operative state → withdrawn
--
-- Transferred-participation tiers (ZAR millions; drive the INVERTED SLA +
-- reportability):
--   minor     — < 100
--   moderate  — < 500
--   material  — < 2000
--   major     — < 10000
--   systemic  — >= 10000
--
-- INVERTED SLA: the LARGER the transferred participation, the LONGER every
-- screening / consent / regulatory / settlement window (deeper KYC, deeper SARB
-- exchange-control + large-exposure scrutiny for bigger transfers). Terminals
-- carry no deadline.
--
-- Reportability (the W61 signature is RESIDENCY-driven, not size-driven):
--   approve_transfer to a NON-RESIDENT transferee crosses for EVERY tier (SARB
--   Exchange Control approval is always notifiable); fail_screening crosses for
--   EVERY tier (FIC sanctions/AML hit on an incoming lender); complete crosses
--   for LARGE tiers (Banks Act large-exposure re-aggregation); sla_breached
--   crosses for LARGE tiers only.
--
-- Two-party split write: the OBLIGOR (borrower) actively consents to (or
-- refuses) the transfer (grant_consent / refuse_consent); the LENDER side
-- (transferor + facility agent) drives everything else. actor_party
-- (transferor / agent / obligor) records the post-event function per step.

CREATE TABLE IF NOT EXISTS oe_loan_transfers (
  id                            TEXT PRIMARY KEY,
  case_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (the originated facility this participation derives from)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party split write: lender side + obligor)
  transferor_party_id           TEXT NOT NULL,
  transferor_party_name         TEXT NOT NULL,
  transferee_party_id           TEXT NOT NULL,
  transferee_party_name         TEXT NOT NULL,
  agent_party_id                TEXT NOT NULL,
  agent_party_name              TEXT NOT NULL,
  obligor_party_id              TEXT NOT NULL,
  obligor_party_name            TEXT NOT NULL,

  -- The facility / participation being transferred
  facility_code                 TEXT,              -- internal facility code
  facility_name                 TEXT NOT NULL,     -- human name of the facility
  transfer_type                 TEXT NOT NULL,     -- novation / assignment / sub_participation / funded_participation
  tranche                       TEXT,              -- term / revolving / dsra / bridge
  borrower_project              TEXT,              -- the underlying REIPPPP project
  facility_currency             TEXT,              -- ZAR / USD / EUR

  -- Transfer economics
  facility_total_zar_m          REAL,              -- total committed facility (ZAR millions)
  transfer_zar_m                REAL NOT NULL,     -- transferred participation (ZAR millions)
  transfer_price_pct            REAL,              -- price as pct of par
  settlement_zar_m              REAL,              -- cash settlement amount
  transfer_tier                 TEXT NOT NULL CHECK (transfer_tier IN (
    'minor','moderate','material','major','systemic'
  )),

  -- Residency of the incoming lender — drives the SARB exchange-control crossing
  transferee_residency          TEXT NOT NULL CHECK (transferee_residency IN (
    'resident','non_resident'
  )),
  transferee_epfi               INTEGER NOT NULL DEFAULT 0,  -- Equator Principles financial institution

  -- Screening / consent / approval gates
  kyc_cleared                   INTEGER NOT NULL DEFAULT 0,
  sanctions_cleared             INTEGER NOT NULL DEFAULT 0,
  obligor_consent_granted       INTEGER NOT NULL DEFAULT 0,
  sarb_approval_required         INTEGER NOT NULL DEFAULT 0,
  sarb_approval_obtained        INTEGER NOT NULL DEFAULT 0,
  certificate_signed            INTEGER NOT NULL DEFAULT 0,
  register_updated              INTEGER NOT NULL DEFAULT 0,

  -- Refs
  request_ref                   TEXT,
  screening_ref                 TEXT,
  remediation_ref               TEXT,
  consent_ref                   TEXT,
  regulatory_ref                TEXT,
  approval_ref                  TEXT,
  certificate_ref               TEXT,
  settlement_ref                TEXT,
  completion_ref                TEXT,
  rejection_ref                 TEXT,
  decline_ref                   TEXT,
  withdrawal_ref                TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  request_basis                 TEXT,
  screening_basis               TEXT,
  remediation_basis             TEXT,
  consent_basis                 TEXT,
  regulatory_basis              TEXT,
  approval_basis                TEXT,
  certificate_basis             TEXT,
  settlement_basis              TEXT,
  rejection_basis               TEXT,
  decline_basis                 TEXT,
  withdrawal_basis              TEXT,
  reason_code                   TEXT,
  notes                         TEXT,

  remediation_round             INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'transfer_requested','kyc_screening','screening_remediation',
    'consent_solicitation','regulatory_review','transfer_approved',
    'certificate_executed','settled','completed','declined','rejected','withdrawn'
  )),
  transfer_requested_at         TEXT NOT NULL,
  kyc_screening_at              TEXT,
  screening_remediation_at      TEXT,
  consent_solicitation_at       TEXT,
  regulatory_review_at          TEXT,
  transfer_approved_at          TEXT,
  certificate_executed_at       TEXT,
  settled_at                    TEXT,
  completed_at                  TEXT,
  declined_at                   TEXT,
  rejected_at                   TEXT,
  withdrawn_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ltr_status     ON oe_loan_transfers(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ltr_tier       ON oe_loan_transfers(transfer_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ltr_residency  ON oe_loan_transfers(transferee_residency);
CREATE INDEX IF NOT EXISTS idx_oe_ltr_transferor ON oe_loan_transfers(transferor_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_ltr_facility   ON oe_loan_transfers(facility_code);
CREATE INDEX IF NOT EXISTS idx_oe_ltr_requested  ON oe_loan_transfers(transfer_requested_at);
CREATE INDEX IF NOT EXISTS idx_oe_ltr_sla        ON oe_loan_transfers(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_loan_transfers_events (
  id                 TEXT PRIMARY KEY,
  transfer_id        TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ltr_events_t    ON oe_loan_transfers_events(transfer_id);
CREATE INDEX IF NOT EXISTS idx_oe_ltr_events_type ON oe_loan_transfers_events(event_type);
