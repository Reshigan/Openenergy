-- Wave 81 — IPP Project Change-Order / Variation Control & Earned-Value Management (P6).
-- The PROJECT-CONTROLS core of a best-in-class projects system. W1 gave the IPP the schedule
-- (CPM / Gantt / resource-leveling); W19 the procurement; W20 the construction-to-COD lifecycle.
-- None of them manage what every capital project lives or dies by: the CHANGE. A site condition,
-- a design change, a regulatory shift or a client request lands a variation against the approved
-- baseline — and the discipline of project controls is to quantify its cost / schedule / earned-
-- value impact, draw it against the project contingency, gate its approval on an authority tiered
-- by magnitude, and only then RE-BASELINE the plan. W81 is that missing layer.
--
-- Best-in-class systems (Primavera P6 EVM, Procore Change Management, MS Project baselines,
-- Oracle Aconex) treat change management as document-routing disconnected from EVM and from the
-- bid commitment. W81 beats them: every change order is scored LIVE against the project earned-
-- value battery (CV/SV/CPI/SPI/EAC/VAC/TCPI) and its contingency reserve, the approval authority
-- is DERIVED from the variation magnitude, and a variation that pushes the project past its
-- REIPPPP BID ENVELOPE (cost-overrun pct or COD-slip tolerance) crosses to the regulator
-- (DMRE / IPP Office) as a project-viability signal.
--
-- 12-state P6 lifecycle (8 operative + 4 terminal):
--   draft -> submitted -> screening -> impact_assessment -> pending_approval
--     -> approved -> incorporated                              (success terminal — baseline re-issued)
--   screening -> deferred (parked) -> submitted (resubmit)
--   screening / impact_assessment / pending_approval / disputed -> rejected
--   pending_approval -> disputed -> impact_assessment (resolve_dispute, re-assess)
--   any pre-approved non-terminal -> withdrawn ; any pre-incorporated non-terminal -> cancelled
--
-- Tiers (4) — VARIATION MAGNITUDE, DERIVED from abs(cost_impact_zar): minor < R1m /
-- moderate R1m-R10m / major R10m-R50m / critical >= R50m. HIGH = {major, critical}. The route
-- RE-DERIVES the tier on every transition (the magnitude IS the cost — contrast W80 where the
-- coverage tier is an explicit attribute).
--
-- SLA matrix is INVERTED — a LARGER variation gets MORE time at every state (deeper assessment,
-- EVM re-forecasting, higher approval authority). Strictly INCREASING minor->critical. Terminals 0.
--
-- Reportability — the W81 SIGNATURE is RE-BASELINE-driven: incorporate crosses for HIGH tiers
-- (re-issuing the baseline for a material variation is the notifiable bid-envelope move),
-- approve crosses for critical only, reject crosses for critical only, sla_breached crosses HIGH.
--
-- Single write {admin, ipp, ipp_developer, wind}: the project-owner side operates the chain.
-- actor_party tags whether a step is the project_manager, project_controls or the sponsor.

CREATE TABLE IF NOT EXISTS oe_project_change_orders (
  id                          TEXT PRIMARY KEY,
  co_number                   TEXT UNIQUE NOT NULL,

  -- Provenance / scope
  source_event                TEXT,
  source_entity_type          TEXT,
  source_entity_id            TEXT,
  source_wave                 TEXT,
  project_id                  TEXT,
  project_name                TEXT NOT NULL,
  participant_id              TEXT,
  participant_name            TEXT,
  contractor_name             TEXT,                  -- EPC / contractor raising the variation

  -- Change definition
  change_type                 TEXT,                  -- site_condition / design_change / scope_addition / regulatory / client_request / force_majeure
  title                       TEXT NOT NULL,
  description                 TEXT,
  variation_tier              TEXT NOT NULL CHECK (variation_tier IN (
    'minor','moderate','major','critical'
  )),

  -- Cost / schedule impact of THIS variation
  cost_impact_zar             REAL NOT NULL DEFAULT 0,
  schedule_impact_days        INTEGER NOT NULL DEFAULT 0,

  -- Baseline + earned-value snapshot
  baseline_cost_zar           REAL,
  baseline_duration_days      INTEGER,
  contingency_zar             REAL,
  contingency_drawn_zar       REAL NOT NULL DEFAULT 0,
  earned_value_zar            REAL,                  -- EV
  planned_value_zar           REAL,                  -- PV
  actual_cost_zar             REAL,                  -- AC
  budget_at_completion_zar    REAL,                  -- BAC

  -- Cumulative position (for re-baseline + bid-envelope)
  cumulative_approved_variation_zar  REAL NOT NULL DEFAULT 0,
  cumulative_approved_days           INTEGER NOT NULL DEFAULT 0,
  bid_envelope_cost_pct       REAL,                  -- REIPPPP cost-overrun tolerance (pct)
  bid_envelope_schedule_days  INTEGER,               -- REIPPPP COD-slip tolerance (days)

  -- Approval
  approval_authority          TEXT,                  -- project_manager / sponsor / board / dmre_notify
  approved_by                 TEXT,
  raised_by_party             TEXT,                  -- functional party that raised it

  reason_code                 TEXT,
  rejection_reason            TEXT,
  dispute_reason              TEXT,

  -- Refs
  submission_ref              TEXT,
  screening_ref               TEXT,
  assessment_ref              TEXT,
  approval_ref                TEXT,
  incorporation_ref           TEXT,
  deferral_ref                TEXT,
  dispute_ref                 TEXT,
  rejection_ref               TEXT,
  regulator_ref               TEXT,
  evidence_ref                TEXT,

  -- Narrative
  submission_basis            TEXT,
  screening_basis             TEXT,
  assessment_basis            TEXT,
  approval_basis              TEXT,
  incorporation_basis         TEXT,
  deferral_basis              TEXT,
  dispute_basis               TEXT,
  rejection_basis             TEXT,
  notes                       TEXT,

  -- State + lifecycle
  chain_status                TEXT NOT NULL CHECK (chain_status IN (
    'draft','submitted','screening','impact_assessment','pending_approval','approved',
    'incorporated','deferred','disputed','rejected','withdrawn','cancelled'
  )),
  draft_at                    TEXT NOT NULL,
  submitted_at                TEXT,
  screening_at                TEXT,
  impact_assessment_at        TEXT,
  pending_approval_at         TEXT,
  approved_at                 TEXT,
  incorporated_at             TEXT,
  deferred_at                 TEXT,
  disputed_at                 TEXT,
  rejected_at                 TEXT,
  withdrawn_at                TEXT,
  cancelled_at                TEXT,

  sla_deadline_at             TEXT,
  last_sla_breach_at          TEXT,
  is_reportable               INTEGER NOT NULL DEFAULT 0,
  escalation_level            INTEGER NOT NULL DEFAULT 0,

  created_by                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pco_status      ON oe_project_change_orders(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_pco_tier        ON oe_project_change_orders(variation_tier);
CREATE INDEX IF NOT EXISTS idx_oe_pco_project     ON oe_project_change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_pco_participant ON oe_project_change_orders(participant_id);
CREATE INDEX IF NOT EXISTS idx_oe_pco_type        ON oe_project_change_orders(change_type);
CREATE INDEX IF NOT EXISTS idx_oe_pco_sla         ON oe_project_change_orders(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_project_change_order_events (
  id                  TEXT PRIMARY KEY,
  co_id               TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pco_events_co   ON oe_project_change_order_events(co_id);
CREATE INDEX IF NOT EXISTS idx_oe_pco_events_type ON oe_project_change_order_events(event_type);
