-- Wave 54 — Offtaker PPA Payment Security / Credit Support Instrument chain.
-- REIPPPP / bilateral PPA payment-security regime + NERSA Section 34 PPA
-- bankability + LMA-style credit-support terms.
--
-- The financial-assurance backbone of a bankable PPA: the BUYER (offtaker) must
-- post and maintain a payment-security instrument (letter of credit, on-demand
-- bank guarantee, or parent-company guarantee) sized to its rolling payment
-- exposure. The buyer-side credit-support counterpart to the seller-side bonds
-- in W10. Secures payment under the W22 PPA at the W39 tariff; a drawdown is the
-- security consequence of the buyer non-payment that W32 / W7 surface; lenders
-- (W53 / W21) treat a maintained instrument as a condition of the debt facility.
--
-- 12-state P6 lifecycle:
--   security_required → instrument_submitted → under_verification → active
--     → adequacy_review → active                 (periodic adequacy loop)
--   active → release → released                  (PPA term — clean close)
--   drawdown:   active → drawdown_initiated → replenishment_pending
--                 → submit_instrument (re-verify) → active / forfeit → forfeited
--   expiry:     active → expiry_pending → submit_instrument (renew) → active / forfeit
--   substitute: adequacy_review → require_increase → substitution_pending
--                 → submit_instrument (replace) → active / forfeit
--   verify-fail: under_verification → reject_instrument → rejected
--
-- Secured-amount tiers (drive the URGENT SLA + reportability):
--   minor (<R10m) / moderate (<R50m) / material (<R200m) / major (<R1bn) / critical (>=R1bn)
--
-- URGENT SLA: the larger the secured exposure, the TIGHTER every window.
--
-- Reportability (the W54 signature): forfeit crosses the regulator for EVERY
-- tier (a forfeited payment security is a security-of-supply red flag at any
-- scale); initiate_drawdown + reject_instrument cross for major + critical only;
-- sla_breached crosses for major + critical.
--
-- Two-party split write: the offtaker (buyer) posts / re-posts the instrument
-- (submit_instrument); the seller (IPP beneficiary / agent) verifies, activates,
-- runs adequacy review, draws down, forfeits and releases. actor_party
-- (offtaker / seller) records the function per step.

CREATE TABLE IF NOT EXISTS oe_ppa_payment_securities (
  id                            TEXT PRIMARY KEY,
  security_number               TEXT UNIQUE NOT NULL,

  -- Provenance (PPA / pipeline source)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party write)
  offtaker_party_id             TEXT NOT NULL,     -- the buyer who posts the security
  offtaker_party_name           TEXT NOT NULL,
  seller_party_name             TEXT,              -- IPP beneficiary of the security
  agent_name                    TEXT,              -- facility / security agent

  -- Instrument identity
  security_tier                 TEXT NOT NULL CHECK (security_tier IN (
    'minor','moderate','material','major','critical'
  )),
  instrument_name               TEXT NOT NULL,
  instrument_type               TEXT,              -- letter_of_credit / bank_guarantee / parent_guarantee / cash_deposit
  issuer_name                   TEXT,              -- issuing bank / guarantor
  issuer_rating                 TEXT,              -- issuer credit rating
  secured_amount_zar_m          REAL,              -- secured amount in millions ZAR (drives the tier)
  required_amount_zar_m         REAL,              -- contractually required cover
  cover_months                  REAL,              -- months of invoices covered
  ppa_id                        TEXT,
  ppa_reference                 TEXT,
  project_id                    TEXT,
  project_name                  TEXT,
  sector                        TEXT,              -- solar_pv / wind / bess / chp / hydro
  expiry_date                   TEXT,              -- instrument expiry (drives expiry_pending)

  -- Drawdown / replenishment metrics
  drawn_amount_zar_m            REAL,              -- amount called on the instrument
  outstanding_invoice_zar_m     REAL,              -- unpaid PPA invoice that triggered the call
  replenishment_due_zar_m       REAL,              -- amount required to restore the instrument
  adequacy_shortfall_zar_m      REAL,              -- shortfall vs required cover at adequacy review
  drawdown_count                INTEGER NOT NULL DEFAULT 0,

  -- Refs (per stage)
  submission_ref                TEXT,
  verification_ref              TEXT,
  activation_ref                TEXT,
  adequacy_ref                  TEXT,
  drawdown_ref                  TEXT,
  replenishment_ref             TEXT,
  expiry_ref                    TEXT,
  release_ref                   TEXT,
  forfeit_ref                   TEXT,
  reject_ref                    TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  submission_basis              TEXT,
  verification_basis            TEXT,
  activation_basis              TEXT,
  adequacy_basis                TEXT,
  drawdown_basis                TEXT,
  replenishment_basis           TEXT,
  expiry_basis                  TEXT,
  release_basis                 TEXT,
  forfeit_basis                 TEXT,
  reason_code                   TEXT,
  decision_notes                TEXT,
  notes                         TEXT,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'security_required','instrument_submitted','under_verification','active',
    'adequacy_review','drawdown_initiated','replenishment_pending','expiry_pending',
    'substitution_pending','released','forfeited','rejected'
  )),
  security_required_at          TEXT NOT NULL,
  instrument_submitted_at       TEXT,
  under_verification_at         TEXT,
  active_at                     TEXT,
  adequacy_review_at            TEXT,
  drawdown_initiated_at         TEXT,
  replenishment_pending_at      TEXT,
  expiry_pending_at             TEXT,
  substitution_pending_at       TEXT,
  released_at                   TEXT,
  forfeited_at                  TEXT,
  rejected_at                   TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pps_status   ON oe_ppa_payment_securities(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_pps_tier     ON oe_ppa_payment_securities(security_tier);
CREATE INDEX IF NOT EXISTS idx_oe_pps_offtaker ON oe_ppa_payment_securities(offtaker_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_pps_required ON oe_ppa_payment_securities(security_required_at);
CREATE INDEX IF NOT EXISTS idx_oe_pps_sla      ON oe_ppa_payment_securities(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_ppa_payment_securities_events (
  id                 TEXT PRIMARY KEY,
  security_id        TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pps_events_sec  ON oe_ppa_payment_securities_events(security_id);
CREATE INDEX IF NOT EXISTS idx_oe_pps_events_type ON oe_ppa_payment_securities_events(event_type);
