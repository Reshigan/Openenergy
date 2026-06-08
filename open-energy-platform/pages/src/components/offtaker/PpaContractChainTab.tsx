// Wave 22 — Offtaker PPA contract execution lifecycle tab.
//
// 9-state P6 chain on oe_ppa_contract_chain. Per-capacity-tier SLAs
// (strategic ≥100MW / medium 10-100MW / small <10MW — bigger contracts get
// more diligence time). Strategic-tier execute, terminate, and SLA-breach
// cross into the regulator inbox (NERSA Section 34 determination).
//
//   • KPI strip: total / strategic open / in_negotiation / executed / in_force / breached / disputed / terminated
//   • Filter pills by chain state + tier + breached/escalated
//   • Listing with tier pill + state pill + SLA countdown + MW + offtaker
//   • Drill-down: timeline + per-state actions + dispute/resolve/terminate/cancel

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'draft' | 'in_negotiation' | 'terms_locked' | 'legal_signed'
  | 'executed' | 'in_force' | 'in_dispute'
  | 'terminated' | 'expired' | 'cancelled';

type Tier = 'strategic' | 'medium' | 'small';

interface PpaRow {
  id: string;
  ppa_number: string;
  project_id: string | null;
  participant_id: string;
  offtaker_id: string;
  project_name: string;
  offtaker_name: string;
  contract_term_years: number;
  capacity_mw: number;
  capacity_tier: Tier;
  tariff_zar_per_mwh: number | null;
  indexation: string | null;
  take_or_pay_pct: number | null;
  chain_status: ChainStatus;
  draft_at: string | null;
  negotiation_at: string | null;
  terms_locked_at: string | null;
  legal_signed_at: string | null;
  executed_at: string | null;
  in_force_at: string | null;
  dispute_at: string | null;
  resolved_at: string | null;
  terminated_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  nersa_section34_ref: string | null;
  legal_counterparty_ref: string | null;
  board_approval_ref: string | null;
  termination_reason: string | null;
  cancellation_reason: string | null;
  dispute_notes: string | null;
  contract_notes: string | null;
  expiry_date: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  sla_breached?: boolean;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
}

