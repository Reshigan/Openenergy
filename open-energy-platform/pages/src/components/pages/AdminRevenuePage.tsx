import React from 'react';
import { WorkstationShell, ListingTable, Pill } from '../launch/WorkstationShell';
import type { WorkstationKpi } from '../launch/WorkstationShell';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

// ── By-event breakdown tab ───────────────────────────────────────────────────

type ByEventRow = { trigger_event: string; events: number; fee_zar: number; value_zar: number };

function ByEventTab() {
  const [rows, setRows] = React.useState<ByEventRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const token = localStorage.getItem('token') || '';
    fetch('/api/admin/revenue/by-event', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => setRows((j.data as ByEventRow[]) || []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-[12px] text-[var(--ink-2, #6b7685)]">Loading…</div>;
  if (err) return <div className="p-4 text-[12px] text-red-600">{err}</div>;
  if (!rows.length) return (
    <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-[var(--s1, #f8fafc)] p-6 text-center">
      <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">No revenue events this period</div>
      <div className="text-[12px] text-[var(--ink-2, #6b7685)] mt-1">Fee events will appear here as chains fire billable triggers.</div>
    </div>
  );

  return (
    <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 overflow-x-auto">
      <table className="w-full text-[13px] min-w-[540px]">
        <thead className="bg-[var(--s1, #f8fafc)] text-left text-[10px] uppercase tracking-wide text-[var(--ink-2, #6b7685)]">
          <tr>
            <th className="px-4 py-2">Trigger event</th>
            <th className="px-4 py-2 text-right">Events</th>
            <th className="px-4 py-2 text-right">Fee ZAR</th>
            <th className="px-4 py-2 text-right">Notional value ZAR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.trigger_event} className="border-t border-[var(--border-subtle, #e5ebf2)]">
              <td className="px-4 py-2 font-mono text-[11px]">{r.trigger_event}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.events}</td>
              <td className="px-4 py-2 text-right tabular-nums font-medium">{formatZAR(r.fee_zar)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--ink-2, #6b7685)]">{formatZAR(r.value_zar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── By-role breakdown tab ────────────────────────────────────────────────────

type ByRoleRow = { payer_role: string; events: number; fee_zar: number };

function ByRoleTab() {
  const [rows, setRows] = React.useState<ByRoleRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const token = localStorage.getItem('token') || '';
    fetch('/api/admin/revenue/by-role', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => setRows((j.data as ByRoleRow[]) || []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-[12px] text-[var(--ink-2, #6b7685)]">Loading…</div>;
  if (err) return <div className="p-4 text-[12px] text-red-600">{err}</div>;
  if (!rows.length) return (
    <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-[var(--s1, #f8fafc)] p-6 text-center">
      <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">No data</div>
    </div>
  );

  return (
    <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 overflow-x-auto">
      <table className="w-full text-[13px] min-w-[360px]">
        <thead className="bg-[var(--s1, #f8fafc)] text-left text-[10px] uppercase tracking-wide text-[var(--ink-2, #6b7685)]">
          <tr>
            <th className="px-4 py-2">Payer role</th>
            <th className="px-4 py-2 text-right">Events</th>
            <th className="px-4 py-2 text-right">Fee ZAR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.payer_role} className="border-t border-[var(--border-subtle, #e5ebf2)]">
              <td className="px-4 py-2"><Pill tone="info">{r.payer_role}</Pill></td>
              <td className="px-4 py-2 text-right tabular-nums">{r.events}</td>
              <td className="px-4 py-2 text-right tabular-nums font-medium">{formatZAR(r.fee_zar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Leakage tab ──────────────────────────────────────────────────────────────

type LeakageRow = { trigger_event: string; r0_events: number; forgone_value_zar: number };

function LeakageTab() {
  const [rows, setRows] = React.useState<LeakageRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const token = localStorage.getItem('token') || '';
    fetch('/api/admin/revenue/leakage', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => setRows((j.data as LeakageRow[]) || []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-[12px] text-[var(--ink-2, #6b7685)]">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 p-4 text-[12px] text-[var(--ink-2, #3d4756)] leading-relaxed">
        Leakage = billable events that fired with a R0 fee against a non-zero notional. These are
        events where a fee schedule row exists but <code className="font-mono bg-[#f0f4f8] px-1 rounded">is_enabled = 0</code>.
        Use the Fee Schedule tab to flip them live.
      </div>
      {!rows.length ? (
        <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-[var(--s1, #f8fafc)] p-6 text-center">
          <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">No leakage detected</div>
          <div className="text-[12px] text-[var(--ink-2, #6b7685)] mt-1">All billable events are either fee-enabled or carry zero value.</div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 overflow-x-auto">
          <table className="w-full text-[13px] min-w-[480px]">
            <thead className="bg-[var(--s1, #f8fafc)] text-left text-[10px] uppercase tracking-wide text-[var(--ink-2, #6b7685)]">
              <tr>
                <th className="px-4 py-2">Trigger event</th>
                <th className="px-4 py-2 text-right">R0 events</th>
                <th className="px-4 py-2 text-right">Forgone value ZAR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.trigger_event} className="border-t border-[var(--border-subtle, #e5ebf2)]">
                  <td className="px-4 py-2 font-mono text-[11px]">{r.trigger_event}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.r0_events}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[#b4453a] font-medium">{formatZAR(r.forgone_value_zar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Fee schedule tab ─────────────────────────────────────────────────────────

type ScheduleRow = {
  id: string;
  trigger_event: string;
  fee_type: string;
  rate: number | null;
  min_fee_zar: number | null;
  max_fee_zar: number | null;
  payer_role: string | null;
  is_enabled: number;
  description: string | null;
};

function ScheduleTab() {
  const [rows, setRows] = React.useState<ScheduleRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [toggling, setToggling] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    const token = localStorage.getItem('token') || '';
    fetch('/api/admin/revenue/schedule', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(j => setRows((j.data as ScheduleRow[]) || []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function toggleEnabled(row: ScheduleRow) {
    setToggling(row.id);
    const token = localStorage.getItem('token') || '';
    try {
      await fetch(`/api/admin/revenue/schedule/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_enabled: row.is_enabled ? 0 : 1 }),
      });
      load();
    } catch {
      // best-effort
    } finally {
      setToggling(null);
    }
  }

  if (loading) return <div className="p-4 text-[12px] text-[var(--ink-2, #6b7685)]">Loading schedule…</div>;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 p-3 text-[12px] text-[var(--ink-2, #3d4756)] leading-relaxed">
        Toggle a fee live with the switch. All changes are cascade-audited under{' '}
        <code className="font-mono bg-[#f0f4f8] px-1 rounded">fee_schedule.updated</code>.
        No deploy required — rates take effect immediately for new events.
      </div>
      {!rows.length ? (
        <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-[var(--s1, #f8fafc)] p-6 text-center">
          <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">No fee schedule rows</div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 overflow-x-auto">
          <table className="w-full text-[13px] min-w-[700px]">
            <thead className="bg-[var(--s1, #f8fafc)] text-left text-[10px] uppercase tracking-wide text-[var(--ink-2, #6b7685)]">
              <tr>
                <th className="px-4 py-2">Trigger event</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Payer role</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-right">Min</th>
                <th className="px-4 py-2 text-right">Max</th>
                <th className="px-4 py-2 text-center">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-[var(--border-subtle, #e5ebf2)]">
                  <td className="px-4 py-2 font-mono text-[11px]">{r.trigger_event}</td>
                  <td className="px-4 py-2"><Pill tone="info">{r.fee_type || '—'}</Pill></td>
                  <td className="px-4 py-2 text-[12px] text-[var(--ink-2, #3d4756)]">{r.payer_role || 'unattributed'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[12px]">{r.rate != null ? `${(r.rate * 100).toFixed(2)}%` : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[12px]">{r.min_fee_zar != null ? formatZAR(r.min_fee_zar) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[12px]">{r.max_fee_zar != null ? formatZAR(r.max_fee_zar) : '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => void toggleEnabled(r)}
                      disabled={toggling === r.id}
                      title={r.is_enabled ? 'Click to disable' : 'Click to enable'}
                      className={`inline-flex items-center justify-center w-10 h-6 rounded-full transition-colors disabled:opacity-40 ${r.is_enabled ? 'bg-[#2a7a3b]' : 'bg-[var(--border-subtle, #dde4ec)]'}`}
                    >
                      <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${r.is_enabled ? 'translate-x-2' : '-translate-x-2'}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Top events tab ───────────────────────────────────────────────────────────

function TopEventsTab() {
  return (
    <ListingTable
      endpoint="/admin/revenue/top-events?limit=20"
      rowKey={(r) => r.trigger_event as string}
      empty={{ title: 'No revenue events yet', description: 'Top fee-generating events by total ZAR will appear here.' }}
      columns={[
        { key: 'trigger_event', label: 'Trigger event', render: (r) => <span className="font-mono text-[11px]">{r.trigger_event as string}</span> },
        { key: 'events', label: 'Events', align: 'right' },
        { key: 'fee_zar', label: 'Fee ZAR', align: 'right', render: (r) => <span className="font-medium">{formatZAR(r.fee_zar as number)}</span> },
      ]}
    />
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

type SummaryData = {
  period: string;
  events: number;
  total_fee_zar: number;
  free_events: number;
  paid_events: number;
};

type ArrData = {
  monthly_fee_zar: number;
  projected_arr_zar: number;
};

type ScheduleMeta = {
  total: number;
  enabled: number;
};

export function AdminRevenuePage() {
  const [kpis, setKpis] = React.useState<WorkstationKpi[]>([]);

  React.useEffect(() => {
    const token = localStorage.getItem('token') || '';
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/admin/revenue/summary', { headers: h }).then(r => r.json()),
      fetch('/api/admin/revenue/arr', { headers: h }).then(r => r.json()),
      fetch('/api/admin/revenue', { headers: h }).then(r => r.json()),
    ])
      .then(([s, a, root]) => {
        const summary = s.data as SummaryData | undefined;
        const arr = a.data as ArrData | undefined;
        const sched = root.data?.schedule as ScheduleMeta | undefined;
        setKpis([
          { label: 'MTD Fees Collected', value: formatZAR(summary?.total_fee_zar ?? 0), caption: `period ${summary?.period ?? '—'}` },
          { label: 'Projected ARR', value: formatZAR(arr?.projected_arr_zar ?? 0), caption: `${formatZAR(arr?.monthly_fee_zar ?? 0)}/mo` },
          { label: 'Fee Leakage (R0 events)', value: String(summary?.free_events ?? 0), caption: `of ${summary?.events ?? 0} total events`, tone: (summary?.free_events ?? 0) > 0 ? 'warn' : undefined },
          { label: 'Active Fee Schedules', value: `${sched?.enabled ?? 0} / ${sched?.total ?? 0}`, caption: 'enabled rows' },
        ]);
      })
      .catch(() => null);
  }, []);

  return (
    <WorkstationShell
      role="admin"
      eyebrow="Admin · Revenue"
      title="Revenue & Fee Analytics"
      subtitle="Platform fee collection · schedule management · leakage detection · ARR projection"
      backHref="/admin-platform"
      backLabel="Admin platform"
      kpis={kpis}
      tabs={[
        { key: 'by_event', label: 'By event', body: () => <ByEventTab /> },
        { key: 'by_role', label: 'By role', body: () => <ByRoleTab /> },
        { key: 'leakage', label: 'Leakage', body: () => <LeakageTab /> },
        { key: 'top_events', label: 'Top events', body: () => <TopEventsTab /> },
        { key: 'schedule', label: 'Fee schedule', body: () => <ScheduleTab /> },
      ]}
    />
  );
}
