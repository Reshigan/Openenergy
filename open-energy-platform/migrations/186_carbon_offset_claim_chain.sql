-- Wave 48 — Carbon Tax Offset Claim & Allowance lifecycle chain.
-- Carbon Tax Act 15 of 2019 s.13 (offset allowance) + Carbon Offset Regulations
-- GNR 1556 of 2019 + DFFE Carbon Offset Administration System (COAS) +
-- SARS eFiling (Environmental Levy / carbon tax return).
--
-- The MONETISATION / UTILISATION end of the carbon-credit lifecycle. Where W37
-- registers a project, W11 verifies its reductions (MRV), W17 retires the
-- resulting credits and W42 protects their permanence, THIS chain governs the
-- taxpayer claiming RETIRED, ELIGIBLE credits against their SA carbon-tax
-- liability — up to 5% (general) or 10% (Annex-2 mining/petroleum) of gross
-- liability per s.13. A credit used here is locked against that tax period and
-- cannot be re-applied (one retirement → one claim, by law).
--
-- Deepens the flat L2 carbon_tax_offset_claims table (migration 026, status
-- draft/submitted/accepted/rejected/adjusted) into a full P6/L4 state machine.
--
-- 12-state P6 lifecycle (forward path + SARS query loop + 3 terminals + happy terminal):
--   claim_drafted → eligibility_screening → credits_earmarked → claim_submitted
--     → sars_review → allowance_granted → applied_to_return → reconciled   (matched)
--   SARS query loop: sars_review → sars_query → (respond) → sars_review
--   rejected:    sars_review → rejected                       (ineligible credits)
--   clawed_back: allowance_granted|applied_to_return → clawed_back
--                (audit finds credits ineligible, or W42 reversal of the credits)
--   withdrawn:   any pre-submission state → withdrawn
--
-- Tiers (offset VALUE materiality — drive SLA + reportability):
--   major_claim    — offset value >= R10m
--   standard_claim — R1m <= value < R10m
--   minor_claim    — value < R1m
--
-- INVERTED SLA: major_claim gets the LONGEST window at every active stage (a
-- material offset claim warrants deeper SARS scrutiny, so more review time is
-- allowed — same flavour as W43 MYPD determination).
--
-- Single-party write {admin, carbon_fund}; actor_party records the functional
-- party (taxpayer / registry-COAS / sars) for audit attribution only.
--
-- Reportability: claw_back crosses for EVERY tier (understatement / penalty
-- exposure); reject_claim + SLA breaches cross for material tiers (major +
-- standard); grant_allowance crosses for major_claim (material offset
-- utilisation notifiable to DFFE COAS / SARS).
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (e.g. a W17 retirement feeds the eligible credits; a W42 reversal
-- can trigger a clawback).

CREATE TABLE IF NOT EXISTS oe_carbon_offset_claims (
  id                       TEXT PRIMARY KEY,
  claim_number             TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,

  -- Taxpayer + authorities
  taxpayer_party_id        TEXT NOT NULL,
  taxpayer_party_name      TEXT NOT NULL,
  registry_name            TEXT,             -- DFFE COAS
  sars_office_name         TEXT,             -- SARS branch / large-business centre

  -- Tax-period + liability descriptors
  tax_year                 INTEGER NOT NULL,
  industry_group           TEXT NOT NULL CHECK (industry_group IN ('general','annex_2')),
  offset_tier              TEXT NOT NULL CHECK (offset_tier IN (
    'major_claim','standard_claim','minor_claim'
  )),
  gross_tax_liability_zar  REAL,             -- s.6 gross carbon-tax liability
  offset_limit_pct         REAL,             -- 5 or 10 per s.13
  offset_limit_zar         REAL,             -- gross * pct
  ct_rate_zar_per_tco2e    REAL,             -- prevailing carbon-tax rate
  credits_claimed_tco2e    REAL,             -- eligible retired credits claimed
  offset_value_zar         REAL,             -- credits * rate, capped at limit
  net_tax_liability_zar    REAL,             -- gross - offset_value
  credits_unused_tco2e     REAL,             -- claimed credits over the s.13 cap

  -- Refs
  coas_reference           TEXT,             -- COAS registry retirement/lock ref
  retirement_ref           TEXT,             -- the W17 retirement that yielded the credits
  sars_reference           TEXT,             -- SARS eFiling case ref
  query_ref                TEXT,             -- SARS RFI / query ref
  allowance_ref            TEXT,             -- granted allowance ref
  return_ref               TEXT,             -- carbon-tax return ref
  assessment_ref           TEXT,             -- SARS assessment ref
  clawback_ref             TEXT,
  reversal_ref             TEXT,             -- the W42 reversal that triggered a clawback

  -- Narrative
  eligibility_basis        TEXT,
  earmark_basis            TEXT,
  submission_basis         TEXT,
  review_basis             TEXT,
  query_basis              TEXT,
  allowance_basis          TEXT,
  reconciliation_basis     TEXT,
  rejection_basis          TEXT,
  clawback_basis           TEXT,
  reason_code              TEXT,
  claim_summary            TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'claim_drafted','eligibility_screening','credits_earmarked','claim_submitted',
    'sars_review','sars_query','allowance_granted','applied_to_return',
    'reconciled','rejected','clawed_back','withdrawn'
  )),
  claim_drafted_at          TEXT NOT NULL,
  eligibility_screening_at  TEXT,
  credits_earmarked_at      TEXT,
  claim_submitted_at        TEXT,
  sars_review_at            TEXT,
  sars_query_at             TEXT,
  allowance_granted_at      TEXT,
  applied_to_return_at      TEXT,
  reconciled_at             TEXT,
  rejected_at               TEXT,
  clawed_back_at            TEXT,
  withdrawn_at              TEXT,

  query_round              INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_coc_status    ON oe_carbon_offset_claims(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_coc_tier       ON oe_carbon_offset_claims(offset_tier);
CREATE INDEX IF NOT EXISTS idx_oe_coc_taxpayer   ON oe_carbon_offset_claims(taxpayer_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_coc_taxyear     ON oe_carbon_offset_claims(tax_year);
CREATE INDEX IF NOT EXISTS idx_oe_coc_drafted    ON oe_carbon_offset_claims(claim_drafted_at);
CREATE INDEX IF NOT EXISTS idx_oe_coc_sla        ON oe_carbon_offset_claims(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_carbon_offset_claims_events (
  id              TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_coc_events_claim ON oe_carbon_offset_claims_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_oe_coc_events_type  ON oe_carbon_offset_claims_events(event_type);
