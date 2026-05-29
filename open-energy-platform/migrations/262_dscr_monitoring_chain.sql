-- Wave 86 — Lender DSCR (Debt-Service-Coverage-Ratio) Monitoring & Cure (P6).
-- The COVERAGE-DEFENSE engine of the project-finance loan book. Every facility
-- agreement carries a periodic ratio test (DSCR / LLCR / PLCR) on each test
-- date — typically quarterly. The agent bank assembles project cash flows +
-- scheduled debt service, computes the ratios, certifies the period clean if
-- the test passes, or routes the project through a structured CURE lifecycle
-- if it does not. A persistent breach trips distribution lock-up; failure to
-- cure triggers acceleration (hand-off to W45 default chain).
--
-- 12-state P6 lifecycle:
--   period_open -> data_collected -> computed -> certified_clean        (clean terminal)
--   computed -> watch -> (certify_clean | record_breach)
--   computed -> breach_recorded
--   breach_recorded -> enter_lock_up -> lock_up
--   breach_recorded -> propose_cure -> cure_proposed
--   cure_proposed -> execute_cure -> cure_in_progress
--   cure_in_progress -> validate_cure -> cure_validated -> certify_clean (clean terminal)
--   cure_in_progress -> fail_cure -> accelerated                        (terminal — W45)
--   lock_up -> propose_cure -> cure_proposed (cure path)
--   lock_up -> declare_acceleration -> accelerated                      (terminal — W45)
--   breach_recorded -> waive_breach -> waived                           (terminal)
--
-- Tier RE-DERIVED on every transition from the current measured DSCR:
--   minor    DSCR >= 1.30   (above headroom comfort)
--   standard 1.20 <= < 1.30 (watch zone)
--   material 1.00 <= < 1.20 (breach but solvent)
--   severe   DSCR < 1.00    (under water — debt service > cash)
--
-- URGENT SLA — lower DSCR = tighter every window. Mirror of W77 reserve-account,
-- W85 settlement-fail, W34/W50/W67/W75/W84 family.
--
-- Reportability (COVERAGE-DEFENSE signature — W86 hard line):
--   declare_acceleration crosses EVERY tier  — IFRS 9 Stage 3 trigger.
--   waive_breach         material + severe   — forbearance disclosure.
--   enter_lock_up        material + severe   — distribution lock-up notice.
--   sla_breached         material + severe.
--
-- Write {admin, lender}. actor_party tags the function performing each step
-- (lender_agent / borrower_sponsor / independent_engineer) for audit
-- attribution only, NOT access.

