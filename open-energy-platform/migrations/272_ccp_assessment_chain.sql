-- Wave 91 — ICVCM CCP-eligibility Assessment & Label Lifecycle chain (P6).
-- The QUALITY-LABEL "rating" layer of the carbon-credit market — entirely orthogonal to
-- issuance (W82) / retirement (W17) / MRV (W11). After a project is registered (W37),
-- the ICVCM (Integrity Council for the Voluntary Carbon Market) and aligned bodies run
-- an independent integrity assessment that awards the CCP-eligible (Core Carbon
-- Principles) label — the market's "investment-grade" mark that unlocks premium pricing
-- AND CORSIA Phase-2 eligibility (mandatory for airline emissions retirements from 2027).
-- This chain governs that assessment workflow end-to-end: requested → screening →
-- eligibility check → assessment → VVB review → decision → label-granted / label-denied.
-- Separate from issuance — a project can issue without ever obtaining the label, but the
-- label is what differentiates a premium $25/tCO2e credit from a $4/tCO2e generic credit
-- in the 2026 voluntary market.
--
-- DISTINCTIVE move (beat Sylvera / BeZero Carbon / Calyx Global / Renoster / Pachama —
-- all of which publish credit ratings using opaque proprietary methodologies and lag the
-- market): LIVE calculated CCP-criteria scoring exposed on every record — 10-criterion
-- aggregate, weakest-criterion identification, CORSIA Phase-2 eligibility derivation,
-- market premium-pricing uplift, and equivalent grade mapping to the major rating
-- agencies (Sylvera AAA-F) — all derived from the same inputs each transition.
--
-- 12-state P6 lifecycle:
--   requested -> screening -> eligibility_check -> assessment_in_progress
--     -> vvb_review -> ccp_decision_pending
--     -> ccp_label_granted                                              (terminal OK)
--   on_hold            — paused for integrity flag; resumes to screening.
--   returned           — gap found in eligibility_check / assessment; resubmit -> screening.
--   disputed           — proponent appeals; resolve -> vvb_review.
--   ccp_label_denied   — decision: integrity criteria failed. Terminal.
--   withdrawn          — proponent withdraws. Terminal.
--
-- Tiers — by ASSESSED ANNUAL VOLUME (tCO2e/yr): minor <100k / moderate <500k /
--   major <2M / mega >=2M. High-integrity-risk sectors (REDD+, jurisdictional,
--   avoidance) floor at major.
--
-- INVERTED SLA: the LARGER the volume, the LONGER every window (deeper rating diligence
--   warranted); a minor assessment gets the shortest window. Same family as W56/W65/W73/W82.
--
-- Reportability (the W91 SIGNATURE is INTEGRITY-MARK driven):
--   deny_ccp_label    crosses for EVERY tier — public market-rejection signal (W91 SIG,
--                     sister of W82 raise_dispute, W90 terminate_legacy, W77 declare_breach,
--                     W68 declare_default, W45 write_off).
--   grant_ccp_label   crosses for EVERY tier when CONDITIONAL; else major+mega only.
--   raise_dispute     crosses for major+mega only (concentration).
--   sla_breached      crosses for major+mega only.
--
-- Single carbon-fund desk write {admin, carbon_fund} (same single-party model as W37/W11/
-- W17/W42/W48/W56/W65/W73/W82). actor_party (proponent / icvcm / vvb / quality_assessor)
-- records the functional owner per step, not the JWT role.

