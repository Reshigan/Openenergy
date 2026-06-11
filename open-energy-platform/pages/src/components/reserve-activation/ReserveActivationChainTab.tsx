// Wave 50 — Grid Ancillary Services Reserve Activation & Settlement tab.
//
// NERSA SA Grid Code + System Operation Code. 12-state P6 lifecycle for every
// formal reserve ACTIVATION the System Operator dispatches during a frequency /
// contingency event: the SO instructs a contracted reserve provider, the
// provider responds, the SO measures delivered response against the instruction,
// and the event is settled (utilisation + availability payment, or a
// non-performance penalty).
//
//   activation_issued → acknowledged → ramping → sustaining → released →
//     performance_review → verified → settled.
//   Non-performance: flag (ramping|sustaining|performance_review) → non_performance → settle_penalty → settled.
//   Dispute:         raise (performance_review|verified|non_performance) → disputed → resolve → dispute_resolved.
//   Early exit:      withdraw (activation_issued|acknowledged|ramping) → withdrawn.
//
// URGENT SLA — the faster the reserve product, the tighter the response window.
// Two-party write: the provider acknowledges / ramps / sustains / disputes; the
// SO drives release / review / verify / settle / penalty / withdraw.
// Reportability: a non-performance on a security tier (instantaneous / regulating
// / ten_minute), a dispute resolution on a critical tier (instantaneous /
// regulating) and a critical-tier SLA breach cross the regulator inbox.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'activation_issued' | 'acknowledged' | 'ramping' | 'sustaining' | 'released'
  | 'performance_review' | 'verified' | 'settled' | 'non_performance' | 'disputed'
  | 'dispute_resolved' | 'withdrawn';

type ReserveTier =
  | 'instantaneous_reserve' | 'regulating_reserve' | 'ten_minute_reserve'
  | 'supplemental_reserve' | 'emergency_reserve';

interface ActivationRow {
  [key: string]: unknown;
  id: string;
  activation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  so_party_id: string;
  so_party_name: string;
  provider_party_id: string;
  provider_party_name: string;
  reserve_tier: ReserveTier;
  provider_type: string;
  service_name: string;
  contract_ref: string | null;
  trigger_type: string | null;
  instructed_mw: number | null;
  delivered_mw: number | null;
  response_time_seconds: number | null;
  actual_response_seconds: number | null;
  frequency_hz_at_event: number | null;
  availability_payment_zar: number | null;
  utilisation_payment_zar: number | null;
  penalty_zar: number | null;
  instruction_ref: string | null;
  acknowledgement_ref: string | null;
  ramp_ref: string | null;
  delivery_ref: string | null;
  release_ref: string | null;
  review_ref: string | null;
  verification_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  regulator_ref: string | null;
  instruction_basis: string | null;
  response_basis: string | null;
  performance_basis: string | null;
  settlement_basis: string | null;
  non_performance_basis: string | null;
  dispute_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: ChainStatus;
  activation_issued_at: string;
  acknowledged_at: string | null;
  ramping_at: string | null;
  sustaining_at: string | null;
  released_at: string | null;
  performance_review_at: string | null;
  verified_at: string | null;
  settled_at: string | null;
  non_performance_at: string | null;
  disputed_at: string | null;
  dispute_resolved_at: string | null;
  withdrawn_at: string | null;
  is_reportable: boolean;
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
  breach_crosses_regulator?: boolean;
}

