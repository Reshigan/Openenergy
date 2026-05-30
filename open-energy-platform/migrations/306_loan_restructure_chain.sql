-- Wave 108 - Lender Loan Restructure & Amendment-and-Extend (A&E) /
-- Forbearance chain. 11th Lender chain. Fills the STRUCTURED-FORBEARANCE
-- gap between W38 covenant certificate (breach detection) + W86 DSCR
-- monitoring (rolling watch) and W45 default enforcement (acceleration
-- / step-in). Without W108 every breach escalates straight to
-- acceleration which kills bankability.
--
-- Beats LMA Amend & Extend templates / Fitch RestructuringRating / S&P
-- Recovery Ratings / Moody Covenant Quality Index / Reorg Research
-- RestructuringDB / Debtwire Restructuring / Crescendo Strategic
-- Advisors / Houlihan Lokey Financial Restructuring / FTI Consulting
-- Corporate Finance / AlixPartners Restructuring.
--
-- Standards: LMA Amendment & Extension template + Basel III IFRS 9
-- Stage 2/3 trigger framework + SARB Banks Act section 61 (forbearance
-- disclosure to Prudential Authority) + Companies Act section 155
-- (Compromise with creditors).
--
-- 12-state P6 lifecycle plus terminal branches:
--   trigger_event -> start_preliminary_assessment -> preliminary_assessment
--     -> draft_proposal -> restructure_proposal_drafted
--       -> submit_to_credit_committee -> lender_credit_committee_review
--         -> approve_proposal -> borrower_term_sheet_negotiation
--           -> sign_term_sheet -> term_sheet_signed
--             -> draft_documentation -> legal_documentation_drafted
--               -> launch_consent_solicitation -> consent_solicitation
--                 -> sign_amendment -> signing
--                   -> mark_effective -> effective_date
--                     -> monitor_compliance -> monitoring_period
--                       -> complete_restructure -> completed (hard terminal)
--   lender_credit_committee_review -> revise_proposal ->
--     restructure_proposal_drafted (loop)
--   lender_credit_committee_review -> reject_proposal ->
--     rejected_by_committee (terminal)
--   any pre-effective state -> abandon -> abandoned (terminal)
--   any state -> escalate_to_default -> escalated_to_default (terminal)
--
-- Tier RE-DERIVED on every transition from facility_amount_zar:
--   minor    : <R50m / bilateral
--   standard : R50m-R500m
--   material : R500m-R5b
--   systemic : >=R5b
-- FLOOR-AT-MATERIAL on any one of 5 floor flags. FLOOR-AT-SYSTEMIC on
-- 2+ flags OR public_bondholder_consent_required OR
-- sarb_large_exposure_threshold.
--
-- INVERTED SLA polarity stored as HOURS (multi-week chain). systemic
-- gets LONGEST runway. trigger_event window: minor 30d / standard 60d
-- / material 120d / systemic 180d.
--
-- SIGNATURE regulator crossings (LMA Amend & Extend + Basel III IFRS 9
-- + SARB Banks Act s61 + Companies Act s155):
--   submit_to_credit_committee -> regulator EVERY tier on systemic OR
--                                  ifrs9_stage_3_at_trigger=TRUE
--                                  (Compromise trigger = SARB notification)
--   mark_effective             -> regulator material+systemic (effective
--                                  restructure of large facility = SARB
--                                  large-exposure disclosure)
--   escalate_to_default        -> regulator EVERY tier (W108 SIGNATURE -
--                                  failed restructure feeding W45
--                                  universally reportable)
--   launch_consent_solicitation-> regulator strategic only when
--                                  public_bondholder_consent_required
--   sla_breached               -> material+systemic
--
-- Write {admin, lender}. Read all 9 personas. actor_party derived from
-- action: lender / borrower / syndicate_member.

