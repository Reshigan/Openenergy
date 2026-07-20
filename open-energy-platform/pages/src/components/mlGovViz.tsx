// pages/src/components/mlGovViz.tsx
//
// Shared dataviz for the three ML-governance tabs (Anomaly-Detection / RUL-Prediction /
// Fault-Fingerprint). Each export takes the tab's already-filtered rows and renders a
// chart band ABOVE the table (no extra fetch). recharts is already a dep; idiom + tokens
// copied from meridian/surfaces/esumsom/viz.tsx for consistency.
import React, { useMemo } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip,
  XAxis, YAxis, Scatter, ScatterChart, ZAxis,
} from 'recharts';

// ─── tokens (match the ML tabs) ─────────────────────────────────────────────
const INK = 'var(--ink, #0c2a4d)';
const MUTED = 'var(--ink-2, #4a5568)';
// GRID is drawn as an SVG stroke attr (CartesianGrid/axis lines) where var() does
// NOT resolve — must be a literal. This viz only ever renders inside the authed v2
// dark app, so a dark-appropriate hairline hex is correct here.
const GRID = '#2a3038';
// CARD/BORDER are used in style={{}} (Panel + tooltip) where var() resolves.
const CARD = 'var(--s1, #fff)';
const BORDER = 'var(--border-subtle, #e6eaf1)';
const ACC = 'oklch(0.46 0.16 55)';
const TICK = { fontSize: 10, fill: MUTED };
// HealthBand palette — same tones the tabs use inline
const BAND: Record<string, string> = { green: 'var(--good, #1f5b3a)', amber: '#a06200', red: 'var(--bad, #9b1f1f)', critical: 'var(--bad, #7a0e0e)' };
const bandColor = (b: unknown) => BAND[String(b ?? '').toLowerCase()] ?? '#8a94a6';
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });

type Row = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : NaN;
};
const band = (r: Row) => String(r.model_health_band_live ?? r.model_health_band ?? '—').toLowerCase();

// ─── chrome ─────────────────────────────────────────────────────────────────
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ border: `1px solid ${BORDER}`, borderRadius: 8, background: CARD, overflow: 'hidden' }}>
      <header style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: INK, margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 11, color: MUTED, margin: '2px 0 0' }}>{subtitle}</p>}
      </header>
      <div style={{ height: 240, padding: '10px 6px 4px' }}>
        <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
      </div>
    </section>
  );
}
const GridN = ({ children }: { children: React.ReactNode }) => (
  <div style={{ marginBottom: 16 }} className="grid grid-cols-1 lg:grid-cols-2 gap-3">{children}</div>
);

// group → count per key
function countBy(rows: Row[], key: string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(String(r[key] ?? '—'), (m.get(String(r[key] ?? '—')) ?? 0) + 1);
  return [...m.entries()].map(([name, value]) => ({ name, value }));
}
// group → mean of a metric per key (skips NaN)
function avgBy(rows: Row[], key: string, metric: string) {
  const m = new Map<string, { s: number; n: number }>();
  for (const r of rows) {
    const v = num(r[metric]);
    if (!Number.isFinite(v)) continue;
    const k = String(r[key] ?? '—');
    const e = m.get(k) ?? { s: 0, n: 0 };
    e.s += v; e.n += 1; m.set(k, e);
  }
  return [...m.entries()].map(([name, e]) => ({ name, value: e.s / e.n })).sort((a, b) => b.value - a.value).slice(0, 8);
}

// health-band distribution (ordered worst→best), band-coloured
function HealthBandPanel({ rows }: { rows: Row[] }) {
  const data = useMemo(() => {
    const order = ['critical', 'red', 'amber', 'green'];
    const c = countBy(rows.map((r) => ({ b: band(r) })), 'b');
    return order.map((name) => ({ name, value: c.find((d) => d.name === name)?.value ?? 0 })).filter((d) => d.value > 0);
  }, [rows]);
  return (
    <Panel title="Model health distribution" subtitle="Live health band across the filtered fleet">
      <BarChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={TICK} />
        <YAxis tick={TICK} allowDecimals={false} width={28} />
        <Tooltip />
        <Bar isAnimationActive={false} dataKey="value" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={bandColor(d.name)} />)}
        </Bar>
      </BarChart>
    </Panel>
  );
}

// two-metric scatter, coloured by health band; bubble = optional z
function ScatterPanel({
  rows, xk, yk, zk, title, subtitle, xLabel, yLabel, xPct, yPct,
}: {
  rows: Row[]; xk: string; yk: string; zk?: string; title: string; subtitle: string;
  xLabel: string; yLabel: string; xPct?: boolean; yPct?: boolean;
}) {
  const data = useMemo(
    () => rows.map((r) => ({
      x: num(r[xk]), y: num(r[yk]), z: zk ? num(r[zk]) : 1,
      model: String(r.model_number ?? r.model_id ?? ''), b: band(r),
    })).filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y)),
    [rows],
  );
  return (
    <Panel title={title} subtitle={subtitle}>
      <ScatterChart margin={{ top: 8, right: 14, bottom: 20, left: 4 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="x" name={xLabel} tick={TICK} tickFormatter={xPct ? (v) => pct.format(v) : undefined}
          label={{ value: xLabel, position: 'insideBottom', offset: -8, fontSize: 10, fill: MUTED }} />
        <YAxis type="number" dataKey="y" name={yLabel} tick={TICK} width={40} tickFormatter={yPct ? (v) => pct.format(v) : undefined} />
        {zk && <ZAxis type="number" dataKey="z" range={[40, 500]} />}
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!p) return null;
            return (
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px', fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: INK }}>{p.model || 'model'}</div>
                <div style={{ color: MUTED }}>{xLabel}: {xPct ? pct.format(p.x) : p.x.toFixed(3)}</div>
                <div style={{ color: MUTED }}>{yLabel}: {yPct ? pct.format(p.y) : p.y.toFixed(3)}</div>
              </div>
            );
          }}
        />
        <Scatter isAnimationActive={false} data={data}>
          {data.map((d, i) => <Cell key={i} fill={bandColor(d.b)} fillOpacity={0.75} />)}
        </Scatter>
      </ScatterChart>
    </Panel>
  );
}

