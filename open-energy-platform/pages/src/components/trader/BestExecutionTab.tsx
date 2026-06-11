// Wave 36 — Trader Best-Execution / RFQ Compliance chain — FSCA Conduct Standard 1 of 2020.
//
// 11-state lifecycle covering every client / counterparty RFQ. The desk must
// take all sufficient steps to obtain the best possible result (total
// consideration = price + cost + speed + likelihood) for the client.
// Operational complement to W2 VaR (quality), W9 MM compliance (consistency),
// W29 position limits (quantity): this enforces best EXECUTION.
//
//   rfq_received → quotes_solicited → quotes_received → best_ex_evaluated →
//   execution_approved → executed → tca_reviewed → closed
//   (+ override_executed = executed away from best quote with documented basis,
//      exception_escalated = best-ex breach to FSCA, rfq_expired = window lapsed)
//
// Mounted on the Trader workstation. MIXED SLA matrix: hard market windows for
// quote/approval/execution (same across tiers), protection-graded windows for
// evaluation + TCA (retail tightest). exception_escalated crosses to FSCA for
// EVERY tier; override + SLA-breach cross for retail + professional (ECP waived).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'rfq_received' | 'quotes_solicited' | 'quotes_received' | 'best_ex_evaluated'
  | 'execution_approved' | 'executed' | 'override_executed' | 'tca_reviewed'
  | 'closed' | 'exception_escalated' | 'rfq_expired';

type Tier = 'retail' | 'professional' | 'eligible_counterparty';

interface BestExRow {
  [key: string]: unknown;
  id: string;
  rfq_number: string;
  source_event: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  desk_party_name: string;
  client_party_name: string;
  client_tier: Tier;
  instrument: string;
  energy_type: string | null;
  side: string | null;
  quantity_mwh: number | null;
  delivery_day: string | null;
  quotes_count: number;
  best_quote_price_zar: number | null;
  best_quote_counterparty: string | null;
  executed_price_zar: number | null;
  executed_counterparty: string | null;
  total_consideration_zar: number | null;
  notional_zar: number | null;
  price_improvement_bps: number | null;
  slippage_bps: number | null;
  rfq_ref: string | null;
  evaluation_ref: string | null;
  approval_ref: string | null;
  execution_ref: string | null;
  override_ref: string | null;
  tca_ref: string | null;
  exception_ref: string | null;
  best_ex_basis: string | null;
  approval_basis: string | null;
  override_basis: string | null;
  tca_findings: string | null;
  exception_basis: string | null;
  expiry_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  rfq_received_at: string;
  sla_deadline_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
}

