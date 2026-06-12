// Wave 128 - RUL Prediction ML Model lifecycle chain.
//
// PHASE D WAVE 2 OF 4. Survival/Cox PH ML models replacing W71 OLS-style
// degradation slope. Sister of W127 (which replaces the W71 anomaly
// heuristic). Cox PH / AFT / DeepSurv / Random-Survival-Forest /
// XGB-Survival models against the same SCADA / IIoT / settlement /
// ERP streams Phase C wired.
//
// Beats AspenTech Mtell RUL / GE APM survival / Uptake Fusion prognostics
// / Augury RUL / C3.ai reliability / SparkCognition SparkPredict RUL /
// Petuum / DataRPM survival stacks. Maintains reconciliation with the
// W71 OLS baseline for monotonic-replacement proof (KM-lift-vs-OLS).
//
// Mounted at /admin/workstation?tab=rul-prediction-ml,
// /ipp/workstation?tab=rul-prediction-ml, and
// /support/workstation?tab=rul-prediction-ml - three workstations
// (write {admin,support}; admin/ipp/support all READ).
//
// 12-state forward + 4 branch lifecycle:
//   model_proposed -> survival_dataset_bound -> features_engineered ->
//     train_test_split -> model_trained -> backtest_validated ->
//     calibrated -> shadow_deployed -> live_ab_active ->
//     champion_promoted -> retrained -> archived (HARD)
//   any non-terminal -> rollback_model -> rolled_back (HARD - SIGNATURE)
//   any non-terminal -> recall_model -> recalled (HARD - safety)
//   any active -> detect_drift -> drift_detected (SOFT)
//   live -> activate_failover_to_ols -> failover_to_ols (SOFT)
//
// 5-tier INVERTED SLA polarity (HOURS):
//   single_asset 24 / small_fleet 96 / large_fleet 240 /
//   multi_jurisdiction_fleet 480 / fleet_systemic 720.
// LONGER shadow_deployed (72-1080h) + LONGER survival_dataset_bound
// (48-720h) than W127 - survival models need censored-event maturation.
//
// FLOOR-AT-LARGE-FLEET on {'>='}1 of 5 flags; FLOOR-AT-FLEET-SYSTEMIC
// on {'>='}3 flags:
//   - safety_critical_rul
//   - regulator_reportable_rul_quantile
//   - nerc_cip_audit_in_scope
//   - sox_ml_governance_required
//   - iso_42001_ai_management_required
//
// SIGNATURE W128 regulator crossings (W128-RUL-ROLLBACK):
//   * rollback_model EVERY tier (SECOND Phase-D hard line)
//   * recall_model EVERY tier WHEN safety_critical_rul
//   * detect_drift HEAVY tiers WHEN regulator_reportable_rul_quantile
//     OR (PH-violated AND fleet_systemic)
//   * activate_failover_to_ols multi_jurisdiction + fleet_systemic
//   * promote_champion fleet_systemic WHEN iso_42001 (W128-UNIQUE -
//     replacing OLS at national systemic scale is itself a regulator-
//     reportable governance event; W127 does NOT have this crossing)
//   * sla_breached HEAVY only (large_fleet+)
//
// 5 bridges (W71 NOT NULL + W118 MANDATORY): W71 asset prognostics (the
// OLS baseline this REPLACES) + W21 lender drawdown + W77 reserve account
// + W63 warranty recovery + W118 audit chain.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type RpmStatus =
  | 'model_proposed' | 'survival_dataset_bound' | 'features_engineered'
  | 'train_test_split' | 'model_trained' | 'backtest_validated'
  | 'calibrated' | 'shadow_deployed' | 'live_ab_active'
  | 'champion_promoted' | 'retrained' | 'archived'
  | 'drift_detected' | 'rolled_back' | 'recalled' | 'failover_to_ols';

type RpmTier =
  | 'single_asset' | 'small_fleet' | 'large_fleet'
  | 'multi_jurisdiction_fleet' | 'fleet_systemic';
type RpmUrgency = 'low' | 'medium' | 'high' | 'critical' | 'systemic';
type RpmAuthority = 'ml_engineer' | 'data_steward' | 'CTO' | 'CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type RpmFamily =
  | 'cox_ph' | 'aft' | 'deepsurv' | 'rsf' | 'xgb_surv' | 'baseline_ols';
type RpmAssetClass =
  | 'wind_turbine' | 'pv_inverter' | 'battery_storage' | 'transformer'
  | 'transmission_line' | 'substation' | 'hydrogen_electrolyser'
  | 'grid_scada' | 'smart_meter' | 'generic';
type ModelCardStatus = 'draft' | 'approved' | 'published' | 'expired';

