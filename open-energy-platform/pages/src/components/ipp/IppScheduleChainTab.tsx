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

type ChainStatus =
  | 'wbs_drafted' | 'baseline_set' | 'in_progress' | 'status_updated'
  | 'variance_detected' | 'impact_assessed' | 'rebaselined' | 'recovered'
  | 'completed' | 'suspended' | 'cancelled' | 'late_finish';

type IpsTier = 'small' | 'medium' | 'large' | 'mega';
type IpsUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'scheduler' | 'project_manager' | 'portfolio_director' | 'IPP_CEO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';

interface IpsRow {
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

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  wbs_drafted:       { bg: '#e3e7ec', fg: '#445',    label: 'WBS drafted' },
  baseline_set:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Baseline set' },
  in_progress:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'In progress' },
  status_updated:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Status updated' },
  variance_detected: { bg: '#fff4d6', fg: '#a06200', label: 'Variance detected' },
  impact_assessed:   { bg: '#fff4d6', fg: '#a06200', label: 'Impact assessed' },
  rebaselined:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rebaselined' },
  recovered:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'Recovered' },
  completed:         { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Completed' },
  suspended:         { bg: '#d8dde6', fg: '#445',    label: 'Suspended' },
  cancelled:         { bg: '#3a3a3a', fg: '#fff',    label: 'Cancelled' },
  late_finish:       { bg: '#7a0e0e', fg: '#fff',    label: 'Late finish' },
};

const TIER_TONE: Record<IpsTier, { bg: string; fg: string; label: string }> = {
  small:  { bg: '#e3e7ec', fg: '#557',    label: 'Small <10 MW' },
  medium: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Medium 10-50 MW' },
  large:  { bg: '#fff4d6', fg: '#a06200', label: 'Large 50-200 MW' },
  mega:   { bg: '#7a0e0e', fg: '#fff',    label: 'Mega >=200 MW' },
};

const URGENCY_TONE: Record<IpsUrgency, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#daf5e2', fg: '#1f6b3a', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const HEALTH_TONE: Record<HealthBand, { bg: string; fg: string; label: string }> = {
  green:    { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Green' },
  amber:    { bg: '#fff4d6', fg: '#a06200', label: 'Amber' },
  red:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Red' },
  critical: { bg: '#7a0e0e', fg: '#fff',    label: 'Critical' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'reportable',         label: 'Reportable' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'variance_detected',  label: 'Variance' },
  { key: 'impact_assessed',    label: 'Impact assessed' },
  { key: 'rebaselined',        label: 'Rebaselined' },
  { key: 'suspended',          label: 'Suspended' },
  { key: 'late_finish',        label: 'Late finish' },
  { key: 'late_finish_risk',   label: 'Late-finish risk' },
  { key: 'rebaseline_imminent', label: 'Rebaseline imminent' },
  { key: 'health_red',         label: 'Health red' },
  { key: 'health_critical',    label: 'Health critical' },
  { key: 'critical_path_breach', label: 'CP breach' },
  { key: 'small',              label: 'Small' },
  { key: 'medium',             label: 'Medium' },
  { key: 'large',              label: 'Large' },
  { key: 'mega',               label: 'Mega' },
  { key: 'wbs_drafted',        label: 'WBS drafted' },
  { key: 'baseline_set',       label: 'Baseline set' },
  { key: 'in_progress',        label: 'In progress' },
  { key: 'status_updated',     label: 'Status updated' },
  { key: 'recovered',          label: 'Recovered' },
  { key: 'completed',          label: 'Completed' },
  { key: 'cancelled',          label: 'Cancelled' },
];

