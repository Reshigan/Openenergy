// Wave 113 — IPP Cost Management & Earned Value Management (EVM) chain (P6).
//
// 8th IPP chain. SECOND wave of Phase A IPP-parity push (after W112
// WBS & Gantt). BAC + committed/incurred + PV/EV/AC + CPI/SPI +
// EAC/ETC/TCPI + VAC + contingency/MR + variance + reforecast + CR +
// reconcile engine. Beats Primavera P6 / MS Project Cost / Procore
// Project Financials / Aconex Cost / Oracle Primavera Cloud Cost /
// Deltek Acumen Fuse / Deltek Cobra / SAP PS / Oracle EBS Projects.
//
// 14-state P6 (11-state forward + 3 branches) with INVERTED SLA polarity
// stored in HOURS: small 72h, medium 168h, large 336h, mega 480h on
// variance_detected anchor (larger budgets get LONGER cure runway).
// FLOOR-AT-LARGE tier overlay on 5 flags (cpi<0.85, contingency>=75%,
// MR drawn, forex_var>=10%, multi_currency_book); FLOOR-AT-MEGA on 2+
// flags. 4-step authority ladder: cost_engineer -> PM ->
// finance_director -> CFO. 22-field LIVE battery. 4-bridge architecture
// to W112 schedule + W21 drawdown + W30 disbursement + W77 reserve-acc.
//
// SIGNATURE crossings:
//  * draw_management_reserve crosses regulator EVERY tier when budget>=1
//    (signature hard line — MR draw is GOVERNANCE event always reportable)
//  * cancel crosses regulator EVERY tier when budget>=1
//  * publish_reforecast crosses regulator large+mega when VAC<0 OR CPI<0.85
//  * approve_CR crosses regulator mega only when cr_value>=10% of budget
//  * sla_breached crosses regulator large+mega
//
// Standards: PMBOK 7 + AACE RP-67R-11 + ANSI EIA-748-D + ISO 21500 +
// IFRS 15/IAS 11 + REIPPPP IPP Office + DMRE + SARB + NERSA Grid Code.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'budget_set' | 'committed' | 'incurred' | 'measured'
  | 'variance_detected' | 'reforecast_drafted' | 'CR_logged' | 'CR_approved'
  | 'reforecast_published' | 'reconciled' | 'closed'
  | 'cancelled' | 'reforecast_rejected' | 'contingency_drawn';

type IpeTier = 'small' | 'medium' | 'large' | 'mega';
type IpeUrgency = 'low' | 'medium' | 'high' | 'critical';
type Authority = 'cost_engineer' | 'PM' | 'finance_director' | 'CFO';
type HealthBand = 'green' | 'amber' | 'red' | 'critical';

interface IpeRow {
  id: string;
  evm_number: string;
  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;
  cost_book_period: string | null;
  schedule_ref: string | null;
  drawdown_ref: string | null;
  disbursement_ref: string | null;
  reserve_account_ref: string | null;
  total_budget_zar: number;
  contingency_initial_zar: number;
  contingency_drawn_zar: number;
  contingency_remaining_pct: number;
  management_reserve_initial_zar: number;
  management_reserve_drawn_zar: number;
  management_reserve_remaining_pct: number;
  currency_code: string;
  forex_component_pct: number;
  committed_cost_zar: number;
  incurred_cost_zar: number;
  invoiced_cost_zar: number;
  paid_cost_zar: number;
  last_cost_update_at: string | null;
  planned_value_zar: number;
  earned_value_zar: number;
  actual_cost_zar: number;
  budget_at_completion_zar: number;
  estimate_at_completion_zar: number;
  estimate_to_complete_zar: number;
  variance_at_completion_zar: number;
  cpi: number;
  spi: number;
  tcpi: number;
  cost_variance_zar: number;
  schedule_variance_zar: number;
  variance_count: number;
  reforecast_count: number;
  cr_count: number;
  cr_value_zar: number;
  last_variance_at: string | null;
  last_reforecast_at: string | null;
  last_cr_at: string | null;
  variance_reason: string | null;
  reforecast_reason: string | null;
  reforecast_rejection_reason: string | null;
  cr_summary: string | null;
  cpi_below_pct_85: number;
  contingency_consumed_pct_75: number;
  management_reserve_drawn: number;
  forex_variance_above_pct_10: number;
  multi_currency_book: number;
  current_tier: IpeTier;
  authority_required: Authority | null;
  urgency_band: string | null;
  evm_health_band: HealthBand | null;
  evm_completeness_index: number;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  cancel_reason: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  budget_set_at: string | null;
  committed_at: string | null;
  incurred_at: string | null;
  measured_at: string | null;
  variance_detected_at: string | null;
  reforecast_drafted_at: string | null;
  cr_logged_at: string | null;
  cr_approved_at: string | null;
  reforecast_published_at: string | null;
  reconciled_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  reforecast_rejected_at: string | null;
  contingency_drawn_at: string | null;
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
  // Decorated (LIVE 22-field battery)
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number;
  urgency_band_live?: IpeUrgency;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  cpi_live?: number;
  spi_live?: number;
  cost_variance_zar_live?: number;
  schedule_variance_zar_live?: number;
  estimate_at_completion_zar_live?: number;
  estimate_to_complete_zar_live?: number;
  variance_at_completion_zar_live?: number;
  tcpi_live?: number;
  vac_pct_of_bac_live?: number;
  contingency_remaining_pct_live?: number;
  management_reserve_remaining_pct_live?: number;
  evm_health_band_live?: HealthBand;
  floor_flag_count_live?: number;
  evm_completeness_index_live?: number;
  bridges_to_schedule_chain_live?: boolean;
  bridges_to_drawdown_chain_live?: boolean;
  bridges_to_disbursement_chain_live?: boolean;
  bridges_to_reserve_account_chain_live?: boolean;
}

