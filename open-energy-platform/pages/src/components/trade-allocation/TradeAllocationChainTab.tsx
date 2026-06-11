// Wave 76 — Trader Trade Allocation, Give-Up & Confirmation/Affirmation chain.
//
// The post-execution institutional trade-processing lifecycle. When a block trade
// executes on the venue it is the START of a chain, not the end: an asset manager
// ALLOCATES the block across underlying client / sub-accounts; where the executing
// broker is not the clearing broker the trade is GIVEN UP to the clearing broker who
// must ACCEPT it; the executing broker issues a CONFIRMATION; the counterparty AFFIRMS
// it; central matching reconciles the two sides (DTCC/Omgeo CTM-style); a settlement
// instruction is released against standing settlement instructions (SSI); the trade
// SETTLES at the CSD. Any discrepancy at any step is a BREAK that, under CSDR-style
// settlement discipline, is reportable to the regulator.
//
//   executed → allocation_pending → allocated → give_up_pending → give_up_accepted
//     → confirmation_issued → affirmed → matched → settlement_instructed → settled
//   self-cleared (no give-up): allocated → confirmation_issued
//   break: {allocated…settlement_instructed} → break_review → (resolve) → confirmation_issued
//   cancel (before it locks in): {executed…confirmation_issued, break_review} → cancelled
//
// Single write: the trade-processing desk drives every step; counterparties affirm /
// accept give-ups out-of-band. URGENT SLA — the larger the notional, the TIGHTER every
// window (same-day-affirmation discipline). The W76 signature is BREAK-DRIVEN: flagging
// a break crosses to the regulator for EVERY tier; cancel + SLA breach cross for the
// large tiers (large + block) only. Beats DTCC ITP / Omgeo CTM matching, FIX allocation,
// MarkitWire confirmation and Traiana/CME give-up with auto-allocation by standing SSI,
// same-day-affirmation SLAs, real-time break detection and structured break reason codes.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';

interface ModalField { key: string; label: string; placeholder?: string; defaultValue?: string; }
interface PendingAction { action: ActionKind; row: AllocationRow; fields: ModalField[]; }

type ChainStatus =
  | 'executed' | 'allocation_pending' | 'allocated' | 'give_up_pending' | 'give_up_accepted'
  | 'confirmation_issued' | 'affirmed' | 'matched' | 'settlement_instructed' | 'settled'
  | 'break_review' | 'cancelled';

type Tier = 'micro' | 'small' | 'medium' | 'large' | 'block';

