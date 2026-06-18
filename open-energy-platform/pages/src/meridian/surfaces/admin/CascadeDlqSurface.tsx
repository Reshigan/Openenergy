// pages/src/meridian/surfaces/admin/CascadeDlqSurface.tsx
//
// Meridian surface — "Cascade DLQ" (admin role). Extracted verbatim from the inline
// `CascadeDlqTab` body of the AdminWorkstationPage husk (E2.1). Self-contained: the #1 admin AI
// card ("N items stuck in DLQ") lands here. The read view came from monitoring.ts; the
// retry/resolve endpoints are admin-gated on the admin router. Every cascade stage that fails 3×
// lands a row here, so this surface is where an operator drains the failed-automation backlog:
// REPLAY a stage (retry) or mark it handled out-of-band (resolve). Inline row actions — no modal
// hop. Resolve expands a one-row inline form (resolved/abandoned + optional note) right under the
// row it acts on. Registered as `admin:monitoring` in surfaces.tsx, reached from Atlas (⌘K) via
// the roleData feature key `monitoring`. Non-chain operational surface (Bucket D).
import React, { useState } from 'react';
import { Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

type DlqRow = {
  id: string;
  event: string;
  entity_type: string;
  entity_id: string;
  stage: string;
  error_message: string;
  attempt_count: number;
  created_at: string;
  last_attempt_at: string;
};

const STAGE_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  audit: 'bad', commercial: 'warn', analytics: 'info',
  registry: 'info', notifications: 'info', webhooks: 'warn', special: 'warn',
};

