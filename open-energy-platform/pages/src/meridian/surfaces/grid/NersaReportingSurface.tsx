// pages/src/meridian/surfaces/grid/NersaReportingSurface.tsx
//
// Meridian surface — "NERSA reporting" (grid_operator role). Renders the statutory
// grid-operator report (GET /api/reports/grid_operator): a KPI summary strip plus the two
// underlying sections — grid constraints and imbalance settlement — each with a certified
// CSV export (GET /api/reports/grid_operator/csv?section=constraints|imbalance, pulled as a
// blob so the JWT travels on the Authorization header). Bucket B / L3 reporting surface.
// Registered as `grid_operator:nersa_reporting` in surfaces.tsx, reached from Atlas (⌘K) via
// the roleData feature key `nersa_reporting`.
import React, { useEffect, useState } from 'react';
import { Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

const zar = (n: any) => (n == null || isNaN(Number(n)) ? '—' : `R${Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`);
const kwh = (n: any) => (n == null || isNaN(Number(n)) ? '—' : `${Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 })} kWh`);

// sections may arrive keyed ({constraints:[...], imbalance:[...]}) or as an array of named
// blocks — accept both so the surface survives either shape.
function pickSection(sections: any, name: string): any[] {
  if (!sections) return [];
  if (Array.isArray(sections)) {
    const s = sections.find((x) => x?.name === name || x?.key === name || x?.section === name);
    if (!s) return [];
    if (Array.isArray(s.rows)) return s.rows;
    if (Array.isArray(s.data)) return s.data;
    if (Array.isArray(s[name])) return s[name];
    return [];
  }
  return Array.isArray(sections[name]) ? sections[name] : [];
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--ink3)]">{label}</div>
      <div className="text-[15px] font-semibold text-[var(--ink)]">{value}</div>
    </div>
  );
}

function MiniTable({ title, rows, cols }: { title: string; rows: any[]; cols: { key: string; label: string; render?: (r: any) => React.ReactNode }[] }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white overflow-hidden">
      <div className="px-3 py-2 bg-[var(--raised)] text-[11px] font-semibold uppercase tracking-wide text-[var(--ink3)]">{title}</div>
      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12px] text-[var(--ink3)]">No rows for this period.</div>
      ) : (
        <table className="w-full text-[12px]">
          <thead className="text-[var(--ink3)] text-[10px] uppercase">
            <tr>{cols.map((c) => <th key={c.key} className="text-left px-3 py-1.5 font-semibold">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? i} className="border-t border-[var(--line)]">
                {cols.map((c) => <td key={c.key} className="px-3 py-1.5">{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function NersaReportingSurface(_props: { role: string }) {
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.get('/reports/grid_operator')
      .then((res) => { if (live) setData(res.data?.data ?? res.data); })
      .catch((e) => { if (live) setErr(e?.response?.data?.error || e?.message || 'Failed to load report'); });
    return () => { live = false; };
  }, []);

  const downloadCsv = async (section: string) => {
    setDownloading(section);
    try {
      const res = await api.get(`/reports/grid_operator/csv?section=${section}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grid_operator_${section}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // swallow — button just re-enables
    } finally {
      setDownloading(null);
    }
  };

  if (err) return <div className="rounded-lg border border-[var(--oxide)] bg-[var(--oxide-tint)] px-4 py-3 text-[12px] text-[var(--oxide-deep)]">{err}</div>;
  if (!data) return <div className="text-[12px] text-[var(--ink3)] px-1 py-6">Loading NERSA report…</div>;

  const summary = data.summary ?? {};
  const constraints = pickSection(data.sections, 'constraints');
  const imbalance = pickSection(data.sections, 'imbalance');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[var(--ink3)]">Generated {data.generated_at ? new Date(data.generated_at).toLocaleString() : '—'}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <Kpi label="Constraints" value={summary.constraints ?? '—'} />
        <Kpi label="Active" value={summary.active_constraints ?? '—'} />
        <Kpi label="Critical" value={summary.critical_severity ?? '—'} />
        <Kpi label="Imbalance periods" value={summary.imbalance_periods ?? '—'} />
        <Kpi label="Abs imbalance" value={kwh(summary.total_abs_imbalance_kwh)} />
        <Kpi label="Imbalance charges" value={zar(summary.total_imbalance_charges_zar)} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--ink2)]">Grid constraints</h3>
        <button type="button" disabled={downloading === 'constraints'} onClick={() => downloadCsv('constraints')}
          className="px-2 py-1 text-[11px] bg-[var(--petrol)] text-white rounded-md disabled:opacity-50">
          {downloading === 'constraints' ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      <MiniTable title="Constraints" rows={constraints} cols={[
        { key: 'constraint_type', label: 'Type', render: (r) => (r.constraint_type || '—').replace(/_/g, ' ') },
        { key: 'location', label: 'Location' },
        { key: 'severity', label: 'Severity', render: (r) => <Pill tone={r.severity === 'critical' ? 'bad' : r.severity === 'high' ? 'warn' : 'neutral'}>{r.severity || '—'}</Pill> },
        { key: 'available_capacity_mw', label: 'Avail MW', render: (r) => r.available_capacity_mw ?? '—' },
        { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'active' ? 'warn' : 'neutral'}>{r.status || '—'}</Pill> },
        { key: 'start_date', label: 'Start', render: (r) => r.start_date ? new Date(r.start_date).toLocaleDateString() : '—' },
      ]} />

      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--ink2)]">Imbalance settlement</h3>
        <button type="button" disabled={downloading === 'imbalance'} onClick={() => downloadCsv('imbalance')}
          className="px-2 py-1 text-[11px] bg-[var(--petrol)] text-white rounded-md disabled:opacity-50">
          {downloading === 'imbalance' ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      <MiniTable title="Imbalance" rows={imbalance} cols={[
        { key: 'period_start', label: 'Period', render: (r) => r.period_start ? new Date(r.period_start).toLocaleString() : '—' },
        { key: 'scheduled_kwh', label: 'Scheduled', render: (r) => kwh(r.scheduled_kwh) },
        { key: 'actual_kwh', label: 'Actual', render: (r) => kwh(r.actual_kwh) },
        { key: 'imbalance_kwh', label: 'Imbalance', render: (r) => kwh(r.imbalance_kwh) },
        { key: 'imbalance_charge', label: 'Charge', render: (r) => zar(r.imbalance_charge) },
        { key: 'within_tolerance', label: 'Tol', render: (r) => <Pill tone={r.within_tolerance ? 'good' : 'bad'}>{r.within_tolerance ? 'within' : 'breach'}</Pill> },
      ]} />
    </div>
  );
}