interface RpmRow {
  [key: string]: unknown;
  id: string;
  model_number: string;
  model_family: RpmFamily | string;
  model_version: string | null;
  training_dataset_hash: string | null;
  feature_count: number | null;
  asset_class: RpmAssetClass | string;
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
  w21_lender_drawdown_ref: string | null;
  w77_reserve_account_ref: string | null;
  w63_warranty_recovery_ref: string | null;
  w118_block_ref: string | null;
  safety_critical_rul: number;
  regulator_reportable_rul_quantile: number;
  nerc_cip_audit_in_scope: number;
  sox_ml_governance_required: number;
  iso_42001_ai_management_required: number;
  concordance_index: number | null;
  time_dependent_auc: number | null;
  brier_score: number | null;
  partial_likelihood: number | null;
  ph_assumption_pvalue: number | null;
  ph_violated_count: number | null;
  kaplan_meier_lift_vs_ols: number | null;
  rul_p10_days: number | null;
  rul_p50_days: number | null;
  rul_p90_days: number | null;
  rul_p50_mae_days: number | null;
  censoring_rate: number | null;
  reconciliation_with_w71_ols_pct: number | null;
  ntt_baseline_comparison_pct: number | null;
  inference_latency_p50_ms: number | null;
  inference_latency_p99_ms: number | null;
  inference_throughput_per_sec: number | null;
  model_card_status: ModelCardStatus | null;
  iso27001_controls_ok: number;
  soc2_type2_controls_ok: number;
  iso_42001_compliance_score: number | null;
  control_effectiveness_index: number | null;
  current_tier: RpmTier;
  authority_required: RpmAuthority | null;
  urgency_band: RpmUrgency | null;
  model_health_band: HealthBand | null;
  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
  chain_status: RpmStatus;
  model_proposed_at: string | null;
  survival_dataset_bound_at: string | null;
  features_engineered_at: string | null;
  train_test_split_at: string | null;
  model_trained_at: string | null;
  backtest_validated_at: string | null;
  calibrated_at: string | null;
  shadow_deployed_at: string | null;
  live_ab_active_at: string | null;
  champion_promoted_at: string | null;
  retrained_at: string | null;
  archived_at: string | null;
  drift_detected_at: string | null;
  rolled_back_at: string | null;
  recalled_at: string | null;
  failover_to_ols_at: string | null;
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
  urgency_band_live?: RpmUrgency;
  authority_required_live?: RpmAuthority;
  days_to_retrain_due_live?: number;
  days_to_model_card_expiry_live?: number;
  floor_flag_count_live?: number;
  floor_at_large_fleet_live?: boolean;
  floor_at_fleet_systemic_live?: boolean;
  control_effectiveness_index_live?: number;
  model_health_band_live?: HealthBand;
  concordance_index_live?: number;
  time_dependent_auc_live?: number;
  brier_score_live?: number;
  partial_likelihood_live?: number;
  ph_assumption_pvalue_live?: number;
  ph_violated_count_live?: number;
  kaplan_meier_lift_vs_ols_live?: number;
  rul_p10_days_live?: number;
  rul_p50_days_live?: number;
  rul_p90_days_live?: number;
  censoring_rate_live?: number;
  model_family_live?: string;
  reconciliation_with_w71_ols_live?: number;
  ntt_baseline_comparison_pct_live?: number;
  bridges_to_w71_asset_prognostics_live?: boolean;
  bridges_to_w21_lender_drawdown_live?: boolean;
  bridges_to_w77_reserve_account_live?: boolean;
  bridges_to_w63_warranty_recovery_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
}

