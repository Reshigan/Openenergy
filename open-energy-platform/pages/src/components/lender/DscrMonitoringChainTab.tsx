// Wave 86 — Lender DSCR Monitoring & Cure tab.
//
// The COVERAGE-DEFENSE engine of the project-finance loan book. LMA covenant
// schedule + SARB IFRS 9 Stage 2/3 trigger framework + Basel III LCR/NSFR. A
// best-in-class lender treasury tests DSCR / LLCR / PLCR on each contractual
// test date and runs a 12-state cure lifecycle when the loan slips below the
// pass threshold: clean certification, watch, breach, lock-up, cure proposal,
// execution, validation, acceleration to W45 or waiver. Distinct from W38
// (point-in-time CERTIFICATE chain) — W86 is the rolling MONITOR.
//
//   period_open → data_collected → computed → certified_clean
//                                          → watch → certified_clean
//                                          → breach_recorded →
//                                               (waive)        waived
//                                               (lock_up)      lock_up →
//                                                   (propose_cure) cure_proposed
//                                                   (declare_acc.) accelerated
//                                               (propose_cure) cure_proposed →
//                                                   (reject)  breach_recorded
//                                                   (execute) cure_in_progress →
//                                                       (validate) cure_validated → certified_clean
//                                                       (fail)     accelerated
//
// URGENT SLA — the LOWER the current DSCR (the more stressed the loan), the
// TIGHTER every window. Tier (4) is RE-DERIVED on every transition from the
// current DSCR so a project that started at minor can deteriorate into severe
// across periods, and a project that breached at material can recover after
// cure. Single write — the lender desk drives every step; actor_party records
// lender / borrower / independent_engineer per step.
//
// The W86 SIGNATURE is COVERAGE-DEFENSE — declare_acceleration crosses the
// regulator for EVERY tier (IFRS 9 Stage 3 trigger, sister of W45 write_off,
// W77 declare_breach, W68 declare_default — a categorical prudential event).
// waive_breach, enter_lock_up and sla_breached cross for material + severe.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'period_open' | 'data_collected' | 'computed' | 'certified_clean'
  | 'watch' | 'breach_recorded' | 'cure_proposed' | 'cure_in_progress'
  | 'cure_validated' | 'lock_up' | 'accelerated' | 'waived';

type Tier = 'minor' | 'standard' | 'material' | 'severe';
type Urgency = 'critical' | 'high' | 'medium' | 'low';

interface DscrRow {
  id: string;
  monitoring_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string;
  facility_name: string;
  project_id: string;
  project_name: string;
  borrower_id: string;
  borrower_name: string;
  lender_agent_id: string;
  lender_agent_name: string;
  test_period_label: string;
  test_period_start: string;
  test_period_end: string;
  test_date: string;
  pass_threshold: number;
  lockup_threshold: number;
  default_floor: number;
  equity_cure_cap_multiple: number;
  current_dscr: number | null;
  forward_dscr_p12m: number | null;
  backward_dscr_12m: number | null;
  llcr_value: number | null;
  plcr_value: number | null;
  cfads_period_zar: number;
  debt_service_period_zar: number;
  shortfall_zar: number;
  outstanding_debt_zar: number;
  npv_loan_life_zar: number;
  npv_project_life_zar: number;
  equity_cure_available_zar: number;
  dsra_balance_zar: number;
  proposed_cure_amount_zar: number;
  executed_cure_amount_zar: number;
  sister_loan_id: string | null;
  sister_loan_dscr: number | null;
  dscr_tier: Tier;
  is_systemic_carrier: number;
  annual_trend: number;
  watch_flag: number;
  breach_flag: number;
  lock_up_flag: number;
  cure_proposed_flag: number;
  cure_executing_flag: number;
  cure_validated_flag: number;
  accelerated_flag: number;
  waived_flag: number;
  last_action_ref: string | null;
  regulator_ref: string | null;
  chain_basis: string | null;
  reason_code: string | null;
  monitoring_summary: string | null;
  chain_status: ChainStatus;
  period_open_at: string;
  data_collected_at: string | null;
  computed_at: string | null;
  certified_clean_at: string | null;
  watch_at: string | null;
  breach_recorded_at: string | null;
  cure_proposed_at: string | null;
  cure_in_progress_at: string | null;
  cure_validated_at: string | null;
  lock_up_at: string | null;
  accelerated_at: string | null;
  waived_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  is_systemic_carrier_flag?: boolean;
  breach_crosses_regulator?: boolean;
  severity_index_live?: number;
  headroom_to_lockup_months_live?: number | null;
  cure_runway_days_live?: number | null;
  equity_cure_coverage_ratio_live?: number | null;
  dsra_coverage_ratio_live?: number | null;
  cross_default_risk_flag_live?: boolean;
  forward_dscr_live?: number | null;
  llcr_live?: number | null;
  plcr_live?: number | null;
  urgency_band_live?: Urgency;
}

