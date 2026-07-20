// Wave 129 - Fault-Fingerprint Multi-Class ML chain.
//
// PHASE D WAVE 3 OF 4. Multi-class fault classifier (XGBoost / RF /
// GradientBoosting / 1D-CNN / LightGBM / CatBoost / baseline_physics)
// REPLACING the W71 12-mode physics rules. Sister of W127 (anomaly ML
// replaces W71 6-method heuristic) and W128 (survival ML replaces W71
// OLS slope). Joins the W127 'ml' audit namespace.
//
// Beats AspenTech Mtell pattern-recognition / GE APM fault classification /
// Uptake Fusion fault library / Augury fault dictionary / C3.ai fault
// models / SparkCognition SparkPredict classifiers / Petuum / DataRPM
// diagnostic stacks. Maintains reconciliation_with_w71_physics_pct for
// monotonic-replacement proof.
//
// Mounted at /admin/workstation?tab=fault-fingerprint-ml,
// /ipp/workstation?tab=fault-fingerprint-ml, and
// /support/workstation?tab=fault-fingerprint-ml (write {admin,support};
// admin/ipp/support all READ).
//
// 12-state forward + 4 branch lifecycle (+ add_novel_class RE-ENTRY):
//   model_proposed -> labeled_dataset_bound -> class_imbalance_resolved
//     -> features_engineered -> train_test_split ->
//     multiclass_model_trained -> confusion_matrix_validated ->
//     calibrated -> shadow_deployed -> live_ab_active ->
//     champion_promoted -> retrained -> archived (HARD)
//   any inference-active -> detect_class_drift -> class_drift_detected (SOFT)
//   any non-terminal -> rollback_model -> rolled_back (HARD - SIGNATURE)
//   any non-terminal -> recall_model -> recalled (HARD - safety)
//   live -> failover_to_physics_baseline -> failover_to_physics_baseline (SOFT)
//   {confusion_matrix_validated..class_drift_detected} -> add_novel_class
//     -> multiclass_model_trained (RE-ENTRY, EU AI Act Art 14 product-
//     class change at fleet_systemic only)
//
// 5-tier INVERTED SLA polarity (HOURS): single_asset 36 / small_fleet
// 120 / large_fleet 300 / multi_jurisdiction_fleet 600 / fleet_systemic
// 900. BETWEEN W127 (720h ceiling) and W128 (1080h ceiling).
//
// FLOOR-AT-LARGE-FLEET on {>=}1 of 5 flags; FLOOR-AT-FLEET-SYSTEMIC on
// {>=}3 flags: safety_critical_fault_class /
// regulator_reportable_misclass / nerc_cip_audit_in_scope /
// sox_ml_governance_required / iso_42001_required.
//
// SIGNATURE W129 regulator crossings:
//   * rollback_model EVERY tier (THIRD Phase-D rollback signature,
//     inherits W127-ML-ROLLBACK hard line)
//   * recall_model EVERY tier WHEN safety_critical_fault_class
//   * detect_class_drift HEAVY tiers WHEN regulator_reportable_misclass
//   * failover_to_physics_baseline multi_jurisdiction + fleet_systemic
//   * add_novel_class fleet_systemic only (W129-UNIQUE - EU AI Act
//     Art 14 product-class change)
//   * sla_breached HEAVY only (large_fleet+)
//
// 5 bridges (W71 NOT NULL + W118 MANDATORY): W71 asset prognostics (12-
// mode physics being replaced) + W15 warranty/RMA (fault-mode evidence)
// + W41 ITIL problem mgmt (RCA from class) + W63 warranty recovery
// (supplier-recovery driven by class) + W118 audit chain.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';
import { faultMlViz } from '../mlGovViz';

// OKLCH tokens
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type FfmlStatus =
  | 'model_proposed' | 'labeled_dataset_bound' | 'class_imbalance_resolved'
  | 'features_engineered' | 'train_test_split' | 'multiclass_model_trained'
  | 'confusion_matrix_validated' | 'calibrated' | 'shadow_deployed'
  | 'live_ab_active' | 'champion_promoted' | 'retrained' | 'archived'
  | 'class_drift_detected' | 'rolled_back' | 'recalled'
  | 'failover_to_physics_baseline';

type FfmlTier =
  | 'single_asset' | 'small_fleet' | 'large_fleet'
  | 'multi_jurisdiction_fleet' | 'fleet_systemic';
type FfmlUrgency = 'low' | 'medium' | 'high' | 'critical' | 'systemic';
type FfmlAuthority = 'ml_engineer' | 'data_steward' | 'CTO' | 'CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type FfmlFamily =
  | 'xgboost' | 'random_forest' | 'gradient_boosting' | 'cnn_1d'
  | 'lightgbm' | 'catboost' | 'baseline_physics';
type FfmlAssetClass =
  | 'wind_turbine' | 'pv_inverter' | 'battery_storage' | 'transformer'
  | 'transmission_line' | 'substation' | 'hydrogen_electrolyser'
  | 'grid_scada' | 'smart_meter' | 'generic';
type ModelCardStatus = 'draft' | 'approved' | 'published' | 'expired';