interface IpeEvent {
  id: string;
  evm_id: string;
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
  budget_set:           { bg: '#e3e7ec', fg: '#445',    label: 'Budget set' },
  committed:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Committed' },
  incurred:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Incurred' },
  measured:             { bg: '#dbecfb', fg: '#1a3a5c', label: 'Measured' },
  variance_detected:    { bg: '#fff4d6', fg: '#a06200', label: 'Variance detected' },
  reforecast_drafted:   { bg: '#fff4d6', fg: '#a06200', label: 'Reforecast drafted' },
  CR_logged:            { bg: '#fff4d6', fg: '#a06200', label: 'CR logged' },
  CR_approved:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'CR approved' },
  reforecast_published: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reforecast published' },
  reconciled:           { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Reconciled' },
  closed:               { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Closed' },
  cancelled:            { bg: '#3a3a3a', fg: '#fff',    label: 'Cancelled' },
  reforecast_rejected:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Reforecast rejected' },
  contingency_drawn:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Contingency drawn' },
};

const TIER_TONE: Record<IpeTier, { bg: string; fg: string; label: string }> = {
  small:  { bg: '#e3e7ec', fg: '#557',    label: 'Small <R250m' },
  medium: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Medium R250m-R1.5b' },
  large:  { bg: '#fff4d6', fg: '#a06200', label: 'Large R1.5b-R8b' },
  mega:   { bg: '#7a0e0e', fg: '#fff',    label: 'Mega >=R8b' },
};

const URGENCY_TONE: Record<IpeUrgency, { bg: string; fg: string; label: string }> = {
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

// 2-row filter pills — Row 1: action / lifecycle (priority filters)
const FILTERS_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'variance_detected',     label: 'Variance' },
  { key: 'reforecast_drafted',    label: 'Reforecast draft' },
  { key: 'CR_logged',             label: 'CR logged' },
  { key: 'CR_approved',           label: 'CR approved' },
  { key: 'contingency_drawn',     label: 'Contingency drawn' },
  { key: 'mr_drawn',              label: 'MR drawn' },
  { key: 'cpi_below',             label: 'CPI<0.85' },
  { key: 'health_red',            label: 'Health red' },
  { key: 'health_critical',       label: 'Health critical' },
];

// 2-row filter pills — Row 2: lifecycle stages + tiers
const FILTERS_LIFECYCLE: Array<{ key: string; label: string }> = [
  { key: 'budget_set',            label: 'Budget set' },
  { key: 'committed',             label: 'Committed' },
  { key: 'incurred',              label: 'Incurred' },
  { key: 'measured',              label: 'Measured' },
  { key: 'reforecast_published',  label: 'Published' },
  { key: 'reconciled',            label: 'Reconciled' },
  { key: 'closed',                label: 'Closed' },
  { key: 'cancelled',             label: 'Cancelled' },
  { key: 'reforecast_rejected',   label: 'Reforecast reject' },
  { key: 'small',                 label: 'Small' },
  { key: 'medium',                label: 'Medium' },
  { key: 'large',                 label: 'Large' },
  { key: 'mega',                  label: 'Mega' },
];

type ActionKind =
  | 'commit-cost' | 'incur-cost' | 'measure-progress' | 'detect-variance'
  | 'draft-reforecast' | 'log-cr' | 'approve-cr' | 'reject-reforecast'
  | 'publish-reforecast' | 'reconcile' | 'close-book' | 'cancel'
  | 'draw-contingency' | 'draw-management-reserve' | 'submit-to-pm-review';

