-- Wave 46 — Offtaker PPA Curtailment / Deemed-Energy Compensation chain.
-- When the buyer or the System Operator curtails an AVAILABLE plant for economic,
-- system-security, or grid-constraint reasons NOT attributable to the IPP, the PPA
-- compensates the seller for "deemed energy" (a.k.a. compensated / avoided energy):
-- the MWh the plant WOULD have generated had it not been curtailed, valued at the
-- PPA tariff. This is the SUPPLY-side mirror of W32 take-or-pay (a take-or-pay
-- shortfall is the buyer failing to OFFTAKE contracted volume on the DEMAND side;
-- a curtailment claim is the buyer/SO preventing the seller from DELIVERING energy
-- it was able to produce).
--
-- Settles against the PPA set up by W22 (contract execution), at the tariff
-- repriced by W39 (CPI escalation), and is triggered by the same dispatch /
-- load-shed instructions that drive W34 (Grid load curtailment — the SO's
-- INSTRUCTION to shed; W46 is the buyer's deemed-energy COMPENSATION settlement
-- that follows).
--
-- 12-state P6 lifecycle (forward path + classification gate + dispute branch + 4 terminals):
--   curtailment_logged → classification_review → claim_prepared
--     → claim_submitted → validation_underway → quantum_proposed
--     → quantum_agreed → compensation_settled                  (paid)
--   classification gate: classification_review → non_compensable (IPP-fault / FM / scheduled)
--   dispute: quantum_proposed|quantum_agreed → disputed
--            disputed → quantum_proposed (recalculate) / arbitrated (referred)
--   any active → withdrawn                                     (seller withdraws)
--
-- Tiers (facility scale — drive SLA + reportability):
--   utility_scale — grid-scale IPP; debt-service dependent on the cash flow
--   commercial    — mid
--   embedded      — behind-the-meter / SSEG; smallest
--
-- URGENT SLA: utility_scale gets the TIGHTEST windows across every state (a large
-- IPP's debt service depends on deemed-energy cash flow, so its claims resolve
-- fastest).
--
-- Seller-write split: the seller (IPP) prepares + submits the claim, disputes the
-- buyer's quantum, and may withdraw; the buyer (offtaker) classifies, validates,
-- proposes/recalculates/agrees quantum, and settles; an arbitration referral moves
-- the matter to the arbiter. actor_party derived from the ACTION, not the JWT role.
--
-- Reportability: refer_arbitration crosses for EVERY tier (universal hard line);
-- reject_non_compensable (denied claim → dispute risk) + settle_compensation
-- (large system-cost settlement) + SLA breaches cross for utility_scale +
-- commercial only.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (e.g. a W34 load-curtailment instruction or a W22 PPA can spawn /
-- feed a claim).

CREATE TABLE IF NOT EXISTS oe_curtailment_claims (
  id                      TEXT PRIMARY KEY,
  claim_number            TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event            TEXT,
  source_entity_type      TEXT,
  source_entity_id        TEXT,
  source_wave             TEXT,

  -- Seller (IPP / generator) + buyer (offtaker)
  seller_party_id         TEXT NOT NULL,
  seller_party_name       TEXT NOT NULL,
  buyer_party_name        TEXT,
  arbiter_name            TEXT,

  -- PPA / facility descriptors
  ppa_ref                 TEXT,            -- the W22 PPA contract this settles against
  facility_name           TEXT NOT NULL,
  facility_tier           TEXT NOT NULL CHECK (facility_tier IN (
    'utility_scale', 'commercial', 'embedded'
  )),
  contracted_capacity_mw  REAL,            -- nameplate / contracted MW
  tariff_per_mwh          REAL,            -- PPA tariff (post-W39 escalation) ZAR/MWh

  -- Curtailment / deemed-energy descriptors
  curtailment_type        TEXT,            -- economic / system_security / grid_constraint / network_outage
  curtailment_event       TEXT,            -- short label of the triggering event
  curtailment_hours       REAL,            -- duration of the curtailment instruction
  deemed_energy_mwh       REAL,            -- claimed avoided generation (MWh)
  claimed_amount          REAL,            -- seller's claim (ZAR)
  proposed_amount         REAL,            -- buyer's proposed quantum (ZAR)
  agreed_amount           REAL,            -- agreed quantum (ZAR)
  settled_amount          REAL,            -- paid (ZAR)

  -- Refs
  log_ref                 TEXT,
  classification_ref      TEXT,
  claim_ref               TEXT,
  validation_ref          TEXT,
  quantum_ref             TEXT,
  settlement_ref          TEXT,
  dispute_ref             TEXT,
  arbitration_ref         TEXT,

  -- Narrative
  log_basis               TEXT,
  classification_basis    TEXT,
  claim_basis             TEXT,
  validation_basis        TEXT,
  quantum_basis           TEXT,
  settlement_basis        TEXT,
  dispute_basis           TEXT,
  arbitration_basis       TEXT,
  reason_code             TEXT,
  rod_notes               TEXT,

  -- State + lifecycle
  chain_status            TEXT NOT NULL CHECK (chain_status IN (
    'curtailment_logged','classification_review','claim_prepared','claim_submitted',
    'validation_underway','quantum_proposed','quantum_agreed','compensation_settled',
    'disputed','arbitrated','non_compensable','withdrawn'
  )),
  curtailment_logged_at     TEXT NOT NULL,
  classification_review_at  TEXT,
  claim_prepared_at         TEXT,
  claim_submitted_at        TEXT,
  validation_underway_at    TEXT,
  quantum_proposed_at       TEXT,
  quantum_agreed_at         TEXT,
  compensation_settled_at   TEXT,
  disputed_at               TEXT,
  arbitrated_at             TEXT,
  non_compensable_at        TEXT,
  withdrawn_at              TEXT,

  dispute_round            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cclaim_status   ON oe_curtailment_claims(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cclaim_tier     ON oe_curtailment_claims(facility_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cclaim_seller   ON oe_curtailment_claims(seller_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_cclaim_type     ON oe_curtailment_claims(curtailment_type);
CREATE INDEX IF NOT EXISTS idx_oe_cclaim_logged   ON oe_curtailment_claims(curtailment_logged_at);
CREATE INDEX IF NOT EXISTS idx_oe_cclaim_sla      ON oe_curtailment_claims(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_curtailment_claims_events (
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

CREATE INDEX IF NOT EXISTS idx_oe_cclaim_events_claim ON oe_curtailment_claims_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_oe_cclaim_events_type  ON oe_curtailment_claims_events(event_type);