interface DscrEvent {
  id: string;
  monitoring_id: string;
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
  open_count: number;
  certified_clean_count: number;
  accelerated_count: number;
  waived_count: number;
  breach_count: number;
  cure_active_count: number;
  lock_up_count: number;
  watch_count: number;
  breached: number;
  reportable_total: number;
  total_outstanding_zar: number;
  total_shortfall_zar: number;
  critical_urgency_count: number;
  cross_default_count: number;
  severe_tier_count: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  period_open:      { bg: '#e3e7ec', fg: '#557',    label: 'Period open' },
  data_collected:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Data collected' },
  computed:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Computed' },
  certified_clean:  { bg: '#d4edda', fg: '#155724', label: 'Certified clean' },
  watch:            { bg: '#fff4d6', fg: '#a06200', label: 'Watch' },
  breach_recorded:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Breach recorded' },
  cure_proposed:    { bg: '#ffd9b3', fg: '#8a4a00', label: 'Cure proposed' },
  cure_in_progress: { bg: '#ffd9b3', fg: '#8a4a00', label: 'Cure in progress' },
  cure_validated:   { bg: '#d4edda', fg: '#155724', label: 'Cure validated' },
  lock_up:          { bg: '#f3c0c0', fg: '#5a1818', label: 'Lock-up' },
  accelerated:      { bg: '#f3c0c0', fg: '#5a1818', label: 'Accelerated' },
  waived:           { bg: '#e3e7ec', fg: '#557',    label: 'Waived' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#d4edda', fg: '#155724', label: 'Minor (≥1.30×)' },
  standard: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard (≥1.20×)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (≥1.00×)' },
  severe:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Severe (<1.00×)' },
};

const URGENCY_TONE: Record<Urgency, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'High' },
  medium:   { bg: '#fff4d6', fg: '#a06200', label: 'Medium' },
  low:      { bg: '#d4edda', fg: '#155724', label: 'Low' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',             label: 'Open' },
  { key: 'all',              label: 'All' },
  { key: 'minor',            label: 'Minor' },
  { key: 'standard',         label: 'Standard' },
  { key: 'material',         label: 'Material' },
  { key: 'severe',           label: 'Severe' },
  { key: 'period_open',      label: 'Period open' },
  { key: 'data_collected',   label: 'Data collected' },
  { key: 'computed',         label: 'Computed' },
  { key: 'certified_clean',  label: 'Certified' },
  { key: 'watch',            label: 'Watch' },
  { key: 'breach_recorded',  label: 'Breach' },
  { key: 'cure_proposed',    label: 'Cure proposed' },
  { key: 'cure_in_progress', label: 'Cure in progress' },
  { key: 'cure_validated',   label: 'Cure validated' },
  { key: 'lock_up',          label: 'Lock-up' },
  { key: 'accelerated',      label: 'Accelerated' },
  { key: 'waived',           label: 'Waived' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
  { key: 'systemic',         label: 'Systemic' },
  { key: 'cross_default',    label: 'Cross-default' },
  { key: 'critical',         label: 'Critical urgency' },
];

type ActionKind =
  | 'collect-data' | 'compute-ratios' | 'certify-clean' | 'place-on-watch'
  | 'record-breach' | 'enter-lock-up' | 'propose-cure' | 'reject-cure'
  | 'execute-cure' | 'validate-cure' | 'fail-cure' | 'declare-acceleration'
  | 'waive-breach';

// Allowed actions per state — primary forward action first. Mirrors the spec
// TRANSITIONS map so the UI never offers an invalid step.
const ALLOWED_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  period_open:      ['collect-data'],
  data_collected:   ['compute-ratios'],
  computed:         ['certify-clean', 'place-on-watch', 'record-breach'],
  certified_clean:  [],
  watch:            ['certify-clean', 'record-breach'],
  breach_recorded:  ['propose-cure', 'enter-lock-up', 'waive-breach'],
  cure_proposed:    ['execute-cure', 'reject-cure'],
  cure_in_progress: ['validate-cure', 'fail-cure'],
  cure_validated:   ['certify-clean'],
  lock_up:          ['propose-cure', 'declare-acceleration'],
  accelerated:      [],
  waived:           [],
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'collect-data':         'Collect data (borrower)',
  'compute-ratios':       'Compute ratios (lender)',
  'certify-clean':        'Certify clean (lender)',
  'place-on-watch':       'Place on watch (lender)',
  'record-breach':        'Record breach (lender)',
  'enter-lock-up':        'Enter distribution lock-up (lender)',
  'propose-cure':         'Propose cure (borrower)',
  'reject-cure':          'Reject cure (lender)',
  'execute-cure':         'Execute cure (borrower)',
  'validate-cure':        'Validate cure (independent engineer)',
  'fail-cure':            'Fail cure — escalate (lender)',
  'declare-acceleration': 'Declare acceleration — IFRS 9 Stage 3 (lender)',
  'waive-breach':         'Waive breach (lender)',
};

