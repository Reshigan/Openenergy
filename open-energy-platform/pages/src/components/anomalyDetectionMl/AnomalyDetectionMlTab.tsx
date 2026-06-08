// Wave 127 - Anomaly-Detection ML Model lifecycle chain.
//
// PHASE D opener (W127-W130). Real ML BRAIN replacing the W71 heuristic
// 6-method anomaly ensemble. Beats AspenTech Mtell + GE APM + Uptake
// Fusion + Augury + C3.ai AI/ML + SparkCognition SparkPredict + Petuum
// + DataRPM with platform-native ML governance (ISO 42001 + NIST AI
// RMF + EU AI Act + ISO 27001 + SOC 2 Type II + NERC CIP-013).
//
// Mounted at /admin/workstation?tab=anomaly-detection-ml,
// /ipp/workstation?tab=anomaly-detection-ml, and
// /support/workstation?tab=anomaly-detection-ml - three workstations
// (write {admin,support} - 2 writers; admin/ipp/support all READ).
//
// 12-state forward + 4 branch lifecycle:
//   model_proposed -> dataset_bound -> features_engineered ->
//     train_test_split -> model_trained -> backtest_validated ->
//     calibrated -> shadow_deployed -> live_ab_active ->
//     champion_promoted -> retrained -> archived (HARD)
//   any non-terminal -> rollback_model -> rolled_back (HARD - SIGNATURE)
//   any non-terminal -> recall_model -> recalled (HARD - safety)
//   any active -> detect_drift -> drift_detected (SOFT)
//   live -> activate_failover -> failover_to_baseline (SOFT)
//
// 5-tier INVERTED SLA polarity (HOURS) - bigger fleet = MORE training time:
// single_asset 24 / small_fleet 96 / large_fleet 240 /
// multi_jurisdiction_fleet 480 / fleet_systemic 720.
// FLOOR-AT-LARGE-FLEET {'>='}1 flag / FLOOR-AT-FLEET-SYSTEMIC {'>='}3.
// Flags: safety_critical_inference / regulator_reportable_drift /
//        nerc_cip_audit_in_scope / sox_ml_governance_required /
//        iso_42001_ai_management_required.
//
// SIGNATURE W127 regulator crossings (W127-ML-ROLLBACK):
//   * rollback_model crosses EVERY tier (FIRST Phase-D hard line -
//     ISO 42001 incident + NIST AI RMF MAP-MEASURE-MANAGE + SOC 2
//     control failure + audit-evidence-chain reconciliation mandatory)
//   * recall_model crosses EVERY tier WHEN safety_critical_inference
//   * detect_drift crosses HEAVY tiers WHEN regulator_reportable_drift
//   * activate_failover crosses multi_jurisdiction + fleet_systemic
//   * sla_breached HEAVY only (large_fleet+)
//
// Write {admin, support} (2 writers - SAME AS W71). READ all 9 personas.
// NO public peer endpoint - INTERNAL ML governance chain.
//
// 5 bridges (W118 MANDATORY): W71 asset prognostics (the heuristic this
// REPLACES) + W12 site commissioning + W118 audit chain + W126
// government filing (when regulator_reportable_drift) + W74 NERSA levy
// (when iso_42001 cert).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type AdmlStatus =
  | 'model_proposed' | 'dataset_bound' | 'features_engineered'
  | 'train_test_split' | 'model_trained' | 'backtest_validated'
  | 'calibrated' | 'shadow_deployed' | 'live_ab_active'
  | 'champion_promoted' | 'retrained' | 'archived'
  | 'drift_detected' | 'rolled_back' | 'recalled' | 'failover_to_baseline';

type AdmlTier =
  | 'single_asset' | 'small_fleet' | 'large_fleet'
  | 'multi_jurisdiction_fleet' | 'fleet_systemic';
type AdmlUrgency = 'low' | 'medium' | 'high' | 'critical' | 'systemic';
type AdmlAuthority = 'ml_engineer' | 'data_steward' | 'CTO' | 'CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type AdmlFamily =
  | 'lstm_autoencoder' | 'transformer_autoencoder' | 'variational_autoencoder'
  | 'isolation_forest_ensemble' | 'one_class_svm' | 'prophet_residual'
  | 'baseline_heuristic';
type AdmlAssetClass =
  | 'wind_turbine' | 'pv_inverter' | 'battery_storage' | 'transformer'
  | 'transmission_line' | 'substation' | 'hydrogen_electrolyser'
  | 'grid_scada' | 'smart_meter' | 'generic';
type ModelCardStatus = 'draft' | 'approved' | 'published' | 'expired';

