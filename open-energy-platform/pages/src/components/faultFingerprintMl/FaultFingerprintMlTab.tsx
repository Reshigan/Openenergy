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

const STATE_TONE: Record<FfmlStatus, { bg: string; fg: string; label: string }> = {
  model_proposed:               { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  labeled_dataset_bound:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Dataset' },
  class_imbalance_resolved:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Imbalance' },
  features_engineered:          { bg: '#dbecfb', fg: '#1a3a5c', label: 'Features' },
  train_test_split:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Split' },
  multiclass_model_trained:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Trained' },
  confusion_matrix_validated:   { bg: '#fff4d6', fg: '#a06200', label: 'CM valid.' },
  calibrated:                   { bg: '#fff4d6', fg: '#a06200', label: 'Calibrated' },
  shadow_deployed:              { bg: '#fff4d6', fg: '#a06200', label: 'Shadow' },
  live_ab_active:               { bg: '#daf5e2', fg: '#1f6b3a', label: 'Live A/B' },
  champion_promoted:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Champion' },
  retrained:                    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Retrained' },
  archived:                     { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  class_drift_detected:         { bg: '#fff4d6', fg: '#a06200', label: 'Class drift' },
  rolled_back:                  { bg: '#7a0e0e', fg: '#fff',    label: 'Rolled back' },
  recalled:                     { bg: '#7a0e0e', fg: '#fff',    label: 'Recalled' },
  failover_to_physics_baseline: { bg: '#fff4d6', fg: '#a06200', label: 'W71 failover' },
};

const TIER_TONE: Record<FfmlTier, { bg: string; fg: string; label: string }> = {
  single_asset:             { bg: '#e3e7ec', fg: '#557',    label: 'Single asset' },
  small_fleet:              { bg: '#dbecfb', fg: '#1a3a5c', label: 'Small fleet' },
  large_fleet:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Large fleet' },
  multi_jurisdiction_fleet: { bg: '#fff4d6', fg: '#a06200', label: 'Multi-juris.' },
  fleet_systemic:           { bg: '#7a0e0e', fg: '#fff',    label: 'Systemic' },
};

const HEALTH_TONE: Record<HealthBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'retrain_60d',        label: 'Retrain {<}60d' },
  { key: 'retrain_14d',        label: 'Retrain {<}14d' },
  { key: 'mcard_30d',          label: 'Card exp. {<}30d' },
  { key: 'health_red',         label: 'Health red' },
  { key: 'health_critical',    label: 'Health critical' },
  { key: 'systemic_floor',     label: 'Systemic floor' },
  { key: 'large_floor',        label: 'Large-fleet floor' },
  { key: 'min_samples_fail',   label: 'Stratified-split fail' },
  { key: 'rolled_back',        label: 'Rolled back' },
  { key: 'recalled',           label: 'Recalled' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
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
  { key: 'failover_to_physics_baseline', label: 'W71 failover' },
  { key: 'rolled_back',                  label: 'Rolled back' },
  { key: 'recalled',                     label: 'Recalled' },
];

const FILTERS_TIER: Array<{ key: string; label: string }> = [
  { key: 'tier:single_asset',             label: 'Single asset (36h)' },
  { key: 'tier:small_fleet',              label: 'Small fleet (120h)' },
  { key: 'tier:large_fleet',              label: 'Large fleet (300h)' },
  { key: 'tier:multi_jurisdiction_fleet', label: 'Multi-juris. (600h)' },
  { key: 'tier:fleet_systemic',           label: 'Systemic (900h)' },
];

const FILTERS_FAMILY: Array<{ key: string; label: string }> = [
  { key: 'family:xgboost',           label: 'XGBoost' },
  { key: 'family:random_forest',     label: 'Random Forest' },
  { key: 'family:gradient_boosting', label: 'Grad. Boost' },
  { key: 'family:cnn_1d',            label: '1D-CNN' },
  { key: 'family:lightgbm',          label: 'LightGBM' },
  { key: 'family:catboost',          label: 'CatBoost' },
  { key: 'family:baseline_physics',  label: 'Baseline phys. (W71)' },
];

const FILTERS_ASSET: Array<{ key: string; label: string }> = [
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

type ActionKind =
  | 'bind-labeled-dataset' | 'resolve-class-imbalance' | 'engineer-features'
  | 'split-train-test' | 'train-multiclass' | 'validate-confusion-matrix'
  | 'calibrate' | 'deploy-shadow' | 'activate-live-ab' | 'promote-champion'
  | 'retrain' | 'archive' | 'detect-class-drift' | 'rollback-model'
  | 'recall-model' | 'failover-to-physics-baseline' | 'add-novel-class';

const ACTION_FOR_STATE: Partial<Record<FfmlStatus, ActionKind>> = {
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

const ACTION_LABEL: Record<ActionKind, string> = {
  'bind-labeled-dataset':         'Bind labeled dataset (ml_engineer - 12-mode labeled corpus hash + class distribution)',
  'resolve-class-imbalance':      'Resolve class imbalance (ml_engineer - SMOTE / class-weights / focal-loss; stratified split prep)',
  'engineer-features':            'Engineer features (ml_engineer - SCADA + IIoT covariates frozen)',
  'split-train-test':             'Split train/test (ml_engineer - stratified; MIN_SAMPLES_PER_CLASS_FLOOR=30 NIST AI RMF)',
  'train-multiclass':             'Train multiclass model (ml_engineer - hyperparameter set + 12 fault modes)',
  'validate-confusion-matrix':    'Validate confusion matrix (data_steward - per-class precision/recall/F1)',
  'calibrate':                    'Calibrate (data_steward - Platt / isotonic per-class + Brier multi-class)',
  'deploy-shadow':                'Deploy shadow (data_steward - production-mirror inference, no actions)',
  'activate-live-ab':             'ACTIVATE LIVE A/B (CTO - challenger receives traffic; multi-class fault inference begins)',
  'promote-champion':             'Promote champion (CTO - challenger wins A/B; replaces W71 12-mode physics)',
  'retrain':                      'Retrain (CTO - drift-triggered or scheduled re-fit)',
  'archive':                      'Archive (CEO - HARD terminal, retire model)',
  'detect-class-drift':           'Detect class drift (data_steward - class-distribution PSI / per-class F1 collapse; SOFT pause)',
  'rollback-model':               'ROLLBACK MODEL (CTO - SIGNATURE - W129 inherits W127-ML-ROLLBACK hard line; crosses regulator EVERY tier - THIRD Phase-D rollback signature)',
  'recall-model':                 'RECALL MODEL (CEO - HARD safety pull; crosses EVERY tier WHEN safety_critical_fault_class - EU AI Act Art 21)',
  'failover-to-physics-baseline': 'Failover to W71 physics baseline (data_steward - revert to 12-mode rules; top-heavy regulator crossings)',
  'add-novel-class':              'Add novel class (CTO - W129-UNIQUE EU AI Act Art 14 product-class change; fleet_systemic crosses regulator; RE-ENTRY to multiclass_model_trained)',
};

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
    baseline_physics: 'Baseline physics (W71)',
  };
  return map[String(s)] ?? String(s).replace(/_/g, ' ');
}

function fmtAssetClass(s: string | null | undefined): string {
  if (!s) return '-';
  return String(s).replace(/_/g, ' ');
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

interface Props {
  regulatorView?: boolean;
}

export function FaultFingerprintMlTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<FfmlRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'rolled_back' : 'active');
  const [selected, setSelected] = useState<FfmlRow | null>(null);
  const [events, setEvents] = useState<FfmlEvent[]>([]);
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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { model: FfmlRow; events: FfmlEvent[] } }>(`/fault-fingerprint-ml/${id}`);
      if (res.data?.data?.model) setSelected(res.data.data.model);
      setEvents(res.data?.data?.events || []);
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

  const act = useCallback(async (action: ActionKind, row: FfmlRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'bind-labeled-dataset') {
        const h = window.prompt('Labeled dataset hash (SHA-256, 12-mode-labeled corpus):', row.training_dataset_hash ?? '');
        if (h !== null) body.training_dataset_hash = h;
        const ec = window.prompt('Training examples count:', String(row.training_examples_count ?? 100000));
        if (ec !== null) body.training_examples_count = Number(ec);
        const vc = window.prompt('Validation examples count:', String(row.validation_examples_count ?? 20000));
        if (vc !== null) body.validation_examples_count = Number(vc);
        const cc = window.prompt('Class count (12 W71 modes default):', String(row.class_count ?? 12));
        if (cc !== null) body.class_count = Number(cc);
        const cdh = window.prompt('Class label set hash (SHA-256):', row.class_label_set_hash ?? '');
        if (cdh !== null) body.class_label_set_hash = cdh;
      } else if (action === 'resolve-class-imbalance') {
        const ir = window.prompt('Class imbalance ratio (1 ideal, max:min):', String(row.class_imbalance_ratio ?? 5));
        if (ir !== null) body.class_imbalance_ratio = Number(ir);
        const ms = window.prompt('Min samples per class after rebalance (>=30 NIST floor):', String(row.min_samples_per_class ?? 200));
        if (ms !== null) body.min_samples_per_class = Number(ms);
        const cd = window.prompt('Class distribution payload (JSON object class->count):', row.class_distribution_payload ?? '{}');
        if (cd !== null) body.class_distribution_payload = cd;
      } else if (action === 'engineer-features') {
        const fc = window.prompt('Feature count (post-engineering):', String(row.feature_count ?? 64));
        if (fc !== null) body.feature_count = Number(fc);
      } else if (action === 'split-train-test') {
        const ms = window.prompt('Min samples per class on holdout (rejected if {<}30 NIST floor):', String(row.min_samples_per_class ?? 200));
        if (ms !== null) body.min_samples_per_class = Number(ms);
        const note = window.prompt('Split notes (stratified k-fold / holdout ratio):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'train-multiclass') {
        const hp = window.prompt('Hyperparameter set hash:', row.hyperparameter_set_hash ?? '');
        if (hp !== null) body.hyperparameter_set_hash = hp;
        const v = window.prompt('Model version (semver e.g. 1.2.0):', row.model_version ?? '1.0.0');
        if (v !== null) body.model_version = v;
      } else if (action === 'validate-confusion-matrix') {
        const mf1 = window.prompt('Macro F1 (avg per-class F1):', String(row.macro_f1 ?? 0.85));
        if (mf1 !== null) body.macro_f1 = Number(mf1);
        const microf1 = window.prompt('Micro F1 (aggregate):', String(row.micro_f1 ?? 0.88));
        if (microf1 !== null) body.micro_f1 = Number(microf1);
        const wr = window.prompt('Weighted recall:', String(row.weighted_recall ?? 0.87));
        if (wr !== null) body.weighted_recall = Number(wr);
        const top3 = window.prompt('Top-3 accuracy:', String(row.top_3_accuracy ?? 0.95));
        if (top3 !== null) body.top_3_accuracy = Number(top3);
        const ll = window.prompt('Log loss (lower better):', String(row.log_loss ?? 0.45));
        if (ll !== null) body.log_loss = Number(ll);
        const auc = window.prompt('ROC AUC macro (one-vs-rest):', String(row.roc_auc_macro ?? 0.92));
        if (auc !== null) body.roc_auc_macro = Number(auc);
        const cmd = window.prompt('Confusion matrix density (diagonal sum / total):', String(row.confusion_matrix_density ?? 0.88));
        if (cmd !== null) body.confusion_matrix_density = Number(cmd);
        const cm = window.prompt('Confusion matrix JSON (NxN array, paste or skip):', row.confusion_matrix ?? '');
        if (cm !== null && cm.length > 0) body.confusion_matrix = cm;
      } else if (action === 'calibrate') {
        const cb = window.prompt('Calibration Brier (multi-class, lower better):', String(row.calibration_brier ?? 0.08));
        if (cb !== null) body.calibration_brier = Number(cb);
        body.model_card_status = window.prompt('Model card status (draft/approved/published):', row.model_card_status ?? 'approved') ?? row.model_card_status ?? 'approved';
      } else if (action === 'deploy-shadow') {
        const p50 = window.prompt('Inference latency p50 (ms):', String(row.inference_latency_p50_ms ?? 12));
        if (p50 !== null) body.inference_latency_p50_ms = Number(p50);
        const p99 = window.prompt('Inference latency p99 (ms):', String(row.inference_latency_p99_ms ?? 45));
        if (p99 !== null) body.inference_latency_p99_ms = Number(p99);
        const note = window.prompt('Shadow notes (production-mirror, no actions taken):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'activate-live-ab') {
        const ch = window.prompt('Challenger model id:', row.challenger_model_id ?? '');
        if (ch !== null) body.challenger_model_id = ch;
        const note = window.prompt('Live A/B notes (CTO sign-off; live multi-class fault inference begins):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'promote-champion') {
        const recw71 = window.prompt('Reconciliation with W71 12-mode physics baseline (%, top-1 match):', String(row.reconciliation_with_w71_physics_pct ?? 92));
        if (recw71 !== null) body.reconciliation_with_w71_physics_pct = Number(recw71);
        const ntt = window.prompt('NTT baseline comparison (% improvement, negative=worse):', String(row.ntt_baseline_comparison_pct ?? 35));
        if (ntt !== null) body.ntt_baseline_comparison_pct = Number(ntt);
        const note = window.prompt('Champion promotion notes (replaces W71 12-mode physics).', '');
        if (note !== null) body.notes = note;
      } else if (action === 'retrain') {
        const due = window.prompt('Next retrain due ISO date (e.g. 2026-08-30T00:00:00Z):', row.retrain_due_at ?? '');
        if (due !== null) body.retrain_due_at = due;
        const note = window.prompt('Retrain notes (drift-triggered / scheduled?):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive notes (CEO - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'detect-class-drift') {
        const psi = window.prompt('Observed class-PSI (>=0.25 = heavy drift):', String(row.class_drift_psi ?? 0.30));
        if (psi !== null) body.class_drift_psi = Number(psi);
        const note = window.prompt(
          'Class drift notes. NOTE: crosses regulator on HEAVY tiers WHEN regulator_reportable_misclass.',
          '',
        );
        if (note !== null) body.notes = note;
      } else if (action === 'rollback-model') {
        const reason = window.prompt(
          'Rollback reason. NOTE: SIGNATURE - W129 inherits W127-ML-ROLLBACK Phase-D hard line. Crosses regulator EVERY tier (THIRD Phase-D rollback signature; ISO 42001 + NIST AI RMF + SOC 2 + NERC CIP-013 + SOX).',
          row.reason_code ?? 'champion_underperforming',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'recall-model') {
        const reason = window.prompt(
          'Recall reason. NOTE: HARD safety pull; crosses regulator EVERY tier WHEN safety_critical_fault_class (NERC CIP-013 + ISO 42001 RCA + EU AI Act Art 21).',
          row.reason_code ?? 'safety_misclassification',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'failover-to-physics-baseline') {
        const note = window.prompt(
          'W71 physics failover notes. NOTE: reverts to W71 12-mode rules; reconciliation_with_w71_physics_pct resets to 0; crosses regulator at multi_jurisdiction + fleet_systemic tiers.',
          '',
        );
        if (note !== null) body.notes = note;
      } else if (action === 'add-novel-class') {
        const note = window.prompt(
          'Novel class notes (RE-ENTRY to multiclass_model_trained; class_count+1). NOTE: W129-UNIQUE - EU AI Act Art 14 product-class change; fleet_systemic crosses regulator.',
          '',
        );
        if (note !== null) body.notes = note;
        const cd = window.prompt('Updated class distribution payload (JSON):', row.class_distribution_payload ?? '{}');
        if (cd !== null) body.class_distribution_payload = cd;
      }
      await api.post(`/fault-fingerprint-ml/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/fault-fingerprint-ml', body);
      setShowPropose(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Propose failed');
    }
  }, [load]);

  return (
    <div className="text-[12px] text-[#1a3a5c]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#0c2a4d]">Fault-fingerprint multi-class ML governance (W129)</h2>
          <p className="text-[11px] text-[#4a5568]">
            12-state forward + 4 branch Phase-D multi-class fault classifier BRAIN replacing W71 12-mode physics rules (Sister of W127 anomaly ML + W128 survival ML).
            XGBoost / Random Forest / Gradient Boosting / 1D-CNN / LightGBM / CatBoost / baseline physics (W71).
            Beats AspenTech Mtell pattern-recognition + GE APM fault classification + Uptake Fusion fault library + Augury fault dictionary + C3.ai fault models + SparkCognition SparkPredict classifiers + Petuum + DataRPM diagnostic stacks.
            INVERTED SLA HOURS (single 36 / small 120 / large 300 / multi-juris. 600 / systemic 900). BETWEEN W127 (720h) and W128 (1080h).
            FLOOR-AT-LARGE-FLEET {'≥'}1 flag / FLOOR-AT-FLEET-SYSTEMIC {'≥'}3 flags. W71 12-mode physics bridge NOT NULL + W118 audit bridge mandatory. Stratified train/test split requires {'≥'}30 samples per class (NIST AI RMF).
            SIGNATURE W129: rollback_model crosses EVERY tier (THIRD Phase-D rollback signature inheriting W127-ML-ROLLBACK hard line). W129-UNIQUE: add_novel_class crosses regulator at fleet_systemic (EU AI Act Art 14 product-class change; RE-ENTRY to multiclass_model_trained).
            Internal ML governance chain (no public peer endpoint).
          </p>
        </div>
        {!regulatorView && (
          <button type="button"
            onClick={() => setShowPropose(true)}
            className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]"
          >
            + Propose model
          </button>
        )}
      </div>

      {/* 8-card KPI strip */}
      <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <Kpi label="Total"            value={kpis.total} />
        <Kpi label="Active"           value={kpis.active_count} />
        <Kpi label="Live A/B"         value={kpis.live_ab_count} tone="ok" />
        <Kpi label="Champion"         value={kpis.champion_count} tone="ok" />
        <Kpi label="Rolled back"      value={kpis.rolled_back_count} tone={kpis.rolled_back_count > 0 ? 'bad' : undefined} />
        <Kpi label="Recalled"         value={kpis.recalled_count} tone={kpis.recalled_count > 0 ? 'bad' : undefined} />
        <Kpi label="SLA breached"     value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <Kpi label="Control avg"      value={`${kpis.control_effectiveness_avg}/130`} />
      </div>

      {/* Drill rail */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px] text-[#4a5568]">
        <span>Proposed: <span className="font-semibold text-[#1a3a5c]">{kpis.proposed_count}</span></span>
        <span>Dataset: <span className="font-semibold text-[#1a3a5c]">{kpis.labeled_bound_count}</span></span>
        <span>Imbal.: <span className="font-semibold text-[#1a3a5c]">{kpis.imbalance_resolved_count}</span></span>
        <span>Features: <span className="font-semibold text-[#1a3a5c]">{kpis.features_count}</span></span>
        <span>Split: <span className="font-semibold text-[#1a3a5c]">{kpis.split_count}</span></span>
        <span>Trained: <span className="font-semibold text-[#1a3a5c]">{kpis.trained_count}</span></span>
        <span>CM valid.: <span className="font-semibold text-[#a06200]">{kpis.confusion_matrix_validated_count}</span></span>
        <span>Calibrated: <span className="font-semibold text-[#a06200]">{kpis.calibrated_count}</span></span>
        <span>Shadow: <span className="font-semibold text-[#a06200]">{kpis.shadow_count}</span></span>
        <span>Retrained: <span className="font-semibold text-[#1f6b3a]">{kpis.retrained_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Class drift: <span className="font-semibold text-[#a06200]">{kpis.class_drift_count}</span></span>
        <span>W71 failover: <span className="font-semibold text-[#a06200]">{kpis.failover_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Floor flags: <span className="font-semibold text-[#a06200]">{kpis.floor_flag_total}</span></span>
        <span>Retrain {'<'}60d: <span className="font-semibold text-[#a06200]">{kpis.retrain_within_60d}</span></span>
        <span>Retrain {'<'}14d: <span className="font-semibold text-[#9b1f1f]">{kpis.retrain_within_14d}</span></span>
        <span>Card exp. {'<'}30d: <span className="font-semibold text-[#9b1f1f]">{kpis.model_card_expiring_30d}</span></span>
        <span>Strat. fail: <span className="font-semibold text-[#9b1f1f]">{kpis.min_samples_floor_fail_count}</span></span>
        <span>W118: <span className="font-semibold text-[#1a3a5c]">{kpis.w118_bridged_count}</span></span>
        <span>W71: <span className="font-semibold text-[#1a3a5c]">{kpis.w71_bridged_count}</span></span>
        <span>W15: <span className="font-semibold text-[#1a3a5c]">{kpis.w15_bridged_count}</span></span>
        <span>W41: <span className="font-semibold text-[#1a3a5c]">{kpis.w41_bridged_count}</span></span>
        <span>W63: <span className="font-semibold text-[#1a3a5c]">{kpis.w63_bridged_count}</span></span>
      </div>

      {/* Row 1: action / priority pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 2: lifecycle */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_LIFECYCLE.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 3: tier */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_TIER.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#7a0e0e] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 4: model family */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_FAMILY.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Row 5: asset class */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS_ASSET.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#1f6b3a] text-white'
                : 'bg-white text-[#6b7685] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Model #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Family / asset</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Health</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Scope</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Ctrl</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Retrain</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Card</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-center">Flags</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.model_health_band_live ?? r.model_health_band ?? 'green'];
                const control = r.control_effectiveness_index_live ?? r.control_effectiveness_index ?? 0;
                const retrainDays = r.days_to_retrain_due_live ?? r.days_to_retrain_due ?? null;
                const cardDays = r.days_to_model_card_expiry_live ?? r.days_to_model_card_expiry ?? null;
                const flags = r.floor_flag_count_live ?? 0;
                const scope = `${r.assets_covered ?? 0}a/${r.jurisdiction_count ?? 0}j${r.safety_critical ? '/SC' : ''}`;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      <div className="text-[11px] font-semibold">{r.model_number}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.model_version ?? '-'}</div>
                      {r.is_reportable_flag ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span> : null}
                      {r.regulator_ref ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">FILED</span> : null}
                      {r.floor_at_fleet_systemic_live ? <span className="ml-1 text-[9px] font-semibold text-[#7a0e0e]">SYS</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono text-[#1a3a5c]">
                      {fmtFamily(r.model_family)}
                      <div className="text-[10px] text-[#6b7685]">{fmtAssetClass(r.asset_class)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: health.bg, color: health.fg }}>
                        {health.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[11px] font-mono text-[#0c2a4d]">
                      {scope}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${control >= 100 ? 'text-[#1f5b3a]' : control >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {control}/130
                    </td>
                    <td className={`px-3 py-2 text-center text-[10px] uppercase tracking-wider ${retrainDays != null && retrainDays < 14 ? 'text-[#9b1f1f] font-semibold' : retrainDays != null && retrainDays < 60 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>
                      {retrainDays != null ? `${retrainDays}d` : '-'}
                    </td>
                    <td className={`px-3 py-2 text-center text-[10px] uppercase tracking-wider ${cardDays != null && cardDays < 14 ? 'text-[#9b1f1f] font-semibold' : cardDays != null && cardDays < 30 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>
                      {cardDays != null ? `${cardDays}d` : '-'}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${flags >= 3 ? 'text-[#7a0e0e] font-semibold' : flags >= 1 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>
                      {flags}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No models match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} regulatorView={!!regulatorView} />
      )}

      {showPropose && (
        <ProposeModal onClose={() => setShowPropose(false)} onSubmit={propose} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'ok' ? '#1f5b3a' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct, regulatorView,
}: {
  row: FfmlRow;
  events: FfmlEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: FfmlRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
  const retrainDays = row.days_to_retrain_due_live ?? row.days_to_retrain_due ?? null;
  const cardDays = row.days_to_model_card_expiry_live ?? row.days_to_model_card_expiry ?? null;
  const flags = row.floor_flag_count_live ?? 0;
  const cm = row.confusion_matrix_parsed ?? null;
  const classDist = row.class_distribution_parsed ?? null;

  // Active non-terminal set for branch actions.
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

  const canDrift      = DRIFT_FROM.includes(row.chain_status);
  const canFailover   = FAILOVER_FROM.includes(row.chain_status);
  const canRollback   = ACTIVE_NON_TERMINAL.includes(row.chain_status);
  const canRecall     = ACTIVE_NON_TERMINAL.includes(row.chain_status);
  const canNovelClass = NOVEL_CLASS_FROM.includes(row.chain_status);

  const renderAct = (action: ActionKind, label: string, tone: 'primary' | 'danger' | 'amber' | 'plain' = 'plain') => {
    const cls = tone === 'primary'
      ? 'bg-[#c2873a] text-white hover:bg-[#c2873a]'
      : tone === 'danger'
        ? 'bg-[#7a0e0e] text-white hover:bg-[#9b1f1f]'
        : tone === 'amber'
          ? 'bg-[#a06200] text-white hover:bg-[#c97a00]'
          : 'bg-white border border-[#d8dde6] text-[#1a3a5c] hover:bg-[#f3f5f9]';
    return (
      <button type="button"
        key={action}
        onClick={() => onAct(action, row)}
        className={`rounded px-3 py-1.5 text-[11px] font-semibold ${cls}`}
        title={ACTION_LABEL[action]}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <div className="w-full max-w-3xl overflow-y-auto bg-[#f3f5f9] p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">
              {fmtFamily(row.model_family)} {'•'} {fmtAssetClass(row.asset_class)} {'•'} {row.current_tier.replace(/_/g, ' ')}
              {row.assets_covered != null ? <> {'•'} {row.assets_covered}a/{row.jurisdiction_count ?? 0}j{row.safety_critical ? '/SC' : ''}</> : null}
            </div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.model_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'Fault-fingerprint multi-class ML (W129 - replaces W71 12-mode physics)'}
              {row.model_version ? <> {'•'} v<span className="font-mono">{row.model_version}</span></> : null}
              {row.training_dataset_hash ? <> {'•'} dataset <span className="font-mono text-[10px]">{row.training_dataset_hash.slice(0, 12)}</span></> : null}
              {row.class_count != null ? <> {'•'} {row.class_count} classes</> : null}
              {row.feature_count != null ? <> {'•'} {row.feature_count} features</> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Close</button>
        </div>

        {/* 4 scoring indexes */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label="Control eff." value={`${control}/130`} tone={control >= 100 ? 'ok' : control >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Retrain days" value={retrainDays != null ? `${retrainDays}d` : '-'} tone={retrainDays != null && retrainDays < 14 ? 'bad' : retrainDays != null && retrainDays < 60 ? 'warn' : 'ok'} />
          <Kpi label="Card days" value={cardDays != null ? `${cardDays}d` : '-'} tone={cardDays != null && cardDays < 14 ? 'bad' : cardDays != null && cardDays < 30 ? 'warn' : 'ok'} />
          <Kpi label="SLA window" value={`${row.sla_target_hours ?? 0}h`} />
        </div>

        {/* Multi-class performance battery */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Macro F1</div>
            <div className={`font-mono text-[12px] ${(row.macro_f1 ?? 0) >= 0.85 ? 'text-[#1f5b3a]' : (row.macro_f1 ?? 0) >= 0.7 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>{row.macro_f1 ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Micro F1</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.micro_f1 ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Weighted recall</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.weighted_recall ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Top-3 acc.</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.top_3_accuracy ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Log loss</div>
            <div className={`font-mono text-[12px] ${(row.log_loss ?? 0) > 1.0 ? 'text-[#9b1f1f] font-semibold' : (row.log_loss ?? 0) > 0.5 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.log_loss ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ROC AUC macro</div>
            <div className={`font-mono text-[12px] ${(row.roc_auc_macro ?? 0) >= 0.9 ? 'text-[#1f5b3a]' : (row.roc_auc_macro ?? 0) >= 0.7 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>{row.roc_auc_macro ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">CM density</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.confusion_matrix_density ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Class imbal.</div>
            <div className={`font-mono text-[12px] ${(row.class_imbalance_ratio ?? 1) > 50 ? 'text-[#9b1f1f] font-semibold' : (row.class_imbalance_ratio ?? 1) > 10 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.class_imbalance_ratio ?? '-'}:1</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Calib. Brier</div>
            <div className={`font-mono text-[12px] ${(row.calibration_brier ?? 0) > 0.20 ? 'text-[#9b1f1f] font-semibold' : (row.calibration_brier ?? 0) > 0.10 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.calibration_brier ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Class drift PSI</div>
            <div className={`font-mono text-[12px] ${(row.class_drift_psi ?? 0) >= 0.25 ? 'text-[#9b1f1f] font-semibold' : (row.class_drift_psi ?? 0) >= 0.10 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.class_drift_psi ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Novel detect.</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.novel_class_detection_rate ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">W71 phys. recon. %</div>
            <div className={`font-mono text-[12px] ${(row.reconciliation_with_w71_physics_pct ?? 0) >= 90 ? 'text-[#1f5b3a]' : (row.reconciliation_with_w71_physics_pct ?? 0) >= 70 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>{row.reconciliation_with_w71_physics_pct ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">NTT baseline %</div>
            <div className={`font-mono text-[12px] ${(row.ntt_baseline_comparison_pct ?? 0) >= 30 ? 'text-[#1f5b3a]' : (row.ntt_baseline_comparison_pct ?? 0) < 0 ? 'text-[#9b1f1f] font-semibold' : 'text-[#a06200]'}`}>{row.ntt_baseline_comparison_pct ?? '-'}%</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Latency p50</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.inference_latency_p50_ms ?? '-'} ms</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Latency p99</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.inference_latency_p99_ms ?? '-'} ms</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Min/class</div>
            <div className={`font-mono text-[12px] ${row.min_samples_per_class_ok_live === false ? 'text-[#9b1f1f] font-semibold' : 'text-[#1f5b3a]'}`}>{row.min_samples_per_class ?? '-'} (≥30)</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Model card</div>
            <div className={`font-mono text-[12px] ${row.model_card_status === 'published' ? 'text-[#1f5b3a]' : row.model_card_status === 'expired' ? 'text-[#9b1f1f] font-semibold' : row.model_card_status === 'approved' ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>{row.model_card_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ISO 42001</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.iso_42001_compliance_score ?? '-'}/130</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">ISO 27001</div>
            <div className={`font-mono text-[12px] ${row.iso27001_controls_ok ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.iso27001_controls_ok ? 'OK' : 'NO'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">SOC 2 II</div>
            <div className={`font-mono text-[12px] ${row.soc2_type2_controls_ok ? 'text-[#1f5b3a]' : 'text-[#a06200]'}`}>{row.soc2_type2_controls_ok ? 'OK' : 'NO'}</div>
          </div>
        </div>

        {/* Confusion matrix (if available) */}
        {cm && Array.isArray(cm) && cm.length > 0 && (
          <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
              Confusion matrix ({cm.length}×{cm[0]?.length ?? 0}) - rows = actual, cols = predicted; diagonal = correct
            </div>
            <div className="overflow-x-auto">
              <table className="text-[10px] font-mono">
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
                        const fg = isDiag && intensity > 50 ? '#fff' : '#0c2a4d';
                        return (
                          <td
                            key={j}
                            className="border border-[#e3e7ec] px-2 py-1 text-right tabular-nums"
                            style={{ background: bg, color: fg }}
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

        {/* Class distribution (if available) */}
        {classDist && typeof classDist === 'object' && Object.keys(classDist).length > 0 && (
          <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
              Class distribution ({Object.keys(classDist).length} classes)
            </div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {Object.entries(classDist).map(([cls, n]) => {
                const maxN = Math.max(...Object.values(classDist).map((v) => Number(v) || 0));
                const ratio = maxN > 0 ? Number(n) / maxN : 0;
                return (
                  <div key={cls} className="flex items-center gap-2">
                    <span className="w-32 truncate text-[10px] font-mono text-[#1a3a5c]" title={cls}>{cls}</span>
                    <div className="relative h-2 flex-1 rounded bg-[#e3e7ec]">
                      <div className="absolute inset-y-0 left-0 rounded bg-[#c2873a]" style={{ width: `${ratio * 100}%` }} />
                    </div>
                    <span className="w-12 text-right text-[10px] tabular-nums text-[#0c2a4d]">{Number(n).toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Floor flags */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
            Floor flags ({flags}/5) - FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-FLEET-SYSTEMIC {'≥'}3
          </div>
          <div className="grid grid-cols-5 gap-2">
            <FlagPill on={!!row.safety_critical_fault_class} label="Safety-crit. class" />
            <FlagPill on={!!row.regulator_reportable_misclass} label="Reg reportable misclass" />
            <FlagPill on={!!row.nerc_cip_audit_in_scope} label="NERC CIP-013" />
            <FlagPill on={!!row.sox_ml_governance_required} label="SOX ML gov." />
            <FlagPill on={!!row.iso_42001_required} label="ISO 42001" />
          </div>
        </div>

        {/* Bridges */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Cross-chain bridges (W71 NOT NULL + W118 mandatory)</div>
          <div className="grid grid-cols-5 gap-2">
            <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="W118 audit" />
            <BridgePill on={!!row.bridges_to_w71_asset_prognostics_live} label="W71 12-mode physics" />
            <BridgePill on={!!row.bridges_to_w15_warranty_claim_live} label="W15 warranty / RMA" />
            <BridgePill on={!!row.bridges_to_w41_problem_management_live} label="W41 problem mgmt" />
            <BridgePill on={!!row.bridges_to_w63_warranty_recovery_live} label="W63 warranty recov." />
          </div>
        </div>

        {/* Regulator + reason */}
        {(row.is_reportable_flag || row.regulator_ref || row.regulator_inbox_ref || row.reason_code) && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-[11px] text-[#7a1f1f]">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#9b1f1f]">Regulator crossing</div>
            {row.reason_code && <div>Reason: <span className="font-mono">{row.reason_code}</span></div>}
            {row.regulator_reason_text && <div>Detail: {row.regulator_reason_text}</div>}
            {row.regulator_ref && <div>Filed ref: <span className="font-mono">{row.regulator_ref}</span></div>}
            {row.regulator_inbox_ref && <div>Inbox: <span className="font-mono">{row.regulator_inbox_ref}</span></div>}
            {row.regulator_crossed_at && <div>Crossed at: {fmtDate(row.regulator_crossed_at)}</div>}
          </div>
        )}

        {/* Action bar */}
        {!regulatorView && !row.is_hard_terminal && (
          <div className="mb-4 flex flex-wrap gap-2 rounded border border-[#d8dde6] bg-white p-3">
            {nextAction && renderAct(nextAction, ACTION_LABEL[nextAction].split('(')[0].trim(), 'primary')}
            {canDrift && row.chain_status !== 'class_drift_detected' && renderAct('detect-class-drift', 'Detect class drift', 'amber')}
            {canFailover && renderAct('failover-to-physics-baseline', 'Failover to W71 physics', 'amber')}
            {canNovelClass && renderAct('add-novel-class', 'Add novel class (W129-UNIQUE)', 'amber')}
            {canRollback && renderAct('rollback-model', 'ROLLBACK (SIGNATURE)', 'danger')}
            {canRecall && renderAct('recall-model', 'RECALL (HARD)', 'danger')}
          </div>
        )}

        {/* Timeline */}
        <div className="rounded border border-[#d8dde6] bg-white">
          <div className="border-b border-[#e3e7ec] px-3 py-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Timeline</div>
          <ol className="divide-y divide-[#e3e7ec]">
            {events.length === 0 && (
              <li className="px-3 py-3 text-[11px] text-[#6b7685]">No events.</li>
            )}
            {events.map((e) => (
              <li key={e.id} className="px-3 py-2 text-[11px]">
                <div className="font-semibold text-[#1a3a5c]">{e.event_type}</div>
                <div className="text-[10px] text-[#4a5568]">
                  {e.from_status || '-'} {'→'} {e.to_status || '-'}
                  {e.actor_party ? <> {'•'} {e.actor_party}</> : null}
                  {' '}{'•'} {fmtDate(e.created_at)}
                </div>
                {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[#7a0e0e] text-white' : 'bg-[#e3e7ec] text-[#6b7685]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

function BridgePill({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[#c2873a] text-white' : 'bg-[#e3e7ec] text-[#6b7685]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

const FAMILY_OPTIONS: Array<{ key: FfmlFamily; label: string }> = [
  { key: 'xgboost',           label: 'XGBoost' },
  { key: 'random_forest',     label: 'Random Forest' },
  { key: 'gradient_boosting', label: 'Gradient Boosting' },
  { key: 'cnn_1d',            label: '1D-CNN (deep)' },
  { key: 'lightgbm',          label: 'LightGBM' },
  { key: 'catboost',          label: 'CatBoost' },
  { key: 'baseline_physics',  label: 'Baseline physics (W71 12-mode)' },
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded bg-white p-4 text-[12px] text-[#1a3a5c]">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#0c2a4d]">Propose fault-fingerprint ML model (W129)</h3>
            <p className="text-[11px] text-[#4a5568]">
              W71 12-mode physics baseline bridge REQUIRED (NOT NULL constraint - needed for reconciliation + failover target). W118 audit bridge mandatory.
              Tier auto-derived from (assets_covered, jurisdiction_count, safety_critical) with FLOOR-AT-LARGE-FLEET {'≥'}1 flag and FLOOR-AT-FLEET-SYSTEMIC {'≥'}3 flags.
              Replaces W71 12-mode physics rules (XGBoost / RF / GB / 1D-CNN / LightGBM / CatBoost). Stratified split requires {'≥'}30 samples per class (NIST AI RMF).
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Close</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Model family">
            <select value={family} onChange={(e) => setFamily(e.target.value as FfmlFamily)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {FAMILY_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Asset class">
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as FfmlAssetClass)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {ASSET_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Model version (semver)">
            <input value={modelVersion} onChange={(e) => setModelVersion(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="1.0.0" />
          </Field>
          <Field label="Assets covered (fleet scope)">
            <input value={assetsCovered} onChange={(e) => setAssetsCovered(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="50" />
          </Field>
          <Field label="Jurisdiction count">
            <input value={jurisdictions} onChange={(e) => setJurisdictions(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="1" />
          </Field>
          <Field label="Safety-critical (national)?">
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={safetyCritical} onChange={(e) => setSafetyCritical(e.target.checked)} />
              National safety-critical (forces fleet_systemic with 3+ juris)
            </label>
          </Field>
          <Field label="Feature count">
            <input value={featureCount} onChange={(e) => setFeatureCount(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="64" />
          </Field>
          <Field label="Class count (12 W71 default)">
            <input value={classCount} onChange={(e) => setClassCount(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="12" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Northern Cape PV inverter XGBoost v1" />
          </Field>
          <Field label="W71 12-mode physics ref (REQUIRED - NOT NULL)">
            <input value={w71} onChange={(e) => setW71(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="aprog-2026-007" />
          </Field>
          <Field label="W118 block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="W15 warranty / RMA ref">
            <input value={w15} onChange={(e) => setW15(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="claim-2026-0007" />
          </Field>
          <Field label="W41 problem mgmt ref">
            <input value={w41} onChange={(e) => setW41(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="prob-2026-0011" />
          </Field>
          <Field label="W63 warranty recovery ref">
            <input value={w63} onChange={(e) => setW63(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="wrec-2026-0019" />
          </Field>
        </div>

        <div className="mt-3 rounded border border-[#d8dde6] bg-[#f8fafc] p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Floor flags (FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-FLEET-SYSTEMIC {'≥'}3)</div>
          <div className="grid grid-cols-3 gap-2">
            <Checkbox checked={safetyCriticalClass} onChange={setSafetyCriticalClass} label="Safety-critical fault class" />
            <Checkbox checked={regReportable} onChange={setRegReportable} label="Reg-reportable misclass" />
            <Checkbox checked={nercCip} onChange={setNercCip} label="NERC CIP-013 audit" />
            <Checkbox checked={soxMl} onChange={setSoxMl} label="SOX ML governance" />
            <Checkbox checked={iso42001} onChange={setIso42001} label="ISO 42001 AIMS" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1.5 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Cancel</button>
          <button type="button" onClick={submit} className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]">Propose model</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] text-[#4a5568]">
      <div className="mb-1 text-[10px] uppercase tracking-wider">{label}</div>
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
    <label className="flex items-center gap-2 text-[11px] text-[#1a3a5c]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
