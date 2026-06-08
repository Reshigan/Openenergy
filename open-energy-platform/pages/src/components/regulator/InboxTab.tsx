// Regulator Inbox — Wave 5 P6-grade observation loop tab.
//
// Materialised from regulator-relevant cascade events (clearing disclosure
// publications, Article 6 UNFCCC posts, surveillance alerts at severity ≥
// medium, licence vary/suspend/revoke, enforcement openings).
//
// The triage actions (ack / escalate / dismiss / assign) are regulator-
// gated server-side; the buttons render for all roles and a forbidden
// response is surfaced inline.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type AckStatus = 'pending' | 'acknowledged' | 'escalated' | 'dismissed';
type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

interface InboxRow {
  id: string;
  source_event: string;
  source_entity_type: string;
  source_entity_id: string;
  severity: Severity;
  title: string;
  body_json: string | null;
  ack_status: AckStatus;
  assigned_to: string | null;
  ack_by: string | null;
  ack_at: string | null;
  ack_note: string | null;
  escalated_at: string | null;
  escalated_to_case: string | null;
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_TONE: Record<AckStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: '#fff4d6', fg: '#a06200', label: 'Pending' },
  acknowledged: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Acknowledged' },
  escalated: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated' },
  dismissed: { bg: '#f0f3f7', fg: '#445566', label: 'Dismissed' },
};

const SEVERITY_TONE: Record<Severity, { bg: string; fg: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f' },
  high: { bg: '#ffe5cc', fg: '#a04200' },
  medium: { bg: '#fff4d6', fg: '#a06200' },
  low: { bg: '#dbecfb', fg: '#1a3a5c' },
  info: { bg: '#f0f3f7', fg: '#445566' },
};

function slaTone(due: string | null, status: AckStatus): { bg: string; fg: string; label: string } {
  if (!due) return { bg: '#f0f3f7', fg: '#445566', label: '—' };
  if (status !== 'pending') return { bg: '#f0f3f7', fg: '#445566', label: new Date(due).toLocaleString() };
  const dueMs = new Date(due).getTime();
  const now = Date.now();
  if (dueMs < now) return { bg: '#fde0e0', fg: '#9b1f1f', label: `Overdue ${msAgo(now - dueMs)}` };
  return { bg: '#daf5e2', fg: '#1f6b3a', label: `In ${msAgo(dueMs - now)}` };
}

