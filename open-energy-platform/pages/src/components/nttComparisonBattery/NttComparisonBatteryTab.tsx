// Wave 130 - NTT Comparison Battery chain.
//
// PHASE D WAVE 4 OF 4 - CLOSES PHASE D. Continuous live comparison
// battery AGGREGATOR stitching W127 anomaly LSTM-AE + W128 RUL Cox PH
// survival + W129 fault-fingerprint multi-class against an EMULATED NTT
// IoT/O&M baseline. Each row = one COMPARISON CYCLE (nightly).
//
// Produces continuously-updated, revenue-weighted, statistically
// significance-gated, tamper-evident "savings-vs-NTT-30%" KPI streaming
// into Esums dashboard hero. Beats NTT Data IoT + NTT O&M Suite + NTT
// Innovative Optical and Wireless Network platform.
//
// Mounted at /admin/workstation?tab=ntt-comparison-battery,
// /ipp/workstation?tab=ntt-comparison-battery, and
// /support/workstation?tab=ntt-comparison-battery (write {admin,support};
// admin/ipp/support all READ).
//
// 12-state forward + 4 branch lifecycle:
//   cycle_proposed -> baselines_synced -> telemetry_window_bound
//     -> ntt_emulation_run -> champion_predictions_collected
//     -> counterfactuals_computed -> revenue_weighted_scored
//     -> significance_tested -> savings_certified -> audit_published
//     -> retraining_triggered -> archived (HARD)
//   {revenue_weighted_scored, significance_tested} -> flag_significance_failure -> significance_failed (SOFT)
//   any non-terminal -> rollback_cycle -> rolled_back (HARD)
//   any non-terminal -> recall_certification -> recalled (HARD - SIGNATURE)
//   {savings_certified, audit_published, retraining_triggered} -> activate_failover -> failover_to_prior_cycle (SOFT)
//
// 5-tier INVERTED SLA polarity (HOURS) at cycle_proposed: single_asset
// 12 / small_fleet 48 / large_fleet 120 / multi_jurisdiction_fleet 240 /
// fleet_systemic 480. TIGHTER than W127-W129 because cycles run nightly.
//
// FLOOR-AT-LARGE-FLEET on {>=}1 of 5 flags; FLOOR-AT-FLEET-SYSTEMIC on
// {>=}3 flags: material_savings_threshold_breached /
// ntt_contract_renegotiation_trigger / regulator_reportable_diversion /
// sox_ml_governance_required / iso_42001_required.
//
// SIGNATURE W130 regulator crossings:
//   * recall_certification EVERY tier (W130 SIGNATURE - withdrawal of
//     a savings certification is ALWAYS reportable; SARB MA s38 + IFRS
//     restatement + ISO 42001 incident).
//   * publish_audit EVERY tier WHEN regulator_reportable_diversion
//   * certify_savings TOP-HEAVY WHEN ntt_contract_renegotiation_trigger
//   * flag_significance_failure fleet_systemic only
//   * sla_breached HEAVY only (large_fleet+)
//
// 5 bridges (W118 MANDATORY at publish_audit): W127 anomaly + W128 RUL
// + W129 fault + W71 12-mode physics control variable + W118 audit.
//
// Authority ladder: ml_analyst -> data_steward -> CTO -> CEO (FRESH).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type NcbStatus =
  | 'cycle_proposed' | 'baselines_synced' | 'telemetry_window_bound'
  | 'ntt_emulation_run' | 'champion_predictions_collected'
  | 'counterfactuals_computed' | 'revenue_weighted_scored'
  | 'significance_tested' | 'savings_certified' | 'audit_published'
  | 'retraining_triggered' | 'archived'
  | 'significance_failed' | 'rolled_back' | 'recalled'
  | 'failover_to_prior_cycle';

type NcbTier =
  | 'single_asset' | 'small_fleet' | 'large_fleet'
  | 'multi_jurisdiction_fleet' | 'fleet_systemic';
type NcbUrgency = 'low' | 'medium' | 'high' | 'critical' | 'systemic';
type NcbAuthority = 'ml_analyst' | 'data_steward' | 'CTO' | 'CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';
type CycleKind = 'nightly' | 'weekly' | 'monthly' | 'on_demand' | 'forensic';
type AssetClass =
  | 'wind_turbine' | 'pv_inverter' | 'battery_storage' | 'transformer'
  | 'transmission_line' | 'substation' | 'hydrogen_electrolyser'
  | 'grid_scada' | 'smart_meter' | 'generic';
type ModelCardStatus = 'draft' | 'approved' | 'published' | 'expired';