CREATE TABLE IF NOT EXISTS oe_loan_restructure (
  id                                                  TEXT PRIMARY KEY,
  restructure_number                                  TEXT UNIQUE NOT NULL,

  facility_id                                         TEXT NOT NULL,
  facility_name                                       TEXT,
  borrower_id                                         TEXT NOT NULL,
  borrower_name                                       TEXT,
  lender_agent_id                                     TEXT NOT NULL,
  lender_agent_name                                   TEXT,
  project_id                                          TEXT,
  project_name                                        TEXT,
  syndicate_size                                      INTEGER NOT NULL DEFAULT 1,

  facility_amount_zar                                 REAL NOT NULL DEFAULT 0,
  outstanding_debt_zar                                REAL NOT NULL DEFAULT 0,
  debt_service_per_month_zar                          REAL NOT NULL DEFAULT 0,

  trigger_reason_code                                 TEXT,
  trigger_narrative                                   TEXT,
  covenant_breach_ref                                 TEXT,
  dscr_shortfall_ref                                  TEXT,
  default_chain_ref                                   TEXT,

  forbearance_period_months                           INTEGER NOT NULL DEFAULT 0,
  principal_reschedule_zar                            REAL NOT NULL DEFAULT 0,
  principal_reschedule_pct                            REAL NOT NULL DEFAULT 0,
  maturity_extension_months                           INTEGER NOT NULL DEFAULT 0,
  equity_cure_quantum_zar                             REAL NOT NULL DEFAULT 0,
  proposed_relief_zar                                 REAL NOT NULL DEFAULT 0,

  consent_severity                                    TEXT CHECK (consent_severity IN (
    'simple_majority','special_majority','super_majority','unanimity'
  )),
  consent_threshold_pct                               REAL NOT NULL DEFAULT 50,
  consent_majority_pct                                REAL NOT NULL DEFAULT 0,
  syndicate_consented                                 INTEGER NOT NULL DEFAULT 0,
  consent_deadline_at                                 TEXT,
  consent_majority_passed                             INTEGER NOT NULL DEFAULT 0,

  cross_border_syndicate                              INTEGER NOT NULL DEFAULT 0,
  sustainability_linked_loan                          INTEGER NOT NULL DEFAULT 0,
  public_bondholder_consent_required                  INTEGER NOT NULL DEFAULT 0,
  ifrs9_stage_3_at_trigger                            INTEGER NOT NULL DEFAULT 0,
  sarb_large_exposure_threshold                       INTEGER NOT NULL DEFAULT 0,
  was_on_watch_at_trigger                             INTEGER NOT NULL DEFAULT 0,
  ifrs9_stage_at_trigger                              INTEGER NOT NULL DEFAULT 1,

  current_tier                                        TEXT NOT NULL CHECK (current_tier IN (
    'minor','standard','material','systemic'
  )),
  authority_required                                  TEXT CHECK (authority_required IN (
    'relationship_manager','credit_committee','portfolio_director','CRO','board_credit_subcommittee'
  )),
  board_escalation_required                           INTEGER NOT NULL DEFAULT 0,
  urgency_band                                        TEXT,
  restructure_completeness_index                      INTEGER NOT NULL DEFAULT 0,

  title                                               TEXT,
  narrative                                           TEXT,
  reason_code                                         TEXT,
  cancel_reason                                       TEXT,
  rejection_reason                                    TEXT,
  abandon_reason                                      TEXT,
  escalation_reason                                   TEXT,

  current_ball_in_court_party                         TEXT,
  last_responder_party                                TEXT,

  is_reportable                                       INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                                  INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                               TEXT,

  chain_status                                        TEXT NOT NULL CHECK (chain_status IN (
    'trigger_event','preliminary_assessment','restructure_proposal_drafted',
    'lender_credit_committee_review','borrower_term_sheet_negotiation',
    'term_sheet_signed','legal_documentation_drafted','consent_solicitation',
    'signing','effective_date','monitoring_period','completed',
    'rejected_by_committee','abandoned','escalated_to_default'
  )),
  trigger_event_at                                    TEXT,
  preliminary_assessment_at                           TEXT,
  restructure_proposal_drafted_at                     TEXT,
  lender_credit_committee_review_at                   TEXT,
  borrower_term_sheet_negotiation_at                  TEXT,
  term_sheet_signed_at                                TEXT,
  legal_documentation_drafted_at                      TEXT,
  consent_solicitation_at                             TEXT,
  signing_at                                          TEXT,
  effective_date_at                                   TEXT,
  monitoring_period_at                                TEXT,
  completed_at                                        TEXT,
  rejected_by_committee_at                            TEXT,
  abandoned_at                                        TEXT,
  escalated_to_default_at                             TEXT,

  regulator_crossed_at                                TEXT,
  regulator_inbox_ref                                 TEXT,
  regulator_ref                                       TEXT,
  sla_target_hours                                    INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                                     TEXT,
  last_sla_breach_at                                  TEXT,
  sla_breached                                        INTEGER NOT NULL DEFAULT 0,
  escalation_level                                    INTEGER NOT NULL DEFAULT 0,

  tenant_id                                           TEXT,
  created_by                                          TEXT NOT NULL,
  created_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_lrs_status        ON oe_loan_restructure(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_tier          ON oe_loan_restructure(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_tenant        ON oe_loan_restructure(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_facility      ON oe_loan_restructure(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_borrower      ON oe_loan_restructure(borrower_id);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_lender        ON oe_loan_restructure(lender_agent_id);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_sla           ON oe_loan_restructure(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_breached      ON oe_loan_restructure(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_reportable    ON oe_loan_restructure(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_consent       ON oe_loan_restructure(consent_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_covenant_ref  ON oe_loan_restructure(covenant_breach_ref);

CREATE TABLE IF NOT EXISTS oe_loan_restructure_events (
  id                  TEXT PRIMARY KEY,
  restructure_id      TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_lrs_events_rid    ON oe_loan_restructure_events(restructure_id);
CREATE INDEX IF NOT EXISTS idx_oe_lrs_events_type   ON oe_loan_restructure_events(event_type);
