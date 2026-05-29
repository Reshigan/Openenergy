// Wave 77 — Reserve-Account (DSRA / MRA) Funding, Drawdown, Cure & Release tab.
//
// A best-in-class project-finance lender requires the borrower to fund and MAINTAIN
// controlled reserve accounts — the Debt Service Reserve Account (DSRA, typically the
// next 6 months of debt service) and the Maintenance Reserve Account (MRA). The agent
// bank monitors the target balance on every test date; a shortfall must be CURED inside
// a contractual window and a legitimate DRAW must be REPLENISHED inside a top-up window.
// At final maturity / step-down the reserve is RELEASED. A failure to cure or replenish
// is an EVENT OF DEFAULT. Distinct from the rest of the lender book — W21 releases the
// FUNDS, W30 reconciles USE of proceeds, W38 tests COVENANTS, W45 ENFORCES on default,
// W53 APPROVES the credit, W69 perfects the SECURITY; W77 keeps the debt-service and
// maintenance BUFFERS whole.
//
//   reserve_required → funding_scheduled → funding_in_progress → funded
//     → (monitored) → release_requested → released
//   shortfall: funded → shortfall_flagged → cure_pending → (replenish|waive) funded
//                                                        → (declare_breach) breached
//   draw:      funded → drawdown_authorized → drawn → (replenish|waive) funded
//                                                   → (declare_breach) breached
//   cancel:    {reserve_required, funding_scheduled, funding_in_progress} → cancelled
//
// URGENT SLA — the LARGER the reserve target, the TIGHTER every window. Tier (5) by
// target amount in ZAR. Single write — the agent / lender drives every step; actor_party
// records whether a step represents the lender, the borrower or the account bank. The W77
// signature — a reserve BREACH (event of default) crosses to the regulator for EVERY tier;
// a waiver and an SLA breach cross for the large tiers (major + systemic).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'reserve_required' | 'funding_scheduled' | 'funding_in_progress' | 'funded'
  | 'shortfall_flagged' | 'cure_pending' | 'drawdown_authorized' | 'drawn'
  | 'release_requested' | 'released' | 'breached' | 'cancelled';

type Tier = 'small' | 'medium' | 'large' | 'major' | 'systemic';

