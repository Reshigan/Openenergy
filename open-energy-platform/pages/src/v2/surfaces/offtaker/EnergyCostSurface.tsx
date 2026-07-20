// pages/src/meridian/surfaces/offtaker/EnergyCostSurface.tsx
//
// Meridian surface — "Energy cost & budget" (offtaker role). Budget-vs-actual energy spend by
// cost centre / delivery point for a chosen month (GET /api/offtaker-suite/budget-vs-actual?
// period=YYYY-MM). A month picker drives the fetch; totals roll up into a KPI strip and each
// line shows budgeted vs actual kWh/ZAR with a signed variance pill. Tariff schedules live in the
// separate `offtaker:tariffs` surface; this one is the spend-control view. Bucket B read surface.
// Registered as `offtaker:energy_cost`, reached via the roleData feature key `energy_cost`.
import React, { useEffect, useMemo, useState } from 'react';
import { Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

type Line = {
  site_group_id?: string; delivery_point_id?: string; cost_centre?: string;
  budgeted_kwh?: number; budgeted_zar?: number; actual_kwh?: number; actual_zar?: number; variance_pct?: number;
};

const num = (v: any, dp = 0) => (v == null ? '—' : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: dp }));
const zar = (v: any) => (v == null ? '—' : `R${num(v)}`);

function defaultPeriod(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1); // previous closed month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function varTone(v?: number): 'good' | 'warn' | 'bad' | 'neutral' {
  if (v == null) return 'neutral';
  if (v <= 0) return 'good';        // under budget
  if (v <= 10) return 'warn';
  return 'bad';                     // >10% over
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-surface-v2 px-4 py-3 min-w-[150px]">
      <div className="text-[11px] uppercase tracking-wide text-[var(--ink3)]">{label}</div>
      <div className="text-[20px] font-semibold text-[var(--ink)] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[var(--ink3)]">{sub}</div>}
    </div>
  );
}

export default function EnergyCostSurface(_props: { role: string }) {
  const [period, setPeriod] = useState(defaultPeriod());
  const [lines, setLines] = useState<Line[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/offtaker-suite/budget-vs-actual', { params: { period } })
      .then((res) => {
        if (!alive) return;
        const d = res.data?.data ?? res.data;
        setLines(Array.isArray(d) ? d : []);
      })
      .catch(() => alive && setLines([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [period]);

  const totals = useMemo(() => {
    const ls = lines ?? [];
    const bz = ls.reduce((a, l) => a + (Number(l.budgeted_zar) || 0), 0);
    const az = ls.reduce((a, l) => a + (Number(l.actual_zar) || 0), 0);
    const bk = ls.reduce((a, l) => a + (Number(l.budgeted_kwh) || 0), 0);
    const ak = ls.reduce((a, l) => a + (Number(l.actual_kwh) || 0), 0);
    const vpct = bz > 0 ? ((az - bz) / bz) * 100 : null;
    return { bz, az, bk, ak, vpct };
  }, [lines]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-[12px] text-[var(--ink2)] font-medium">Period</label>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
          className="h-9 px-3 rounded-md border border-[var(--line)] text-[13px]" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <KpiCard label="Budgeted spend" value={zar(totals.bz)} sub={`${num(totals.bk)} kWh`} />
        <KpiCard label="Actual spend" value={zar(totals.az)} sub={`${num(totals.ak)} kWh`} />
        <KpiCard label="Variance" value={totals.vpct == null ? '—' : `${totals.vpct > 0 ? '+' : ''}${num(totals.vpct, 1)}%`}
          sub={totals.vpct != null && totals.vpct > 0 ? 'over budget' : 'within budget'} />
      </div>

      <div className="rounded-lg border border-[var(--line)] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead><tr className="text-[var(--ink3)] border-b border-[var(--line)] bg-[var(--raised)]">
            <th className="text-left px-4 py-2 font-medium">Cost centre</th>
            <th className="text-left px-4 py-2 font-medium">Delivery point</th>
            <th className="text-right px-4 py-2 font-medium">Budget kWh</th>
            <th className="text-right px-4 py-2 font-medium">Actual kWh</th>
            <th className="text-right px-4 py-2 font-medium">Budget ZAR</th>
            <th className="text-right px-4 py-2 font-medium">Actual ZAR</th>
            <th className="text-right px-4 py-2 font-medium">Variance</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-[var(--ink3)]">Loading…</td></tr>}
            {!loading && (lines ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-[var(--ink3)]">No budget lines for {period}.</td></tr>
            )}
            {!loading && (lines ?? []).map((l, i) => (
              <tr key={l.delivery_point_id ?? `${l.cost_centre}-${i}`} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-2">{l.cost_centre || l.site_group_id || '—'}</td>
                <td className="px-4 py-2 text-[var(--ink3)]">{l.delivery_point_id || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{num(l.budgeted_kwh)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{num(l.actual_kwh)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{zar(l.budgeted_zar)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{zar(l.actual_zar)}</td>
                <td className="px-4 py-2 text-right">
                  <Pill tone={varTone(l.variance_pct)}>
                    {l.variance_pct == null ? '—' : `${l.variance_pct > 0 ? '+' : ''}${num(l.variance_pct, 1)}%`}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
