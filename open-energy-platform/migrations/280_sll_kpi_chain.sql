-- Wave 95 — Sustainability-Linked Loan (SLL) KPI Compliance & Margin Ratchet
-- (P6). The ESG-DRIVEN MARGIN-PRICING layer of a best-in-class lender stack.
-- W38 covenant_certificate handles point-in-time FINANCIAL KPI (DSCR/LLCR);
-- W77 reserve_account handles cash-balance covenants; W86 dscr_monitoring is
-- the rolling FINANCIAL coverage monitor; W45 loan_default catches what
-- crystallises after cure_failed. W95 fills the gap: NON-FINANCIAL ESG KPIs
-- (CO2 intensity, energy-efficiency, safety-LTIFR, B-BBEE, mandatory
-- disclosure, taxonomy alignment) measured annually, INDEPENDENTLY VERIFIED,
-- driving contractual margin step-up / step-down per the LMA SLL Principles
-- and SA Green Finance Taxonomy 2025.
--
-- DISTINCTIVE move (beat Sustainalytics / ISS-ESG / MSCI ESG / S&P RobecoSAM
-- CSA / Bloomberg ESG / Refinitiv ESG / LMA SLL Portal / ICMA SLBP / JSE
-- Sustainability Index — all of which surface ESG SCORES but none drive a
-- live contractual margin ratchet against an independent attestation):
-- every chain row is LIVE-scored on every fetch against a TCFD-completeness
-- battery (4 pillars: governance / strategy / risk-mgmt / metrics), SBTi
-- alignment pathway (1.5°C / well-below-2°C / 2°C / not-aligned), SA Green
-- Finance Taxonomy 2025 alignment %, verification-provenance band (big4 /
-- iso14065_accredited / industry / inadequate), effective margin (base +
-- cumulative ratchet bps), cumulative-ratchet ZAR over remaining tenor, and
-- a PREDICTED-AMENDMENT-DATE rolling forward from the current state's SLA.
--
-- 13-state P6 lifecycle:
--   kpi_period_open -> baseline_set -> measurement_collected
--     -> independent_verification -> kpi_attested -> ratchet_computed
--     -> margin_amended                                            (terminal)
--   breach_recorded (from independent_verification on KPI miss)
--     -> cure_period -> {validate_cure -> kpi_attested}
--                    -> {fail_cure -> cure_failed}                 (terminal)
--   restatement (from kpi_attested / ratchet_computed / margin_amended)
--     -> re_verify -> independent_verification                   (rejoins)
--   cancelled              -- admin / counterparty cancel        (terminal)
--   sustainability_event   -- external event (refinance/M&A/prepay) (terminal)
--
-- Tier — KPI-VARIANCE-DERIVED on every transition from |kpi_variance_pct|
-- and materiality_class:
--   minor <5pp / standard 5-15pp / material 15-30pp / severe >=30pp.
--   FLOOR-AT-MATERIAL for materiality_class IN (climate_kpi, safety_kpi,
--   mandatory_disclosure_kpi).
--
-- INVERTED SLA: the LARGER the material breach, the LONGER each remediation
--   window. Per LMA SLL Principles, ESG-material breaches need structural
--   remediation (training, capex, supply-chain redesign), not a 30-day patch.
--   Severe cure window = 180d; minor cure window = 21d.
--
-- Reportability (the W95 SIGNATURE is BREACH/CURE-FAILED-driven — every SLL
-- KPI breach and every cure-failure is reportable to SARB Climate Prudential
-- Supervisor regardless of tier):
--   record_breach     crosses regulator EVERY tier — W95 SIGNATURE hard line
--                     (SARB CPS 2024; sister of W94 award_capacity /
--                     W93 impose_penalty / W92 realize_risk / W86
--                     declare_acceleration / W77 declare_breach).
--   fail_cure         crosses regulator EVERY tier — mandatory disclosure
--                     (SA Green Finance Taxonomy 2025 + JSE SRL).
--   raise_restatement crosses regulator material+severe (SARB CPS 2024).
--   amend_margin      crosses regulator severe only (material price change).
--   attest_kpi        crosses regulator on floor-at-material classes always
--                     (climate/safety/mandatory disclosure are always public)
--                     or severe variance regardless of class.
--   sla_breached      crosses material+severe (procedural-window miss risk).
--
-- Single lender-side write {admin, lender}. actor_party (sustainability_officer
-- / verifier / credit_committee / borrower) records the functional owner
-- per step (NOT an access split). BORROWER can read their own case via tenant
-- scoping but cannot write.