type ActionKind =
  | 'set-baseline' | 'start-execution' | 'update-progress' | 'detect-variance'
  | 'assess-impact' | 'rebaseline-schedule' | 'propose-recovery'
  | 'mark-recovered' | 'mark-completed' | 'mark-late-finish'
  | 'suspend-schedule' | 'resume-schedule' | 'cancel-schedule'
  | 'approve-rebaseline' | 'reject-rebaseline';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  wbs_drafted:       'set-baseline',
  baseline_set:      'start-execution',
  in_progress:       'update-progress',
  status_updated:    'detect-variance',
  variance_detected: 'assess-impact',
  impact_assessed:   'rebaseline-schedule',
  rebaselined:       'mark-recovered',
  recovered:         'mark-completed',
  completed:         null,
  suspended:         'resume-schedule',
  cancelled:         null,
  late_finish:       null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'set-baseline':        'Set baseline (Scheduler)',
  'start-execution':     'Start execution (PM)',
  'update-progress':     'Update progress (Scheduler)',
  'detect-variance':     'Detect variance (Scheduler)',
  'assess-impact':       'Assess impact (PM)',
  'rebaseline-schedule': 'Rebaseline (Portfolio Director — crosses regulator large+mega)',
  'propose-recovery':    'Propose recovery plan (PM)',
  'mark-recovered':      'Mark recovered (PM)',
  'mark-completed':      'Mark completed (PM)',
  'mark-late-finish':    'Mark LATE FINISH (PM — SIGNATURE crosses regulator EVERY tier when >=1MW)',
  'suspend-schedule':    'Suspend schedule (PM)',
  'resume-schedule':     'Resume schedule (PM)',
  'cancel-schedule':     'Cancel schedule (Portfolio Director — crosses regulator EVERY tier when >=1MW)',
  'approve-rebaseline':  'Approve rebaseline (IPP CEO)',
  'reject-rebaseline':   'Reject rebaseline (IPP CEO)',
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

