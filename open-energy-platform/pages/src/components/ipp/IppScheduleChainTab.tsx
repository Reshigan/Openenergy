// Wave 112 — IPP WBS & Gantt Schedule Management chain (P6).
//
// 7th IPP chain. First wave of Phase A IPP-parity push. WBS baseline +
// Gantt + EVM (CPI/SPI/SPI_t) + variance + rebaseline + recovery engine.
// Beats Primavera P6 / MS Project / Procore Schedule / Aconex Schedule /
// Oracle Primavera Cloud / Trimble Quadri / Asta Powerproject / Deltek
// Acumen Fuse / SAP Project Management.
//
// 12-state P6 + 3 branches with INVERTED SLA polarity stored in HOURS,
// FLOOR-AT-LARGE tier overlay on 5 flags, FLOOR-AT-MEGA on 2+ flags OR
// critical_path_breach. 4-step authority ladder. 20-field LIVE battery.
// 4-bridge architecture to W19 / W20 / W23 / W25.
//
// Standards: PMBOK 7 + ISO 21500:2021 + AACE RP 27R-03 + AACE 29R-03 +
// REIPPPP IPP Office + NERSA Grid Code C-5 + DMRE Section 34.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainCardProps, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'wbs_drafted' | 'baseline_set' | 'in_progress' | 'status_updated'
  | 'variance_detected' | 'impact_assessed' | 'rebaselined' | 'recovered'
  | 'completed' | 'suspended' | 'cancelled' | 'late_finish';

type IpsTier = 'small' | 'medium' | 'large' | 'mega';
type IpsUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'scheduler' | 'project_manager' | 'portfolio_director' | 'IPP_CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';

interface IpsRow {
  [key: string]: unknown;
  id: string;
  schedule_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;
  insurance_claim_ref: string | null;
  hse_incident_ref: string | null;
  baseline_label: string | null;
  baseline_set_at: string | null;
  baseline_total_tasks: number;
  baseline_total_duration_days: number;
  baseline_planned_start: string | null;
  baseline_planned_finish: string | null;
  current_planned_finish: string | null;
  contractual_final_milestone_date: string | null;
  percent_complete: number;
  tasks_completed: number;
  tasks_in_progress: number;
  tasks_not_started: number;
  last_progress_update_at: string | null;
  planned_value_zar: number;
  earned_value_zar: number;
  actual_cost_zar: number;
  budget_at_completion_zar: number;
  cpi: number;
  spi: number;
  spi_t: number;
  schedule_variance_zar: number;
  cost_variance_zar: number;
  schedule_variance_pct: number;
  cost_variance_pct: number;
  critical_path_total_float_days: number;
  critical_tasks_count: number;
  longest_path_duration_days: number;
  variance_count: number;
  rebaseline_count: number;
  last_variance_at: string | null;
  last_rebaseline_at: string | null;
  variance_reason: string | null;
  rebaseline_reason: string | null;
  recovery_plan_summary: string | null;
  critical_path_breach: number;
  resource_constrained_over_pct_25: number;
  weather_window_at_risk: number;
  community_disruption_threshold_breached: number;
  EPC_subcontractor_milestone_at_risk: number;
  current_tier: IpsTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  schedule_health_band: HealthBand | null;
  schedule_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  suspend_reason: string | null;
  cancel_reason: string | null;
  late_finish_reason: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  wbs_drafted_at: string | null;
  in_progress_at: string | null;
  status_updated_at: string | null;
  variance_detected_at: string | null;
  impact_assessed_at: string | null;
  rebaselined_at: string | null;
  recovered_at: string | null;
  completed_at: string | null;
  suspended_at: string | null;
  cancelled_at: string | null;
  late_finish_at: string | null;
  signoff_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: IpsUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  cpi_live?: number;
  spi_live?: number;
  schedule_variance_zar_live?: number;
  cost_variance_zar_live?: number;
  schedule_variance_pct_live?: number;
  cost_variance_pct_live?: number;
  critical_path_float_days_live?: number;
  days_to_planned_finish_live?: number | null;
  days_since_baseline_live?: number;
  late_finish_risk_live?: boolean;
  rebaseline_imminent_live?: boolean;
  schedule_health_band_live?: HealthBand;
  floor_flag_count_live?: number;
  schedule_completeness_index_live?: number;
  bridges_to_procurement_chain_live?: boolean;
  bridges_to_cod_chain_live?: boolean;
  bridges_to_insurance_claim_chain_live?: boolean;
  bridges_to_hse_incident_chain_live?: boolean;
}

