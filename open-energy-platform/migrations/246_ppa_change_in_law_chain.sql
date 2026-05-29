-- Wave 78 — PPA Change-in-Law / Qualifying-Change cost pass-through & relief (P6).
-- Every PPA allocates the risk of a change in law between buyer and seller. When a
-- statute, tax or regulation changes after financial close — a new carbon-tax rate, a
-- NERSA Grid Code amendment, an environmental-licensing condition, an import duty on
-- panels — the affected party tests it against the PPA's "Qualifying Change in Law"
-- definition and, if it qualifies, seeks relief: a tariff adjustment, a lump-sum, or a
-- term extension. A contested claim goes to arbitration.
--
-- DISTINCT from W39 tariff-indexation (scheduled CPI/PPI repricing of an UNCHANGED
-- tariff). W78 is a discrete, evidence-driven, often-contested event: eligibility ->
-- impact -> claim -> negotiation/arbitration -> relief -> implementation. The L4
-- deepening turns what most PPA systems treat as a manual amendment into an audited
-- state machine with materiality gating, INVERTED quantum SLA and NERSA visibility.
--
-- 12-state P6 lifecycle:
--   event_logged -> eligibility_review -> impact_assessment -> claim_submitted
--     -> counterparty_review -> negotiation -> determination_pending
--     -> relief_granted -> implemented                       (negotiated path)
--   ineligible:   eligibility_review -> rejected
--   dispute-out:  counterparty_review -> rejected            (counterparty disputes)
--   no-relief:    determination_pending -> rejected
--   arbitration:  {counterparty_review, negotiation} -> in_arbitration
--                   -> relief_granted (award) | rejected (no award)
--   withdraw:     any pre-relief operative state -> withdrawn
--
-- Tiers (5) by relief quantum (cost impact) in ZAR millions: minor <5 / moderate <25 /
-- material <100 / major <500 / critical >=500. LARGE_TIERS = {major, critical}.
--
-- SLA matrix is INVERTED — a bigger-quantum change needs a deeper eligibility test, a
-- fuller impact model, longer negotiation and a longer arbitration. Terminals 0.
--
-- Reportability — the W78 SIGNATURE: refer_to_arbitration crosses for EVERY tier (a
-- contested change-in-law claim is always reportable); issue_determination / award_relief
-- cross for the material+ tiers when the change is GOVERNMENTAL in origin (tax /
-- regulatory / statutory / discriminatory); SLA breaches cross for major + critical only.
--
-- Single write {admin, offtaker}: the offtaker's contract-management desk operates the
-- chain. actor_party tags whether a step represents the claimant (affected party / IPP),
-- the counterparty (offtaker) or an arbitrator, for the audit trail.

CREATE TABLE IF NOT EXISTS oe_ppa_change_in_law (
  id                       TEXT PRIMARY KEY,
  cil_number               TEXT UNIQUE NOT NULL,

  -- Provenance (a change-in-law claim arises against a live PPA)
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,
  ppa_ref                  TEXT,              -- originating PPA / offtake agreement
  project_id               TEXT,              -- generating project / SPV
  contract_ref             TEXT,

  -- Parties
  generator_name           TEXT NOT NULL,     -- seller / IPP
  offtaker_name            TEXT NOT NULL,     -- buyer / offtaker
  arbitrator_name          TEXT,              -- appointed on a referred dispute

  -- Classification
  change_type              TEXT,              -- tax_change / regulatory_change / statutory_change / discriminatory_change / other_change
  change_category          TEXT,              -- e.g. carbon_tax / grid_code / env_licence / import_duty
  relief_mechanism         TEXT,              -- tariff_adjustment / lump_sum / term_extension / combination / no_relief
  currency                 TEXT,              -- ZAR / USD
  claim_quantum_zar_m      REAL NOT NULL,     -- relief sought (ZAR millions) — drives the tier
  assessed_quantum_zar_m   REAL,              -- impact assessed by the counterparty
  granted_quantum_zar_m    REAL,              -- relief actually granted
  change_in_law_tier       TEXT NOT NULL CHECK (change_in_law_tier IN (
    'minor','moderate','material','major','critical'
  )),

  -- Dates
  law_effective_date       TEXT,              -- when the change in law took effect
  notification_date        TEXT,              -- when the affected party notified
  claim_deadline           TEXT,
  determination_due_date   TEXT,
  reason_code              TEXT,

  -- Refs
  eligibility_ref          TEXT,
  assessment_ref           TEXT,
  claim_ref                TEXT,
  negotiation_ref          TEXT,
  determination_ref        TEXT,
  arbitration_ref          TEXT,
  implementation_ref       TEXT,
  rejection_ref            TEXT,
  withdrawal_ref           TEXT,

  -- Narrative
  event_basis              TEXT,
  eligibility_basis        TEXT,
  assessment_basis         TEXT,
  claim_basis              TEXT,
  negotiation_basis        TEXT,
  determination_basis      TEXT,
  arbitration_basis        TEXT,
  implementation_basis     TEXT,
  rejection_basis          TEXT,
  withdrawal_basis         TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'event_logged','eligibility_review','impact_assessment','claim_submitted',
    'counterparty_review','negotiation','determination_pending','in_arbitration',
    'relief_granted','implemented','rejected','withdrawn'
  )),
  event_logged_at            TEXT NOT NULL,
  eligibility_review_at      TEXT,
  impact_assessment_at       TEXT,
  claim_submitted_at         TEXT,
  counterparty_review_at     TEXT,
  negotiation_at             TEXT,
  determination_pending_at   TEXT,
  in_arbitration_at          TEXT,
  relief_granted_at          TEXT,
  implemented_at             TEXT,
  rejected_at                TEXT,
  withdrawn_at               TEXT,

  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cil_status    ON oe_ppa_change_in_law(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cil_tier      ON oe_ppa_change_in_law(change_in_law_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cil_offtaker  ON oe_ppa_change_in_law(offtaker_name);
CREATE INDEX IF NOT EXISTS idx_oe_cil_type      ON oe_ppa_change_in_law(change_type);
CREATE INDEX IF NOT EXISTS idx_oe_cil_sla       ON oe_ppa_change_in_law(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_ppa_change_in_law_events (
  id                  TEXT PRIMARY KEY,
  change_in_law_id    TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cil_events_cil  ON oe_ppa_change_in_law_events(change_in_law_id);
CREATE INDEX IF NOT EXISTS idx_oe_cil_events_type ON oe_ppa_change_in_law_events(event_type);