export function IppScheduleChainTab() {
  const [rows, setRows] = useState<IpsRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<IpsRow | null>(null);
  const [events, setEvents] = useState<IpsEvent[]>([]);

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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: IpsRow; events: IpsEvent[] } }>(`/ipp/wbs-schedule/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load history');
    }
  }, []);

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
      if (['small', 'medium', 'large', 'mega'].includes(filter)) {
        return r.current_tier === filter;
      }
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

  const act = useCallback(async (action: ActionKind, row: IpsRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'set-baseline') {
        const lbl = window.prompt('Baseline label (e.g. B0, B1):', row.baseline_label ?? 'B0');
        if (lbl) body.baseline_label = lbl;
        const tasks = window.prompt('Baseline total tasks:', String(row.baseline_total_tasks || 0));
        if (tasks && !isNaN(Number(tasks))) body.baseline_total_tasks = Number(tasks);
        const days = window.prompt('Baseline total duration days:', String(row.baseline_total_duration_days || 0));
        if (days && !isNaN(Number(days))) body.baseline_total_duration_days = Number(days);
        const finish = window.prompt('Baseline planned finish (YYYY-MM-DD):', row.baseline_planned_finish ?? '');
        if (finish) body.baseline_planned_finish = finish;
        const bac = window.prompt('Budget at completion (ZAR):', String(row.budget_at_completion_zar || 0));
        if (bac && !isNaN(Number(bac))) body.budget_at_completion_zar = Number(bac);
        const pv = window.prompt('Planned value (PV) ZAR (typically=BAC at baseline):', String(row.planned_value_zar || 0));
        if (pv && !isNaN(Number(pv))) body.planned_value_zar = Number(pv);
      } else if (action === 'update-progress') {
        const pct = window.prompt('% complete:', String(row.percent_complete || 0));
        if (pct && !isNaN(Number(pct))) body.percent_complete = Number(pct);
        const ev = window.prompt('Earned value (EV) ZAR:', String(row.earned_value_zar || 0));
        if (ev && !isNaN(Number(ev))) body.earned_value_zar = Number(ev);
        const pv = window.prompt('Planned value (PV) ZAR:', String(row.planned_value_zar || 0));
        if (pv && !isNaN(Number(pv))) body.planned_value_zar = Number(pv);
        const ac = window.prompt('Actual cost (AC) ZAR:', String(row.actual_cost_zar || 0));
        if (ac && !isNaN(Number(ac))) body.actual_cost_zar = Number(ac);
        const cpf = window.prompt('Critical-path total float (days):', String(row.critical_path_total_float_days || 0));
        if (cpf && !isNaN(Number(cpf))) body.critical_path_total_float_days = Number(cpf);
      } else if (action === 'detect-variance') {
        const reason = window.prompt('Variance reason (required for audit):', row.variance_reason ?? '');
        if (!reason) return;
        body.variance_reason = reason;
        const ev = window.prompt('Updated earned value (EV) ZAR:', String(row.earned_value_zar || 0));
        if (ev && !isNaN(Number(ev))) body.earned_value_zar = Number(ev);
        const cpb = window.confirm('Critical path breach now active? OK = yes, Cancel = no');
        body.critical_path_breach = cpb;
      } else if (action === 'assess-impact') {
        const finish = window.prompt('Revised planned finish (YYYY-MM-DD):', row.current_planned_finish ?? '');
        if (finish) body.current_planned_finish = finish;
        const lpd = window.prompt('Longest-path duration (days):', String(row.longest_path_duration_days || 0));
        if (lpd && !isNaN(Number(lpd))) body.longest_path_duration_days = Number(lpd);
      } else if (action === 'rebaseline-schedule') {
        const reason = window.prompt('Rebaseline reason (required for audit). NOTE: crosses regulator on large+mega.', row.rebaseline_reason ?? '');
        if (!reason) return;
        body.rebaseline_reason = reason;
        const lbl = window.prompt('New baseline label (e.g. B1):', row.baseline_label ?? 'B1');
        if (lbl) body.baseline_label = lbl;
        const finish = window.prompt('New baseline planned finish (YYYY-MM-DD):', row.baseline_planned_finish ?? '');
        if (finish) body.baseline_planned_finish = finish;
      } else if (action === 'propose-recovery') {
        const plan = window.prompt('Recovery plan summary (required):', row.recovery_plan_summary ?? '');
        if (!plan) return;
        body.recovery_plan_summary = plan;
      } else if (action === 'mark-late-finish') {
        const reason = window.prompt('Late-finish reason (required). NOTE: W112 SIGNATURE — crosses regulator EVERY tier when project_capacity_mw>=1MW.', row.late_finish_reason ?? '');
        if (!reason) return;
        body.late_finish_reason = reason;
      } else if (action === 'suspend-schedule') {
        const reason = window.prompt('Suspension reason (required):', row.suspend_reason ?? '');
        if (!reason) return;
        body.suspend_reason = reason;
      } else if (action === 'cancel-schedule') {
        const reason = window.prompt('Cancellation reason (required). NOTE: crosses regulator EVERY tier when >=1MW.', row.cancel_reason ?? '');
        if (!reason) return;
        body.cancel_reason = reason;
      }
      await api.post(`/ipp/wbs-schedule/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">
            IPP WBS &amp; Gantt Schedule Management — PMBOK 7 + ISO 21500:2021 + AACE RP 27R-03 + AACE 29R-03 + REIPPPP + NERSA Grid Code C-5 + DMRE §34
          </h2>
          <p className="text-xs text-[#4a5568]">
            12-state P6 schedule lifecycle:
            wbs drafted {'→'} baseline set {'→'} in progress {'→'} status updated {'→'} variance detected {'→'} impact assessed {'→'}
            rebaselined {'→'} recovered {'→'} completed, with suspended / cancelled / <strong>late_finish</strong> branches.
            INVERTED SLA polarity (HOURS) on variance_detected: small 120h, medium 240h, large 480h, mega 720h
            (<em>larger projects get LONGER cure runway</em>). FLOOR-AT-LARGE on any one of 5 floor flags (critical-path breach, resource over-allocation &ge;25%, weather window at risk,
            community disruption, EPC subcontractor milestone at risk); FLOOR-AT-MEGA on 2+ flags OR critical-path breach. SIGNATURE:
            <strong> mark-late-finish crosses regulator EVERY tier when project_capacity_mw &ge; 1 MW</strong> (REIPPPP + DMRE §34 + NERSA C-5);
            cancel-schedule crosses regulator EVERY tier &ge;1 MW; rebaseline-schedule crosses large+mega; suspend-schedule crosses mega only when
            critical-path breach; SLA breach crosses large+mega. 4-step authority ladder: scheduler {'→'} project_manager {'→'} portfolio_director {'→'} IPP_CEO.
            4 bridges: W19 procurement, W20 COD, W23 insurance claim, W25 HSE incident. Nightly schedule-health recompute at 00:15 UTC keeps CPI/SPI/SV/CV live.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Active"         value={kpis.active_count} tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Variance"       value={kpis.variance_count} tone={kpis.variance_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rebaselined"    value={kpis.rebaselined_count} tone={kpis.rebaselined_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Suspended"      value={kpis.suspended_count} tone={kpis.suspended_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Late finish"    value={kpis.late_finish_count} tone={kpis.late_finish_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Mega"           value={kpis.mega_count} tone={kpis.mega_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached"   value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Late-finish risk: <span className="font-semibold text-[#9b1f1f]">{kpis.late_finish_risk_count}</span></span>
        <span>Rebaseline imminent: <span className="font-semibold text-[#a06200]">{kpis.rebaseline_imminent_count}</span></span>
        <span>Bridges to W19 (procurement): <span className="font-semibold text-[#1a3a5c]">{kpis.procurement_bridged_count}</span></span>
        <span>Bridges to W20 (COD): <span className="font-semibold text-[#1a3a5c]">{kpis.cod_bridged_count}</span></span>
        <span>Bridges to W23 (claim): <span className="font-semibold text-[#1a3a5c]">{kpis.insurance_bridged_count}</span></span>
        <span>Bridges to W25 (HSE): <span className="font-semibold text-[#1a3a5c]">{kpis.hse_bridged_count}</span></span>
        <span>PV total: <span className="font-semibold text-[#1a3a5c]">{fmtZar(kpis.planned_value_zar_sum)}</span></span>
        <span>EV total: <span className="font-semibold text-[#1f5b3a]">{fmtZar(kpis.earned_value_zar_sum)}</span></span>
        <span>AC total: <span className="font-semibold text-[#a06200]">{fmtZar(kpis.actual_cost_zar_sum)}</span></span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Schedule #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">% comp</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">CPI</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SPI</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">CP float</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Health</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.current_tier];
                const urgency = URGENCY_TONE[r.urgency_band_live ?? 'low'];
                const health = HEALTH_TONE[r.schedule_health_band_live ?? 'green'];
                const cpiV = r.cpi_live ?? r.cpi;
                const spiV = r.spi_live ?? r.spi;
                const cpFloat = r.critical_path_float_days_live ?? r.critical_path_total_float_days;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.schedule_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="text-[11px] font-medium">{r.project_name ?? r.project_id}</div>
                      <div className="text-[10px] text-[#6b7685]">
                        {fmtMw(r.project_capacity_mw)}
                        {r.critical_path_breach ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">CP-BREACH</span> : null}
                        {r.late_finish_risk_live ? <span className="ml-1 text-[9px] font-semibold text-[#a06200]">LF-RISK</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtPct(r.percent_complete, 0)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${cpiV >= 1 ? 'text-[#1f5b3a]' : cpiV >= 0.85 ? 'text-[#a06200]' : 'text-[#9b1f1f]'}`}>{fmtNum(cpiV)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${spiV >= 1 ? 'text-[#1f5b3a]' : spiV >= 0.85 ? 'text-[#a06200]' : 'text-[#9b1f1f]'}`}>{fmtNum(spiV)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${cpFloat < 0 ? 'text-[#9b1f1f] font-semibold' : cpFloat <= 2 ? 'text-[#a06200]' : 'text-[#4a5568]'}`}>{fmtDays(cpFloat)}</td>
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
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: urgency.bg, color: urgency.fg }}>
                        {urgency.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached_live ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached_live ? 'BREACHED' : fmtHoursSla(r.sla_hours_remaining_live)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No WBS schedule rows match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: IpsRow;
  events: IpsEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: IpsRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const cpiV = row.cpi_live ?? row.cpi;
  const spiV = row.spi_live ?? row.spi;
  const cpFloat = row.critical_path_float_days_live ?? row.critical_path_total_float_days;
  const svZar = row.schedule_variance_zar_live ?? row.schedule_variance_zar;
  const cvZar = row.cost_variance_zar_live ?? row.cost_variance_zar;
  const svPct = row.schedule_variance_pct_live ?? row.schedule_variance_pct;
  const cvPct = row.cost_variance_pct_live ?? row.cost_variance_pct;
  const completeness = row.schedule_completeness_index_live ?? row.schedule_completeness_index;
  const canRecover = row.chain_status === 'impact_assessed';
  const canPropose = row.chain_status === 'impact_assessed';
  const canSuspend: ChainStatus[] = ['in_progress', 'status_updated', 'variance_detected', 'impact_assessed', 'rebaselined', 'recovered'];
  const canCancel: ChainStatus[] = ['wbs_drafted', 'baseline_set', 'in_progress', 'status_updated', 'variance_detected', 'impact_assessed', 'rebaselined', 'recovered', 'suspended'];
  const canLateFinish: ChainStatus[] = ['in_progress', 'status_updated', 'variance_detected', 'impact_assessed'];
  const canApproveReject = row.chain_status === 'rebaselined';

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[820px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.schedule_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? row.project_id} — {fmtMw(row.project_capacity_mw)}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} {'•'} CPI <span className={cpiV >= 1 ? 'text-[#1f5b3a]' : 'text-[#9b1f1f]'}>{fmtNum(cpiV)}</span>
                {' '}{'•'} SPI <span className={spiV >= 1 ? 'text-[#1f5b3a]' : 'text-[#9b1f1f]'}>{fmtNum(spiV)}</span>
                {' '}{'•'} CP float {fmtDays(cpFloat)}
              </div>
            </div>
            <button type="button"
              onClick={onClose}
              className="rounded border border-[#d8dde6] bg-white px-2 py-1 text-[12px] text-[#445] hover:bg-[#f3f5f9]"
            >
              Close
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: STATE_TONE[row.chain_status].bg, color: STATE_TONE[row.chain_status].fg }}>
              {STATE_TONE[row.chain_status].label}
            </span>
            {row.urgency_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: URGENCY_TONE[row.urgency_band_live].bg, color: URGENCY_TONE[row.urgency_band_live].fg }}>
                {URGENCY_TONE[row.urgency_band_live].label}
              </span>
            )}
            {row.schedule_health_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: HEALTH_TONE[row.schedule_health_band_live].bg, color: HEALTH_TONE[row.schedule_health_band_live].fg }}>
                Health: {HEALTH_TONE[row.schedule_health_band_live].label}
              </span>
            )}
            {row.authority_required_live && (
              <span className="inline-block rounded border border-[#d8dde6] bg-white px-2 py-0.5 text-[#445]">
                Authority: {row.authority_required_live.replace(/_/g, ' ')}
              </span>
            )}
            {row.is_reportable_flag && (
              <span className="inline-block rounded bg-[#fde0e0] px-2 py-0.5 font-semibold text-[#9b1f1f]">Reportable</span>
            )}
            {row.regulator_crossed_at && (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">Regulator crossed</span>
            )}
            {row.late_finish_risk_live && (
              <span className="inline-block rounded bg-[#fde0e0] px-2 py-0.5 font-semibold text-[#9b1f1f]">Late-finish risk</span>
            )}
            {row.rebaseline_imminent_live && (
              <span className="inline-block rounded bg-[#fff4d6] px-2 py-0.5 font-semibold text-[#a06200]">Rebaseline imminent</span>
            )}
          </div>
        </header>

        <div className="p-5 space-y-4">
          {/* LIVE battery */}
          <Section title="LIVE battery (20 fields, re-computed every fetch)">
            <Grid>
              <Field label="% complete"         value={fmtPct(row.percent_complete, 0)} />
              <Field label="CPI"                value={fmtNum(cpiV)} tone={cpiV >= 1 ? 'ok' : cpiV >= 0.85 ? 'warn' : 'bad'} />
              <Field label="SPI"                value={fmtNum(spiV)} tone={spiV >= 1 ? 'ok' : spiV >= 0.85 ? 'warn' : 'bad'} />
              <Field label="SPI_t"              value={fmtNum(row.spi_t)} />
              <Field label="Schedule var ZAR"   value={fmtZar(svZar)} tone={svZar >= 0 ? 'ok' : 'bad'} />
              <Field label="Cost var ZAR"       value={fmtZar(cvZar)} tone={cvZar >= 0 ? 'ok' : 'bad'} />
              <Field label="Schedule var %"     value={fmtPct(svPct)} />
              <Field label="Cost var %"         value={fmtPct(cvPct)} />
              <Field label="CP float days"      value={fmtDays(cpFloat)} tone={cpFloat < 0 ? 'bad' : cpFloat <= 2 ? 'warn' : 'ok'} />
              <Field label="Days to finish"     value={fmtDays(row.days_to_planned_finish_live)} tone={(row.days_to_planned_finish_live ?? 0) < 0 ? 'bad' : 'ok'} />
              <Field label="Days since baseline" value={fmtDays(row.days_since_baseline_live)} />
              <Field label="Completeness index" value={`${completeness} / 130`} />
              <Field label="SLA hours remaining" value={fmtHoursSla(row.sla_hours_remaining_live)} tone={row.sla_breached_live ? 'bad' : 'ok'} />
              <Field label="SLA window"         value={fmtHoursSla(row.sla_window_hours)} />
              <Field label="Authority"          value={row.authority_required_live ?? '-'} />
              <Field label="Regulator filing"   value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
              <Field label="Variance count"     value={String(row.variance_count)} tone={row.variance_count > 0 ? 'warn' : 'ok'} />
              <Field label="Rebaseline count"   value={String(row.rebaseline_count)} tone={row.rebaseline_count > 0 ? 'bad' : 'ok'} />
              <Field label="Floor flags"        value={String(row.floor_flag_count_live ?? 0)} tone={(row.floor_flag_count_live || 0) >= 2 ? 'bad' : (row.floor_flag_count_live || 0) >= 1 ? 'warn' : 'ok'} />
              <Field label="Escalation level"   value={String(row.escalation_level)} tone={row.escalation_level >= 2 ? 'bad' : row.escalation_level >= 1 ? 'warn' : 'ok'} />
            </Grid>
          </Section>

          {/* EVM detail */}
          <Section title="EVM (Earned Value Management)">
            <Grid>
              <Field label="Planned value (PV)"  value={fmtZar(row.planned_value_zar)} />
              <Field label="Earned value (EV)"   value={fmtZar(row.earned_value_zar)} />
              <Field label="Actual cost (AC)"    value={fmtZar(row.actual_cost_zar)} />
              <Field label="Budget at completion" value={fmtZar(row.budget_at_completion_zar)} />
              <Field label="Critical tasks"      value={String(row.critical_tasks_count)} />
              <Field label="Longest path days"   value={fmtDays(row.longest_path_duration_days)} />
              <Field label="Tasks completed"     value={String(row.tasks_completed)} />
              <Field label="Tasks in progress"   value={String(row.tasks_in_progress)} />
            </Grid>
          </Section>

          {/* Dates */}
          <Section title="Baseline + dates">
            <Grid>
              <Field label="Baseline label"             value={row.baseline_label ?? '-'} />
              <Field label="Baseline set at"            value={fmtDate(row.baseline_set_at)} />
              <Field label="Baseline planned start"     value={fmtDay(row.baseline_planned_start)} />
              <Field label="Baseline planned finish"    value={fmtDay(row.baseline_planned_finish)} />
              <Field label="Current planned finish"     value={fmtDay(row.current_planned_finish)} />
              <Field label="Contractual final milestone" value={fmtDay(row.contractual_final_milestone_date)} />
              <Field label="Baseline total tasks"       value={String(row.baseline_total_tasks)} />
              <Field label="Baseline total duration"    value={fmtDays(row.baseline_total_duration_days)} />
            </Grid>
          </Section>

          {/* Bridges */}
          <Section title="4-bridge architecture (W19 / W20 / W23 / W25)">
            <Grid>
              <Field label="W19 procurement ref"     value={row.procurement_ref ?? '-'}     tone={row.bridges_to_procurement_chain_live ? 'ok' : 'warn'} />
              <Field label="W20 COD ref"             value={row.cod_ref ?? '-'}             tone={row.bridges_to_cod_chain_live ? 'ok' : 'warn'} />
              <Field label="W23 insurance claim ref" value={row.insurance_claim_ref ?? '-'} tone={row.bridges_to_insurance_claim_chain_live ? 'ok' : 'warn'} />
              <Field label="W25 HSE incident ref"    value={row.hse_incident_ref ?? '-'}    tone={row.bridges_to_hse_incident_chain_live ? 'ok' : 'warn'} />
              <Field label="Regulator inbox ref"     value={row.regulator_inbox_ref ?? '-'} />
              <Field label="Regulator ref"           value={row.regulator_ref ?? '-'} />
              <Field label="Last variance at"        value={fmtDate(row.last_variance_at)} />
              <Field label="Last rebaseline at"      value={fmtDate(row.last_rebaseline_at)} />
            </Grid>
          </Section>

          {/* Floor flags */}
          <Section title="Floor flags (5)">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FlagPill label="Critical-path breach"        on={!!row.critical_path_breach} />
              <FlagPill label="Resource overalloc >=25%"    on={!!row.resource_constrained_over_pct_25} />
              <FlagPill label="Weather window at risk"      on={!!row.weather_window_at_risk} />
              <FlagPill label="Community disruption"        on={!!row.community_disruption_threshold_breached} />
              <FlagPill label="EPC subcontractor at risk"   on={!!row.EPC_subcontractor_milestone_at_risk} />
            </div>
          </Section>

          {/* Reasons */}
          {(row.variance_reason || row.rebaseline_reason || row.recovery_plan_summary || row.suspend_reason || row.cancel_reason || row.late_finish_reason) && (
            <Section title="Reasons / narrative">
              <div className="space-y-1.5 text-[12px] text-[#1a3a5c]">
                {row.variance_reason && <div><strong>Variance reason:</strong> {row.variance_reason}</div>}
                {row.rebaseline_reason && <div><strong>Rebaseline reason:</strong> {row.rebaseline_reason}</div>}
                {row.recovery_plan_summary && <div><strong>Recovery plan:</strong> {row.recovery_plan_summary}</div>}
                {row.suspend_reason && <div><strong>Suspend reason:</strong> {row.suspend_reason}</div>}
                {row.cancel_reason && <div><strong>Cancel reason:</strong> {row.cancel_reason}</div>}
                {row.late_finish_reason && <div><strong>Late-finish reason:</strong> {row.late_finish_reason}</div>}
              </div>
            </Section>
          )}

          {/* Action ladder */}
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <ActionButton tone="primary" onClick={() => onAct(nextAction, row)}>
                  {ACTION_LABEL[nextAction]}
                </ActionButton>
              )}
              {canPropose && (
                <ActionButton tone="warn" onClick={() => onAct('propose-recovery', row)}>
                  {ACTION_LABEL['propose-recovery']}
                </ActionButton>
              )}
              {canRecover && (
                <ActionButton tone="primary" onClick={() => onAct('mark-recovered', row)}>
                  {ACTION_LABEL['mark-recovered']}
                </ActionButton>
              )}
              {canApproveReject && (
                <>
                  <ActionButton tone="primary" onClick={() => onAct('approve-rebaseline', row)}>
                    {ACTION_LABEL['approve-rebaseline']}
                  </ActionButton>
                  <ActionButton tone="warn" onClick={() => onAct('reject-rebaseline', row)}>
                    {ACTION_LABEL['reject-rebaseline']}
                  </ActionButton>
                </>
              )}
              {canSuspend.includes(row.chain_status) && (
                <ActionButton tone="warn" onClick={() => onAct('suspend-schedule', row)}>
                  {ACTION_LABEL['suspend-schedule']}
                </ActionButton>
              )}
              {canLateFinish.includes(row.chain_status) && (
                <ActionButton tone="danger" onClick={() => onAct('mark-late-finish', row)}>
                  {ACTION_LABEL['mark-late-finish']}
                </ActionButton>
              )}
              {canCancel.includes(row.chain_status) && (
                <ActionButton tone="danger" onClick={() => onAct('cancel-schedule', row)}>
                  {ACTION_LABEL['cancel-schedule']}
                </ActionButton>
              )}
            </div>
          </Section>

          {/* Timeline */}
          <Section title={`Timeline (${events.length} events)`}>
            <div className="space-y-1">
              {events.map((e) => (
                <div key={e.id} className="flex items-baseline gap-3 border-b border-[#e3e7ec] py-1 text-[11px]">
                  <span className="font-mono text-[#6b7685]">{fmtDate(e.created_at)}</span>
                  <span className="font-semibold text-[#1a3a5c]">{e.event_type}</span>
                  {e.from_status && e.to_status && (
                    <span className="text-[#4a5568]">{e.from_status} {'→'} {e.to_status}</span>
                  )}
                  {e.actor_party && <span className="text-[#6b7685]">[{e.actor_party}]</span>}
                  {e.notes && <span className="text-[#4a5568] truncate">{e.notes}</span>}
                </div>
              ))}
              {events.length === 0 && <div className="text-[12px] text-[#6b7685]">No events yet.</div>}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#1a3a5c]">{title}</h3>
      <div className="rounded border border-[#d8dde6] bg-[#fafbfd] p-3">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{children}</div>;
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'ok' ? '#1f5b3a' : '#1a3a5c';
  return (
    <div className="rounded border border-[#e3e7ec] bg-white px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="text-[12px] font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function FlagPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 font-medium ${on ? 'bg-[#fde0e0] text-[#9b1f1f]' : 'bg-[#e3e7ec] text-[#6b7685]'}`}>
      {label}{on ? ' ✓' : ''}
    </span>
  );
}

function ActionButton({
  children, onClick, tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'primary' | 'warn' | 'danger';
}) {
  const bg = tone === 'danger' ? '#7a0e0e' : tone === 'warn' ? '#a06200' : '#1a3a5c';
  return (
    <button type="button"
      onClick={onClick}
      className="rounded px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
      style={{ background: bg }}
    >
      {children}
    </button>
  );
}
