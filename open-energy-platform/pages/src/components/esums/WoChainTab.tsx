// Wave 16 — Work Order dispatch chain tab (Esums O&M).
//
// 12-state machine surfaced as a P6 audit chain.
//
//   • KPI strip: total / critical open / breached / escalated / by status
//   • Filter pills by chain state + priority
//   • Listing with priority pill + SLA countdown
//   • Drill-down: timeline + per-state action buttons (11 transitions)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'created' | 'assigned' | 'acknowledged' | 'en_route' | 'on_site'
  | 'diagnosing' | 'repairing' | 'testing' | 'completed' | 'verified'
  | 'closed' | 'cancelled';

type Priority = 'critical' | 'high' | 'medium' | 'low';

interface WoRow {
  id: string;
  wo_number: string;
  site_id: string;
  fault_id: string | null;
  category: string;
  priority: Priority;
  status: ChainStatus;
  chain_status: ChainStatus;
  assigned_to: string | null;
  title: string | null;
  description: string | null;
  sla_deadline: string | null;
  sla_breached?: boolean;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
  resolution_notes: string | null;
}

interface WoEvent {
  id: string;
  wo_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  created:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Created' },
  assigned:     { bg: '#fff4d6', fg: '#a06200', label: 'Assigned' },
  acknowledged: { bg: '#fff4d6', fg: '#a06200', label: 'Acknowledged' },
  en_route:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'En route' },
  on_site:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'On site' },
  diagnosing:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Diagnosing' },
  repairing:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Repairing' },
  testing:      { bg: '#fff4d6', fg: '#a06200', label: 'Testing' },
  completed:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Completed' },
  verified:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Verified' },
  closed:       { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  cancelled:    { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const PRIORITY_TONE: Record<Priority, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'High' },
  medium:   { bg: '#fff4d6', fg: '#a06200', label: 'Medium' },
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',        label: 'Active' },
  { key: 'all',           label: 'All' },
  { key: 'critical',      label: 'Critical priority' },
  { key: 'breached',      label: 'SLA breached' },
  { key: 'escalated',     label: 'Escalated' },
  { key: 'created',       label: 'Created' },
  { key: 'assigned',      label: 'Assigned' },
  { key: 'en_route',      label: 'En route' },
  { key: 'on_site',       label: 'On site' },
  { key: 'repairing',     label: 'Repairing' },
  { key: 'completed',     label: 'Completed' },
  { key: 'verified',      label: 'Verified' },
  { key: 'closed',        label: 'Closed' },
  { key: 'cancelled',     label: 'Cancelled' },
];

type ActionKind =
  | 'assign' | 'acknowledge' | 'depart' | 'arrive'
  | 'diagnose' | 'repair' | 'test' | 'complete'
  | 'verify' | 'close' | 'cancel';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  created:      'assign',
  assigned:     'acknowledge',
  acknowledged: 'depart',
  en_route:     'arrive',
  on_site:      'diagnose',
  diagnosing:   'repair',
  repairing:    'test',
  testing:      'complete',
  completed:    'verify',
  verified:     'close',
  closed:       null,
  cancelled:    null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  assign:      'Assign to technician',
  acknowledge: 'Technician acknowledge',
  depart:      'Depart (en route)',
  arrive:      'Arrive on site',
  diagnose:    'Begin diagnosis',
  repair:      'Start repair',
  test:        'Begin testing',
  complete:    'Mark completed',
  verify:      'Senior tech verify',
  close:       'Close + archive',
  cancel:      'Cancel WO',
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

export function WoChainTab() {
  const [rows, setRows] = useState<WoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<WoRow | null>(null);
  const [events, setEvents] = useState<WoEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: WoRow[] } }>('/esums/wo-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { wo: WoRow; events: WoEvent[] } }>(`/esums/wo-chain/${id}`);
      if (res.data?.data?.wo) setSelected(res.data.data.wo);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load WO history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return r.chain_status !== 'closed' && r.chain_status !== 'cancelled';
      if (filter === 'critical')  return r.priority === 'critical';
      if (filter === 'breached')  return r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let critical_open = 0, breached = 0, escalated = 0, in_field = 0;
    for (const r of rows) {
      if (r.priority === 'critical' && r.chain_status !== 'closed' && r.chain_status !== 'cancelled') critical_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (['en_route', 'on_site', 'diagnosing', 'repairing', 'testing'].includes(r.chain_status)) in_field++;
    }
    return { total: rows.length, critical_open, breached, escalated, in_field };
  }, [rows]);

  const act = useCallback(async (action: ActionKind, row: WoRow) => {
    try {
      let notes: string | undefined;
      if (action === 'cancel') {
        const r = window.prompt('Reason for cancel:');
        if (!r) return;
        notes = r;
      }
      await api.post(`/esums/wo-chain/${row.id}/${action}`, notes ? { notes } : {});
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Work order dispatch chain</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · created → assigned → acknowledged → en route → on site → diagnosing → repairing → testing → completed → verified → closed.
            Priority-tiered SLAs (critical 15m / 1–2h per stage). Critical-priority cancels and breaches escalate to the regulator inbox.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total WOs" value={kpis.total} />
        <Kpi label="Critical open" value={kpis.critical_open} tone={kpis.critical_open > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Escalated" value={kpis.escalated} tone={kpis.escalated > 0 ? 'warn' : 'ok'} />
        <Kpi label="In field" value={kpis.in_field} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">WO #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Title</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Site</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Pri</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tech</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const pri = PRIORITY_TONE[r.priority];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.wo_number}</td>
                    <td className="px-3 py-2 text-[#1a3a5c]">{r.title ?? '—'}</td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.site_id}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: pri.bg, color: pri.fg }}>
                        {pri.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.assigned_to ?? '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No work orders match.</td></tr>
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
  row: WoRow;
  events: WoEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: WoRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canCancel = row.chain_status !== 'closed' && row.chain_status !== 'cancelled' && row.chain_status !== 'verified';

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[640px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.wo_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.title ?? '—'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">Site {row.site_id} · {row.category}</div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Priority"  value={PRIORITY_TONE[row.priority].label} />
            <Pair label="State"     value={STATE_TONE[row.chain_status].label} />
            <Pair label="Assigned"  value={row.assigned_to ?? '—'} />
            <Pair label="Escalation" value={String(row.escalation_level)} />
            <Pair label="SLA deadline" value={fmtDate(row.sla_deadline)} />
            <Pair label="SLA status" value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
          </div>
        </section>

        {(nextAction || canCancel) && (
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