interface AdmlRow {
  id: string;
  model_number: string;
  model_family: AdmlFamily | string;
  model_version: string | null;
  training_dataset_hash: string | null;
  feature_count: number | null;
  asset_class: AdmlAssetClass | string;
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
  w12_site_commissioning_ref: string | null;
  w126_government_filing_ref: string | null;
  w74_nersa_levy_ref: string | null;
  w118_block_ref: string | null;
  safety_critical_inference: number;
  regulator_reportable_drift: number;
  nerc_cip_audit_in_scope: number;
  sox_ml_governance_required: number;
  iso_42001_ai_management_required: number;
  autoencoder_reconstruction_error_p99: number | null;
  precision_at_k: number | null;
  recall_at_k: number | null;
  false_positive_rate: number | null;
  drift_psi: number | null;
  drift_ks: number | null;
  champion_vs_challenger_lift: number | null;
  inference_latency_p50_ms: number | null;
  inference_latency_p99_ms: number | null;
  inference_throughput_per_sec: number | null;
  ntt_baseline_comparison_pct: number | null;
  reconciliation_with_w71_heuristic_pct: number | null;
  model_card_status: ModelCardStatus | null;
  iso27001_controls_ok: number;
  soc2_type2_controls_ok: number;
  iso_42001_compliance_score: number | null;
  control_effectiveness_index: number | null;
  current_tier: AdmlTier;
  authority_required: AdmlAuthority | null;
  urgency_band: AdmlUrgency | null;
  model_health_band: HealthBand | null;
  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
  chain_status: AdmlStatus;
  model_proposed_at: string | null;
  dataset_bound_at: string | null;
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
  failover_to_baseline_at: string | null;
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
  // LIVE decoration battery
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: AdmlUrgency;
  authority_required_live?: AdmlAuthority;
  days_to_retrain_due_live?: number;
  days_to_model_card_expiry_live?: number;
  floor_flag_count_live?: number;
  floor_at_large_fleet_live?: boolean;
  floor_at_fleet_systemic_live?: boolean;
  control_effectiveness_index_live?: number;
  model_health_band_live?: HealthBand;
  bridges_to_w71_asset_prognostics_live?: boolean;
  bridges_to_w12_site_commissioning_live?: boolean;
  bridges_to_w126_government_filing_live?: boolean;
  bridges_to_w74_nersa_levy_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
}

