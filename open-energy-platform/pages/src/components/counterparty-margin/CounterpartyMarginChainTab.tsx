// Wave 68 — Counterparty Margin Call & Default Management lifecycle tab.
//
// The clearing / risk desk of a best-in-class trading venue manages the
// COUNTERPARTY CREDIT and COLLATERAL relationship for every participant with an
// open position, per the Financial Markets Act 19/2012 (clearing houses / CCPs),
// the FSCA Conduct Standards and the CPMI-IOSCO PFMI (Principle 4 credit, 5
// collateral, 6 margin, 13 participant-default rules). This is the trading-side
// counterparty-default waterfall — distinct from W2 (market VaR), W9 (market-maker
// obligations), W29 (position limits), W36 (best execution / RFQ), W44 (trade-
// repository reporting), W52 (market-abuse surveillance) and W60 (algo
// certification). It is the desk that decides whether a member can keep trading.
//
//   limit_active → exposure_warning → margin_call_issued → collateral_received
//     → (cure_breach) → limit_active
//   restriction:  {exposure_warning, margin_call_issued} → position_restriction
//   cure_period:  {margin_call_issued, position_restriction} → cure_period
//   waterfall:    {cure_period, position_restriction} → default_declared → close_out
//                   → default_fund_draw → recovered | written_off
//                 close_out → recovered | written_off (collateral sufficient)
//   withdraw:     {exposure_warning, margin_call_issued} → withdrawn
//
// URGENT SLA — the LARGER the exposure tier, the TIGHTER every window. Tier (5) by
// exposure-at-risk in ZAR with a systemic-importance (SIFI) floor at major. Single
// write: the clearing house / risk desk (trader role) drives every step; the member
// posts collateral out-of-band. The W68 signature — a declared default crosses to
// the regulator for EVERY tier; a default-fund draw, a write-off and an SLA breach
// cross for the large tiers (major + systemic).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'limit_active' | 'exposure_warning' | 'margin_call_issued' | 'collateral_received'
  | 'position_restriction' | 'cure_period' | 'default_declared' | 'close_out'
  | 'default_fund_draw' | 'recovered' | 'written_off' | 'withdrawn';

type Tier = 'minor' | 'moderate' | 'material' | 'major' | 'systemic';

interface MarginRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  counterparty_id: string;
  counterparty_name: string;
  member_code: string | null;
  account_type: 'house' | 'client' | 'omnibus' | null;
  systemically_important: number;
  product_class: string | null;
  exposure_zar: number | null;
  collateral_held_zar: number | null;
  margin_call_zar: number | null;
  collateral_posted_zar: number | null;
  shortfall_zar: number | null;
  default_fund_draw_zar: number | null;
  recovery_zar: number | null;
  write_off_zar: number | null;
  utilisation_pct: number | null;
  severity_tier: Tier;
  clearing_party_id: string | null;
  clearing_party_name: string | null;
  member_party_id: string | null;
  member_party_name: string | null;
  warning_ref: string | null;
  margin_call_ref: string | null;
  collateral_ref: string | null;
  restriction_ref: string | null;
  cure_ref: string | null;
  default_ref: string | null;
  close_out_ref: string | null;
  default_fund_ref: string | null;
  warning_basis: string | null;
  margin_call_basis: string | null;
  collateral_basis: string | null;
  restriction_basis: string | null;
  cure_basis: string | null;
  default_basis: string | null;
  close_out_basis: string | null;
  default_fund_basis: string | null;
  recovery_basis: string | null;
  write_off_basis: string | null;
  reason_code: string | null;
  resolution_summary: string | null;
  chain_status: ChainStatus;
  limit_active_at: string;
  exposure_warning_at: string | null;
  margin_call_issued_at: string | null;
  collateral_received_at: string | null;
  position_restriction_at: string | null;
  cure_period_at: string | null;
  default_declared_at: string | null;
  close_out_at: string | null;
  default_fund_draw_at: string | null;
  recovered_at: string | null;
  written_off_at: string | null;
  withdrawn_at: string | null;
  cure_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: boolean;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
}

