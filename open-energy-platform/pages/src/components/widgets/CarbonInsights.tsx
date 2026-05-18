// ════════════════════════════════════════════════════════════════════════
// CarbonInsights — vintage retirement schedule, methodology comparison,
// price realization. Pulls /carbon-registry/vintages + /carbon-registry/registries.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { api } from '../../lib/api';

type Vintage = {
  id: string;
  vintage_year?: number;
  methodology?: string;
  registry?: string;
  tonnes_co2e?: number;
  issuance_date?: string;
  retirement_date?: string | null;
  status?: string;
  price_per_tonne_zar?: number;
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

function VintageRetirementSchedule({ vintages }: { vintages: Vintage[] }) {
  const data = useMemo(() => {
    const byYear = new Map<number, { issued: number; retired: number }>();
    for (const v of vintages) {
      const y = v.vintage_year || (v.issuance_date ? new Date(v.issuance_date).getFullYear() : null);
      if (!y) continue;
      const row = byYear.get(y) || { issued: 0, retired: 0 };
      row.issued += Number(v.tonnes_co2e || 0);
      if (v.retirement_date || v.status === 'retired') row.retired += Number(v.tonnes_co2e || 0);
      byYear.set(y, row);
    }
    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, r]) => ({ year, issued: r.issued, retired: r.retired, outstanding: r.issued - r.retired }));
  }, [vintages]);

  if (!data.length) return <section className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">No vintage data.</section>;

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Vintage retirement schedule</div>
        <div className="text-[11px] text-[#6b7685]">Issued vs retired tCO₂e by vintage year</div>
      </header>
      <div style={{ height: 220 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#6b7685' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `${(v / 1_000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} tCO₂e`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="issued"  name="Issued"      stackId="x" fill="#3b82c4" />
            <Bar dataKey="retired" name="Retired"     stackId="x" fill="#1a8a5b" />
            <Line type="monotone" dataKey="outstanding" name="Outstanding" stroke="#b04e0f" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function MethodologyComparison({ vintages }: { vintages: Vintage[] }) {
  const rows = useMemo(() => {
    const byMeth = new Map<string, { tonnes: number; avgPrice: number; samples: number; retired: number }>();
    for (const v of vintages) {
      const m = v.methodology || 'unknown';
      const row = byMeth.get(m) || { tonnes: 0, avgPrice: 0, samples: 0, retired: 0 };
      row.tonnes += Number(v.tonnes_co2e || 0);
      if (Number(v.price_per_tonne_zar || 0) > 0) {
        row.avgPrice += Number(v.price_per_tonne_zar);
        row.samples += 1;
      }
      if (v.retirement_date || v.status === 'retired') row.retired += Number(v.tonnes_co2e || 0);
      byMeth.set(m, row);
    }
    return Array.from(byMeth.entries()).map(([m, r]) => ({
      methodology: m,
      tonnes: r.tonnes,
      avgPrice: r.samples > 0 ? r.avgPrice / r.samples : null,
      retiredPct: r.tonnes > 0 ? (r.retired / r.tonnes) * 100 : 0,
    })).sort((a, b) => b.tonnes - a.tonnes);
  }, [vintages]);

  if (!rows.length) return <section className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">No methodology data.</section>;

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Methodology comparison</div>
        <div className="text-[11px] text-[#6b7685]">Volume / avg price / retirement velocity by methodology</div>
      </header>
      <div className="p-3 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] text-[#6b7685] uppercase">
            <tr><th className="text-left py-1">Methodology</th>
                <th className="text-right py-1">Volume (tCO₂e)</th>
                <th className="text-right py-1">Avg R/t</th>
                <th className="text-right py-1">Retired</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.methodology} className="border-t border-[#eef2f7]">
                <td className="py-1.5 capitalize">{r.methodology.replace(/_/g, ' ')}</td>
                <td className="py-1.5 text-right font-mono">{r.tonnes.toLocaleString()}</td>
                <td className="py-1.5 text-right font-mono">{r.avgPrice == null ? '—' : `R${r.avgPrice.toFixed(0)}`}</td>
                <td className="py-1.5 text-right font-mono">{r.retiredPct.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CarbonInsights() {
  const [vintages, setVintages] = useState<Vintage[]>([]);
  useEffect(() => {
    api.get('/carbon-registry/vintages').then((r) => {
      setVintages((r.data?.data as Vintage[]) || []);
    }).catch(() => setVintages([]));
  }, []);
  return (
    <div className="space-y-3">
      <VintageRetirementSchedule vintages={vintages} />
      <MethodologyComparison vintages={vintages} />
    </div>
  );
}

export default CarbonInsights;