interface AllocationRow {
  [key: string]: unknown;
  id: string;
  allocation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trade_ref: string | null;
  order_ref: string | null;
  executing_party: string;
  clearing_party: string | null;
  counterparty_name: string;
  block_account: string | null;
  instrument: string | null;
  energy_type: string | null;
  side: string | null;
  quantity: number | null;
  price: number | null;
  notional_zar: number;
  allocation_legs: number | null;
  notional_tier: Tier;
  settlement_date: string | null;
  ssi_ref: string | null;
  csd_ref: string | null;
  break_reason_code: string | null;
  allocation_ref: string | null;
  give_up_ref: string | null;
  confirmation_ref: string | null;
  affirmation_ref: string | null;
  match_ref: string | null;
  settlement_instruction_ref: string | null;
  break_ref: string | null;
  cancel_ref: string | null;
  allocation_basis: string | null;
  give_up_basis: string | null;
  confirmation_basis: string | null;
  affirmation_basis: string | null;
  match_basis: string | null;
  settlement_basis: string | null;
  break_basis: string | null;
  resolution_basis: string | null;
  cancel_basis: string | null;
  reason_code: string | null;
  chain_status: ChainStatus;
  executed_at: string;
  allocation_pending_at: string | null;
  allocated_at: string | null;
  give_up_pending_at: string | null;
  give_up_accepted_at: string | null;
  confirmation_issued_at: string | null;
  affirmed_at: string | null;
  matched_at: string | null;
  settlement_instructed_at: string | null;
  settled_at: string | null;
  break_review_at: string | null;
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

interface AllocationEvent {
  id: string;
  allocation_id: string;
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
  settled_count: number;
  break_count: number;
  cancelled_count: number;
  affirmed_count: number;
  breached: number;
  reportable_total: number;
  large_open: number;
  total_notional_zar: number;
  settled_notional_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  executed:              { bg: '#e3e7ec', fg: '#557',    label: 'Executed' },
  allocation_pending:    { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Allocation pending' },
  allocated:             { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Allocated' },
  give_up_pending:       { bg: '#fff4d6', fg: '#a06200', label: 'Give-up pending' },
  give_up_accepted:      { bg: '#e4f0ff', fg: 'oklch(0.46 0.16 55)', label: 'Give-up accepted' },
  confirmation_issued:   { bg: '#ffe9d6', fg: '#8a4a00', label: 'Confirmation issued' },
  affirmed:              { bg: '#e4f0ff', fg: 'oklch(0.46 0.16 55)', label: 'Affirmed' },
  matched:               { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Matched' },
  settlement_instructed: { bg: '#fff4d6', fg: '#a06200', label: 'Settlement instructed' },
  settled:               { bg: '#d4edda', fg: '#155724', label: 'Settled' },
  break_review:          { bg: '#fdd0d0', fg: '#7a1010', label: 'Break review' },
  cancelled:             { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  micro:  { bg: '#e3e7ec', fg: '#557',    label: 'Micro (<R1m)' },
  small:  { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Small (<R10m)' },
  medium: { bg: '#fff4d6', fg: '#a06200', label: 'Medium (<R50m)' },
  large:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Large (<R250m)' },
  block:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'Block (≥R250m)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'micro',                 label: 'Micro' },
  { key: 'small',                 label: 'Small' },
  { key: 'medium',                label: 'Medium' },
  { key: 'large',                 label: 'Large' },
  { key: 'block',                 label: 'Block' },
  { key: 'allocation_pending',    label: 'Allocation pending' },
  { key: 'allocated',             label: 'Allocated' },
  { key: 'give_up_pending',       label: 'Give-up pending' },
  { key: 'confirmation_issued',   label: 'Confirmation issued' },
  { key: 'affirmed',              label: 'Affirmed' },
  { key: 'settlement_instructed', label: 'Settlement instructed' },
  { key: 'break_review',          label: 'Break review' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'settled',               label: 'Settled' },
  { key: 'cancelled',             label: 'Cancelled' },
];

type ActionKind =
  | 'prepare-allocation' | 'allocate-block' | 'designate-give-up' | 'accept-give-up'
  | 'issue-confirmation' | 'affirm-confirmation' | 'match-trade' | 'instruct-settlement'
  | 'settle-trade' | 'flag-break' | 'resolve-break' | 'cancel-trade';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  executed:              'prepare-allocation',
  allocation_pending:    'allocate-block',
  allocated:             'issue-confirmation',
  give_up_pending:       'accept-give-up',
  give_up_accepted:      'issue-confirmation',
  confirmation_issued:   'affirm-confirmation',
  affirmed:              'match-trade',
  matched:               'instruct-settlement',
  settlement_instructed: 'settle-trade',
  settled:               null,
  break_review:          'resolve-break',
  cancelled:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'prepare-allocation':  'Prepare allocation (middle office)',
  'allocate-block':      'Allocate block to sub-accounts (middle office)',
  'designate-give-up':   'Designate give-up to clearing broker (middle office)',
  'accept-give-up':      'Accept give-up (counterparty)',
  'issue-confirmation':  'Issue confirmation (middle office)',
  'affirm-confirmation': 'Affirm confirmation (counterparty)',
  'match-trade':         'Match trade — central matching (middle office)',
  'instruct-settlement': 'Release settlement instruction (middle office)',
  'settle-trade':        'Settle at CSD (middle office)',
  'flag-break':          'Flag break (settlement discipline)',
  'resolve-break':       'Resolve break (middle office)',
  'cancel-trade':        'Cancel trade (front office)',
};

// flag_break is reachable from these processing states (matches the spec TRANSITIONS).
const BREAKABLE_STATES: ChainStatus[] = [
  'allocated', 'give_up_pending', 'give_up_accepted', 'confirmation_issued',
  'affirmed', 'matched', 'settlement_instructed',
];
// cancel is reachable from these pre-lock-in states (NOT after affirmed).
const CANCELLABLE_STATES: ChainStatus[] = [
  'executed', 'allocation_pending', 'allocated', 'give_up_pending', 'give_up_accepted',
  'confirmation_issued', 'break_review',
];
const TERMINAL_STATES: ChainStatus[] = ['settled', 'cancelled'];

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
  if (Math.abs(n) >= 1000) return `R${(n / 1000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

export function TradeAllocationChainTab() {
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<AllocationRow | null>(null);
  const [events, setEvents] = useState<AllocationEvent[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: AllocationRow[] } & KpiSummary }>('/trade-allocation/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, settled_count: d.settled_count,
          break_count: d.break_count, cancelled_count: d.cancelled_count,
          affirmed_count: d.affirmed_count, breached: d.breached,
          reportable_total: d.reportable_total, large_open: d.large_open,
          total_notional_zar: d.total_notional_zar, settled_notional_zar: d.settled_notional_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load trade allocations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: AllocationRow; events: AllocationEvent[] } }>(
        `/trade-allocation/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load allocation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'micro' || filter === 'small' || filter === 'medium' || filter === 'large' || filter === 'block') {
        return r.notional_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const ACTION_FIELDS: Record<ActionKind, ModalField[]> = useMemo(() => ({
    'prepare-allocation': [
      { key: 'allocation_basis', label: 'Allocation basis', placeholder: 'Pro-rata / average-price scheme used to split the block' },
      { key: 'allocation_ref',   label: 'Allocation reference', placeholder: 'e.g. ALLOC-2026-0007' },
      { key: 'block_account',    label: 'Block account (pre-allocation)', placeholder: '' },
    ],
    'allocate-block': [
      { key: 'allocation_basis', label: 'Allocation basis', placeholder: 'Confirm the per-sub-account allocation' },
      { key: 'allocation_legs',  label: 'Sub-account legs (number)', placeholder: '' },
      { key: 'allocation_ref',   label: 'Allocation reference', placeholder: 'e.g. ALLOC-2026-0007' },
    ],
    'designate-give-up': [
      { key: 'give_up_basis',  label: 'Give-up basis', placeholder: 'Executing broker is not the clearing broker; give up to clearer' },
      { key: 'clearing_party', label: 'Clearing party (give-up target)', placeholder: '' },
      { key: 'give_up_ref',    label: 'Give-up reference', placeholder: 'e.g. GU-2026-0007' },
    ],
    'accept-give-up': [
      { key: 'give_up_basis', label: 'Give-up acceptance basis', placeholder: 'Clearing broker accepts the give-up' },
    ],
    'issue-confirmation': [
      { key: 'confirmation_basis', label: 'Confirmation basis', placeholder: 'Executing broker issues the trade confirmation' },
      { key: 'confirmation_ref',   label: 'Confirmation reference', placeholder: 'e.g. CONF-2026-0007' },
    ],
    'affirm-confirmation': [
      { key: 'affirmation_basis', label: 'Affirmation basis', placeholder: 'Counterparty affirms the confirmation (same-day discipline)' },
      { key: 'affirmation_ref',   label: 'Affirmation reference', placeholder: 'e.g. AFF-2026-0007' },
    ],
    'match-trade': [
      { key: 'match_basis', label: 'Match basis', placeholder: 'Central matching reconciles both sides (DTCC/Omgeo CTM-style)' },
      { key: 'match_ref',   label: 'Match reference', placeholder: 'e.g. MATCH-2026-0007' },
    ],
    'instruct-settlement': [
      { key: 'settlement_basis',           label: 'Settlement-instruction basis', placeholder: 'Release the instruction against the SSI' },
      { key: 'ssi_ref',                    label: 'SSI reference (standing settlement instruction)', placeholder: '' },
      { key: 'settlement_instruction_ref', label: 'Settlement-instruction reference', placeholder: 'e.g. SI-2026-0007' },
      { key: 'settlement_date',            label: 'Settlement date (YYYY-MM-DD)', placeholder: '' },
    ],
    'settle-trade': [
      { key: 'settlement_basis', label: 'Settlement basis', placeholder: 'Trade settles at the CSD (final DvP)' },
      { key: 'csd_ref',          label: 'CSD / settlement reference', placeholder: 'e.g. CSD-2026-0007' },
    ],
    'flag-break': [
      { key: 'break_basis',       label: 'Break basis', placeholder: 'A discrepancy was detected; reportable for every tier under settlement discipline' },
      { key: 'break_reason_code', label: 'Break reason code', placeholder: 'e.g. economics_mismatch / ssi_mismatch / quantity_break', defaultValue: 'economics_mismatch' },
      { key: 'break_ref',         label: 'Break reference', placeholder: 'e.g. BRK-2026-0007' },
    ],
    'resolve-break': [
      { key: 'resolution_basis',  label: 'Resolution basis', placeholder: 'The break is reasoned and resolved; re-issue the confirmation' },
      { key: 'confirmation_ref',  label: 'Re-issued confirmation reference', placeholder: 'e.g. CONF-2026-0007R' },
    ],
    'cancel-trade': [
      { key: 'cancel_basis', label: 'Cancellation basis', placeholder: 'Pull the trade before it locks in (large tiers cross to regulator)' },
      { key: 'reason_code',  label: 'Reason code', placeholder: 'e.g. erroneous_trade / counterparty_dispute', defaultValue: 'erroneous_trade' },
      { key: 'cancel_ref',   label: 'Cancellation reference', placeholder: 'e.g. CXL-2026-0007' },
    ],
  }), []);

  const act = useCallback((action: ActionKind, row: AllocationRow) => {
    setPendingAction({ action, row, fields: ACTION_FIELDS[action] });
  }, [ACTION_FIELDS]);

  const confirmAction = useCallback(async (values: Record<string, string>) => {
    if (!pendingAction) return;
    const { action, row } = pendingAction;
    setPendingAction(null);
    try {
      const body: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(values)) {
        if (!v) continue;
        if (k === 'allocation_legs' && !Number.isNaN(Number(v))) { body[k] = Number(v); }
        else { body[k] = v; }
      }
      // flag-break mirrors break_reason_code → reason_code
      if (action === 'flag-break' && values.break_reason_code) body.reason_code = values.break_reason_code;
      await api.post(`/trade-allocation/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [pendingAction, load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Trade allocation, give-up &amp; confirmation/affirmation</h2>
          <p className="text-xs text-[#4a5568]">
            12-state post-execution institutional trade-processing chain — the leg that turns one executed block
            into per-account settled positions. executed → allocation pending → allocated → give-up pending →
            give-up accepted → confirmation issued → affirmed → matched → settlement instructed → settled, with a
            self-cleared shortcut (allocated → confirmation issued), a break-review loop under CSDR-style settlement
            discipline, and a cancel-before-lock-in exit. Single write: the trade-processing desk drives every step;
            counterparties affirm confirmations and accept give-ups out-of-band. Beats DTCC ITP / Omgeo CTM matching,
            FIX allocation, MarkitWire confirmation and Traiana/CME give-up with auto-allocation by standing SSI,
            same-day-affirmation SLAs, real-time break detection and structured break reason codes. URGENT SLA: the
            larger the notional, the TIGHTER every window. The W76 signature is break-driven — flagging a break
            crosses to the regulator for EVERY tier; cancellation and SLA breaches cross for the large tiers
            (large + block) only.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Affirmed" value={kpis?.affirmed_count ?? 0} />
        <Kpi label="In break" value={kpis?.break_count ?? 0} tone={(kpis?.break_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Large open" value={kpis?.large_open ?? 0} tone={(kpis?.large_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Settled" value={kpis?.settled_count ?? 0} tone="ok" />
        <Kpi label="Cancelled" value={kpis?.cancelled_count ?? 0} tone={(kpis?.cancelled_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Notional in chain" value={fmtZar(kpis?.total_notional_zar ?? 0)} />
        <Kpi label="Settled notional" value={fmtZar(kpis?.settled_notional_zar ?? 0)} tone="ok" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Allocation #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Counterparty</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Instrument</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Notional</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.notional_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.allocation_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to the regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[180px] truncate" title={r.counterparty_name}>
                      {r.counterparty_name}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.instrument ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'oklch(0.46 0.16 55)' }}>{fmtZar(r.notional_zar)}</td>
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No allocations match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
      {pendingAction && (
        <ActionModal
          title={ACTION_LABEL[pendingAction.action]}
          fields={pendingAction.fields}
          row={pendingAction.row}
          onConfirm={confirmAction}
          onCancel={() => setPendingAction(null)}
        />
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
  row: AllocationRow;
  events: AllocationEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: AllocationRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canGiveUp = row.chain_status === 'allocated';
  const canBreak = BREAKABLE_STATES.includes(row.chain_status);
  const canCancel = CANCELLABLE_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.allocation_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.counterparty_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.notional_tier].label} · {fmtZar(row.notional_zar)}
                {row.instrument ? ` · ${row.instrument}` : ''}
                {row.side ? ` · ${row.side}` : ''}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">
                {row.executing_party ? `Exec ${row.executing_party}` : ''}
                {row.clearing_party ? ` · clear ${row.clearing_party}` : ''}
                {row.allocation_legs != null ? ` · ${row.allocation_legs} legs` : ''}
                {row.escalation_level > 0 ? ` · escalation lvl ${row.escalation_level}` : ''}
              </div>
              {(row.trade_ref || row.order_ref || row.source_wave) && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  {row.trade_ref ? `Trade ${row.trade_ref}` : ''}
                  {row.order_ref ? ` · order ${row.order_ref}` : ''}
                  {row.source_wave ? ` · from ${row.source_wave}` : ''}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"               value={TIER_TONE[row.notional_tier].label} />
            <Pair label="Notional"           value={fmtZar(row.notional_zar)} />
            <Pair label="Quantity"           value={row.quantity != null ? String(row.quantity) : '—'} />
            <Pair label="Price"              value={row.price != null ? String(row.price) : '—'} />
            <Pair label="Side"               value={row.side ?? '—'} />
            <Pair label="Instrument"         value={row.instrument ?? '—'} />
            <Pair label="Energy type"        value={row.energy_type ?? '—'} />
            <Pair label="Executing party"    value={row.executing_party} />
            <Pair label="Clearing party"     value={row.clearing_party ?? '—'} />
            <Pair label="Block account"      value={row.block_account ?? '—'} />
            <Pair label="Allocation legs"    value={row.allocation_legs != null ? String(row.allocation_legs) : '—'} />
            <Pair label="Allocation ref"     value={row.allocation_ref ?? '—'} />
            <Pair label="Give-up ref"        value={row.give_up_ref ?? '—'} />
            <Pair label="Confirmation ref"   value={row.confirmation_ref ?? '—'} />
            <Pair label="Affirmation ref"    value={row.affirmation_ref ?? '—'} />
            <Pair label="Match ref"          value={row.match_ref ?? '—'} />
            <Pair label="Settlement instr ref" value={row.settlement_instruction_ref ?? '—'} />
            <Pair label="SSI ref"            value={row.ssi_ref ?? '—'} />
            <Pair label="CSD ref"            value={row.csd_ref ?? '—'} />
            <Pair label="Settlement date"    value={row.settlement_date ?? '—'} />
            <Pair label="Break ref"          value={row.break_ref ?? '—'} />
            <Pair label="Break reason code"  value={row.break_reason_code ?? '—'} />
            <Pair label="Cancel ref"         value={row.cancel_ref ?? '—'} />
            <Pair label="Reason code"        value={row.reason_code ?? '—'} />
            <Pair label="Executed"           value={fmtDate(row.executed_at)} />
            <Pair label="Allocation pending" value={fmtDate(row.allocation_pending_at)} />
            <Pair label="Allocated"          value={fmtDate(row.allocated_at)} />
            <Pair label="Give-up pending"    value={fmtDate(row.give_up_pending_at)} />
            <Pair label="Give-up accepted"   value={fmtDate(row.give_up_accepted_at)} />
            <Pair label="Confirmation issued" value={fmtDate(row.confirmation_issued_at)} />
            <Pair label="Affirmed"           value={fmtDate(row.affirmed_at)} />
            <Pair label="Matched"            value={fmtDate(row.matched_at)} />
            <Pair label="Settlement instructed" value={fmtDate(row.settlement_instructed_at)} />
            <Pair label="Settled"            value={fmtDate(row.settled_at)} />
            <Pair label="Break review"       value={fmtDate(row.break_review_at)} />
            <Pair label="Cancelled"          value={fmtDate(row.cancelled_at)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Reportable"         value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.allocation_basis && (
            <BasisBlock label="Allocation basis (middle office)" tone="oklch(0.46 0.16 55)" text={row.allocation_basis} />
          )}
          {row.give_up_basis && (
            <BasisBlock label="Give-up basis" tone="#a06200" text={row.give_up_basis} />
          )}
          {row.confirmation_basis && (
            <BasisBlock label="Confirmation basis" tone="#8a4a00" text={row.confirmation_basis} />
          )}
          {row.affirmation_basis && (
            <BasisBlock label="Affirmation basis (counterparty)" tone="oklch(0.46 0.16 55)" text={row.affirmation_basis} />
          )}
          {row.match_basis && (
            <BasisBlock label="Match basis" tone="oklch(0.46 0.16 55)" text={row.match_basis} />
          )}
          {row.settlement_basis && (
            <BasisBlock label="Settlement basis" tone="#155724" text={row.settlement_basis} />
          )}
          {row.break_basis && (
            <BasisBlock label="Break basis" tone="#7a1010" text={row.break_basis} />
          )}
          {row.resolution_basis && (
            <BasisBlock label="Resolution basis" tone="#155724" text={row.resolution_basis} />
          )}
          {row.cancel_basis && (
            <BasisBlock label="Cancellation basis" tone="#6b1f1f" text={row.cancel_basis} />
          )}
        </section>

        {(nextAction || canGiveUp || canBreak || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canGiveUp && (
                <button type="button"
                  onClick={() => onAct('designate-give-up', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#a06200] hover:bg-[#fff4d6]"
                >
                  {ACTION_LABEL['designate-give-up']}
                </button>
              )}
              {canBreak && (
                <button type="button"
                  onClick={() => onAct('flag-break', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['flag-break']}
                </button>
              )}
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel-trade', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL['cancel-trade']}
                </button>
              )}
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
                  {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
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

function ActionModal({
  title, fields, row, onConfirm, onCancel,
}: {
  title: string;
  fields: ModalField[];
  row: AllocationRow;
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const defaultValues = Object.fromEntries(
    fields.map((f) => [f.key, f.defaultValue ?? (row[f.key] != null ? String(row[f.key]) : '')])
  );
  const [vals, setVals] = useState<Record<string, string>>(defaultValues);
  const firstRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center" onClick={onCancel}>
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="text-sm font-semibold text-[#0c2a4d]">{title}</div>
        </header>
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {fields.map((f, i) => (
            <div key={f.key}>
              <label className="block text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">{f.label}</label>
              <textarea
                ref={i === 0 ? firstRef : undefined}
                rows={i === 0 ? 3 : 1}
                className="w-full rounded border border-[#d8dde6] px-2 py-1 text-[12px] text-[#0c2a4d] resize-none focus:outline-none focus:border-[#c2873a]"
                placeholder={f.placeholder}
                value={vals[f.key] ?? ''}
                onChange={(e) => setVals((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <footer className="border-t border-[#d8dde6] px-5 py-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] text-[#4a5568] hover:bg-[#f3f5f9]">
            Cancel
          </button>
          <button type="button"
            onClick={() => onConfirm(vals)}
            className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#b07530]">
            Confirm
          </button>
        </footer>
      </div>
    </div>
  );
}