interface FfmlRow {
  [key: string]: unknown;
  id: string;
  model_number: string;
  model_family: FfmlFamily | string;
  model_version: string | null;
  training_dataset_hash: string | null;
  feature_count: number | null;
  asset_class: FfmlAssetClass | string;
  assets_covered: number | null;
  jurisdiction_count: number | null;
  safety_critical: number;
  training_examples_count: number | null;
  validation_examples_count: number | null;
  hyperparameter_set_hash: string | null;
  champion_model_id: string | null;
  challenger_model_id: string | null;
  retrain_due_at: string | null;
  model_card_expiry_at: string | null;
  w71_asset_prognostics_ref: string | null;
  w15_warranty_claim_ref: string | null;
  w41_problem_management_ref: string | null;
  w63_warranty_recovery_ref: string | null;
  w118_block_ref: string | null;
  safety_critical_fault_class: number;
  regulator_reportable_misclass: number;
  nerc_cip_audit_in_scope: number;
  sox_ml_governance_required: number;
  iso_42001_required: number;
  class_count: number | null;
  class_label_set_hash: string | null;
  class_distribution_payload: string | null;
  confusion_matrix: string | null;
  min_samples_per_class: number | null;
  macro_f1: number | null;
  micro_f1: number | null;
  weighted_recall: number | null;
  top_3_accuracy: number | null;
  log_loss: number | null;
  roc_auc_macro: number | null;
  confusion_matrix_density: number | null;
  class_imbalance_ratio: number | null;
  calibration_brier: number | null;
  class_drift_psi: number | null;
  novel_class_detection_rate: number | null;
  reconciliation_with_w71_physics_pct: number | null;
  ntt_baseline_comparison_pct: number | null;
  inference_latency_p50_ms: number | null;
  inference_latency_p99_ms: number | null;
  model_card_status: ModelCardStatus | null;
  iso27001_controls_ok: number;
  soc2_type2_controls_ok: number;
  iso_42001_compliance_score: number | null;
  control_effectiveness_index: number | null;
  current_tier: FfmlTier;
  authority_required: FfmlAuthority | null;
  urgency_band: FfmlUrgency | null;
  model_health_band: HealthBand | null;
  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
  chain_status: FfmlStatus;
  model_proposed_at: string | null;
  labeled_dataset_bound_at: string | null;
  class_imbalance_resolved_at: string | null;
  features_engineered_at: string | null;
  train_test_split_at: string | null;
  multiclass_model_trained_at: string | null;
  confusion_matrix_validated_at: string | null;
  calibrated_at: string | null;
  shadow_deployed_at: string | null;
  live_ab_active_at: string | null;
  champion_promoted_at: string | null;
  retrained_at: string | null;
  archived_at: string | null;
  class_drift_detected_at: string | null;
  rolled_back_at: string | null;
  recalled_at: string | null;
  failover_to_physics_baseline_at: string | null;
  regulator_crossed_at: string | null;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  days_to_retrain_due: number | null;
  days_to_model_card_expiry: number | null;
  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // LIVE 28-field battery
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: FfmlUrgency;
  authority_required_live?: FfmlAuthority;
  days_to_retrain_due_live?: number;
  days_to_model_card_expiry_live?: number;
  floor_flag_count_live?: number;
  floor_at_large_fleet_live?: boolean;
  floor_at_fleet_systemic_live?: boolean;
  control_effectiveness_index_live?: number;
  model_health_band_live?: HealthBand;
  macro_f1_live?: number;
  micro_f1_live?: number;
  weighted_recall_live?: number;
  top_3_accuracy_live?: number;
  log_loss_live?: number;
  roc_auc_macro_live?: number;
  confusion_matrix_density_live?: number;
  class_imbalance_ratio_live?: number;
  calibration_brier_live?: number;
  class_drift_psi_live?: number;
  novel_class_detection_rate_live?: number;
  model_family_live?: string;
  class_count_live?: number;
  min_samples_per_class_floor?: number;
  min_samples_per_class_ok_live?: boolean | null;
  confusion_matrix_parsed?: number[][] | null;
  class_distribution_parsed?: Record<string, number> | null;
  reconciliation_with_w71_physics_live?: number;
  ntt_baseline_comparison_pct_live?: number;
  bridges_to_w71_asset_prognostics_live?: boolean;
  bridges_to_w15_warranty_claim_live?: boolean;
  bridges_to_w41_problem_management_live?: boolean;
  bridges_to_w63_warranty_recovery_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
}

interface FfmlEvent {
  id: string;
  model_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  from_tier: string | null;
  to_tier: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  labeled_bound_count: number;
  imbalance_resolved_count: number;
  features_count: number;
  split_count: number;
  trained_count: number;
  confusion_matrix_validated_count: number;
  calibrated_count: number;
  shadow_count: number;
  live_ab_count: number;
  champion_count: number;
  retrained_count: number;
  archived_count: number;
  class_drift_count: number;
  rolled_back_count: number;
  recalled_count: number;
  failover_count: number;
  breached: number;
  reportable_total: number;
  floor_flag_total: number;
  w71_bridged_count: number;
  w15_bridged_count: number;
  w41_bridged_count: number;
  w63_bridged_count: number;
  w118_bridged_count: number;
  control_effectiveness_avg: number;
  retrain_within_60d: number;
  retrain_within_14d: number;
  model_card_expiring_30d: number;
  min_samples_per_class_floor: number;
  min_samples_floor_fail_count: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  proposed_count: 0, labeled_bound_count: 0, imbalance_resolved_count: 0,
  features_count: 0, split_count: 0, trained_count: 0,
  confusion_matrix_validated_count: 0, calibrated_count: 0, shadow_count: 0,
  live_ab_count: 0, champion_count: 0, retrained_count: 0,
  archived_count: 0, class_drift_count: 0, rolled_back_count: 0,
  recalled_count: 0, failover_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w71_bridged_count: 0, w15_bridged_count: 0, w41_bridged_count: 0,
  w63_bridged_count: 0, w118_bridged_count: 0,
  control_effectiveness_avg: 0,
  retrain_within_60d: 0, retrain_within_14d: 0,
  model_card_expiring_30d: 0,
  min_samples_per_class_floor: 30,
  min_samples_floor_fail_count: 0,
};

const ALL_STATES = [
  'model_proposed', 'labeled_dataset_bound', 'class_imbalance_resolved',
  'features_engineered', 'train_test_split', 'multiclass_model_trained',
  'confusion_matrix_validated', 'calibrated', 'shadow_deployed',
  'live_ab_active', 'champion_promoted', 'retrained', 'archived',
] as const;

const BRANCH_STATES = [
  'class_drift_detected', 'rolled_back', 'recalled', 'failover_to_physics_baseline',
] as const;

const FILTERS = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'retrain_60d',        label: 'Retrain <60d' },
  { key: 'retrain_14d',        label: 'Retrain <14d' },
  { key: 'mcard_30d',          label: 'Card exp. <30d' },
  { key: 'health_red',         label: 'Health red' },
  { key: 'health_critical',    label: 'Health critical' },
  { key: 'systemic_floor',     label: 'Systemic floor' },
  { key: 'large_floor',        label: 'Large-fleet floor' },
  { key: 'min_samples_fail',   label: 'Stratified-split fail' },
  { key: 'rolled_back',        label: 'Rolled back' },
  { key: 'recalled',           label: 'Recalled' },
  { key: 'model_proposed',               label: 'Proposed' },
  { key: 'labeled_dataset_bound',        label: 'Dataset' },
  { key: 'class_imbalance_resolved',     label: 'Imbalance' },
  { key: 'features_engineered',          label: 'Features' },
  { key: 'train_test_split',             label: 'Split' },
  { key: 'multiclass_model_trained',     label: 'Trained' },
  { key: 'confusion_matrix_validated',   label: 'CM valid.' },
  { key: 'calibrated',                   label: 'Calibrated' },
  { key: 'shadow_deployed',              label: 'Shadow' },
  { key: 'live_ab_active',               label: 'Live A/B' },
  { key: 'champion_promoted',            label: 'Champion' },
  { key: 'retrained',                    label: 'Retrained' },
  { key: 'archived',                     label: 'Archived' },
  { key: 'class_drift_detected',         label: 'Class drift' },
  { key: 'failover_to_physics_baseline', label: 'Physics failover' },
  { key: 'tier:single_asset',             label: 'Single asset (36h)' },
  { key: 'tier:small_fleet',              label: 'Small fleet (120h)' },
  { key: 'tier:large_fleet',              label: 'Large fleet (300h)' },
  { key: 'tier:multi_jurisdiction_fleet', label: 'Multi-juris. (600h)' },
  { key: 'tier:fleet_systemic',           label: 'Systemic (900h)' },
  { key: 'family:xgboost',           label: 'XGBoost' },
  { key: 'family:random_forest',     label: 'Random Forest' },
  { key: 'family:gradient_boosting', label: 'Grad. Boost' },
  { key: 'family:cnn_1d',            label: '1D-CNN' },
  { key: 'family:lightgbm',          label: 'LightGBM' },
  { key: 'family:catboost',          label: 'CatBoost' },
  { key: 'family:baseline_physics',  label: 'Baseline phys.' },
  { key: 'asset:wind_turbine',          label: 'Wind' },
  { key: 'asset:pv_inverter',           label: 'PV' },
  { key: 'asset:battery_storage',       label: 'Battery' },
  { key: 'asset:transformer',           label: 'Xfmr' },
  { key: 'asset:transmission_line',     label: 'Tx line' },
  { key: 'asset:substation',            label: 'Sub.' },
  { key: 'asset:hydrogen_electrolyser', label: 'H2' },
  { key: 'asset:grid_scada',            label: 'SCADA' },
  { key: 'asset:smart_meter',           label: 'Meter' },
  { key: 'asset:generic',               label: 'Generic' },
];