// What's the NEXT primary action for each non-terminal state?
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  budget_set:           'commit-cost',
  committed:            'incur-cost',
  incurred:             'measure-progress',
  measured:             'detect-variance',
  variance_detected:    'draft-reforecast',
  reforecast_drafted:   'log-cr',
  CR_logged:            'approve-cr',
  CR_approved:          'publish-reforecast',
  reforecast_published: 'reconcile',
  reconciled:           'close-book',
  closed:               null,
  cancelled:            null,
  reforecast_rejected:  'draft-reforecast', // re-draft after rejection
  contingency_drawn:    'publish-reforecast',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'commit-cost':              'Commit cost (Cost Engineer)',
  'incur-cost':               'Incur cost (Cost Engineer)',
  'measure-progress':         'Measure progress (Cost Engineer)',
  'detect-variance':          'Detect variance (Cost Engineer)',
  'draft-reforecast':         'Draft reforecast (Cost Engineer)',
  'log-cr':                   'Log change request (PM)',
  'approve-cr':               'Approve CR (PM)',
  'reject-reforecast':        'Reject reforecast (PM)',
  'publish-reforecast':       'Publish reforecast (PM — crosses regulator large+mega when VAC<0 OR CPI<0.85)',
  'reconcile':                'Reconcile (Finance Director)',
  'close-book':               'Close book (Finance Director)',
  'cancel':                   'Cancel (CFO — SIGNATURE crosses regulator EVERY tier when >=R1)',
  'draw-contingency':         'Draw contingency (Cost Engineer)',
  'draw-management-reserve':  'Draw MR (CFO — SIGNATURE crosses regulator EVERY tier when >=R1)',
  'submit-to-pm-review':      'Submit to PM review (PM)',
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

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return `${n.toFixed(0)} MW`;
}

interface KpiSummary {
  total: number;
  active_count: number;
  variance_count: number;
  reforecast_drafted_count: number;
  cr_logged_count: number;
  cr_approved_count: number;
  published_count: number;
  contingency_drawn_count: number;
  rejected_count: number;
  closed_count: number;
  cancelled_count: number;
  mega_count: number;
  breached: number;
  reportable_total: number;
  mr_drawn_count: number;
  cpi_below_count: number;
  schedule_bridged_count: number;
  drawdown_bridged_count: number;
  disbursement_bridged_count: number;
  reserve_account_bridged_count: number;
  total_budget_zar_sum: number;
  earned_value_zar_sum: number;
  actual_cost_zar_sum: number;
  contingency_drawn_zar_sum: number;
  mr_drawn_zar_sum: number;
}

