-- Wave 70 — REC / Guarantee-of-Origin Certificate Lifecycle chain. A best-in-class
-- offtaker buys not just electricity but the renewable ATTRIBUTE of that
-- electricity, which travels separately as a tradeable certificate (one per MWh of
-- verified renewable generation):
--   - I-REC Standard certificates (the dominant instrument in the SA market)
--   - South African Renewable Energy Certificates (SAREC / AReP)
--   - EU Guarantee-of-Origin (GO) analogue for cross-border claims
-- The offtaker RETIRES certificates to substantiate a renewable-consumption claim
-- under the GHG Protocol Scope 2 market-based method (RE100 / CDP / carbon-tax
-- offset). The integrity of that claim depends on a strict, auditable lifecycle
-- that prevents DOUBLE COUNTING — one MWh attribute is issued once, owned by one
-- party at a time, and retired once.
--
-- Distinct from the rest of the offtaker suite, which all govern the ENERGY/MONEY
-- relationship: W22 executes the PPA; W32 bills contracted-vs-delivered; W39
-- reprices (CPI); W46 pays curtailed deemed-energy; W54 backstops payment; W62
-- exits the offtake. W70 governs the renewable ATTRIBUTE certificate itself.
--
-- 12-state P6 lifecycle (forward path + eligibility-fail + integrity-dispute branch):
--   issuance_requested → eligibility_review → issued → listed_for_transfer
--     → transferred → allocated → retired
--   eligibility fail:  eligibility_review → rejected
--   dispute:   {transferred, allocated} → disputed
--              disputed → allocated (dismissed) | clawed_back (upheld)
--   terminals: allocated → retired; {issuance_requested, issued,
--              listed_for_transfer} → cancelled; eligibility_review → rejected;
--              disputed → clawed_back; {issued, listed_for_transfer, transferred,
--              allocated} → expired (vintage lapse)
--
-- Tiers (5) by MWh REPRESENTED, with a floor escalation for a COMPLIANCE / regulatory
-- claim (carbon-tax offset, mandated renewable obligation):
--   minor <1k MWh / moderate <10k / material <50k / major <200k / critical >=200k
--
-- INVERTED SLA: the LARGER the volume / the more it is a compliance claim, the MORE
-- time each verification window allows. Same flavour as W65 / W53 / W43 / W33.
--
-- Reportability (the W70 signature — INTEGRITY-driven):
--   claw_back crosses for EVERY tier (a revoked certificate is always a
--   double-counting / integrity event); reject_issuance and SLA breaches cross for
--   the high tiers (major + critical).
--
-- Two-party write: the issuer / registry drives issuance, eligibility, listing,
-- transfer, dispute resolution, claw-back and expiry; the holder (offtaker)
-- allocates consumption, retires the certificate and raises integrity disputes.
-- actor_party records which side a step represents.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/source_wave.

CREATE TABLE IF NOT EXISTS oe_rec_lifecycle (
  id                          TEXT PRIMARY KEY,
  case_number                 TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event                TEXT,
  source_entity_type          TEXT,
  source_entity_id            TEXT,
  source_wave                 TEXT,

  -- Generator / project / offtaker
  generator_id                TEXT,
  generator_name              TEXT,
  project_id                  TEXT,
  project_name                TEXT,
  offtaker_id                 TEXT NOT NULL,
  offtaker_name               TEXT NOT NULL,

  -- Certificate descriptors
  certificate_standard        TEXT NOT NULL CHECK (certificate_standard IN (
    'i_rec','sarec','arep','guarantee_of_origin','other'
  )),
  energy_source               TEXT CHECK (energy_source IN (
    'solar_pv','wind','hydro','biomass','biogas','csp','other'
  )),
  certificate_serial          TEXT,
  vintage_year                INTEGER,
  generation_period_start     TEXT,
  generation_period_end       TEXT,
  mwh_represented             REAL,
  registry                    TEXT CHECK (registry IN (
    'i_rec_registry','national_registry','strate','contractual','other'
  )),
  claim_purpose               TEXT CHECK (claim_purpose IN (
    're100','scope2_market_based','carbon_tax_offset','voluntary','compliance_obligation','other'
  )),
  compliance_critical         INTEGER NOT NULL DEFAULT 0,   -- compliance/regulatory claim → tier floor at major
  double_counting_checked     INTEGER NOT NULL DEFAULT 0,
  severity_tier               TEXT NOT NULL CHECK (severity_tier IN (
    'minor','moderate','material','major','critical'
  )),

  -- Parties
  issuer_id                   TEXT,
  issuer_name                 TEXT,
  holder_id                   TEXT,
  holder_name                 TEXT,

  -- Refs
  issuance_ref                TEXT,
  eligibility_ref             TEXT,
  transfer_ref                TEXT,
  allocation_ref              TEXT,
  retirement_ref              TEXT,
  dispute_ref                 TEXT,
  claim_certificate_number    TEXT,

  -- Narrative
  eligibility_basis           TEXT,
  issuance_basis              TEXT,
  transfer_basis              TEXT,
  allocation_basis            TEXT,
  retirement_basis            TEXT,
  dispute_basis               TEXT,
  clawback_basis              TEXT,
  rejection_basis             TEXT,
  reason_code                 TEXT,
  resolution_summary          TEXT,

  -- State + lifecycle
  chain_status                TEXT NOT NULL CHECK (chain_status IN (
    'issuance_requested','eligibility_review','issued','listed_for_transfer',
    'transferred','allocated','retired','cancelled','rejected','disputed',
    'clawed_back','expired'
  )),
  issuance_requested_at       TEXT NOT NULL,
  eligibility_review_at       TEXT,
  issued_at                   TEXT,
  listed_for_transfer_at      TEXT,
  transferred_at              TEXT,
  allocated_at                TEXT,
  retired_at                  TEXT,
  cancelled_at                TEXT,
  rejected_at                 TEXT,
  disputed_at                 TEXT,
  clawed_back_at              TEXT,
  expired_at                  TEXT,

  vintage_expiry_at           TEXT,             -- vintage validity deadline (informational)
  dispute_round               INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at             TEXT,
  last_sla_breach_at          TEXT,
  is_reportable               INTEGER NOT NULL DEFAULT 0,
  escalation_level            INTEGER NOT NULL DEFAULT 0,

  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_rec_status   ON oe_rec_lifecycle(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_rec_tier     ON oe_rec_lifecycle(severity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_rec_offtaker ON oe_rec_lifecycle(offtaker_id);
CREATE INDEX IF NOT EXISTS idx_oe_rec_standard ON oe_rec_lifecycle(certificate_standard);
CREATE INDEX IF NOT EXISTS idx_oe_rec_sla      ON oe_rec_lifecycle(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_rec_lifecycle_events (
  id              TEXT PRIMARY KEY,
  rec_id          TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_rec_events_case ON oe_rec_lifecycle_events(rec_id);
CREATE INDEX IF NOT EXISTS idx_oe_rec_events_type ON oe_rec_lifecycle_events(event_type);