CREATE TABLE IF NOT EXISTS oe_ccp_assessments (
  id                                  TEXT PRIMARY KEY,
  assessment_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (the W37 registration / W11 MRV that produced this proponent's request)
  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,

  -- Project identity
  project_id                          TEXT NOT NULL,
  project_name                        TEXT,
  registry_standard                   TEXT,
  methodology_id                      TEXT,
  methodology_version                 TEXT,
  proponent_party_id                  TEXT,
  proponent_party_name                TEXT,
  vvb_name                            TEXT,
  quality_assessor_name               TEXT,
  host_country                        TEXT,

  -- Classification
  sector                              TEXT NOT NULL CHECK (sector IN (
    'redd_plus','jurisdictional','avoidance',
    'arr','improved_forest_mgmt','cookstove','renewable_energy',
    'methane','industrial_gas','engineered_removal','soil_carbon','blue_carbon'
  )),
  assessment_tier                     TEXT NOT NULL CHECK (assessment_tier IN (
    'minor','moderate','major','mega'
  )),
  assessed_annual_tco2e               REAL NOT NULL DEFAULT 0,
  high_integrity_risk_flag            INTEGER NOT NULL DEFAULT 0,

  -- 10 CCP criteria scores (0-100); NULL = not yet scored
  effective_governance_score          REAL,
  tracking_system_score               REAL,
  transparency_score                  REAL,
  robust_quantification_score         REAL,
  no_double_counting_score            REAL,
  permanence_score                    REAL,
  additionality_score                 REAL,
  sustainable_development_score       REAL,
  transition_to_net_zero_score        REAL,
  safeguards_score                    REAL,

  -- Derived label class + grant conditions
  label_class                         TEXT CHECK (label_class IN (
    'ccp_eligible','ccp_conditional','ccp_not_eligible'
  )),
  ccp_aggregate_score                 REAL,
  gap_count                           INTEGER DEFAULT 0,
  weakest_criterion                   TEXT,
  weakest_score                       REAL,
  integrity_floor_cross_flag          INTEGER NOT NULL DEFAULT 0,
  conditional_grant_flag              INTEGER NOT NULL DEFAULT 0,
  corsia_phase2_eligible_flag         INTEGER NOT NULL DEFAULT 0,
  sylvera_grade_equivalent            TEXT,
  premium_pricing_uplift_pct          REAL DEFAULT 0,
  predicted_assessment_days           INTEGER DEFAULT 0,

  -- Gates
  screened_flag                       INTEGER NOT NULL DEFAULT 0,
  eligibility_check_ok_flag           INTEGER NOT NULL DEFAULT 0,
  assessment_complete_flag            INTEGER NOT NULL DEFAULT 0,
  vvb_review_complete_flag            INTEGER NOT NULL DEFAULT 0,
  decision_made_flag                  INTEGER NOT NULL DEFAULT 0,

  -- Refs
  request_ref                         TEXT,
  screening_ref                       TEXT,
  eligibility_check_ref               TEXT,
  assessment_ref                      TEXT,
  vvb_review_ref                      TEXT,
  decision_ref                        TEXT,
  grant_ref                           TEXT,
  denial_ref                          TEXT,
  hold_ref                            TEXT,
  return_ref                          TEXT,
  dispute_ref                         TEXT,
  withdrawal_ref                      TEXT,
  regulator_ref                       TEXT,
  corsia_eligibility_ref              TEXT,

  -- Narrative
  request_basis                       TEXT,
  screening_basis                     TEXT,
  eligibility_check_basis             TEXT,
  assessment_basis                    TEXT,
  vvb_review_basis                    TEXT,
  decision_basis                      TEXT,
  grant_basis                         TEXT,
  denial_basis                        TEXT,
  hold_basis                          TEXT,
  return_basis                        TEXT,
  dispute_basis                       TEXT,
  withdrawal_basis                    TEXT,
  reason_code                         TEXT,
  conditional_grant_conditions        TEXT,
  assessment_summary                  TEXT,

  -- State + lifecycle
  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'requested','screening','eligibility_check','assessment_in_progress','vvb_review',
    'ccp_decision_pending','ccp_label_granted','on_hold','returned','disputed',
    'ccp_label_denied','withdrawn'
  )),
  requested_at                        TEXT NOT NULL,
  screening_at                        TEXT,
  eligibility_check_at                TEXT,
  assessment_in_progress_at           TEXT,
  vvb_review_at                       TEXT,
  ccp_decision_pending_at             TEXT,
  ccp_label_granted_at                TEXT,
  on_hold_at                          TEXT,
  returned_at                         TEXT,
  disputed_at                         TEXT,
  ccp_label_denied_at                 TEXT,
  withdrawn_at                        TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ccp_status      ON oe_ccp_assessments(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ccp_tier        ON oe_ccp_assessments(assessment_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ccp_project     ON oe_ccp_assessments(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ccp_sector      ON oe_ccp_assessments(sector);
CREATE INDEX IF NOT EXISTS idx_oe_ccp_label       ON oe_ccp_assessments(label_class);
CREATE INDEX IF NOT EXISTS idx_oe_ccp_requested   ON oe_ccp_assessments(requested_at);
CREATE INDEX IF NOT EXISTS idx_oe_ccp_sla         ON oe_ccp_assessments(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_ccp_assessments_events (
  id              TEXT PRIMARY KEY,
  assessment_id   TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ccp_events_a    ON oe_ccp_assessments_events(assessment_id);
CREATE INDEX IF NOT EXISTS idx_oe_ccp_events_type ON oe_ccp_assessments_events(event_type);
