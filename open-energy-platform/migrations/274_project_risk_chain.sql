-- Wave 92 — IPP Project Risk Register & Quantitative Schedule-Risk Analysis (P6).
-- The PROJECT-RISK-MANAGEMENT core of a best-in-class projects system. W1 gave the
-- IPP the schedule baseline (CPM / Gantt); W19/W20 gave it procurement and
-- construction-to-COD; W81 gave it change-control + EVM. W92 fills the gap every
-- real capital project relies on next — and that most platforms do badly:
-- QUANTIFYING risk via probability × impact, expected-monetary-value (EMV),
-- triangular Monte-Carlo cost & schedule risk analysis (SRA), and contingency
-- drawdown traceability against the REIPPPP bid envelope.
--
-- DISTINCTIVE move (beat Acumen Fuse Risk / Primavera Risk Analysis (PRA) /
-- Safran Risk / Palisade @Risk / Crystal Ball / Deltek Acumen Risk / Riskonnect /
-- Predict! / Synergi Life / Active Risk Manager — all of which treat the risk
-- register as a static spreadsheet disconnected from EVM and from the bid
-- envelope): every risk record is LIVE-scored on every fetch against a P50/P80
-- EMV battery, residual EMV after planned response, contingency drawdown vs
-- project_reserve, and a bid-envelope-breach %.
--
-- 12-state P6 lifecycle:
--   identified -> assessed -> quantified -> response_planned -> response_active
--     -> monitoring -> closed                                          (terminal)
--   accepted          — sponsor accepts as-is (terminal).
--   realized          — risk event has occurred; -> closed / escalated.
--   escalated         — material residual; reanalyze -> quantified.
--   withdrawn         — raiser pulls it (terminal).
--   cancelled         — admin-only soft-cancel (terminal).
--
-- Tier — EMV-DERIVED on every transition from probability_pct × |worst_case_zar|
--   low <R500k / moderate R500k-R5m / high R5m-R50m / critical >=R50m.
--   FLOOR-AT-HIGH for risk_class IN (force_majeure, regulatory_change, strategic).
--
-- INVERTED SLA: the LARGER the EMV, the LONGER each window (deeper Monte-Carlo,
--   board review, external-advisor consultation). Same family as W19/W20/W43/
--   W49/W56/W70/W81/W82/W91. Strictly INCREASING low->critical at every state.
--
-- Reportability (the W92 SIGNATURE is REALIZATION-driven):
--   realize_risk + risk_class IN (force_majeure, regulatory_change) crosses
--                regulator EVERY tier — the W92 SIGNATURE hard line (sister of
--                W45 write_off / W77 declare_breach / W68 declare_default /
--                W86 declare_acceleration / W89 cancel_campaign / W90 terminate /
--                W91 deny_ccp_label).
--   realize_risk on other classes crosses HIGH tiers (high / critical).
--   escalate     crosses HIGH tiers.
--   accept_risk  crosses critical only (accepting critical = governance event).
--   close_risk   crosses critical + realized only (post-event close-out).
--   sla_breached crosses HIGH tiers only.
--
-- Single project-owner write {admin, ipp, ipp_developer, wind}. actor_party
-- (project_manager / risk_owner / project_controls / sponsor) records the
-- functional owner per step (NOT an access split).