interface MarginEvent {
  id: string;
  margin_id: string;
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
  open_count: number;
  default_count: number;
  close_out_count: number;
  fund_draw_count: number;
  recovered_count: number;
  written_off_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  high_open: number;
  total_exposure_zar: number;
  total_fund_draw_zar: number;
  total_write_off_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  limit_active:         { bg: '#d4edda', fg: '#155724', label: 'Limit active' },
  exposure_warning:     { bg: '#fff4d6', fg: '#a06200', label: 'Exposure warning' },
  margin_call_issued:   { bg: '#ffe4b5', fg: '#8a4a00', label: 'Margin call issued' },
  collateral_received:  { bg: '#dbecfb', fg: '#1a3a5c', label: 'Collateral received' },
  position_restriction: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Position restriction' },
  cure_period:          { bg: '#ffe4b5', fg: '#8a4a00', label: 'Cure period' },
  default_declared:     { bg: '#f8d0d0', fg: '#6b1f1f', label: 'Default declared' },
  close_out:            { bg: '#f8d0d0', fg: '#6b1f1f', label: 'Close-out' },
  default_fund_draw:    { bg: '#f3c0c0', fg: '#5a1818', label: 'Default-fund draw' },
  recovered:            { bg: '#d4edda', fg: '#155724', label: 'Recovered' },
  written_off:          { bg: '#e3e7ec', fg: '#557',    label: 'Written off' },
  withdrawn:            { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<R5m)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (<R50m)' },
  material: { bg: '#fff4d6', fg: '#a06200', label: 'Material (<R250m)' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major (<R1bn)' },
  systemic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Systemic (≥R1bn)' },
};

const PRODUCT_LABEL: Record<string, string> = {
  power_forward:        'Power forward',
  power_spot:           'Power spot',
  carbon:              'Carbon',
  financial_derivative: 'Financial derivative',
  repo:                'Repo',
  mixed:               'Mixed',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active' },
  { key: 'all',                  label: 'All' },
  { key: 'minor',                label: 'Minor' },
  { key: 'moderate',             label: 'Moderate' },
  { key: 'material',             label: 'Material' },
  { key: 'major',                label: 'Major' },
  { key: 'systemic',             label: 'Systemic' },
  { key: 'limit_active',         label: 'Limit active' },
  { key: 'exposure_warning',     label: 'Warning' },
  { key: 'margin_call_issued',   label: 'Margin call' },
  { key: 'collateral_received',  label: 'Collateral' },
  { key: 'position_restriction', label: 'Restricted' },
  { key: 'cure_period',          label: 'Cure period' },
  { key: 'default_declared',     label: 'Default' },
  { key: 'close_out',            label: 'Close-out' },
  { key: 'default_fund_draw',    label: 'Fund draw' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'reportable',           label: 'Reportable' },
  { key: 'recovered',            label: 'Recovered' },
  { key: 'written_off',          label: 'Written off' },
  { key: 'withdrawn',            label: 'Withdrawn' },
];

type ActionKind =
  | 'issue-warning' | 'issue-margin-call' | 'record-collateral' | 'cure-breach'
  | 'restrict-positions' | 'open-cure-period' | 'declare-default' | 'begin-close-out'
  | 'draw-default-fund' | 'record-recovery' | 'write-off' | 'withdraw';

// Allowed actions per state, primary forward action first. Mirrors the spec
// TRANSITIONS map so the UI never offers an invalid step.
const ALLOWED_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  limit_active:         ['issue-warning'],
  exposure_warning:     ['issue-margin-call', 'cure-breach', 'restrict-positions', 'withdraw'],
  margin_call_issued:   ['record-collateral', 'open-cure-period', 'restrict-positions', 'withdraw'],
  collateral_received:  ['cure-breach'],
  position_restriction: ['open-cure-period', 'issue-margin-call', 'declare-default'],
  cure_period:          ['record-collateral', 'declare-default'],
  default_declared:     ['begin-close-out'],
  close_out:            ['record-recovery', 'draw-default-fund', 'write-off'],
  default_fund_draw:    ['record-recovery', 'write-off'],
  recovered:            [],
  written_off:          [],
  withdrawn:            [],
};

