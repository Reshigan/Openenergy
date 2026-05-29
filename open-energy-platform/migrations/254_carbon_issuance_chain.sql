-- Wave 82 — Carbon Credit Issuance & Serialization chain (P6).
-- The MINTING step of the carbon-credit lifecycle. After a monitoring period has been
-- verified (W11) and the project is in good standing (W37/W56), the registry serializes
-- the verified reductions into a unique serial-number block and credits the proponent's
-- holding account. This chain governs that minting workflow — completeness screening,
-- MRV cross-check, buffer-pool deduction (AFOLU), serial-number assignment, registry
-- submission, and the final credit-into-account event. It is the missing piece between
-- MRV verification (W11) and retirement (W17): W37 registers the project, W11 verifies a
-- monitoring period, W56 re-validates, W42 handles buffer-pool reversals, W17 retires
-- issued credits; W82 ACTUALLY MINTS the credits into the registry.
--
-- The DISTINCTIVE move (beat best-in-class — Verra Registry on APX, Gold Standard Impact
-- Registry, S&P Global / IHS Markit Environmental Registry, Cercarbono, Puro.earth — all
-- of which run essentially linear issuance workflows with manual integrity checks): live
-- calculated integrity guards on every record — serial-block transparency, buffer-pool
-- maths, project+vintage cumulative headroom, double-issuance / over-issuance flags, and
-- Article-6 corresponding-adjustment binding — all derived from the same inputs each
-- transition.
--
-- 12-state P6 lifecycle:
--   requested -> screening -> verification_check -> serialization -> pending_registry
--     -> issued                                                          (clean path)
--   on_hold     — paused for integrity flag (double-issuance / overlap); resumes to
--                 screening.
--   returned    — deficiency at verification_check / serialization; resubmit -> screening.
--   disputed    — serial / quantum dispute on pending_registry; resolve -> serialization.
--   rejected    — failed pre-issuance. Terminal.
--   withdrawn   — proponent pulls before issued. Terminal.
--   cancelled   — admin cancels before issued. Terminal.
--
-- Tiers — by REQUESTED QUANTITY (tCO2e): minor <10k / moderate <100k / major <500k /
--   mega >=500k. Article 6 transfer (corresponding adjustment required) floors at major.
--
-- INVERTED SLA: the LARGER the issuance, the LONGER every window (deeper diligence);
--   a minor issuance gets the shortest fast-track window. Same family as W56/W65/W73.
--
-- Reportability (the W82 SIGNATURE is INTEGRITY-driven):
--   raise_dispute crosses for EVERY tier — a serial / quantum dispute is ALWAYS
--                 reportable to the registry oversight authority (W82 SIGNATURE).
--   confirm_issuance crosses for EVERY tier when CA required, else for large+mega.
--   reject + sla_breached cross for large+mega (major + mega).
--
-- Single carbon-fund desk write {admin, carbon_fund} (same single-party model as W37/W11/
-- W17/W42/W48/W56/W65/W73). actor_party (proponent / registry / vvb / dna) records the
-- functional owner per step, not the JWT role.