interface ActivationEvent {
  id: string;
  activation_id: string;
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
  non_performance_count: number;
  disputed_count: number;
  dispute_resolved_count: number;
  withdrawn_count: number;
  verified_count: number;
  in_review: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  total_instructed_mw: number;
  total_delivered_mw: number;
  total_availability_payment_zar: number;
  total_utilisation_payment_zar: number;
  total_penalty_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  activation_issued:  { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Activation issued' },
  acknowledged:       { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Acknowledged' },
  ramping:            { bg: '#fff4d6', fg: '#a06200', label: 'Ramping' },
  sustaining:         { bg: '#fff4d6', fg: '#a06200', label: 'Sustaining' },
  released:           { bg: '#e3e7ec', fg: '#557',    label: 'Released' },
  performance_review: { bg: '#ffe9d6', fg: '#8a4a00', label: 'Performance review' },
  verified:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Verified' },
  settled:            { bg: '#d4edda', fg: '#155724', label: 'Settled' },
  non_performance:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Non-performance' },
  disputed:           { bg: '#ffe9d6', fg: '#8a4a00', label: 'Disputed' },
  dispute_resolved:   { bg: '#d4edda', fg: '#155724', label: 'Dispute resolved' },
  withdrawn:          { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<ReserveTier, { bg: string; fg: string; label: string }> = {
  instantaneous_reserve: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Instantaneous' },
  regulating_reserve:    { bg: '#ffd9c2', fg: '#9b3a00', label: 'Regulating' },
  ten_minute_reserve:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Ten-minute' },
  supplemental_reserve:  { bg: '#fff4d6', fg: '#a06200', label: 'Supplemental' },
  emergency_reserve:     { bg: '#e3e7ec', fg: '#557',    label: 'Emergency' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'critical',               label: 'Critical tiers' },
  { key: 'instantaneous_reserve',  label: 'Instantaneous' },
  { key: 'regulating_reserve',     label: 'Regulating' },
  { key: 'ten_minute_reserve',     label: 'Ten-minute' },
  { key: 'supplemental_reserve',   label: 'Supplemental' },
  { key: 'emergency_reserve',      label: 'Emergency' },
  { key: 'in_review',              label: 'In review' },
  { key: 'settled',                label: 'Settled' },
  { key: 'non_performance',        label: 'Non-performance' },
  { key: 'disputed',               label: 'Disputed' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'reportable',             label: 'Reportable' },
  { key: 'activation_issued',      label: 'Issued' },
  { key: 'acknowledged',           label: 'Acknowledged' },
  { key: 'ramping',                label: 'Ramping' },
  { key: 'sustaining',             label: 'Sustaining' },
  { key: 'released',               label: 'Released' },
  { key: 'verified',               label: 'Verified' },
  { key: 'withdrawn',              label: 'Withdrawn' },
];

type ActionKind =
  | 'acknowledge' | 'begin-ramp' | 'confirm-sustaining' | 'release-instruction'
  | 'open-review' | 'verify-performance' | 'settle' | 'settle-penalty'
  | 'flag-non-performance' | 'raise-dispute' | 'resolve-dispute' | 'withdraw-instruction';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  activation_issued:  'acknowledge',
  acknowledged:       'begin-ramp',
  ramping:            'confirm-sustaining',
  sustaining:         'release-instruction',
  released:           'open-review',
  performance_review: 'verify-performance',
  verified:           'settle',
  non_performance:    'settle-penalty',
  disputed:           'resolve-dispute',
  settled:            null,
  dispute_resolved:   null,
  withdrawn:          null,
};

// Functional party per action. The reserve PROVIDER acknowledges, ramps, sustains
// and disputes; the SYSTEM OPERATOR drives release / review / verify / settle /
// penalty / withdraw.
const ACTION_LABEL: Record<ActionKind, string> = {
  'acknowledge':          'Acknowledge instruction (provider)',
  'begin-ramp':           'Begin ramp (provider)',
  'confirm-sustaining':   'Confirm sustaining (provider)',
  'release-instruction':  'Release instruction (SO)',
  'open-review':          'Open performance review (SO)',
  'verify-performance':   'Verify performance (SO)',
  'settle':               'Settle (SO)',
  'settle-penalty':       'Settle with penalty (SO)',
  'flag-non-performance': 'Flag non-performance (SO)',
  'raise-dispute':        'Raise settlement dispute (provider)',
  'resolve-dispute':      'Resolve dispute (SO)',
  'withdraw-instruction': 'Withdraw instruction (SO)',
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

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')} MW`;
}

function fmtZar(n: number | null | undefined): string {
  if (!n) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtSeconds(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 60) return `${Math.round(n / 60)} min`;
  return `${n}s`;
}

const TERMINAL_STATES: ChainStatus[] = ['settled', 'dispute_resolved', 'withdrawn'];
const CRITICAL_TIERS: ReserveTier[] = ['instantaneous_reserve', 'regulating_reserve'];
const FLAGGABLE_STATES: ChainStatus[] = ['ramping', 'sustaining', 'performance_review'];
const DISPUTABLE_STATES: ChainStatus[] = ['performance_review', 'verified', 'non_performance'];
const WITHDRAWABLE_STATES: ChainStatus[] = ['activation_issued', 'acknowledged', 'ramping'];

export function ReserveActivationChainTab() {
  const [rows, setRows] = useState<ActivationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ActivationRow | null>(null);
  const [events, setEvents] = useState<ActivationEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ActivationRow[] } & KpiSummary }>('/reserve-activation/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, settled_count: d.settled_count,
          non_performance_count: d.non_performance_count, disputed_count: d.disputed_count,
          dispute_resolved_count: d.dispute_resolved_count, withdrawn_count: d.withdrawn_count,
          verified_count: d.verified_count, in_review: d.in_review, breached: d.breached,
          reportable_total: d.reportable_total, critical_open: d.critical_open,
          total_instructed_mw: d.total_instructed_mw, total_delivered_mw: d.total_delivered_mw,
          total_availability_payment_zar: d.total_availability_payment_zar,
          total_utilisation_payment_zar: d.total_utilisation_payment_zar,
          total_penalty_zar: d.total_penalty_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reserve activations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: ActivationRow; events: ActivationEvent[] } }>(
        `/reserve-activation/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load activation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'critical')   return CRITICAL_TIERS.includes(r.reserve_tier);
      if (filter === 'in_review')  return r.chain_status === 'performance_review';
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter.endsWith('_reserve')) return r.reserve_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: ActivationRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'acknowledge') {
        const basis = window.prompt('Response basis — provider acknowledges the dispatch instruction and commits to respond:') || '';
        const ref = window.prompt('Acknowledgement reference (e.g. ACK-2026-0007):') || '';
        body = {};
        if (basis) body.response_basis = basis;
        if (ref) body.acknowledgement_ref = ref;
      } else if (action === 'begin-ramp') {
        const ref = window.prompt('Ramp reference — SCADA / telemetry ramp event id (e.g. RAMP-2026-0007):') || '';
        body = {};
        if (ref) body.ramp_ref = ref;
      } else if (action === 'confirm-sustaining') {
        const ref = window.prompt('Delivery reference — telemetry confirming the unit is sustaining instructed output (e.g. DEL-2026-0007):') || '';
        body = {};
        if (ref) body.delivery_ref = ref;
      } else if (action === 'release-instruction') {
        const ref = window.prompt('Release reference — SO stands the reserve down, event over (e.g. REL-2026-0007):') || '';
        body = {};
        if (ref) body.release_ref = ref;
      } else if (action === 'open-review') {
        const delivered = window.prompt('Delivered MW — measured energy actually delivered against the instruction:') || '';
        const seconds = window.prompt('Actual response seconds — measured full-response time:') || '';
        const basis = window.prompt('Performance basis — how delivered response was measured against the contracted product:') || '';
        const ref = window.prompt('Review reference (e.g. REV-2026-0007):') || '';
        body = {};
        if (delivered && !Number.isNaN(Number(delivered))) body.delivered_mw = Number(delivered);
        if (seconds && !Number.isNaN(Number(seconds))) body.actual_response_seconds = Number(seconds);
        if (basis) body.performance_basis = basis;
        if (ref) body.review_ref = ref;
      } else if (action === 'verify-performance') {
        const avail = window.prompt('Availability payment (R) — standing availability fee for the period:') || '';
        const util = window.prompt('Utilisation payment (R) — delivered-energy utilisation payment:') || '';
        const basis = window.prompt('Verification basis — SO confirms delivered response meets the contracted product:');
        if (!basis) return;
        const ref = window.prompt('Verification reference (e.g. VER-2026-0007):') || '';
        body = { performance_basis: basis };
        if (avail && !Number.isNaN(Number(avail))) body.availability_payment_zar = Number(avail);
        if (util && !Number.isNaN(Number(util))) body.utilisation_payment_zar = Number(util);
        if (ref) body.verification_ref = ref;
      } else if (action === 'settle') {
        const basis = window.prompt('Settlement basis — final availability + utilisation settlement against the ancillary-services contract:');
        if (!basis) return;
        const ref = window.prompt('Settlement reference (e.g. SET-2026-0007):') || '';
        body = { settlement_basis: basis };
        if (ref) body.settlement_ref = ref;
      } else if (action === 'settle-penalty') {
        const penalty = window.prompt('Penalty amount (R) — non-performance penalty / clawback:') || '';
        const basis = window.prompt('Settlement basis — penalty settlement for the non-performing activation:');
        if (!basis) return;
        const ref = window.prompt('Settlement reference (e.g. SET-2026-0007):') || '';
        body = { settlement_basis: basis, reason_code: 'non_performance_penalty' };
        if (penalty && !Number.isNaN(Number(penalty))) body.penalty_zar = Number(penalty);
        if (ref) body.settlement_ref = ref;
      } else if (action === 'flag-non-performance') {
        const basis = window.prompt('Non-performance basis — how the provider failed to deliver the instructed reserve (no response, partial MW, slow ramp):');
        if (!basis) return;
        const penalty = window.prompt('Penalty estimate (R) — optional indicative penalty:') || '';
        body = { non_performance_basis: basis, reason_code: 'reserve_non_performance' };
        if (penalty && !Number.isNaN(Number(penalty))) body.penalty_zar = Number(penalty);
      } else if (action === 'raise-dispute') {
        const basis = window.prompt('Dispute basis — why the provider disputes the measured performance or settlement:');
        if (!basis) return;
        const ref = window.prompt('Dispute reference (e.g. DSP-2026-0007):') || '';
        body = { dispute_basis: basis, reason_code: 'settlement_dispute' };
        if (ref) body.dispute_ref = ref;
      } else if (action === 'resolve-dispute') {
        const basis = window.prompt('Resolution basis — how the settlement dispute was resolved:');
        if (!basis) return;
        const ref = window.prompt('Regulator reference (e.g. NERSA-GC-2026-0007):') || '';
        body = { dispute_basis: basis };
        if (ref) body.regulator_ref = ref;
      } else if (action === 'withdraw-instruction') {
        const reason = window.prompt('Withdrawal reason — SO cancelled the instruction before reserve was delivered (false start, event cleared):');
        if (!reason) return;
        body = { reason_code: reason };
      }
      await api.post(`/reserve-activation/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Ancillary services — reserve activation &amp; settlement</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage NERSA Grid Code reserve-activation chain · issued → acknowledged → ramping → sustaining → released →
            performance review → verified → settled. The System Operator instructs a contracted reserve provider during a
            frequency / contingency event; the provider responds; the SO measures delivered response against the
            instruction and settles availability + utilisation — or a non-performance penalty. Pairs with W13 dispatch
            nominations (scheduled energy) and W34 load curtailment (emergency demand reduction); W50 is the supply-side
            reserve-response counterpart. URGENT SLA: the faster the reserve product, the tighter the response window. A
            non-performance on a security tier, a dispute resolution on a critical tier and critical-tier SLA breaches cross
            the regulator inbox (NERSA Grid Code + System Operation Code).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Critical open" value={kpis?.critical_open ?? 0} tone={(kpis?.critical_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In review" value={kpis?.in_review ?? 0} tone={(kpis?.in_review ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Verified" value={kpis?.verified_count ?? 0} tone="ok" />
        <Kpi label="Settled" value={kpis?.settled_count ?? 0} tone="ok" />
        <Kpi label="Non-performance" value={kpis?.non_performance_count ?? 0} tone={(kpis?.non_performance_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Instructed" value={fmtMw(kpis?.total_instructed_mw ?? 0)} />
        <Kpi label="Penalties" value={fmtZar(kpis?.total_penalty_zar ?? 0)} tone={(kpis?.total_penalty_zar ?? 0) > 0 ? 'bad' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Activation #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Provider / service</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Instr / deliv</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const ct = TIER_TONE[r.reserve_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.activation_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[240px]">
                      <div className="truncate" title={r.provider_party_name}>{r.provider_party_name}</div>
                      <div className="truncate text-[10px] text-[#4a5568]" title={r.service_name}>
                        {r.service_name} · {r.provider_type.replace(/_/g, ' ')}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ct.bg, color: ct.fg }}>
                        {ct.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      {r.instructed_mw?.toLocaleString('en-ZA') ?? '—'}
                      <span className="text-[10px] text-[#4a5568]"> / {r.delivered_mw != null ? r.delivered_mw.toLocaleString('en-ZA') : '—'}</span>
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
                <tr><td colSpan={6} className="px-3 py-6 text-center text-[#4a5568]">No reserve activations match.</td></tr>
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
  row: ActivationRow;
  events: ActivationEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: ActivationRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canFlag = FLAGGABLE_STATES.includes(row.chain_status);
  const canDispute = DISPUTABLE_STATES.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE_STATES.includes(row.chain_status);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="oe-overlay-in fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="oe-drawer-in absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.activation_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.provider_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.reserve_tier].label} · {row.service_name} · {row.provider_type.replace(/_/g, ' ')}
              </div>
              <div className="mt-1 text-[11px] text-[#4a5568]">System Operator: {row.so_party_name}</div>
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
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Reserve tier"         value={TIER_TONE[row.reserve_tier].label} />
            <Pair label="Provider type"        value={row.provider_type.replace(/_/g, ' ')} />
            <Pair label="Service"              value={row.service_name} />
            <Pair label="Trigger"              value={row.trigger_type ? row.trigger_type.replace(/_/g, ' ') : '—'} />
            <Pair label="Frequency at event"   value={row.frequency_hz_at_event != null ? `${row.frequency_hz_at_event} Hz` : '—'} />
            <Pair label="Instructed"           value={fmtMw(row.instructed_mw)} />
            <Pair label="Delivered"            value={fmtMw(row.delivered_mw)} />
            <Pair label="Contracted response"  value={fmtSeconds(row.response_time_seconds)} />
            <Pair label="Actual response"      value={fmtSeconds(row.actual_response_seconds)} />
            <Pair label="Contract ref"         value={row.contract_ref ?? '—'} />
            <Pair label="Availability payment" value={fmtZar(row.availability_payment_zar)} />
            <Pair label="Utilisation payment"  value={fmtZar(row.utilisation_payment_zar)} />
            <Pair label="Penalty"              value={fmtZar(row.penalty_zar)} />
            <Pair label="Instruction ref"      value={row.instruction_ref ?? '—'} />
            <Pair label="Acknowledgement ref"  value={row.acknowledgement_ref ?? '—'} />
            <Pair label="Ramp ref"             value={row.ramp_ref ?? '—'} />
            <Pair label="Delivery ref"         value={row.delivery_ref ?? '—'} />
            <Pair label="Release ref"          value={row.release_ref ?? '—'} />
            <Pair label="Review ref"           value={row.review_ref ?? '—'} />
            <Pair label="Verification ref"     value={row.verification_ref ?? '—'} />
            <Pair label="Settlement ref"       value={row.settlement_ref ?? '—'} />
            <Pair label="Dispute ref"          value={row.dispute_ref ?? '—'} />
            <Pair label="Dispute round"        value={String(row.dispute_round)} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="Issued"               value={fmtDate(row.activation_issued_at)} />
            <Pair label="Acknowledged"         value={fmtDate(row.acknowledged_at)} />
            <Pair label="Ramping"              value={fmtDate(row.ramping_at)} />
            <Pair label="Sustaining"           value={fmtDate(row.sustaining_at)} />
            <Pair label="Released"             value={fmtDate(row.released_at)} />
            <Pair label="Review"               value={fmtDate(row.performance_review_at)} />
            <Pair label="Verified"             value={fmtDate(row.verified_at)} />
            <Pair label="Settled"              value={fmtDate(row.settled_at)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"       value={String(row.escalation_level)} />
            <Pair label="Reportable"           value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.instruction_basis && (
            <BasisBlock label="Instruction basis" tone="oklch(0.46 0.16 55)" text={row.instruction_basis} />
          )}
          {row.response_basis && (
            <BasisBlock label="Response basis" tone="oklch(0.46 0.16 55)" text={row.response_basis} />
          )}
          {row.performance_basis && (
            <BasisBlock label="Performance basis" tone="#a06200" text={row.performance_basis} />
          )}
          {row.non_performance_basis && (
            <BasisBlock label="Non-performance basis" tone="#9b1f1f" text={row.non_performance_basis} />
          )}
          {row.settlement_basis && (
            <BasisBlock label="Settlement basis" tone="#1f6b3a" text={row.settlement_basis} />
          )}
          {row.dispute_basis && (
            <BasisBlock label="Dispute basis" tone="#8a4a00" text={row.dispute_basis} />
          )}
        </section>

        {(nextAction || canFlag || canDispute || canWithdraw) && (
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
              {canFlag && (
                <button type="button"
                  onClick={() => onAct('flag-non-performance', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['flag-non-performance']}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('raise-dispute', row)}
                  className="rounded border border-orange-300 bg-white px-3 py-1.5 text-[12px] font-medium text-orange-700 hover:bg-orange-50"
                >
                  {ACTION_LABEL['raise-dispute']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw-instruction', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL['withdraw-instruction']}
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