// mean-metric-by-family bar (accent), with optional pct axis
function AvgBarPanel({ rows, groupKey, metric, title, subtitle, isPct }: {
  rows: Row[]; groupKey: string; metric: string; title: string; subtitle: string; isPct?: boolean;
}) {
  const data = useMemo(() => avgBy(rows, groupKey, metric), [rows]);
  return (
    <Panel title={title} subtitle={subtitle}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={TICK} tickFormatter={isPct ? (v) => pct.format(v) : undefined} />
        <YAxis type="category" dataKey="name" tick={TICK} width={110} />
        <Tooltip formatter={(v: number) => (isPct ? pct.format(v) : v.toFixed(3))} />
        <Bar isAnimationActive={false} dataKey="value" radius={[0, 3, 3, 0]} fill={ACC} />
      </BarChart>
    </Panel>
  );
}

// grouped p50/p99 latency by family
function LatencyPanel({ rows }: { rows: Row[] }) {
  const data = useMemo(() => {
    const m = new Map<string, { p50: number[]; p99: number[] }>();
    for (const r of rows) {
      const k = String(r.model_family ?? r.asset_class ?? '—');
      const e = m.get(k) ?? { p50: [], p99: [] };
      const a = num(r.inference_latency_p50_ms); const b = num(r.inference_latency_p99_ms);
      if (Number.isFinite(a)) e.p50.push(a);
      if (Number.isFinite(b)) e.p99.push(b);
      m.set(k, e);
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
    return [...m.entries()].map(([name, e]) => ({ name, p50: mean(e.p50), p99: mean(e.p99) }))
      .sort((a, b) => b.p99 - a.p99).slice(0, 8);
  }, [rows]);
  return (
    <Panel title="Inference latency by family" subtitle="Mean p50 vs p99 · milliseconds">
      <BarChart data={data} margin={{ top: 4, right: 12, bottom: 24, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={TICK} interval={0} angle={-20} textAnchor="end" height={40} />
        <YAxis tick={TICK} width={38} unit="ms" />
        <Tooltip formatter={(v: number) => `${v.toFixed(0)} ms`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar isAnimationActive={false} dataKey="p50" name="p50" fill={ACC} radius={[3, 3, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="p99" name="p99" fill="var(--bad, #9b1f1f)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </Panel>
  );
}

// ─── tab exports ─────────────────────────────────────────────────────────────
export function anomalyMlViz(rows: Row[]): React.ReactNode {
  if (!rows.length) return null;
  return (
    <GridN>
      <HealthBandPanel rows={rows} />
      <ScatterPanel rows={rows} xk="drift_psi" yk="drift_ks" zk="autoencoder_reconstruction_error_p99"
        title="Drift map" subtitle="PSI × KS · bubble = reconstruction error · colour = health"
        xLabel="PSI" yLabel="KS" />
      <ScatterPanel rows={rows} xk="recall_at_k" yk="precision_at_k"
        title="Precision vs recall @ K" subtitle="Detection quality · colour = health"
        xLabel="recall@K" yLabel="precision@K" xPct yPct />
      <LatencyPanel rows={rows} />
    </GridN>
  );
}

export function rulMlViz(rows: Row[]): React.ReactNode {
  if (!rows.length) return null;
  return (
    <GridN>
      <HealthBandPanel rows={rows} />
      <ScatterPanel rows={rows} xk="brier_score" yk="concordance_index" zk="rul_p50_days"
        title="Discrimination vs calibration" subtitle="Concordance × Brier · bubble = RUL p50 · colour = health"
        xLabel="Brier" yLabel="C-index" />
      <AvgBarPanel rows={rows} groupKey="model_family" metric="kaplan_meier_lift_vs_ols"
        title="Kaplan-Meier lift vs OLS" subtitle="Mean survival-model lift by family" />
      <LatencyPanel rows={rows} />
    </GridN>
  );
}

export function faultMlViz(rows: Row[]): React.ReactNode {
  if (!rows.length) return null;
  return (
    <GridN>
      <HealthBandPanel rows={rows} />
      <ScatterPanel rows={rows} xk="calibration_brier" yk="macro_f1" zk="class_count"
        title="Accuracy vs calibration" subtitle="Macro-F1 × Brier · bubble = class count · colour = health"
        xLabel="calibration Brier" yLabel="macro-F1" yPct />
      <AvgBarPanel rows={rows} groupKey="model_family" metric="class_drift_psi"
        title="Class drift by family" subtitle="Mean class-drift PSI · higher = more drift" />
      <LatencyPanel rows={rows} />
    </GridN>
  );
}