interface RpmEvent {
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

const STATE_TONE: Record<RpmStatus, { bg: string; fg: string; label: string }> = {
  model_proposed:           { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  survival_dataset_bound:   { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Surv. ds' },
  features_engineered:      { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Features' },
  train_test_split:         { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Split' },
  model_trained:            { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Trained' },
  backtest_validated:       { bg: '#fff4d6', fg: '#a06200', label: 'Backtest' },
  calibrated:               { bg: '#fff4d6', fg: '#a06200', label: 'Calibrated' },
  shadow_deployed:          { bg: '#fff4d6', fg: '#a06200', label: 'Shadow' },
  live_ab_active:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Live A/B' },
  champion_promoted:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Champion' },
  retrained:                { bg: '#daf5e2', fg: '#1f6b3a', label: 'Retrained' },
  archived:                 { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  drift_detected:           { bg: '#fff4d6', fg: '#a06200', label: 'Drift' },
  rolled_back:              { bg: '#7a0e0e', fg: '#fff',    label: 'Rolled back' },
  recalled:                 { bg: '#7a0e0e', fg: '#fff',    label: 'Recalled' },
  failover_to_ols:          { bg: '#fff4d6', fg: '#a06200', label: 'OLS failover' },
};

const TIER_TONE: Record<RpmTier, { bg: string; fg: string; label: string }> = {
  single_asset:             { bg: '#e3e7ec', fg: '#557',    label: 'Single asset' },
  small_fleet:              { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Small fleet' },
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
  { key: 'ph_violated',        label: 'PH violated' },
  { key: 'rolled_back',        label: 'Rolled back' },
  { key: 'recalled',           label: 'Recalled' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'model_proposed',          label: 'Proposed' },
  { key: 'survival_dataset_bound',  label: 'Surv. ds' },
  { key: 'features_engineered',     label: 'Features' },
  { key: 'train_test_split',        label: 'Split' },
  { key: 'model_trained',           label: 'Trained' },
  { key: 'backtest_validated',      label: 'Backtest' },
  { key: 'calibrated',              label: 'Calibrated' },
  { key: 'shadow_deployed',         label: 'Shadow' },
  { key: 'live_ab_active',          label: 'Live A/B' },
  { key: 'champion_promoted',       label: 'Champion' },
  { key: 'retrained',               label: 'Retrained' },
  { key: 'archived',                label: 'Archived' },
  { key: 'drift_detected',          label: 'Drift' },
  { key: 'failover_to_ols',         label: 'OLS failover' },
  { key: 'rolled_back',             label: 'Rolled back' },
  { key: 'recalled',                label: 'Recalled' },
];

const FILTERS_TIER: Array<{ key: string; label: string }> = [
  { key: 'tier:single_asset',             label: 'Single asset (24h)' },
  { key: 'tier:small_fleet',              label: 'Small fleet (96h)' },
  { key: 'tier:large_fleet',              label: 'Large fleet (240h)' },
  { key: 'tier:multi_jurisdiction_fleet', label: 'Multi-juris. (480h)' },
  { key: 'tier:fleet_systemic',           label: 'Systemic (720h)' },
];

const FILTERS_FAMILY: Array<{ key: string; label: string }> = [
  { key: 'family:cox_ph',        label: 'Cox PH' },
  { key: 'family:aft',           label: 'AFT' },
  { key: 'family:deepsurv',      label: 'DeepSurv' },
  { key: 'family:rsf',           label: 'RSF' },
  { key: 'family:xgb_surv',      label: 'XGB-Surv' },
  { key: 'family:baseline_ols',  label: 'Baseline OLS (W71)' },
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
  | 'bind-survival-dataset' | 'engineer-features' | 'split-train-test'
  | 'train-model' | 'backtest' | 'calibrate' | 'deploy-shadow'
  | 'activate-live-ab' | 'promote-champion' | 'retrain' | 'archive'
  | 'detect-drift' | 'rollback-model' | 'recall-model'
  | 'activate-failover-to-ols';

const ACTION_FOR_STATE: Partial<Record<RpmStatus, ActionKind>> = {
  model_proposed:           'bind-survival-dataset',
  survival_dataset_bound:   'engineer-features',
  features_engineered:      'split-train-test',
  train_test_split:         'train-model',
  model_trained:            'backtest',
  backtest_validated:       'calibrate',
  calibrated:               'deploy-shadow',
  shadow_deployed:          'activate-live-ab',
  live_ab_active:           'promote-champion',
  champion_promoted:        'retrain',
  retrained:                'archive',
  drift_detected:           'retrain',
  failover_to_ols:          'activate-live-ab',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'bind-survival-dataset':    'Bind survival dataset (ml_engineer - censored-event corpus hash + scope)',
  'engineer-features':        'Engineer features (ml_engineer - covariate count + dataset frozen)',
  'split-train-test':         'Split train/test (ml_engineer - holdout + cross-validation)',
  'train-model':              'Train model (ml_engineer - hyperparameter set + training examples)',
  'backtest':                 'Backtest (ml_engineer - Harrell C + td-AUC + Brier + partial likelihood)',
  'calibrate':                'Calibrate (data_steward - isotonic / sigmoid calibration + PH check)',
  'deploy-shadow':            'Deploy shadow (data_steward - production-mirror inference, no actions)',
  'activate-live-ab':         'ACTIVATE LIVE A/B (CTO - challenger receives traffic; survival inference begins)',
  'promote-champion':         'Promote champion (CTO - challenger wins A/B; replaces W71 OLS - W128-UNIQUE crosses regulator at fleet_systemic + ISO 42001)',
  'retrain':                  'Retrain (CTO - drift-triggered or scheduled re-fit)',
  'archive':                  'Archive (CEO - HARD terminal, retire model)',
  'detect-drift':             'Detect drift (data_steward - PH-assumption violation / hazard-shift; SOFT pause)',
  'rollback-model':           'ROLLBACK MODEL (CTO - SIGNATURE - W128-RUL-ROLLBACK crosses regulator EVERY tier: ISO 42001 + NIST AI RMF + SOC 2 + NERC CIP-013)',
  'recall-model':             'RECALL MODEL (CEO - HARD safety pull; crosses EVERY tier WHEN safety_critical_rul)',
  'activate-failover-to-ols': 'Failover to OLS (data_steward - revert to W71 OLS baseline; multi-juris + systemic crossings)',
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
    cox_ph: 'Cox PH',
    aft: 'AFT',
    deepsurv: 'DeepSurv',
    rsf: 'Random Survival Forest',
    xgb_surv: 'XGBoost-Survival',
    baseline_ols: 'Baseline OLS (W71)',
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
  survival_dataset_bound_count: number;
  features_count: number;
  split_count: number;
  trained_count: number;
  backtest_count: number;
  calibrated_count: number;
  shadow_count: number;
  live_ab_count: number;
  champion_count: number;
  retrained_count: number;
  archived_count: number;
  drift_count: number;
  rolled_back_count: number;
  recalled_count: number;
  failover_count: number;
  breached: number;
  reportable_total: number;
  floor_flag_total: number;
  w71_bridged_count: number;
  w21_bridged_count: number;
  w77_bridged_count: number;
  w63_bridged_count: number;
  w118_bridged_count: number;
  control_effectiveness_avg: number;
  retrain_within_60d: number;
  retrain_within_14d: number;
  model_card_expiring_30d: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  proposed_count: 0, survival_dataset_bound_count: 0, features_count: 0,
  split_count: 0, trained_count: 0, backtest_count: 0,
  calibrated_count: 0, shadow_count: 0, live_ab_count: 0,
  champion_count: 0, retrained_count: 0, archived_count: 0,
  drift_count: 0, rolled_back_count: 0, recalled_count: 0,
  failover_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w71_bridged_count: 0, w21_bridged_count: 0, w77_bridged_count: 0,
  w63_bridged_count: 0, w118_bridged_count: 0,
  control_effectiveness_avg: 0,
  retrain_within_60d: 0, retrain_within_14d: 0,
  model_card_expiring_30d: 0,
};

interface Props {
  regulatorView?: boolean;
}

export function RulPredictionMlTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<RpmRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'rolled_back' : 'active');
  const [selected, setSelected] = useState<RpmRow | null>(null);
  const [events, setEvents] = useState<RpmEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RpmRow[] } & KpiSummary }>('/rul-prediction-ml');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          survival_dataset_bound_count: data.survival_dataset_bound_count || 0,
          features_count: data.features_count || 0,
          split_count: data.split_count || 0,
          trained_count: data.trained_count || 0,
          backtest_count: data.backtest_count || 0,
          calibrated_count: data.calibrated_count || 0,
          shadow_count: data.shadow_count || 0,
          live_ab_count: data.live_ab_count || 0,
          champion_count: data.champion_count || 0,
          retrained_count: data.retrained_count || 0,
          archived_count: data.archived_count || 0,
          drift_count: data.drift_count || 0,
          rolled_back_count: data.rolled_back_count || 0,
          recalled_count: data.recalled_count || 0,
          failover_count: data.failover_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          floor_flag_total: data.floor_flag_total || 0,
          w71_bridged_count: data.w71_bridged_count || 0,
          w21_bridged_count: data.w21_bridged_count || 0,
          w77_bridged_count: data.w77_bridged_count || 0,
          w63_bridged_count: data.w63_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          control_effectiveness_avg: data.control_effectiveness_avg || 0,
          retrain_within_60d: data.retrain_within_60d || 0,
          retrain_within_14d: data.retrain_within_14d || 0,
          model_card_expiring_30d: data.model_card_expiring_30d || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load RUL prediction ML models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { model: RpmRow; events: RpmEvent[] } }>(`/rul-prediction-ml/${id}`);
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
      if (filter === 'ph_violated')     return (r.ph_assumption_pvalue_live ?? r.ph_assumption_pvalue ?? 1) < 0.05;
      if (filter.startsWith('tier:'))   return r.current_tier === filter.slice(5);
      if (filter.startsWith('family:')) return r.model_family === filter.slice(7);
      if (filter.startsWith('asset:'))  return r.asset_class === filter.slice(6);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: RpmRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'bind-survival-dataset') {
        const h = window.prompt('Survival dataset hash (SHA-256):', row.training_dataset_hash ?? '');
        if (h !== null) body.training_dataset_hash = h;
        const ec = window.prompt('Training examples count:', String(row.training_examples_count ?? 100000));
        if (ec !== null) body.training_examples_count = Number(ec);
        const vc = window.prompt('Validation examples count:', String(row.validation_examples_count ?? 20000));
        if (vc !== null) body.validation_examples_count = Number(vc);
        const cens = window.prompt('Censoring rate (0-1, e.g. 0.30 = 30% censored):', String(row.censoring_rate ?? 0.30));
        if (cens !== null) body.censoring_rate = Number(cens);
      } else if (action === 'engineer-features') {
        const fc = window.prompt('Covariate / feature count (post-engineering):', String(row.feature_count ?? 32));
        if (fc !== null) body.feature_count = Number(fc);
      } else if (action === 'split-train-test') {
        const note = window.prompt('Split notes (k-fold / holdout ratio / censoring stratification):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'train-model') {
        const hp = window.prompt('Hyperparameter set hash:', row.hyperparameter_set_hash ?? '');
        if (hp !== null) body.hyperparameter_set_hash = hp;
        const v = window.prompt('Model version (semver e.g. 1.2.0):', row.model_version ?? '1.0.0');
        if (v !== null) body.model_version = v;
      } else if (action === 'backtest') {
        const c = window.prompt('Harrell concordance index (0.5-1.0):', String(row.concordance_index ?? 0.78));
        if (c !== null) body.concordance_index = Number(c);
        const auc = window.prompt('Time-dependent AUC (0.5-1.0):', String(row.time_dependent_auc ?? 0.80));
        if (auc !== null) body.time_dependent_auc = Number(auc);
        const brier = window.prompt('Brier score (0-0.25, lower better):', String(row.brier_score ?? 0.12));
        if (brier !== null) body.brier_score = Number(brier);
        const pl = window.prompt('Partial likelihood (negative log-likelihood):', String(row.partial_likelihood ?? -250));
        if (pl !== null) body.partial_likelihood = Number(pl);
      } else if (action === 'calibrate') {
        const ph = window.prompt('PH-assumption test p-value (Schoenfeld; {>=}0.05 = OK):', String(row.ph_assumption_pvalue ?? 0.42));
        if (ph !== null) body.ph_assumption_pvalue = Number(ph);
        const phv = window.prompt('PH-violated covariate count (0 ideal):', String(row.ph_violated_count ?? 0));
        if (phv !== null) body.ph_violated_count = Number(phv);
        body.model_card_status = window.prompt('Model card status (draft/approved/published):', row.model_card_status ?? 'approved') ?? row.model_card_status ?? 'approved';
      } else if (action === 'deploy-shadow') {
        const p50 = window.prompt('Inference latency p50 (ms):', String(row.inference_latency_p50_ms ?? 18));
        if (p50 !== null) body.inference_latency_p50_ms = Number(p50);
        const p99 = window.prompt('Inference latency p99 (ms):', String(row.inference_latency_p99_ms ?? 65));
        if (p99 !== null) body.inference_latency_p99_ms = Number(p99);
        const tps = window.prompt('Inference throughput per sec:', String(row.inference_throughput_per_sec ?? 150));
        if (tps !== null) body.inference_throughput_per_sec = Number(tps);
      } else if (action === 'activate-live-ab') {
        const p10 = window.prompt('RUL p10 days (10th percentile):', String(row.rul_p10_days ?? 90));
        if (p10 !== null) body.rul_p10_days = Number(p10);
        const p50 = window.prompt('RUL p50 days (median):', String(row.rul_p50_days ?? 240));
        if (p50 !== null) body.rul_p50_days = Number(p50);
        const p90 = window.prompt('RUL p90 days (90th percentile):', String(row.rul_p90_days ?? 480));
        if (p90 !== null) body.rul_p90_days = Number(p90);
        const ch = window.prompt('Challenger model id:', row.challenger_model_id ?? '');
        if (ch !== null) body.challenger_model_id = ch;
        const note = window.prompt('Live A/B notes (NOTE: CTO sign-off; live survival inference begins):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'promote-champion') {
        const kml = window.prompt('Kaplan-Meier lift vs W71 OLS baseline (%):', String(row.kaplan_meier_lift_vs_ols ?? 22));
        if (kml !== null) body.kaplan_meier_lift_vs_ols = Number(kml);
        const recw71 = window.prompt('Reconciliation with W71 OLS baseline (%):', String(row.reconciliation_with_w71_ols_pct ?? 90));
        if (recw71 !== null) body.reconciliation_with_w71_ols_pct = Number(recw71);
        const ntt = window.prompt('NTT baseline comparison (% improvement, negative = worse):', String(row.ntt_baseline_comparison_pct ?? 30));
        if (ntt !== null) body.ntt_baseline_comparison_pct = Number(ntt);
        const mae = window.prompt('RUL p50 MAE in days (lower better):', String(row.rul_p50_mae_days ?? 18));
        if (mae !== null) body.rul_p50_mae_days = Number(mae);
        const note = window.prompt('Champion promotion notes. W128-UNIQUE: replaces W71 OLS - fleet_systemic + ISO 42001 crosses regulator.', '');
        if (note !== null) body.notes = note;
      } else if (action === 'retrain') {
        const due = window.prompt('Next retrain due ISO date (e.g. 2026-08-30T00:00:00Z):', row.retrain_due_at ?? '');
        if (due !== null) body.retrain_due_at = due;
        const note = window.prompt('Retrain notes (drift-triggered / PH violation / scheduled?):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive notes (CEO - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'detect-drift') {
        const ph = window.prompt('Observed PH-assumption p-value (Schoenfeld):', String(row.ph_assumption_pvalue ?? 0.03));
        if (ph !== null) body.ph_assumption_pvalue = Number(ph);
        const phv = window.prompt('PH-violated covariate count:', String(row.ph_violated_count ?? 2));
        if (phv !== null) body.ph_violated_count = Number(phv);
        const note = window.prompt(
          'Drift notes. NOTE: crosses regulator on HEAVY tiers WHEN regulator_reportable_rul_quantile OR (PH violated AND fleet_systemic).',
          '',
        );
        if (note !== null) body.notes = note;
      } else if (action === 'rollback-model') {
        const reason = window.prompt(
          'Rollback reason. NOTE: SIGNATURE - W128-RUL-ROLLBACK crosses regulator EVERY tier (ISO 42001 incident + NIST AI RMF MAP-MEASURE-MANAGE + SOC 2 control failure + NERC CIP-013 audit-evidence-chain). SECOND Phase-D hard line.',
          row.reason_code ?? 'champion_underperforming',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'recall-model') {
        const reason = window.prompt(
          'Recall reason. NOTE: HARD safety pull; crosses regulator EVERY tier WHEN safety_critical_rul (NERC CIP-013 + ISO 42001 RCA + EU AI Act Art 21).',
          row.reason_code ?? 'safety_rul_underestimate',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'activate-failover-to-ols') {
        const note = window.prompt(
          'OLS failover notes. NOTE: revert to W71 OLS baseline; crosses regulator at multi_jurisdiction + fleet_systemic tiers.',
          '',
        );
        if (note !== null) body.notes = note;
      }
      await api.post(`/rul-prediction-ml/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/rul-prediction-ml', body);
      setShowPropose(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Propose failed');
    }
  }, [load]);

  return (
    <div className="text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#0c2a4d]">RUL prediction ML model governance (W128)</h2>
          <p className="text-[11px] text-[#4a5568]">
            12-state forward + 4 branch Phase-D survival/Cox PH ML BRAIN replacing W71 OLS-style degradation slope (Sister of W127). Cox PH / AFT / DeepSurv / Random Survival Forest / XGBoost-Survival / baseline OLS.
            Beats AspenTech Mtell RUL + GE APM survival + Uptake Fusion prognostics + Augury RUL + C3.ai reliability + SparkCognition SparkPredict RUL + Petuum + DataRPM survival stacks.
            INVERTED SLA HOURS (single 24 / small 96 / large 240 / multi-juris. 480 / systemic 720). LONGER shadow_deployed (72-1080h) + survival_dataset_bound (48-720h) than W127.
            FLOOR-AT-LARGE-FLEET {'≥'}1 flag / FLOOR-AT-FLEET-SYSTEMIC {'≥'}3 flags. W71 OLS bridge NOT NULL + W118 audit bridge mandatory.
            SIGNATURE W128-RUL-ROLLBACK: rollback_model crosses EVERY tier (SECOND Phase-D hard line). W128-UNIQUE: promote_champion crosses regulator at fleet_systemic when ISO 42001 (replacing OLS at systemic scale is itself a governance event).
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
        <span>Proposed: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.proposed_count}</span></span>
        <span>Surv. ds: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.survival_dataset_bound_count}</span></span>
        <span>Features: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.features_count}</span></span>
        <span>Split: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.split_count}</span></span>
        <span>Trained: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.trained_count}</span></span>
        <span>Backtest: <span className="font-semibold text-[#a06200]">{kpis.backtest_count}</span></span>
        <span>Calibrated: <span className="font-semibold text-[#a06200]">{kpis.calibrated_count}</span></span>
        <span>Shadow: <span className="font-semibold text-[#a06200]">{kpis.shadow_count}</span></span>
        <span>Retrained: <span className="font-semibold text-[#1f6b3a]">{kpis.retrained_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Drift: <span className="font-semibold text-[#a06200]">{kpis.drift_count}</span></span>
        <span>OLS failover: <span className="font-semibold text-[#a06200]">{kpis.failover_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Floor flags: <span className="font-semibold text-[#a06200]">{kpis.floor_flag_total}</span></span>
        <span>Retrain {'<'}60d: <span className="font-semibold text-[#a06200]">{kpis.retrain_within_60d}</span></span>
        <span>Retrain {'<'}14d: <span className="font-semibold text-[#9b1f1f]">{kpis.retrain_within_14d}</span></span>
        <span>Card exp. {'<'}30d: <span className="font-semibold text-[#9b1f1f]">{kpis.model_card_expiring_30d}</span></span>
        <span>W118: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w118_bridged_count}</span></span>
        <span>W71: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w71_bridged_count}</span></span>
        <span>W21: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w21_bridged_count}</span></span>
        <span>W77: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w77_bridged_count}</span></span>
        <span>W63: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w63_bridged_count}</span></span>
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Model #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Family / asset</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Health</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Scope</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Ctrl</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Retrain</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Card</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Flags</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
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
                    <td className="px-3 py-2 text-[11px] font-mono" style={{ color: 'oklch(0.46 0.16 55)' }}>
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
  row: RpmRow;
  events: RpmEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RpmRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
  const retrainDays = row.days_to_retrain_due_live ?? row.days_to_retrain_due ?? null;
  const cardDays = row.days_to_model_card_expiry_live ?? row.days_to_model_card_expiry ?? null;
  const flags = row.floor_flag_count_live ?? 0;

  // Active non-terminal set for branch actions.
  const ACTIVE_NON_TERMINAL: RpmStatus[] = [
    'model_proposed', 'survival_dataset_bound', 'features_engineered',
    'train_test_split', 'model_trained', 'backtest_validated',
    'calibrated', 'shadow_deployed', 'live_ab_active',
    'champion_promoted', 'retrained', 'drift_detected',
    'failover_to_ols',
  ];
  const DRIFT_FROM: RpmStatus[] = [
    'shadow_deployed', 'live_ab_active', 'champion_promoted',
    'retrained', 'failover_to_ols',
  ];
  const FAILOVER_FROM: RpmStatus[] = ['live_ab_active', 'champion_promoted', 'retrained'];

  const canDrift     = DRIFT_FROM.includes(row.chain_status);
  const canFailover  = FAILOVER_FROM.includes(row.chain_status);
  const canRollback  = ACTIVE_NON_TERMINAL.includes(row.chain_status);
  const canRecall    = ACTIVE_NON_TERMINAL.includes(row.chain_status);

  const renderAct = (action: ActionKind, label: string, tone: 'primary' | 'danger' | 'amber' | 'plain' = 'plain') => {
    const cls = tone === 'primary'
      ? 'bg-[#c2873a] text-white hover:bg-[#c2873a]'
      : tone === 'danger'
        ? 'bg-[#7a0e0e] text-white hover:bg-[#9b1f1f]'
        : tone === 'amber'
          ? 'bg-[#a06200] text-white hover:bg-[#c97a00]'
          : 'bg-white border border-[#d8dde6] hover:bg-[#f3f5f9]';
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
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <div className="w-full max-w-3xl overflow-y-auto bg-[#f3f5f9] p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">
              {fmtFamily(row.model_family)} {'•'} {fmtAssetClass(row.asset_class)} {'•'} {row.current_tier.replace(/_/g, ' ')}
              {row.assets_covered != null ? <> {'•'} {row.assets_covered}a/{row.jurisdiction_count ?? 0}j{row.safety_critical ? '/SC' : ''}</> : null}
            </div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.model_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'RUL prediction ML model (W128 - replaces W71 OLS baseline)'}
              {row.model_version ? <> {'•'} v<span className="font-mono">{row.model_version}</span></> : null}
              {row.training_dataset_hash ? <> {'•'} dataset <span className="font-mono text-[10px]">{row.training_dataset_hash.slice(0, 12)}</span></> : null}
              {row.feature_count != null ? <> {'•'} {row.feature_count} covariates</> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.46 0.16 55)' }}>Close</button>
        </div>

        {/* 4 scoring indexes */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label="Control eff." value={`${control}/130`} tone={control >= 100 ? 'ok' : control >= 60 ? 'warn' : 'bad'} />
          <Kpi label="Retrain days" value={retrainDays != null ? `${retrainDays}d` : '-'} tone={retrainDays != null && retrainDays < 14 ? 'bad' : retrainDays != null && retrainDays < 60 ? 'warn' : 'ok'} />
          <Kpi label="Card days" value={cardDays != null ? `${cardDays}d` : '-'} tone={cardDays != null && cardDays < 14 ? 'bad' : cardDays != null && cardDays < 30 ? 'warn' : 'ok'} />
          <Kpi label="SLA window" value={`${row.sla_target_hours ?? 0}h`} />
        </div>

        {/* Survival performance battery */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Harrell C</div>
            <div className={`font-mono text-[12px] ${(row.concordance_index ?? 0) >= 0.7 ? 'text-[#1f5b3a]' : (row.concordance_index ?? 0) >= 0.6 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>{row.concordance_index ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">td-AUC</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.time_dependent_auc ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Brier</div>
            <div className={`font-mono text-[12px] ${(row.brier_score ?? 0) > 0.20 ? 'text-[#9b1f1f] font-semibold' : (row.brier_score ?? 0) > 0.10 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.brier_score ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Partial likelihood</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.partial_likelihood ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">PH p-value</div>
            <div className={`font-mono text-[12px] ${(row.ph_assumption_pvalue ?? 1) < 0.01 ? 'text-[#9b1f1f] font-semibold' : (row.ph_assumption_pvalue ?? 1) < 0.05 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.ph_assumption_pvalue ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">PH violated</div>
            <div className={`font-mono text-[12px] ${(row.ph_violated_count ?? 0) > 0 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.ph_violated_count ?? 0}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">KM lift vs OLS</div>
            <div className={`font-mono text-[12px] ${(row.kaplan_meier_lift_vs_ols ?? 0) >= 15 ? 'text-[#1f5b3a]' : (row.kaplan_meier_lift_vs_ols ?? 0) < 0 ? 'text-[#9b1f1f] font-semibold' : 'text-[#a06200]'}`}>{row.kaplan_meier_lift_vs_ols ?? '-'}%</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">RUL p50 MAE</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.rul_p50_mae_days ?? '-'}d</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">RUL p10/p50/p90</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.rul_p10_days ?? '-'}/{row.rul_p50_days ?? '-'}/{row.rul_p90_days ?? '-'}d</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Censoring rate</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.censoring_rate ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">W71 OLS recon. %</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.reconciliation_with_w71_ols_pct ?? '-'}</div>
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
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Throughput</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.inference_throughput_per_sec ?? '-'}/s</div>
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
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Retrain due</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtDate(row.retrain_due_at)}</div>
          </div>
        </div>

        {/* Floor flags */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
            Floor flags ({flags}/5) - FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-FLEET-SYSTEMIC {'≥'}3
          </div>
          <div className="grid grid-cols-5 gap-2">
            <FlagPill on={!!row.safety_critical_rul} label="Safety-critical RUL" />
            <FlagPill on={!!row.regulator_reportable_rul_quantile} label="Reg reportable RUL" />
            <FlagPill on={!!row.nerc_cip_audit_in_scope} label="NERC CIP-013" />
            <FlagPill on={!!row.sox_ml_governance_required} label="SOX ML gov." />
            <FlagPill on={!!row.iso_42001_ai_management_required} label="ISO 42001" />
          </div>
        </div>

        {/* Bridges */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Cross-chain bridges (W71 NOT NULL + W118 mandatory)</div>
          <div className="grid grid-cols-5 gap-2">
            <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="W118 audit" />
            <BridgePill on={!!row.bridges_to_w71_asset_prognostics_live} label="W71 OLS baseline" />
            <BridgePill on={!!row.bridges_to_w21_lender_drawdown_live} label="W21 lender drawdown" />
            <BridgePill on={!!row.bridges_to_w77_reserve_account_live} label="W77 reserve account" />
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
            {canDrift && row.chain_status !== 'drift_detected' && renderAct('detect-drift', 'Detect drift', 'amber')}
            {canFailover && renderAct('activate-failover-to-ols', 'Failover to OLS', 'amber')}
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
                <div className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.event_type}</div>
                <div className="text-[10px] text-[#4a5568]">
                  {e.from_status || '-'} {'→'} {e.to_status || '-'}
                  {e.actor_party ? <> {'•'} {e.actor_party}</> : null}
                  {' '}{'•'} {fmtDate(e.created_at)}
                </div>
                {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
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

const FAMILY_OPTIONS: Array<{ key: RpmFamily; label: string }> = [
  { key: 'cox_ph',       label: 'Cox Proportional-Hazards' },
  { key: 'aft',          label: 'Accelerated Failure Time' },
  { key: 'deepsurv',     label: 'DeepSurv (neural net)' },
  { key: 'rsf',          label: 'Random Survival Forest' },
  { key: 'xgb_surv',     label: 'XGBoost Survival' },
  { key: 'baseline_ols', label: 'Baseline OLS (W71 baseline)' },
];

const ASSET_OPTIONS: Array<{ key: RpmAssetClass; label: string }> = [
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
  const [family, setFamily] = useState<RpmFamily>('cox_ph');
  const [assetClass, setAssetClass] = useState<RpmAssetClass>('generic');
  const [modelVersion, setModelVersion] = useState('1.0.0');
  const [assetsCovered, setAssetsCovered] = useState('');
  const [jurisdictions, setJurisdictions] = useState('');
  const [safetyCritical, setSafetyCritical] = useState(false);
  const [featureCount, setFeatureCount] = useState('');
  const [title, setTitle] = useState('');
  const [w118, setW118] = useState('');
  const [w71, setW71]   = useState('');
  const [w21, setW21]   = useState('');
  const [w77, setW77]   = useState('');
  const [w63, setW63]   = useState('');
  const [safetyCriticalRul, setSafetyCriticalRul] = useState(false);
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
      title: title || undefined,
      w118_block_ref: w118 || undefined,
      w71_asset_prognostics_ref: w71 || undefined,
      w21_lender_drawdown_ref: w21 || undefined,
      w77_reserve_account_ref: w77 || undefined,
      w63_warranty_recovery_ref: w63 || undefined,
      safety_critical_rul: safetyCriticalRul ? 1 : 0,
      regulator_reportable_rul_quantile: regReportable ? 1 : 0,
      nerc_cip_audit_in_scope: nercCip ? 1 : 0,
      sox_ml_governance_required: soxMl ? 1 : 0,
      iso_42001_ai_management_required: iso42001 ? 1 : 0,
      regulator_relevant: regulatorRelevant ? 1 : 0,
    };
    onSubmit(body);
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded bg-white p-4 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#0c2a4d]">Propose RUL prediction ML model (W128)</h3>
            <p className="text-[11px] text-[#4a5568]">
              W71 OLS baseline bridge REQUIRED (NOT NULL constraint - needed for KM-lift + reconciliation). W118 audit bridge mandatory.
              Tier auto-derived from (assets_covered, jurisdiction_count, safety_critical) with FLOOR-AT-LARGE-FLEET {'≥'}1 flag and FLOOR-AT-FLEET-SYSTEMIC {'≥'}3 flags.
              Replaces W71 OLS-style degradation slope (survival/Cox PH).
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.46 0.16 55)' }}>Close</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Model family">
            <select value={family} onChange={(e) => setFamily(e.target.value as RpmFamily)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {FAMILY_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Asset class">
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as RpmAssetClass)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
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
          <Field label="Covariate / feature count">
            <input value={featureCount} onChange={(e) => setFeatureCount(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="32" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Eastern Cape wind fleet Cox PH v1" />
          </Field>
          <Field label="W71 OLS baseline ref (REQUIRED - NOT NULL)">
            <input value={w71} onChange={(e) => setW71(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="aprog-2026-007" />
          </Field>
          <Field label="W118 block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="W21 lender drawdown ref">
            <input value={w21} onChange={(e) => setW21(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="draw-2026-0007" />
          </Field>
          <Field label="W77 reserve account ref">
            <input value={w77} onChange={(e) => setW77(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="rac-2026-0011" />
          </Field>
          <Field label="W63 warranty recovery ref">
            <input value={w63} onChange={(e) => setW63(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="wrec-2026-0019" />
          </Field>
        </div>

        <div className="mt-3 rounded border border-[#d8dde6] bg-[#f8fafc] p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Floor flags (FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-FLEET-SYSTEMIC {'≥'}3)</div>
          <div className="grid grid-cols-3 gap-2">
            <Checkbox checked={safetyCriticalRul} onChange={setSafetyCriticalRul} label="Safety-critical RUL" />
            <Checkbox checked={regReportable} onChange={setRegReportable} label="Reg-reportable RUL quantile" />
            <Checkbox checked={nercCip} onChange={setNercCip} label="NERC CIP-013 audit" />
            <Checkbox checked={soxMl} onChange={setSoxMl} label="SOX ML governance" />
            <Checkbox checked={iso42001} onChange={setIso42001} label="ISO 42001 AIMS" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1.5 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.46 0.16 55)' }}>Cancel</button>
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
    <label className="flex items-center gap-2 text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default RulPredictionMlTab;