interface IpsEvent {
  id: string;
  schedule_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  active_count: number;
  variance_count: number;
  impact_assessed_count: number;
  rebaselined_count: number;
  suspended_count: number;
  late_finish_count: number;
  cancelled_count: number;
  completed_count: number;
  mega_count: number;
  breached: number;
  reportable_total: number;
  late_finish_risk_count: number;
  rebaseline_imminent_count: number;
  procurement_bridged_count: number;
  cod_bridged_count: number;
  insurance_bridged_count: number;
  hse_bridged_count: number;
  planned_value_zar_sum: number;
  earned_value_zar_sum: number;
  actual_cost_zar_sum: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'wbs_drafted',
  'baseline_set',
  'in_progress',
  'status_updated',
  'variance_detected',
  'impact_assessed',
  'rebaselined',
  'recovered',
  'completed',
];

const BRANCH_STATES: readonly string[] = [
  'suspended',
  'cancelled',
  'late_finish',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active' },
  { key: 'all',                  label: 'All' },
  { key: 'reportable',           label: 'Reportable' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'variance_detected',    label: 'Variance' },
  { key: 'impact_assessed',      label: 'Impact assessed' },
  { key: 'rebaselined',          label: 'Rebaselined' },
  { key: 'suspended',            label: 'Suspended' },
  { key: 'late_finish',          label: 'Late finish' },
  { key: 'late_finish_risk',     label: 'Late-finish risk' },
  { key: 'rebaseline_imminent',  label: 'Rebaseline imminent' },
  { key: 'health_red',           label: 'Health red' },
  { key: 'health_critical',      label: 'Health critical' },
  { key: 'critical_path_breach', label: 'CP breach' },
  { key: 'small',                label: 'Small' },
  { key: 'medium',               label: 'Medium' },
  { key: 'large',                label: 'Large' },
  { key: 'mega',                 label: 'Mega' },
  { key: 'wbs_drafted',          label: 'WBS drafted' },
  { key: 'baseline_set',         label: 'Baseline set' },
  { key: 'in_progress',          label: 'In progress' },
  { key: 'status_updated',       label: 'Status updated' },
  { key: 'recovered',            label: 'Recovered' },
  { key: 'completed',            label: 'Completed' },
  { key: 'cancelled',            label: 'Cancelled' },
];

// ── format helpers ────────────────────────────────────────────────────────
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

function fmtDay(s: string | null | undefined): string {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('en-ZA');
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}R${(abs / 1_000_000_000).toFixed(2)}bn`;
  if (abs >= 1_000_000)     return `${sign}R${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1000)          return `${sign}R${(abs / 1000).toFixed(0)}k`;
  return `${sign}R${abs.toLocaleString('en-ZA')}`;
}

function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(digits)}%`;
}

function fmtNum(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined) return '-';
  return n.toFixed(digits);
}

function fmtDays(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `${n}d`;
}

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(0)} MW`;
}

// ── action helpers ────────────────────────────────────────────────────────
const CAN_SUSPEND: ChainStatus[] = ['in_progress', 'status_updated', 'variance_detected', 'impact_assessed', 'rebaselined', 'recovered'];
const CAN_CANCEL: ChainStatus[]  = ['wbs_drafted', 'baseline_set', 'in_progress', 'status_updated', 'variance_detected', 'impact_assessed', 'rebaselined', 'recovered', 'suspended'];
const CAN_LATE_FINISH: ChainStatus[] = ['in_progress', 'status_updated', 'variance_detected', 'impact_assessed'];