export default function CascadeDlqSurface(_props: { role: string }) {
  const [rows, setRows] = useState<DlqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Per-row transient state: the id currently mid-request, the last replay
  // result, and the id whose inline resolve form is expanded.
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'abandoned' | 'resolved'>('abandoned');
  const [resolveNote, setResolveNote] = useState('');

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/admin/monitoring/cascade-dlq?status=pending&limit=200');
      setRows((res.data?.data as DlqRow[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function retry(id: string) {
    setBusy(id);
    setResult((m) => { const n = { ...m }; delete n[id]; return n; });
    try {
      const res = await api.post(`/admin/cascade-dlq/${id}/retry`);
      const ok = !!res.data?.ok;
      if (ok) {
        // Resolved server-side — drop it from the pending list immediately.
        setRows((rs) => rs.filter((r) => r.id !== id));
      } else {
        setResult((m) => ({ ...m, [id]: res.data?.error || 'Replay failed — left pending' }));
        await load();
      }
    } catch (e: unknown) {
      setResult((m) => ({ ...m, [id]: e instanceof Error ? e.message : 'Retry request failed' }));
    } finally {
      setBusy(null);
    }
  }

  function openResolve(id: string) {
    setResolving(id);
    setResolveStatus('abandoned');
    setResolveNote('');
  }

  async function submitResolve(id: string) {
    setBusy(id);
    try {
      await api.post(`/admin/cascade-dlq/${id}/resolve`, {
        status: resolveStatus,
        note: resolveNote.trim() || undefined,
      });
      setResolving(null);
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (e: unknown) {
      setResult((m) => ({ ...m, [id]: e instanceof Error ? e.message : 'Resolve request failed' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] leading-relaxed text-[var(--ink2)] max-w-2xl">
          Cascade stages that fail three retries dead-letter here. <strong>Retry</strong> replays
          the failed stage (audit / notifications / webhooks / registry / analytics / commercial);
          on success the row clears. <strong>Resolve</strong> marks a row handled out-of-band —
          choose <em>abandoned</em> (won't replay) or <em>resolved</em>, with an optional note for
          the audit trail. Both actions are admin-audited.
        </p>
        <button type="button"
          onClick={() => void load()}
          className="shrink-0 h-8 px-3 rounded-md border border-[var(--line)] bg-white text-[12px] font-medium text-[var(--ink2)] hover:bg-[var(--raised)]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-[var(--line)] bg-white p-6 text-[12px] text-[var(--ink3)]">Loading DLQ…</div>
      ) : err ? (
        <div className="rounded-lg border border-[var(--oxide)] bg-[var(--oxide-tint)] p-4 text-[12px] text-[var(--oxide-deep)]">{err}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--raised)] p-6 text-center">
          <div className="text-[13px] font-semibold text-[var(--ink)]">DLQ is clear</div>
          <div className="text-[12px] text-[var(--ink3)] mt-1">No failed cascade stages pending. Nothing to drain.</div>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--line)] bg-white overflow-x-auto text-[var(--ink)]">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead className="bg-[var(--raised)] text-left text-[10px] uppercase tracking-wide text-[var(--ink3)]">
              <tr>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Entity</th>
                <th className="px-4 py-2">Error</th>
                <th className="px-4 py-2 text-right">Attempts</th>
                <th className="px-4 py-2">First seen</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowBusy = busy === r.id;
                const isResolving = resolving === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-[var(--line)] align-top">
                      <td className="px-4 py-2 font-mono text-[11px]">{r.event}</td>
                      <td className="px-4 py-2"><Pill tone={STAGE_TONE[r.stage] ?? 'info'}>{r.stage}</Pill></td>
                      <td className="px-4 py-2 text-[11px] text-[var(--ink2)]">
                        {r.entity_type}<span className="text-[var(--ink3)]"> · </span>
                        <span className="font-mono">{(r.entity_id || '').slice(0, 14)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="block truncate max-w-[260px] text-[11px] text-[var(--oxide-deep)]" title={r.error_message}>
                          {r.error_message || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[12px]">{r.attempt_count}</td>
                      <td className="px-4 py-2 text-[11px] text-[var(--ink3)] whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                          <button type="button"
                            onClick={() => void retry(r.id)}
                            disabled={rowBusy}
                            className="text-[11px] font-semibold text-[var(--petrol)] hover:underline disabled:opacity-40"
                          >
                            {rowBusy && !isResolving ? 'Retrying…' : 'Retry'}
                          </button>
                          <button type="button"
                            onClick={() => (isResolving ? setResolving(null) : openResolve(r.id))}
                            disabled={rowBusy}
                            className="text-[11px] font-medium text-[var(--ink3)] hover:text-[var(--ink2)] hover:underline disabled:opacity-40"
                          >
                            {isResolving ? 'Cancel' : 'Resolve'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {result[r.id] && !isResolving && (
                      <tr className="border-t border-[var(--line)] bg-[var(--oxide-tint)]">
                        <td colSpan={7} className="px-4 py-2 text-[11px] text-[var(--oxide-deep)]">{result[r.id]}</td>
                      </tr>
                    )}
                    {isResolving && (
                      <tr className="border-t border-[var(--line)] bg-[var(--raised)]">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-[11px] uppercase tracking-wide text-[var(--ink3)]">Mark</span>
                            <div className="inline-flex rounded-md border border-[var(--line)] overflow-hidden">
                              {(['abandoned', 'resolved'] as const).map((s) => (
                                <button type="button"
                                  key={s}
                                  onClick={() => setResolveStatus(s)}
                                  className={`px-3 h-8 text-[11px] font-medium ${resolveStatus === s ? 'bg-[var(--petrol)] text-white' : 'bg-white text-[var(--ink2)] hover:bg-[var(--raised)]'}`}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                            <input
                              value={resolveNote}
                              onChange={(e) => setResolveNote(e.target.value)}
                              placeholder="Optional note for the audit trail"
                              className="flex-1 min-w-[200px] h-8 px-2 rounded-md border border-[var(--line)] bg-white text-[12px] text-[var(--ink)] placeholder:text-[var(--ink3)]"
                            />
                            <button type="button"
                              onClick={() => void submitResolve(r.id)}
                              disabled={rowBusy}
                              className="h-8 px-3 rounded-md bg-[var(--petrol)] text-white text-[11px] font-semibold disabled:opacity-40"
                            >
                              {rowBusy ? 'Saving…' : 'Confirm'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
