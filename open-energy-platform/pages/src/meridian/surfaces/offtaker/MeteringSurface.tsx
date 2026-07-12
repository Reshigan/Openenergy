// pages/src/meridian/surfaces/offtaker/MeteringSurface.tsx
//
// Meridian surface — "Metering & readings" (offtaker role). Read-only view of the metering data
// that feeds settlement: a KPI strip rolled up from GET /api/metering/summary (per-connection
// export/import kWh + peak demand over a window) above the granular reading register from
// GET /api/metering/readings, with a validated filter. Validation itself is a grid/admin action,
// not an offtaker one, so there are no write controls here. Bucket B read surface. Registered as
// `offtaker:metering`, reached via the roleData feature key `metering`.
import React, { useEffect, useState } from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

type Conn = {
  project_name?: string; connection_id?: string; connection_point?: string;
  readings?: number; export_kwh_sum?: number; import_kwh_sum?: number; peak_demand_kw?: number;
};

const num = (v: any, dp = 0) =>
  v == null ? '—' : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: dp });

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-surface-v2 px-4 py-3 min-w-[150px]">
      <div className="text-[11px] uppercase tracking-wide text-[var(--ink3)]">{label}</div>
      <div className="text-[20px] font-semibold text-[var(--ink)] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[var(--ink3)]">{sub}</div>}
    </div>
  );
}

export default function MeteringSurface(_props: { role: string }) {
  const [summary, setSummary] = useState<{ days?: number; connections: Conn[] } | null>(null);
  const [validatedOnly, setValidatedOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('/metering/summary').then((res) => {
      if (!alive) return;
      const d = res.data?.data ?? res.data ?? {};
      setSummary({ days: d.days, connections: Array.isArray(d.connections) ? d.connections : [] });
    }).catch(() => alive && setSummary({ connections: [] }));
    return () => { alive = false; };
  }, []);

  const conns = summary?.connections ?? [];
  const totExport = conns.reduce((a, c) => a + (Number(c.export_kwh_sum) || 0), 0);
  const totImport = conns.reduce((a, c) => a + (Number(c.import_kwh_sum) || 0), 0);
  const peak = conns.reduce((a, c) => Math.max(a, Number(c.peak_demand_kw) || 0), 0);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <KpiCard label={`Export (${summary?.days ?? '—'}d)`} value={`${num(totExport)} kWh`} sub={`${conns.length} connections`} />
        <KpiCard label="Import" value={`${num(totImport)} kWh`} />
        <KpiCard label="Peak demand" value={`${num(peak, 1)} kW`} />
      </div>

      {conns.length > 0 && (
        <div className="rounded-lg border border-[var(--line)] overflow-hidden mb-4">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink3)] bg-[var(--raised)]">Per-connection rollup</div>
          <table className="w-full text-[12px]">
            <thead><tr className="text-[var(--ink3)] border-b border-[var(--line)]">
              <th className="text-left px-4 py-1.5 font-medium">Project</th>
              <th className="text-left px-4 py-1.5 font-medium">Connection</th>
              <th className="text-right px-4 py-1.5 font-medium">Export kWh</th>
              <th className="text-right px-4 py-1.5 font-medium">Import kWh</th>
              <th className="text-right px-4 py-1.5 font-medium">Peak kW</th>
              <th className="text-right px-4 py-1.5 font-medium">Readings</th>
            </tr></thead>
            <tbody>
              {conns.map((c, i) => (
                <tr key={c.connection_id ?? i} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-1.5">{c.project_name || '—'}</td>
                  <td className="px-4 py-1.5 text-[var(--ink3)]">{c.connection_point || c.connection_id || '—'}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{num(c.export_kwh_sum)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{num(c.import_kwh_sum)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{num(c.peak_demand_kw, 1)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-[var(--ink3)]">{num(c.readings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink3)]">Reading register</div>
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--ink2)]">
          <input type="checkbox" checked={validatedOnly} onChange={(e) => setValidatedOnly(e.target.checked)} />
          Validated only
        </label>
      </div>
      <ListingTable
        key={validatedOnly ? 'v' : 'all'}
        endpoint={`/metering/readings${validatedOnly ? '?validated=1' : ''}`}
        rowKey={(r) => r.id ?? `${r.connection_id}-${r.reading_date}`}
        empty={{ title: 'No readings', description: 'Meter readings will appear here once submitted.' }}
        columns={[
          { key: 'reading_date', label: 'Date', render: (r) => (r.reading_date ? new Date(r.reading_date).toLocaleDateString() : '—') },
          { key: 'project_name', label: 'Project', render: (r) => r.project_name || r.connection_point || '—' },
          { key: 'export_kwh', label: 'Export kWh', align: 'right', render: (r) => num(r.export_kwh) },
          { key: 'import_kwh', label: 'Import kWh', align: 'right', render: (r) => num(r.import_kwh) },
          { key: 'peak_demand_kw', label: 'Peak kW', align: 'right', render: (r) => num(r.peak_demand_kw, 1) },
          { key: 'power_factor', label: 'PF', align: 'right', render: (r) => (r.power_factor == null ? '—' : num(r.power_factor, 2)) },
          { key: 'reading_type', label: 'Type' },
          { key: 'validated', label: 'Validated', render: (r) => <Pill tone={r.validated ? 'good' : 'neutral'}>{r.validated ? 'validated' : 'pending'}</Pill> },
        ]}
      />
    </div>
  );
}