interface PpaEvent {
  id: string;
  ppa_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  draft:          { bg: '#e3e7ec', fg: '#557',    label: 'Draft' },
  in_negotiation: { bg: '#dbecfb', fg: '#1a3a5c', label: 'In negotiation' },
  terms_locked:   { bg: '#fff4d6', fg: '#a06200', label: 'Terms locked' },
  legal_signed:   { bg: '#fff4d6', fg: '#a06200', label: 'Legal signed' },
  executed:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Executed' },
  in_force:       { bg: '#d4edda', fg: '#155724', label: 'In force' },
  in_dispute:     { bg: '#ffe4e1', fg: '#a04040', label: 'In dispute' },
  terminated:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Terminated' },
  expired:        { bg: '#cce6cc', fg: '#0d4f1d', label: 'Expired' },
  cancelled:      { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  strategic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Strategic (≥100MW)' },
  medium:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Medium (10-100MW)' },
  small:     { bg: '#e3e7ec', fg: '#557',    label: 'Small (<10MW)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',         label: 'Active' },
  { key: 'all',            label: 'All' },
  { key: 'strategic',      label: 'Strategic' },
  { key: 'medium',         label: 'Medium' },
  { key: 'small',          label: 'Small' },
  { key: 'breached',       label: 'SLA breached' },
  { key: 'escalated',      label: 'Escalated' },
  { key: 'draft',          label: 'Draft' },
  { key: 'in_negotiation', label: 'Negotiating' },
  { key: 'terms_locked',   label: 'Terms locked' },
  { key: 'legal_signed',   label: 'Legal signed' },
  { key: 'executed',       label: 'Executed' },
  { key: 'in_force',       label: 'In force' },
  { key: 'in_dispute',     label: 'In dispute' },
  { key: 'terminated',     label: 'Terminated' },
  { key: 'expired',        label: 'Expired' },
  { key: 'cancelled',      label: 'Cancelled' },
];

type PrimaryAction =
  | 'begin-negotiation' | 'lock-terms' | 'legal-sign' | 'execute'
  | 'commence' | 'resolve' | 'expire';

const ACTION_FOR_STATE: Record<ChainStatus, PrimaryAction | null> = {
  draft:          'begin-negotiation',
  in_negotiation: 'lock-terms',
  terms_locked:   'legal-sign',
  legal_signed:   'execute',
  executed:       'commence',
  in_force:       null,
  in_dispute:     'resolve',
  terminated:     null,
  expired:        null,
  cancelled:      null,
};

const ACTION_LABEL: Record<PrimaryAction | 'dispute' | 'terminate' | 'cancel', string> = {
  'begin-negotiation': 'Begin negotiation',
  'lock-terms':        'Lock commercial terms',
  'legal-sign':        'Legal sign-off',
  'execute':           'Execute (NERSA S34)',
  'commence':          'Commence (COD reached)',
  'resolve':           'Resolve dispute',
  'expire':            'Expire',
  'dispute':           'Raise dispute',
  'terminate':         'Terminate',
  'cancel':            'Cancel',
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
  if (n >= 1000) return `${(n / 1000).toFixed(2)}GW`;
  return `${n}MW`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `R${n.toFixed(2)}/MWh`;
}

export function PpaContractChainTab() {
  const [rows, setRows] = useState<PpaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<PpaRow | null>(null);
  const [events, setEvents] = useState<PpaEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PpaRow[] } }>('/offtaker/ppa-contract-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PPA chains');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { ppa: PpaRow; events: PpaEvent[] } }>(
        `/offtaker/ppa-contract-chain/${id}`
      );
      if (res.data?.data?.ppa) setSelected(res.data.data.ppa);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PPA history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return !['terminated','expired','cancelled'].includes(r.chain_status);
      if (filter === 'strategic') return r.capacity_tier === 'strategic';
      if (filter === 'medium')    return r.capacity_tier === 'medium';
      if (filter === 'small')     return r.capacity_tier === 'small';
      if (filter === 'breached')  return r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let strategic_open = 0, breached = 0, escalated = 0;
    let in_negotiation = 0, executed_count = 0, in_force = 0, in_dispute = 0, terminated = 0;
    let contracted_mw = 0;
    for (const r of rows) {
      if (r.capacity_tier === 'strategic' && !['terminated','expired','cancelled'].includes(r.chain_status)) strategic_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (['draft','in_negotiation','terms_locked','legal_signed'].includes(r.chain_status)) in_negotiation++;
      if (r.chain_status === 'executed') executed_count++;
      if (r.chain_status === 'in_force') {
        in_force++;
        contracted_mw += r.capacity_mw || 0;
      }
      if (r.chain_status === 'in_dispute') in_dispute++;
      if (r.chain_status === 'terminated') terminated++;
    }
    return { total: rows.length, strategic_open, breached, escalated, in_negotiation, executed_count, in_force, in_dispute, terminated, contracted_mw };
  }, [rows]);

  const act = useCallback(async (action: PrimaryAction | 'dispute' | 'terminate' | 'cancel', row: PpaRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'execute') {
        let s34 = '';
        if (row.capacity_tier === 'strategic') {
          s34 = window.prompt('NERSA Section 34 determination reference (strategic-tier — required for regulator inbox):') || '';
          if (!s34) return;
        }
        const board = window.prompt('Offtaker board resolution reference (e.g. BR-2026-019):');
        if (!board) return;
        const legal = window.prompt('Legal counterparty reference (e.g. Webber Wentzel):');
        if (!legal) return;
        body = { board_approval_ref: board, legal_counterparty_ref: legal };
        if (s34) body.nersa_section34_ref = s34;
      } else if (action === 'dispute') {
        const notes = window.prompt('Dispute notes — clause, amount, evidence:');
        if (!notes) return;
        body = { dispute_notes: notes };
      } else if (action === 'terminate') {
        const reason = window.prompt('Termination reason (material breach, default, etc):');
        if (!reason) return;
        body = { reason };
      } else if (action === 'cancel') {
        const reason = window.prompt('Cancellation reason (pre-execution withdrawal):');
        if (!reason) return;
        body = { reason };
      }
      await api.post(`/offtaker/ppa-contract-chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Offtaker PPA contract execution lifecycle</h2>
          <p className="text-xs text-[#4a5568]">
            9-stage P6 chain · draft → in negotiation → terms locked → legal signed → executed → in force.
            Disputes branch in/out of in-force; cancel for pre-execution, terminate post-execution. Per-capacity-tier SLAs
            (strategic ≥100MW gets 90d draft + 180d negotiation + 18mo to COD). Strategic-tier execute, termination, and
            SLA breaches cross to the regulator inbox per NERSA Section 34 determination + market-stability mandate.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total PPAs" value={kpis.total} />
        <Kpi label="Strategic open" value={kpis.strategic_open} tone={kpis.strategic_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Negotiating" value={kpis.in_negotiation} />
        <Kpi label="In force" value={`${kpis.in_force} · ${fmtMw(kpis.contracted_mw)}`} />
        <Kpi label="In dispute" value={kpis.in_dispute} tone={kpis.in_dispute > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">PPA #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / offtaker</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Capacity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Tariff</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.capacity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">{r.ppa_number}</td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.project_name} · ${r.offtaker_name}`}>
                      {r.project_name}
                      <span className="text-[#4a5568]"> · {r.offtaker_name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {r.capacity_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtMw(r.capacity_mw)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtZar(r.tariff_zar_per_mwh)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal || r.chain_status === 'in_force' ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No PPAs match.</td></tr>
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
  row: PpaRow;
  events: PpaEvent[];
  onClose: () => void;
  onAct: (action: PrimaryAction | 'dispute' | 'terminate' | 'cancel', row: PpaRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canDispute = row.chain_status === 'in_force';
  const canTerminate = ['executed','in_force','in_dispute'].includes(row.chain_status);
  const canCancel = ['draft','in_negotiation','terms_locked','legal_signed'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.ppa_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.capacity_tier].label} · {fmtMw(row.capacity_mw)} · {row.offtaker_name} · {row.contract_term_years}yr term
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"            value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"             value={TIER_TONE[row.capacity_tier].label} />
            <Pair label="Capacity"         value={fmtMw(row.capacity_mw)} />
            <Pair label="Tariff"           value={fmtZar(row.tariff_zar_per_mwh)} />
            <Pair label="Indexation"       value={row.indexation ?? '—'} />
            <Pair label="Take-or-pay"      value={row.take_or_pay_pct ? `${row.take_or_pay_pct}%` : '—'} />
            <Pair label="Term"             value={`${row.contract_term_years} years`} />
            <Pair label="Expiry"           value={row.expiry_date ?? '—'} />
            <Pair label="Draft"            value={fmtDate(row.draft_at)} />
            <Pair label="Negotiation"      value={fmtDate(row.negotiation_at)} />
            <Pair label="Terms locked"     value={fmtDate(row.terms_locked_at)} />
            <Pair label="Legal signed"     value={fmtDate(row.legal_signed_at)} />
            <Pair label="Executed"         value={fmtDate(row.executed_at)} />
            <Pair label="In force"         value={fmtDate(row.in_force_at)} />
            <Pair label="NERSA S34"        value={row.nersa_section34_ref ?? '—'} />
            <Pair label="Board approval"   value={row.board_approval_ref ?? '—'} />
            <Pair label="Legal counter."   value={row.legal_counterparty_ref ?? '—'} />
            <Pair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"       value={row.is_terminal || row.chain_status === 'in_force' ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation"       value={String(row.escalation_level)} />
          </div>
          {row.dispute_notes && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#a04040]">Dispute notes</div>
              <div className="text-[#a04040] whitespace-pre-wrap">{row.dispute_notes}</div>
            </div>
          )}
          {row.termination_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#9b1f1f]">Termination reason</div>
              <div className="text-[#9b1f1f]">{row.termination_reason}</div>
            </div>
          )}
          {row.cancellation_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#6b1f1f]">Cancellation reason</div>
              <div className="text-[#6b1f1f]">{row.cancellation_reason}</div>
            </div>
          )}
          {row.contract_notes && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">Contract notes</div>
              <div className="text-[#1a3a5c] whitespace-pre-wrap">{row.contract_notes}</div>
            </div>
          )}
        </section>

        {(nextAction || canDispute || canTerminate || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('dispute', row)}
                  className="rounded border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-800 hover:bg-amber-50"
                >
                  {ACTION_LABEL.dispute}
                </button>
              )}
              {canTerminate && (
                <button type="button"
                  onClick={() => onAct('terminate', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.terminate}
                </button>
              )}
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.cancel}
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
                  {(e.from_status || e.to_status) && (
                    <div className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</div>
                  )}
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

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