CREATE TABLE IF NOT EXISTS oe_carbon_issuances (
  id                              TEXT PRIMARY KEY,
  issuance_number                 TEXT UNIQUE NOT NULL,

  -- Provenance (the W11 MRV / W37 registration / W56 crediting renewal that generated demand)
  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  -- Project + vintage identity
  project_id                      TEXT NOT NULL,
  project_name                    TEXT,
  registry_standard               TEXT,
  methodology_id                  TEXT,
  proponent_party_id              TEXT,
  proponent_party_name            TEXT,
  registry_account_id             TEXT,
  vvb_name                        TEXT,
  dna_name                        TEXT,
  host_country                    TEXT,

  -- Classification
  transfer_type                   TEXT NOT NULL CHECK (transfer_type IN (
    'article6','voluntary','compliance'
  )),
  category                        TEXT NOT NULL CHECK (category IN (
    'afolu','energy','engineered','waste'
  )),
  issuance_tier                   TEXT NOT NULL CHECK (issuance_tier IN (
    'minor','moderate','major','mega'
  )),
  requested_tco2e                 REAL NOT NULL DEFAULT 0,    -- drives the tier
  requires_corresponding_adjustment INTEGER NOT NULL DEFAULT 0,
  corresponding_adjustment_ref    TEXT,
  ca_applied_flag                 INTEGER NOT NULL DEFAULT 0,

  -- Vintage + monitoring period
  vintage_year                    INTEGER,
  monitoring_period_start         TEXT,
  monitoring_period_end           TEXT,
  vintage_monitoring_key          TEXT,                       -- project::vintage::period

  -- Verification + headroom
  verified_tco2e                  REAL DEFAULT 0,             -- from W11 MRV statement
  already_issued_tco2e            REAL DEFAULT 0,             -- cumulative for project+vintage
  buffer_pct                      REAL DEFAULT 0,             -- 0..1
  buffer_contribution_tco2e       REAL DEFAULT 0,
  net_issuable_tco2e              REAL DEFAULT 0,
  project_vintage_headroom_tco2e  REAL DEFAULT 0,
  over_issuance_flag              INTEGER NOT NULL DEFAULT 0,
  double_issuance_guard_ok        INTEGER NOT NULL DEFAULT 1,
  predicted_issuance_days         INTEGER DEFAULT 0,

  -- Serial block
  serial_block_start              INTEGER,
  serial_block_end                INTEGER,
  serial_block_size               INTEGER,
  serial_number_prefix            TEXT,

  -- Gates
  screened_flag                   INTEGER NOT NULL DEFAULT 0,
  verification_check_ok_flag      INTEGER NOT NULL DEFAULT 0,
  serials_assigned_flag           INTEGER NOT NULL DEFAULT 0,
  submitted_to_registry_flag      INTEGER NOT NULL DEFAULT 0,
  issued_flag                     INTEGER NOT NULL DEFAULT 0,

  -- Refs
  request_ref                     TEXT,
  screening_ref                   TEXT,
  verification_check_ref          TEXT,
  serialization_ref               TEXT,
  registry_submission_ref         TEXT,
  issuance_ref                    TEXT,
  hold_ref                        TEXT,
  return_ref                      TEXT,
  dispute_ref                     TEXT,
  rejection_ref                   TEXT,
  withdrawal_ref                  TEXT,
  cancellation_ref                TEXT,
  regulator_ref                   TEXT,

  -- Narrative
  request_basis                   TEXT,
  screening_basis                 TEXT,
  verification_check_basis        TEXT,
  serialization_basis             TEXT,
  registry_submission_basis       TEXT,
  issuance_basis                  TEXT,
  hold_basis                      TEXT,
  return_basis                    TEXT,
  dispute_basis                   TEXT,
  rejection_basis                 TEXT,
  withdrawal_basis                TEXT,
  cancellation_basis              TEXT,
  reason_code                     TEXT,
  issuance_summary                TEXT,

  -- State + lifecycle
  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'requested','screening','verification_check','serialization','pending_registry',
    'issued','on_hold','returned','disputed','rejected','withdrawn','cancelled'
  )),
  requested_at                    TEXT NOT NULL,
  screening_at                    TEXT,
  verification_check_at           TEXT,
  serialization_at                TEXT,
  pending_registry_at             TEXT,
  issued_at                       TEXT,
  on_hold_at                      TEXT,
  returned_at                     TEXT,
  disputed_at                     TEXT,
  rejected_at                     TEXT,
  withdrawn_at                    TEXT,
  cancelled_at                    TEXT,

  is_reportable                   INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,

  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cis_status        ON oe_carbon_issuances(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_cis_tier          ON oe_carbon_issuances(issuance_tier);
CREATE INDEX IF NOT EXISTS idx_oe_cis_project       ON oe_carbon_issuances(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_cis_transfer      ON oe_carbon_issuances(transfer_type);
CREATE INDEX IF NOT EXISTS idx_oe_cis_category      ON oe_carbon_issuances(category);
CREATE INDEX IF NOT EXISTS idx_oe_cis_vintage       ON oe_carbon_issuances(vintage_year);
CREATE INDEX IF NOT EXISTS idx_oe_cis_vmk           ON oe_carbon_issuances(vintage_monitoring_key);
CREATE INDEX IF NOT EXISTS idx_oe_cis_requested     ON oe_carbon_issuances(requested_at);
CREATE INDEX IF NOT EXISTS idx_oe_cis_sla           ON oe_carbon_issuances(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_carbon_issuances_events (
  id                 TEXT PRIMARY KEY,
  issuance_id        TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_cis_events_i    ON oe_carbon_issuances_events(issuance_id);
CREATE INDEX IF NOT EXISTS idx_oe_cis_events_type ON oe_carbon_issuances_events(event_type);
