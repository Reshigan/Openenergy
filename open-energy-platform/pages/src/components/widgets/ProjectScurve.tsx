// ════════════════════════════════════════════════════════════════════════
// ProjectScurve — earned-value / S-curve chart for a project.
//
// Takes the milestones array (which has due_date, achieved_date, status,
// optional weight or milestone_type) and produces three series indexed
// by month between project_start and project_end:
//
//   • Planned %  — cumulative weight of milestones whose due_date ≤ t
//   • Earned  %  — cumulative weight of milestones with achieved_date ≤ t
//   • Capex burn — straight-line over horizon scaled to project capex
//
// SPI = Earned/Planned, CPI = Earned/Burn (proxy until real cost data
// per milestone exists). All math client-side, no new endpoint required.
// ════════════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

type Milestone = {
  id: string;
  milestone_name?: string;
  milestone_type?: string;
  due_date?: string | null;
  achieved_date?: string | null;
  status: string;
  weight?: number | null;
};

type Props = {
  milestones: Milestone[];
  capexZar?: number;
  startDate?: string;
  codDate?: string;
};

// Weight defaults by type if not explicitly set — keeps a sensible
// S-curve when the milestones table doesn't carry weights.
const DEFAULT_WEIGHT: Record<string, number> = {
  permits: 5, environmental: 5, financing: 15, financial_close: 15,
  epc_award: 5, foundation: 10, mounting: 8, modules: 10, electrical: 12,
  grid_connection: 10, commissioning: 10, cod: 10,
};

function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function addMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }

export function ProjectScurve({ milestones, capexZar, startDate, codDate }: Props) {
  const data = useMemo(() => {
    if (!milestones.length) return { series: [], spi: null, cpi: null, totalW: 0 };
    const withDates = milestones.filter((m) => m.due_date);
    if (!withDates.length) return { series: [], spi: null, cpi: null, totalW: 0 };

    const weights = milestones.map((m) =>
      m.weight ?? DEFAULT_WEIGHT[(m.milestone_type || '').toLowerCase()] ?? 5
    );
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;

    const dueDates = withDates.map((m) => new Date(m.due_date!).getTime());
    const start = startDate ? new Date(startDate).getTime() : Math.min(...dueDates);
    const end = codDate ? new Date(codDate).getTime() : Math.max(...dueDates);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { series: [], spi: null, cpi: null, totalW: 0 };

    const series: any[] = [];
    let cursor = new Date(start);
    cursor.setDate(1);
    const lastBucket = new Date(end);
    while (cursor.getTime() <= lastBucket.getTime()) {
      const t = cursor.getTime();
      let planned = 0, earned = 0;
      milestones.forEach((m, i) => {
        if (m.due_date && new Date(m.due_date).getTime() <= t) planned += weights[i];
        if (m.achieved_date && new Date(m.achieved_date).getTime() <= t) earned += weights[i];
      });
      const frac = (t - start) / (end - start);
      const burnPct = Math.min(100, Math.max(0, frac * 100));
      series.push({
        month: monthKey(cursor),
        planned: Math.min(100, (planned / totalW) * 100),
        earned: Math.min(100, (earned / totalW) * 100),
        burn: burnPct,
        capex: capexZar ? capexZar * (burnPct / 100) : null,
      });
      cursor = addMonth(cursor);
    }

    const today = Date.now();
    const todayRow = series.find((r) => {
      const [y, m] = r.month.split('-').map(Number);
      return new Date(y, m - 1, 28).getTime() >= today;
    }) || series[series.length - 1];
    const spi = todayRow.planned > 0 ? todayRow.earned / todayRow.planned : null;
    const cpi = todayRow.burn > 0 ? todayRow.earned / todayRow.burn : null;

    return { series, spi, cpi, totalW };
  }, [milestones, capexZar, startDate, codDate]);

  if (!data.series.length) {
    return (
      <section className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#6b7685]">
        Need at least two milestones with due dates to draw the S-curve.
      </section>
    );
  }

  const spiTone = data.spi == null ? 'info' : data.spi >= 0.95 ? 'good' : data.spi >= 0.85 ? 'warn' : 'bad';
  const cpiTone = data.cpi == null ? 'info' : data.cpi >= 0.95 ? 'good' : data.cpi >= 0.85 ? 'warn' : 'bad';

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#eef2f7] flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-[#0f1c2e]">Earned-value S-curve</div>
          <div className="text-[11px] text-[#6b7685]">Cumulative milestone progress vs plan and capex burn</div>
        </div>
        <div className="flex gap-4 text-[11px]">
          <Kpi label="SPI" value={data.spi == null ? '—' : data.spi.toFixed(2)} tone={spiTone} hint="Schedule perf. (earned / planned)" />
          <Kpi label="CPI" value={data.cpi == null ? '—' : data.cpi.toFixed(2)} tone={cpiTone} hint="Cost perf. (earned / capex burn)" />
        </div>
      </header>
      <div style={{ height: 240 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.series} margin={{ top: 12, right: 16, bottom: 16, left: 0 }}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6b7685' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} unit="%" domain={[0, 100]} />
            <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area  type="monotone" dataKey="planned" name="Planned %"  stroke="#3b82c4" fill="#d4e7f6" />
            <Line  type="monotone" dataKey="earned"  name="Earned %"   stroke="#1a8a5b" strokeWidth={2} dot={false} />
            <Line  type="monotone" dataKey="burn"    name="Capex burn %" stroke="#b04e0f" strokeDasharray="4 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone: string; hint: string }) {
  const map: Record<string, string> = {
    good: 'text-[#1a8a5b]',
    warn: 'text-[#b04e0f]',
    bad:  'text-[#c0392b]',
    info: 'text-[#3b82c4]',
  };
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className={`text-[13px] font-mono font-semibold ${map[tone]}`}>{value}</div>
    </div>
  );
}

export default ProjectScurve;