CREATE TABLE IF NOT EXISTS oe_dscr_monitoring (
  id                              TEXT PRIMARY KEY,
  monitoring_number               TEXT UNIQUE NOT NULL,

  source_event                    TEXT,
  source_entity_type              TEXT,
  source_entity_id                TEXT,
  source_wave                     TEXT,

  facility_id                     TEXT NOT NULL,
  facility_name                   TEXT NOT NULL,
  project_id                      TEXT NOT NULL,
  project_name                    TEXT NOT NULL,
  borrower_id                     TEXT NOT NULL,
  borrower_name                   TEXT NOT NULL,
  lender_agent_id                 TEXT NOT NULL,
  lender_agent_name               TEXT NOT NULL,

  test_period_label               TEXT NOT NULL,
  test_period_start               TEXT NOT NULL,
  test_period_end                 TEXT NOT NULL,
  test_date                       TEXT NOT NULL,

  -- Threshold matrix (from the facility agreement)
  pass_threshold                  REAL NOT NULL DEFAULT 1.30,
  lockup_threshold                REAL NOT NULL DEFAULT 1.20,
  default_floor                   REAL NOT NULL DEFAULT 1.00,
  equity_cure_cap_multiple        REAL NOT NULL DEFAULT 1.0,

  -- Measured ratios
  current_dscr                    REAL,
  forward_dscr_p12m               REAL,
  backward_dscr_12m               REAL,
  llcr_value                      REAL,
  plcr_value                      REAL,

  -- Cash-flow inputs (ZAR)
  cfads_period_zar                REAL NOT NULL DEFAULT 0,
  debt_service_period_zar         REAL NOT NULL DEFAULT 0,
  shortfall_zar                   REAL NOT NULL DEFAULT 0,
  outstanding_debt_zar            REAL NOT NULL DEFAULT 0,
  npv_loan_life_zar               REAL NOT NULL DEFAULT 0,
  npv_project_life_zar            REAL NOT NULL DEFAULT 0,

  -- Cure inputs
  equity_cure_available_zar       REAL NOT NULL DEFAULT 0,
  dsra_balance_zar                REAL NOT NULL DEFAULT 0,
  proposed_cure_amount_zar        REAL NOT NULL DEFAULT 0,
  executed_cure_amount_zar        REAL NOT NULL DEFAULT 0,

  -- Sister-loan + cross-default
  sister_loan_id                  TEXT,
  sister_loan_dscr                REAL,

  -- Tier (RE-DERIVED)
  dscr_tier                       TEXT NOT NULL CHECK (dscr_tier IN ('minor','standard','material','severe')),
  is_systemic_carrier             INTEGER NOT NULL DEFAULT 0,

  -- Trend (annualised; negative = deteriorating)
  annual_trend                    REAL NOT NULL DEFAULT 0,

  -- Lifecycle flags
  watch_flag                      INTEGER NOT NULL DEFAULT 0,
  breach_flag                     INTEGER NOT NULL DEFAULT 0,
  lock_up_flag                    INTEGER NOT NULL DEFAULT 0,
  cure_proposed_flag              INTEGER NOT NULL DEFAULT 0,
  cure_executing_flag             INTEGER NOT NULL DEFAULT 0,
  cure_validated_flag             INTEGER NOT NULL DEFAULT 0,
  accelerated_flag                INTEGER NOT NULL DEFAULT 0,
  waived_flag                     INTEGER NOT NULL DEFAULT 0,

  -- Refs
  last_action_ref                 TEXT,
  regulator_ref                   TEXT,
  chain_basis                     TEXT,
  reason_code                     TEXT,
  monitoring_summary              TEXT,

  -- State machine
  chain_status                    TEXT NOT NULL CHECK (chain_status IN (
    'period_open','data_collected','computed','certified_clean',
    'watch','breach_recorded','cure_proposed','cure_in_progress',
    'cure_validated','lock_up','accelerated','waived'
  )),
  period_open_at                  TEXT NOT NULL,
  data_collected_at               TEXT,
  computed_at                     TEXT,
  certified_clean_at              TEXT,
  watch_at                        TEXT,
  breach_recorded_at              TEXT,
  cure_proposed_at                TEXT,
  cure_in_progress_at             TEXT,
  cure_validated_at               TEXT,
  lock_up_at                      TEXT,
  accelerated_at                  TEXT,
  waived_at                       TEXT,

  -- Audit / SLA
  is_reportable                   INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                 TEXT,
  last_sla_breach_at              TEXT,
  escalation_level                INTEGER NOT NULL DEFAULT 0,

  created_by                      TEXT NOT NULL,
  created_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_dscr_monitoring_status     ON oe_dscr_monitoring(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_dscr_monitoring_tier       ON oe_dscr_monitoring(dscr_tier);
CREATE INDEX IF NOT EXISTS idx_oe_dscr_monitoring_facility   ON oe_dscr_monitoring(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_dscr_monitoring_project    ON oe_dscr_monitoring(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_dscr_monitoring_borrower   ON oe_dscr_monitoring(borrower_id);
CREATE INDEX IF NOT EXISTS idx_oe_dscr_monitoring_reportable ON oe_dscr_monitoring(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_dscr_monitoring_sla        ON oe_dscr_monitoring(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_dscr_monitoring_events (
  id                 TEXT PRIMARY KEY,
  monitoring_id      TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_dscr_events_m    ON oe_dscr_monitoring_events(monitoring_id);
CREATE INDEX IF NOT EXISTS idx_oe_dscr_events_type ON oe_dscr_monitoring_events(event_type);