export function IppEvmChainTab() {
  const [rows, setRows] = useState<IpeRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<IpeRow | null>(null);
  const [events, setEvents] = useState<IpeEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: IpeRow[] } & KpiSummary }>('/ipp/cost-evm/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          active_count: data.active_count || 0,
          variance_count: data.variance_count || 0,
          reforecast_drafted_count: data.reforecast_drafted_count || 0,
          cr_logged_count: data.cr_logged_count || 0,
          cr_approved_count: data.cr_approved_count || 0,
          published_count: data.published_count || 0,
          contingency_drawn_count: data.contingency_drawn_count || 0,
          rejected_count: data.rejected_count || 0,
          closed_count: data.closed_count || 0,
          cancelled_count: data.cancelled_count || 0,
          mega_count: data.mega_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          mr_drawn_count: data.mr_drawn_count || 0,
          cpi_below_count: data.cpi_below_count || 0,
          schedule_bridged_count: data.schedule_bridged_count || 0,
          drawdown_bridged_count: data.drawdown_bridged_count || 0,
          disbursement_bridged_count: data.disbursement_bridged_count || 0,
          reserve_account_bridged_count: data.reserve_account_bridged_count || 0,
          total_budget_zar_sum: data.total_budget_zar_sum || 0,
          earned_value_zar_sum: data.earned_value_zar_sum || 0,
          actual_cost_zar_sum: data.actual_cost_zar_sum || 0,
          contingency_drawn_zar_sum: data.contingency_drawn_zar_sum || 0,
          mr_drawn_zar_sum: data.mr_drawn_zar_sum || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load IPP Cost & EVM chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: IpeRow; events: IpeEvent[] } }>(`/ipp/cost-evm/chain/${id}`);
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
      if (filter === 'mr_drawn')             return !!r.management_reserve_drawn;
      if (filter === 'cpi_below')            return !!r.cpi_below_pct_85;
      if (filter === 'health_red')           return r.evm_health_band_live === 'red';
      if (filter === 'health_critical')      return r.evm_health_band_live === 'critical';
      if (['small', 'medium', 'large', 'mega'].includes(filter)) {
        return r.current_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, active_count: 0, variance_count: 0,
    reforecast_drafted_count: 0, cr_logged_count: 0, cr_approved_count: 0,
    published_count: 0, contingency_drawn_count: 0, rejected_count: 0,
    closed_count: 0, cancelled_count: 0, mega_count: 0, breached: 0,
    reportable_total: 0, mr_drawn_count: 0, cpi_below_count: 0,
    schedule_bridged_count: 0, drawdown_bridged_count: 0,
    disbursement_bridged_count: 0, reserve_account_bridged_count: 0,
    total_budget_zar_sum: 0, earned_value_zar_sum: 0, actual_cost_zar_sum: 0,
    contingency_drawn_zar_sum: 0, mr_drawn_zar_sum: 0,
  };

  const act = useCallback(async (action: ActionKind, row: IpeRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'commit-cost') {
        const v = window.prompt('Newly committed cost (ZAR):', String(row.committed_cost_zar || 0));
        if (v && !isNaN(Number(v))) body.committed_cost_zar = Number(v);
      } else if (action === 'incur-cost') {
        const v = window.prompt('Actual cost incurred (AC) ZAR:', String(row.actual_cost_zar || 0));
        if (v && !isNaN(Number(v))) body.actual_cost_zar = Number(v);
        const inc = window.prompt('Incurred cost total (ZAR):', String(row.incurred_cost_zar || 0));
        if (inc && !isNaN(Number(inc))) body.incurred_cost_zar = Number(inc);
      } else if (action === 'measure-progress') {
        const ev = window.prompt('Earned value (EV) ZAR:', String(row.earned_value_zar || 0));
        if (ev && !isNaN(Number(ev))) body.earned_value_zar = Number(ev);
        const pv = window.prompt('Planned value (PV) ZAR:', String(row.planned_value_zar || 0));
        if (pv && !isNaN(Number(pv))) body.planned_value_zar = Number(pv);
        const ac = window.prompt('Actual cost (AC) ZAR:', String(row.actual_cost_zar || 0));
        if (ac && !isNaN(Number(ac))) body.actual_cost_zar = Number(ac);
      } else if (action === 'detect-variance') {
        const reason = window.prompt('Variance reason (required for audit):', row.variance_reason ?? '');
        if (!reason) return;
        body.variance_reason = reason;
      } else if (action === 'draft-reforecast') {
        const reason = window.prompt('Reforecast reason (required):', row.reforecast_reason ?? '');
        if (!reason) return;
        body.reforecast_reason = reason;
        const eac = window.prompt('Proposed estimate at completion (EAC) ZAR:', String(row.estimate_at_completion_zar || 0));
        if (eac && !isNaN(Number(eac))) body.estimate_at_completion_zar = Number(eac);
      } else if (action === 'log-cr') {
        const summary = window.prompt('CR summary (required for audit):', row.cr_summary ?? '');
        if (!summary) return;
        body.cr_summary = summary;
        const v = window.prompt('CR value (ZAR):', String(row.cr_value_zar || 0));
        if (v && !isNaN(Number(v))) body.cr_value_zar = Number(v);
      } else if (action === 'approve-cr') {
        const note = window.prompt('CR approval note (audit). NOTE: crosses regulator mega only when cr_value>=10% of budget.', '');
        if (note !== null) body.notes = note;
      } else if (action === 'reject-reforecast') {
        const reason = window.prompt('Rejection reason (required for audit):', row.reforecast_rejection_reason ?? '');
        if (!reason) return;
        body.reforecast_rejection_reason = reason;
      } else if (action === 'publish-reforecast') {
        const note = window.prompt('Publish note (audit). NOTE: crosses regulator large+mega when VAC<0 OR CPI<0.85.', '');
        if (note !== null) body.notes = note;
      } else if (action === 'reconcile') {
        const note = window.prompt('Reconciliation note (Finance Director):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'close-book') {
        const note = window.prompt('Closing note (Finance Director — HARD terminal):', '');
        if (note !== null) body.notes = note;
      } else if (action === 'cancel') {
        const reason = window.prompt('Cancellation reason (required). NOTE: W113 SIGNATURE — crosses regulator EVERY tier when budget>=R1.', row.cancel_reason ?? '');
        if (!reason) return;
        body.cancel_reason = reason;
      } else if (action === 'draw-contingency') {
        const v = window.prompt('Contingency draw amount (ZAR):', '');
        if (v && !isNaN(Number(v))) body.contingency_drawn_zar = Number(v);
        const reason = window.prompt('Contingency draw reason:', '');
        if (reason) body.reason_code = reason;
      } else if (action === 'draw-management-reserve') {
        const v = window.prompt('MR draw amount (ZAR). NOTE: W113 SIGNATURE — crosses regulator EVERY tier when budget>=R1.', '');
        if (v && !isNaN(Number(v))) body.management_reserve_drawn_zar = Number(v);
        const reason = window.prompt('MR draw reason (governance):', '');
        if (reason) body.reason_code = reason;
      } else if (action === 'submit-to-pm-review') {
        const note = window.prompt('PM review submission note:', '');
        if (note !== null) body.notes = note;
      }
      await api.post(`/ipp/cost-evm/chain/${row.id}/${action}`, body);
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
            IPP Cost Management &amp; Earned Value Management (EVM) — PMBOK 7 + AACE RP-67R-11 + ANSI EIA-748-D + ISO 21500 + IFRS 15/IAS 11 + REIPPPP + DMRE + SARB
          </h2>
          <p className="text-xs text-[#4a5568]">
            14-state P6 cost-control lifecycle:
            budget set {'→'} committed {'→'} incurred {'→'} measured {'→'} variance detected {'→'} reforecast drafted {'→'} CR logged {'→'} CR approved {'→'}
            reforecast published {'→'} reconciled {'→'} closed, with cancelled / reforecast_rejected (loops back to draft) / contingency_drawn branches.
            INVERTED SLA polarity (HOURS) on variance_detected: small 72h, medium 168h, large 336h, mega 480h
            (<em>larger budgets get LONGER cure runway</em>). FLOOR-AT-LARGE on any one of 5 floor flags (CPI&lt;0.85, contingency consumed &ge;75%, management reserve drawn,
            forex variance &ge;10%, multi-currency book); FLOOR-AT-MEGA on 2+ flags. SIGNATURE:
            <strong> draw-management-reserve crosses regulator EVERY tier when budget&ge;R1</strong> (NERSA + IPPO + DMRE + SARB governance hard line);
            cancel crosses regulator EVERY tier &ge;R1; publish-reforecast crosses large+mega when VAC&lt;0 OR CPI&lt;0.85;
            approve-CR crosses mega only when CR&ge;10% of budget; SLA breach crosses large+mega. 4-step authority ladder:
            cost_engineer {'→'} PM {'→'} finance_director {'→'} CFO. 4 bridges: W112 schedule, W21 drawdown, W30 disbursement, W77 reserve-account.
            Nightly EVM recompute at 00:20 UTC keeps CPI/SPI/EAC/TCPI/VAC live.
          </p>
        </div>
      </header>

      {/* 8-card KPI strip — action-LEFT (most actionable first) */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Active"          value={kpis.active_count}          tone={kpis.active_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Variance"        value={kpis.variance_count}        tone={kpis.variance_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="CR logged"       value={kpis.cr_logged_count}       tone={kpis.cr_logged_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="MR drawn"        value={kpis.mr_drawn_count}        tone={kpis.mr_drawn_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="CPI<0.85"        value={kpis.cpi_below_count}       tone={kpis.cpi_below_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"    value={kpis.breached}              tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Mega"            value={kpis.mega_count}            tone={kpis.mega_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Total"           value={kpis.total} />
      </div>

      {/* Sub-KPI bridge + portfolio totals strip */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Reforecast draft: <span className="font-semibold text-[#a06200]">{kpis.reforecast_drafted_count}</span></span>
        <span>CR approved: <span className="font-semibold text-[#1f6b3a]">{kpis.cr_approved_count}</span></span>
        <span>Published: <span className="font-semibold text-[#1f5b3a]">{kpis.published_count}</span></span>
        <span>Contingency drawn: <span className="font-semibold text-[#9b1f1f]">{kpis.contingency_drawn_count}</span></span>
        <span>Closed: <span className="font-semibold text-[#1f5b3a]">{kpis.closed_count}</span></span>
        <span>Bridges to W112 (schedule): <span className="font-semibold text-[#1a3a5c]">{kpis.schedule_bridged_count}</span></span>
        <span>W21 (drawdown): <span className="font-semibold text-[#1a3a5c]">{kpis.drawdown_bridged_count}</span></span>
        <span>W30 (disbursement): <span className="font-semibold text-[#1a3a5c]">{kpis.disbursement_bridged_count}</span></span>
        <span>W77 (reserve-acc): <span className="font-semibold text-[#1a3a5c]">{kpis.reserve_account_bridged_count}</span></span>
        <span>Budget total: <span className="font-semibold text-[#1a3a5c]">{fmtZar(kpis.total_budget_zar_sum)}</span></span>
        <span>EV total: <span className="font-semibold text-[#1f5b3a]">{fmtZar(kpis.earned_value_zar_sum)}</span></span>
        <span>AC total: <span className="font-semibold text-[#a06200]">{fmtZar(kpis.actual_cost_zar_sum)}</span></span>
        <span>MR drawn ZAR: <span className="font-semibold text-[#9b1f1f]">{fmtZar(kpis.mr_drawn_zar_sum)}</span></span>
      </div>

      {/* Row 1: action / lifecycle pills */}
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

      {/* Row 2: lifecycle stages + tiers */}
      <div className="mb-3 flex flex-wrap gap-1.5">
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">EVM #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">BAC</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">CPI</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SPI</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">VAC</th>
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
                const health = HEALTH_TONE[r.evm_health_band_live ?? 'green'];
                const cpiV = r.cpi_live ?? r.cpi;
                const spiV = r.spi_live ?? r.spi;
                const vacV = r.variance_at_completion_zar_live ?? r.variance_at_completion_zar;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.evm_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">REG</span>}
                    </td>
                    <td className="px-3 py-2 text-[#1a3a5c]">
                      <div className="text-[11px] font-medium">{r.project_name ?? r.project_id}</div>
                      <div className="text-[10px] text-[#6b7685]">
                        {fmtMw(r.project_capacity_mw)}
                        {r.management_reserve_drawn ? <span className="ml-1 text-[9px] font-semibold text-[#9b1f1f]">MR-DRAWN</span> : null}
                        {r.cpi_below_pct_85 ? <span className="ml-1 text-[9px] font-semibold text-[#a06200]">CPI&lt;0.85</span> : null}
                        {r.multi_currency_book ? <span className="ml-1 text-[9px] font-semibold text-[#6b7685]">MULTI-CCY</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtZar(r.total_budget_zar)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${cpiV >= 1 ? 'text-[#1f5b3a]' : cpiV >= 0.85 ? 'text-[#a06200]' : 'text-[#9b1f1f]'}`}>{fmtNum(cpiV)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${spiV >= 1 ? 'text-[#1f5b3a]' : spiV >= 0.85 ? 'text-[#a06200]' : 'text-[#9b1f1f]'}`}>{fmtNum(spiV)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${vacV < 0 ? 'text-[#9b1f1f] font-semibold' : 'text-[#1f5b3a]'}`}>{fmtZar(vacV)}</td>
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
                <tr><td colSpan={11} className="px-3 py-6 text-center text-[#4a5568]">No EVM rows match.</td></tr>
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
  row: IpeRow;
  events: IpeEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: IpeRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const cpiV = row.cpi_live ?? row.cpi;
  const spiV = row.spi_live ?? row.spi;
  const cvZar = row.cost_variance_zar_live ?? row.cost_variance_zar;
  const svZar = row.schedule_variance_zar_live ?? row.schedule_variance_zar;
  const eacV = row.estimate_at_completion_zar_live ?? row.estimate_at_completion_zar;
  const etcV = row.estimate_to_complete_zar_live ?? row.estimate_to_complete_zar;
  const vacV = row.variance_at_completion_zar_live ?? row.variance_at_completion_zar;
  const tcpiV = row.tcpi_live ?? row.tcpi;
  const completeness = row.evm_completeness_index_live ?? row.evm_completeness_index;
  const contRem = row.contingency_remaining_pct_live ?? row.contingency_remaining_pct;
  const mrRem = row.management_reserve_remaining_pct_live ?? row.management_reserve_remaining_pct;

  // Overflow actions allowed across non-terminal states.
  const canSubmitReview: ChainStatus[] = ['budget_set', 'committed', 'incurred', 'measured', 'variance_detected', 'reforecast_drafted'];
  const canDrawContingency: ChainStatus[] = ['CR_approved'];
  const canDrawMR: ChainStatus[] = ['CR_approved', 'contingency_drawn'];
  const canReject: ChainStatus[] = ['CR_logged'];
  const canCancel: ChainStatus[] = ['budget_set', 'committed', 'incurred', 'measured', 'variance_detected', 'reforecast_drafted', 'CR_logged', 'CR_approved', 'reforecast_published', 'reconciled', 'reforecast_rejected', 'contingency_drawn'];

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[896px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.evm_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? row.project_id} — {fmtMw(row.project_capacity_mw)}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.current_tier].label} {'•'} BAC <span className="text-[#1a3a5c]">{fmtZar(row.total_budget_zar)}</span>
                {' '}{'•'} CPI <span className={cpiV >= 1 ? 'text-[#1f5b3a]' : 'text-[#9b1f1f]'}>{fmtNum(cpiV)}</span>
                {' '}{'•'} SPI <span className={spiV >= 1 ? 'text-[#1f5b3a]' : 'text-[#9b1f1f]'}>{fmtNum(spiV)}</span>
                {' '}{'•'} VAC <span className={vacV < 0 ? 'text-[#9b1f1f]' : 'text-[#1f5b3a]'}>{fmtZar(vacV)}</span>
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
            {row.evm_health_band_live && (
              <span className="inline-block rounded px-2 py-0.5 font-medium" style={{ background: HEALTH_TONE[row.evm_health_band_live].bg, color: HEALTH_TONE[row.evm_health_band_live].fg }}>
                Health: {HEALTH_TONE[row.evm_health_band_live].label}
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
            {row.management_reserve_drawn ? (
              <span className="inline-block rounded bg-[#7a0e0e] px-2 py-0.5 font-semibold text-white">MR drawn</span>
            ) : null}
            {row.cpi_below_pct_85 ? (
              <span className="inline-block rounded bg-[#fde0e0] px-2 py-0.5 font-semibold text-[#9b1f1f]">CPI&lt;0.85</span>
            ) : null}
            {row.multi_currency_book ? (
              <span className="inline-block rounded bg-[#fff4d6] px-2 py-0.5 font-semibold text-[#a06200]">Multi-currency</span>
            ) : null}
          </div>
        </header>

        <div className="p-5 space-y-4">
          {/* LIVE 22-field battery */}
          <Section title="LIVE battery (22 fields, re-computed every fetch)">
            <Grid>
              <Field label="CPI"                  value={fmtNum(cpiV)}   tone={cpiV >= 1 ? 'ok' : cpiV >= 0.85 ? 'warn' : 'bad'} />
              <Field label="SPI"                  value={fmtNum(spiV)}   tone={spiV >= 1 ? 'ok' : spiV >= 0.85 ? 'warn' : 'bad'} />
              <Field label="TCPI"                 value={fmtNum(tcpiV)}  tone={tcpiV <= 1 ? 'ok' : tcpiV <= 1.10 ? 'warn' : 'bad'} />
              <Field label="CV (ZAR)"             value={fmtZar(cvZar)}  tone={cvZar >= 0 ? 'ok' : 'bad'} />
              <Field label="SV (ZAR)"             value={fmtZar(svZar)}  tone={svZar >= 0 ? 'ok' : 'bad'} />
              <Field label="VAC (ZAR)"            value={fmtZar(vacV)}   tone={vacV >= 0 ? 'ok' : 'bad'} />
              <Field label="VAC % of BAC"         value={fmtPct((row.vac_pct_of_bac_live ?? 0) * 100)} tone={(row.vac_pct_of_bac_live ?? 0) < -0.10 ? 'bad' : (row.vac_pct_of_bac_live ?? 0) < -0.03 ? 'warn' : 'ok'} />
              <Field label="EAC (ZAR)"            value={fmtZar(eacV)} />
              <Field label="ETC (ZAR)"            value={fmtZar(etcV)} />
              <Field label="BAC (ZAR)"            value={fmtZar(row.budget_at_completion_zar)} />
              <Field label="Contingency remaining" value={fmtPct(contRem)} tone={contRem >= 50 ? 'ok' : contRem >= 25 ? 'warn' : 'bad'} />
              <Field label="MR remaining"         value={fmtPct(mrRem)}   tone={mrRem >= 50 ? 'ok' : mrRem >= 25 ? 'warn' : 'bad'} />
              <Field label="Health band"          value={row.evm_health_band_live ?? '-'} />
              <Field label="Floor flags"          value={String(row.floor_flag_count_live ?? 0)} tone={(row.floor_flag_count_live || 0) >= 2 ? 'bad' : (row.floor_flag_count_live || 0) >= 1 ? 'warn' : 'ok'} />
              <Field label="Completeness"         value={`${completeness} / 130`} />
              <Field label="SLA hours remaining"  value={fmtHoursSla(row.sla_hours_remaining_live)} tone={row.sla_breached_live ? 'bad' : 'ok'} />
              <Field label="SLA window"           value={fmtHoursSla(row.sla_window_hours)} />
              <Field label="Authority"            value={row.authority_required_live ?? '-'} />
              <Field label="Urgency"              value={row.urgency_band_live ?? '-'} />
              <Field label="Regulator filing"     value={fmtHoursSla(row.regulator_filing_window_hours_live)} />
              <Field label="Variance count"       value={String(row.variance_count)} tone={row.variance_count > 0 ? 'warn' : 'ok'} />
              <Field label="CR count"             value={String(row.cr_count)}     tone={row.cr_count > 0 ? 'warn' : 'ok'} />
            </Grid>
          </Section>

          {/* Budget block */}
          <Section title="Budget block (BAC + contingency + management reserve)">
            <Grid>
              <Field label="Total budget"         value={fmtZar(row.total_budget_zar)} />
              <Field label="Currency code"        value={row.currency_code ?? 'ZAR'} />
              <Field label="Forex component"      value={fmtPct(row.forex_component_pct)} />
              <Field label="BAC"                  value={fmtZar(row.budget_at_completion_zar)} />
              <Field label="Contingency initial"  value={fmtZar(row.contingency_initial_zar)} />
              <Field label="Contingency drawn"    value={fmtZar(row.contingency_drawn_zar)} tone={row.contingency_drawn_zar > 0 ? 'warn' : 'ok'} />
              <Field label="MR initial"           value={fmtZar(row.management_reserve_initial_zar)} />
              <Field label="MR drawn"             value={fmtZar(row.management_reserve_drawn_zar)} tone={row.management_reserve_drawn_zar > 0 ? 'bad' : 'ok'} />
            </Grid>
          </Section>

          {/* Cost ledger */}
          <Section title="Cost ledger (committed / incurred / invoiced / paid)">
            <Grid>
              <Field label="Committed cost"       value={fmtZar(row.committed_cost_zar)} />
              <Field label="Incurred cost"        value={fmtZar(row.incurred_cost_zar)} />
              <Field label="Invoiced cost"        value={fmtZar(row.invoiced_cost_zar)} />
              <Field label="Paid cost"            value={fmtZar(row.paid_cost_zar)} />
              <Field label="Planned value (PV)"   value={fmtZar(row.planned_value_zar)} />
              <Field label="Earned value (EV)"    value={fmtZar(row.earned_value_zar)} />
              <Field label="Actual cost (AC)"     value={fmtZar(row.actual_cost_zar)} />
              <Field label="Last cost update"     value={fmtDate(row.last_cost_update_at)} />
            </Grid>
          </Section>

          {/* Bridges */}
          <Section title="4-bridge architecture (W112 / W21 / W30 / W77)">
            <Grid>
              <Field label="W112 schedule ref"        value={row.schedule_ref ?? '-'}        tone={row.bridges_to_schedule_chain_live ? 'ok' : 'warn'} />
              <Field label="W21 drawdown ref"         value={row.drawdown_ref ?? '-'}        tone={row.bridges_to_drawdown_chain_live ? 'ok' : 'warn'} />
              <Field label="W30 disbursement ref"     value={row.disbursement_ref ?? '-'}    tone={row.bridges_to_disbursement_chain_live ? 'ok' : 'warn'} />
              <Field label="W77 reserve-account ref"  value={row.reserve_account_ref ?? '-'} tone={row.bridges_to_reserve_account_chain_live ? 'ok' : 'warn'} />
              <Field label="Regulator inbox ref"      value={row.regulator_inbox_ref ?? '-'} />
              <Field label="Regulator ref"            value={row.regulator_ref ?? '-'} />
              <Field label="Last variance at"         value={fmtDate(row.last_variance_at)} />
              <Field label="Last reforecast at"       value={fmtDate(row.last_reforecast_at)} />
            </Grid>
          </Section>

          {/* Floor flags */}
          <Section title="Floor flags (5)">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FlagPill label="CPI<0.85"                 on={!!row.cpi_below_pct_85} />
              <FlagPill label="Contingency consumed>=75%" on={!!row.contingency_consumed_pct_75} />
              <FlagPill label="MR drawn"                  on={!!row.management_reserve_drawn} />
              <FlagPill label="Forex variance>=10%"       on={!!row.forex_variance_above_pct_10} />
              <FlagPill label="Multi-currency book"       on={!!row.multi_currency_book} />
            </div>
          </Section>

          {/* Reasons */}
          {(row.variance_reason || row.reforecast_reason || row.reforecast_rejection_reason || row.cr_summary || row.cancel_reason || row.narrative) && (
            <Section title="Reasons / narrative">
              <div className="space-y-1.5 text-[12px] text-[#1a3a5c]">
                {row.variance_reason && <div><strong>Variance reason:</strong> {row.variance_reason}</div>}
                {row.reforecast_reason && <div><strong>Reforecast reason:</strong> {row.reforecast_reason}</div>}
                {row.reforecast_rejection_reason && <div><strong>Reforecast rejection:</strong> {row.reforecast_rejection_reason}</div>}
                {row.cr_summary && <div><strong>CR summary:</strong> {row.cr_summary}</div>}
                {row.cancel_reason && <div><strong>Cancel reason:</strong> {row.cancel_reason}</div>}
                {row.narrative && <div><strong>Narrative:</strong> {row.narrative}</div>}
              </div>
            </Section>
          )}

          {/* Action ladder — primary 2-3 + overflow */}
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <ActionButton tone="primary" onClick={() => onAct(nextAction, row)}>
                  {ACTION_LABEL[nextAction]}
                </ActionButton>
              )}
              {canSubmitReview.includes(row.chain_status) && (
                <ActionButton tone="primary" onClick={() => onAct('submit-to-pm-review', row)}>
                  {ACTION_LABEL['submit-to-pm-review']}
                </ActionButton>
              )}
              {canReject.includes(row.chain_status) && (
                <ActionButton tone="warn" onClick={() => onAct('reject-reforecast', row)}>
                  {ACTION_LABEL['reject-reforecast']}
                </ActionButton>
              )}
              {canDrawContingency.includes(row.chain_status) && (
                <ActionButton tone="warn" onClick={() => onAct('draw-contingency', row)}>
                  {ACTION_LABEL['draw-contingency']}
                </ActionButton>
              )}
              {canDrawMR.includes(row.chain_status) && (
                <ActionButton tone="danger" onClick={() => onAct('draw-management-reserve', row)}>
                  {ACTION_LABEL['draw-management-reserve']}
                </ActionButton>
              )}
              {canCancel.includes(row.chain_status) && (
                <ActionButton tone="danger" onClick={() => onAct('cancel', row)}>
                  {ACTION_LABEL['cancel']}
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
