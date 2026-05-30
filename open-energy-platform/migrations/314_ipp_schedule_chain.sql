-- Wave 112 - IPP WBS & Gantt Schedule Management chain. 7th IPP chain
-- (first of Phase A IPP-parity push). Distinct from W19 (procurement),
-- W20 (COD), W23 (insurance claim), W25 (HSE incident), W27 (REIPPPP
-- ED), W28 (Grid Connection Agreement). W112 owns the WBS baseline +
-- Gantt + EVM (CPI/SPI) + variance + rebaseline + recovery engine.
--
-- Beats Primavera P6 / MS Project / Procore Schedule / Aconex Schedule
-- / Oracle Primavera Cloud / Trimble Quadri / Asta Powerproject /
-- Deltek Acumen Fuse / SAP Project Management. Each surfaces schedule
-- as a Gantt plus an exported PDF; W112 turns it into a 12-state P6
-- chain with INVERTED SLA polarity stored in HOURS (mega 720h /
-- large 480h / medium 240h / small 120h on variance_detected anchor),
-- FLOOR-AT-LARGE tier overlay on 5 floor flags (critical_path_breach,
-- resource_constrained_over_pct_25, weather_window_at_risk,
-- community_disruption_threshold_breached, EPC_subcontractor_milestone
-- _at_risk), FLOOR-AT-MEGA on 2+ flags OR critical_path_breach.
--
-- Standards: PMBOK 7 + ISO 21500:2021 + AACE RP 27R-03 + AACE 29R-03
-- + REIPPPP IPP Office reporting + NERSA Grid Code C-5 + DMRE s34.
--
-- 12-state P6 lifecycle plus 3 branch states:
--   wbs_drafted -> set_baseline -> baseline_set -> start_execution
--     -> in_progress -> update_progress -> status_updated
--     -> detect_variance -> variance_detected -> assess_impact
--     -> impact_assessed -> rebaseline_schedule -> rebaselined
--     -> mark_recovered -> recovered -> mark_completed
--     -> completed (HARD terminal)
--   any non-terminal -> suspend_schedule -> suspended -> resume_schedule
--     -> in_progress (LOOP)
--   any non-terminal -> cancel_schedule -> cancelled (HARD terminal)
--   in_progress / status_updated / variance_detected / impact_assessed
--     -> mark_late_finish -> late_finish (HARD terminal; W112 SIGNATURE
--                                          regulator-crossing EVERY tier
--                                          when project_capacity_mw>=1)
--
-- Tier RE-DERIVED on every transition from project_capacity_mw:
--   small  : <10 MW
--   medium : 10-50 MW
--   large  : 50-200 MW OR 1 floor flag
--   mega   : >=200 MW OR 2+ floor flags OR critical_path_breach
-- FLOOR-AT-LARGE on any one of 5 floor flags.
-- FLOOR-AT-MEGA on 2+ floor flags OR critical_path_breach.
--
-- INVERTED SLA polarity stored as HOURS. variance_detected anchor:
--   small 120h / medium 240h / large 480h / mega 720h
-- Larger projects get LONGER cure runway (more coordination required).
--
-- SIGNATURE regulator crossings (REIPPPP + NERSA C-5 + DMRE s34):
--   mark_late_finish    -> EVERY tier when project_capacity_mw >= 1
--                          (W112 SIGNATURE)
--   cancel_schedule     -> EVERY tier when project_capacity_mw >= 1
--   rebaseline_schedule -> large + mega
--   suspend_schedule    -> mega only when critical_path_breach
--   sla_breached        -> large + mega
--
-- Write {admin, ipp_developer}. Read all 9 personas. actor_party split:
--   scheduler          : draft_wbs, set_baseline, update_progress,
--                         detect_variance
--   project_manager    : start_execution, assess_impact, propose_recovery,
--                         mark_recovered, mark_completed, mark_late_finish,
--                         suspend_schedule, resume_schedule
--   portfolio_director : rebaseline_schedule, cancel_schedule
--   IPP_CEO            : approve_rebaseline, reject_rebaseline

