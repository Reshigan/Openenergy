// Wave 18 — Planned outage submission chain tab (NERSA Grid Code §C-1.3).
//
// 12-state P6 chain on oe_planned_outages, owned by the Grid Operator for
// approval and by IPPs for submission. Per-severity SLA tiering (critical 1h
// review / 4h approve, low 7d). commence + reject + sla_breached on
// critical/high cross into the regulator inbox.
//
//   • KPI strip: total / in_progress / critical_open / breached / post_mortem_due
//   • Filter pills by chain state + severity
//   • Listing with severity pill + state pill + SLA countdown + MW
//   • Drill-down: timeline + role-gated action buttons
//     - Grid role can begin_review / approve / reject / notify / commence / restore / close
//     - IPP role can submit (from draft/rescheduled) / cancel

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { prompt } from '../PromptDialog';
import { useAuth } from '../../lib/useAuth';

type ChainStatus =
  | 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected'
  | 'rescheduled' | 'notified' | 'in_progress' | 'restoring'
  | 'restored' | 'closed' | 'cancelled';

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface OutageRow {
  id: string;
  outage_number: string;
  participant_id: string;
  asset_id: string | null;
  asset_name: string | null;
  category: string;
  severity: Severity;
  chain_status: ChainStatus;
  affected_mw: number | null;
  affected_zone: string | null;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number | null;
  reason: string | null;
  contingency_notes: string | null;
  rejection_reason: string | null;
  sla_deadline_at: string | null;
  escalation_level: number;
  approved_by: string | null;
  approved_at: string | null;
  notified_at: string | null;
  commenced_at: string | null;
  restored_at: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  sla_breached?: boolean;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
}