CREATE TABLE IF NOT EXISTS oe_sll_kpi_compliance (
  id                                  TEXT PRIMARY KEY,
  compliance_number                   TEXT UNIQUE NOT NULL,

  -- Provenance — upstream chain that triggered the case
  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,
  trigger_kind                        TEXT CHECK (trigger_kind IN (
    'annual_period_open','semiannual_period_open','quarterly_period_open',
    'one_off_attestation','restatement_request','external_audit_trigger',
    'sarb_cps_audit','sa_green_taxonomy_audit'
  )),

  -- Borrower / loan identity
  borrower_party_id                   TEXT NOT NULL,
  borrower_party_name                 TEXT,
  borrower_persona                    TEXT,
  facility_id                         TEXT,
  facility_name                       TEXT,
  outstanding_zar                     REAL NOT NULL DEFAULT 0,
  remaining_tenor_days                INTEGER NOT NULL DEFAULT 0,
  base_margin_bps                     REAL NOT NULL DEFAULT 0,

  -- KPI classification
  materiality_class                   TEXT NOT NULL CHECK (materiality_class IN (
    'general_kpi','climate_kpi','safety_kpi','mandatory_disclosure_kpi',
    'governance_kpi','supply_chain_kpi'
  )),
  kpi_code                            TEXT NOT NULL,
  kpi_name                            TEXT,
  kpi_unit                            TEXT,
  kpi_period_label                    TEXT,
  kpi_period_year                     INTEGER,

  -- Tier + authority (RE-DERIVED on every transition)
  compliance_tier                     TEXT NOT NULL CHECK (compliance_tier IN (
    'minor','standard','material','severe'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'esg_analyst','sustainability_officer','credit_committee',
    'board_sustainability_committee'
  )),

  -- KPI variance + measurement
  kpi_baseline_value                  REAL,
  kpi_target_value                    REAL,
  kpi_measured_value                  REAL,
  kpi_forecast_value                  REAL,
  measured_variance_pct               REAL,
  forecast_variance_pct               REAL,
  effective_variance_pct              REAL,

  -- Margin ratchet (bps, cumulative)
  ratchet_bps_this_period             REAL,
  cumulative_ratchet_bps              REAL NOT NULL DEFAULT 0,
  effective_margin_bps                REAL,
  cumulative_ratchet_zar              REAL,
  cure_failed_penalty_bps             REAL,

  -- ESG completeness battery
  tcfd_pillars_covered                INTEGER NOT NULL DEFAULT 0,
  tcfd_completeness_pct               REAL,
  attestation_fields_present          INTEGER NOT NULL DEFAULT 0,
  attestation_fields_required         INTEGER NOT NULL DEFAULT 0,
  attestation_completeness_pct        REAL,
  sbti_pathway                        TEXT CHECK (sbti_pathway IN (
    '1_5C','well_below_2C','2C','not_aligned'
  )),
  emissions_reduction_pct_per_year    REAL,
  taxonomy_eligible_zar               REAL,
  total_financing_zar                 REAL,
  taxonomy_alignment_pct              REAL,
  verifier_slug                       TEXT,
  verification_provenance_band        TEXT CHECK (verification_provenance_band IN (
    'big4','iso14065_accredited','industry_specialist','inadequate'
  )),

  -- Cure tracking
  cure_target_at                      TEXT,
  cure_actual_at                      TEXT,
  cure_basis                          TEXT,
  restatement_basis                   TEXT,

  -- Refs (regulator / hand-off)
  baseline_ref                        TEXT,
  measurement_ref                     TEXT,
  verification_ref                    TEXT,
  attestation_ref                     TEXT,
  ratchet_ref                         TEXT,
  amendment_ref                       TEXT,
  breach_ref                          TEXT,
  cure_ref                            TEXT,
  restatement_ref                     TEXT,
  regulator_ref                       TEXT,
  facility_ref                        TEXT,
  sustainability_event_ref            TEXT,

  -- Narrative
  baseline_basis                      TEXT,
  attestation_basis                   TEXT,
  breach_basis                        TEXT,
  fail_basis                          TEXT,
  cancellation_basis                  TEXT,
  reason_code                         TEXT,

  -- State + lifecycle (13 statuses)
  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'kpi_period_open','baseline_set','measurement_collected',
    'independent_verification','kpi_attested','ratchet_computed',
    'margin_amended','breach_recorded','cure_period','cure_failed',
    'restatement','cancelled','sustainability_event'
  )),
  kpi_period_open_at                  TEXT NOT NULL,
  baseline_set_at                     TEXT,
  measurement_collected_at            TEXT,
  independent_verification_at         TEXT,
  kpi_attested_at                     TEXT,
  ratchet_computed_at                 TEXT,
  margin_amended_at                   TEXT,
  breach_recorded_at                  TEXT,
  cure_period_at                      TEXT,
  cure_failed_at                      TEXT,
  restatement_at                      TEXT,
  cancelled_at                        TEXT,
  sustainability_event_at             TEXT,
  kpi_due_at                          TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_sll_status    ON oe_sll_kpi_compliance(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_sll_tier      ON oe_sll_kpi_compliance(compliance_tier);
CREATE INDEX IF NOT EXISTS idx_oe_sll_borrower  ON oe_sll_kpi_compliance(borrower_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_sll_class     ON oe_sll_kpi_compliance(materiality_class);
CREATE INDEX IF NOT EXISTS idx_oe_sll_kpi       ON oe_sll_kpi_compliance(kpi_code);
CREATE INDEX IF NOT EXISTS idx_oe_sll_opened    ON oe_sll_kpi_compliance(kpi_period_open_at);
CREATE INDEX IF NOT EXISTS idx_oe_sll_sla       ON oe_sll_kpi_compliance(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_sll_persona   ON oe_sll_kpi_compliance(borrower_persona);
CREATE INDEX IF NOT EXISTS idx_oe_sll_facility  ON oe_sll_kpi_compliance(facility_id);

CREATE TABLE IF NOT EXISTS oe_sll_kpi_events (
  id            TEXT PRIMARY KEY,
  compliance_id TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  actor_id      TEXT,
  actor_party   TEXT,
  notes         TEXT,
  payload       TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_sll_events_c    ON oe_sll_kpi_events(compliance_id);
CREATE INDEX IF NOT EXISTS idx_oe_sll_events_type ON oe_sll_kpi_events(event_type);