// Party annotation per action. The clearing house / risk desk (trader role)
// drives every step; the member posts collateral out-of-band.
const ACTION_LABEL: Record<ActionKind, string> = {
  'issue-warning':      'Issue exposure warning (clearing house)',
  'issue-margin-call':  'Issue margin call (clearing house)',
  'record-collateral':  'Record collateral posted (member)',
  'cure-breach':        'Cure breach — restore limit (clearing house)',
  'restrict-positions': 'Restrict positions (clearing house)',
  'open-cure-period':   'Open cure period (clearing house)',
  'declare-default':    'Declare default (clearing house)',
  'begin-close-out':    'Begin close-out (clearing house)',
  'draw-default-fund':  'Draw default fund (clearing house)',
  'record-recovery':    'Record recovery (clearing house)',
  'write-off':          'Write off loss (clearing house)',
  'withdraw':           'Withdraw (clearing house)',
};

// Button styling category per action.
const ACTION_TONE: Record<ActionKind, 'primary' | 'danger' | 'warn' | 'good' | 'muted'> = {
  'issue-warning':      'warn',
  'issue-margin-call':  'warn',
  'record-collateral':  'good',
  'cure-breach':        'good',
  'restrict-positions': 'warn',
  'open-cure-period':   'warn',
  'declare-default':    'danger',
  'begin-close-out':    'danger',
  'draw-default-fund':  'danger',
  'record-recovery':    'good',
  'write-off':          'danger',
  'withdraw':           'muted',
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

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

const TERMINAL_STATES: ChainStatus[] = ['recovered', 'written_off', 'withdrawn'];

export function CounterpartyMarginChainTab() {
  const [rows, setRows] = useState<MarginRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<MarginRow | null>(null);
  const [events, setEvents] = useState<MarginEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: MarginRow[] } & KpiSummary }>('/counterparty-margin/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, active_count: d.active_count, open_count: d.open_count,
          default_count: d.default_count, close_out_count: d.close_out_count,
          fund_draw_count: d.fund_draw_count, recovered_count: d.recovered_count,
          written_off_count: d.written_off_count, withdrawn_count: d.withdrawn_count,
          breached: d.breached, reportable_total: d.reportable_total, high_open: d.high_open,
          total_exposure_zar: d.total_exposure_zar, total_fund_draw_zar: d.total_fund_draw_zar,
          total_write_off_zar: d.total_write_off_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load margin cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: MarginRow; events: MarginEvent[] } }>(
        `/counterparty-margin/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load margin history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'minor' || filter === 'moderate' || filter === 'material' || filter === 'major' || filter === 'systemic') {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: MarginRow) => {
    try {
      let body: Record<string, string | number | boolean> = {};
      if (action === 'issue-warning') {
        const basis = window.prompt('Warning basis — why exposure is approaching the credit limit:');
        if (!basis) return;
        const ref = window.prompt('Warning reference (e.g. WARN-2026-0011):') || '';
        const exp = window.prompt('Exposure at risk (ZAR):', String(row.exposure_zar ?? ''));
        const coll = window.prompt('Collateral held (ZAR):', String(row.collateral_held_zar ?? ''));
        const util = window.prompt('Utilisation %:', String(row.utilisation_pct ?? ''));
        const sifi = window.confirm('Systemically important counterparty? OK = yes, Cancel = no');
        body = { warning_basis: basis, systemically_important: sifi };
        if (ref) body.warning_ref = ref;
        if (exp && !Number.isNaN(Number(exp))) body.exposure_zar = Number(exp);
        if (coll && !Number.isNaN(Number(coll))) body.collateral_held_zar = Number(coll);
        if (util && !Number.isNaN(Number(util))) body.utilisation_pct = Number(util);
      } else if (action === 'issue-margin-call') {
        const basis = window.prompt('Margin-call basis — the shortfall the member must cover:');
        if (!basis) return;
        const ref = window.prompt('Margin-call reference (e.g. MC-2026-0011):') || '';
        const amt = window.prompt('Margin call amount (ZAR):', String(row.margin_call_zar ?? ''));
        body = { margin_call_basis: basis };
        if (ref) body.margin_call_ref = ref;
        if (amt && !Number.isNaN(Number(amt))) body.margin_call_zar = Number(amt);
      } else if (action === 'record-collateral') {
        const basis = window.prompt('Collateral basis — what the member posted to meet the call:');
        if (!basis) return;
        const ref = window.prompt('Collateral reference (e.g. COL-2026-0011):') || '';
        const amt = window.prompt('Collateral posted (ZAR):', String(row.collateral_posted_zar ?? ''));
        body = { collateral_basis: basis };
        if (ref) body.collateral_ref = ref;
        if (amt && !Number.isNaN(Number(amt))) body.collateral_posted_zar = Number(amt);
      } else if (action === 'cure-breach') {
        const reason = window.prompt('Reason code (e.g. collateral_sufficient / exposure_reduced):');
        if (!reason) return;
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { reason_code: reason };
        if (summary) body.resolution_summary = summary;
      } else if (action === 'restrict-positions') {
        const basis = window.prompt('Restriction basis — why the member may not increase positions:');
        if (!basis) return;
        const ref = window.prompt('Restriction reference (e.g. RES-2026-0011):') || '';
        const reason = window.prompt('Reason code (e.g. call_unmet / concentration_risk):') || '';
        body = { restriction_basis: basis };
        if (ref) body.restriction_ref = ref;
        if (reason) body.reason_code = reason;
      } else if (action === 'open-cure-period') {
        const basis = window.prompt('Cure-period basis — the grace window granted to remedy the shortfall:');
        if (!basis) return;
        const ref = window.prompt('Cure reference (e.g. CURE-2026-0011):') || '';
        body = { cure_basis: basis };
        if (ref) body.cure_ref = ref;
      } else if (action === 'declare-default') {
        const basis = window.prompt('Default basis — why the counterparty is declared in default:');
        if (!basis) return;
        const ref = window.prompt('Default reference (e.g. DEF-2026-0011):') || '';
        const reason = window.prompt('Reason code (e.g. call_unmet / cure_lapsed / insolvency):') || '';
        const shortfall = window.prompt('Shortfall (ZAR):', String(row.shortfall_zar ?? ''));
        body = { default_basis: basis };
        if (ref) body.default_ref = ref;
        if (reason) body.reason_code = reason;
        if (shortfall && !Number.isNaN(Number(shortfall))) body.shortfall_zar = Number(shortfall);
      } else if (action === 'begin-close-out') {
        const basis = window.prompt('Close-out basis — the orderly liquidation of the defaulter positions:');
        if (!basis) return;
        const ref = window.prompt('Close-out reference (e.g. CO-2026-0011):') || '';
        const shortfall = window.prompt('Residual shortfall after collateral (ZAR):', String(row.shortfall_zar ?? ''));
        body = { close_out_basis: basis };
        if (ref) body.close_out_ref = ref;
        if (shortfall && !Number.isNaN(Number(shortfall))) body.shortfall_zar = Number(shortfall);
      } else if (action === 'draw-default-fund') {
        const basis = window.prompt('Default-fund basis — the mutualised draw to cover the residual loss:');
        if (!basis) return;
        const ref = window.prompt('Default-fund reference (e.g. DF-2026-0011):') || '';
        const amt = window.prompt('Default-fund draw (ZAR):', String(row.default_fund_draw_zar ?? ''));
        body = { default_fund_basis: basis };
        if (ref) body.default_fund_ref = ref;
        if (amt && !Number.isNaN(Number(amt))) body.default_fund_draw_zar = Number(amt);
      } else if (action === 'record-recovery') {
        const basis = window.prompt('Recovery basis — recovery from collateral / estate / fund replenishment:');
        if (!basis) return;
        const amt = window.prompt('Recovery amount (ZAR):', String(row.recovery_zar ?? ''));
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { recovery_basis: basis };
        if (amt && !Number.isNaN(Number(amt))) body.recovery_zar = Number(amt);
        if (summary) body.resolution_summary = summary;
      } else if (action === 'write-off') {
        const basis = window.prompt('Write-off basis — the unrecoverable residual loss:');
        if (!basis) return;
        const amt = window.prompt('Write-off amount (ZAR):', String(row.write_off_zar ?? ''));
        const reason = window.prompt('Reason code (e.g. estate_exhausted / unrecoverable):') || '';
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { write_off_basis: basis };
        if (amt && !Number.isNaN(Number(amt))) body.write_off_zar = Number(amt);
        if (reason) body.reason_code = reason;
        if (summary) body.resolution_summary = summary;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason — false positive / position closed / netted out:');
        if (!reason) return;
        const summary = window.prompt('Resolution summary (one line for the audit record):') || '';
        body = { reason_code: reason };
        if (summary) body.resolution_summary = summary;
      }
      await api.post(`/counterparty-margin/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Counterparty margin & default management</h2>
          <p className="text-xs text-[#4a5568]">
            12-state counterparty-credit waterfall (Financial Markets Act 19/2012 · FSCA Conduct Standards ·
            CPMI-IOSCO PFMI Principles 4/5/6/13) · limit active → exposure warning → margin call issued →
            collateral received → (cure) → limit active. An unmet call can restrict positions or open a cure
            period; a lapsed cure or unmet call declares a default, then close-out → default-fund draw →
            recovered or written off. URGENT SLA: the larger the exposure tier, the tighter every window. Tier
            by exposure-at-risk in ZAR with a systemic-importance floor at major. Single write — the clearing
            house / risk desk drives every step; the member posts collateral out-of-band. The W68 signature —
            a declared default crosses to the regulator for every tier; a default-fund draw, a write-off and an
            SLA breach cross for the large tiers (major + systemic).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Limit active" value={kpis?.active_count ?? 0} tone="ok" />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="High open" value={kpis?.high_open ?? 0} tone={(kpis?.high_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Default" value={kpis?.default_count ?? 0} tone={(kpis?.default_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Close-out" value={kpis?.close_out_count ?? 0} tone={(kpis?.close_out_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Fund draw" value={kpis?.fund_draw_count ?? 0} tone={(kpis?.fund_draw_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Recovered" value={kpis?.recovered_count ?? 0} tone="ok" />
        <Kpi label="Written off" value={kpis?.written_off_count ?? 0} tone={(kpis?.written_off_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Exposure at risk" value={fmtZar(kpis?.total_exposure_zar ?? 0)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Case #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Counterparty</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Product</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Exposure</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.severity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.case_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to the regulator">●</span>}
                      {r.systemically_important ? <span className="ml-1 text-[#8a4a00]" title="Systemically important">★</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.counterparty_name}>
                      {r.counterparty_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.product_class ? (PRODUCT_LABEL[r.product_class] ?? r.product_class) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {fmtZar(r.exposure_zar)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No margin cases match.</td></tr>
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
  row: MarginRow;
  events: MarginEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: MarginRow) => void;
}) {
  const actions = ALLOWED_ACTIONS[row.chain_status] || [];

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">
                {row.counterparty_name}
                {row.systemically_important ? <span className="ml-2 text-[#8a4a00]" title="Systemically important">★ SIFI</span> : null}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.severity_tier].label}
                {row.product_class ? ` · ${PRODUCT_LABEL[row.product_class] ?? row.product_class}` : ''}
                {row.account_type ? ` · ${row.account_type}` : ''}
                {row.member_code ? ` · ${row.member_code}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.clearing_party_name || 'Clearing house'} → {row.member_party_name || row.counterparty_name}
                {row.cure_round > 0 ? ` · cure round ${row.cure_round}` : ''}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                value={TIER_TONE[row.severity_tier].label} />
            <Pair label="Product class"        value={row.product_class ? (PRODUCT_LABEL[row.product_class] ?? row.product_class) : '—'} />
            <Pair label="Account type"         value={row.account_type ?? '—'} />
            <Pair label="Member code"          value={row.member_code ?? '—'} />
            <Pair label="Systemically important" value={row.systemically_important ? 'Yes' : 'No'} />
            <Pair label="Exposure at risk"     value={fmtZar(row.exposure_zar)} />
            <Pair label="Collateral held"      value={fmtZar(row.collateral_held_zar)} />
            <Pair label="Margin call"          value={fmtZar(row.margin_call_zar)} />
            <Pair label="Collateral posted"    value={fmtZar(row.collateral_posted_zar)} />
            <Pair label="Shortfall"            value={fmtZar(row.shortfall_zar)} />
            <Pair label="Default-fund draw"    value={fmtZar(row.default_fund_draw_zar)} />
            <Pair label="Recovery"             value={fmtZar(row.recovery_zar)} />
            <Pair label="Write-off"            value={fmtZar(row.write_off_zar)} />
            <Pair label="Utilisation"          value={fmtPct(row.utilisation_pct)} />
            <Pair label="Warning ref"          value={row.warning_ref ?? '—'} />
            <Pair label="Margin-call ref"      value={row.margin_call_ref ?? '—'} />
            <Pair label="Collateral ref"       value={row.collateral_ref ?? '—'} />
            <Pair label="Restriction ref"      value={row.restriction_ref ?? '—'} />
            <Pair label="Cure ref"             value={row.cure_ref ?? '—'} />
            <Pair label="Default ref"          value={row.default_ref ?? '—'} />
            <Pair label="Close-out ref"        value={row.close_out_ref ?? '—'} />
            <Pair label="Default-fund ref"     value={row.default_fund_ref ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Limit active since"   value={fmtDate(row.limit_active_at)} />
            <Pair label="Warning"              value={fmtDate(row.exposure_warning_at)} />
            <Pair label="Margin call"          value={fmtDate(row.margin_call_issued_at)} />
            <Pair label="Collateral received"  value={fmtDate(row.collateral_received_at)} />
            <Pair label="Restriction"          value={fmtDate(row.position_restriction_at)} />
            <Pair label="Cure period"          value={fmtDate(row.cure_period_at)} />
            <Pair label="Default declared"     value={fmtDate(row.default_declared_at)} />
            <Pair label="Close-out"            value={fmtDate(row.close_out_at)} />
            <Pair label="Fund draw"            value={fmtDate(row.default_fund_draw_at)} />
            <Pair label="Recovered"            value={fmtDate(row.recovered_at)} />
            <Pair label="Written off"          value={fmtDate(row.written_off_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.resolution_summary && (
            <BasisBlock label="Resolution summary" tone="#1a3a5c" text={row.resolution_summary} />
          )}
          {row.warning_basis && (
            <BasisBlock label="Warning basis" tone="#a06200" text={row.warning_basis} />
          )}
          {row.margin_call_basis && (
            <BasisBlock label="Margin-call basis" tone="#8a4a00" text={row.margin_call_basis} />
          )}
          {row.collateral_basis && (
            <BasisBlock label="Collateral basis (member)" tone="#1a3a5c" text={row.collateral_basis} />
          )}
          {row.restriction_basis && (
            <BasisBlock label="Restriction basis" tone="#9b1f1f" text={row.restriction_basis} />
          )}
          {row.cure_basis && (
            <BasisBlock label="Cure-period basis" tone="#8a4a00" text={row.cure_basis} />
          )}
          {row.default_basis && (
            <BasisBlock label="Default basis" tone="#6b1f1f" text={row.default_basis} />
          )}
          {row.close_out_basis && (
            <BasisBlock label="Close-out basis" tone="#6b1f1f" text={row.close_out_basis} />
          )}
          {row.default_fund_basis && (
            <BasisBlock label="Default-fund basis" tone="#5a1818" text={row.default_fund_basis} />
          )}
          {row.recovery_basis && (
            <BasisBlock label="Recovery basis" tone="#155724" text={row.recovery_basis} />
          )}
          {row.write_off_basis && (
            <BasisBlock label="Write-off basis" tone="#557" text={row.write_off_basis} />
          )}
        </section>

        {actions.length > 0 && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a, idx) => (
                <button
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
