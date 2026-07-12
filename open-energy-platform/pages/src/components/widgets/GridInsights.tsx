// ════════════════════════════════════════════════════════════════════════
// GridInsights — generation profile (hourly MW), load-duration curve,
// outage MTTR trend. Pulls /grid-operator/dispatch/* and /grid-operator/outages.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { api } from '../../lib/api';

type DispatchSchedule = {
  id: string;
  scheduled_for?: string;
  hour_of_day?: number;
  mw_dispatched?: number;
  energy_type?: string;
};

type Outage = {
  id: string;
  outage_type?: string;
  reported_at?: string;
  scheduled_start?: string;
  restored_at?: string | null;
  severity?: string;
};

// ─── 1 ─── Generation profile + LDC ───────────────────────────────────
function GenerationProfile({ schedules }: { schedules: DispatchSchedule[] }) {
  const profile = useMemo(() => {
    const byHour = new Map<number, Record<string, number>>();
    for (const s of schedules) {
      const h = Number(s.hour_of_day ?? (s.scheduled_for ? new Date(s.scheduled_for).getHours() : 0));
      const row = byHour.get(h) || {};
      const t = s.energy_type || 'mixed';
      row[t] = (row[t] || 0) + Number(s.mw_dispatched || 0);
      byHour.set(h, row);
    }
    const hours = Array.from({ length: 24 }, (_, h) => {
      const row = byHour.get(h) || {};
      return { hour: `${String(h).padStart(2, '0')}:00`, ...row };
    });
    return hours;
  }, [schedules]);

  const types = useMemo(() => {
    const s = new Set<string>();
    schedules.forEach((d) => s.add(d.energy_type || 'mixed'));
    return Array.from(s);
  }, [schedules]);

  const ldc = useMemo(() => {
    const allMw = profile.map((p) => Object.keys(p).filter((k) => k !== 'hour').reduce((s, k) => s + Number((p as any)[k] || 0), 0));
    const sorted = [...allMw].sort((a, b) => b - a);
    return sorted.map((mw, i) => ({ pctTime: (i / sorted.length) * 100, mw }));
  }, [profile]);

  const COLOUR: Record<string, string> = {
    solar: '#f6c44a', wind: 'oklch(0.46 0.16 55)', battery: '#6b3a82',
    hydro: 'var(--good, #1a8a5b)', coal: '#3d3d3d', gas: '#e63946', mixed: 'var(--ink-2, #6b7685)',
  };

  if (!schedules.length) {
    return <section className="widget-card widget-empty">No dispatch schedules — generation profile unavailable.</section>;
  }

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[var(--s2, #eef2f7)]">
        <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">Generation profile · load duration</div>
        <div className="text-[11px] text-[var(--ink-2, #6b7685)]">Hourly MW stack by source (left) and load-duration curve (right)</div>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 p-3">
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={profile} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
              <CartesianGrid stroke="var(--s2, #eef2f7)" />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'var(--ink-2, #6b7685)' }} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--ink-2, #6b7685)' }} unit=" MW" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {types.map((t) => (
                <Area isAnimationActive={false} key={t} type="monotone" dataKey={t} name={t} stackId="x" stroke={COLOUR[t] || 'var(--ink-2, #6b7685)'} fill={COLOUR[t] || 'var(--ink-2, #6b7685)'} fillOpacity={0.5} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ldc} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
              <CartesianGrid stroke="var(--s2, #eef2f7)" />
              <XAxis dataKey="pctTime" tick={{ fontSize: 9, fill: 'var(--ink-2, #6b7685)' }} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} unit="" />
              <YAxis tick={{ fontSize: 9, fill: 'var(--ink-2, #6b7685)' }} unit=" MW" />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(0)} MW`} labelFormatter={(l) => `${Number(l).toFixed(0)}% of hours`} />
              <Area isAnimationActive={false} type="monotone" dataKey="mw" stroke="oklch(0.46 0.16 55)" fill="#d4e7f6" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

// ─── 2 ─── Outage MTTR trend ──────────────────────────────────────────
function OutageMttrTrend({ outages }: { outages: Outage[] }) {
  const series = useMemo(() => {
    const byMonth = new Map<string, { total: number; count: number; max: number }>();
    for (const o of outages) {
      const start = o.reported_at || o.scheduled_start;
      if (!start || !o.restored_at) continue;
      const ttr = (new Date(o.restored_at).getTime() - new Date(start).getTime()) / 3_600_000;
      if (ttr <= 0) continue;
      const m = new Date(start);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const row = byMonth.get(key) || { total: 0, count: 0, max: 0 };
      row.total += ttr; row.count += 1; row.max = Math.max(row.max, ttr);
      byMonth.set(key, row);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, r]) => ({ month, mean: r.total / r.count, max: r.max, count: r.count }));
  }, [outages]);

  if (!series.length) return <section className="widget-card widget-empty">No closed outages yet — MTTR trend unavailable.</section>;

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[var(--s2, #eef2f7)]">
        <div className="text-[13px] font-semibold text-[var(--ink, #0f1c2e)]">Outage MTTR trend</div>
        <div className="text-[11px] text-[var(--ink-2, #6b7685)]">Mean and worst time-to-restore by month (hours)</div>
      </header>
      <div style={{ height: 220 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="var(--s2, #eef2f7)" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--ink-2, #6b7685)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--ink-2, #6b7685)' }} unit="h" />
            <Tooltip formatter={(v: any, n: any) => n === 'count' ? Number(v) : `${Number(v).toFixed(1)} h`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar isAnimationActive={false} dataKey="max"   name="Worst (h)" fill="color-mix(in oklab, var(--bad) 15%, var(--s1))" />
            <Line isAnimationActive={false} type="monotone" dataKey="mean" name="MTTR (h)" stroke="var(--bad, #c0392b)" strokeWidth={2} dot={true} />
            <Line isAnimationActive={false} type="monotone" dataKey="count" name="# outages" stroke="oklch(0.46 0.16 55)" strokeWidth={1} dot={false} yAxisId={0} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function GridInsights() {
  const [schedules, setSchedules] = useState<DispatchSchedule[]>([]);
  const [outages, setOutages] = useState<Outage[]>([]);
  useEffect(() => {
    Promise.all([
      api.get('/grid-operator/dispatch/schedules').catch(() => ({ data: { data: [] } })),
      api.get('/grid-operator/outages').catch(() => ({ data: { data: [] } })),
    ]).then(([s, o]) => {
      setSchedules((s.data?.data as DispatchSchedule[]) || []);
      setOutages((o.data?.data as Outage[]) || []);
    });
  }, []);
  return (
    <div className="space-y-3">
      <GenerationProfile schedules={schedules} />
      <OutageMttrTrend outages={outages} />
    </div>
  );
}

export default GridInsights;