const ACTION_TONE: Record<ActionKind, 'primary' | 'danger' | 'warn' | 'good' | 'muted'> = {
  'collect-data':         'primary',
  'compute-ratios':       'primary',
  'certify-clean':        'good',
  'place-on-watch':       'warn',
  'record-breach':        'warn',
  'enter-lock-up':        'warn',
  'propose-cure':         'primary',
  'reject-cure':          'warn',
  'execute-cure':         'good',
  'validate-cure':        'good',
  'fail-cure':            'danger',
  'declare-acceleration': 'danger',
  'waive-breach':         'muted',
};

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtRatio(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return `${n.toFixed(dp)}×`;
}

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return n.toFixed(dp);
}

const TERMINAL_STATES: ChainStatus[] = ['certified_clean', 'accelerated', 'waived'];

export function DscrMonitoringChainTab() {
  const [rows, setRows] = useState<DscrRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<DscrRow | null>(null);
  const [events, setEvents] = useState<DscrEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: DscrRow[] } & KpiSummary }>('/dscr-monitoring/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total,
          open_count: d.open_count,
          certified_clean_count: d.certified_clean_count,
          accelerated_count: d.accelerated_count,
          waived_count: d.waived_count,
          breach_count: d.breach_count,
          cure_active_count: d.cure_active_count,
          lock_up_count: d.lock_up_count,
          watch_count: d.watch_count,
          breached: d.breached,
          reportable_total: d.reportable_total,
          total_outstanding_zar: d.total_outstanding_zar,
          total_shortfall_zar: d.total_shortfall_zar,
          critical_urgency_count: d.critical_urgency_count,
          cross_default_count: d.cross_default_count,
          severe_tier_count: d.severe_tier_count,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load DSCR monitoring records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: DscrRow; events: DscrEvent[] } }>(
        `/dscr-monitoring/chain/${id}`,
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load DSCR history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'open')         return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')     return !!r.sla_breached;
      if (filter === 'reportable')   return !!r.is_reportable_flag;
      if (filter === 'systemic')     return !!r.is_systemic_carrier_flag;
      if (filter === 'cross_default') return !!r.cross_default_risk_flag_live;
      if (filter === 'critical')     return r.urgency_band_live === 'critical';
      if (filter === 'minor' || filter === 'standard' || filter === 'material' || filter === 'severe') {
        return r.dscr_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: DscrRow) => {
    try {
      let body: Record<string, string | number | boolean> = {};
      if (action === 'collect-data') {
        const basis = window.prompt('Basis — borrower submitting CFADS / debt-service data for the test period:');
        if (!basis) return;
        const cfads = window.prompt('CFADS for the period (ZAR):', String(row.cfads_period_zar ?? ''));
        const ds = window.prompt('Debt service for the period (ZAR):', String(row.debt_service_period_zar ?? ''));
        const sf = window.prompt('Shortfall vs scheduled debt service (ZAR, 0 if none):', String(row.shortfall_zar ?? 0));
        const od = window.prompt('Outstanding debt (ZAR):', String(row.outstanding_debt_zar ?? ''));
        body = { chain_basis: basis };
        if (cfads && !Number.isNaN(Number(cfads))) body.cfads_period_zar = Number(cfads);
        if (ds && !Number.isNaN(Number(ds))) body.debt_service_period_zar = Number(ds);
        if (sf && !Number.isNaN(Number(sf))) body.shortfall_zar = Number(sf);
        if (od && !Number.isNaN(Number(od))) body.outstanding_debt_zar = Number(od);
      } else if (action === 'compute-ratios') {
        const basis = window.prompt('Basis — lender desk computing DSCR / LLCR / PLCR from the collected cash data:');
        if (!basis) return;
        const dscr = window.prompt('Measured DSCR for this period:', String(row.current_dscr ?? ''));
        const fwd = window.prompt('Forward-looking DSCR (12m):', String(row.forward_dscr_p12m ?? ''));
        const bwd = window.prompt('Backward-looking DSCR (12m):', String(row.backward_dscr_12m ?? ''));
        const llcr = window.prompt('LLCR value:', String(row.llcr_value ?? ''));
        const plcr = window.prompt('PLCR value:', String(row.plcr_value ?? ''));
        const npvLoan = window.prompt('NPV loan life cash-flows (ZAR):', String(row.npv_loan_life_zar ?? ''));
        const npvProj = window.prompt('NPV project life cash-flows (ZAR):', String(row.npv_project_life_zar ?? ''));
        const trend = window.prompt('Annual DSCR trend (negative = deteriorating):', String(row.annual_trend ?? 0));
        body = { chain_basis: basis };
        if (dscr && !Number.isNaN(Number(dscr))) body.current_dscr = Number(dscr);
        if (fwd && !Number.isNaN(Number(fwd))) body.forward_dscr_p12m = Number(fwd);
        if (bwd && !Number.isNaN(Number(bwd))) body.backward_dscr_12m = Number(bwd);
        if (llcr && !Number.isNaN(Number(llcr))) body.llcr_value = Number(llcr);
        if (plcr && !Number.isNaN(Number(plcr))) body.plcr_value = Number(plcr);
        if (npvLoan && !Number.isNaN(Number(npvLoan))) body.npv_loan_life_zar = Number(npvLoan);
        if (npvProj && !Number.isNaN(Number(npvProj))) body.npv_project_life_zar = Number(npvProj);
        if (trend && !Number.isNaN(Number(trend))) body.annual_trend = Number(trend);
      } else if (action === 'certify-clean') {
        const basis = window.prompt('Basis — ratios met the pass threshold, certifying the period clean:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'place-on-watch') {
        const basis = window.prompt('Basis — DSCR above lock-up but below pass; place on the watch list:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. trend_negative / curtailment / fx_drift):') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'record-breach') {
        const basis = window.prompt('Basis — DSCR breached the lock-up threshold; record a covenant breach:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. lockup_breach / hard_breach / default_floor):') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'enter-lock-up') {
        const basis = window.prompt('Basis — distribution lock-up notice issued under the LMA waterfall:');
        if (!basis) return;
        body = { chain_basis: basis };
      } else if (action === 'propose-cure') {
        const basis = window.prompt('Basis — borrower proposing an equity cure / DSRA top-up / restructure:');
        if (!basis) return;
        const proposed = window.prompt('Proposed cure amount (ZAR):', String(row.proposed_cure_amount_zar ?? row.shortfall_zar ?? ''));
        const equity = window.prompt('Equity cure available (ZAR):', String(row.equity_cure_available_zar ?? ''));
        const dsra = window.prompt('DSRA balance available (ZAR):', String(row.dsra_balance_zar ?? ''));
        body = { chain_basis: basis };
        if (proposed && !Number.isNaN(Number(proposed))) body.proposed_cure_amount_zar = Number(proposed);
        if (equity && !Number.isNaN(Number(equity))) body.equity_cure_available_zar = Number(equity);
        if (dsra && !Number.isNaN(Number(dsra))) body.dsra_balance_zar = Number(dsra);
      } else if (action === 'reject-cure') {
        const basis = window.prompt('Basis — lender rejecting the cure proposal (return to breach_recorded):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. insufficient_cure / over_cap / unrealistic_source):') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'execute-cure') {
        const basis = window.prompt('Basis — borrower executing the agreed cure (equity injection / DSRA draw):');
        if (!basis) return;
        const exec = window.prompt('Executed cure amount (ZAR):', String(row.executed_cure_amount_zar ?? row.proposed_cure_amount_zar ?? ''));
        body = { chain_basis: basis };
        if (exec && !Number.isNaN(Number(exec))) body.executed_cure_amount_zar = Number(exec);
      } else if (action === 'validate-cure') {
        const basis = window.prompt('Basis — independent engineer / agent validating the cure restores DSCR:');
        if (!basis) return;
        const dscr = window.prompt('Restored DSCR (post-cure):', String(row.current_dscr ?? ''));
        body = { chain_basis: basis };
        if (dscr && !Number.isNaN(Number(dscr))) body.current_dscr = Number(dscr);
      } else if (action === 'fail-cure') {
        const basis = window.prompt('Basis — cure failed / DSCR did not recover; escalating to acceleration:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. cure_failed / dscr_not_restored / abandoned):') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'declare-acceleration') {
        const basis = window.prompt('Basis — declaring acceleration / event of default; IFRS 9 Stage 3 trigger (crosses regulator for EVERY tier):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. lockup_failed / cure_window_lapsed / hard_breach):') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'waive-breach') {
        const basis = window.prompt('Basis — lender granting forbearance / waiver of the breach (crosses regulator for material+severe):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. temporary_waiver / refinance_pending / restructure_under_way):') || '';
        body = { chain_basis: basis };
        if (reason) body.reason_code = reason;
      }
      await api.post(`/dscr-monitoring/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">DSCR monitoring & cure — the coverage-defense engine</h2>
          <p className="text-xs text-[#4a5568]">
            12-state DSCR monitoring lifecycle · the rolling MONITOR counterpart to the periodic covenant CERTIFICATE
            (W38). LMA covenant schedule + SARB IFRS 9 Stage 2/3 trigger framework + Basel III LCR/NSFR. A best-in-class
            lender treasury tests DSCR / LLCR / PLCR on each contractual test date and routes the loan through a 12-state
            cure lifecycle — clean certification, watch, breach, lock-up, cure proposal/execution/validation, acceleration
            (W45 pickup) or waiver. URGENT SLA: the LOWER the current DSCR, the TIGHTER every window. Tier is RE-DERIVED
            on every transition from the current measured DSCR — a project can deteriorate from minor into severe across
            periods, or recover after a successful cure. The live coverage-defense battery (severity index, headroom to
            lock-up, cure runway, equity-cure coverage, DSRA coverage, forward DSCR, LLCR, PLCR, cross-default flag,
            urgency band) re-computes on every fetch so the desk sees defensibility without rebuilding a spreadsheet.
            Single write — the lender desk drives every step; actor_party records the lender, the borrower, or the
            independent engineer. The W86 SIGNATURE is COVERAGE-DEFENSE — declare_acceleration crosses the regulator for
            EVERY tier (IFRS 9 Stage 3 trigger, sister of W45 write_off, W77 declare_breach, W68 declare_default — a
            categorical prudential event). waive_breach, enter_lock_up and sla_breached cross for material + severe.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Certified clean" value={kpis?.certified_clean_count ?? 0} tone="ok" />
        <Kpi label="Watch" value={kpis?.watch_count ?? 0} tone={(kpis?.watch_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Breach" value={kpis?.breach_count ?? 0} tone={(kpis?.breach_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cure active" value={kpis?.cure_active_count ?? 0} tone={(kpis?.cure_active_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Lock-up" value={kpis?.lock_up_count ?? 0} tone={(kpis?.lock_up_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Accelerated" value={kpis?.accelerated_count ?? 0} tone={(kpis?.accelerated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Waived" value={kpis?.waived_count ?? 0} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Critical urgency" value={kpis?.critical_urgency_count ?? 0} tone={(kpis?.critical_urgency_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Cross-default risk" value={kpis?.cross_default_count ?? 0} tone={(kpis?.cross_default_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Severe tier" value={kpis?.severe_tier_count ?? 0} tone={(kpis?.severe_tier_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Outstanding" value={fmtZar(kpis?.total_outstanding_zar ?? 0)} />
        <Kpi label="Shortfall" value={fmtZar(kpis?.total_shortfall_zar ?? 0)} tone={(kpis?.total_shortfall_zar ?? 0) > 0 ? 'warn' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Monitor #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Borrower / Project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Period</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">DSCR</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Urgency</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.dscr_tier];
                const ub = r.urgency_band_live ? URGENCY_TONE[r.urgency_band_live] : null;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.monitoring_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to the regulator">●</span>}
                      {r.is_systemic_carrier_flag && <span className="ml-1 text-[#9b1f1f]" title="Systemic carrier">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[200px] truncate" title={`${r.borrower_name} · ${r.project_name}`}>
                      <div className="font-medium">{r.borrower_name}</div>
                      <div className="text-[10px] text-[#4a5568] truncate">{r.project_name}</div>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.test_period_label}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {fmtRatio(r.current_dscr)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {ub ? (
                        <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ub.bg, color: ub.fg }}>
                          {ub.label}
                        </span>
                      ) : <span className="text-[#4a5568]">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No DSCR monitoring records match.</td></tr>
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

const BTN_CLASS: Record<'primary' | 'danger' | 'warn' | 'good' | 'muted', string> = {
  primary: 'rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]',
  danger:  'rounded border border-red-400 bg-white px-3 py-1.5 text-[12px] font-medium text-red-800 hover:bg-red-50',
  warn:    'rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50',
  good:    'rounded border border-green-300 bg-white px-3 py-1.5 text-[12px] font-medium text-green-800 hover:bg-green-50',
  muted:   'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]',
};

function Drawer({
  row, events, onClose, onAct,
}: {
  row: DscrRow;
  events: DscrEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: DscrRow) => void;
}) {
  const actions = ALLOWED_ACTIONS[row.chain_status] || [];

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.monitoring_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.borrower_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {row.project_name}
                {row.facility_name ? ` · ${row.facility_name}` : ''}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.dscr_tier].label}
                {row.urgency_band_live ? ` · urgency ${URGENCY_TONE[row.urgency_band_live].label.toLowerCase()}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.lender_agent_name} (agent) → {row.borrower_name}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
                {row.is_systemic_carrier_flag ? ' · SYSTEMIC CARRIER' : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                Period {row.test_period_label} ({row.test_period_start} → {row.test_period_end}) · test {row.test_date}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Live coverage-defense battery</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Severity index"              value={fmtNum(row.severity_index_live)} />
            <Pair label="Urgency band"                value={row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live].label : '—'} />
            <Pair label="Headroom to lock-up (mo)"    value={row.headroom_to_lockup_months_live != null ? fmtNum(row.headroom_to_lockup_months_live, 1) : '—'} />
            <Pair label="Cure runway (days)"          value={row.cure_runway_days_live != null ? String(row.cure_runway_days_live) : '—'} />
            <Pair label="Equity-cure coverage"        value={fmtRatio(row.equity_cure_coverage_ratio_live)} />
            <Pair label="DSRA coverage"               value={fmtRatio(row.dsra_coverage_ratio_live)} />
            <Pair label="Forward DSCR (live)"         value={fmtRatio(row.forward_dscr_live)} />
            <Pair label="LLCR (live)"                 value={fmtRatio(row.llcr_live)} />
            <Pair label="PLCR (live)"                 value={fmtRatio(row.plcr_live)} />
            <Pair label="Cross-default risk"          value={row.cross_default_risk_flag_live ? 'YES' : 'No'} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Ratios & cash</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                       value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier (re-derived)"           value={TIER_TONE[row.dscr_tier].label} />
            <Pair label="Current DSCR"                value={fmtRatio(row.current_dscr)} />
            <Pair label="Forward DSCR (p12m)"         value={fmtRatio(row.forward_dscr_p12m)} />
            <Pair label="Backward DSCR (12m)"         value={fmtRatio(row.backward_dscr_12m)} />
            <Pair label="LLCR"                        value={fmtRatio(row.llcr_value)} />
            <Pair label="PLCR"                        value={fmtRatio(row.plcr_value)} />
            <Pair label="Annual trend"                value={fmtNum(row.annual_trend, 3)} />
            <Pair label="Pass threshold"              value={fmtRatio(row.pass_threshold)} />
            <Pair label="Lock-up threshold"           value={fmtRatio(row.lockup_threshold)} />
            <Pair label="Default floor"               value={fmtRatio(row.default_floor)} />
            <Pair label="Equity-cure cap (×)"         value={fmtNum(row.equity_cure_cap_multiple, 1)} />
            <Pair label="CFADS (period)"              value={fmtZar(row.cfads_period_zar)} />
            <Pair label="Debt service (period)"       value={fmtZar(row.debt_service_period_zar)} />
            <Pair label="Shortfall"                   value={fmtZar(row.shortfall_zar)} />
            <Pair label="Outstanding debt"            value={fmtZar(row.outstanding_debt_zar)} />
            <Pair label="NPV loan life"               value={fmtZar(row.npv_loan_life_zar)} />
            <Pair label="NPV project life"            value={fmtZar(row.npv_project_life_zar)} />
            <Pair label="Equity cure available"       value={fmtZar(row.equity_cure_available_zar)} />
            <Pair label="DSRA balance"                value={fmtZar(row.dsra_balance_zar)} />
            <Pair label="Proposed cure"               value={fmtZar(row.proposed_cure_amount_zar)} />
            <Pair label="Executed cure"               value={fmtZar(row.executed_cure_amount_zar)} />
            <Pair label="Sister loan"                 value={row.sister_loan_id ?? '—'} />
            <Pair label="Sister loan DSCR"            value={fmtRatio(row.sister_loan_dscr)} />
          </div>
        </section>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Lifecycle timestamps</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Period open"          value={fmtDate(row.period_open_at)} />
            <Pair label="Data collected"       value={fmtDate(row.data_collected_at)} />
            <Pair label="Computed"             value={fmtDate(row.computed_at)} />
            <Pair label="Certified clean"      value={fmtDate(row.certified_clean_at)} />
            <Pair label="Watch"                value={fmtDate(row.watch_at)} />
            <Pair label="Breach recorded"      value={fmtDate(row.breach_recorded_at)} />
            <Pair label="Cure proposed"        value={fmtDate(row.cure_proposed_at)} />
            <Pair label="Cure in progress"     value={fmtDate(row.cure_in_progress_at)} />
            <Pair label="Cure validated"       value={fmtDate(row.cure_validated_at)} />
            <Pair label="Lock-up"              value={fmtDate(row.lock_up_at)} />
            <Pair label="Accelerated"          value={fmtDate(row.accelerated_at)} />
            <Pair label="Waived"               value={fmtDate(row.waived_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="Last SLA breach"      value={fmtDate(row.last_sla_breach_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable_flag ? 'Yes' : 'No'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Regulator ref"        value={row.regulator_ref ?? '—'} />
            <Pair label="Last action ref"      value={row.last_action_ref ?? '—'} />
          </div>
          {row.chain_basis && (
            <BasisBlock label="Chain basis" tone="#1a3a5c" text={row.chain_basis} />
          )}
          {row.monitoring_summary && (
            <BasisBlock label="Monitoring summary" tone="#155724" text={row.monitoring_summary} />
          )}
        </section>

        {actions.length > 0 && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a, idx) => (
                <button type="button"
                  key={a}
                  onClick={() => onAct(a, row)}
                  className={idx === 0 ? BTN_CLASS.primary : BTN_CLASS[ACTION_TONE[a]]}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
