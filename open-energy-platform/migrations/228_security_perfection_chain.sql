-- Wave 69 — Security / Collateral Perfection & Registration chain. A best-in-class
-- project-finance lender takes, PERFECTS and maintains a SECURITY PACKAGE that
-- makes the debt enforceable and correctly ranked. In SA law a security interest
-- only bites once legally PERFECTED at the right registry:
--   - mortgage bonds over immovable property → Deeds Office (Deeds Registries Act 47/1937)
--   - special / general notarial bonds over movables → Deeds Office (Security by
--     Means of Movable Property Act 57/1993)
--   - pledge / cession of shares & uncertificated securities → Companies Act 71/2008
--     s126 + CSDP / STRATE (Financial Markets Act 19/2012)
--   - cession in securitatem debiti of rights (accounts, insurance proceeds,
--     receivables) → contractual, perfected by notice
--   - security in favour of a non-resident lender → SARB Exchange Control
-- The common-terms / facility agreement lists each item as a CONDITION PRECEDENT
-- (perfected before first drawdown) or CONDITION SUBSEQUENT (perfected within a
-- window after close). The security agent drives each item from identification
-- through document execution, lodgement, registration and a final perfection legal
-- opinion — and chases anything that goes defective or overdue.
--
-- Distinct from the rest of the lender book: W21 releases FUNDS; W30 reconciles
-- USE of proceeds; W38 tests COVENANTS; W45 ENFORCES on default / step-in; W53
-- APPROVES the credit; W61 SELLS DOWN the loan; W6 chases covenant breaches. W69
-- governs whether the lender's SECURITY is actually good — taken, registered,
-- ranked and enforceable.
--
-- 12-state P6 lifecycle (forward path + defect/re-lodge loop + overdue branch):
--   identified → documentation_pending → executed → lodged_for_registration
--     → registered → perfection_review → perfected
--   defect:   {lodged_for_registration, perfection_review} → defective
--             defective → lodged_for_registration (re-lodge)
--   overdue:  {documentation_pending, executed, lodged_for_registration, defective}
--               → perfection_overdue → lodged_for_registration (cure) | lapsed
--   terminals: perfected → released; {perfection_overdue, defective} → lapsed;
--              {identified, documentation_pending, executed} → withdrawn
--
-- Tiers (5) by SECURED VALUE (ZAR), with a floor escalation for a CONDITION
-- PRECEDENT-to-drawdown item (an unperfected CP blocks the whole facility):
--   minor <R10m / moderate <R100m / material <R500m / major <R2bn / critical >=R2bn
--
-- URGENT SLA: the LARGER / more critical the security, the TIGHTER the window.
-- Same flavour as W68 / W34 / W50 / W67.
--
-- Reportability (the W69 signature — SECURITY-LOSS-driven):
--   mark_lapsed crosses for EVERY tier (a lapse is always a material credit /
--   impairment event); flag_overdue and SLA breaches cross for the high tiers
--   (major + critical); reject_registration crosses for the critical tier only.
--
-- Two-party write: the security agent (lender) drives every step; the grantor
-- (borrower) executes the security document. actor_party records which side a
-- step represents.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/source_wave.

CREATE TABLE IF NOT EXISTS oe_security_perfection (
  id                          TEXT PRIMARY KEY,
  case_number                 TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event                TEXT,
  source_entity_type          TEXT,
  source_entity_id            TEXT,
  source_wave                 TEXT,

  -- Facility / borrower / project
  facility_id                 TEXT,
  facility_name               TEXT,
  borrower_id                 TEXT NOT NULL,
  borrower_name               TEXT NOT NULL,
  project_id                  TEXT,
  project_name                TEXT,

  -- Security item descriptors
  security_type               TEXT NOT NULL CHECK (security_type IN (
    'mortgage_bond','special_notarial_bond','general_notarial_bond','share_pledge',
    'cession_rights','cession_insurance','cession_accounts','strate_pledge','guarantee','other'
  )),
  security_description         TEXT,
  registry                    TEXT CHECK (registry IN (
    'deeds_office','cipc','strate','companies_register','contractual','sarb','other'
  )),
  secured_value_zar           REAL,
  ranking                     TEXT CHECK (ranking IN (
    'first','second','subordinated','pari_passu'
  )),
  perfection_critical         INTEGER NOT NULL DEFAULT 0,   -- condition precedent to first drawdown
  cross_border                INTEGER NOT NULL DEFAULT 0,   -- non-resident beneficiary (SARB ExCon)
  severity_tier               TEXT NOT NULL CHECK (severity_tier IN (
    'minor','moderate','material','major','critical'
  )),

  -- Parties
  security_agent_id           TEXT,
  security_agent_name         TEXT,
  grantor_id                  TEXT,
  grantor_name                TEXT,

  -- Refs
  document_ref                TEXT,
  lodgement_ref               TEXT,
  registration_ref            TEXT,
  perfection_ref              TEXT,
  legal_opinion_ref           TEXT,
  release_ref                 TEXT,

  -- Narrative
  documentation_basis         TEXT,
  execution_basis             TEXT,
  lodgement_basis             TEXT,
  registration_basis          TEXT,
  defect_basis                TEXT,
  perfection_basis            TEXT,
  overdue_basis               TEXT,
  release_basis               TEXT,
  lapse_basis                 TEXT,
  reason_code                 TEXT,
  resolution_summary          TEXT,

  -- State + lifecycle
  chain_status                TEXT NOT NULL CHECK (chain_status IN (
    'identified','documentation_pending','executed','lodged_for_registration',
    'registered','perfection_review','perfected','defective','perfection_overdue',
    'released','lapsed','withdrawn'
  )),
  identified_at               TEXT NOT NULL,
  documentation_pending_at    TEXT,
  executed_at                 TEXT,
  lodged_for_registration_at  TEXT,
  registered_at               TEXT,
  perfection_review_at        TEXT,
  perfected_at                TEXT,
  defective_at                TEXT,
  perfection_overdue_at       TEXT,
  released_at                 TEXT,
  lapsed_at                   TEXT,
  withdrawn_at                TEXT,

  perfection_deadline_at      TEXT,             -- the CP/CS perfection deadline (informational)
  relodge_round               INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at             TEXT,
  last_sla_breach_at          TEXT,
  is_reportable               INTEGER NOT NULL DEFAULT 0,
  escalation_level            INTEGER NOT NULL DEFAULT 0,

  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_spf_status   ON oe_security_perfection(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_spf_tier     ON oe_security_perfection(severity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_spf_borrower ON oe_security_perfection(borrower_id);
CREATE INDEX IF NOT EXISTS idx_oe_spf_type     ON oe_security_perfection(security_type);
CREATE INDEX IF NOT EXISTS idx_oe_spf_sla      ON oe_security_perfection(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_security_perfection_events (
  id              TEXT PRIMARY KEY,
  perfection_id   TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_spf_events_case ON oe_security_perfection_events(perfection_id);
CREATE INDEX IF NOT EXISTS idx_oe_spf_events_type ON oe_security_perfection_events(event_type);
