// Lender dunning queue — Wave 6 P6-grade borrower observation loop.
//
// Lives on the Lender suite as a tab. Surfaces:
//   • Cycle 1/2/3 dunning notices with cure deadlines
//   • Watchlist tier per notice (cycle ↔ tier mapping enforced server-side)
//   • Ack + cure (borrower) and withdraw (lender) actions
//
// Server-side enforcement: borrowers only see their own notices. Lender +
// admin + support see everything.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type Status = 'issued' | 'acknowledged' | 'cured' | 'overdue' | 'withdrawn' | 'escalated';

interface DunningRow {
  id: string;
  watchlist_id: string | null;
  facility_id: string;
  borrower_id: string;
  cycle: number;
  trigger_signal: string;
  title: string;
  body_json: string | null;
  status: Status;
  issued_at: string;
  issued_by: string | null;
  cure_deadline_at: string;
  acked_at: string | null;
  cured_at: string | null;
  overdue_flagged_at: string | null;
  escalated_at: string | null;
  parent_notice_id: string | null;
}

const STATUS_TONE: Record<Status, { bg: string; fg: string; label: string }> = {
  issued: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Issued' },
  acknowledged: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Acknowledged' },
  cured: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Cured' },
  overdue: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Overdue' },
  withdrawn: { bg: '#f0f3f7', fg: '#445566', label: 'Withdrawn' },
  escalated: { bg: '#ffe5cc', fg: '#a04200', label: 'Escalated' },
};

const CYCLE_TONE: Record<number, { bg: string; fg: string }> = {
  1: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)' },
  2: { bg: '#fff4d6', fg: '#a06200' },
  3: { bg: '#fde0e0', fg: '#9b1f1f' },
};

function cureTone(deadline: string, status: Status): { bg: string; fg: string; label: string } {
  if (status === 'cured' || status === 'withdrawn') return { bg: '#f0f3f7', fg: '#445566', label: new Date(deadline).toLocaleString() };
  const due = new Date(deadline).getTime();
  const now = Date.now();
  if (due < now) return { bg: '#fde0e0', fg: '#9b1f1f', label: `Overdue ${msAgo(now - due)}` };
  return { bg: '#daf5e2', fg: '#1f6b3a', label: `In ${msAgo(due - now)}` };
}