interface ReserveRow {
  id: string;
  reserve_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_ref: string | null;
  project_id: string | null;
  loan_agreement_ref: string | null;
  lender_name: string;
  borrower_name: string;
  account_bank: string | null;
  reserve_type: string | null;
  funding_mode: string | null;
  target_basis: string | null;
  account_number: string | null;
  currency: string | null;
  target_amount_zar: number;
  current_balance_zar: number | null;
  drawn_amount_zar: number | null;
  shortfall_amount_zar: number | null;
  reserve_tier: Tier;
  next_test_date: string | null;
  cure_deadline: string | null;
  release_due_date: string | null;
  shortfall_reason_code: string | null;
  funding_ref: string | null;
  shortfall_ref: string | null;
  cure_ref: string | null;
  drawdown_ref: string | null;
  replenishment_ref: string | null;
  waiver_ref: string | null;
  release_ref: string | null;
  breach_ref: string | null;
  cancel_ref: string | null;
  funding_basis: string | null;
  shortfall_basis: string | null;
  cure_basis: string | null;
  drawdown_basis: string | null;
  replenishment_basis: string | null;
  waiver_basis: string | null;
  release_basis: string | null;
  breach_basis: string | null;
  cancel_basis: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  reserve_required_at: string;
  funding_scheduled_at: string | null;
  funding_in_progress_at: string | null;
  funded_at: string | null;
  shortfall_flagged_at: string | null;
  cure_pending_at: string | null;
  drawdown_authorized_at: string | null;
  drawn_at: string | null;
  release_requested_at: string | null;
  released_at: string | null;
  breached_at: string | null;
  cancelled_at: string | null;
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

interface ReserveEvent {
  id: string;
  reserve_account_id: string;
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
  funded_count: number;
  shortfall_count: number;
  drawn_count: number;
  release_count: number;
  breach_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_target_zar: number;
  funded_target_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  reserve_required:    { bg: '#e3e7ec', fg: '#557',    label: 'Reserve required' },
  funding_scheduled:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Funding scheduled' },
  funding_in_progress: { bg: '#fff4d6', fg: '#a06200', label: 'Funding in progress' },
  funded:              { bg: '#d4edda', fg: '#155724', label: 'Funded' },
  shortfall_flagged:   { bg: '#ffe4b5', fg: '#8a4a00', label: 'Shortfall flagged' },
  cure_pending:        { bg: '#ffd9b3', fg: '#8a4a00', label: 'Cure pending' },
  drawdown_authorized: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Drawdown authorised' },
  drawn:               { bg: '#fff4d6', fg: '#a06200', label: 'Drawn' },
  release_requested:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Release requested' },
  released:            { bg: '#d4edda', fg: '#155724', label: 'Released' },
  breached:            { bg: '#f3c0c0', fg: '#5a1818', label: 'Breached' },
  cancelled:           { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  small:    { bg: '#e3e7ec', fg: '#557',    label: 'Small (<R10m)' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium (<R50m)' },
  large:    { bg: '#fff4d6', fg: '#a06200', label: 'Large (<R250m)' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major (<R1bn)' },
  systemic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Systemic (≥R1bn)' },
};

const RESERVE_TYPE_LABEL: Record<string, string> = {
  dsra:        'DSRA',
  mra:         'MRA',
  om_reserve:  'O&M reserve',
  tax_reserve: 'Tax reserve',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',                label: 'Open' },
  { key: 'all',                 label: 'All' },
  { key: 'small',               label: 'Small' },
  { key: 'medium',              label: 'Medium' },
  { key: 'large',               label: 'Large' },
  { key: 'major',               label: 'Major' },
  { key: 'systemic',            label: 'Systemic' },
  { key: 'reserve_required',    label: 'Required' },
  { key: 'funding_scheduled',   label: 'Scheduled' },
  { key: 'funding_in_progress', label: 'Funding' },
  { key: 'funded',              label: 'Funded' },
  { key: 'shortfall_flagged',   label: 'Shortfall' },
  { key: 'cure_pending',        label: 'Cure pending' },
  { key: 'drawdown_authorized', label: 'Draw authorised' },
  { key: 'drawn',               label: 'Drawn' },
  { key: 'release_requested',   label: 'Release req.' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'released',            label: 'Released' },
  { key: 'cancelled',           label: 'Cancelled' },
];

type ActionKind =
  | 'schedule-funding' | 'commence-funding' | 'confirm-funding' | 'flag-shortfall'
  | 'open-cure' | 'authorize-drawdown' | 'execute-drawdown' | 'replenish-reserve'
  | 'waive-requirement' | 'declare-breach' | 'request-release' | 'release-reserve'
  | 'cancel-reserve';

// Allowed actions per state, primary forward action first. Mirrors the spec
// TRANSITIONS map so the UI never offers an invalid step.
const ALLOWED_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  reserve_required:    ['schedule-funding', 'cancel-reserve'],
  funding_scheduled:   ['commence-funding', 'cancel-reserve'],
  funding_in_progress: ['confirm-funding', 'cancel-reserve'],
  funded:              ['flag-shortfall', 'authorize-drawdown', 'request-release'],
  shortfall_flagged:   ['open-cure', 'authorize-drawdown'],
  cure_pending:        ['replenish-reserve', 'waive-requirement', 'declare-breach'],
  drawdown_authorized: ['execute-drawdown'],
  drawn:               ['replenish-reserve', 'waive-requirement', 'declare-breach'],
  release_requested:   ['release-reserve'],
  released:            [],
  breached:            [],
  cancelled:           [],
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'schedule-funding':   'Schedule funding (lender)',
  'commence-funding':   'Commence funding (borrower)',
  'confirm-funding':    'Confirm funded (account bank)',
  'flag-shortfall':     'Flag shortfall (lender)',
  'open-cure':          'Open cure period (lender)',
  'authorize-drawdown': 'Authorise drawdown (lender)',
  'execute-drawdown':   'Execute drawdown (account bank)',
  'replenish-reserve':  'Replenish reserve (borrower)',
  'waive-requirement':  'Waive requirement (lender)',
  'declare-breach':     'Declare breach — event of default (lender)',
  'request-release':    'Request release (borrower)',
  'release-reserve':    'Release reserve (account bank)',
  'cancel-reserve':     'Cancel reserve (lender)',
};

const ACTION_TONE: Record<ActionKind, 'primary' | 'danger' | 'warn' | 'good' | 'muted'> = {
  'schedule-funding':   'primary',
  'commence-funding':   'primary',
  'confirm-funding':    'good',
  'flag-shortfall':     'warn',
  'open-cure':          'warn',
  'authorize-drawdown': 'warn',
  'execute-drawdown':   'warn',
  'replenish-reserve':  'good',
  'waive-requirement':  'muted',
  'declare-breach':     'danger',
  'request-release':    'primary',
  'release-reserve':    'good',
  'cancel-reserve':     'muted',
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

const TERMINAL_STATES: ChainStatus[] = ['released', 'breached', 'cancelled'];

export function ReserveAccountChainTab() {
  const [rows, setRows] = useState<ReserveRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<ReserveRow | null>(null);
  const [events, setEvents] = useState<ReserveEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ReserveRow[] } & KpiSummary }>('/reserve-account/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, funded_count: d.funded_count,
          shortfall_count: d.shortfall_count, drawn_count: d.drawn_count,
          release_count: d.release_count, breach_count: d.breach_count,
          cancelled_count: d.cancelled_count, breached: d.breached,
          reportable_total: d.reportable_total, large_open: d.large_open,
          total_target_zar: d.total_target_zar, funded_target_zar: d.funded_target_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reserve-account cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ReserveRow; events: ReserveEvent[] } }>(
        `/reserve-account/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reserve history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'open')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'small' || filter === 'medium' || filter === 'large' || filter === 'major' || filter === 'systemic') {
        return r.reserve_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ReserveRow) => {
    try {
      let body: Record<string, string | number | boolean> = {};
      if (action === 'schedule-funding') {
        const basis = window.prompt('Funding basis — the funding instruction (cash deposit / LC issuance against the target balance):');
        if (!basis) return;
        const mode = window.prompt('Funding mode (cash / letter_of_credit / hybrid):', row.funding_mode ?? 'cash') || '';
        const bank = window.prompt('Account bank holding the controlled account:', row.account_bank ?? '') || '';
        const test = window.prompt('Next test date (YYYY-MM-DD):', row.next_test_date ?? '') || '';
        body = { funding_basis: basis };
        if (mode) body.funding_mode = mode;
        if (bank) body.account_bank = bank;
        if (test) body.next_test_date = test;
      } else if (action === 'commence-funding') {
        const basis = window.prompt('Funding basis — the borrower commencing the cash transfer / LC delivery:');
        if (!basis) return;
        const ref = window.prompt('Funding reference (e.g. FUND-2026-0011):') || '';
        const acct = window.prompt('Reserve account number:', row.account_number ?? '') || '';
        body = { funding_basis: basis };
        if (ref) body.funding_ref = ref;
        if (acct) body.account_number = acct;
      } else if (action === 'confirm-funding') {
        const basis = window.prompt('Funding basis — the account bank confirming the target balance is met:');
        if (!basis) return;
        const bal = window.prompt('Confirmed current balance (ZAR):', String(row.current_balance_zar ?? row.target_amount_zar ?? ''));
        const test = window.prompt('Next test date (YYYY-MM-DD):', row.next_test_date ?? '') || '';
        body = { funding_basis: basis };
        if (bal && !Number.isNaN(Number(bal))) body.current_balance_zar = Number(bal);
        if (test) body.next_test_date = test;
      } else if (action === 'flag-shortfall') {
        const basis = window.prompt('Shortfall basis — the test date showing balance below target:');
        if (!basis) return;
        const reason = window.prompt('Shortfall reason code (lc_lapse / fx_move / missed_sweep / dscr_dip):') || '';
        const amt = window.prompt('Shortfall amount (ZAR):', String(row.shortfall_amount_zar ?? ''));
        const bal = window.prompt('Current balance at test (ZAR):', String(row.current_balance_zar ?? ''));
        body = { shortfall_basis: basis };
        if (reason) body.shortfall_reason_code = reason;
        if (amt && !Number.isNaN(Number(amt))) body.shortfall_amount_zar = Number(amt);
        if (bal && !Number.isNaN(Number(bal))) body.current_balance_zar = Number(bal);
      } else if (action === 'open-cure') {
        const basis = window.prompt('Cure basis — opening the contractual cure window for the shortfall:');
        if (!basis) return;
        const ref = window.prompt('Cure reference (e.g. CURE-2026-0011):') || '';
        const deadline = window.prompt('Cure deadline (YYYY-MM-DD):', row.cure_deadline ?? '') || '';
        body = { cure_basis: basis };
        if (ref) body.cure_ref = ref;
        if (deadline) body.cure_deadline = deadline;
      } else if (action === 'authorize-drawdown') {
        const basis = window.prompt('Drawdown basis — authorising a draw to meet debt service the cashflow could not cover:');
        if (!basis) return;
        const ref = window.prompt('Drawdown reference (e.g. DRAW-2026-0011):') || '';
        body = { drawdown_basis: basis };
        if (ref) body.drawdown_ref = ref;
      } else if (action === 'execute-drawdown') {
        const basis = window.prompt('Drawdown basis — the account bank moving cash out of the reserve:');
        if (!basis) return;
        const amt = window.prompt('Drawn amount (ZAR):', String(row.drawn_amount_zar ?? ''));
        const bal = window.prompt('Post-draw current balance (ZAR):', String(row.current_balance_zar ?? ''));
        body = { drawdown_basis: basis };
        if (amt && !Number.isNaN(Number(amt))) body.drawn_amount_zar = Number(amt);
        if (bal && !Number.isNaN(Number(bal))) body.current_balance_zar = Number(bal);
      } else if (action === 'replenish-reserve') {
        const basis = window.prompt('Replenishment basis — the borrower topping the reserve back to target:');
        if (!basis) return;
        const ref = window.prompt('Replenishment reference (e.g. REPL-2026-0011):') || '';
        const bal = window.prompt('Restored balance (ZAR):', String(row.target_amount_zar ?? ''));
        body = { replenishment_basis: basis };
        if (ref) body.replenishment_ref = ref;
        if (bal && !Number.isNaN(Number(bal))) body.current_balance_zar = Number(bal);
      } else if (action === 'waive-requirement') {
        const basis = window.prompt('Waiver basis — lender forbearance on the shortfall / replenishment requirement:');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. temporary_waiver / step_down / restructure):') || '';
        body = { waiver_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'declare-breach') {
        const basis = window.prompt('Breach basis — failure to cure / replenish inside the window (event of default):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. cure_failed / replenish_failed / abandoned):') || '';
        body = { breach_basis: basis };
        if (reason) body.reason_code = reason;
      } else if (action === 'request-release') {
        const basis = window.prompt('Release basis — maturity / deleveraging / contractual step-down releasing the reserve:');
        if (!basis) return;
        const ref = window.prompt('Release reference (e.g. REL-2026-0011):') || '';
        const due = window.prompt('Release due date (YYYY-MM-DD):', row.release_due_date ?? '') || '';
        body = { release_basis: basis };
        if (ref) body.release_ref = ref;
        if (due) body.release_due_date = due;
      } else if (action === 'release-reserve') {
        const basis = window.prompt('Release basis — the account bank releasing the reserve cash back to the borrower:');
        if (!basis) return;
        const ref = window.prompt('Release reference:', row.release_ref ?? '') || '';
        body = { release_basis: basis };
        if (ref) body.release_ref = ref;
      } else if (action === 'cancel-reserve') {
        const basis = window.prompt('Cancel basis — the reserve obligation falling away before funding (facility cancelled / refinanced):');
        if (!basis) return;
        const reason = window.prompt('Reason code (e.g. facility_cancelled / refinanced / superseded):') || '';
        body = { cancel_basis: basis };
        if (reason) body.reason_code = reason;
      }
      await api.post(`/reserve-account/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Reserve accounts — DSRA / MRA funding, cure & release</h2>
          <p className="text-xs text-[#4a5568]">
            12-state reserve-account lifecycle · a project-finance facility requires the borrower to fund and
            MAINTAIN controlled reserve accounts (Debt Service Reserve Account + Maintenance Reserve Account).
            reserve required → funding scheduled → funding in progress → funded → (monitored) → release requested
            → released. A test date showing balance below target flags a SHORTFALL, which opens a cure window —
            replenished, waived or, on failure, BREACHED (event of default). A legitimate DRAW to meet debt service
            is authorised, executed and then replenished. URGENT SLA: the larger the reserve target, the tighter
            every window; the healthy steady state funded carries no deadline. Single write — the agent / lender
            drives every step; the borrower funds and replenishes, the account bank confirms balances and moves
            cash. The W77 signature — a reserve BREACH crosses to the regulator for EVERY tier; a waiver and an SLA
            breach cross for the large tiers (major + systemic).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Funded" value={kpis?.funded_count ?? 0} tone="ok" />
        <Kpi label="Shortfall" value={kpis?.shortfall_count ?? 0} tone={(kpis?.shortfall_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Drawn" value={kpis?.drawn_count ?? 0} tone={(kpis?.drawn_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Large open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Breached" value={kpis?.breach_count ?? 0} tone={(kpis?.breach_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Released" value={kpis?.release_count ?? 0} tone="ok" />
        <Kpi label="Target value" value={fmtZar(kpis?.total_target_zar ?? 0)} />
        <Kpi label="Funded value" value={fmtZar(kpis?.funded_target_zar ?? 0)} tone="ok" />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Reserve #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Borrower</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Type</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Target</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.reserve_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.reserve_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to the regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.borrower_name}>
                      {r.borrower_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.reserve_type ? (RESERVE_TYPE_LABEL[r.reserve_type] ?? r.reserve_type) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {fmtZar(r.target_amount_zar)}
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No reserve accounts match.</td></tr>
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
  row: ReserveRow;
  events: ReserveEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ReserveRow) => void;
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
              <div className="font-mono text-[12px] text-[#4a5568]">{row.reserve_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.borrower_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.reserve_tier].label}
                {row.reserve_type ? ` · ${RESERVE_TYPE_LABEL[row.reserve_type] ?? row.reserve_type}` : ''}
                {row.funding_mode ? ` · ${row.funding_mode}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.lender_name} (agent) → {row.borrower_name}
                {row.account_bank ? ` · ${row.account_bank}` : ''}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
              {row.facility_ref && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Facility {row.facility_ref}{row.project_id ? ` · ${row.project_id}` : ''}
                </div>
              )}
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
            <Pair label="Tier"                value={TIER_TONE[row.reserve_tier].label} />
            <Pair label="Reserve type"         value={row.reserve_type ? (RESERVE_TYPE_LABEL[row.reserve_type] ?? row.reserve_type) : '—'} />
            <Pair label="Funding mode"         value={row.funding_mode ?? '—'} />
            <Pair label="Target basis"         value={row.target_basis ?? '—'} />
            <Pair label="Target amount"        value={fmtZar(row.target_amount_zar)} />
            <Pair label="Current balance"      value={fmtZar(row.current_balance_zar)} />
            <Pair label="Drawn amount"         value={fmtZar(row.drawn_amount_zar)} />
            <Pair label="Shortfall amount"     value={fmtZar(row.shortfall_amount_zar)} />
            <Pair label="Account bank"         value={row.account_bank ?? '—'} />
            <Pair label="Account number"       value={row.account_number ?? '—'} />
            <Pair label="Currency"             value={row.currency ?? '—'} />
            <Pair label="Shortfall reason"     value={row.shortfall_reason_code ?? '—'} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Funding ref"          value={row.funding_ref ?? '—'} />
            <Pair label="Cure ref"             value={row.cure_ref ?? '—'} />
            <Pair label="Drawdown ref"         value={row.drawdown_ref ?? '—'} />
            <Pair label="Replenishment ref"    value={row.replenishment_ref ?? '—'} />
            <Pair label="Waiver ref"           value={row.waiver_ref ?? '—'} />
            <Pair label="Release ref"          value={row.release_ref ?? '—'} />
            <Pair label="Breach ref"           value={row.breach_ref ?? '—'} />
            <Pair label="Next test date"       value={fmtDate(row.next_test_date)} />
            <Pair label="Cure deadline"        value={fmtDate(row.cure_deadline)} />
            <Pair label="Release due"          value={fmtDate(row.release_due_date)} />
            <Pair label="Reserve required"     value={fmtDate(row.reserve_required_at)} />
            <Pair label="Funding scheduled"    value={fmtDate(row.funding_scheduled_at)} />
            <Pair label="Funding in progress"  value={fmtDate(row.funding_in_progress_at)} />
            <Pair label="Funded"               value={fmtDate(row.funded_at)} />
            <Pair label="Shortfall flagged"    value={fmtDate(row.shortfall_flagged_at)} />
            <Pair label="Cure pending"         value={fmtDate(row.cure_pending_at)} />
            <Pair label="Drawdown authorised"  value={fmtDate(row.drawdown_authorized_at)} />
            <Pair label="Drawn"                value={fmtDate(row.drawn_at)} />
            <Pair label="Release requested"    value={fmtDate(row.release_requested_at)} />
            <Pair label="Released"             value={fmtDate(row.released_at)} />
            <Pair label="Breached"             value={fmtDate(row.breached_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.funding_basis && (
            <BasisBlock label="Funding basis" tone="#1a3a5c" text={row.funding_basis} />
          )}
          {row.shortfall_basis && (
            <BasisBlock label="Shortfall basis" tone="#8a4a00" text={row.shortfall_basis} />
          )}
          {row.cure_basis && (
            <BasisBlock label="Cure basis" tone="#a06200" text={row.cure_basis} />
          )}
          {row.drawdown_basis && (
            <BasisBlock label="Drawdown basis" tone="#8a4a00" text={row.drawdown_basis} />
          )}
          {row.replenishment_basis && (
            <BasisBlock label="Replenishment basis" tone="#155724" text={row.replenishment_basis} />
          )}
          {row.waiver_basis && (
            <BasisBlock label="Waiver basis" tone="#6b1f1f" text={row.waiver_basis} />
          )}
          {row.breach_basis && (
            <BasisBlock label="Breach basis (event of default)" tone="#9b1f1f" text={row.breach_basis} />
          )}
          {row.release_basis && (
            <BasisBlock label="Release basis" tone="#155724" text={row.release_basis} />
          )}
          {row.cancel_basis && (
            <BasisBlock label="Cancel basis" tone="#557" text={row.cancel_basis} />
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
