// pages/src/meridian/surfaces/lender/CarbonLenderSurface.tsx
//
// Meridian surface — "ESG carbon reports" (lender role). DFI / development-bank lenders track the
// carbon-credit position attached to their portfolio for ESG and sustainability-linked reporting.
// Reads the lender's own carbon book from GET /api/carbon/fund/summary (NAV / AUM / retired tCO2e
// + methodology-vintage breakdown) and the underlying holdings register from GET /api/carbon/credits.
// Both endpoints are participant-scoped by the caller's id, so a lender sees only its own position.
// Read-only Bucket B surface. Registered as `lender:carbon_lender`, reached via the roleData
// feature key `carbon_lender`.
//
// Journey-shaped: KPI header (held / cost / retired-% / NAV) derived from the summary, holdings
// breakdown sorted biggest-position-first, then the full register. Loading / error / empty all
// handled distinctly.
import React, { useEffect, useState } from 'react';
import { AutoTable, KpiCard } from './_AutoTable';
import { api } from '../../../lib/api';

type Summary = {
  total_credits?: number; total_cost_zar?: number; avg_cost_zar_per_tco2e?: number;
  retired_tco2e?: number; latest_nav?: { nav_per_unit?: number; nav_date?: string } | null;
  holdings_breakdown?: { credit_type?: string; vintage_year?: number; qty?: number; cost?: number }[];
};

const num = (v: any, dp = 0) => (v == null ? '—' : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: dp }));
const zar = (v: any, dp = 0) => (v == null ? '—' : `R${num(v, dp)}`);

export default function CarbonLenderSurface(_props: { role: string }) {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('/carbon/fund/summary')
      .then((res) => alive && setS(res.data?.data ?? {}))
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, []);

  if (err) return <div className="mer mer-error" role="alert">Could not load carbon position.</div>;
  if (!s) return <div className="mer mer-loading" aria-busy="true">Loading carbon position…</div>;

  // Biggest position first — the concentration the ESG report leads with.
  const breakdown = [...(s.holdings_breakdown ?? [])].sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0));
  const held = Number(s.total_credits) || 0;
  const retired = Number(s.retired_tco2e) || 0;
  const retiredPct = held + retired > 0 ? (retired / (held + retired)) * 100 : 0;

  return (
    <div>
      <div className="rounded-lg border border-[var(--line)] bg-[var(--raised)] px-4 py-3 mb-4 text-[12px] text-[var(--ink2)]">
        Carbon position held against your portfolio, for ESG and sustainability-linked-loan reporting.
        Scoped to your institution. Retirements are permanent and count toward financed-emissions offset.
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <KpiCard label="Credits held" value={`${num(s.total_credits)} tCO₂e`} />
        <KpiCard label="Book cost" value={zar(s.total_cost_zar)} sub={`avg ${zar(s.avg_cost_zar_per_tco2e, 2)}/tCO₂e`} />
        <KpiCard label="Retired" value={`${num(s.retired_tco2e)} tCO₂e`} sub={`${retiredPct.toFixed(0)}% of lifetime`} />
        <KpiCard label="NAV / unit" value={s.latest_nav?.nav_per_unit != null ? zar(s.latest_nav.nav_per_unit, 2) : '—'}
          sub={s.latest_nav?.nav_date ? new Date(s.latest_nav.nav_date).toLocaleDateString() : 'no NAV snapshot'} />
      </div>

      {breakdown.length > 0 && (
        <div className="rounded-lg border border-[var(--line)] overflow-hidden mb-5">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink3)] bg-[var(--raised)]">Holdings by type &amp; vintage</div>
          <table className="w-full text-[12px]">
            <thead><tr className="text-[var(--ink3)] border-b border-[var(--line)]">
              <th className="text-left px-4 py-1.5 font-medium">Credit type</th>
              <th className="text-left px-4 py-1.5 font-medium">Vintage</th>
              <th className="text-right px-4 py-1.5 font-medium">Quantity tCO₂e</th>
              <th className="text-right px-4 py-1.5 font-medium">Cost</th>
            </tr></thead>
            <tbody>
              {breakdown.map((b, i) => (
                <tr key={`${b.credit_type}-${b.vintage_year}-${i}`} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-1.5">{b.credit_type || '—'}</td>
                  <td className="px-4 py-1.5 text-[var(--ink3)]">{b.vintage_year || '—'}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{num(b.qty)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{zar(b.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink3)] mb-2">Holdings register</div>
      <AutoTable
        endpoint="/carbon/credits"
        empty="No carbon holdings yet. Purchased or allocated carbon credits appear here once your institution holds a position on the registry."
        prefer={['project_name', 'registry', 'methodology', 'credit_type', 'vintage', 'quantity', 'price_per_credit', 'status']}
      />
    </div>
  );
}