interface NcbRow {
  [key: string]: unknown;
  id: string;
  cycle_number: string;
  cycle_kind: CycleKind | string;
  cycle_window_start: string | null;
  cycle_window_end: string | null;
  asset_class: AssetClass | string;
  assets_covered: number | null;
  jurisdiction_count: number | null;
  safety_critical: number;
  champion_anomaly_model_version: string | null;
  champion_rul_model_version: string | null;
  champion_fault_model_version: string | null;
  ntt_baseline_version: string | null;
  prior_cycle_ref: string | null;
  next_cycle_due_at: string | null;
  model_card_expiry_at: string | null;
  w127_anomaly_detection_ref: string | null;
  w128_rul_survival_ref: string | null;
  w129_fault_fingerprint_ref: string | null;
  w71_asset_prognostics_ref: string | null;
  w118_block_ref: string | null;
  material_savings_threshold_breached: number;
  ntt_contract_renegotiation_trigger: number;
  regulator_reportable_diversion: number;
  sox_ml_governance_required: number;
  iso_42001_required: number;
  consecutive_cycles_above_target: number;
  consecutive_cycles_below_target: number;
  ntt_emulation_payload: string | null;
  champion_predictions_payload: string | null;
  counterfactuals_payload: string | null;
  total_savings_zar: number | null;
  cumulative_savings_zar: number | null;
  false_positive_savings_zar: number | null;
  false_negative_savings_zar: number | null;
  savings_vs_ntt_pct: number | null;
  paired_t_pvalue: number | null;
  wilcoxon_pvalue: number | null;
  brier_skill_score_vs_ntt: number | null;
  confidence_interval_lower_zar: number | null;
  confidence_interval_upper_zar: number | null;
  confidence_interval_width_zar: number | null;
  reconciliation_with_w71_savings_ledger_pct: number | null;
  audit_hash_published: string | null;
  ntt_baseline_comparison_pct: number | null;
  inference_latency_p50_ms: number | null;
  inference_latency_p99_ms: number | null;
  model_card_status: ModelCardStatus | null;
  iso27001_controls_ok: number;
  soc2_type2_controls_ok: number;
  sox_ml_governance_ok: number;
  iso_42001_compliance_score: number | null;
  control_effectiveness_index: number | null;
  current_tier: NcbTier;
  authority_required: NcbAuthority | null;
  urgency_band: NcbUrgency | null;
  battery_health_band: HealthBand | null;
  title: string | null;
  reason_code: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  regulator_ref: string | null;
  regulator_inbox_ref: string | null;
  chain_status: NcbStatus;
  cycle_proposed_at: string | null;
  baselines_synced_at: string | null;
  telemetry_window_bound_at: string | null;
  ntt_emulation_run_at: string | null;
  champion_predictions_collected_at: string | null;
  counterfactuals_computed_at: string | null;
  revenue_weighted_scored_at: string | null;
  significance_tested_at: string | null;
  savings_certified_at: string | null;
  audit_published_at: string | null;
  retraining_triggered_at: string | null;
  archived_at: string | null;
  significance_failed_at: string | null;
  rolled_back_at: string | null;
  recalled_at: string | null;
  failover_to_prior_cycle_at: string | null;
  regulator_crossed_at: string | null;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  last_sla_breach_at: string | null;
  escalation_level: number;
  days_to_next_cycle: number | null;
  days_to_model_card_expiry: number | null;
  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // LIVE battery
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: NcbUrgency;
  authority_required_live?: NcbAuthority;
  days_to_next_cycle_live?: number;
  days_to_model_card_expiry_live?: number;
  floor_flag_count_live?: number;
  floor_at_large_fleet_live?: boolean;
  floor_at_fleet_systemic_live?: boolean;
  control_effectiveness_index_live?: number;
  battery_health_band_live?: HealthBand;
  savings_vs_ntt_pct_live?: number;
  cumulative_savings_zar_live?: number;
  total_savings_zar_live?: number;
  paired_t_pvalue_live?: number;
  wilcoxon_pvalue_live?: number;
  brier_skill_score_vs_ntt_live?: number;
  false_positive_savings_zar_live?: number;
  false_negative_savings_zar_live?: number;
  confidence_interval_lower_zar_live?: number;
  confidence_interval_upper_zar_live?: number;
  confidence_interval_width_zar_live?: number;
  audit_hash_published_live?: string | null;
  reconciliation_with_w71_savings_ledger_live?: number;
  ntt_emulation_parsed?: unknown;
  champion_predictions_parsed?: unknown;
  counterfactuals_parsed?: unknown;
  bridges_to_w127_anomaly_detection_live?: boolean;
  bridges_to_w128_rul_survival_live?: boolean;
  bridges_to_w129_fault_fingerprint_live?: boolean;
  bridges_to_w71_asset_prognostics_live?: boolean;
  bridges_to_w118_audit_chain_live?: boolean;
  ntt_savings_target_pct?: number;
  ntt_contract_reneg_consecutive_cycles_required?: number;
  material_savings_floor_zar?: number;
  regulator_diversion_disagreement_floor_pct?: number;
}