CREATE TABLE IF NOT EXISTS oe_project_risks (
  id                                  TEXT PRIMARY KEY,
  risk_number                         TEXT UNIQUE NOT NULL,

  -- Provenance
  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,

  -- Project identity
  project_id                          TEXT NOT NULL,
  project_name                        TEXT,
  reipppp_bid_window                  TEXT,
  facility_id                         TEXT,
  facility_name                       TEXT,
  risk_owner_party_id                 TEXT,
  risk_owner_party_name               TEXT,
  raised_by_party_id                  TEXT,
  raised_by_party_name                TEXT,

  -- Classification
  risk_class                          TEXT NOT NULL CHECK (risk_class IN (
    'cost_overrun','schedule_slip','resource_constraint','design_change',
    'procurement_lead_time','site_conditions','subcontractor_default',
    'safety','environmental','force_majeure','regulatory_change',
    'strategic','financial_market','technology'
  )),
  risk_category                       TEXT,
  risk_title                          TEXT,
  risk_description                    TEXT,
  risk_tier                           TEXT NOT NULL CHECK (risk_tier IN (
    'low','moderate','high','critical'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'project_manager','risk_owner','sponsor','board','dmre_notify'
  )),

  -- Qualitative scoring (PMBOK 7 / ISO 31000) — 1-5 P x I matrix
  probability_pct                     REAL NOT NULL DEFAULT 0,
  probability_band                    INTEGER,
  worst_case_cost_impact_zar          REAL NOT NULL DEFAULT 0,
  worst_case_schedule_impact_days     INTEGER NOT NULL DEFAULT 0,
  impact_band                         INTEGER,

  -- Quantitative SRA inputs (triangular: optimistic / most-likely / pessimistic)
  cost_optimistic_zar                 REAL,
  cost_most_likely_zar                REAL,
  cost_pessimistic_zar                REAL,
  schedule_optimistic_days            INTEGER,
  schedule_most_likely_days           INTEGER,
  schedule_pessimistic_days           INTEGER,

  -- Stored derived (the rest — p50/p80/bid_envelope/contingency_drawdown — are
  -- LIVE on fetch from inputs; D1 100-col limit per table).
  emv_zar                             REAL,
  residual_emv_zar                    REAL,
  integrity_floor_applied_flag        INTEGER NOT NULL DEFAULT 0,

  -- Response (PMBOK strategies: avoid / transfer / mitigate / accept / exploit /
  -- share / enhance)
  response_strategy                   TEXT,
  response_action                     TEXT,
  response_effectiveness_pct          REAL,
  response_owner                      TEXT,
  response_due_at                     TEXT,
  response_complete_flag              INTEGER NOT NULL DEFAULT 0,

  -- Contingency / reserve linkage
  contingency_drawn_zar               REAL NOT NULL DEFAULT 0,
  total_contingency_zar               REAL NOT NULL DEFAULT 0,
  bid_envelope_zar                    REAL NOT NULL DEFAULT 0,

  -- Realization (when realize_risk fires)
  realized_flag                       INTEGER NOT NULL DEFAULT 0,
  realized_cost_zar                   REAL,
  realized_schedule_days              INTEGER,
  realized_basis                      TEXT,

  -- Gates
  assessed_flag                       INTEGER NOT NULL DEFAULT 0,
  quantified_flag                     INTEGER NOT NULL DEFAULT 0,
  response_planned_flag               INTEGER NOT NULL DEFAULT 0,
  monitoring_flag                     INTEGER NOT NULL DEFAULT 0,

  -- Refs
  assess_ref                          TEXT,
  quantify_ref                        TEXT,
  response_plan_ref                   TEXT,
  response_active_ref                 TEXT,
  monitor_ref                         TEXT,
  realize_ref                         TEXT,
  close_ref                           TEXT,
  accept_ref                          TEXT,
  escalate_ref                        TEXT,
  reanalyze_ref                       TEXT,
  withdraw_ref                        TEXT,
  regulator_ref                       TEXT,

  -- Narrative
  assess_basis                        TEXT,
  quantify_basis                      TEXT,
  response_plan_basis                 TEXT,
  response_active_basis               TEXT,
  close_basis                         TEXT,
  escalate_basis                      TEXT,
  reason_code                         TEXT,
  response_summary                    TEXT,

  -- State + lifecycle
  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'identified','assessed','quantified','response_planned','response_active',
    'monitoring','realized','closed','accepted','escalated','withdrawn','cancelled'
  )),
  identified_at                       TEXT NOT NULL,
  assessed_at                         TEXT,
  quantified_at                       TEXT,
  response_planned_at                 TEXT,
  response_active_at                  TEXT,
  monitoring_at                       TEXT,
  realized_at                         TEXT,
  closed_at                           TEXT,
  accepted_at                         TEXT,
  escalated_at                        TEXT,
  withdrawn_at                        TEXT,
  cancelled_at                        TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_prj_risk_status     ON oe_project_risks(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_prj_risk_tier       ON oe_project_risks(risk_tier);
CREATE INDEX IF NOT EXISTS idx_oe_prj_risk_project    ON oe_project_risks(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_prj_risk_class      ON oe_project_risks(risk_class);
CREATE INDEX IF NOT EXISTS idx_oe_prj_risk_identified ON oe_project_risks(identified_at);
CREATE INDEX IF NOT EXISTS idx_oe_prj_risk_sla        ON oe_project_risks(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_prj_risk_owner      ON oe_project_risks(risk_owner_party_id);

CREATE TABLE IF NOT EXISTS oe_project_risks_events (
  id            TEXT PRIMARY KEY,
  risk_id       TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  actor_id      TEXT,
  actor_party   TEXT,
  notes         TEXT,
  payload       TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_prj_risk_events_r    ON oe_project_risks_events(risk_id);
CREATE INDEX IF NOT EXISTS idx_oe_prj_risk_events_type ON oe_project_risks_events(event_type);
