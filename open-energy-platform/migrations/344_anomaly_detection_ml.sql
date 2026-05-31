-- Wave 127 - Anomaly-Detection ML Model lifecycle chain.
--
-- PHASE D WAVE 1 OF 4 (Phase-D opener). Real ML models REPLACING the
-- W71 6-method heuristic anomaly ensemble. Where Phase C wired the
-- external systems (W122 SCADA / W123 IIoT / W124 settlement /
-- W125 ERP / W126 Government Filing), Phase D wires the actual ML
-- BRAIN against those streams. W127 = anomaly-detection model
-- governance chain (LSTM autoencoder / transformer autoencoder /
-- variational autoencoder).
--
-- Goal: beat AspenTech Mtell + GE APM + Uptake Fusion + Augury +
-- C3.ai AI/ML + SparkCognition SparkPredict + Petuum + DataRPM
-- predictive-maintenance stack with platform-native ML governance
-- (model_card + ISO 42001 + NIST AI RMF + EU AI Act + ISO 27001 +
-- SOC 2 Type II + NERC CIP-013 OT supply-chain).
--
-- Standards: ISO 42001 AI Management Systems + NIST AI Risk
-- Management Framework + EU AI Act (high-risk Annex III energy
-- infrastructure) + ISO 27001 + SOC 2 Type II + NERC CIP-013 +
-- SOX ML governance (audit-evidence chain).
--
-- 12-state forward path + 4 branch states:
--   model_proposed -> dataset_bound -> features_engineered ->
--     train_test_split -> model_trained -> backtest_validated ->
--     calibrated -> shadow_deployed -> live_ab_active ->
--     champion_promoted -> retrained -> archived (HARD)
--   any non-terminal -> detect_drift -> drift_detected (SOFT)
--   any non-terminal -> rollback_model -> rolled_back (HARD)
--   any non-terminal -> recall_model -> recalled (HARD - safety)
--   live -> activate_failover -> failover_to_baseline (SOFT)
--
-- Tier RE-DERIVED on every transition from
--   tierForScope(assets_covered, jurisdiction_count, safety_critical)
-- with FLOOR-AT-LARGE-FLEET on >=1 of 5 contextual flags;
-- FLOOR-AT-FLEET-SYSTEMIC on >=3 flags:
--   safety_critical_inference / regulator_reportable_drift /
--   nerc_cip_audit_in_scope / sox_ml_governance_required /
--   iso_42001_ai_management_required
-- INVERTED polarity - LARGER fleet scope = MORE training + review
-- time. Stored as HOURS (single_asset 24h .. fleet_systemic 720h).
--
-- SIGNATURE W127 regulator crossings (ISO 42001 + NIST AI RMF +
-- EU AI Act + NERC CIP-013 + SOX ML governance):
--   rollback_model -> EVERY tier (W127 SIGNATURE W127-ML-ROLLBACK
--     hard line - any model rollback = ISO 42001 incident + NIST AI
--     RMF MAP-MEASURE-MANAGE notice + SOC 2 control failure +
--     audit-evidence-chain reconciliation mandatory; first
--     Phase-D hard line.)
--   recall_model -> EVERY tier WHEN safety_critical_inference
--     (safety recall = NERC CIP-013 OT incident + ISO 42001 root-
--     cause analysis + EU AI Act Article 21 corrective action).
--   detect_drift -> large_fleet + multi_jurisdiction_fleet +
--     fleet_systemic ONLY when regulator_reportable_drift.
--   activate_failover -> multi_jurisdiction_fleet + fleet_systemic.
--   sla_breached -> large_fleet + multi_jurisdiction_fleet +
--     fleet_systemic only.
--
-- Write {admin, support} (2 writers - SAME as W71 heuristic
-- prognostics; this is its real ML replacement). READ all 9
-- personas. NO public peer endpoint - INTERNAL ML governance chain.
--
-- Persisted column budget kept under D1 100-col limit. ~95 persisted
-- cols. LIVE 28-field battery decorated at fetch.