interface BestExEvent {
  id: string;
  rfq_id: string;
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
  rfq_received:        { bg: '#e3e7ec', fg: '#445',    label: 'RFQ received' },
  quotes_solicited:    { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Quotes solicited' },
  quotes_received:     { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Quotes received' },
  best_ex_evaluated:   { bg: '#fff4d6', fg: '#a06200', label: 'Best-ex evaluated' },
  execution_approved:  { bg: '#fbe7d0', fg: '#7a4500', label: 'Approved' },
  executed:            { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Executed' },
  override_executed:   { bg: '#ffe4b5', fg: '#8a4a00', label: 'Override' },
  tca_reviewed:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'TCA reviewed' },
  closed:              { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Closed' },
  exception_escalated: { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Exception' },
  rfq_expired:         { bg: '#e3e7ec', fg: '#557',    label: 'Expired' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  retail:                { bg: '#fde0e0', fg: '#9b1f1f', label: 'Retail (full)' },
  professional:          { bg: '#fff4d6', fg: '#a06200', label: 'Professional' },
  eligible_counterparty: { bg: '#daf5e2', fg: '#1f6b3a', label: 'ECP (waived)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'reportable',          label: 'FSCA reportable' },
  { key: 'retail',              label: 'Retail' },
  { key: 'professional',        label: 'Professional' },
  { key: 'eligible_counterparty', label: 'ECP' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'rfq_received',        label: 'RFQ received' },
  { key: 'quotes_solicited',    label: 'Solicited' },
  { key: 'quotes_received',     label: 'Quotes in' },
  { key: 'best_ex_evaluated',   label: 'Evaluated' },
  { key: 'execution_approved',  label: 'Approved' },
  { key: 'executed',            label: 'Executed' },
  { key: 'override_executed',   label: 'Override' },
  { key: 'tca_reviewed',        label: 'TCA reviewed' },
  { key: 'closed',              label: 'Closed' },
  { key: 'exception_escalated', label: 'Exception' },
  { key: 'rfq_expired',         label: 'Expired' },
];

type ActionKind =
  | 'solicit-quotes' | 'record-quotes' | 'evaluate' | 'approve' | 'execute'
  | 'execute-override' | 'review-tca' | 'close' | 'escalate-exception' | 'expire';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  rfq_received:        'solicit-quotes',
  quotes_solicited:    'record-quotes',
  quotes_received:     'evaluate',
  best_ex_evaluated:   'approve',
  execution_approved:  'execute',
  executed:            'review-tca',
  override_executed:   'review-tca',
  tca_reviewed:        'close',
  closed:              null,
  exception_escalated: null,
  rfq_expired:         null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'solicit-quotes':     'Solicit quotes (Desk)',
  'record-quotes':      'Record quotes (Desk)',
  'evaluate':           'Evaluate best-ex (Desk)',
  'approve':            'Approve execution (Compliance)',
  'execute':            'Execute (Desk)',
  'execute-override':   'Execute override (Desk)',
  'review-tca':         'Review TCA (Compliance)',
  'close':              'Close (Compliance)',
  'escalate-exception': 'Escalate exception (Compliance)',
  'expire':             'Expire RFQ (System)',
};

const OVERRIDABLE: ChainStatus[] = ['best_ex_evaluated'];
const ESCALATABLE: ChainStatus[] = ['best_ex_evaluated', 'tca_reviewed'];
const EXPIRABLE: ChainStatus[] = ['rfq_received', 'quotes_solicited', 'quotes_received'];

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
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMWh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')}MWh`;
}

function fmtBps(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}bps`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  override_count: number;
  exception_count: number;
  expired_count: number;
  breached: number;
  reportable_total: number;
  retail_open: number;
  total_notional_zar: number;
  total_executed_zar: number;
}

export function BestExecutionTab() {
  const [rows, setRows] = useState<BestExRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<BestExRow | null>(null);
  const [events, setEvents] = useState<BestExEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: BestExRow[] } & KpiSummary }>('/best-execution/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          override_count: data.override_count || 0,
          exception_count: data.exception_count || 0,
          expired_count: data.expired_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          retail_open: data.retail_open || 0,
          total_notional_zar: data.total_notional_zar || 0,
          total_executed_zar: data.total_executed_zar || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load best-execution chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: BestExRow; events: BestExEvent[] } }>(`/best-execution/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load RFQ history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'retail' || filter === 'professional' || filter === 'eligible_counterparty') {
        return r.client_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, override_count: 0, exception_count: 0,
    expired_count: 0, breached: 0, reportable_total: 0, retail_open: 0,
    total_notional_zar: 0, total_executed_zar: 0,
  };

  const act = useCallback(async (action: ActionKind, row: BestExRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'record-quotes') {
        const cnt = window.prompt('Number of quotes received:', String(row.quotes_count || ''));
        if (cnt) body.quotes_count = Number(cnt);
        const px = window.prompt('Best quote price (R/MWh or R/unit):', row.best_quote_price_zar != null ? String(row.best_quote_price_zar) : '');
        if (px) body.best_quote_price_zar = Number(px);
        const cp = window.prompt('Best quote counterparty:', row.best_quote_counterparty ?? '');
        if (cp) body.best_quote_counterparty = cp;
      } else if (action === 'evaluate') {
        const basis = window.prompt('Best-ex basis (total consideration: price + cost + speed + likelihood):', row.best_ex_basis ?? '');
        if (!basis) return;
        body.best_ex_basis = basis;
        const ref = window.prompt('Evaluation reference (optional):', row.evaluation_ref ?? '');
        if (ref) body.evaluation_ref = ref;
        const tc = window.prompt('Total consideration (ZAR, optional):');
        if (tc) body.total_consideration_zar = Number(tc);
      } else if (action === 'approve') {
        const basis = window.prompt('Approval basis (venue selection consistent with policy):', row.approval_basis ?? '');
        if (!basis) return;
        body.approval_basis = basis;
        const ref = window.prompt('Approval reference (optional):', row.approval_ref ?? '');
        if (ref) body.approval_ref = ref;
      } else if (action === 'execute') {
        const px = window.prompt('Executed price (R/MWh or R/unit):', row.best_quote_price_zar != null ? String(row.best_quote_price_zar) : '');
        if (!px) return;
        body.executed_price_zar = Number(px);
        const cp = window.prompt('Executed counterparty:', row.best_quote_counterparty ?? '');
        if (cp) body.executed_counterparty = cp;
        const ref = window.prompt('Execution reference (optional):');
        if (ref) body.execution_ref = ref;
        const imp = window.prompt('Price improvement vs benchmark (bps, optional):');
        if (imp) body.price_improvement_bps = Number(imp);
      } else if (action === 'execute-override') {
        const basis = window.prompt('OVERRIDE basis — why execute away from the best quote (size / likelihood). Required, crosses to FSCA for retail + professional:');
        if (!basis) return;
        body.override_basis = basis;
        const px = window.prompt('Executed price (R/MWh or R/unit):');
        if (px) body.executed_price_zar = Number(px);
        const cp = window.prompt('Executed counterparty:');
        if (cp) body.executed_counterparty = cp;
        const slip = window.prompt('Slippage vs best quote (bps):');
        if (slip) body.slippage_bps = Number(slip);
        const ref = window.prompt('Override reference (optional):');
        if (ref) body.override_ref = ref;
        body.reason_code = 'override_size_likelihood';
      } else if (action === 'review-tca') {
        const findings = window.prompt('TCA findings (execution vs arrival benchmark; venue analysis):', row.tca_findings ?? '');
        if (!findings) return;
        body.tca_findings = findings;
        const ref = window.prompt('TCA reference (optional):', row.tca_ref ?? '');
        if (ref) body.tca_ref = ref;
        const imp = window.prompt('Price improvement vs arrival (bps, optional):');
        if (imp) body.price_improvement_bps = Number(imp);
      } else if (action === 'close') {
        const rod = window.prompt('Closure notes (best-ex outcome — required for audit):');
        if (!rod) return;
        body.rod_notes = rod;
        body.reason_code = 'best_ex_satisfied';
      } else if (action === 'escalate-exception') {
        const basis = window.prompt('Exception basis — the best-ex breach being escalated. Required, crosses to FSCA for ALL tiers:');
        if (!basis) return;
        body.exception_basis = basis;
        const ref = window.prompt('FSCA exception reference (e.g. FSCA-BEX-EXC-2026-0011):');
        if (ref) body.exception_ref = ref;
        const rod = window.prompt('ROD notes (remediation + routing review):');
        if (rod) body.rod_notes = rod;
        body.reason_code = 'unjustified_away_execution';
      } else if (action === 'expire') {
        const basis = window.prompt('Expiry basis (RFQ window lapsed before execution):');
        if (basis) body.expiry_basis = basis;
        body.reason_code = 'rfq_window_lapsed';
      }
      await api.post(`/best-execution/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Best Execution / RFQ Compliance — FSCA Conduct Standard 1 of 2020</h2>
          <p className="text-xs text-[#4a5568]">
            11-state lifecycle taking all sufficient steps to obtain the best possible result (total
            consideration = price + cost + speed + likelihood) on every client RFQ:
            received → solicited → quotes in → best-ex evaluated → approved → executed → TCA reviewed → closed
            (+ documented override, FSCA exception, expiry). MIXED SLA: hard market windows on quote/approval/
            execution, protection-graded evaluation + TCA (retail tightest). Exceptions cross to FSCA for ALL
            tiers; overrides + SLA breaches cross for retail + professional (ECP waived best-ex).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"          value={kpis.total} />
        <Kpi label="Open"           value={kpis.open_count}      tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Overrides"      value={kpis.override_count}  tone={kpis.override_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Exceptions"     value={kpis.exception_count} tone={kpis.exception_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"   value={kpis.breached}        tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="FSCA reportable" value={kpis.reportable_total} />
        <Kpi label="Retail open"    value={kpis.retail_open}     tone={kpis.retail_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Notional"       value={fmtZar(kpis.total_notional_zar)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Expired: <span className="font-semibold text-[#557]">{kpis.expired_count}</span></span>
        <span>Executed value: <span className="font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>{fmtZar(kpis.total_executed_zar)}</span></span>
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>RFQ #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Client</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Tier</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Instrument</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Qty</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Best / exec</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Slippage</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.client_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">
                      {r.rfq_number}
                      {r.source_wave && <span className="ml-1 text-[9px] text-[#8a93a0]">{r.source_wave}</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'oklch(0.46 0.16 55)' }}>{r.client_party_name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      <div className="text-[11px]">{r.instrument}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.energy_type ?? '—'} · {r.side ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtMWh(r.quantity_mwh)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">
                      <div>{fmtPrice(r.best_quote_price_zar)}</div>
                      <div className="text-[10px] text-[#6b7685]">{r.executed_price_zar != null ? fmtPrice(r.executed_price_zar) : '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${(r.slippage_bps ?? 0) >= 20 ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {fmtBps(r.slippage_bps)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No RFQs match.</td></tr>
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
  row: BestExRow;
  events: BestExEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: BestExRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canOverride = OVERRIDABLE.includes(row.chain_status);
  const canEscalate = ESCALATABLE.includes(row.chain_status);
  const canExpire = EXPIRABLE.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.rfq_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.client_party_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.client_tier].label} · {row.instrument} · {row.energy_type ?? '—'} · {row.side ?? '—'}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Desk"               value={row.desk_party_name} />
            <Pair label="Client tier"        value={TIER_TONE[row.client_tier].label} />
            <Pair label="Instrument"         value={row.instrument} />
            <Pair label="Energy type"        value={row.energy_type ?? '—'} />
            <Pair label="Side"               value={row.side ?? '—'} />
            <Pair label="Quantity"           value={fmtMWh(row.quantity_mwh)} />
            <Pair label="Delivery day"       value={row.delivery_day ?? '—'} />
            <Pair label="Notional"           value={fmtZar(row.notional_zar)} />
            <Pair label="Quotes"             value={String(row.quotes_count)} />
            <Pair label="Best quote"         value={`${fmtPrice(row.best_quote_price_zar)} ${row.best_quote_counterparty ? `(${row.best_quote_counterparty})` : ''}`} />
            <Pair label="Executed"           value={`${fmtPrice(row.executed_price_zar)} ${row.executed_counterparty ? `(${row.executed_counterparty})` : ''}`} />
            <Pair label="Total consideration" value={fmtZar(row.total_consideration_zar)} />
            <Pair label="Price improvement"  value={fmtBps(row.price_improvement_bps)} />
            <Pair label="Slippage"           value={fmtBps(row.slippage_bps)} />
            <Pair label="Evaluation ref"     value={row.evaluation_ref ?? '—'} />
            <Pair label="Approval ref"       value={row.approval_ref ?? '—'} />
            <Pair label="Execution ref"      value={row.execution_ref ?? '—'} />
            <Pair label="Override ref"       value={row.override_ref ?? '—'} />
            <Pair label="TCA ref"            value={row.tca_ref ?? '—'} />
            <Pair label="Exception ref"      value={row.exception_ref ?? '—'} />
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation"         value={String(row.escalation_level)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="RFQ received"       value={fmtDate(row.rfq_received_at)} />
            <Pair label="Reason code"        value={row.reason_code ?? '—'} />
            {row.source_wave && <Pair label="Provenance" value={`${row.source_wave} · ${row.source_entity_id ?? ''}`} />}
          </div>
          {row.best_ex_basis && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Best-ex basis</div>
              {row.best_ex_basis}
            </div>
          )}
          {row.override_basis && (
            <div className="mt-2 rounded border border-[#ffe4b5] bg-[#fffaf0] px-3 py-2 text-[12px] text-[#8a4a00]">
              <div className="text-[10px] uppercase tracking-wider text-[#a06200] mb-1">Override basis</div>
              {row.override_basis}
            </div>
          )}
          {row.tca_findings && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">TCA findings</div>
              {row.tca_findings}
            </div>
          )}
          {row.exception_basis && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">Exception basis</div>
              {row.exception_basis}
            </div>
          )}
          {row.rod_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ROD notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {(nextAction || canOverride || canEscalate || canExpire) && (
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
              {canOverride && (
                <button type="button"
                  onClick={() => onAct('execute-override', row)}
                  className="rounded border border-[#e0b070] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a4a00] hover:bg-[#fffaf0]"
                >
                  {ACTION_LABEL['execute-override']}
                </button>
              )}
              {canEscalate && (
                <button type="button"
                  onClick={() => onAct('escalate-exception', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['escalate-exception']}
                </button>
              )}
              {canExpire && (
                <button type="button"
                  onClick={() => onAct('expire', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['expire']}
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
                  <div className="flex items-center gap-2">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="inline-block rounded bg-[#eef1f5] px-1.5 py-0.5 text-[10px] font-medium text-[#445]">{e.actor_party}</span>
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

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}

export default BestExecutionTab;