const ACTION_FOR_STATE: Partial<Record<FfmlStatus, string>> = {
  model_proposed:               'bind-labeled-dataset',
  labeled_dataset_bound:        'resolve-class-imbalance',
  class_imbalance_resolved:     'engineer-features',
  features_engineered:          'split-train-test',
  train_test_split:             'train-multiclass',
  multiclass_model_trained:     'validate-confusion-matrix',
  confusion_matrix_validated:   'calibrate',
  calibrated:                   'deploy-shadow',
  shadow_deployed:              'activate-live-ab',
  live_ab_active:               'promote-champion',
  champion_promoted:            'retrain',
  retrained:                    'archive',
  class_drift_detected:         'retrain',
  failover_to_physics_baseline: 'activate-live-ab',
};

const ACTION_LABEL: Record<string, string> = {
  'bind-labeled-dataset':         'Bind labeled dataset',
  'resolve-class-imbalance':      'Resolve class imbalance',
  'engineer-features':            'Engineer features',
  'split-train-test':             'Split train/test',
  'train-multiclass':             'Train multiclass model',
  'validate-confusion-matrix':    'Validate confusion matrix',
  'calibrate':                    'Calibrate',
  'deploy-shadow':                'Deploy shadow',
  'activate-live-ab':             'Activate live A/B',
  'promote-champion':             'Promote champion',
  'retrain':                      'Retrain',
  'archive':                      'Archive',
  'detect-class-drift':           'Detect class drift',
  'rollback-model':               'Rollback model (SIGNATURE)',
  'recall-model':                 'Recall model (HARD)',
  'failover-to-physics-baseline': 'Failover to physics baseline',
  'add-novel-class':              'Add novel class',
};

function getActions(row: FfmlRow): ChainAction[] {
  const actions: ChainAction[] = [];

  const ACTIVE_NON_TERMINAL: FfmlStatus[] = [
    'model_proposed', 'labeled_dataset_bound', 'class_imbalance_resolved',
    'features_engineered', 'train_test_split', 'multiclass_model_trained',
    'confusion_matrix_validated', 'calibrated', 'shadow_deployed',
    'live_ab_active', 'champion_promoted', 'retrained', 'class_drift_detected',
    'failover_to_physics_baseline',
  ];
  const DRIFT_FROM: FfmlStatus[] = [
    'shadow_deployed', 'live_ab_active', 'champion_promoted',
    'retrained', 'failover_to_physics_baseline',
  ];
  const FAILOVER_FROM: FfmlStatus[] = ['live_ab_active', 'champion_promoted', 'retrained'];
  const NOVEL_CLASS_FROM: FfmlStatus[] = [
    'confusion_matrix_validated', 'calibrated', 'shadow_deployed',
    'live_ab_active', 'champion_promoted', 'retrained', 'class_drift_detected',
  ];

  const nextAction = ACTION_FOR_STATE[row.chain_status];
  if (nextAction) {
    if (nextAction === 'bind-labeled-dataset') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'training_dataset_hash', label: 'Labeled dataset hash (SHA-256, 12-mode-labeled corpus)', type: 'text', required: true },
          { key: 'training_examples_count', label: 'Training examples count', type: 'text', required: false },
          { key: 'validation_examples_count', label: 'Validation examples count', type: 'text', required: false },
          { key: 'class_count', label: 'Class count (12 physics modes default)', type: 'text', required: false },
          { key: 'class_label_set_hash', label: 'Class label set hash (SHA-256)', type: 'text', required: false },
        ],
      });
    } else if (nextAction === 'resolve-class-imbalance') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'class_imbalance_ratio', label: 'Class imbalance ratio (1 ideal, max:min)', type: 'text', required: false },
          { key: 'min_samples_per_class', label: 'Min samples per class after rebalance (>=30 NIST floor)', type: 'text', required: false },
          { key: 'class_distribution_payload', label: 'Class distribution payload (JSON object class->count)', type: 'textarea', required: false },
        ],
      });
    } else if (nextAction === 'engineer-features') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'feature_count', label: 'Feature count (post-engineering)', type: 'text', required: true },
        ],
      });
    } else if (nextAction === 'split-train-test') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'min_samples_per_class', label: 'Min samples per class on holdout (rejected if <30 NIST floor)', type: 'text', required: true },
          { key: 'notes', label: 'Split notes (stratified k-fold / holdout ratio)', type: 'textarea', required: false },
        ],
      });
    } else if (nextAction === 'train-multiclass') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'hyperparameter_set_hash', label: 'Hyperparameter set hash', type: 'text', required: true },
          { key: 'model_version', label: 'Model version (semver e.g. 1.2.0)', type: 'text', required: false },
        ],
      });
    } else if (nextAction === 'validate-confusion-matrix') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'macro_f1', label: 'Macro F1 (avg per-class F1)', type: 'text', required: true },
          { key: 'micro_f1', label: 'Micro F1 (aggregate)', type: 'text', required: false },
          { key: 'weighted_recall', label: 'Weighted recall', type: 'text', required: false },
          { key: 'top_3_accuracy', label: 'Top-3 accuracy', type: 'text', required: false },
          { key: 'log_loss', label: 'Log loss (lower better)', type: 'text', required: false },
          { key: 'roc_auc_macro', label: 'ROC AUC macro (one-vs-rest)', type: 'text', required: false },
          { key: 'confusion_matrix_density', label: 'Confusion matrix density (diagonal sum / total)', type: 'text', required: false },
          { key: 'confusion_matrix', label: 'Confusion matrix JSON (NxN array, optional)', type: 'textarea', required: false },
        ],
      });
    } else if (nextAction === 'calibrate') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'calibration_brier', label: 'Calibration Brier (multi-class, lower better)', type: 'text', required: true },
          { key: 'model_card_status', label: 'Model card status (draft/approved/published)', type: 'text', required: false },
        ],
      });
    } else if (nextAction === 'deploy-shadow') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'inference_latency_p50_ms', label: 'Inference latency p50 (ms)', type: 'text', required: false },
          { key: 'inference_latency_p99_ms', label: 'Inference latency p99 (ms)', type: 'text', required: false },
          { key: 'notes', label: 'Shadow notes (production-mirror, no actions taken)', type: 'textarea', required: false },
        ],
      });
    } else if (nextAction === 'activate-live-ab') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'challenger_model_id', label: 'Challenger model id', type: 'text', required: false },
          { key: 'notes', label: 'Live A/B notes (CTO sign-off; live multi-class fault inference begins)', type: 'textarea', required: false },
        ],
      });
    } else if (nextAction === 'promote-champion') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'reconciliation_with_w71_physics_pct', label: 'Reconciliation with 12-mode physics baseline (%, top-1 match)', type: 'text', required: true },
          { key: 'ntt_baseline_comparison_pct', label: 'NTT baseline comparison (% improvement, negative=worse)', type: 'text', required: false },
          { key: 'notes', label: 'Champion promotion notes (replaces 12-mode physics)', type: 'textarea', required: false },
        ],
      });
    } else if (nextAction === 'retrain') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'retrain_due_at', label: 'Next retrain due ISO date (e.g. 2026-08-30T00:00:00Z)', type: 'text', required: false },
          { key: 'notes', label: 'Retrain notes (drift-triggered / scheduled?)', type: 'textarea', required: false },
        ],
      });
    } else if (nextAction === 'archive') {
      actions.push({
        key: nextAction,
        label: ACTION_LABEL[nextAction],
        fields: [
          { key: 'notes', label: 'Archive notes (CEO - HARD terminal)', type: 'textarea', required: true },
        ],
      });
    } else {
      actions.push({ key: nextAction, label: ACTION_LABEL[nextAction] ?? nextAction, tone: 'primary' });
    }
  }

  if (DRIFT_FROM.includes(row.chain_status) && row.chain_status !== 'class_drift_detected') {
    actions.push({
      key: 'detect-class-drift',
      label: ACTION_LABEL['detect-class-drift'],
      fields: [
        { key: 'class_drift_psi', label: 'Observed class-PSI (>=0.25 = heavy drift)', type: 'text', required: true },
        { key: 'notes', label: 'Class drift notes. NOTE: crosses regulator on HEAVY tiers WHEN regulator_reportable_misclass.', type: 'textarea', required: false },
      ],
    });
  }

  if (FAILOVER_FROM.includes(row.chain_status)) {
    actions.push({
      key: 'failover-to-physics-baseline',
      label: ACTION_LABEL['failover-to-physics-baseline'],
      fields: [
        { key: 'notes', label: 'Physics failover notes. NOTE: reverts to 12-mode physics rules; crosses regulator at multi_jurisdiction + fleet_systemic tiers.', type: 'textarea', required: false },
      ],
    });
  }

  if (NOVEL_CLASS_FROM.includes(row.chain_status)) {
    actions.push({
      key: 'add-novel-class',
      label: ACTION_LABEL['add-novel-class'],
      fields: [
        { key: 'notes', label: 'Novel class notes (RE-ENTRY to multiclass_model_trained). NOTE: EU AI Act Art 14 product-class change; fleet_systemic crosses regulator.', type: 'textarea', required: false },
        { key: 'class_distribution_payload', label: 'Updated class distribution payload (JSON)', type: 'textarea', required: false },
      ],
    });
  }

  if (ACTIVE_NON_TERMINAL.includes(row.chain_status)) {
    actions.push({
      key: 'rollback-model',
      label: ACTION_LABEL['rollback-model'],
      fields: [
        { key: 'reason_code', label: 'Rollback reason. NOTE: SIGNATURE - inherits the ML-rollback hard line. Crosses regulator EVERY tier (ISO 42001 + NIST AI RMF + SOC 2 + NERC CIP-013 + SOX).', type: 'textarea', required: true },
      ],
    });
    actions.push({
      key: 'recall-model',
      label: ACTION_LABEL['recall-model'],
      fields: [
        { key: 'reason_code', label: 'Recall reason. NOTE: HARD safety pull; crosses regulator EVERY tier WHEN safety_critical_fault_class (NERC CIP-013 + ISO 42001 RCA + EU AI Act Art 21).', type: 'textarea', required: true },
      ],
    });
  }

  return actions;
}

