// Wave 17 — Carbon credit retirement chain tab.
//
// 7-state P6 audit chain layered on carbon_retirements. Per-scope SLA tiering
// (article6 24h / compliance 72h / voluntary 168h per stage). Article6 finalize
// + reject and SLA breaches in article6/compliance cross into regulator inbox.
//
//   • KPI strip: total / article6 open / breached / escalated / retired count
//   • Filter pills by chain state + scope + breached/escalated
//   • Listing with scope pill + state pill + SLA countdown
//   • Drill-down: timeline + per-state action buttons (5 transitions + cancel)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'requested' | 'validating' | 'adjustment_pending' | 'adjusted'
  | 'retired' | 'rejected' | 'cancelled';

type Scope = 'article6' | 'compliance' | 'voluntary';

interface RetirementRow {
  id: string;
  participant_id: string;
  project_id: string;
  quantity: number;
  retirement_reason: string | null;
  certificate_number: string | null;
  beneficiary_name: string | null;
  beneficiary_country: string | null;
  retirement_date: string | null;
  chain_status: ChainStatus;
  scope: Scope;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  validation_notes: string | null;
  rejection_reason: string | null;
  certificate_hash: string | null;
  sla_breached?: boolean;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
}

interface RetirementEvent {
  id: string;
  retirement_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  requested:          { bg: '#fff4d6', fg: '#a06200', label: 'Requested' },
  validating:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Validating' },
  adjustment_pending: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Adjustment pending' },
  adjusted:           { bg: '#daf5e2', fg: '#1f6b3a', label: 'Adjusted' },
  retired:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Retired' },
  rejected:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  cancelled:          { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const SCOPE_TONE: Record<Scope, { bg: string; fg: string; label: string }> = {
  article6:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Article 6' },
  compliance: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Compliance' },
  voluntary:  { bg: '#e3e7ec', fg: '#557',    label: 'Voluntary' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'article6',           label: 'Article 6' },
  { key: 'compliance',         label: 'Compliance' },
  { key: 'voluntary',          label: 'Voluntary' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'escalated',          label: 'Escalated' },
  { key: 'requested',          label: 'Requested' },
  { key: 'validating',         label: 'Validating' },
  { key: 'adjustment_pending', label: 'Adjustment pending' },
  { key: 'adjusted',           label: 'Adjusted' },
  { key: 'retired',            label: 'Retired' },
  { key: 'rejected',           label: 'Rejected' },
  { key: 'cancelled',          label: 'Cancelled' },
];

type ActionKind =
  | 'begin-validation' | 'mark-adjustment-pending' | 'mark-adjusted'
  | 'finalize' | 'reject' | 'cancel';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  requested:          'begin-validation',
  validating:         'mark-adjustment-pending',
  adjustment_pending: 'mark-adjusted',
  adjusted:           'finalize',
  retired:            null,
  rejected:           null,
  cancelled:          null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-validation':       'Begin CRA validation',
  'mark-adjustment-pending': 'Submit for corresponding adjustment',
  'mark-adjusted':          'Mark adjustment posted',
  'finalize':               'Finalize retirement (mint cert)',
  'reject':                 'Reject retirement',
  'cancel':                 'Cancel retirement',
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

function fmtTons(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })} tCO2e`;
}

export function RetirementChainTab() {
  const [rows, setRows] = useState<RetirementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<RetirementRow | null>(null);
  const [events, setEvents] = useState<RetirementEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RetirementRow[] } }>('/carbon/retirement-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load retirements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { retirement: RetirementRow; events: RetirementEvent[] } }>(
        `/carbon/retirement-chain/${id}`
      );
      if (res.data?.data?.retirement) setSelected(res.data.data.retirement);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load retirement history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return r.chain_status !== 'retired' && r.chain_status !== 'rejected' && r.chain_status !== 'cancelled';
      if (filter === 'article6')   return r.scope === 'article6';
      if (filter === 'compliance') return r.scope === 'compliance';
      if (filter === 'voluntary')  return r.scope === 'voluntary';
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'escalated')  return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let article6_open = 0, breached = 0, escalated = 0, retired_count = 0, total_tco2 = 0;
    for (const r of rows) {
      if (r.scope === 'article6' && r.chain_status !== 'retired' && r.chain_status !== 'rejected' && r.chain_status !== 'cancelled') article6_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (r.chain_status === 'retired') {
        retired_count++;
        total_tco2 += r.quantity || 0;
      }
    }
    return { total: rows.length, article6_open, breached, escalated, retired_count, total_tco2 };
  }, [rows]);

  const act = useCallback(async (action: ActionKind, row: RetirementRow) => {
    try {
      let body: Record<string, string> = {};
      if (action === 'reject') {
        const reason = window.prompt('Rejection reason:');
        if (!reason) return;
        body = { reason };
      } else if (action === 'cancel') {
        const reason = window.prompt('Reason for cancel:');
        if (!reason) return;
        body = { notes: reason };
      }
      await api.post(`/carbon/retirement-chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Carbon credit retirement chain</h2>
          <p className="text-xs text-[#4a5568]">
            7-stage P6 chain · requested → validating → adjustment pending → adjusted → retired (+ rejected / cancelled).
            Per-scope SLA tiering (Article 6 24h / compliance 72h / voluntary 168h per stage).
            Article 6 finalize/reject and Article 6 / compliance SLA breaches escalate to the regulator inbox.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total retirements" value={kpis.total} />
        <Kpi label="Article 6 open" value={kpis.article6_open} tone={kpis.article6_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Escalated" value={kpis.escalated} tone={kpis.escalated > 0 ? 'warn' : 'ok'} />
        <Kpi label="Retired" value={`${kpis.retired_count} (${fmtTons(kpis.total_tco2)})`} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Beneficiary</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Country</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Quantity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Scope</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Reason</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const sc = SCOPE_TONE[r.scope];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 text-[#0c2a4d]">{r.beneficiary_name ?? '—'}</td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.beneficiary_country ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtTons(r.quantity)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: sc.bg, color: sc.fg }}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] max-w-[260px] truncate" title={r.retirement_reason ?? ''}>
                      {r.retirement_reason ?? '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No retirements match.</td></tr>
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
  row: RetirementRow;
  events: RetirementEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RetirementRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canReject  = row.chain_status === 'validating' || row.chain_status === 'adjustment_pending';
  const canCancel  = row.chain_status !== 'retired' && row.chain_status !== 'rejected' && row.chain_status !== 'cancelled';

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[640px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.id}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.beneficiary_name ?? '—'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {row.beneficiary_country ?? '—'} · {fmtTons(row.quantity)} · {SCOPE_TONE[row.scope].label}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Scope"        value={SCOPE_TONE[row.scope].label} />
            <Pair label="State"        value={STATE_TONE[row.chain_status].label} />
            <Pair label="Quantity"     value={fmtTons(row.quantity)} />
            <Pair label="Country"      value={row.beneficiary_country ?? '—'} />
            <Pair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"   value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation"   value={String(row.escalation_level)} />
            <Pair label="Certificate"  value={row.certificate_hash ?? row.certificate_number ?? '—'} />
          </div>
          {row.retirement_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">Reason</div>
              <div className="text-[#1a3a5c]">{row.retirement_reason}</div>
            </div>
          )}
          {row.rejection_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#9b1f1f]">Rejection reason</div>
              <div className="text-[#9b1f1f]">{row.rejection_reason}</div>
            </div>
          )}
        </section>

        {(nextAction || canReject || canCancel) && (
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
              {canReject && (
                <button type="button"
                  onClick={() => onAct('reject', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.reject}
                </button>
              )}
              {canCancel && (
                <button type="button"
                  onClick={() => onAct('cancel', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
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