function msAgo(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr`;
  return `${Math.round(hr / 24)} d`;
}

export function InboxTab() {
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [filter, setFilter] = useState<AckStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: InboxRow[] }>('/regulator/inbox');
      setRows(r.data?.data || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load regulator inbox.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const drillRow = useMemo(() => rows.find((r) => r.id === drillId) || null, [rows, drillId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.ack_status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((r) => r.ack_status === 'pending').length;
    const overdue = rows.filter((r) => r.ack_status === 'pending' && r.sla_due_at && new Date(r.sla_due_at).getTime() < Date.now()).length;
    const escalated = rows.filter((r) => r.ack_status === 'escalated').length;
    const critical = rows.filter((r) => r.severity === 'critical' && r.ack_status === 'pending').length;
    return { total, pending, overdue, escalated, critical };
  }, [rows]);

  async function run(path: string, body?: Record<string, unknown>) {
    if (!drillRow) return;
    setBusy(true);
    try {
      await api.post(`/regulator/inbox/${drillRow.id}/${path}`, body || {});
      setNote('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="regulator-inbox-tab" className="space-y-4">
      {/* KPI strip */}
      <div data-testid="regulator-inbox-kpis" className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi label="Total events" value={kpis.total} />
        <Kpi label="Pending" value={kpis.pending} tone={kpis.pending > 0 ? 'warn' : 'good'} />
        <Kpi label="Overdue" value={kpis.overdue} tone={kpis.overdue > 0 ? 'bad' : 'good'} />
        <Kpi label="Escalated" value={kpis.escalated} tone={kpis.escalated > 0 ? 'bad' : 'good'} />
        <Kpi label="Critical open" value={kpis.critical} tone={kpis.critical > 0 ? 'bad' : 'good'} />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'acknowledged', 'escalated', 'dismissed'] as const).map((s) => (
          <button type="button"
            key={s}
            data-testid={`regulator-inbox-filter-${s}`}
            onClick={() => setFilter(s)}
            className={`h-7 px-3 rounded-full text-[11px] font-semibold border ${filter === s ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]' : 'bg-white text-[#445566] border-[#d8dee6]'}`}
          >
            {s === 'all' ? 'All' : STATUS_TONE[s].label}
          </button>
        ))}
        <button type="button" onClick={load} className="h-7 px-3 rounded-full text-[11px] font-semibold border border-[#d8dee6] bg-white text-[#1a3a5c] ml-auto">
          Refresh
        </button>
      </div>

      {error && <div className="rounded-md border border-[#f0c2c0] bg-[#fcebea] text-[#9b1f1f] text-[12px] px-3 py-2">{error}</div>}
      {loading && <div className="text-[12px] text-[#6b7685]">Loading…</div>}

      {/* Table */}
      <div data-testid="regulator-inbox-table" className="border border-[#e5e9ee] rounded-md overflow-hidden">
        <div className="grid grid-cols-[110px_1fr_140px_170px_140px] gap-2 px-3 py-2 bg-[#f7f9fb] text-[11px] uppercase font-bold text-[#6b7685]">
          <div>Severity</div>
          <div>Title</div>
          <div>Status</div>
          <div>SLA</div>
          <div>Received</div>
        </div>
        {filtered.length === 0 && !loading && (
          <div className="px-3 py-6 text-center text-[12px] text-[#6b7685]">
            No inbox events match this filter.
          </div>
        )}
        {filtered.map((r) => {
          const st = STATUS_TONE[r.ack_status];
          const sv = SEVERITY_TONE[r.severity];
          const sla = slaTone(r.sla_due_at, r.ack_status);
          return (
            <button type="button"
              key={r.id}
              data-testid={`regulator-inbox-row-${r.id}`}
              onClick={() => setDrillId(r.id)}
              className="w-full grid grid-cols-[110px_1fr_140px_170px_140px] gap-2 px-3 py-2 border-t border-[#e5e9ee] text-left text-[12px] hover:bg-[#f7f9fb]"
            >
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: sv.bg, color: sv.fg }}>
                  {r.severity}
                </span>
              </div>
              <div className="truncate" title={r.title}>{r.title}</div>
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: st.bg, color: st.fg }}>
                  {st.label}
                </span>
              </div>
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono" style={{ background: sla.bg, color: sla.fg }}>
                  {sla.label}
                </span>
              </div>
              <div className="font-mono text-[10px] text-[#6b7685]">
                {new Date(r.created_at).toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Drill-down */}
      {drillRow && (
        <div data-testid="regulator-inbox-drill" className="border border-[#1a3a5c] rounded-md p-4 bg-[#f7f9fb] space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[11px] uppercase font-bold text-[#6b7685]">
                {drillRow.source_event} · {drillRow.source_entity_type}/{drillRow.source_entity_id.slice(0, 12)}…
              </div>
              <div className="text-[14px] font-bold text-[#1a3a5c]">{drillRow.title}</div>
            </div>
            <button type="button" onClick={() => setDrillId(null)} className="text-[11px] text-[#6b7685] hover:text-[#1a3a5c]">Close ×</button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Field label="Status" value={STATUS_TONE[drillRow.ack_status].label} />
            <Field label="Severity" value={drillRow.severity} />
            <Field label="SLA" value={drillRow.sla_due_at ? new Date(drillRow.sla_due_at).toLocaleString() : '—'} />
            <Field label="Received" value={new Date(drillRow.created_at).toLocaleString()} />
            {drillRow.assigned_to && <Field label="Assigned to" value={drillRow.assigned_to} />}
            {drillRow.ack_by && <Field label="Actioned by" value={drillRow.ack_by} />}
            {drillRow.escalated_to_case && <Field label="Escalated to case" value={drillRow.escalated_to_case} />}
          </div>
          {drillRow.ack_note && (
            <Field label="Note" value={drillRow.ack_note} />
          )}
          {drillRow.body_json && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-[#1a3a5c] font-semibold">Event payload</summary>
              <pre className="mt-2 p-2 bg-white border border-[#e5e9ee] rounded font-mono text-[10px] overflow-auto whitespace-pre-wrap">
                {(() => {
                  try { return JSON.stringify(JSON.parse(drillRow.body_json!), null, 2); }
                  catch { return drillRow.body_json; }
                })()}
              </pre>
            </details>
          )}

          {drillRow.ack_status === 'pending' && (
            <div data-testid="regulator-inbox-actions" className="border-t border-[#d8dee6] pt-3 space-y-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a triage note (optional)"
                className="w-full h-9 px-3 rounded border border-[#d8dee6] text-[12px]"
              />
              <div className="flex gap-2 flex-wrap">
                <button type="button"
                  data-testid="regulator-inbox-ack"
                  disabled={busy}
                  onClick={() => run('ack', { note })}
                  className="h-8 px-3 rounded bg-[#1f6b3a] text-white text-[11px] font-semibold disabled:opacity-50"
                >
                  Acknowledge
                </button>
                <button type="button"
                  data-testid="regulator-inbox-escalate"
                  disabled={busy}
                  onClick={() => run('escalate', { reason: note, open_case: true })}
                  className="h-8 px-3 rounded bg-[#9b1f1f] text-white text-[11px] font-semibold disabled:opacity-50"
                >
                  Escalate &amp; open case
                </button>
                <button type="button"
                  data-testid="regulator-inbox-dismiss"
                  disabled={busy}
                  onClick={() => run('dismiss', { note })}
                  className="h-8 px-3 rounded border border-[#d8dee6] bg-white text-[#445566] text-[11px] font-semibold disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'good' ? '#1f6b3a' : '#1a3a5c';
  return (
    <div className="bg-white border border-[#e5e9ee] rounded-md p-3">
      <div className="text-[10px] uppercase font-bold text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-bold text-[#6b7685]">{label}</div>
      <div className="text-[12px] text-[#1a3a5c]">{value}</div>
    </div>
  );
}
