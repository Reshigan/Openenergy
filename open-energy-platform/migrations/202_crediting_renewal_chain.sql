-- Wave 56 — Carbon Crediting-Period Renewal & Baseline Reassessment chain.
-- Verra VCS Standard v4 (crediting period renewal + baseline reassessment) +
-- Gold Standard for the Global Goals + Paris Agreement Article 6.4 Mechanism
-- (renewal of the crediting period by the Supervisory Body, Dec. 3/CMA.3) + CDM
-- legacy (renewable 7-year crediting period, max 3 renewals) + DFFE DNA.
--
-- A registered carbon project does NOT issue forever on its original baseline.
-- Its crediting period expires (commonly 7-10 years) and must be RENEWED to keep
-- issuing. Renewal re-derives the baseline against current data, re-tests
-- additionality, checks the methodology version, has an independent VVB validate
-- the renewed baseline, then the standard's review body decides. The renewed
-- baseline is typically LOWER (a decarbonising grid / technology diffusion),
-- reducing future issuance.
--
-- This is to W37 carbon registration what W33 licence renewal is to W49 licence
-- application — the PERIODIC re-validation complementing the one-time front-end.
-- Distinct from W11 MRV: MRV verifies one monitoring period's reductions; THIS
-- chain re-validates eligibility to KEEP issuing under a renewed baseline for a
-- whole new crediting period. The renewed baseline feeds every later MRV cycle,
-- W17 retirement and W48 tax-offset monetisation.
--
-- 12-state P6 lifecycle (forward path + revision loop + 4 terminals):
--   renewal_due → application_submitted → completeness_check
--     → baseline_reassessment → additionality_retest → vvb_validation
--     → standard_review → renewed                       (new crediting period)
--   revision loop: completeness_check → revision_requested → (resubmit) → completeness_check
--   refused:   standard_review → refused                 (project can no longer issue)
--   withdrawn: any pre-decision state → withdrawn
--   lapsed:    renewal_due → lapsed                      (window expired — TIME-DRIVEN)
--
-- Tiers (annual issuance tCO2e/yr — drive SLA + reportability):
--   minor <10k / moderate <100k / material <500k / major <2m / mega >=2m
--
-- INVERTED SLA: mega gets the LONGEST window at every active stage (a high-volume
-- project's renewal warrants deeper baseline scrutiny — same flavour as W48 / W43).
--
-- Single-party write {admin, carbon_fund}; actor_party records the functional
-- party (proponent / registry / vvb) for audit attribution only.
--
-- Reportability (the W56 signature — an APPROVAL can itself be reportable):
--   renew crosses for EVERY tier when baseline_reduction_pct >= 30 (a material
--   downgrade is an environmental-integrity event for the DNA / Art-6.4 SB);
--   refuse + SLA breaches cross for the large tiers (major + mega).
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/source_wave.

CREATE TABLE IF NOT EXISTS oe_crediting_period_renewals (
  id                       TEXT PRIMARY KEY,
  renewal_number           TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,

  -- Project + standard + VVB
  project_id               TEXT NOT NULL,
  project_name             TEXT NOT NULL,
  registry_standard        TEXT NOT NULL CHECK (registry_standard IN (
    'verra_vcs','gold_standard','article_6_4','cdm'
  )),
  methodology_id           TEXT,
  vvb_name                 TEXT,
  proponent_party_id       TEXT NOT NULL,
  proponent_party_name     TEXT NOT NULL,

  -- Crediting-period descriptors
  issuance_tier            TEXT NOT NULL CHECK (issuance_tier IN (
    'minor','moderate','material','major','mega'
  )),
  annual_issuance_tco2e    REAL,
  crediting_period_number  INTEGER,            -- which renewal (1st/2nd/3rd…)
  current_period_start     TEXT,
  current_period_end       TEXT,               -- the expiring period (lapse driver)
  renewed_period_start     TEXT,
  renewed_period_end       TEXT,

  -- Baseline reassessment
  original_baseline_tco2e  REAL,               -- baseline of the expiring period
  revised_baseline_tco2e   REAL,               -- reassessed baseline for renewal
  baseline_reduction_pct   REAL,               -- (orig - revised)/orig * 100, clamped >=0
  additionality_outcome    TEXT,               -- additional / not_additional / conditional

  -- Refs
  application_ref          TEXT,
  completeness_ref         TEXT,
  vvb_report_ref           TEXT,
  decision_ref             TEXT,
  refusal_ref              TEXT,

  -- Narrative
  submission_basis         TEXT,
  completeness_basis       TEXT,
  revision_basis           TEXT,
  baseline_basis           TEXT,
  additionality_basis      TEXT,
  validation_basis         TEXT,
  decision_basis           TEXT,
  refusal_basis            TEXT,
  reason_code              TEXT,
  renewal_summary          TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'renewal_due','application_submitted','completeness_check','revision_requested',
    'baseline_reassessment','additionality_retest','vvb_validation','standard_review',
    'renewed','refused','withdrawn','lapsed'
  )),
  renewal_due_at            TEXT NOT NULL,
  application_submitted_at  TEXT,
  completeness_check_at     TEXT,
  revision_requested_at     TEXT,
  baseline_reassessment_at  TEXT,
  additionality_retest_at   TEXT,
  vvb_validation_at         TEXT,
  standard_review_at        TEXT,
  renewed_at                TEXT,
  refused_at                TEXT,
  withdrawn_at              TEXT,
  lapsed_at                 TEXT,

  revision_round           INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cpr_status    ON oe_crediting_period_renewals(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cpr_tier      ON oe_crediting_period_renewals(issuance_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cpr_project   ON oe_crediting_period_renewals(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_cpr_standard  ON oe_crediting_period_renewals(registry_standard);
CREATE INDEX IF NOT EXISTS idx_oe_cpr_due       ON oe_crediting_period_renewals(renewal_due_at);
CREATE INDEX IF NOT EXISTS idx_oe_cpr_sla       ON oe_crediting_period_renewals(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_crediting_period_renewals_events (
  id              TEXT PRIMARY KEY,
  renewal_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cpr_events_renewal ON oe_crediting_period_renewals_events(renewal_id);
CREATE INDEX IF NOT EXISTS idx_oe_cpr_events_type    ON oe_crediting_period_renewals_events(event_type);