interface NcbEvent {
  id: string;
  cycle_id: string;
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

const STATE_TONE: Record<NcbStatus, { bg: string; fg: string; label: string }> = {
  cycle_proposed:                 { bg: '#e3e7ec', fg: '#445',    label: 'Proposed' },
  baselines_synced:               { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Baselines' },
  telemetry_window_bound:         { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Tel. window' },
  ntt_emulation_run:              { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'NTT emu.' },
  champion_predictions_collected: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Champ. pred.' },
  counterfactuals_computed:       { bg: '#fff4d6', fg: '#a06200', label: 'Counterfact.' },
  revenue_weighted_scored:        { bg: '#fff4d6', fg: '#a06200', label: 'Rev. weighted' },
  significance_tested:            { bg: '#fff4d6', fg: '#a06200', label: 'Sig. tested' },
  savings_certified:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Certified' },
  audit_published:                { bg: '#daf5e2', fg: '#1f6b3a', label: 'Audit pub.' },
  retraining_triggered:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Retraining' },
  archived:                       { bg: '#1f5b3a', fg: '#fff',    label: 'Archived' },
  significance_failed:            { bg: '#fff4d6', fg: '#a06200', label: 'Sig. failed' },
  rolled_back:                    { bg: '#7a0e0e', fg: '#fff',    label: 'Rolled back' },
  recalled:                       { bg: '#7a0e0e', fg: '#fff',    label: 'Recalled' },
  failover_to_prior_cycle:        { bg: '#fff4d6', fg: '#a06200', label: 'Failover' },
};

const TIER_TONE: Record<NcbTier, { bg: string; fg: string; label: string }> = {
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
  { key: 'above_target',       label: 'Above 30% target' },
  { key: 'below_target',       label: 'Below 30% target' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'next_7d',            label: 'Next cycle {<}7d' },
  { key: 'next_3d',            label: 'Next cycle {<}3d' },
  { key: 'mcard_30d',          label: 'Card exp. {<}30d' },
  { key: 'health_red',         label: 'Health red' },
  { key: 'health_critical',    label: 'Health critical' },
  { key: 'systemic_floor',     label: 'Systemic floor' },
  { key: 'large_floor',        label: 'Large-fleet floor' },
  { key: 'reneg_trigger',      label: 'Contract reneg.' },
  { key: 'rolled_back',        label: 'Rolled back' },
  { key: 'recalled',           label: 'Recalled' },
];

const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'cycle_proposed',                 label: 'Proposed' },
  { key: 'baselines_synced',               label: 'Baselines' },
  { key: 'telemetry_window_bound',         label: 'Tel. window' },
  { key: 'ntt_emulation_run',              label: 'NTT emu.' },
  { key: 'champion_predictions_collected', label: 'Champ. pred.' },
  { key: 'counterfactuals_computed',       label: 'Counterfact.' },
  { key: 'revenue_weighted_scored',        label: 'Rev. weighted' },
  { key: 'significance_tested',            label: 'Sig. tested' },
  { key: 'savings_certified',              label: 'Certified' },
  { key: 'audit_published',                label: 'Audit pub.' },
  { key: 'retraining_triggered',           label: 'Retraining' },
  { key: 'archived',                       label: 'Archived' },
  { key: 'significance_failed',            label: 'Sig. failed' },
  { key: 'failover_to_prior_cycle',        label: 'Failover' },
  { key: 'rolled_back',                    label: 'Rolled back' },
  { key: 'recalled',                       label: 'Recalled' },
];

const FILTERS_TIER: Array<{ key: string; label: string }> = [
  { key: 'tier:single_asset',             label: 'Single asset (12h)' },
  { key: 'tier:small_fleet',              label: 'Small fleet (48h)' },
  { key: 'tier:large_fleet',              label: 'Large fleet (120h)' },
  { key: 'tier:multi_jurisdiction_fleet', label: 'Multi-juris. (240h)' },
  { key: 'tier:fleet_systemic',           label: 'Systemic (480h)' },
];

const FILTERS_KIND: Array<{ key: string; label: string }> = [
  { key: 'kind:nightly',   label: 'Nightly' },
  { key: 'kind:weekly',    label: 'Weekly' },
  { key: 'kind:monthly',   label: 'Monthly' },
  { key: 'kind:on_demand', label: 'On-demand' },
  { key: 'kind:forensic',  label: 'Forensic' },
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
  | 'sync-baselines' | 'bind-telemetry-window' | 'run-ntt-emulation'
  | 'collect-champion-predictions' | 'compute-counterfactuals'
  | 'revenue-weight-score' | 'test-significance' | 'certify-savings'
  | 'publish-audit' | 'trigger-retraining' | 'archive'
  | 'flag-significance-failure' | 'rollback-cycle'
  | 'recall-certification' | 'activate-failover';

const ACTION_FOR_STATE: Partial<Record<NcbStatus, ActionKind>> = {
  cycle_proposed:                 'sync-baselines',
  baselines_synced:               'bind-telemetry-window',
  telemetry_window_bound:         'run-ntt-emulation',
  ntt_emulation_run:              'collect-champion-predictions',
  champion_predictions_collected: 'compute-counterfactuals',
  counterfactuals_computed:       'revenue-weight-score',
  revenue_weighted_scored:        'test-significance',
  significance_tested:            'certify-savings',
  savings_certified:              'publish-audit',
  audit_published:                'trigger-retraining',
  retraining_triggered:           'archive',
  significance_failed:            'test-significance',
  failover_to_prior_cycle:        'trigger-retraining',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'sync-baselines':                'Sync baselines (ml_analyst - lock champion + NTT baseline versions)',
  'bind-telemetry-window':         'Bind telemetry window (ml_analyst - freeze cycle window + asset coverage)',
  'run-ntt-emulation':             'Run NTT emulation (ml_analyst - emulate NTT IoT/O&M stack predictions)',
  'collect-champion-predictions':  'Collect champion predictions (ml_analyst - pull anomaly + RUL + fault inference)',
  'compute-counterfactuals':       'Compute counterfactuals (ml_analyst - per-asset Δ revenue NTT vs champion)',
  'revenue-weight-score':          'Revenue-weight score (data_steward - aggregate ZAR; auto-flags material/reneg)',
  'test-significance':             'Test significance (data_steward - paired-t + Wilcoxon + Brier + 95% CI)',
  'certify-savings':               'Certify savings (CTO - sign off savings_vs_ntt_pct; TOP-HEAVY crosses regulator on reneg trigger)',
  'publish-audit':                 'Publish audit (CTO - audit block MANDATORY - publish Merkle hash; EVERY tier crosses regulator WHEN diversion)',
  'trigger-retraining':            'Trigger retraining (CTO - 4 consecutive cycles below target / drift)',
  'archive':                       'Archive (CEO - HARD terminal, cycle closed-out)',
  'flag-significance-failure':     'Flag significance failure (data_steward - paired-t p {>=} 0.10; SOFT; systemic crosses regulator)',
  'rollback-cycle':                'ROLLBACK CYCLE (CTO - withdraw cycle results; HARD terminal)',
  'recall-certification':          'RECALL CERTIFICATION (CEO - SIGNATURE - withdraws a published savings cert; crosses regulator EVERY tier; SARB MA s38 + IFRS restatement + ISO 42001 incident)',
  'activate-failover':             'Activate failover (CTO - drop back to prior cycle; SOFT)',
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

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}R${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}R${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}R${(abs / 1e3).toFixed(0)}k`;
  return `${sign}R${abs.toFixed(0)}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(1)}%`;
}

function fmtAssetClass(s: string | null | undefined): string {
  if (!s) return '-';
  return String(s).replace(/_/g, ' ');
}

function fmtKind(s: string | null | undefined): string {
  if (!s) return '-';
  return String(s).replace(/_/g, ' ');
}

interface KpiSummary {
  total: number;
  active_count: number;
  proposed_count: number;
  synced_count: number;
  bound_count: number;
  emulated_count: number;
  collected_count: number;
  counterfactuals_count: number;
  scored_count: number;
  tested_count: number;
  certified_count: number;
  audited_count: number;
  retrain_count: number;
  archived_count: number;
  significance_failed_count: number;
  rolled_back_count: number;
  recalled_count: number;
  failover_count: number;
  breached: number;
  reportable_total: number;
  floor_flag_total: number;
  w127_bridged_count: number;
  w128_bridged_count: number;
  w129_bridged_count: number;
  w71_bridged_count: number;
  w118_bridged_count: number;
  control_effectiveness_avg: number;
  total_savings_sum_zar: number;
  cumulative_savings_max_zar: number;
  savings_vs_ntt_pct_avg: number;
  above_target_count: number;
  ntt_savings_target_pct: number;
  model_card_expiring_30d: number;
  material_savings_floor_zar: number;
  regulator_diversion_disagreement_floor_pct: number;
  ntt_contract_reneg_consecutive_cycles_required: number;
}

const EMPTY_KPI: KpiSummary = {
  total: 0, active_count: 0,
  proposed_count: 0, synced_count: 0, bound_count: 0, emulated_count: 0,
  collected_count: 0, counterfactuals_count: 0, scored_count: 0,
  tested_count: 0, certified_count: 0, audited_count: 0,
  retrain_count: 0, archived_count: 0, significance_failed_count: 0,
  rolled_back_count: 0, recalled_count: 0, failover_count: 0,
  breached: 0, reportable_total: 0, floor_flag_total: 0,
  w127_bridged_count: 0, w128_bridged_count: 0, w129_bridged_count: 0,
  w71_bridged_count: 0, w118_bridged_count: 0,
  control_effectiveness_avg: 0,
  total_savings_sum_zar: 0, cumulative_savings_max_zar: 0,
  savings_vs_ntt_pct_avg: 0, above_target_count: 0,
  ntt_savings_target_pct: 30,
  model_card_expiring_30d: 0,
  material_savings_floor_zar: 10_000_000,
  regulator_diversion_disagreement_floor_pct: 5,
  ntt_contract_reneg_consecutive_cycles_required: 4,
};

interface Props {
  regulatorView?: boolean;
}

export function NttComparisonBatteryTab({ regulatorView }: Props = {}) {
  const [rows, setRows] = useState<NcbRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(regulatorView ? 'recalled' : 'active');
  const [selected, setSelected] = useState<NcbRow | null>(null);
  const [events, setEvents] = useState<NcbEvent[]>([]);
  const [showPropose, setShowPropose] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: NcbRow[] } & KpiSummary }>('/ntt-comparison-battery');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          proposed_count: data.proposed_count || 0,
          synced_count: data.synced_count || 0,
          bound_count: data.bound_count || 0,
          emulated_count: data.emulated_count || 0,
          collected_count: data.collected_count || 0,
          counterfactuals_count: data.counterfactuals_count || 0,
          scored_count: data.scored_count || 0,
          tested_count: data.tested_count || 0,
          certified_count: data.certified_count || 0,
          audited_count: data.audited_count || 0,
          retrain_count: data.retrain_count || 0,
          archived_count: data.archived_count || 0,
          significance_failed_count: data.significance_failed_count || 0,
          rolled_back_count: data.rolled_back_count || 0,
          recalled_count: data.recalled_count || 0,
          failover_count: data.failover_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          floor_flag_total: data.floor_flag_total || 0,
          w127_bridged_count: data.w127_bridged_count || 0,
          w128_bridged_count: data.w128_bridged_count || 0,
          w129_bridged_count: data.w129_bridged_count || 0,
          w71_bridged_count: data.w71_bridged_count || 0,
          w118_bridged_count: data.w118_bridged_count || 0,
          control_effectiveness_avg: data.control_effectiveness_avg || 0,
          total_savings_sum_zar: data.total_savings_sum_zar || 0,
          cumulative_savings_max_zar: data.cumulative_savings_max_zar || 0,
          savings_vs_ntt_pct_avg: data.savings_vs_ntt_pct_avg || 0,
          above_target_count: data.above_target_count || 0,
          ntt_savings_target_pct: data.ntt_savings_target_pct || 30,
          model_card_expiring_30d: data.model_card_expiring_30d || 0,
          material_savings_floor_zar: data.material_savings_floor_zar || 10_000_000,
          regulator_diversion_disagreement_floor_pct: data.regulator_diversion_disagreement_floor_pct || 5,
          ntt_contract_reneg_consecutive_cycles_required: data.ntt_contract_reneg_consecutive_cycles_required || 4,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load NTT comparison battery cycles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { cycle: NcbRow; events: NcbEvent[] } }>(`/ntt-comparison-battery/${id}`);
      if (res.data?.data?.cycle) setSelected(res.data.data.cycle);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load cycle history');
    }
  }, []);

  const filtered = useMemo(() => {
    const target = summary?.ntt_savings_target_pct ?? 30;
    return rows.filter((r) => {
      if (filter === 'all')             return true;
      if (filter === 'active')          return !r.is_terminal;
      if (filter === 'above_target')    return (r.savings_vs_ntt_pct_live ?? 0) >= target;
      if (filter === 'below_target')    return (r.savings_vs_ntt_pct_live ?? 0) < target && !r.is_terminal;
      if (filter === 'reportable')      return !!r.is_reportable_flag;
      if (filter === 'breached')        return r.sla_breached_live;
      if (filter === 'next_7d')         return (r.days_to_next_cycle_live ?? 9999) < 7;
      if (filter === 'next_3d')         return (r.days_to_next_cycle_live ?? 9999) < 3;
      if (filter === 'mcard_30d')       return (r.days_to_model_card_expiry_live ?? 9999) < 30;
      if (filter === 'health_red')      return r.battery_health_band_live === 'red';
      if (filter === 'health_critical') return r.battery_health_band_live === 'critical';
      if (filter === 'systemic_floor')  return !!r.floor_at_fleet_systemic_live;
      if (filter === 'large_floor')     return !!r.floor_at_large_fleet_live;
      if (filter === 'reneg_trigger')   return !!r.ntt_contract_renegotiation_trigger;
      if (filter.startsWith('tier:'))   return r.current_tier === filter.slice(5);
      if (filter.startsWith('kind:'))   return r.cycle_kind === filter.slice(5);
      if (filter.startsWith('asset:'))  return r.asset_class === filter.slice(6);
      return r.chain_status === filter;
    });
  }, [rows, filter, summary]);

  const kpis = summary ?? EMPTY_KPI;

  const act = useCallback(async (action: ActionKind, row: NcbRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'sync-baselines') {
        const ca = window.prompt('Champion anomaly model version:', row.champion_anomaly_model_version ?? '1.0.0');
        if (ca !== null) body.champion_anomaly_model_version = ca;
        const cr = window.prompt('Champion RUL model version:', row.champion_rul_model_version ?? '1.0.0');
        if (cr !== null) body.champion_rul_model_version = cr;
        const cf = window.prompt('Champion fault model version:', row.champion_fault_model_version ?? '1.0.0');
        if (cf !== null) body.champion_fault_model_version = cf;
        const ntt = window.prompt('NTT baseline version:', row.ntt_baseline_version ?? 'ntt-iot-v6.2');
        if (ntt !== null) body.ntt_baseline_version = ntt;
      } else if (action === 'bind-telemetry-window') {
        const ws = window.prompt('Cycle window start ISO:', row.cycle_window_start ?? '');
        if (ws !== null) body.cycle_window_start = ws;
        const we = window.prompt('Cycle window end ISO:', row.cycle_window_end ?? '');
        if (we !== null) body.cycle_window_end = we;
      } else if (action === 'run-ntt-emulation') {
        const p = window.prompt('NTT emulation payload (JSON):', row.ntt_emulation_payload ?? '{}');
        if (p !== null) body.ntt_emulation_payload = p;
      } else if (action === 'collect-champion-predictions') {
        const p = window.prompt('Champion predictions payload (JSON; anomaly + RUL + fault):', row.champion_predictions_payload ?? '{}');
        if (p !== null) body.champion_predictions_payload = p;
      } else if (action === 'compute-counterfactuals') {
        const p = window.prompt('Counterfactuals payload (JSON per-asset Δ revenue):', row.counterfactuals_payload ?? '{}');
        if (p !== null) body.counterfactuals_payload = p;
      } else if (action === 'revenue-weight-score') {
        const ts = window.prompt('Total savings this cycle (ZAR):', String(row.total_savings_zar ?? 0));
        if (ts !== null) body.total_savings_zar = Number(ts);
        const cs = window.prompt('Cumulative savings (ZAR):', String(row.cumulative_savings_zar ?? 0));
        if (cs !== null) body.cumulative_savings_zar = Number(cs);
        const sp = window.prompt('Savings vs NTT (%):', String(row.savings_vs_ntt_pct ?? 30));
        if (sp !== null) body.savings_vs_ntt_pct = Number(sp);
        const fp = window.prompt('False-positive cost saved (ZAR):', String(row.false_positive_savings_zar ?? 0));
        if (fp !== null) body.false_positive_savings_zar = Number(fp);
        const fn = window.prompt('False-negative cost saved (ZAR):', String(row.false_negative_savings_zar ?? 0));
        if (fn !== null) body.false_negative_savings_zar = Number(fn);
      } else if (action === 'test-significance') {
        const pt = window.prompt('Paired-t p-value (lower = stronger):', String(row.paired_t_pvalue ?? 0.05));
        if (pt !== null) body.paired_t_pvalue = Number(pt);
        const wx = window.prompt('Wilcoxon p-value (non-parametric backup):', String(row.wilcoxon_pvalue ?? 0.05));
        if (wx !== null) body.wilcoxon_pvalue = Number(wx);
        const bs = window.prompt('Brier skill score vs NTT (higher better):', String(row.brier_skill_score_vs_ntt ?? 0.30));
        if (bs !== null) body.brier_skill_score_vs_ntt = Number(bs);
        const cl = window.prompt('CI lower (ZAR):', String(row.confidence_interval_lower_zar ?? 0));
        if (cl !== null) body.confidence_interval_lower_zar = Number(cl);
        const cu = window.prompt('CI upper (ZAR):', String(row.confidence_interval_upper_zar ?? 0));
        if (cu !== null) body.confidence_interval_upper_zar = Number(cu);
      } else if (action === 'certify-savings') {
        const rec = window.prompt('Reconciliation with savings ledger (%):', String(row.reconciliation_with_w71_savings_ledger_pct ?? 95));
        if (rec !== null) body.reconciliation_with_w71_savings_ledger_pct = Number(rec);
        const note = window.prompt('Certification notes (CTO sign-off; TOP-HEAVY crosses regulator on reneg trigger).', '');
        if (note !== null) body.notes = note;
      } else if (action === 'publish-audit') {
        const h = window.prompt(
          'Audit block ref (MANDATORY - publish_audit will 422 reject if missing):',
          row.w118_block_ref ?? '',
        );
        if (h !== null) body.w118_block_ref = h;
        const ah = window.prompt('Published audit Merkle hash (SHA-256):', row.audit_hash_published ?? '');
        if (ah !== null) body.audit_hash_published = ah;
        const note = window.prompt('Audit publish notes (EVERY tier crosses regulator WHEN regulator_reportable_diversion).', '');
        if (note !== null) body.notes = note;
      } else if (action === 'trigger-retraining') {
        const note = window.prompt('Retraining notes (4 consecutive below-target cycles / drift / explicit):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'archive') {
        const note = window.prompt('Archive notes (CEO - HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'flag-significance-failure') {
        const reason = window.prompt(
          'Significance failure reason. NOTE: SOFT branch; fleet_systemic crosses regulator.',
          row.reason_code ?? 'paired_t_above_threshold',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'rollback-cycle') {
        const reason = window.prompt(
          'Rollback reason (HARD terminal; withdraws this cycle\'s results):',
          row.reason_code ?? 'data_quality_breach',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'recall-certification') {
        const reason = window.prompt(
          'Recall reason. NOTE: SIGNATURE - withdraws a published savings certification; crosses regulator EVERY tier (SARB MA s38 + IFRS restatement + ISO 42001 incident).',
          row.reason_code ?? 'savings_misstated',
        );
        if (reason === null) return;
        body.reason_code = reason;
      } else if (action === 'activate-failover') {
        const note = window.prompt('Failover notes (drops to prior cycle while a fix is staged).', '');
        if (note !== null) body.notes = note;
      }
      await api.post(`/ntt-comparison-battery/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load, loadEvents, selected]);

  const propose = useCallback(async (body: Record<string, unknown>) => {
    try {
      await api.post('/ntt-comparison-battery', body);
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
          <h2 className="text-base font-semibold text-[#0c2a4d]">NTT comparison battery</h2>
          <p className="text-[11px] text-[#4a5568]">
            12-state forward + 4 branch AGGREGATOR stitching anomaly LSTM-AE + RUL Cox PH survival + fault-fingerprint multi-class against an emulated NTT IoT/O&M baseline.
            Each cycle (nightly default) produces continuously-updated, revenue-weighted, significance-gated, tamper-evident "savings-vs-NTT-30%" KPI streaming into the Esums dashboard hero.
            INVERTED SLA HOURS (single 12 / small 48 / large 120 / multi-juris. 240 / systemic 480 - TIGHTER than the underlying ML chains because cycles run nightly).
            FLOOR-AT-LARGE-FLEET {'≥'}1 flag / FLOOR-AT-FLEET-SYSTEMIC {'≥'}3 flags. Audit bridge MANDATORY at publish_audit (422 reject otherwise).
            SIGNATURE: recall_certification crosses EVERY tier (withdrawal of a published savings certification is ALWAYS reportable - SARB MA s38 + IFRS restatement + ISO 42001 incident).
            Authority ladder ml_analyst → data_steward → CTO → CEO. Beats NTT Data IoT + NTT O&M Suite + NTT IOWN.
          </p>
        </div>
        {!regulatorView && (
          <button type="button"
            onClick={() => setShowPropose(true)}
            className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]"
          >
            + Propose cycle
          </button>
        )}
      </div>

      {/* 8-card hero KPI strip */}
      <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
        <Kpi label={`vs NTT-${kpis.ntt_savings_target_pct}%`}
             value={`${kpis.savings_vs_ntt_pct_avg.toFixed(1)}%`}
             tone={kpis.savings_vs_ntt_pct_avg >= kpis.ntt_savings_target_pct ? 'ok' : kpis.savings_vs_ntt_pct_avg >= 0 ? 'warn' : 'bad'} />
        <Kpi label="Cumul. savings"  value={fmtZar(kpis.cumulative_savings_max_zar)} tone="ok" />
        <Kpi label="Above target"    value={kpis.above_target_count} tone="ok" />
        <Kpi label="Active"          value={kpis.active_count} />
        <Kpi label="Audit pub."      value={kpis.audited_count} tone="ok" />
        <Kpi label="Recalled"        value={kpis.recalled_count} tone={kpis.recalled_count > 0 ? 'bad' : undefined} />
        <Kpi label="SLA breached"    value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <Kpi label="Control avg"     value={`${kpis.control_effectiveness_avg}/130`} />
      </div>

      {/* Drill rail */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded border border-[#d8dde6] bg-white px-3 py-2 text-[11px] text-[#4a5568]">
        <span>Proposed: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.proposed_count}</span></span>
        <span>Baselines: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.synced_count}</span></span>
        <span>Tel. win.: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.bound_count}</span></span>
        <span>NTT emu.: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.emulated_count}</span></span>
        <span>Champ. pred.: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.collected_count}</span></span>
        <span>Counterfact.: <span className="font-semibold text-[#a06200]">{kpis.counterfactuals_count}</span></span>
        <span>Scored: <span className="font-semibold text-[#a06200]">{kpis.scored_count}</span></span>
        <span>Sig. tested: <span className="font-semibold text-[#a06200]">{kpis.tested_count}</span></span>
        <span>Certified: <span className="font-semibold text-[#1f6b3a]">{kpis.certified_count}</span></span>
        <span>Retraining: <span className="font-semibold text-[#1f6b3a]">{kpis.retrain_count}</span></span>
        <span>Archived: <span className="font-semibold text-[#1f5b3a]">{kpis.archived_count}</span></span>
        <span>Sig. failed: <span className="font-semibold text-[#a06200]">{kpis.significance_failed_count}</span></span>
        <span>Failover: <span className="font-semibold text-[#a06200]">{kpis.failover_count}</span></span>
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Floor flags: <span className="font-semibold text-[#a06200]">{kpis.floor_flag_total}</span></span>
        <span>Card exp. {'<'}30d: <span className="font-semibold text-[#9b1f1f]">{kpis.model_card_expiring_30d}</span></span>
        <span>Total ZAR: <span className="font-semibold text-[#1f5b3a]">{fmtZar(kpis.total_savings_sum_zar)}</span></span>
        <span>Audit: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w118_bridged_count}</span></span>
        <span>Anomaly: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w127_bridged_count}</span></span>
        <span>RUL: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w128_bridged_count}</span></span>
        <span>Fault: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w129_bridged_count}</span></span>
        <span>Physics: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{kpis.w71_bridged_count}</span></span>
        <span>Reneg. floor: <span className="font-semibold text-[#a06200]">{kpis.ntt_contract_reneg_consecutive_cycles_required} cyc.</span></span>
        <span>Material floor: <span className="font-semibold text-[#a06200]">{fmtZar(kpis.material_savings_floor_zar)}</span></span>
      </div>

      {/* Row 1: action / priority */}
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

      {/* Row 4: cycle kind */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS_KIND.map((f) => (
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Cycle #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Kind / asset</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Health</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>vs NTT</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Total</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Cumul.</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Ctrl</th>
                <th className="px-3 py-2 font-semibold text-center" style={{ color: 'oklch(0.46 0.16 55)' }}>Flags</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const health = HEALTH_TONE[r.battery_health_band_live ?? r.battery_health_band ?? 'green'];
                const control = r.control_effectiveness_index_live ?? r.control_effectiveness_index ?? 0;
                const flags = r.floor_flag_count_live ?? 0;
                const savingsPct = r.savings_vs_ntt_pct_live ?? null;
                const target = kpis.ntt_savings_target_pct ?? 30;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      <div className="text-[11px] font-semibold">{r.cycle_number}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.title ?? '-'}</div>
                      {r.is_reportable_flag ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span> : null}
                      {r.regulator_ref ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">FILED</span> : null}
                      {r.floor_at_fleet_systemic_live ? <span className="ml-1 text-[9px] font-semibold text-[#7a0e0e]">SYS</span> : null}
                      {r.ntt_contract_renegotiation_trigger ? <span className="ml-1 text-[9px] font-semibold text-[#a06200]">RENEG</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {fmtKind(r.cycle_kind)}
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
                    <td className={`px-3 py-2 text-right tabular-nums font-mono ${savingsPct == null ? 'text-[#4a5568]' : savingsPct >= target ? 'text-[#1f5b3a] font-semibold' : savingsPct >= 0 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {fmtPct(savingsPct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-[#0c2a4d]">
                      {fmtZar(r.total_savings_zar_live ?? r.total_savings_zar)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono text-[#1f5b3a]">
                      {fmtZar(r.cumulative_savings_zar_live ?? r.cumulative_savings_zar)}
                    </td>
                    <td className={`px-3 py-2 text-center tabular-nums ${control >= 100 ? 'text-[#1f5b3a]' : control >= 60 ? 'text-[#a06200]' : 'text-[#9b1f1f] font-semibold'}`}>
                      {control}/130
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
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No cycles match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer
          row={selected}
          events={events}
          target={kpis.ntt_savings_target_pct}
          materialFloor={kpis.material_savings_floor_zar}
          renegCycles={kpis.ntt_contract_reneg_consecutive_cycles_required}
          onClose={() => setSelected(null)}
          onAct={act}
          regulatorView={!!regulatorView}
        />
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
  row, events, target, materialFloor, renegCycles, onClose, onAct, regulatorView,
}: {
  row: NcbRow;
  events: NcbEvent[];
  target: number;
  materialFloor: number;
  renegCycles: number;
  onClose: () => void;
  onAct: (action: ActionKind, row: NcbRow) => void;
  regulatorView: boolean;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status] ?? null;
  const control = row.control_effectiveness_index_live ?? row.control_effectiveness_index ?? 0;
  const flags = row.floor_flag_count_live ?? 0;
  const nextCycleDays = row.days_to_next_cycle_live ?? row.days_to_next_cycle ?? null;
  const mcardDays = row.days_to_model_card_expiry_live ?? row.days_to_model_card_expiry ?? null;
  const savingsPct = row.savings_vs_ntt_pct_live ?? row.savings_vs_ntt_pct ?? null;
  const ciWidth = row.confidence_interval_width_zar_live ?? row.confidence_interval_width_zar ?? null;

  const ACTIVE_NON_TERMINAL: NcbStatus[] = [
    'cycle_proposed', 'baselines_synced', 'telemetry_window_bound',
    'ntt_emulation_run', 'champion_predictions_collected',
    'counterfactuals_computed', 'revenue_weighted_scored',
    'significance_tested', 'savings_certified', 'audit_published',
    'retraining_triggered', 'significance_failed', 'failover_to_prior_cycle',
  ];
  const FAILOVER_FROM: NcbStatus[] = ['savings_certified', 'audit_published', 'retraining_triggered'];
  const SIG_FAILURE_FROM: NcbStatus[] = ['revenue_weighted_scored', 'significance_tested'];

  const canRollback   = ACTIVE_NON_TERMINAL.includes(row.chain_status);
  const canRecall     = ACTIVE_NON_TERMINAL.includes(row.chain_status);
  const canFailover   = FAILOVER_FROM.includes(row.chain_status);
  const canSigFailure = SIG_FAILURE_FROM.includes(row.chain_status);

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
              {fmtKind(row.cycle_kind)} {'•'} {fmtAssetClass(row.asset_class)} {'•'} {row.current_tier.replace(/_/g, ' ')}
              {row.assets_covered != null ? <> {'•'} {row.assets_covered}a/{row.jurisdiction_count ?? 0}j{row.safety_critical ? '/SC' : ''}</> : null}
            </div>
            <h3 className="text-lg font-semibold text-[#0c2a4d]">{row.cycle_number}</h3>
            <p className="text-[11px] text-[#4a5568]">
              {row.title || 'NTT comparison battery cycle (AGGREGATOR)'}
              {row.ntt_baseline_version ? <> {'•'} NTT base <span className="font-mono">{row.ntt_baseline_version}</span></> : null}
              {row.cycle_window_start ? <> {'•'} {fmtDate(row.cycle_window_start)} → {fmtDate(row.cycle_window_end)}</> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.46 0.16 55)' }}>Close</button>
        </div>

        {/* Hero quad */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label={`vs NTT-${target}%`}
               value={fmtPct(savingsPct)}
               tone={savingsPct == null ? undefined : savingsPct >= target ? 'ok' : savingsPct >= 0 ? 'warn' : 'bad'} />
          <Kpi label="Cumul. savings" value={fmtZar(row.cumulative_savings_zar_live ?? row.cumulative_savings_zar)} tone="ok" />
          <Kpi label="Control eff." value={`${control}/130`} tone={control >= 100 ? 'ok' : control >= 60 ? 'warn' : 'bad'} />
          <Kpi label="SLA window" value={`${row.sla_target_hours ?? 0}h`} />
        </div>

        {/* Significance + CI panel */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
            Significance test + 95% confidence interval (paired-t lead, Wilcoxon backup, Brier skill)
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Field2 label="Paired-t p-value"
                    value={row.paired_t_pvalue ?? '-'}
                    tone={(row.paired_t_pvalue ?? 1) < 0.05 ? 'ok' : (row.paired_t_pvalue ?? 1) < 0.10 ? 'warn' : 'bad'} />
            <Field2 label="Wilcoxon p-value"
                    value={row.wilcoxon_pvalue ?? '-'}
                    tone={(row.wilcoxon_pvalue ?? 1) < 0.05 ? 'ok' : (row.wilcoxon_pvalue ?? 1) < 0.10 ? 'warn' : 'bad'} />
            <Field2 label="Brier skill vs NTT"
                    value={row.brier_skill_score_vs_ntt ?? '-'}
                    tone={(row.brier_skill_score_vs_ntt ?? 0) >= 0.20 ? 'ok' : (row.brier_skill_score_vs_ntt ?? 0) >= 0 ? 'warn' : 'bad'} />
            <Field2 label="CI width" value={fmtZar(ciWidth)} />
            <Field2 label="CI lower" value={fmtZar(row.confidence_interval_lower_zar_live ?? row.confidence_interval_lower_zar)} />
            <Field2 label="CI upper" value={fmtZar(row.confidence_interval_upper_zar_live ?? row.confidence_interval_upper_zar)} />
            <Field2 label="Physics ledger recon."
                    value={fmtPct(row.reconciliation_with_w71_savings_ledger_live ?? row.reconciliation_with_w71_savings_ledger_pct)}
                    tone={(row.reconciliation_with_w71_savings_ledger_live ?? 0) >= 95 ? 'ok' : (row.reconciliation_with_w71_savings_ledger_live ?? 0) >= 80 ? 'warn' : 'bad'} />
            <Field2 label="Audit hash"
                    value={row.audit_hash_published ? row.audit_hash_published.slice(0, 12) : '-'} mono />
          </div>
        </div>

        {/* Cycle counters */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
            Sustained-trigger counters (reneg threshold {renegCycles} consecutive above-target cycles; material floor {fmtZar(materialFloor)})
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Field2 label="Cycles above target"
                    value={row.consecutive_cycles_above_target}
                    tone={row.consecutive_cycles_above_target >= renegCycles ? 'ok' : 'warn'} />
            <Field2 label="Cycles below target"
                    value={row.consecutive_cycles_below_target}
                    tone={row.consecutive_cycles_below_target >= renegCycles ? 'bad' : 'warn'} />
            <Field2 label="FP saved (ZAR)" value={fmtZar(row.false_positive_savings_zar_live ?? row.false_positive_savings_zar)} />
            <Field2 label="FN saved (ZAR)" value={fmtZar(row.false_negative_savings_zar_live ?? row.false_negative_savings_zar)} />
            <Field2 label="NTT base. comp. %" value={fmtPct(row.ntt_baseline_comparison_pct)} />
            <Field2 label="Latency p50" value={`${row.inference_latency_p50_ms ?? '-'} ms`} />
            <Field2 label="Latency p99" value={`${row.inference_latency_p99_ms ?? '-'} ms`} />
            <Field2 label="ISO 42001"
                    value={`${row.iso_42001_compliance_score ?? '-'}/130`} />
            <Field2 label="Model card"
                    value={row.model_card_status ?? '-'}
                    tone={row.model_card_status === 'published' ? 'ok' : row.model_card_status === 'expired' ? 'bad' : row.model_card_status === 'approved' ? 'warn' : undefined} />
            <Field2 label="Card days"
                    value={mcardDays != null ? `${mcardDays}d` : '-'}
                    tone={mcardDays != null && mcardDays < 14 ? 'bad' : mcardDays != null && mcardDays < 30 ? 'warn' : 'ok'} />
            <Field2 label="Next cycle"
                    value={nextCycleDays != null ? `${nextCycleDays}d` : '-'}
                    tone={nextCycleDays != null && nextCycleDays < 3 ? 'bad' : nextCycleDays != null && nextCycleDays < 7 ? 'warn' : undefined} />
            <Field2 label="ISO 27001"
                    value={row.iso27001_controls_ok ? 'OK' : 'NO'}
                    tone={row.iso27001_controls_ok ? 'ok' : 'warn'} />
          </div>
        </div>

        {/* Floor flags */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">
            Floor flags ({flags}/5) - FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-FLEET-SYSTEMIC {'≥'}3
          </div>
          <div className="grid grid-cols-5 gap-2">
            <FlagPill on={!!row.material_savings_threshold_breached} label="Material savings" />
            <FlagPill on={!!row.ntt_contract_renegotiation_trigger} label="NTT contract reneg." />
            <FlagPill on={!!row.regulator_reportable_diversion} label="Reg-reportable diversion" />
            <FlagPill on={!!row.sox_ml_governance_required} label="SOX ML gov." />
            <FlagPill on={!!row.iso_42001_required} label="ISO 42001" />
          </div>
        </div>

        {/* Bridges */}
        <div className="mb-3 rounded border border-[#d8dde6] bg-white p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Cross-chain bridges (audit MANDATORY at publish_audit)</div>
          <div className="grid grid-cols-5 gap-2">
            <BridgePill on={!!row.bridges_to_w118_audit_chain_live} label="Audit (req)" />
            <BridgePill on={!!row.bridges_to_w127_anomaly_detection_live} label="Anomaly" />
            <BridgePill on={!!row.bridges_to_w128_rul_survival_live} label="RUL" />
            <BridgePill on={!!row.bridges_to_w129_fault_fingerprint_live} label="Fault" />
            <BridgePill on={!!row.bridges_to_w71_asset_prognostics_live} label="Physics ctrl." />
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
            {canSigFailure && row.chain_status !== 'significance_failed' && renderAct('flag-significance-failure', 'Flag sig. failure', 'amber')}
            {canFailover && renderAct('activate-failover', 'Activate failover', 'amber')}
            {canRollback && renderAct('rollback-cycle', 'ROLLBACK (HARD)', 'danger')}
            {canRecall && renderAct('recall-certification', 'RECALL (SIGNATURE)', 'danger')}
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

function Field2({
  label, value, tone, mono,
}: {
  label: string;
  value: number | string | null | undefined;
  tone?: 'ok' | 'warn' | 'bad';
  mono?: boolean;
}) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'ok' ? '#1f5b3a' : '#0c2a4d';
  const weight = tone === 'bad' ? 'font-semibold' : '';
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className={`text-[12px] tabular-nums ${mono ? 'font-mono' : ''} ${weight}`} style={{ color }}>
        {value ?? '-'}
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

const KIND_OPTIONS: Array<{ key: CycleKind; label: string }> = [
  { key: 'nightly',   label: 'Nightly (default)' },
  { key: 'weekly',    label: 'Weekly' },
  { key: 'monthly',   label: 'Monthly' },
  { key: 'on_demand', label: 'On-demand' },
  { key: 'forensic',  label: 'Forensic' },
];

const ASSET_OPTIONS: Array<{ key: AssetClass; label: string }> = [
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
  const [kind, setKind] = useState<CycleKind>('nightly');
  const [assetClass, setAssetClass] = useState<AssetClass>('generic');
  const [assetsCovered, setAssetsCovered] = useState('');
  const [jurisdictions, setJurisdictions] = useState('');
  const [safetyCritical, setSafetyCritical] = useState(false);
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [championAnomaly, setChampionAnomaly] = useState('');
  const [championRul, setChampionRul] = useState('');
  const [championFault, setChampionFault] = useState('');
  const [nttVersion, setNttVersion] = useState('ntt-iot-v6.2');
  const [priorCycleRef, setPriorCycleRef] = useState('');
  const [nextCycleDue, setNextCycleDue] = useState('');
  const [mcardExpiry, setMcardExpiry] = useState('');
  const [title, setTitle] = useState('');
  const [w118, setW118] = useState('');
  const [w127, setW127] = useState('');
  const [w128, setW128] = useState('');
  const [w129, setW129] = useState('');
  const [w71, setW71] = useState('');
  const [materialSavings, setMaterialSavings] = useState(false);
  const [renegTrigger, setRenegTrigger] = useState(false);
  const [reportableDiversion, setReportableDiversion] = useState(false);
  const [soxMl, setSoxMl] = useState(false);
  const [iso42001, setIso42001] = useState(false);
  const [regulatorRelevant, setRegulatorRelevant] = useState(false);

  const submit = () => {
    const body: Record<string, unknown> = {
      cycle_kind: kind,
      asset_class: assetClass,
      assets_covered: assetsCovered ? Number(assetsCovered) : undefined,
      jurisdiction_count: jurisdictions ? Number(jurisdictions) : undefined,
      safety_critical: safetyCritical ? 1 : 0,
      cycle_window_start: windowStart || undefined,
      cycle_window_end: windowEnd || undefined,
      champion_anomaly_model_version: championAnomaly || undefined,
      champion_rul_model_version: championRul || undefined,
      champion_fault_model_version: championFault || undefined,
      ntt_baseline_version: nttVersion || undefined,
      prior_cycle_ref: priorCycleRef || undefined,
      next_cycle_due_at: nextCycleDue || undefined,
      model_card_expiry_at: mcardExpiry || undefined,
      title: title || undefined,
      w118_block_ref: w118 || undefined,
      w127_anomaly_detection_ref: w127 || undefined,
      w128_rul_survival_ref: w128 || undefined,
      w129_fault_fingerprint_ref: w129 || undefined,
      w71_asset_prognostics_ref: w71 || undefined,
      material_savings_threshold_breached: materialSavings ? 1 : 0,
      ntt_contract_renegotiation_trigger: renegTrigger ? 1 : 0,
      regulator_reportable_diversion: reportableDiversion ? 1 : 0,
      sox_ml_governance_required: soxMl ? 1 : 0,
      iso_42001_required: iso42001 ? 1 : 0,
      regulator_relevant: regulatorRelevant ? 1 : 0,
    };
    onSubmit(body);
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded bg-white p-4 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#0c2a4d]">Propose NTT comparison cycle</h3>
            <p className="text-[11px] text-[#4a5568]">
              Audit bridge advisable at propose; MANDATORY at publish_audit (route will 422 reject otherwise).
              Tier auto-derived from (assets_covered, jurisdiction_count, safety_critical) with FLOOR-AT-LARGE-FLEET {'≥'}1 flag and FLOOR-AT-FLEET-SYSTEMIC {'≥'}3 flags.
              recall_certification crosses regulator EVERY tier (SIGNATURE).
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.46 0.16 55)' }}>Close</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cycle kind">
            <select value={kind} onChange={(e) => setKind(e.target.value as CycleKind)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {KIND_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Asset class">
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]">
              {ASSET_OPTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
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
          <Field label="Cycle window start (ISO)">
            <input value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="2026-05-30T00:00:00Z" />
          </Field>
          <Field label="Cycle window end (ISO)">
            <input value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="2026-05-31T00:00:00Z" />
          </Field>
          <Field label="NTT baseline version">
            <input value={nttVersion} onChange={(e) => setNttVersion(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="ntt-iot-v6.2" />
          </Field>
          <Field label="Champion anomaly version">
            <input value={championAnomaly} onChange={(e) => setChampionAnomaly(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="1.0.0" />
          </Field>
          <Field label="Champion RUL version">
            <input value={championRul} onChange={(e) => setChampionRul(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="1.0.0" />
          </Field>
          <Field label="Champion fault version">
            <input value={championFault} onChange={(e) => setChampionFault(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="1.0.0" />
          </Field>
          <Field label="Prior cycle ref (chain link)">
            <input value={priorCycleRef} onChange={(e) => setPriorCycleRef(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="ncb-015" />
          </Field>
          <Field label="Next cycle due (ISO)">
            <input value={nextCycleDue} onChange={(e) => setNextCycleDue(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="2026-06-01T04:00:00Z" />
          </Field>
          <Field label="Model card expiry (ISO)">
            <input value={mcardExpiry} onChange={(e) => setMcardExpiry(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="2026-11-30T00:00:00Z" />
          </Field>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="Nightly fleet-wide PV comparison 2026-05-30" />
          </Field>
          <Field label="Audit block ref (MANDATORY at publish_audit)">
            <input value={w118} onChange={(e) => setW118(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="audit-block-2026-1234" />
          </Field>
          <Field label="Anomaly detection ref">
            <input value={w127} onChange={(e) => setW127(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="ad-2026-007" />
          </Field>
          <Field label="RUL survival ref">
            <input value={w128} onChange={(e) => setW128(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="rul-2026-011" />
          </Field>
          <Field label="Fault fingerprint ref">
            <input value={w129} onChange={(e) => setW129(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="ffml-2026-005" />
          </Field>
          <Field label="Asset prognostics ref (control variable)">
            <input value={w71} onChange={(e) => setW71(e.target.value)} className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px]" placeholder="aprog-2026-007" />
          </Field>
        </div>

        <div className="mt-3 rounded border border-[#d8dde6] bg-[#f8fafc] p-3 text-[11px]">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[#4a5568]">Floor flags (FLOOR-AT-LARGE-FLEET {'≥'}1, FLOOR-AT-FLEET-SYSTEMIC {'≥'}3)</div>
          <div className="grid grid-cols-3 gap-2">
            <Checkbox checked={materialSavings} onChange={setMaterialSavings} label="Material savings threshold" />
            <Checkbox checked={renegTrigger} onChange={setRenegTrigger} label="NTT contract renegotiation" />
            <Checkbox checked={reportableDiversion} onChange={setReportableDiversion} label="Reg-reportable diversion" />
            <Checkbox checked={soxMl} onChange={setSoxMl} label="SOX ML governance" />
            <Checkbox checked={iso42001} onChange={setIso42001} label="ISO 42001 AIMS" />
            <Checkbox checked={regulatorRelevant} onChange={setRegulatorRelevant} label="Regulator relevant" />
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded bg-white border border-[#d8dde6] px-3 py-1.5 text-[12px] hover:bg-[#f3f5f9]" style={{ color: 'oklch(0.46 0.16 55)' }}>Cancel</button>
          <button type="button" onClick={submit} className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#c2873a]">Propose cycle</button>
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