function msAgo(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr`;
  return `${Math.round(hr / 24)} d`;
}

export function DunningTab() {
  const [rows, setRows] = useState<DunningRow[]>([]);
  const [filter, setFilter] = useState<Status | 'all' | 'open'>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: DunningRow[] }>('/lender/dunning');
      setRows(r.data?.data || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load dunning queue.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const drillRow = useMemo(() => rows.find((r) => r.id === drillId) || null, [rows, drillId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') return rows.filter((r) => ['issued', 'acknowledged', 'overdue'].includes(r.status));
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const open = rows.filter((r) => ['issued', 'acknowledged', 'overdue'].includes(r.status)).length;
    const overdue = rows.filter((r) => r.status === 'overdue').length;
    const cycle2 = rows.filter((r) => r.cycle === 2 && ['issued', 'acknowledged', 'overdue'].includes(r.status)).length;
    const cycle3 = rows.filter((r) => r.cycle === 3 && ['issued', 'acknowledged', 'overdue'].includes(r.status)).length;
    return { total, open, overdue, cycle2, cycle3 };
  }, [rows]);

  async function run(action: 'ack' | 'cure' | 'withdraw', body?: Record<string, unknown>) {
    if (!drillRow) return;
    setBusy(true);
    try {
      await api.post(`/lender/dunning/${drillRow.id}/${action}`, body || {});
      setEvidence(''); setNote('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="lender-dunning-tab" className="space-y-4">
      {/* KPI strip */}
      <div data-testid="lender-dunning-kpis" className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi label="Total notices" value={kpis.total} />
        <Kpi label="Open" value={kpis.open} tone={kpis.open > 0 ? 'warn' : 'good'} />
        <Kpi label="Overdue" value={kpis.overdue} tone={kpis.overdue > 0 ? 'bad' : 'good'} />
        <Kpi label="Cycle 2 open" value={kpis.cycle2} tone={kpis.cycle2 > 0 ? 'warn' : 'good'} />
        <Kpi label="Cycle 3 open" value={kpis.cycle3} tone={kpis.cycle3 > 0 ? 'bad' : 'good'} />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(['open', 'all', 'issued', 'acknowledged', 'overdue', 'cured'] as const).map((s) => (
          <button type="button"
            key={s}
            data-testid={`lender-dunning-filter-${s}`}
            onClick={() => setFilter(s)}
            className={`h-7 px-3 rounded-full text-[11px] font-semibold border ${filter === s ? 'bg-[#a8385c] text-white border-[#a8385c]' : 'bg-white text-[#445566] border-[#d8dee6]'}`}
          >
            {s === 'open' ? 'Open' : s === 'all' ? 'All' : STATUS_TONE[s as Status].label}
          </button>
        ))}
        <button type="button" onClick={load} className="h-7 px-3 rounded-full text-[11px] font-semibold border border-[#d8dee6] bg-white ml-auto" style={{ color: 'oklch(0.46 0.16 55)' }}>
          Refresh
        </button>
      </div>

      {error && <div className="rounded-md border border-[#f0c2c0] bg-[#fcebea] text-[#9b1f1f] text-[12px] px-3 py-2">{error}</div>}
      {loading && <div className="text-[12px] text-[#6b7685]">Loading…</div>}

      {/* Table */}
      <div data-testid="lender-dunning-table" className="border border-[#e5e9ee] rounded-md overflow-hidden">
        <div className="grid grid-cols-[70px_1fr_140px_170px_140px] gap-2 px-3 py-2 bg-[#f7f9fb] text-[11px] uppercase font-bold text-[#6b7685]">
          <div>Cycle</div>
          <div>Title</div>
          <div>Status</div>
          <div>Cure deadline</div>
          <div>Issued</div>
        </div>
        {filtered.length === 0 && !loading && (
          <div className="px-3 py-6 text-center text-[12px] text-[#6b7685]">
            No dunning notices match this filter.
          </div>
        )}
        {filtered.map((r) => {
          const st = STATUS_TONE[r.status];
          const cy = CYCLE_TONE[r.cycle] || CYCLE_TONE[1];
          const cure = cureTone(r.cure_deadline_at, r.status);
          return (
            <button type="button"
              key={r.id}
              data-testid={`lender-dunning-row-${r.id}`}
              onClick={() => setDrillId(r.id)}
              className="w-full grid grid-cols-[70px_1fr_140px_170px_140px] gap-2 px-3 py-2 border-t border-[#e5e9ee] text-left text-[12px] hover:bg-[#f7f9fb]"
            >
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: cy.bg, color: cy.fg }}>
                  cycle {r.cycle}
                </span>
              </div>
              <div className="truncate" title={r.title}>{r.title}</div>
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: st.bg, color: st.fg }}>
                  {st.label}
                </span>
              </div>
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono" style={{ background: cure.bg, color: cure.fg }}>
                  {cure.label}
                </span>
              </div>
              <div className="font-mono text-[10px] text-[#6b7685]">
                {new Date(r.issued_at).toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Drill-down */}
      {drillRow && (
        <div data-testid="lender-dunning-drill" className="border border-[#a8385c] rounded-md p-4 bg-[#f7f9fb] space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[11px] uppercase font-bold text-[#6b7685]">
                cycle {drillRow.cycle} · {drillRow.trigger_signal} · {drillRow.facility_id}
              </div>
              <div className="text-[14px] font-bold text-[#a8385c]">{drillRow.title}</div>
            </div>
            <button type="button" onClick={() => setDrillId(null)} className="text-[11px] text-[#6b7685] hover:text-[oklch(0.46_0.16_55)]">Close ×</button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Field label="Status" value={STATUS_TONE[drillRow.status].label} />
            <Field label="Cycle" value={drillRow.cycle} />
            <Field label="Cure deadline" value={new Date(drillRow.cure_deadline_at).toLocaleString()} />
            <Field label="Issued" value={new Date(drillRow.issued_at).toLocaleString()} />
            {drillRow.acked_at && <Field label="Acknowledged" value={new Date(drillRow.acked_at).toLocaleString()} />}
            {drillRow.cured_at && <Field label="Cured" value={new Date(drillRow.cured_at).toLocaleString()} />}
            {drillRow.parent_notice_id && <Field label="Parent notice" value={drillRow.parent_notice_id} />}
          </div>
          {drillRow.body_json && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-[#a8385c] font-semibold">Notice payload</summary>
              <pre className="mt-2 p-2 bg-white border border-[#e5e9ee] rounded font-mono text-[10px] overflow-auto whitespace-pre-wrap">
                {(() => {
                  try { return JSON.stringify(JSON.parse(drillRow.body_json!), null, 2); }
                  catch { return drillRow.body_json; }
                })()}
              </pre>
            </details>
          )}

          {['issued', 'acknowledged', 'overdue'].includes(drillRow.status) && (
            <div data-testid="lender-dunning-actions" className="border-t border-[#d8dee6] pt-3 space-y-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
                className="w-full h-9 px-3 rounded border border-[#d8dee6] text-[12px]"
              />
              <input
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Cure evidence R2 key (required to mark cured)"
                className="w-full h-9 px-3 rounded border border-[#d8dee6] text-[12px] font-mono"
              />
              <div className="flex gap-2 flex-wrap">
                {drillRow.status === 'issued' && (
                  <button type="button"
                    data-testid="lender-dunning-ack"
                    disabled={busy}
                    onClick={() => run('ack', { note })}
                    className="h-8 px-3 rounded bg-[#c2873a] text-white text-[11px] font-semibold disabled:opacity-50"
                  >
                    Acknowledge
                  </button>
                )}
                <button type="button"
                  data-testid="lender-dunning-cure"
                  disabled={busy || !evidence}
                  onClick={() => run('cure', { evidence_r2_key: evidence, note })}
                  className="h-8 px-3 rounded bg-[#1f6b3a] text-white text-[11px] font-semibold disabled:opacity-50"
                >
                  Mark cured
                </button>
                <button type="button"
                  data-testid="lender-dunning-withdraw"
                  disabled={busy || !note}
                  onClick={() => run('withdraw', { reason: note })}
                  className="h-8 px-3 rounded border border-[#d8dee6] bg-white text-[#445566] text-[11px] font-semibold disabled:opacity-50"
                >
                  Withdraw (lender)
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
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'good' ? '#1f6b3a' : '#a8385c';
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
      <div className="text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>{value}</div>
    </div>
  );
}