interface AdmlEvent {
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

const STATE_TONE: Record<AdmlStatus, { bg: string; fg: string; label: string }> = {
  model_proposed:        { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  dataset_bound:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Dataset' },
  features_engineered:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Features' },
  train_test_split:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Split' },
  model_trained:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Trained' },
  backtest_validated:    { bg: '#fff4d6', fg: '#a06200', label: 'Backtest' },
  calibrated:            { bg: '#fff4d6', fg: '#a06200', label: 'Calibrated' },
  shadow_deployed:       { bg: '#fff4d6', fg: '#a06200', label: 'Shadow' },
  live_ab_active:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Live A/B' },
  champion_promoted:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Champion' },
  retrained:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Retrained' },
  archived:              { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  drift_detected:        { bg: '#fff4d6', fg: '#a06200', label: 'Drift' },
  rolled_back:           { bg: '#7a0e0e', fg: '#fff',    label: 'Rolled back' },
  recalled:              { bg: '#7a0e0e', fg: '#fff',    label: 'Recalled' },
  failover_to_baseline:  { bg: '#fff4d6', fg: '#a06200', label: 'Failover' },
};

const TIER_TONE: Record<AdmlTier, { bg: string; fg: string; label: string }> = {
  single_asset:              { bg: '#e3e7ec', fg: '#557',    label: 'Single asset' },
  small_fleet:               { bg: '#dbecfb', fg: '#1a3a5c', label: 'Small fleet' },
  large_fleet:               { bg: '#daf5e2', fg: '#1f6b3a', label: 'Large fleet' },
  multi_jurisdiction_fleet:  { bg: '#fff4d6', fg: '#a06200', label: 'Multi-juris.' },
  fleet_systemic:            { bg: '#7a0e0e', fg: '#fff',    label: 'Systemic' },
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
  { key: 'rolled_back',        label: 'Rolled back' },
  { key: 'recalled',           label: 'Recalled' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'model_proposed',       label: 'Proposed' },
  { key: 'dataset_bound',        label: 'Dataset' },
  { key: 'features_engineered',  label: 'Features' },
  { key: 'train_test_split',     label: 'Split' },
  { key: 'model_trained',        label: 'Trained' },
  { key: 'backtest_validated',   label: 'Backtest' },
  { key: 'calibrated',           label: 'Calibrated' },
  { key: 'shadow_deployed',      label: 'Shadow' },
  { key: 'live_ab_active',       label: 'Live A/B' },
  { key: 'champion_promoted',    label: 'Champion' },
  { key: 'retrained',            label: 'Retrained' },
  { key: 'archived',             label: 'Archived' },
  { key: 'drift_detected',       label: 'Drift' },
  { key: 'failover_to_baseline', label: 'Failover' },
  { key: 'rolled_back',          label: 'Rolled back' },
  { key: 'recalled',             label: 'Recalled' },
];

const FILTERS_TIER: Array<{ key: string; label: string }> = [
  { key: 'tier:single_asset',             label: 'Single asset (24h)' },
  { key: 'tier:small_fleet',              label: 'Small fleet (96h)' },
  { key: 'tier:large_fleet',              label: 'Large fleet (240h)' },
  { key: 'tier:multi_jurisdiction_fleet', label: 'Multi-juris. (480h)' },
  { key: 'tier:fleet_systemic',           label: 'Systemic (720h)' },
];

const FILTERS_FAMILY: Array<{ key: string; label: string }> = [
  { key: 'family:lstm_autoencoder',           label: 'LSTM AE' },
  { key: 'family:transformer_autoencoder',    label: 'Transformer AE' },
  { key: 'family:variational_autoencoder',    label: 'VAE' },
  { key: 'family:isolation_forest_ensemble',  label: 'IF ensemble' },
  { key: 'family:one_class_svm',              label: 'OC-SVM' },
  { key: 'family:prophet_residual',           label: 'Prophet' },
  { key: 'family:baseline_heuristic',         label: 'Baseline' },
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
  | 'bind-dataset' | 'engineer-features' | 'split-train-test'
  | 'train-model' | 'backtest' | 'calibrate' | 'deploy-shadow'
  | 'activate-live-ab' | 'promote-champion' | 'retrain' | 'archive'
  | 'detect-drift' | 'rollback-model' | 'recall-model'
  | 'activate-failover';

const ACTION_FOR_STATE: Partial<Record<AdmlStatus, ActionKind>> = {
  model_proposed:        'bind-dataset',
  dataset_bound:         'engineer-features',
  features_engineered:   'split-train-test',
  train_test_split:      'train-model',
  model_trained:         'backtest',
  backtest_validated:    'calibrate',
  calibrated:            'deploy-shadow',
  shadow_deployed:       'activate-live-ab',
  live_ab_active:        'promote-champion',
  champion_promoted:     'retrain',
  retrained:             'archive',
  drift_detected:        'retrain',
  failover_to_baseline:  'activate-live-ab',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'bind-dataset':       'Bind dataset (ml_engineer - training corpus hash + scope)',
  'engineer-features':  'Engineer features (ml_engineer - feature count + dataset frozen)',
  'split-train-test':   'Split train/test (ml_engineer - holdout + cross-validation)',
  'train-model':        'Train model (ml_engineer - hyperparameter set + training examples)',
  'backtest':           'Backtest (ml_engineer - precision @ K + recall @ K + FPR + reconstruction p99)',
  'calibrate':          'Calibrate (data_steward - isotonic / sigmoid calibration + threshold)',
  'deploy-shadow':      'Deploy shadow (data_steward - production-mirror inference, no actions)',
  'activate-live-ab':   'ACTIVATE LIVE A/B (CTO - challenger receives traffic; live inference begins)',
  'promote-champion':   'Promote champion (CTO - challenger wins A/B; replaces W71 heuristic)',
  'retrain':            'Retrain (CTO - drift-triggered or scheduled re-fit)',
  'archive':            'Archive (CEO - HARD terminal, retire model)',
  'detect-drift':       'Detect drift (data_steward - PSI / KS exceedance; SOFT pause)',
  'rollback-model':     'ROLLBACK MODEL (CTO - SIGNATURE - W127-ML-ROLLBACK crosses regulator EVERY tier: ISO 42001 + NIST AI RMF + SOC 2)',
  'recall-model':       'RECALL MODEL (CEO - HARD safety pull; crosses EVERY tier WHEN safety_critical_inference)',
  'activate-failover':  'Activate failover (data_steward - revert to baseline / heuristic; multi-juris + systemic crossings)',
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
    lstm_autoencoder: 'LSTM AE',
    transformer_autoencoder: 'Transformer AE',
    variational_autoencoder: 'VAE',
    isolation_forest_ensemble: 'Isolation Forest',
    one_class_svm: 'One-Class SVM',
    prophet_residual: 'Prophet residual',
    baseline_heuristic: 'Baseline heuristic',
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
  dataset_bound_count: number;
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
  w12_bridged_count: number;
  w126_bridged_count: number;
  w74_bridged_count: number;
  w118_bridged_count: number;
  control_effectiveness_avg: number;
  retrain_within_60d: number;
  retrain_within_14d: number;
  model_card_expiring_30d: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  proposed_count: 0, dataset_bound_count: 0, features_count: 0,
  split_count: 0, trained_count: 0, backtest_count: 0,
  calibrated_count: 0, shadow_count: 0, live_ab_count: 0,
  champion_count: 0, retrained_count: 0, archived_count: 0,
  drift_count: 0, rolled_back_count: 0, recalled_count: 0,
  failover_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w71_bridged_count: 0, w12_bridged_count: 0, w126_bridged_count: 0,
  w74_bridged_count: 0, w118_bridged_count: 0,
  control_effectiveness_avg: 0,
  retrain_within_60d: 0, retrain_within_14d: 0,
  model_card_expiring_30d: 0,
};

interface Props {
  regulatorView?: boolean;
}

export function AnomalyDetectionMlTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<AdmlRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'rolled_back' : 'active');
  const [selected, setSelected] = useState<AdmlRow | null>(null);
  const [events, setEvents] = useState<AdmlEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: AdmlRow[] } & KpiSummary }>('/anomaly-detection-ml');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          dataset_bound_count: data.dataset_bound_count || 0,
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
          w12_bridged_count: data.w12_bridged_count || 0,
          w126_bridged_count: data.w126_bridged_count || 0,
          w74_bridged_count: data.w74_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          control_effectiveness_avg: data.control_effectiveness_avg || 0,
          retrain_within_60d: data.retrain_within_60d || 0,
          retrain_within_14d: data.retrain_within_14d || 0,
          model_card_expiring_30d: data.model_card_expiring_30d || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load anomaly-detection ML models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { model: AdmlRow; events: AdmlEvent[] } }>(`/anomaly-detection-ml/${id}`);
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
      if (filter.startsWith('tier:'))   return r.current_tier === filter.slice(5);
      if (filter.startsWith('family:')) return r.model_family === filter.slice(7);
      if (filter.startsWith('asset:'))  return r.asset_class === filter.slice(6);
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: AdmlRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'bind-dataset') {
        const h = window.prompt('Training dataset hash (SHA-256):', row.training_dataset_hash ?? '');
        if (h !== null) body.training_dataset_hash = h;
        const ec = window.prompt('Training examples count:', String(row.training_examples_count ?? 100000));
        if (ec !== null) body.training_examples_count = Number(ec);
        const vc = window.prompt('Validation examples count:', String(row.validation_examples_count ?? 20000));
        if (vc !== null) body.validation_examples_count = Number(vc);
      } else if (action === 'engineer-features') {
        const fc = window.prompt('Feature count (post-engineering):', String(row.feature_count ?? 48));
        if (fc !== null) body.feature_count = Number(fc);
      } else if (action === 'split-train-test') {
        const note = window.prompt('Split notes (k-fold / holdout ratio):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'train-model') {
        const hp = window.prompt('Hyperparameter set hash:', row.hyperparameter_set_hash ?? '');
        if (hp !== null) body.hyperparameter_set_hash = hp;
        const v = window.prompt('Model version (semver e.g. 1.2.0):', row.model_version ?? '1.0.0');
        if (v !== null) body.model_version = v;
      } else if (action === 'backtest') {
        const p = window.prompt('Precision @ K (0-1):', String(row.precision_at_k ?? 0.85));
        if (p !== null) body.precision_at_k = Number(p);
        const r = window.prompt('Recall @ K (0-1):', String(row.recall_at_k ?? 0.80));
        if (r !== null) body.recall_at_k = Number(r);
        const fpr = window.prompt('False positive rate (0-1):', String(row.false_positive_rate ?? 0.02));
        if (fpr !== null) body.false_positive_rate = Number(fpr);
        const rerr = window.prompt('Reconstruction error p99:', String(row.autoencoder_reconstruction_error_p99 ?? 0.05));
        if (rerr !== null) body.autoencoder_reconstruction_error_p99 = Number(rerr);
      } else if (action === 'calibrate') {
        const psi = window.prompt('Drift PSI (calibration baseline):', String(row.drift_psi ?? 0.02));
        if (psi !== null) body.drift_psi = Number(psi);
        const ks = window.prompt('Drift KS (calibration baseline):', String(row.drift_ks ?? 0.04));
        if (ks !== null) body.drift_ks = Number(ks);
        body.model_card_status = window.prompt('Model card status (draft/approved/published):', row.model_card_status ?? 'approved') ?? row.model_card_status ?? 'approved';
      } else if (action === 'deploy-shadow') {
        const p50 = window.prompt('Inference latency p50 (ms):', String(row.inference_latency_p50_ms ?? 12));
        if (p50 !== null) body.inference_latency_p50_ms = Number(p50);
        const p99 = window.prompt('Inference latency p99 (ms):', String(row.inference_latency_p99_ms ?? 45));
        if (p99 !== null) body.inference_latency_p99_ms = Number(p99);
        const tps = window.prompt('Inference throughput per sec:', String(row.inference_throughput_per_sec ?? 200));
        if (tps !== null) body.inference_throughput_per_sec = Number(tps);
      } else if (action === 'activate-live-ab') {
        const lift = window.prompt('Champion-vs-challenger lift (>1.0 = challenger wins):', String(row.champion_vs_challenger_lift ?? 1.15));
        if (lift !== null) body.champion_vs_challenger_lift = Number(lift);
        const ch = window.prompt('Challenger model id:', row.challenger_model_id ?? '');
        if (ch !== null) body.challenger_model_id = ch;
        const note = window.prompt('Live A/B notes (NOTE: CTO sign-off; live inference begins):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'promote-champion') {
        const recw71 = window.prompt('Reconciliation with W71 heuristic (%):', String(row.reconciliation_with_w71_heuristic_pct ?? 92));
        if (recw71 !== null) body.reconciliation_with_w71_heuristic_pct = Number(recw71);
        const ntt = window.prompt('NTT baseline comparison (% improvement, negative = worse):', String(row.ntt_baseline_comparison_pct ?? 30));
        if (ntt !== null) body.ntt_baseline_comparison_pct = Number(ntt);
        const note = window.prompt('Champion promotion notes (replaces W71 heuristic):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'retrain') {
        const due = window.prompt('Next retrain due ISO date (e.g. 2026-08-30T00:00:00Z):', row.retrain_due_at ?? '');
        if (due !== null) body.retrain_due_at = due;
        const note = window.prompt('Retrain notes (drift-triggered or scheduled?):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive notes (CEO - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'detect-drift') {
        const psi = window.prompt('Observed drift PSI:', String(row.drift_psi ?? 0.18));
        if (psi !== null) body.drift_psi = Number(psi);
        const ks = window.prompt('Observed drift KS:', String(row.drift_ks ?? 0.20));
        if (ks !== null) body.drift_ks = Number(ks);
        const note = window.prompt(
          'Drift notes. NOTE: crosses regulator on HEAVY tiers WHEN regulator_reportable_drift.',
          '',
        );
        if (note !== null) body.notes = note;
      } else if (action === 'rollback-model') {
        const reason = window.prompt(
          'Rollback reason. NOTE: SIGNATURE - W127-ML-ROLLBACK crosses regulator EVERY tier (ISO 42001 incident + NIST AI RMF MAP-MEASURE-MANAGE + SOC 2 control failure + audit-evidence-chain).',
          row.reason_code ?? 'champion_underperforming',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'recall-model') {
        const reason = window.prompt(
          'Recall reason. NOTE: HARD safety pull; crosses regulator EVERY tier WHEN safety_critical_inference (NERC CIP-013 + ISO 42001 RCA + EU AI Act Art 21).',
          row.reason_code ?? 'safety_incident',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'activate-failover') {
        const note = window.prompt(
          'Failover notes. NOTE: revert to baseline / W71 heuristic; crosses regulator at multi_jurisdiction + fleet_systemic tiers.',
          '',
        );
        if (note !== null) body.notes = note;
      }
      await api.post(`/anomaly-detection-ml/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/anomaly-detection-ml', body);
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
          <h2 className="text-base font-semibold text-[#0c2a4d]">Anomaly-detection ML model governance (W127)</h2>
          <p className="text-[11px] text-[#4a5568]">
            12-state forward + 4 branch Phase-D ML BRAIN replacing W71 heuristic 6-method anomaly ensemble. LSTM AE / Transformer AE / VAE / Isolation Forest / OC-SVM / Prophet residual / baseline heuristic.
            Beats AspenTech Mtell + GE APM + Uptake Fusion + Augury + C3.ai AI/ML + SparkCognition + Petuum + DataRPM.
            INVERTED SLA HOURS (single 24 / small 96 / large 240 / multi-juris. 480 / systemic 720).
            FLOOR-AT-LARGE-FLEET {'≥'}1 flag / FLOOR-AT-FLEET-SYSTEMIC {'≥'}3 flags. W118 audit bridge mandatory.
            SIGNATURE W127-ML-ROLLBACK: rollback_model crosses EVERY tier (ISO 42001 incident + NIST AI RMF MAP-MEASURE-MANAGE + SOC 2 control failure + audit-evidence-chain reconciliation; FIRST Phase-D hard line).
            Internal ML governance chain (no public peer endpoint).
          </p>
        </div>
        {!regulatorView && (
          <button type="button"
            onClick={() => setShowPropose(true)}
            className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1a3a5c]"
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
        <span>Dataset: <span className="font-semibold text-[#1a3a5c]">{kpis.dataset_bound_count}</span></span>
        <span>Features: <span className="font-semibold text-[#1a3a5c]">{kpis.features_count}</span></span>
        <span>Split: <span className="font-semibold text-[#1a3a5c]">{kpis.split_count}</span></span>
        <span>Trained: <span className="font-semibold text-[#1a3a5c]">{kpis.trained_count}</span></span>
        <span>Backtest: <span className="font-semibold text-[#a06200]">{kpis.backtest_count}</span></span>
        <span>Calibrated: <span className="font-semibold text-[#a06200]">{kpis.calibrated_count}</span></span>
        <span>Shadow: <span className="font-semibold text-[#a06200]">{kpis.shadow_count}</span></span>
        <span>Retrained: <span className="font-semibold text-[#1f6b3a]">{kpis.retrained_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Drift: <span className="font-semibold text-[#a06200]">{kpis.drift_count}</span></span>
        <span>Failover: <span className="font-semibold text-[#a06200]">{kpis.failover_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Floor flags: <span className="font-semibold text-[#a06200]">{kpis.floor_flag_total}</span></span>
        <span>Retrain {'<'}60d: <span className="font-semibold text-[#a06200]">{kpis.retrain_within_60d}</span></span>
        <span>Retrain {'<'}14d: <span className="font-semibold text-[#9b1f1f]">{kpis.retrain_within_14d}</span></span>
        <span>Card exp. {'<'}30d: <span className="font-semibold text-[#9b1f1f]">{kpis.model_card_expiring_30d}</span></span>
        <span>W118: <span className="font-semibold text-[#1a3a5c]">{kpis.w118_bridged_count}</span></span>
        <span>W71: <span className="font-semibold text-[#1a3a5c]">{kpis.w71_bridged_count}</span></span>
        <span>W12: <span className="font-semibold text-[#1a3a5c]">{kpis.w12_bridged_count}</span></span>
        <span>W126: <span className="font-semibold text-[#1a3a5c]">{kpis.w126_bridged_count}</span></span>
        <span>W74: <span className="font-semibold text-[#1a3a5c]">{kpis.w74_bridged_count}</span></span>
      </div>

      {/* Row 1: action / priority pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_ACTION.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
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
                ? 'bg-[#1a3a5c] text-white'
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
                ? 'bg-[#0c2a4d] text-white'
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
  row: AdmlRow;
  events: AdmlEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: AdmlRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
  const retrainDays = row.days_to_retrain_due_live ?? row.days_to_retrain_due ?? null;
  const cardDays = row.days_to_model_card_expiry_live ?? row.days_to_model_card_expiry ?? null;
  const flags = row.floor_flag_count_live ?? 0;

  // Active non-terminal set for branch actions.
  const ACTIVE_NON_TERMINAL: AdmlStatus[] = [
    'model_proposed', 'dataset_bound', 'features_engineered',
    'train_test_split', 'model_trained', 'backtest_validated',
    'calibrated', 'shadow_deployed', 'live_ab_active',
    'champion_promoted', 'retrained', 'drift_detected',
    'failover_to_baseline',
  ];
  const DRIFT_FROM: AdmlStatus[] = [
    'shadow_deployed', 'live_ab_active', 'champion_promoted',
    'retrained', 'failover_to_baseline',
  ];
  const FAILOVER_FROM: AdmlStatus[] = ['live_ab_active', 'champion_promoted', 'retrained'];

  const canDrift     = DRIFT_FROM.includes(row.chain_status);
  const canFailover  = FAILOVER_FROM.includes(row.chain_status);
  const canRollback  = ACTIVE_NON_TERMINAL.includes(row.chain_status);
  const canRecall    = ACTIVE_NON_TERMINAL.includes(row.chain_status);

  const renderAct = (action: ActionKind, label: string, tone: 'primary' | 'danger' | 'amber' | 'plain' = 'plain') => {
    const cls = tone === 'primary'
      ? 'bg-[#0c2a4d] text-white hover:bg-[#1a3a5c]'
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
              {row.title || 'Anomaly-detection ML model (W127 - replaces W71 heuristic)'}
              {row.model_version ? <> {'•'} v<span className="font-mono">{row.model_version}</span></> : null}
              {row.training_dataset_hash ? <> {'•'} dataset <span className="font-mono text-[10px]">{row.training_dataset_hash.slice(0, 12)}</span></> : null}
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

        {/* Performance battery */}
        <div className="mb-3 grid grid-cols-4 gap-2 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Precision @ K</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.precision_at_k ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Recall @ K</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.recall_at_k ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">FPR</div>
            <div className={`font-mono text-[12px] ${(row.false_positive_rate ?? 0) > 0.05 ? 'text-[#9b1f1f] font-semibold' : (row.false_positive_rate ?? 0) > 0.03 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.false_positive_rate ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Recon p99</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.autoencoder_reconstruction_error_p99 ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Drift PSI</div>
            <div className={`font-mono text-[12px] ${(row.drift_psi ?? 0) >= 0.25 ? 'text-[#9b1f1f] font-semibold' : (row.drift_psi ?? 0) >= 0.10 ? 'text-[#a06200]' : 'text-[#1f5b3a]'}`}>{row.drift_psi ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Drift KS</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.drift_ks ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Champ vs Chall.</div>
            <div className={`font-mono text-[12px] ${(row.champion_vs_challenger_lift ?? 1) > 1.1 ? 'text-[#1f5b3a]' : (row.champion_vs_challenger_lift ?? 1) < 0.95 ? 'text-[#9b1f1f] font-semibold' : 'text-[#0c2a4d]'}`}>{row.champion_vs_challenger_lift ?? '-'}</div>
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
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">W71 recon. %</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.reconciliation_with_w71_heuristic_pct ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">NTT baseline %</div>
            <div className={`font-mono text-[12px] ${(row.ntt_baseline_comparison_pct ?? 0) >= 30 ? 'text-[#1f5b3a]' : (row.ntt_baseline_comparison_pct ?? 0) < 0 ? 'text-[#9b1f1f] font-semibold' : 'text-[#a06200]'}`}>{row.ntt_baseline_comparison_pct ?? '-'}%</div>
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
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Card expiry</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{fmtDate(row.model_card_expiry_at)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Train examples</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.training_examples_count?.toLocaleString() ?? '-'}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">Val examples</div>
            <div className="font-mono text-[12px] text-[#0c2a4d]">{row.validation_examples_count?.toLocaleString() ?? '-'}</div>
          </div>
        </div>

        {/* Floor flags */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
            Floor flags ({flags}/5) - FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-FLEET-SYSTEMIC {'≥'}3
          </div>
          <div className="grid grid-cols-5 gap-2">
            <FlagPill on={!!row.safety_critical_inference} label="Safety-critical" />
            <FlagPill on={!!row.regulator_reportable_drift} label="Reg reportable drift" />
            <FlagPill on={!!row.nerc_cip_audit_in_scope} label="NERC CIP-013" />
            <FlagPill on={!!row.sox_ml_governance_required} label="SOX ML gov." />
            <FlagPill on={!!row.iso_42001_ai_management_required} label="ISO 42001" />
          </div>
        </div>

        {/* Bridges */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Cross-chain bridges (W118 mandatory)</div>
          <div className="grid grid-cols-5 gap-2">
            <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="W118 audit" />
            <BridgePill on={!!row.bridges_to_w71_asset_prognostics_live} label="W71 prognostics" />
            <BridgePill on={!!row.bridges_to_w12_site_commissioning_live} label="W12 site comm." />
            <BridgePill on={!!row.bridges_to_w126_government_filing_live} label="W126 gov filing" />
            <BridgePill on={!!row.bridges_to_w74_nersa_levy_live} label="W74 NERSA levy" />
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
            {canFailover && renderAct('activate-failover', 'Failover to baseline', 'amber')}
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
      className={`rounded px-2 py-0.5 text-center text-[10px] font-medium ${on ? 'bg-[#0c2a4d] text-white' : 'bg-[#e3e7ec] text-[#6b7685]'}`}
      title={label}
    >
      {label}
    </span>
  );
}

const FAMILY_OPTIONS: Array<{ key: AdmlFamily; label: string }> = [
  { key: 'lstm_autoencoder',          label: 'LSTM Autoencoder' },
  { key: 'transformer_autoencoder',   label: 'Transformer Autoencoder' },
  { key: 'variational_autoencoder',   label: 'Variational Autoencoder (VAE)' },
  { key: 'isolation_forest_ensemble', label: 'Isolation Forest ensemble' },
  { key: 'one_class_svm',             label: 'One-Class SVM' },
  { key: 'prophet_residual',          label: 'Prophet residual' },
  { key: 'baseline_heuristic',        label: 'Baseline heuristic (W71-style)' },
];

const ASSET_OPTIONS: Array<{ key: AdmlAssetClass; label: string }> = [
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
  const [family, setFamily] = useState<AdmlFamily>('lstm_autoencoder');
  const [assetClass, setAssetClass] = useState<AdmlAssetClass>('generic');
  const [modelVersion, setModelVersion] = useState('1.0.0');
  const [assetsCovered, setAssetsCovered] = useState('');
  const [jurisdictions, setJurisdictions] = useState('');
  const [safetyCritical, setSafetyCritical] = useState(false);
  const [featureCount, setFeatureCount] = useState('');
  const [title, setTitle] = useState('');
  const [w118, setW118] = useState('');
  const [w71, setW71]   = useState('');
  const [w12, setW12]   = useState('');
  const [w126, setW126] = useState('');
  const [w74, setW74]   = useState('');
  const [safetyCriticalInf, setSafetyCriticalInf] = useState(false);
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
      w12_site_commissioning_ref: w12 || undefined,
      w126_government_filing_ref: w126 || undefined,
      w74_nersa_levy_ref: w74 || undefined,
      safety_critical_inference: safetyCriticalInf ? 1 : 0,
      regulator_reportable_drift: regReportable ? 1 : 0,
      nerc_cip_audit_in_scope: nercCip ? 1 : 0,
      sox_ml_governance_required: soxMl ? 1 : 0,
      iso_42001_ai_management_required: iso42001 ? 1 : 0,
      regulator_relevant: regulatorRelevant ? 1 : 0,
    };
    onSubmit(body);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded bg-white p-4 text-[12px] text-[#1a3a5c]">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#0c2a4d]">Propose anomaly-detection ML model (W127)</h3>
            <p className="text-[11px] text-[#4a5568]">
              W118 audit bridge mandatory. Tier auto-derived from (assets_covered, jurisdiction_count, safety_critical) with FLOOR-AT-LARGE-FLEET {'≥'}1 flag and FLOOR-AT-FLEET-SYSTEMIC {'≥'}3 flags.
              Replaces W71 heuristic 6-method anomaly ensemble.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Close</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Model family">
            <select value={family} onChange={(e) => setFamily(e.target.value as AdmlFamily)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {FAMILY_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Asset class">
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AdmlAssetClass)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
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
          <Field label="Feature count (post-engineering)">
            <input value={featureCount} onChange={(e) => setFeatureCount(e.target.value)} type="number" className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="48" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Eastern Cape wind fleet LSTM autoencoder v1" />
          </Field>
          <Field label="W118 block ref (mandatory)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="W71 asset prognostics ref (REPLACES)">
            <input value={w71} onChange={(e) => setW71(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="aprog-2026-007" />
          </Field>
          <Field label="W12 site commissioning ref">
            <input value={w12} onChange={(e) => setW12(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="com-2026-009" />
          </Field>
          <Field label="W126 government filing ref">
            <input value={w126} onChange={(e) => setW126(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="gfc-2026-0015" />
          </Field>
          <Field label="W74 NERSA levy ref">
            <input value={w74} onChange={(e) => setW74(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="regulator-levy-2026-0011" />
          </Field>
        </div>

        <div className="mt-3 rounded border border-[#d8dde6] bg-[#f8fafc] p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Floor flags (FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-FLEET-SYSTEMIC {'≥'}3)</div>
          <div className="grid grid-cols-3 gap-2">
            <Checkbox checked={safetyCriticalInf} onChange={setSafetyCriticalInf} label="Safety-critical inference" />
            <Checkbox checked={regReportable} onChange={setRegReportable} label="Regulator-reportable drift" />
            <Checkbox checked={nercCip} onChange={setNercCip} label="NERC CIP-013 audit" />
            <Checkbox checked={soxMl} onChange={setSoxMl} label="SOX ML governance" />
            <Checkbox checked={iso42001} onChange={setIso42001} label="ISO 42001 AIMS" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1.5 text-[12px] text-[#1a3a5c] hover:bg-[#f3f5f9]">Cancel</button>
          <button type="button" onClick={submit} className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1a3a5c]">Propose model</button>
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

export default AnomalyDetectionMlTab;