CREATE TABLE IF NOT EXISTS oe_ipp_schedule (
  id                                          TEXT PRIMARY KEY,
  schedule_number                             TEXT UNIQUE NOT NULL,

  -- Project linkage
  project_id                                  TEXT NOT NULL,
  project_name                                TEXT,
  project_capacity_mw                         REAL NOT NULL DEFAULT 0,
  project_type                                TEXT,

  -- Cross-chain bridges (W19 / W20 / W23 / W25)
  procurement_ref                             TEXT,
  cod_ref                                     TEXT,
  insurance_claim_ref                         TEXT,
  hse_incident_ref                            TEXT,

  -- Baseline + dates
  baseline_label                              TEXT,
  baseline_set_at                             TEXT,
  baseline_total_tasks                        INTEGER NOT NULL DEFAULT 0,
  baseline_total_duration_days                INTEGER NOT NULL DEFAULT 0,
  baseline_planned_start                      TEXT,
  baseline_planned_finish                     TEXT,
  current_planned_finish                      TEXT,
  contractual_final_milestone_date            TEXT,

  -- Progress
  percent_complete                            REAL NOT NULL DEFAULT 0,
  tasks_completed                             INTEGER NOT NULL DEFAULT 0,
  tasks_in_progress                           INTEGER NOT NULL DEFAULT 0,
  tasks_not_started                           INTEGER NOT NULL DEFAULT 0,
  last_progress_update_at                     TEXT,

  -- EVM (Earned Value Management)
  planned_value_zar                           REAL NOT NULL DEFAULT 0,
  earned_value_zar                            REAL NOT NULL DEFAULT 0,
  actual_cost_zar                             REAL NOT NULL DEFAULT 0,
  budget_at_completion_zar                    REAL NOT NULL DEFAULT 0,
  cpi                                         REAL NOT NULL DEFAULT 0,
  spi                                         REAL NOT NULL DEFAULT 0,
  spi_t                                       REAL NOT NULL DEFAULT 0,
  schedule_variance_zar                       REAL NOT NULL DEFAULT 0,
  cost_variance_zar                           REAL NOT NULL DEFAULT 0,
  schedule_variance_pct                       REAL NOT NULL DEFAULT 0,
  cost_variance_pct                           REAL NOT NULL DEFAULT 0,

  -- Critical path
  critical_path_total_float_days              REAL NOT NULL DEFAULT 0,
  critical_tasks_count                        INTEGER NOT NULL DEFAULT 0,
  longest_path_duration_days                  INTEGER NOT NULL DEFAULT 0,

  -- Variance + rebaseline tracking
  variance_count                              INTEGER NOT NULL DEFAULT 0,
  rebaseline_count                            INTEGER NOT NULL DEFAULT 0,
  last_variance_at                            TEXT,
  last_rebaseline_at                          TEXT,
  variance_reason                             TEXT,
  rebaseline_reason                           TEXT,
  recovery_plan_summary                       TEXT,

  -- 5 floor flags
  critical_path_breach                        INTEGER NOT NULL DEFAULT 0,
  resource_constrained_over_pct_25            INTEGER NOT NULL DEFAULT 0,
  weather_window_at_risk                      INTEGER NOT NULL DEFAULT 0,
  community_disruption_threshold_breached     INTEGER NOT NULL DEFAULT 0,
  EPC_subcontractor_milestone_at_risk         INTEGER NOT NULL DEFAULT 0,

  -- Tier + authority + completeness battery
  current_tier                                TEXT NOT NULL CHECK (current_tier IN (
    'small','medium','large','mega'
  )),
  authority_required                          TEXT CHECK (authority_required IN (
    'scheduler','project_manager','portfolio_director','IPP_CEO'
  )),
  urgency_band                                TEXT,
  schedule_health_band                        TEXT,
  schedule_completeness_index                 INTEGER NOT NULL DEFAULT 0,

  -- Narrative
  title                                       TEXT,
  narrative                                   TEXT,
  reason_code                                 TEXT,
  suspend_reason                              TEXT,
  cancel_reason                               TEXT,
  late_finish_reason                          TEXT,

  current_ball_in_court_party                 TEXT,
  last_responder_party                        TEXT,

  is_reportable                               INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                          INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                       TEXT,

  -- 9 lifecycle + 3 branch status timestamps
  chain_status                                TEXT NOT NULL CHECK (chain_status IN (
    'wbs_drafted','baseline_set','in_progress','status_updated',
    'variance_detected','impact_assessed','rebaselined','recovered',
    'completed','suspended','cancelled','late_finish'
  )),
  wbs_drafted_at                              TEXT,
  in_progress_at                              TEXT,
  status_updated_at                           TEXT,
  variance_detected_at                        TEXT,
  impact_assessed_at                          TEXT,
  rebaselined_at                              TEXT,
  recovered_at                                TEXT,
  completed_at                                TEXT,
  suspended_at                                TEXT,
  cancelled_at                                TEXT,
  late_finish_at                              TEXT,
  signoff_at                                  TEXT,

  -- Regulator crossing
  regulator_crossed_at                        TEXT,
  regulator_inbox_ref                         TEXT,
  regulator_ref                               TEXT,

  -- SLA
  sla_target_hours                            INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                             TEXT,
  last_sla_breach_at                          TEXT,
  sla_breached                                INTEGER NOT NULL DEFAULT 0,
  escalation_level                            INTEGER NOT NULL DEFAULT 0,

  tenant_id                                   TEXT,
  created_by                                  TEXT NOT NULL,
  created_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ips_status      ON oe_ipp_schedule(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ips_tier        ON oe_ipp_schedule(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ips_tenant      ON oe_ipp_schedule(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_ips_project     ON oe_ipp_schedule(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_ips_sla         ON oe_ipp_schedule(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_ips_breached    ON oe_ipp_schedule(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ips_reportable  ON oe_ipp_schedule(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_ips_health      ON oe_ipp_schedule(schedule_health_band);
CREATE INDEX IF NOT EXISTS idx_oe_ips_finish      ON oe_ipp_schedule(current_planned_finish);

CREATE TABLE IF NOT EXISTS oe_ipp_schedule_events (
  id                  TEXT PRIMARY KEY,
  schedule_id         TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_ips_events_sid  ON oe_ipp_schedule_events(schedule_id);
CREATE INDEX IF NOT EXISTS idx_oe_ips_events_type ON oe_ipp_schedule_events(event_type);
