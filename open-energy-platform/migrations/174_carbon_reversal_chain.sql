-- Wave 42 — Carbon Reversal / Buffer-Pool & Permanence Management chain.
-- The back-end integrity safeguard of the carbon-credit lifecycle. Where W37
-- registers a project, W11 verifies its reductions (MRV) and W17 retires the
-- resulting credits, THIS chain handles what happens when previously-issued
-- credits are REVERSED — sequestered carbon released back to atmosphere
-- (wildfire, drought/pest mortality, illegal logging, project failure). A
-- reversal is a loss against credits already in the market, so the registry
-- must make the market whole.
--
-- Frameworks: Verra VCS AFOLU Non-Permanence Risk Tool + buffer pool; Gold
-- Standard; Paris Agreement Article 6.4 permanence + reversal rules.
--
-- 12-state P6 lifecycle (two resolution paths diverge at loss_quantified):
--   reversal_reported → under_assessment → loss_quantified →
--     [buffer]  buffer_cancellation_proposed → buffer_cancelled →
--               remediation_verified → closed         (UNINTENTIONAL — buffer absorbs)
--     [replace] replacement_required → replacement_submitted →
--               replacement_verified → closed          (INTENTIONAL / proponent-at-fault)
--   escalate branch: under_assessment|loss_quantified|replacement_required → escalated
--   false_alarm branch: reversal_reported|under_assessment → false_alarm
--
-- Tiers (reversal magnitude — drive urgency + reportability):
--   catastrophic — total / large permanent loss, project-termination risk; tightest
--   significant  — material partial loss
--   minor        — small recoverable loss; loosest
--
-- URGENT SLA: the larger the reversal, the TIGHTER every window.
--
-- Write model: single carbon-fund desk {admin, support, carbon_fund} (same as
-- W37 registration). actor_party records the CONTRACTUAL function performing
-- each step (proponent / vvb / registry / authority) for audit attribution.
--
-- Reportability: escalate (total reversal / fraud / termination) AND
-- require_replacement (an intentional reversal is always a market-integrity
-- event) cross the regulator inbox for EVERY tier; close + sla_breached cross
-- for material tiers (catastrophic + significant). Minor unintentional reversals
-- are routine buffer accounting and stay internal.
--
-- Cross-wave provenance via source_event/source_entity_type/source_entity_id/
-- source_wave (a reversal arises against a W37-registered / W11-verified project).

CREATE TABLE IF NOT EXISTS oe_carbon_reversals (
  id                            TEXT PRIMARY KEY,
  reversal_number               TEXT UNIQUE NOT NULL,

  -- Provenance (the registered / crediting project the reversal hit)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Carbon project identity
  project_party_id              TEXT NOT NULL,
  project_party_name            TEXT NOT NULL,
  vvb_name                      TEXT,
  project_name                  TEXT NOT NULL,
  project_tier                  TEXT,              -- afolu_redd / large_scale / small_scale
  standard                      TEXT,              -- verra_vcs / gold_standard / article6
  methodology                   TEXT,
  province                      TEXT,
  host_country                  TEXT,
  registered_project_ref        TEXT,              -- the W37 registry id / project number
  credit_serial_block           TEXT,              -- issued serial block affected

  -- Reversal characterisation
  reversal_cause                TEXT,              -- wildfire / drought / pest_disease / illegal_logging / project_failure / non_compliance
  reversal_type                 TEXT NOT NULL CHECK (reversal_type IN (
    'unintentional', 'intentional'
  )),
  reversal_tier                 TEXT NOT NULL CHECK (reversal_tier IN (
    'catastrophic', 'significant', 'minor'
  )),
  reversed_tco2e                INTEGER NOT NULL DEFAULT 0,   -- magnitude of the loss
  buffer_cancelled_tco2e        INTEGER NOT NULL DEFAULT 0,   -- buffer credits cancelled (buffer path)
  replacement_tco2e             INTEGER NOT NULL DEFAULT 0,   -- credits replaced (replacement path)

  -- Refs
  buffer_pool_ref               TEXT,              -- shared buffer-pool ledger ref
  replacement_serial_block      TEXT,              -- serial block of replacement credits
  reversal_ref                  TEXT,              -- registry reversal-event id
  regulator_ref                 TEXT,              -- regulator notification ref

  -- Narrative
  reversal_summary              TEXT,
  assessment_basis              TEXT,
  quantification_basis          TEXT,
  buffer_basis                  TEXT,
  remediation_basis             TEXT,
  replacement_basis             TEXT,
  verification_basis            TEXT,
  reason_code                   TEXT,
  closure_notes                 TEXT,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'reversal_reported','under_assessment','loss_quantified',
    'buffer_cancellation_proposed','buffer_cancelled','remediation_verified',
    'replacement_required','replacement_submitted','replacement_verified',
    'closed','escalated','false_alarm'
  )),
  reversal_reported_at          TEXT NOT NULL,
  under_assessment_at           TEXT,
  loss_quantified_at            TEXT,
  buffer_cancellation_proposed_at TEXT,
  buffer_cancelled_at           TEXT,
  remediation_verified_at       TEXT,
  replacement_required_at       TEXT,
  replacement_submitted_at      TEXT,
  replacement_verified_at       TEXT,
  closed_at                     TEXT,
  escalated_at                  TEXT,
  false_alarm_at                TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_crev_status  ON oe_carbon_reversals(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_crev_tier    ON oe_carbon_reversals(reversal_tier);
CREATE INDEX IF NOT EXISTS idx_oe_crev_type    ON oe_carbon_reversals(reversal_type);
CREATE INDEX IF NOT EXISTS idx_oe_crev_party   ON oe_carbon_reversals(project_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_crev_project ON oe_carbon_reversals(project_name);
CREATE INDEX IF NOT EXISTS idx_oe_crev_reported ON oe_carbon_reversals(reversal_reported_at);
CREATE INDEX IF NOT EXISTS idx_oe_crev_sla     ON oe_carbon_reversals(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_carbon_reversals_events (
  id              TEXT PRIMARY KEY,
  reversal_id     TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_crev_events_rev  ON oe_carbon_reversals_events(reversal_id);
CREATE INDEX IF NOT EXISTS idx_oe_crev_events_type ON oe_carbon_reversals_events(event_type);
