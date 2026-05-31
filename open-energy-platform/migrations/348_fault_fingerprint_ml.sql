-- Wave 129 - Fault-Fingerprint Multi-Class ML chain.
--
-- PHASE D WAVE 3 OF 4. Multi-class fault classifier REPLACING the W71
-- 12-mode physics-rule fault fingerprinting. Where W127 wires anomaly
-- ML and W128 wires survival/RUL ML, W129 wires the THIRD half of W71:
-- the FAULT-MODE multi-class classifier. XGBoost / RandomForest /
-- GradientBoosting / 1D-CNN / LightGBM / CatBoost / baseline_physics
-- ensemble against the 12 inherited fault modes.
--
-- Goal: beat AspenTech Mtell pattern-recognition / GE APM fault
-- classification / Uptake Fusion fault library / Augury machine
-- diagnostics / C3.ai fault-mode classifier / SparkCognition
-- SparkPredict fault-typing / Petuum / DataRPM classification stacks.
-- Maintains reconciliation with W71 12-mode physics baseline for
-- monotonic-replacement proof (reconciliation_with_w71_physics_pct).
--
-- Standards: ISO 42001 AI Management Systems + NIST AI RMF + EU AI
-- Act (high-risk Annex III) + ISO 27001 + SOC 2 Type II + NERC
-- CIP-013 + SOX ML governance audit-evidence chain.
--
-- 12-state forward path + 4 branch states (+ add_novel_class re-entry):
--   model_proposed -> labeled_dataset_bound -> class_imbalance_resolved
--     -> features_engineered -> train_test_split (stratified, min30/class)
--     -> multiclass_model_trained -> confusion_matrix_validated ->
--     calibrated -> shadow_deployed -> live_ab_active ->
--     champion_promoted -> retrained -> archived (HARD)
--   any non-terminal -> detect_class_drift -> class_drift_detected (SOFT)
--   any non-terminal -> rollback_model -> rolled_back (HARD)
--   any non-terminal -> recall_model -> recalled (HARD - safety)
--   live -> failover_to_physics_baseline -> failover (SOFT)
--   add_novel_class -> RE-ENTRY back to multiclass_model_trained
--
-- INVERTED polarity SLA - LARGER fleet scope = MORE training + review
-- time. Stored as HOURS (single_asset 36h .. fleet_systemic 900h).
-- LONGER than W128 - multi-class confusion-matrix stabilisation +
-- per-class calibration require more shadow time on imbalanced classes.
--
-- SIGNATURE W129 regulator crossings:
--   rollback_model -> EVERY tier (W129 SIGNATURE W129-FFML-ROLLBACK -
--     third Phase-D hard line, joins W127 + W128)
--   recall_model -> EVERY tier WHEN safety_critical_fault_class
--   detect_class_drift -> HEAVY tiers ONLY WHEN
--                         regulator_reportable_misclass
--   failover_to_physics_baseline -> multi_jurisdiction + fleet_systemic
--   add_novel_class -> fleet_systemic ONLY (W129-UNIQUE - adding a
--                      previously-unseen fault mode at fleet-wide scale
--                      is EU-AI-Act-reportable model-scope expansion)
--   sla_breached -> HEAVY tiers only
--
-- Write {admin, support}. READ all 9 personas. NO public peer endpoint
-- - INTERNAL ML governance chain.
--
-- 5 bridges: W71 NOT NULL (12-mode physics baseline reconciliation
-- MANDATORY) + W15 warranty claim + W41 ITIL problem mgmt + W63
-- warranty recovery + W118 audit chain (tamper-evidence hash).
--
-- Persisted column budget kept under D1 100-col limit. ~96 persisted
-- cols. Confusion matrix stored as single TEXT JSON column.
-- LIVE 28-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_fault_fingerprint_ml (
  id                                      TEXT PRIMARY KEY,
  model_number                            TEXT UNIQUE NOT NULL,
  model_family                            TEXT NOT NULL CHECK (model_family IN (
    'xgboost','random_forest','gradient_boosting','cnn_1d','lightgbm','catboost','baseline_physics'
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

  -- 5 cross-chain bridges (W71 NOT NULL + W118 mandatory + W15 + W41 + W63)
  w71_asset_prognostics_ref               TEXT NOT NULL,
  w15_warranty_claim_ref                  TEXT,
  w41_problem_management_ref              TEXT,
  w63_warranty_recovery_ref               TEXT,
  w118_block_ref                          TEXT,

  -- 5 floor flags (FLOOR-AT-LARGE-FLEET >=1 / FLOOR-AT-FLEET-SYSTEMIC >=3)
  safety_critical_fault_class             INTEGER NOT NULL DEFAULT 0,
  regulator_reportable_misclass           INTEGER NOT NULL DEFAULT 0,
  nerc_cip_audit_in_scope                 INTEGER NOT NULL DEFAULT 0,
  sox_ml_governance_required              INTEGER NOT NULL DEFAULT 0,
  iso_42001_required                      INTEGER NOT NULL DEFAULT 0,

  -- Multi-class specifics
  class_count                             INTEGER,
  class_label_set_hash                    TEXT,
  class_distribution_payload              TEXT,
  confusion_matrix                        TEXT,
  min_samples_per_class                   INTEGER,

  -- Multi-class 11 LIVE metric fields
  macro_f1                                REAL,
  micro_f1                                REAL,
  weighted_recall                         REAL,
  top_3_accuracy                          REAL,
  log_loss                                REAL,
  roc_auc_macro                           REAL,
  confusion_matrix_density                REAL,
  class_imbalance_ratio                   REAL,
  calibration_brier                       REAL,
  class_drift_psi                         REAL,
  novel_class_detection_rate              REAL,

  -- Governance / performance components (0-130 composite)
  reconciliation_with_w71_physics_pct     REAL,
  ntt_baseline_comparison_pct             REAL,
  inference_latency_p50_ms                REAL,
  inference_latency_p99_ms                REAL,
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
    'model_proposed','labeled_dataset_bound','class_imbalance_resolved','features_engineered',
    'train_test_split','multiclass_model_trained','confusion_matrix_validated','calibrated',
    'shadow_deployed','live_ab_active','champion_promoted','retrained','archived',
    'class_drift_detected','rolled_back','recalled','failover_to_physics_baseline'
  )),
  model_proposed_at                       TEXT,
  labeled_dataset_bound_at                TEXT,
  class_imbalance_resolved_at             TEXT,
  features_engineered_at                  TEXT,
  train_test_split_at                     TEXT,
  multiclass_model_trained_at             TEXT,
  confusion_matrix_validated_at           TEXT,
  calibrated_at                           TEXT,
  shadow_deployed_at                      TEXT,
  live_ab_active_at                       TEXT,
  champion_promoted_at                    TEXT,
  retrained_at                            TEXT,
  archived_at                             TEXT,
  class_drift_detected_at                 TEXT,
  rolled_back_at                          TEXT,
  recalled_at                             TEXT,
  failover_to_physics_baseline_at         TEXT,

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

CREATE INDEX IF NOT EXISTS idx_oe_ffml_status         ON oe_fault_fingerprint_ml(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_tier           ON oe_fault_fingerprint_ml(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_family         ON oe_fault_fingerprint_ml(model_family);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_asset_class    ON oe_fault_fingerprint_ml(asset_class);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_breached       ON oe_fault_fingerprint_ml(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_created        ON oe_fault_fingerprint_ml(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_w118_block     ON oe_fault_fingerprint_ml(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_w71_ref        ON oe_fault_fingerprint_ml(w71_asset_prognostics_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_regulator_ref  ON oe_fault_fingerprint_ml(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_inbox_ref      ON oe_fault_fingerprint_ml(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_fault_fingerprint_ml_events (
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

CREATE INDEX IF NOT EXISTS idx_oe_ffml_events_mdl  ON oe_fault_fingerprint_ml_events(model_id);
CREATE INDEX IF NOT EXISTS idx_oe_ffml_events_type ON oe_fault_fingerprint_ml_events(event_type);