CREATE TABLE IF NOT EXISTS oe_anomaly_detection_ml (
  id                                      TEXT PRIMARY KEY,
  model_number                            TEXT UNIQUE NOT NULL,
  model_family                            TEXT NOT NULL CHECK (model_family IN (
    'lstm_autoencoder','transformer_autoencoder','variational_autoencoder',
    'isolation_forest_ensemble','one_class_svm','prophet_residual','baseline_heuristic'
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

  -- 5 cross-chain bridges (W71 + W12 + W118 mandatory + W126 + W74)
  w71_asset_prognostics_ref               TEXT,
  w12_site_commissioning_ref              TEXT,
  w126_government_filing_ref              TEXT,
  w74_nersa_levy_ref                      TEXT,
  w118_block_ref                          TEXT,

  -- 5 floor flags (FLOOR-AT-LARGE-FLEET >=1 / FLOOR-AT-FLEET-SYSTEMIC >=3)
  safety_critical_inference               INTEGER NOT NULL DEFAULT 0,
  regulator_reportable_drift              INTEGER NOT NULL DEFAULT 0,
  nerc_cip_audit_in_scope                 INTEGER NOT NULL DEFAULT 0,
  sox_ml_governance_required              INTEGER NOT NULL DEFAULT 0,
  iso_42001_ai_management_required        INTEGER NOT NULL DEFAULT 0,

  -- Performance / model-quality components (0-130 composite)
  autoencoder_reconstruction_error_p99    REAL,
  precision_at_k                          REAL,
  recall_at_k                             REAL,
  false_positive_rate                     REAL,
  drift_psi                               REAL,
  drift_ks                                REAL,
  champion_vs_challenger_lift             REAL,
  inference_latency_p50_ms                REAL,
  inference_latency_p99_ms                REAL,
  inference_throughput_per_sec            REAL,
  ntt_baseline_comparison_pct             REAL,
  reconciliation_with_w71_heuristic_pct   REAL,
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
    'model_proposed','dataset_bound','features_engineered','train_test_split',
    'model_trained','backtest_validated','calibrated','shadow_deployed',
    'live_ab_active','champion_promoted','retrained','archived',
    'drift_detected','rolled_back','recalled','failover_to_baseline'
  )),
  model_proposed_at                       TEXT,
  dataset_bound_at                        TEXT,
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
  failover_to_baseline_at                 TEXT,

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

CREATE INDEX IF NOT EXISTS idx_oe_adml_status         ON oe_anomaly_detection_ml(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_adml_tier           ON oe_anomaly_detection_ml(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_adml_family         ON oe_anomaly_detection_ml(model_family);
CREATE INDEX IF NOT EXISTS idx_oe_adml_asset_class    ON oe_anomaly_detection_ml(asset_class);
CREATE INDEX IF NOT EXISTS idx_oe_adml_breached       ON oe_anomaly_detection_ml(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_adml_created        ON oe_anomaly_detection_ml(created_at);
CREATE INDEX IF NOT EXISTS idx_oe_adml_w118_block     ON oe_anomaly_detection_ml(w118_block_ref);
CREATE INDEX IF NOT EXISTS idx_oe_adml_w71_ref        ON oe_anomaly_detection_ml(w71_asset_prognostics_ref);
CREATE INDEX IF NOT EXISTS idx_oe_adml_regulator_ref  ON oe_anomaly_detection_ml(regulator_ref);
CREATE INDEX IF NOT EXISTS idx_oe_adml_inbox_ref      ON oe_anomaly_detection_ml(regulator_inbox_ref);

CREATE TABLE IF NOT EXISTS oe_anomaly_detection_ml_events (
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

CREATE INDEX IF NOT EXISTS idx_oe_adml_events_mdl  ON oe_anomaly_detection_ml_events(model_id);
CREATE INDEX IF NOT EXISTS idx_oe_adml_events_type ON oe_anomaly_detection_ml_events(event_type);
