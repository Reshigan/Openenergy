-- Wave 128 - RUL Prediction ML Model lifecycle chain.
--
-- PHASE D WAVE 2 OF 4. Survival/Cox PH ML models REPLACING the W71
-- OLS-style degradation slope. Sister of W127 (which replaces the W71
-- 6-method anomaly heuristic). Where W127 wires ANOMALY-detection ML,
-- W128 wires SURVIVAL / RUL (remaining-useful-life) prediction - the
-- OTHER half of W71. Cox PH proportional-hazards / accelerated-failure-
-- time / DeepSurv / Random-Survival-Forest / XGBoost-Survival models.
--
-- Goal: beat AspenTech Mtell RUL / GE APM survival / Uptake Fusion
-- prognostics / Augury RUL / C3.ai reliability / SparkCognition
-- SparkPredict RUL / Petuum / DataRPM survival stacks. Maintains
-- reconciliation with the W71 OLS baseline for monotonic-replacement
-- proof (KM-lift-vs-OLS).
--
-- Standards: ISO 42001 AI Management Systems + NIST AI RMF + EU AI
-- Act (high-risk Annex III) + ISO 27001 + SOC 2 Type II + NERC
-- CIP-013 + SOX ML governance audit-evidence chain.
--
-- 12-state forward path + 4 branch states:
--   model_proposed -> survival_dataset_bound -> features_engineered ->
--     train_test_split -> model_trained -> backtest_validated ->
--     calibrated -> shadow_deployed -> live_ab_active ->
--     champion_promoted -> retrained -> archived (HARD)
--   any non-terminal -> detect_drift -> drift_detected (SOFT)
--   any non-terminal -> rollback_model -> rolled_back (HARD)
--   any non-terminal -> recall_model -> recalled (HARD - safety)
--   live -> activate_failover_to_ols -> failover_to_ols (SOFT)
--
-- INVERTED polarity SLA - LARGER fleet scope = MORE training + review
-- time. Stored as HOURS (single_asset 24h .. fleet_systemic 720h).
-- LONGER survival_dataset_bound (48-720h) and shadow_deployed
-- (72-1080h) than W127 - survival models need censored-event
-- maturation observation before promotion.
--
-- SIGNATURE W128 regulator crossings:
--   rollback_model -> EVERY tier (W128 SIGNATURE W128-RUL-ROLLBACK -
--     second Phase-D hard line)
--   recall_model -> EVERY tier WHEN safety_critical_rul
--   detect_drift -> HEAVY tiers ONLY WHEN
--                   regulator_reportable_rul_quantile OR
--                   (PH-assumption-violated AND fleet_systemic)
--   activate_failover_to_ols -> multi_jurisdiction + fleet_systemic
--   promote_champion -> fleet_systemic WHEN iso_42001 (W128-UNIQUE -
--                       replacing OLS at systemic scale is itself
--                       a governance event)
--   sla_breached -> HEAVY tiers only
--
-- Write {admin, support}. READ all 9 personas. NO public peer endpoint
-- - INTERNAL ML governance chain.
--
-- 5 bridges: W71 NOT NULL (OLS baseline reconciliation MANDATORY) +
-- W21 lender drawdown + W77 reserve account + W63 warranty recovery +
-- W118 audit chain (tamper-evidence hash).
--
-- Persisted column budget kept under D1 100-col limit. ~95 persisted
-- cols. LIVE 28-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_rul_prediction_ml (
  id                                      TEXT PRIMARY KEY,
  model_number                            TEXT UNIQUE NOT NULL,
  model_family                            TEXT NOT NULL CHECK (model_family IN (
    'cox_ph','aft','deepsurv','rsf','xgb_surv','baseline_ols'
  )),
  model_version                           TEXT,
  training_dataset_hash                   TEXT,
  feature_count                           INTEGER,
  asset_class                             TEXT NOT NULL CHECK (asset_class IN (
    'wind_turbine','pv_inverter','battery_storage','transformer','transmission_line',
    'substation','hydrogen_electrolyser','grid_scada','smart_meter','generic'
  )),
  assets_covered                          INTEGER,
  jurisdiction_count                      INTEGER,
  safety_critical                         INTEGER NOT NULL DEFAULT 0,
  training_examples_count                 INTEGER,
  validation_examples_count               INTEGER,
  hyperparameter_set_hash                 TEXT,
  champion_model_id                       TEXT,
  challenger_model_id                     TEXT,
  retrain_due_at                          TEXT,
  model_card_expiry_at                    TEXT,

  -- 5 cross-chain bridges (W71 NOT NULL + W118 mandatory + W21 + W77 + W63)
  w71_asset_prognostics_ref               TEXT NOT NULL,
  w21_lender_drawdown_ref                 TEXT,
  w77_reserve_account_ref                 TEXT,
  w63_warranty_recovery_ref               TEXT,
  w118_block_ref                          TEXT,

  -- 5 floor flags (FLOOR-AT-LARGE-FLEET >=1 / FLOOR-AT-FLEET-SYSTEMIC >=3)
  safety_critical_rul                     INTEGER NOT NULL DEFAULT 0,
  regulator_reportable_rul_quantile       INTEGER NOT NULL DEFAULT 0,
  nerc_cip_audit_in_scope                 INTEGER NOT NULL DEFAULT 0,
  sox_ml_governance_required              INTEGER NOT NULL DEFAULT 0,
  iso_42001_ai_management_required        INTEGER NOT NULL DEFAULT 0,

  -- Survival-specific 12 LIVE fields
  concordance_index                       REAL,
  time_dependent_auc                      REAL,
  brier_score                             REAL,
  partial_likelihood                      REAL,
  ph_assumption_pvalue                    REAL,
  ph_violated_count                       INTEGER,
  kaplan_meier_lift_vs_ols                REAL,
  rul_p10_days                            REAL,
  rul_p50_days                            REAL,
  rul_p90_days                            REAL,
  rul_p50_mae_days                        REAL,
  censoring_rate                          REAL,

  -- Governance / performance components (0-130 composite)
  reconciliation_with_w71_ols_pct         REAL,
  ntt_baseline_comparison_pct             REAL,
  inference_latency_p50_ms                REAL,
  inference_latency_p99_ms                REAL,
  inference_throughput_per_sec            REAL,
  model_card_status                       TEXT CHECK (model_card_status IN (
    'draft','approved','published','expired'
  )),
  iso27001_controls_ok                    INTEGER NOT NULL DEFAULT 0,
  soc2_type2_controls_ok                  INTEGER NOT NULL DEFAULT 0,
  iso_42001_compliance_score              INTEGER,
  control_effectiveness_index             INTEGER,

  -- Composite indexes + bands
  current_tier                            TEXT NOT NULL CHECK (current_tier IN (
    'single_asset','small_fleet','large_fleet','multi_jurisdiction_fleet','fleet_systemic'
  )),
  authority_required                      TEXT,
  urgency_band                            TEXT,
  model_health_band                       TEXT,

  -- Narrative + reason codes
  title                                   TEXT,
  reason_code                             TEXT,

  is_reportable                           INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                      INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                   TEXT,
  regulator_ref                           TEXT,
  regulator_inbox_ref                     TEXT,

  -- 12 forward + 4 branch lifecycle timestamps
  chain_status                            TEXT NOT NULL CHECK (chain_status IN (
    'model_proposed','survival_dataset_bound','features_engineered','train_test_split',
    'model_trained','backtest_validated','calibrated','shadow_deployed',
    'live_ab_active','champion_promoted','retrained','archived',
    'drift_detected','rolled_back','recalled','failover_to_ols'
  )),
  model_proposed_at                       TEXT,
  survival_dataset_bound_at               TEXT,
  features_engineered_at                  TEXT,
  train_test_split_at                     TEXT,
  model_trained_at                        TEXT,
  backtest_validated_at                   TEXT,
  calibrated_at                           TEXT,
  shadow_deployed_at                      TEXT,
  live_ab_active_at                       TEXT,
  champion_promoted_at                    TEXT,
  retrained_at                            TEXT,
  archived_at                             TEXT,
  drift_detected_at                       TEXT,
  rolled_back_at                          TEXT,
  recalled_at                             TEXT,
  failover_to_ols_at                      TEXT,

  -- Regulator crossing
  regulator_crossed_at                    TEXT,

  -- SLA (HOURS, INVERTED polarity)
  sla_target_hours                        INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                         TEXT,
  sla_breached                            INTEGER NOT NULL DEFAULT 0,
  last_sla_breach_at                      TEXT,
  escalation_level                        INTEGER NOT NULL DEFAULT 0,
  days_to_retrain_due                     INTEGER,
  days_to_model_card_expiry               INTEGER,

  tenant_id                               TEXT,
  created_by                              TEXT NOT NULL,
  created_at                              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_rpm_status         ON oe_rul_prediction_ml(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_tier           ON oe_rul_prediction_ml(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_family         ON oe_rul_prediction_ml(model_family);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_asset_class    ON oe_rul_prediction_ml(asset_class);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_breached       ON oe_rul_prediction_ml(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_created        ON oe_rul_prediction_ml(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_w118_block     ON oe_rul_prediction_ml(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_w71_ref        ON oe_rul_prediction_ml(w71_asset_prognostics_ref);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_regulator_ref  ON oe_rul_prediction_ml(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_inbox_ref      ON oe_rul_prediction_ml(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_rul_prediction_ml_events (
  id                  TEXT PRIMARY KEY,
  model_id            TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  from_tier           TEXT,
  to_tier             TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_rpm_events_mdl  ON oe_rul_prediction_ml_events(model_id);
CREATE INDEX IF NOT EXISTS idx_oe_rpm_events_type ON oe_rul_prediction_ml_events(event_type);