function renderDetail(row: FfmlRow): React.ReactNode {
  const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
  const retrainDays = row.days_to_retrain_due_live ?? row.days_to_retrain_due ?? null;
  const cardDays = row.days_to_model_card_expiry_live ?? row.days_to_model_card_expiry ?? null;
  const flags = row.floor_flag_count_live ?? 0;
  const cm = row.confusion_matrix_parsed ?? null;
  const classDist = row.class_distribution_parsed ?? null;

  return (
    <div style={{ fontSize: 12, color: TX1 }}>
      {/* Performance battery */}
      <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
        <DetailPair label="Macro F1" value={String(row.macro_f1 ?? '-')} />
        <DetailPair label="Micro F1" value={String(row.micro_f1 ?? '-')} />
        <DetailPair label="Weighted recall" value={String(row.weighted_recall ?? '-')} />
        <DetailPair label="Top-3 acc." value={String(row.top_3_accuracy ?? '-')} />
        <DetailPair label="Log loss" value={String(row.log_loss ?? '-')} />
        <DetailPair label="ROC AUC macro" value={String(row.roc_auc_macro ?? '-')} />
        <DetailPair label="CM density" value={String(row.confusion_matrix_density ?? '-')} />
        <DetailPair label="Class imbal." value={`${row.class_imbalance_ratio ?? '-'}:1`} />
        <DetailPair label="Calib. Brier" value={String(row.calibration_brier ?? '-')} />
        <DetailPair label="Class drift PSI" value={String(row.class_drift_psi ?? '-')} />
        <DetailPair label="Novel detect." value={String(row.novel_class_detection_rate ?? '-')} />
        <DetailPair label="Physics recon. %" value={String(row.reconciliation_with_w71_physics_pct ?? '-')} />
        <DetailPair label="NTT baseline %" value={`${row.ntt_baseline_comparison_pct ?? '-'}%`} />
        <DetailPair label="Latency p50" value={`${row.inference_latency_p50_ms ?? '-'} ms`} />
        <DetailPair label="Latency p99" value={`${row.inference_latency_p99_ms ?? '-'} ms`} />
        <DetailPair label="Min/class" value={`${row.min_samples_per_class ?? '-'} (>=30)`} />
        <DetailPair label="Model card" value={row.model_card_status ?? '-'} />
        <DetailPair label="ISO 42001" value={`${row.iso_42001_compliance_score ?? '-'}/130`} />
        <DetailPair label="ISO 27001" value={row.iso27001_controls_ok ? 'OK' : 'NO'} />
        <DetailPair label="SOC 2 II" value={row.soc2_type2_controls_ok ? 'OK' : 'NO'} />
        <DetailPair label="Control eff." value={`${control}/130`} />
        <DetailPair label="Retrain days" value={retrainDays != null ? `${retrainDays}d` : '-'} />
        <DetailPair label="Card days" value={cardDays != null ? `${cardDays}d` : '-'} />
        <DetailPair label="SLA window" value={`${row.sla_target_hours ?? 0}h`} />
      </div>

      {/* Confusion matrix */}
      {cm && Array.isArray(cm) && cm.length > 0 && (
        <div style={{ marginBottom: 12, background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
          <div style={{ marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>
            Confusion matrix ({cm.length}×{cm[0]?.length ?? 0}) — rows = actual, cols = predicted; diagonal = correct
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 10, fontFamily: MONO }}>
              <tbody>
                {cm.map((rowVals, i) => (
                  <tr key={i}>
                    {rowVals.map((val, j) => {
                      const isDiag = i === j;
                      const rowTotal = rowVals.reduce((s, v) => s + v, 0);
                      const ratio = rowTotal > 0 ? val / rowTotal : 0;
                      const intensity = Math.round(ratio * 100);
                      const bg = isDiag
                        ? `rgba(31, 91, 58, ${ratio.toFixed(2)})`
                        : ratio > 0.05
                          ? `rgba(155, 31, 31, ${(ratio * 0.7).toFixed(2)})`
                          : 'transparent';
                      const fg = isDiag && intensity > 50 ? '#fff' : TX1;
                      return (
                        <td
                          key={j}
                          style={{ border: `1px solid ${BORDER}`, padding: '2px 6px', textAlign: 'right', background: bg, color: fg }}
                          title={`actual=${i}, predicted=${j}, count=${val}, row%=${(ratio * 100).toFixed(1)}%`}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Class distribution */}
      {classDist && typeof classDist === 'object' && Object.keys(classDist).length > 0 && (
        <div style={{ marginBottom: 12, background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
          <div style={{ marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>
            Class distribution ({Object.keys(classDist).length} classes)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
            {Object.entries(classDist).map(([cls, n]) => {
              const maxN = Math.max(...Object.values(classDist).map((v) => Number(v) || 0));
              const ratio = maxN > 0 ? Number(n) / maxN : 0;
              return (
                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 120, fontSize: 10, fontFamily: MONO, color: TX1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cls}>{cls}</span>
                  <div style={{ position: 'relative', height: 6, flex: 1, borderRadius: 3, background: BG2 }}>
                    <div style={{ position: 'absolute', inset: 0, right: `${(1 - ratio) * 100}%`, borderRadius: 3, background: ACC }} />
                  </div>
                  <span style={{ width: 48, fontSize: 10, fontFamily: MONO, textAlign: 'right', color: TX1 }}>{Number(n).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Floor flags */}
      <div style={{ marginBottom: 12, background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>
          Floor flags ({flags}/5) — FLOOR-AT-LARGE-FLEET ≥1, FLOOR-AT-FLEET-SYSTEMIC ≥3
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          <FlagPill on={!!row.safety_critical_fault_class} label="Safety-crit. class" />
          <FlagPill on={!!row.regulator_reportable_misclass} label="Reg reportable misclass" />
          <FlagPill on={!!row.nerc_cip_audit_in_scope} label="NERC CIP-013" />
          <FlagPill on={!!row.sox_ml_governance_required} label="SOX ML gov." />
          <FlagPill on={!!row.iso_42001_required} label="ISO 42001" />
        </div>
      </div>

      {/* Bridges */}
      <div style={{ marginBottom: 12, background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>Cross-chain bridges (physics NOT NULL + audit mandatory)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="Audit" />
          <BridgePill on={!!row.bridges_to_w71_asset_prognostics_live} label="12-mode physics" />
          <BridgePill on={!!row.bridges_to_w15_warranty_claim_live} label="Warranty / RMA" />
          <BridgePill on={!!row.bridges_to_w41_problem_management_live} label="Problem mgmt" />
          <BridgePill on={!!row.bridges_to_w63_warranty_recovery_live} label="Warranty recov." />
        </div>
      </div>

      {/* Regulator crossing */}
      {(row.is_reportable_flag || row.regulator_ref || row.regulator_inbox_ref || row.reason_code) && (
        <div style={{ marginBottom: 12, background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', border: `1px solid oklch(0.80 0.05 20)`, borderRadius: 6, padding: 12, color: BAD, fontSize: 11 }}>
          <div style={{ marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: BAD }}>Regulator crossing</div>
          {row.reason_code && <div>Reason: <span style={{ fontFamily: MONO }}>{row.reason_code}</span></div>}
          {row.regulator_reason_text && <div>Detail: {row.regulator_reason_text}</div>}
          {row.regulator_ref && <div>Filed ref: <span style={{ fontFamily: MONO }}>{row.regulator_ref}</span></div>}
          {row.regulator_inbox_ref && <div>Inbox: <span style={{ fontFamily: MONO }}>{row.regulator_inbox_ref}</span></div>}
          {row.regulator_crossed_at && <div>Crossed at: {fmtDate(row.regulator_crossed_at)}</div>}
        </div>
      )}
    </div>
  );
}

function fmtHoursSla(h: number | null | undefined): string {
  if (h === null || h === undefined) return '-';
  const sign = h < 0 ? '-' : '';
  const abs = Math.abs(h);
  if (abs >= 24) return `${sign}${(abs / 24).toFixed(1)}d`;
  if (abs >= 1)  return `${sign}${abs.toFixed(1)}h`;
  return `${sign}${Math.round(abs * 60)}m`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtFamily(s: string | null | undefined): string {
  if (!s) return '-';
  const map: Record<string, string> = {
    xgboost: 'XGBoost',
    random_forest: 'Random Forest',
    gradient_boosting: 'Gradient Boosting',
    cnn_1d: '1D-CNN',
    lightgbm: 'LightGBM',
    catboost: 'CatBoost',
    baseline_physics: 'Baseline physics',
  };
  return map[String(s)] ?? String(s).replace(/_/g, ' ');
}

function fmtAssetClass(s: string | null | undefined): string {
  if (!s) return '-';
  return String(s).replace(/_/g, ' ');
}

const FAMILY_OPTIONS: Array<{ key: FfmlFamily; label: string }> = [
  { key: 'xgboost',           label: 'XGBoost' },
  { key: 'random_forest',     label: 'Random Forest' },
  { key: 'gradient_boosting', label: 'Gradient Boosting' },
  { key: 'cnn_1d',            label: '1D-CNN (deep)' },
  { key: 'lightgbm',          label: 'LightGBM' },
  { key: 'catboost',          label: 'CatBoost' },
  { key: 'baseline_physics',  label: 'Baseline physics (12-mode)' },
];

const ASSET_OPTIONS: Array<{ key: FfmlAssetClass; label: string }> = [
  { key: 'wind_turbine',          label: 'Wind turbine' },
  { key: 'pv_inverter',           label: 'PV inverter' },
  { key: 'battery_storage',       label: 'Battery storage' },
  { key: 'transformer',           label: 'Transformer' },
  { key: 'transmission_line',     label: 'Transmission line' },
  { key: 'substation',            label: 'Substation' },
  { key: 'hydrogen_electrolyser', label: 'Hydrogen electrolyser' },
  { key: 'grid_scada',            label: 'Grid SCADA stream' },
  { key: 'smart_meter',           label: 'Smart meter' },
  { key: 'generic',               label: 'Generic / multi-asset' },
];

interface Props {
  regulatorView?: boolean;
}

export function FaultFingerprintMlTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<FfmlRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'rolled_back' : 'active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: FfmlRow[] } & KpiSummary }>('/fault-fingerprint-ml');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          labeled_bound_count: data.labeled_bound_count || 0,
          imbalance_resolved_count: data.imbalance_resolved_count || 0,
          features_count: data.features_count || 0,
          split_count: data.split_count || 0,
          trained_count: data.trained_count || 0,
          confusion_matrix_validated_count: data.confusion_matrix_validated_count || 0,
          calibrated_count: data.calibrated_count || 0,
          shadow_count: data.shadow_count || 0,
          live_ab_count: data.live_ab_count || 0,
          champion_count: data.champion_count || 0,
          retrained_count: data.retrained_count || 0,
          archived_count: data.archived_count || 0,
          class_drift_count: data.class_drift_count || 0,
          rolled_back_count: data.rolled_back_count || 0,
          recalled_count: data.recalled_count || 0,
          failover_count: data.failover_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          floor_flag_total: data.floor_flag_total || 0,
          w71_bridged_count: data.w71_bridged_count || 0,
          w15_bridged_count: data.w15_bridged_count || 0,
          w41_bridged_count: data.w41_bridged_count || 0,
          w63_bridged_count: data.w63_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          control_effectiveness_avg: data.control_effectiveness_avg || 0,
          retrain_within_60d: data.retrain_within_60d || 0,
          retrain_within_14d: data.retrain_within_14d || 0,
          model_card_expiring_30d: data.model_card_expiring_30d || 0,
          min_samples_per_class_floor: data.min_samples_per_class_floor || 30,
          min_samples_floor_fail_count: data.min_samples_floor_fail_count || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load fault-fingerprint ML models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      const body: Record<string, unknown> = { ...values };
      // coerce numeric fields
      const numericFields = [
        'training_examples_count', 'validation_examples_count', 'class_count',
        'class_imbalance_ratio', 'min_samples_per_class', 'feature_count',
        'macro_f1', 'micro_f1', 'weighted_recall', 'top_3_accuracy', 'log_loss',
        'roc_auc_macro', 'confusion_matrix_density', 'calibration_brier',
        'inference_latency_p50_ms', 'inference_latency_p99_ms',
        'reconciliation_with_w71_physics_pct', 'ntt_baseline_comparison_pct',
        'class_drift_psi',
      ];
      for (const f of numericFields) {
        if (body[f] !== undefined && body[f] !== '') body[f] = Number(body[f]);
      }
      await api.post(`/fault-fingerprint-ml/${rowId}/${key}`, body);
      await load();
      if (expandedEvents[rowId]) {
        const res = await api.get<{ data: { model: FfmlRow; events: FfmlEvent[] } }>(`/fault-fingerprint-ml/${rowId}`);
        setExpandedEvents((prev) => ({ ...prev, [rowId]: res.data?.data?.events || [] }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { model: FfmlRow; events: FfmlEvent[] } }>(`/fault-fingerprint-ml/${id}`);
      setExpandedEvents((prev) => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load model history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'reportable')      return !!r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'retrain_60d')     return (r.days_to_retrain_due_live ?? 9999) < 60;
      if (filter === 'retrain_14d')     return (r.days_to_retrain_due_live ?? 9999) < 14;
      if (filter === 'mcard_30d')       return (r.days_to_model_card_expiry_live ?? 9999) < 30;
      if (filter === 'health_red')      return r.model_health_band_live === 'red';
      if (filter === 'health_critical') return r.model_health_band_live === 'critical';
      if (filter === 'systemic_floor')  return !!r.floor_at_fleet_systemic_live;
      if (filter === 'large_floor')     return !!r.floor_at_large_fleet_live;
      if (filter === 'min_samples_fail') return r.min_samples_per_class_ok_live === false;
      if (filter.startsWith('tier:'))   return r.current_tier === filter.slice(5);
      if (filter.startsWith('family:')) return r.model_family === filter.slice(7);
      if (filter.startsWith('asset:'))  return r.asset_class === filter.slice(6);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/fault-fingerprint-ml', body);
      setShowPropose(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Propose failed');
    }
  }, [load]);

  // Filter groups for rendering
  const filterGroups = [
    { label: 'Status', keys: ['active','all','reportable','breached','retrain_60d','retrain_14d','mcard_30d','health_red','health_critical','systemic_floor','large_floor','min_samples_fail','rolled_back','recalled'] },
    { label: 'Lifecycle', keys: ['model_proposed','labeled_dataset_bound','class_imbalance_resolved','features_engineered','train_test_split','multiclass_model_trained','confusion_matrix_validated','calibrated','shadow_deployed','live_ab_active','champion_promoted','retrained','archived','class_drift_detected','failover_to_physics_baseline','rolled_back','recalled'] },
    { label: 'Tier', keys: ['tier:single_asset','tier:small_fleet','tier:large_fleet','tier:multi_jurisdiction_fleet','tier:fleet_systemic'] },
    { label: 'Family', keys: ['family:xgboost','family:random_forest','family:gradient_boosting','family:cnn_1d','family:lightgbm','family:catboost','family:baseline_physics'] },
    { label: 'Asset', keys: ['asset:wind_turbine','asset:pv_inverter','asset:battery_storage','asset:transformer','asset:transmission_line','asset:substation','asset:hydrogen_electrolyser','asset:grid_scada','asset:smart_meter','asset:generic'] },
  ];
  const filterMap = Object.fromEntries(FILTERS.map((f) => [f.key, f.label]));

  return (
    <div style={{ background: BG, minHeight: '100%', padding: 16, fontSize: 12, color: TX1 }}>
      {/* Header */}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: TX1 }}>Fault-fingerprint multi-class ML governance</h2>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: TX2, maxWidth: 900 }}>
            12-state forward + 4 branch multi-class fault classifier BRAIN replacing 12-mode physics rules (Sister of anomaly ML + survival ML).
            XGBoost / Random Forest / Gradient Boosting / 1D-CNN / LightGBM / CatBoost / baseline physics.
            Beats AspenTech Mtell + GE APM + Uptake Fusion + Augury + C3.ai + SparkCognition + Petuum + DataRPM.
            INVERTED SLA HOURS (single 36 / small 120 / large 300 / multi-juris. 600 / systemic 900).
            SIGNATURE: rollback_model crosses EVERY tier (rollback signature). add_novel_class at fleet_systemic (EU AI Act Art 14).
          </p>
        </div>
        {!regulatorView && (
          <button
            type="button"
            onClick={() => setShowPropose(true)}
            style={{ background: ACC, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            + Propose model
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8 }}>
        <KpiTile label="Total"        value={kpis.total} />
        <KpiTile label="Active"       value={kpis.active_count} />
        <KpiTile label="Live A/B"     value={kpis.live_ab_count} tone="ok" />
        <KpiTile label="Champion"     value={kpis.champion_count} tone="ok" />
        <KpiTile label="Rolled back"  value={kpis.rolled_back_count} tone={kpis.rolled_back_count > 0 ? 'bad' : undefined} />
        <KpiTile label="Recalled"     value={kpis.recalled_count} tone={kpis.recalled_count > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Control avg"  value={`${kpis.control_effectiveness_avg}/130`} />
      </div>

      {/* Drill rail */}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', fontSize: 11, color: TX2 }}>
        <span>Proposed: <strong style={{ color: TX1 }}>{kpis.proposed_count}</strong></span>
        <span>Dataset: <strong style={{ color: TX1 }}>{kpis.labeled_bound_count}</strong></span>
        <span>Imbal.: <strong style={{ color: TX1 }}>{kpis.imbalance_resolved_count}</strong></span>
        <span>Features: <strong style={{ color: TX1 }}>{kpis.features_count}</strong></span>
        <span>Split: <strong style={{ color: TX1 }}>{kpis.split_count}</strong></span>
        <span>Trained: <strong style={{ color: TX1 }}>{kpis.trained_count}</strong></span>
        <span>CM valid.: <strong style={{ color: WARN }}>{kpis.confusion_matrix_validated_count}</strong></span>
        <span>Calibrated: <strong style={{ color: WARN }}>{kpis.calibrated_count}</strong></span>
        <span>Shadow: <strong style={{ color: WARN }}>{kpis.shadow_count}</strong></span>
        <span>Retrained: <strong style={{ color: GOOD }}>{kpis.retrained_count}</strong></span>
        <span>Archived: <strong style={{ color: GOOD }}>{kpis.archived_count}</strong></span>
        <span>Class drift: <strong style={{ color: WARN }}>{kpis.class_drift_count}</strong></span>
        <span>Physics failover: <strong style={{ color: WARN }}>{kpis.failover_count}</strong></span>
        <span>Reportable: <strong style={{ color: BAD }}>{kpis.reportable_total}</strong></span>
        <span>Floor flags: <strong style={{ color: WARN }}>{kpis.floor_flag_total}</strong></span>
        <span>Retrain &lt;60d: <strong style={{ color: WARN }}>{kpis.retrain_within_60d}</strong></span>
        <span>Retrain &lt;14d: <strong style={{ color: BAD }}>{kpis.retrain_within_14d}</strong></span>
        <span>Card exp. &lt;30d: <strong style={{ color: BAD }}>{kpis.model_card_expiring_30d}</strong></span>
        <span>Strat. fail: <strong style={{ color: BAD }}>{kpis.min_samples_floor_fail_count}</strong></span>
        <span>Audit: <strong style={{ color: TX1 }}>{kpis.w118_bridged_count}</strong></span>
        <span>Physics: <strong style={{ color: TX1 }}>{kpis.w71_bridged_count}</strong></span>
        <span>Warranty: <strong style={{ color: TX1 }}>{kpis.w15_bridged_count}</strong></span>
        <span>Problem mgmt: <strong style={{ color: TX1 }}>{kpis.w41_bridged_count}</strong></span>
        <span>Warranty recov.: <strong style={{ color: TX1 }}>{kpis.w63_bridged_count}</strong></span>
      </div>

      {/* Filter groups */}
      {filterGroups.map((group) => (
        <div key={group.label} style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4, minWidth: 44 }}>{group.label}</span>
          {group.keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              style={{
                padding: '2px 10px',
                borderRadius: 4,
                border: `1px solid ${filter === k ? 'transparent' : BORDER}`,
                background: filter === k ? ACC : BG1,
                color: filter === k ? '#fff' : TX2,
                fontSize: 11,
                fontWeight: filter === k ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {filterMap[k] ?? k}
            </button>
          ))}
        </div>
      ))}

      {err && (
        <div style={{ marginBottom: 12, background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', border: `1px solid oklch(0.80 0.05 20)`, borderRadius: 6, padding: '8px 12px', fontSize: 12, color: BAD }}>{err}</div>
      )}

      {!loading && faultMlViz(filtered)}
      {loading ? (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '24px 16px', textAlign: 'center', color: TX2 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '24px 16px', textAlign: 'center', color: TX2 }}>No models match.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((row) => {
            const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
            const retrainDays = row.days_to_retrain_due_live ?? row.days_to_retrain_due ?? null;
            const cardDays = row.days_to_model_card_expiry_live ?? row.days_to_model_card_expiry ?? null;
            const flags = row.floor_flag_count_live ?? 0;
            const scope = `${row.assets_covered ?? 0}a/${row.jurisdiction_count ?? 0}j${row.safety_critical ? '/SC' : ''}`;

            const subtitle = [
              fmtFamily(row.model_family),
              fmtAssetClass(row.asset_class),
              row.current_tier.replace(/_/g, ' '),
              scope,
              row.model_version ? `v${row.model_version}` : null,
            ].filter(Boolean).join(' · ');

            const meta: Array<{ label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }> = [
              {
                label: 'Control',
                value: `${control}/130`,
                tone: control >= 100 ? 'ok' : control >= 60 ? 'warn' : 'bad',
              },
              {
                label: 'Retrain',
                value: retrainDays != null ? `${retrainDays}d` : '-',
                tone: retrainDays != null && retrainDays < 14 ? 'bad' : retrainDays != null && retrainDays < 60 ? 'warn' : 'ok',
              },
              {
                label: 'Card',
                value: cardDays != null ? `${cardDays}d` : '-',
                tone: cardDays != null && cardDays < 14 ? 'bad' : cardDays != null && cardDays < 30 ? 'warn' : 'ok',
              },
              {
                label: 'Flags',
                value: String(flags),
                tone: flags >= 3 ? 'bad' : flags >= 1 ? 'warn' : 'ok',
              },
              {
                label: 'SLA',
                value: row.sla_breached_live ? 'BREACHED' : fmtHoursSla(row.sla_hours_remaining_live),
                tone: row.sla_breached_live ? 'bad' : undefined,
              },
              {
                label: 'Health',
                value: row.model_health_band_live ?? row.model_health_band ?? '-',
                tone: (row.model_health_band_live ?? row.model_health_band) === 'green' ? 'ok'
                  : (row.model_health_band_live ?? row.model_health_band) === 'amber' ? 'warn'
                  : (row.model_health_band_live ?? row.model_health_band) === 'critical' ? 'bad'
                  : (row.model_health_band_live ?? row.model_health_band) === 'red' ? 'bad'
                  : undefined,
              },
            ];

            const chainEvents: ChainEvent[] = (expandedEvents[row.id] ?? []).map((e) => ({
              id: e.id,
              event_type: e.event_type,
              from_status: e.from_status ?? undefined,
              to_status: e.to_status ?? undefined,
              actor_party: e.actor_party ?? undefined,
              notes: e.notes ?? undefined,
              created_at: e.created_at,
            }));

            return (
              <ChainCard
                key={row.id}
                item={row}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={row.model_number}
                meta={<span style={{ fontSize: 11, color: TX2 }}>{subtitle} · {meta.map(m => `${m.label}: ${m.value}`).join(' · ')}</span>}
                actions={regulatorView || row.is_hard_terminal ? [] : getActions(row)}
                events={chainEvents}
                onAction={(key, values) => handleAction(row.id, key, values)}
                onExpand={() => handleExpand(row.id)}
                detail={renderDetail(row)}
              />
            );
          })}
        </div>
      )}

      {showPropose && (
        <ProposeModal onClose={() => setShowPropose(false)} onSubmit={propose} />
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: TX1 }}>{value}</div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      style={{
        display: 'block',
        borderRadius: 4,
        padding: '2px 6px',
        textAlign: 'center',
        fontSize: 10,
        fontWeight: 500,
        background: on ? BAD : BG2,
        color: on ? '#fff' : TX3,
      }}
      title={label}
    >
      {label}
    </span>
  );
}

function BridgePill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      style={{
        display: 'block',
        borderRadius: 4,
        padding: '2px 6px',
        textAlign: 'center',
        fontSize: 10,
        fontWeight: 500,
        background: on ? ACC : BG2,
        color: on ? '#fff' : TX3,
      }}
      title={label}
    >
      {label}
    </span>
  );
}

function ProposeModal({
  onClose, onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [family, setFamily] = useState<FfmlFamily>('xgboost');
  const [assetClass, setAssetClass] = useState<FfmlAssetClass>('generic');
  const [modelVersion, setModelVersion] = useState('1.0.0');
  const [assetsCovered, setAssetsCovered] = useState('');
  const [jurisdictions, setJurisdictions] = useState('');
  const [safetyCritical, setSafetyCritical] = useState(false);
  const [featureCount, setFeatureCount] = useState('');
  const [classCount, setClassCount] = useState('12');
  const [title, setTitle] = useState('');
  const [w118, setW118] = useState('');
  const [w71, setW71]   = useState('');
  const [w15, setW15]   = useState('');
  const [w41, setW41]   = useState('');
  const [w63, setW63]   = useState('');
  const [safetyCriticalClass, setSafetyCriticalClass] = useState(false);
  const [regReportable, setRegReportable] = useState(false);
  const [nercCip, setNercCip] = useState(false);
  const [soxMl, setSoxMl] = useState(false);
  const [iso42001, setIso42001] = useState(false);
  const [regulatorRelevant, setRegulatorRelevant] = useState(false);

  const submit = () => {
    const body: Record<string, unknown> = {
      model_family: family,
      asset_class: assetClass,
      model_version: modelVersion || undefined,
      assets_covered: assetsCovered ? Number(assetsCovered) : undefined,
      jurisdiction_count: jurisdictions ? Number(jurisdictions) : undefined,
      safety_critical: safetyCritical ? 1 : 0,
      feature_count: featureCount ? Number(featureCount) : undefined,
      class_count: classCount ? Number(classCount) : undefined,
      title: title || undefined,
      w118_block_ref: w118 || undefined,
      w71_asset_prognostics_ref: w71 || undefined,
      w15_warranty_claim_ref: w15 || undefined,
      w41_problem_management_ref: w41 || undefined,
      w63_warranty_recovery_ref: w63 || undefined,
      safety_critical_fault_class: safetyCriticalClass ? 1 : 0,
      regulator_reportable_misclass: regReportable ? 1 : 0,
      nerc_cip_audit_in_scope: nercCip ? 1 : 0,
      sox_ml_governance_required: soxMl ? 1 : 0,
      iso_42001_required: iso42001 ? 1 : 0,
      regulator_relevant: regulatorRelevant ? 1 : 0,
    };
    onSubmit(body);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    borderRadius: 4,
    border: `1px solid ${BORDER}`,
    padding: '4px 8px',
    fontSize: 12,
    color: TX1,
    background: BG1,
    boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ width: '100%', maxWidth: 640, borderRadius: 8, background: BG1, padding: 20, fontSize: 12, color: TX1, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TX1 }}>Propose fault-fingerprint ML model</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: TX2 }}>
              12-mode physics baseline bridge REQUIRED (NOT NULL). Audit bridge mandatory.
              Tier auto-derived from assets_covered + jurisdiction_count + safety_critical with FLOOR-AT-LARGE-FLEET ≥1 flag and FLOOR-AT-FLEET-SYSTEMIC ≥3 flags.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '4px 10px', fontSize: 12, color: TX2, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Model family">
            <select value={family} onChange={(e) => setFamily(e.target.value as FfmlFamily)} style={inputStyle}>
              {FAMILY_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Asset class">
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as FfmlAssetClass)} style={inputStyle}>
              {ASSET_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Model version (semver)">
            <input value={modelVersion} onChange={(e) => setModelVersion(e.target.value)} style={inputStyle} placeholder="1.0.0" />
          </Field>
          <Field label="Assets covered (fleet scope)">
            <input value={assetsCovered} onChange={(e) => setAssetsCovered(e.target.value)} type="number" style={inputStyle} placeholder="50" />
          </Field>
          <Field label="Jurisdiction count">
            <input value={jurisdictions} onChange={(e) => setJurisdictions(e.target.value)} type="number" style={inputStyle} placeholder="1" />
          </Field>
          <Field label="Safety-critical (national)?">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={safetyCritical} onChange={(e) => setSafetyCritical(e.target.checked)} />
              National safety-critical
            </label>
          </Field>
          <Field label="Feature count">
            <input value={featureCount} onChange={(e) => setFeatureCount(e.target.value)} type="number" style={inputStyle} placeholder="64" />
          </Field>
          <Field label="Class count (12 default)">
            <input value={classCount} onChange={(e) => setClassCount(e.target.value)} type="number" style={inputStyle} placeholder="12" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Northern Cape PV inverter XGBoost v1" />
          </Field>
          <Field label="12-mode physics ref (REQUIRED)">
            <input value={w71} onChange={(e) => setW71(e.target.value)} style={inputStyle} placeholder="aprog-2026-007" />
          </Field>
          <Field label="Audit block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} style={inputStyle} placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="Warranty / RMA ref">
            <input value={w15} onChange={(e) => setW15(e.target.value)} style={inputStyle} placeholder="claim-2026-0007" />
          </Field>
          <Field label="Problem mgmt ref">
            <input value={w41} onChange={(e) => setW41(e.target.value)} style={inputStyle} placeholder="prob-2026-0011" />
          </Field>
          <Field label="Warranty recovery ref">
            <input value={w63} onChange={(e) => setW63(e.target.value)} style={inputStyle} placeholder="wrec-2026-0019" />
          </Field>
        </div>

        <div style={{ marginTop: 12, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12 }}>
          <div style={{ marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: TX3 }}>
            Floor flags (FLOOR-AT-LARGE-FLEET ≥1, FLOOR-AT-FLEET-SYSTEMIC ≥3)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <Checkbox checked={safetyCriticalClass} onChange={setSafetyCriticalClass} label="Safety-critical fault class" />
            <Checkbox checked={regReportable} onChange={setRegReportable} label="Reg-reportable misclass" />
            <Checkbox checked={nercCip} onChange={setNercCip} label="NERC CIP-013 audit" />
            <Checkbox checked={soxMl} onChange={setSoxMl} label="SOX ML governance" />
            <Checkbox checked={iso42001} onChange={setIso42001} label="ISO 42001 AIMS" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 14px', fontSize: 12, color: TX2, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            style={{ background: ACC, border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
          >
            Propose model
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, color: TX2 }}>
      <div style={{ marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {children}
    </label>
  );
}

function Checkbox({
  checked, onChange, label,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: TX1 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default FaultFingerprintMlTab;