function getActions(row: IpsRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action per state
  if (s === 'wbs_drafted') {
    actions.push({
      key: 'set-baseline',
      label: 'Set baseline (Scheduler)',
      fields: [
        { key: 'baseline_label',               label: 'Baseline label (e.g. B0, B1)',          type: 'text',     required: false, placeholder: row.baseline_label ?? 'B0' },
        { key: 'baseline_total_tasks',         label: 'Baseline total tasks',                  type: 'number',   required: false, placeholder: String(row.baseline_total_tasks || 0) },
        { key: 'baseline_total_duration_days', label: 'Baseline total duration days',          type: 'number',   required: false, placeholder: String(row.baseline_total_duration_days || 0) },
        { key: 'baseline_planned_finish',      label: 'Baseline planned finish (YYYY-MM-DD)',  type: 'date',     required: false, placeholder: row.baseline_planned_finish ?? '' },
        { key: 'budget_at_completion_zar',     label: 'Budget at completion (ZAR)',            type: 'number',   required: false, placeholder: String(row.budget_at_completion_zar || 0) },
        { key: 'planned_value_zar',            label: 'Planned value (PV) ZAR (typically=BAC at baseline)', type: 'number', required: false, placeholder: String(row.planned_value_zar || 0) },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'baseline_set') {
    actions.push({
      key: 'start-execution',
      label: 'Start execution (PM)',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'in_progress') {
    actions.push({
      key: 'update-progress',
      label: 'Update progress (Scheduler)',
      fields: [
        { key: 'percent_complete',                   label: '% complete',                          type: 'number',   required: false, placeholder: String(row.percent_complete || 0) },
        { key: 'earned_value_zar',                   label: 'Earned value (EV) ZAR',               type: 'number',   required: false, placeholder: String(row.earned_value_zar || 0) },
        { key: 'planned_value_zar',                  label: 'Planned value (PV) ZAR',              type: 'number',   required: false, placeholder: String(row.planned_value_zar || 0) },
        { key: 'actual_cost_zar',                    label: 'Actual cost (AC) ZAR',                type: 'number',   required: false, placeholder: String(row.actual_cost_zar || 0) },
        { key: 'critical_path_total_float_days',     label: 'Critical-path total float (days)',    type: 'number',   required: false, placeholder: String(row.critical_path_total_float_days || 0) },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'status_updated') {
    actions.push({
      key: 'detect-variance',
      label: 'Detect variance (Scheduler)',
      fields: [
        { key: 'variance_reason',      label: 'Variance reason (required for audit)',  type: 'textarea', required: true,  placeholder: row.variance_reason ?? '' },
        { key: 'earned_value_zar',     label: 'Updated earned value (EV) ZAR',        type: 'number',   required: false, placeholder: String(row.earned_value_zar || 0) },
        { key: 'critical_path_breach', label: 'Critical path breach now active? (1=yes, 0=no)', type: 'number', required: false, placeholder: String(row.critical_path_breach || 0) },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'variance_detected') {
    actions.push({
      key: 'assess-impact',
      label: 'Assess impact (PM)',
      fields: [
        { key: 'current_planned_finish',      label: 'Revised planned finish (YYYY-MM-DD)',  type: 'date',   required: false, placeholder: row.current_planned_finish ?? '' },
        { key: 'longest_path_duration_days',  label: 'Longest-path duration (days)',         type: 'number', required: false, placeholder: String(row.longest_path_duration_days || 0) },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'impact_assessed') {
    // Primary: rebaseline (crosses regulator large+mega)
    actions.push({
      key: 'rebaseline-schedule',
      label: 'Rebaseline (Portfolio Director — crosses regulator large+mega)',
      fields: [
        { key: 'rebaseline_reason',       label: 'Rebaseline reason (required for audit). NOTE: crosses regulator on large+mega.', type: 'textarea', required: true,  placeholder: row.rebaseline_reason ?? '' },
        { key: 'baseline_label',          label: 'New baseline label (e.g. B1)',              type: 'text', required: false, placeholder: row.baseline_label ?? 'B1' },
        { key: 'baseline_planned_finish', label: 'New baseline planned finish (YYYY-MM-DD)',  type: 'date', required: false, placeholder: row.baseline_planned_finish ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
    // Secondary: propose recovery plan
    actions.push({
      key: 'propose-recovery',
      label: 'Propose recovery plan (PM)',
      fields: [
        { key: 'recovery_plan_summary', label: 'Recovery plan summary (required)', type: 'textarea', required: true, placeholder: row.recovery_plan_summary ?? '' },
      ],
      cascadeTo: [],
    });
    // Secondary: mark recovered directly from impact_assessed
    actions.push({
      key: 'mark-recovered',
      label: 'Mark recovered (PM)',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'rebaselined') {
    // Approve / reject rebaseline (IPP CEO)
    actions.push({
      key: 'approve-rebaseline',
      label: 'Approve rebaseline (IPP CEO)',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'reject-rebaseline',
      label: 'Reject rebaseline (IPP CEO)',
      fields: [],
      cascadeTo: [],
    });
    // Primary forward: mark recovered
    actions.push({
      key: 'mark-recovered',
      label: 'Mark recovered (PM)',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'recovered') {
    actions.push({
      key: 'mark-completed',
      label: 'Mark completed (PM)',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'suspended') {
    actions.push({
      key: 'resume-schedule',
      label: 'Resume schedule (PM)',
      fields: [],
      cascadeTo: [],
    });
  }

  // Cross-state secondary actions
  if (CAN_SUSPEND.includes(s)) {
    actions.push({
      key: 'suspend-schedule',
      label: 'Suspend schedule (PM)',
      fields: [
        { key: 'suspend_reason', label: 'Suspension reason (required)', type: 'textarea', required: true, placeholder: row.suspend_reason ?? '' },
      ],
      cascadeTo: [],
    });
  }

  if (CAN_LATE_FINISH.includes(s)) {
    // SIGNATURE — crosses regulator EVERY tier when project_capacity_mw >= 1 MW
    actions.push({
      key: 'mark-late-finish',
      label: 'Mark LATE FINISH (PM — SIGNATURE crosses regulator EVERY tier when >=1MW)',
      fields: [
        { key: 'late_finish_reason', label: 'Late-finish reason (required). NOTE: SIGNATURE — crosses regulator EVERY tier when project_capacity_mw>=1MW.', type: 'textarea', required: true, placeholder: row.late_finish_reason ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  if (CAN_CANCEL.includes(s)) {
    // Crosses regulator EVERY tier when >=1MW
    actions.push({
      key: 'cancel-schedule',
      label: 'Cancel schedule (Portfolio Director — crosses regulator EVERY tier when >=1MW)',
      fields: [
        { key: 'cancel_reason', label: 'Cancellation reason (required). NOTE: crosses regulator EVERY tier when >=1MW.', type: 'textarea', required: true, placeholder: row.cancel_reason ?? '' },
      ],
      cascadeTo: ['regulator'],
    });
  }

  return actions;
}

function renderDetail(row: IpsRow): React.ReactNode {
  const cpiV = row.cpi_live ?? row.cpi;
  const spiV = row.spi_live ?? row.spi;
  const cpFloat = row.critical_path_float_days_live ?? row.critical_path_total_float_days;
  const svZar = row.schedule_variance_zar_live ?? row.schedule_variance_zar;
  const cvZar = row.cost_variance_zar_live ?? row.cost_variance_zar;
  const svPct = row.schedule_variance_pct_live ?? row.schedule_variance_pct;
  const cvPct = row.cost_variance_pct_live ?? row.cost_variance_pct;
  const completeness = row.schedule_completeness_index_live ?? row.schedule_completeness_index;

  return (
    <div style={{ fontSize: 11, color: TX2 }}>
      {/* LIVE battery */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>LIVE battery (20 fields)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="% complete"          value={fmtPct(row.percent_complete, 0)} />
          <DetailPair label="CPI"                 value={fmtNum(cpiV)} tone={cpiV >= 1 ? 'ok' : cpiV >= 0.85 ? 'warn' : 'bad'} />
          <DetailPair label="SPI"                 value={fmtNum(spiV)} tone={spiV >= 1 ? 'ok' : spiV >= 0.85 ? 'warn' : 'bad'} />
          <DetailPair label="SPI_t"               value={fmtNum(row.spi_t)} />
          <DetailPair label="Schedule var ZAR"    value={fmtZar(svZar)} tone={svZar >= 0 ? 'ok' : 'bad'} />
          <DetailPair label="Cost var ZAR"        value={fmtZar(cvZar)} tone={cvZar >= 0 ? 'ok' : 'bad'} />
          <DetailPair label="Schedule var %"      value={fmtPct(svPct)} />
          <DetailPair label="Cost var %"          value={fmtPct(cvPct)} />
          <DetailPair label="CP float days"       value={fmtDays(cpFloat)} tone={cpFloat < 0 ? 'bad' : cpFloat <= 2 ? 'warn' : 'ok'} />
          <DetailPair label="Days to finish"      value={fmtDays(row.days_to_planned_finish_live)} tone={(row.days_to_planned_finish_live ?? 0) < 0 ? 'bad' : 'ok'} />
          <DetailPair label="Days since baseline" value={fmtDays(row.days_since_baseline_live)} />
          <DetailPair label="Completeness index"  value={`${completeness} / 130`} />
          <DetailPair label="SLA hrs remaining"   value={fmtHoursSla(row.sla_hours_remaining_live)} tone={row.sla_breached_live ? 'bad' : 'ok'} />
          <DetailPair label="SLA window"          value={fmtHoursSla(row.sla_window_hours)} />
          <DetailPair label="Authority"           value={row.authority_required_live ?? '-'} />
          <DetailPair label="Regulator filing"    value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
          <DetailPair label="Variance count"      value={String(row.variance_count)} tone={row.variance_count > 0 ? 'warn' : 'ok'} />
          <DetailPair label="Rebaseline count"    value={String(row.rebaseline_count)} tone={row.rebaseline_count > 0 ? 'bad' : 'ok'} />
          <DetailPair label="Floor flags"         value={String(row.floor_flag_count_live ?? 0)} tone={(row.floor_flag_count_live || 0) >= 2 ? 'bad' : (row.floor_flag_count_live || 0) >= 1 ? 'warn' : 'ok'} />
          <DetailPair label="Escalation level"    value={String(row.escalation_level)} tone={row.escalation_level >= 2 ? 'bad' : row.escalation_level >= 1 ? 'warn' : 'ok'} />
        </div>
      </div>

      {/* EVM */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>EVM (Earned Value Management)</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Planned value (PV)"   value={fmtZar(row.planned_value_zar)} />
          <DetailPair label="Earned value (EV)"    value={fmtZar(row.earned_value_zar)} />
          <DetailPair label="Actual cost (AC)"     value={fmtZar(row.actual_cost_zar)} />
          <DetailPair label="Budget at completion" value={fmtZar(row.budget_at_completion_zar)} />
          <DetailPair label="Critical tasks"       value={String(row.critical_tasks_count)} />
          <DetailPair label="Longest path days"    value={fmtDays(row.longest_path_duration_days)} />
          <DetailPair label="Tasks completed"      value={String(row.tasks_completed)} />
          <DetailPair label="Tasks in progress"    value={String(row.tasks_in_progress)} />
        </div>
      </div>

      {/* Baseline + dates */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>Baseline + dates</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Baseline label"              value={row.baseline_label ?? '-'} />
          <DetailPair label="Baseline set at"             value={fmtDate(row.baseline_set_at)} />
          <DetailPair label="Baseline planned start"      value={fmtDay(row.baseline_planned_start)} />
          <DetailPair label="Baseline planned finish"     value={fmtDay(row.baseline_planned_finish)} />
          <DetailPair label="Current planned finish"      value={fmtDay(row.current_planned_finish)} />
          <DetailPair label="Contractual final milestone" value={fmtDay(row.contractual_final_milestone_date)} />
          <DetailPair label="Baseline total tasks"        value={String(row.baseline_total_tasks)} />
          <DetailPair label="Baseline total duration"     value={fmtDays(row.baseline_total_duration_days)} />
        </div>
      </div>

      {/* 4-bridge architecture */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>4-bridge architecture</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <DetailPair label="Procurement ref"          value={row.procurement_ref ?? '-'}     tone={row.bridges_to_procurement_chain_live ? 'ok' : 'warn'} />
          <DetailPair label="COD ref"                  value={row.cod_ref ?? '-'}             tone={row.bridges_to_cod_chain_live ? 'ok' : 'warn'} />
          <DetailPair label="Insurance claim ref"      value={row.insurance_claim_ref ?? '-'} tone={row.bridges_to_insurance_claim_chain_live ? 'ok' : 'warn'} />
          <DetailPair label="HSE incident ref"         value={row.hse_incident_ref ?? '-'}    tone={row.bridges_to_hse_incident_chain_live ? 'ok' : 'warn'} />
          <DetailPair label="Regulator inbox ref"      value={row.regulator_inbox_ref ?? '-'} />
          <DetailPair label="Regulator ref"            value={row.regulator_ref ?? '-'} />
          <DetailPair label="Last variance at"         value={fmtDate(row.last_variance_at)} />
          <DetailPair label="Last rebaseline at"       value={fmtDate(row.last_rebaseline_at)} />
        </div>
      </div>

      {/* Floor flags */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>Floor flags (5)</div>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['Critical-path breach',      !!row.critical_path_breach],
            ['Resource overalloc >=25%',  !!row.resource_constrained_over_pct_25],
            ['Weather window at risk',    !!row.weather_window_at_risk],
            ['Community disruption',      !!row.community_disruption_threshold_breached],
            ['EPC subcontractor at risk', !!row.EPC_subcontractor_milestone_at_risk],
          ] as [string, boolean][]).map(([label, on]) => (
            <span key={label} style={{
              display: 'inline-block',
              padding: '1px 8px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              background: on ? 'oklch(0.94 0.05 20)' : BG2,
              color: on ? BAD : TX3,
            }}>
              {label}{on ? ' ✓' : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Reasons / narrative */}
      {(row.variance_reason || row.rebaseline_reason || row.recovery_plan_summary || row.suspend_reason || row.cancel_reason || row.late_finish_reason) && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 4 }}>Reasons / narrative</div>
          <div className="space-y-1.5" style={{ fontSize: 11, color: TX1 }}>
            {row.variance_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Variance reason</div>
                <div style={{ color: TX2 }}>{row.variance_reason}</div>
              </div>
            )}
            {row.rebaseline_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Rebaseline reason</div>
                <div style={{ color: TX2 }}>{row.rebaseline_reason}</div>
              </div>
            )}
            {row.recovery_plan_summary && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Recovery plan</div>
                <div style={{ color: TX2 }}>{row.recovery_plan_summary}</div>
              </div>
            )}
            {row.suspend_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Suspend reason</div>
                <div style={{ color: TX2 }}>{row.suspend_reason}</div>
              </div>
            )}
            {row.cancel_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Cancel reason</div>
                <div style={{ color: TX2 }}>{row.cancel_reason}</div>
              </div>
            )}
            {row.late_finish_reason && (
              <div className="rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>Late-finish reason</div>
                <div style={{ color: TX2 }}>{row.late_finish_reason}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function IppScheduleChainTab() {
  const [rows, setRows] = useState<IpsRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IpsRow[] } & KpiSummary }>('/ipp/wbs-schedule/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          variance_count: data.variance_count || 0,
          impact_assessed_count: data.impact_assessed_count || 0,
          rebaselined_count: data.rebaselined_count || 0,
          suspended_count: data.suspended_count || 0,
          late_finish_count: data.late_finish_count || 0,
          cancelled_count: data.cancelled_count || 0,
          completed_count: data.completed_count || 0,
          mega_count: data.mega_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          late_finish_risk_count: data.late_finish_risk_count || 0,
          rebaseline_imminent_count: data.rebaseline_imminent_count || 0,
          procurement_bridged_count: data.procurement_bridged_count || 0,
          cod_bridged_count: data.cod_bridged_count || 0,
          insurance_bridged_count: data.insurance_bridged_count || 0,
          hse_bridged_count: data.hse_bridged_count || 0,
          planned_value_zar_sum: data.planned_value_zar_sum || 0,
          earned_value_zar_sum: data.earned_value_zar_sum || 0,
          actual_cost_zar_sum: data.actual_cost_zar_sum || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP WBS schedule chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp/wbs-schedule/chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/wbs-schedule/chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: IpsRow; events: ChainEvent[] } }>(`/ipp/wbs-schedule/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')                  return true;
      if (filter === 'active')               return !r.is_terminal;
      if (filter === 'reportable')           return r.is_reportable_flag;
      if (filter === 'breached')             return r.sla_breached_live;
      if (filter === 'late_finish_risk')     return r.late_finish_risk_live;
      if (filter === 'rebaseline_imminent')  return r.rebaseline_imminent_live;
      if (filter === 'health_red')           return r.schedule_health_band_live === 'red';
      if (filter === 'health_critical')      return r.schedule_health_band_live === 'critical';
      if (filter === 'critical_path_breach') return !!r.critical_path_breach;
      if (['small', 'medium', 'large', 'mega'].includes(filter)) return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, variance_count: 0, impact_assessed_count: 0,
    rebaselined_count: 0, suspended_count: 0, late_finish_count: 0, cancelled_count: 0,
    completed_count: 0, mega_count: 0, breached: 0, reportable_total: 0,
    late_finish_risk_count: 0, rebaseline_imminent_count: 0,
    procurement_bridged_count: 0, cod_bridged_count: 0,
    insurance_bridged_count: 0, hse_bridged_count: 0,
    planned_value_zar_sum: 0, earned_value_zar_sum: 0, actual_cost_zar_sum: 0,
  };

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>
          IPP WBS &amp; Gantt Schedule Management — PMBOK 7 + ISO 21500:2021 + AACE RP 27R-03 + AACE 29R-03 + REIPPPP + NERSA Grid Code C-5 + DMRE §34
        </h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 4 }}>
          12-state P6 schedule lifecycle: wbs drafted → baseline set → in progress → status updated → variance detected → impact assessed →
          rebaselined → recovered → completed, with suspended / cancelled / <strong>late_finish</strong> branches.
          INVERTED SLA polarity (HOURS) on variance_detected: small 120h, medium 240h, large 480h, mega 720h.
          FLOOR-AT-LARGE on any 1 of 5 floor flags; FLOOR-AT-MEGA on 2+ flags OR critical-path breach.
          <strong> SIGNATURE: mark-late-finish crosses regulator EVERY tier when project_capacity_mw ≥ 1 MW</strong> (REIPPPP + DMRE §34 + NERSA C-5);
          cancel-schedule crosses regulator EVERY tier ≥1 MW; rebaseline-schedule crosses large+mega.
          4-step authority ladder: scheduler → project_manager → portfolio_director → IPP_CEO.
          4 bridges: procurement, COD, insurance claim, HSE incident.
          Nightly schedule-health recompute at 00:15 UTC keeps CPI/SPI/SV/CV live.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total"         value={kpis.total} />
        <KpiTile label="Active"        value={kpis.active_count}       tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Variance"      value={kpis.variance_count}     tone={kpis.variance_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Rebaselined"   value={kpis.rebaselined_count}  tone={kpis.rebaselined_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Suspended"     value={kpis.suspended_count}    tone={kpis.suspended_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Late finish"   value={kpis.late_finish_count}  tone={kpis.late_finish_count > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Mega"          value={kpis.mega_count}         tone={kpis.mega_count > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached"  value={kpis.breached}           tone={kpis.breached > 0 ? 'bad' : 'ok'} />
      </div>

      {/* Secondary KPI row */}
      <div className="mb-4 flex flex-wrap items-center gap-4" style={{ fontSize: 11, color: TX2 }}>
        <span>Reportable: <strong style={{ color: BAD }}>{kpis.reportable_total}</strong></span>
        <span>Late-finish risk: <strong style={{ color: BAD }}>{kpis.late_finish_risk_count}</strong></span>
        <span>Rebaseline imminent: <strong style={{ color: WARN }}>{kpis.rebaseline_imminent_count}</strong></span>
        <span>Bridges procurement: <strong style={{ color: TX1 }}>{kpis.procurement_bridged_count}</strong></span>
        <span>Bridges COD: <strong style={{ color: TX1 }}>{kpis.cod_bridged_count}</strong></span>
        <span>Bridges claim: <strong style={{ color: TX1 }}>{kpis.insurance_bridged_count}</strong></span>
        <span>Bridges HSE: <strong style={{ color: TX1 }}>{kpis.hse_bridged_count}</strong></span>
        <span>PV total: <strong style={{ color: TX1 }}>{fmtZar(kpis.planned_value_zar_sum)}</strong></span>
        <span>EV total: <strong style={{ color: GOOD }}>{fmtZar(kpis.earned_value_zar_sum)}</strong></span>
        <span>AC total: <strong style={{ color: WARN }}>{fmtZar(kpis.actual_cost_zar_sum)}</strong></span>
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const cpiV = row.cpi_live ?? row.cpi;
            const spiV = row.spi_live ?? row.spi;
            const cpFloat = row.critical_path_float_days_live ?? row.critical_path_total_float_days;
            return (
              <ChainCard
                key={row.id}
                item={row as unknown as ChainCardProps['item']}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={`${row.schedule_number} — ${row.project_name ?? row.project_id}`}
                meta={[
                  `${fmtMw(row.project_capacity_mw)} · ${row.current_tier}`,
                  `CPI ${fmtNum(cpiV)} · SPI ${fmtNum(spiV)} · CP float ${fmtDays(cpFloat)}`,
                  row.is_reportable_flag ? 'REG' : '',
                  row.late_finish_risk_live ? 'LF-RISK' : '',
                  row.critical_path_breach ? 'CP-BREACH' : '',
                ].filter(Boolean).join(' · ')}
                actions={getActions(row)}
                onAction={(key, values) => handleAction(row.id, key, values)}
                cascadeTo={[]}
                detail={renderDetail(row)}
                events={expandedEvents[row.id]}
                onExpand={handleExpand}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No WBS schedule rows match.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 11, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

export default IppScheduleChainTab;