interface OutageEvent {
  id: string;
  outage_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  draft:        { bg: '#e3e7ec', fg: '#557',    label: 'Draft' },
  submitted:    { bg: '#fff4d6', fg: '#a06200', label: 'Submitted' },
  under_review: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Under review' },
  approved:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  rejected:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  rescheduled:  { bg: '#fff4d6', fg: '#a06200', label: 'Rescheduled' },
  notified:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Notified' },
  in_progress:  { bg: '#fde0e0', fg: '#9b1f1f', label: 'In progress' },
  restoring:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Restoring' },
  restored:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Restored' },
  closed:       { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  cancelled:    { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const SEVERITY_TONE: Record<Severity, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical' },
  high:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'High' },
  medium:   { bg: '#fff4d6', fg: '#a06200', label: 'Medium' },
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',      label: 'Active' },
  { key: 'all',         label: 'All' },
  { key: 'critical',    label: 'Critical' },
  { key: 'high',        label: 'High' },
  { key: 'breached',    label: 'SLA breached' },
  { key: 'escalated',   label: 'Escalated' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'submitted',   label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'approved',    label: 'Approved' },
  { key: 'rejected',    label: 'Rejected' },
  { key: 'restored',    label: 'Restored (post-mortem)' },
  { key: 'closed',      label: 'Closed' },
];

type ActionKind =
  | 'submit' | 'begin-review' | 'approve' | 'reject' | 'reschedule'
  | 'notify' | 'commence' | 'begin-restore' | 'mark-restored'
  | 'close' | 'cancel';

const GRID_NEXT: Partial<Record<ChainStatus, ActionKind>> = {
  submitted:    'begin-review',
  under_review: 'approve',
  approved:     'notify',
  notified:     'commence',
  in_progress:  'begin-restore',
  restoring:    'mark-restored',
  restored:     'close',
};

const IPP_NEXT: Partial<Record<ChainStatus, ActionKind>> = {
  draft:       'submit',
  rescheduled: 'submit',
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit':         'Submit to Grid Operator',
  'begin-review':   'Begin review',
  'approve':        'Approve outage',
  'reject':         'Reject outage',
  'reschedule':     'Send back to reschedule',
  'notify':         'Mark customer notified',
  'commence':       'Commence outage',
  'begin-restore':  'Begin restoration',
  'mark-restored':  'Mark restored',
  'close':          'Close (post-mortem filed)',
  'cancel':         'Cancel outage',
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
  return `${n.toLocaleString('en-ZA', { maximumFractionDigits: 1 })} MW`;
}

export function PlannedOutageChainTab() {
  const { user } = useAuth();
  const role = user?.role || '';
  const isGrid = role === 'admin' || role === 'grid' || role === 'grid_operator';
  const isIpp  = role === 'ipp' || role === 'ipp_developer' || role === 'wind' || role === 'admin' || role === 'grid' || role === 'grid_operator';

  const [rows, setRows] = useState<OutageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<OutageRow | null>(null);
  const [events, setEvents] = useState<OutageEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: OutageRow[] } }>('/grid/planned-outages');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load outages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { outage: OutageRow; events: OutageEvent[] } }>(
        `/grid/planned-outages/${id}`
      );
      if (res.data?.data?.outage) setSelected(res.data.data.outage);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load outage history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return r.chain_status !== 'closed' && r.chain_status !== 'rejected' && r.chain_status !== 'cancelled';
      if (filter === 'critical')  return r.severity === 'critical';
      if (filter === 'high')      return r.severity === 'high';
      if (filter === 'breached')  return r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let critical_open = 0, breached = 0, escalated = 0, in_progress = 0, post_mortem = 0, mw_offline = 0;
    for (const r of rows) {
      const terminal = r.chain_status === 'closed' || r.chain_status === 'rejected' || r.chain_status === 'cancelled';
      if (r.severity === 'critical' && !terminal) critical_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (r.chain_status === 'in_progress' || r.chain_status === 'restoring') {
        in_progress++;
        mw_offline += r.affected_mw || 0;
      }
      if (r.chain_status === 'restored') post_mortem++;
    }
    return { total: rows.length, critical_open, breached, escalated, in_progress, post_mortem, mw_offline };
  }, [rows]);

  const act = useCallback(async (action: ActionKind, row: OutageRow) => {
    try {
      let body: Record<string, string> = {};
      if (action === 'reject') {
        const reason = await prompt('Rejection reason:');
        if (!reason) return;
        body = { reason };
      } else if (action === 'cancel') {
        const reason = await prompt('Reason for cancel:');
        if (!reason) return;
        body = { notes: reason };
      }
      await api.post(`/grid/planned-outages/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Planned outage submission chain</h2>
          <p className="text-xs text-[#4a5568]">
            NERSA Grid Code §C-1.3 — IPPs file planned maintenance; Grid Operator reviews, approves, supervises commencement and restoration.
            Per-severity SLAs (critical 1h review, low 7d). Commence + reject + SLA breaches on critical/high cross to the regulator inbox.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total outages" value={kpis.total} />
        <Kpi label="Critical open" value={kpis.critical_open} tone={kpis.critical_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="In progress" value={`${kpis.in_progress} (${fmtMw(kpis.mw_offline)})`} tone={kpis.in_progress > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Post-mortem due" value={kpis.post_mortem} tone={kpis.post_mortem > 0 ? 'warn' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Outage #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Asset</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Category</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">MW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Severity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Window</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const sv = SEVERITY_TONE[r.severity];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#0c2a4d]">{r.outage_number}</td>
                    <td className="px-3 py-2 text-[#0c2a4d]">{r.asset_name ?? '—'}</td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.category}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtMw(r.affected_mw)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: sv.bg, color: sv.fg }}>
                        {sv.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">
                      {r.start_at ? fmtDate(r.start_at) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No outages match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer
          row={selected}
          events={events}
          isGrid={isGrid}
          isIpp={isIpp}
          onClose={() => setSelected(null)}
          onAct={act}
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
  row, events, isGrid, isIpp, onClose, onAct,
}: {
  row: OutageRow;
  events: OutageEvent[];
  isGrid: boolean;
  isIpp: boolean;
  onClose: () => void;
  onAct: (action: ActionKind, row: OutageRow) => void;
}) {
  const gridAction = isGrid ? GRID_NEXT[row.chain_status] : undefined;
  const ippAction  = isIpp  ? IPP_NEXT[row.chain_status]  : undefined;
  const canReject  = isGrid && row.chain_status === 'under_review';
  const canResched = isGrid && (row.chain_status === 'under_review' || row.chain_status === 'approved');
  const canCancel  = isIpp && (
    row.chain_status === 'draft'        || row.chain_status === 'submitted'   ||
    row.chain_status === 'under_review' || row.chain_status === 'approved'    ||
    row.chain_status === 'rescheduled'  || row.chain_status === 'notified'
  );

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[640px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.outage_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.asset_name ?? '—'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {row.category} · {fmtMw(row.affected_mw)} · {SEVERITY_TONE[row.severity].label}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Severity"     value={SEVERITY_TONE[row.severity].label} />
            <Pair label="State"        value={STATE_TONE[row.chain_status].label} />
            <Pair label="Category"     value={row.category} />
            <Pair label="Zone"         value={row.affected_zone ?? '—'} />
            <Pair label="Start"        value={fmtDate(row.start_at)} />
            <Pair label="End"          value={fmtDate(row.end_at)} />
            <Pair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"   value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation"   value={String(row.escalation_level)} />
            <Pair label="Approved by"  value={row.approved_by ?? '—'} />
            <Pair label="Commenced at" value={fmtDate(row.commenced_at)} />
            <Pair label="Restored at"  value={fmtDate(row.restored_at)} />
          </div>
          {row.reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">Reason</div>
              <div className="text-[#1a3a5c]">{row.reason}</div>
            </div>
          )}
          {row.contingency_notes && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">Contingency (N-1 assessment)</div>
              <div className="text-[#1a3a5c] whitespace-pre-wrap">{row.contingency_notes}</div>
            </div>
          )}
          {row.rejection_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#9b1f1f]">Rejection reason</div>
              <div className="text-[#9b1f1f]">{row.rejection_reason}</div>
            </div>
          )}
        </section>

        {(gridAction || ippAction || canReject || canResched || canCancel) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {gridAction && (
                <button type="button"
                  onClick={() => onAct(gridAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[gridAction]}
                </button>
              )}
              {ippAction && !gridAction && (
                <button type="button"
                  onClick={() => onAct(ippAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[ippAction]}
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
              {canResched && (
                <button type="button"
                  onClick={() => onAct('reschedule', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#a06200] hover:bg-[#fff8e0]"
                >
                  {ACTION_LABEL.reschedule}
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
