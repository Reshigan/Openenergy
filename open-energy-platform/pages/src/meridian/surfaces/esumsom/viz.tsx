// pages/src/meridian/surfaces/esumsom/viz.tsx
//
// Shared dataviz for the O&M operator surfaces (Predictive / Faults / Alerts).
// Each export is a `TabSpec.viz` — it receives the already-fetched rows and
// renders charts ABOVE the table (no extra fetch). recharts is already a dep;
// idiom + colour tokens copied from widgets/IppInsights.tsx for consistency.
import React, { useMemo } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis, Scatter, ScatterChart, ZAxis,
} from 'recharts';

// ─── tokens (match IppInsights) ─────────────────────────────────────────────
// exported so ipp/viz.tsx + carbon/viz.tsx reuse these tints without re-declaring
export const GOOD = '#1a8a5b';
export const WARN = '#b04e0f';
export const BAD = '#c0392b';
const GRID = '#eef2f7';
const MUTED = '#6b7685';
const INK = '#0f1c2e';
const TICK = { fontSize: 10, fill: MUTED };
const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const daysUntil = (v: unknown): number => {
  const t = Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? (t - Date.now()) / 86_400_000 : NaN;
};
// bucket age/urgency to a colour: <7d critical, <30d watch, else planned
const urgencyColor = (days: number): string =>
  !Number.isFinite(days) ? MUTED : days < 7 ? BAD : days < 30 ? WARN : GOOD;

// ─── chrome ─────────────────────────────────────────────────────────────────
export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="widget-card" style={{ border: `1px solid ${GRID}`, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <header className="px-4 py-3" style={{ borderBottom: `1px solid ${GRID}` }}>
        <h3 className="text-[13px] font-semibold" style={{ color: INK }}>{title}</h3>
        {subtitle && <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>{subtitle}</p>}
      </header>
      <div style={{ height: 260 }} className="px-2 pt-3 pb-1">
        <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
      </div>
    </section>
  );
}
export const Grid2 = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-1">{children}</div>
);

// group rows → summed metric per key, sorted desc
function groupSum(rows: Record<string, unknown>[], key: string, metric: string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = String(r[key] ?? '—');
    m.set(k, (m.get(k) ?? 0) + num(r[metric]));
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function groupCount(rows: Record<string, unknown>[], key: string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = String(r[key] ?? '—');
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
// severity/status label → colour
const sevColor = (s: string): string => {
  const k = s.toLowerCase();
  if (/(crit|high|major|red|open|down)/.test(k)) return BAD;
  if (/(med|warn|amber|orange|degrad)/.test(k)) return WARN;
  return GOOD;
};

const zarTip = (v: number) => zar.format(v);

// ── Predictive maintenance: risk matrix + exposure by type ──────────────────
export function predictionsViz(rows: Record<string, unknown>[]): React.ReactNode {
  return <PredictionsCharts rows={rows} />;
}
function PredictionsCharts({ rows }: { rows: Record<string, unknown>[] }) {
  const scatter = useMemo(
    () => rows.map((r) => {
      const days = daysUntil(r.estimated_failure_at);
      let conf = num(r.confidence);
      if (conf <= 1) conf *= 100; // confidence may arrive 0–1 or 0–100
      return {
        x: Number.isFinite(days) ? Math.max(0, Math.round(days)) : 0,
        y: Math.round(conf),
        z: num(r.estimated_loss_zar),
        site: String(r.site_id ?? ''),
        type: String(r.prediction_type ?? ''),
        fill: urgencyColor(days),
      };
    }),
    [rows],
  );
  const byType = useMemo(() => groupSum(rows, 'prediction_type', 'estimated_loss_zar').slice(0, 8), [rows]);

  return (
    <Grid2>
      <Panel title="Failure risk matrix" subtitle="Confidence × time-to-failure · bubble = revenue at risk">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="x" name="Days to failure" tick={TICK} label={{ value: 'Days to likely failure', position: 'insideBottom', offset: -8, fontSize: 10, fill: MUTED }} />
          <YAxis type="number" dataKey="y" name="Confidence" unit="%" domain={[0, 100]} tick={TICK} width={34} />
          <ZAxis type="number" dataKey="z" range={[40, 600]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as (typeof scatter)[number] | undefined;
              if (!p) return null;
              return (
                <div style={{ background: '#fff', border: `1px solid ${GRID}`, borderRadius: 8, padding: '6px 8px', fontSize: 11 }}>
                  <div style={{ fontWeight: 600, color: INK }}>{p.site} · {p.type}</div>
                  <div style={{ color: MUTED }}>{p.y}% confidence · ~{p.x}d out</div>
                  <div style={{ color: BAD }}>{zar.format(p.z)} at risk</div>
                </div>
              );
            }}
          />
          <Scatter data={scatter}>
            {scatter.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.72} />)}
          </Scatter>
        </ScatterChart>
      </Panel>
      <Panel title="Revenue exposure by prediction type" subtitle="Total loss if each signal is ignored">
        <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={TICK} tickFormatter={(v) => zar.format(v)} />
          <YAxis type="category" dataKey="name" tick={TICK} width={110} />
          <Tooltip formatter={(v: number) => zarTip(v)} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {byType.map((d, i) => <Cell key={i} fill={i === 0 ? BAD : i < 3 ? WARN : GOOD} />)}
          </Bar>
        </BarChart>
      </Panel>
    </Grid2>
  );
}

// ── Faults: revenue bleed by category + count by severity ───────────────────
export function faultsViz(rows: Record<string, unknown>[]): React.ReactNode {
  return <FaultsCharts rows={rows} />;
}
function FaultsCharts({ rows }: { rows: Record<string, unknown>[] }) {
  const byCat = useMemo(() => groupSum(rows, 'category', 'total_loss_zar').slice(0, 8), [rows]);
  const bySev = useMemo(() => groupCount(rows, 'severity'), [rows]);
  return (
    <Grid2>
      <Panel title="Revenue bleed by category" subtitle="Cumulative loss booked by the Revenue Impact Engine">
        <BarChart data={byCat} margin={{ top: 4, right: 12, bottom: 30, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={TICK} interval={0} angle={-25} textAnchor="end" height={44} />
          <YAxis tick={TICK} tickFormatter={(v) => zar.format(v)} width={54} />
          <Tooltip formatter={(v: number) => zarTip(v)} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {byCat.map((d, i) => <Cell key={i} fill={i === 0 ? BAD : i < 3 ? WARN : GOOD} />)}
          </Bar>
        </BarChart>
      </Panel>
      <Panel title="Active faults by severity" subtitle="Open fault count across the fleet">
        <BarChart data={bySev} margin={{ top: 4, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={TICK} />
          <YAxis tick={TICK} allowDecimals={false} width={30} />
          <Tooltip />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {bySev.map((d, i) => <Cell key={i} fill={sevColor(d.name)} />)}
          </Bar>
        </BarChart>
      </Panel>
    </Grid2>
  );
}

// ── Settlement invoices: revenue by station + status funnel ─────────────────
export function settlementInvoicesViz(rows: Record<string, unknown>[]): React.ReactNode {
  return <SettlementInvoicesCharts rows={rows} />;
}
function SettlementInvoicesCharts({ rows }: { rows: Record<string, unknown>[] }) {
  const byStation = useMemo(() => groupSum(rows, 'station_name', 'total_zar').slice(0, 8), [rows]);
  const byStatus = useMemo(() => groupCount(rows, 'status'), [rows]);
  return (
    <Grid2>
      <Panel title="Billed revenue by station" subtitle="Total invoiced this window · top 8 stations">
        <BarChart data={byStation} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={TICK} tickFormatter={(v) => zar.format(v)} />
          <YAxis type="category" dataKey="name" tick={TICK} width={110} />
          <Tooltip formatter={(v: number) => zarTip(v)} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} fill={GOOD} />
        </BarChart>
      </Panel>
      <Panel title="Invoices by status" subtitle="Where each invoice sits in the issue → pay lifecycle">
        <BarChart data={byStatus} margin={{ top: 4, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={TICK} />
          <YAxis tick={TICK} allowDecimals={false} width={30} />
          <Tooltip />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {byStatus.map((d, i) => <Cell key={i} fill={sevColor(d.name)} />)}
          </Bar>
        </BarChart>
      </Panel>
    </Grid2>
  );
}

// ── Work orders: status funnel + priority breakdown ─────────────────────────
export function workOrdersViz(rows: Record<string, unknown>[]): React.ReactNode {
  return <WorkOrdersCharts rows={rows} />;
}
function WorkOrdersCharts({ rows }: { rows: Record<string, unknown>[] }) {
  const byStatus = useMemo(() => groupCount(rows, 'status'), [rows]);
  const byPriority = useMemo(() => groupCount(rows, 'priority'), [rows]);
  return (
    <Grid2>
      <Panel title="Work orders by status" subtitle="Position across the 12-state lifecycle">
        <BarChart data={byStatus} margin={{ top: 4, right: 12, bottom: 30, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={TICK} interval={0} angle={-25} textAnchor="end" height={44} />
          <YAxis tick={TICK} allowDecimals={false} width={30} />
          <Tooltip />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {byStatus.map((d, i) => <Cell key={i} fill={sevColor(d.name)} />)}
          </Bar>
        </BarChart>
      </Panel>
      <Panel title="Open work orders by priority" subtitle="Backlog weighting across the fleet">
        <BarChart data={byPriority} margin={{ top: 4, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={TICK} />
          <YAxis tick={TICK} allowDecimals={false} width={30} />
          <Tooltip />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {byPriority.map((d, i) => <Cell key={i} fill={sevColor(d.name)} />)}
          </Bar>
        </BarChart>
      </Panel>
    </Grid2>
  );
}

// ── Alerts: by severity + by category ───────────────────────────────────────
export function alertsViz(rows: Record<string, unknown>[]): React.ReactNode {
  return <AlertsCharts rows={rows} />;
}
function AlertsCharts({ rows }: { rows: Record<string, unknown>[] }) {
  const bySev = useMemo(() => groupCount(rows, 'severity'), [rows]);
  const byCat = useMemo(() => groupCount(rows, 'category').slice(0, 8), [rows]);
  return (
    <Grid2>
      <Panel title="Alerts by severity" subtitle="Fired across the fleet · last 7 days">
        <BarChart data={bySev} margin={{ top: 4, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={TICK} />
          <YAxis tick={TICK} allowDecimals={false} width={30} />
          <Tooltip />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {bySev.map((d, i) => <Cell key={i} fill={sevColor(d.name)} />)}
          </Bar>
        </BarChart>
      </Panel>
      <Panel title="Alerts by category" subtitle="Where the noise is coming from">
        <BarChart data={byCat} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={TICK} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={TICK} width={110} />
          <Tooltip />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} fill="oklch(0.46 0.16 55)" />
        </BarChart>
      </Panel>
    </Grid2>
  );
}

// ─── small reusable chart primitives (all remaining surfaces) ────────────────
// horizontal bar of a summed ZAR metric per key (top 8)
export function ZarBars({ rows, groupKey, metric }: { rows: Record<string, unknown>[]; groupKey: string; metric: string }) {
  const data = useMemo(() => groupSum(rows, groupKey, metric).slice(0, 8), [rows, groupKey, metric]);
  return (
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
      <CartesianGrid stroke={GRID} horizontal={false} />
      <XAxis type="number" tick={TICK} tickFormatter={(v) => zar.format(v)} />
      <YAxis type="category" dataKey="name" tick={TICK} width={110} />
      <Tooltip formatter={(v: number) => zarTip(v)} />
      <Bar dataKey="value" radius={[0, 3, 3, 0]} fill={GOOD} />
    </BarChart>
  );
}
// horizontal bar of a summed plain-number metric per key (top 8)
export function NumBars({ rows, groupKey, metric, fill = INK }: { rows: Record<string, unknown>[]; groupKey: string; metric: string; fill?: string }) {
  const data = useMemo(() => groupSum(rows, groupKey, metric).slice(0, 8), [rows, groupKey, metric]);
  return (
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
      <CartesianGrid stroke={GRID} horizontal={false} />
      <XAxis type="number" tick={TICK} allowDecimals={false} />
      <YAxis type="category" dataKey="name" tick={TICK} width={110} />
      <Tooltip />
      <Bar dataKey="value" radius={[0, 3, 3, 0]} fill={fill} />
    </BarChart>
  );
}
// vertical count-by-key bars; colorByStatus tints each cell via sevColor
export function CountBars({ rows, groupKey, colorByStatus }: { rows: Record<string, unknown>[]; groupKey: string; colorByStatus?: boolean }) {
  const data = useMemo(() => groupCount(rows, groupKey).slice(0, 10), [rows, groupKey]);
  return (
    <BarChart data={data} margin={{ top: 4, right: 12, bottom: 30, left: 4 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey="name" tick={TICK} interval={0} angle={-25} textAnchor="end" height={44} />
      <YAxis tick={TICK} allowDecimals={false} width={30} />
      <Tooltip />
      <Bar dataKey="value" radius={[3, 3, 0, 0]} fill={GOOD}>
        {colorByStatus && data.map((d, i) => <Cell key={i} fill={sevColor(d.name)} />)}
      </Bar>
    </BarChart>
  );
}

// ── Accruals: revenue by station + carbon offset by station ──────────────────
export function accrualsViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Metered revenue by station" subtitle="Accrued ZAR this window · top 8 stations">
        <ZarBars rows={rows} groupKey="station_name" metric="revenue_zar" />
      </Panel>
      <Panel title="Carbon offset by station" subtitle="tCO₂e abated · source for credit minting">
        <NumBars rows={rows} groupKey="station_name" metric="carbon_tco2e" fill={GOOD} />
      </Panel>
    </Grid2>
  );
}

// ── Carbon credits: value by station + status funnel ─────────────────────────
export function carbonCreditsViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Credit value by station" subtitle="ZAR carbon value · top 8 stations">
        <ZarBars rows={rows} groupKey="station_name" metric="carbon_value_zar" />
      </Panel>
      <Panel title="Credits by status" subtitle="Minted → issued → retired lifecycle">
        <CountBars rows={rows} groupKey="status" colorByStatus />
      </Panel>
    </Grid2>
  );
}

// ── Devices: fleet by type + by status ───────────────────────────────────────
export function devicesViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Device fleet by type" subtitle="Inverters, meters, sensors across sites">
        <CountBars rows={rows} groupKey="device_type" />
      </Panel>
      <Panel title="Devices by status" subtitle="Health of the connected fleet">
        <CountBars rows={rows} groupKey="status" colorByStatus />
      </Panel>
    </Grid2>
  );
}

// ── Ingestion: adapters + last poll status ───────────────────────────────────
export function ingestionViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Feeds by adapter" subtitle="Polling connectors across the fleet">
        <CountBars rows={rows} groupKey="adapter" />
      </Panel>
      <Panel title="Feeds by last poll status" subtitle="Where ingestion is failing">
        <CountBars rows={rows} groupKey="last_status" colorByStatus />
      </Panel>
    </Grid2>
  );
}

// ── Parts: stock on hand by OEM + reorder health ─────────────────────────────
export function partsViz(rows: Record<string, unknown>[]): React.ReactNode {
  return <PartsCharts rows={rows} />;
}
function PartsCharts({ rows }: { rows: Record<string, unknown>[] }) {
  // reorder health: current_stock at/below min → reorder now, within 25% of min → low, else ok
  const reorder = useMemo(() => {
    let ok = 0, low = 0, out = 0;
    for (const r of rows) {
      const stock = num(r.current_stock), min = num(r.min_stock_qty);
      if (stock <= min) out += 1;
      else if (stock <= min * 1.25) low += 1;
      else ok += 1;
    }
    return [
      { name: 'reorder now', value: out },
      { name: 'low', value: low },
      { name: 'ok', value: ok },
    ];
  }, [rows]);
  return (
    <Grid2>
      <Panel title="Stock on hand by OEM" subtitle="Total units held · top 8 manufacturers">
        <NumBars rows={rows} groupKey="manufacturer" metric="current_stock" fill={GOOD} />
      </Panel>
      <Panel title="Reorder health" subtitle="Parts at/below minimum stock threshold">
        <BarChart data={reorder} margin={{ top: 4, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="name" tick={TICK} />
          <YAxis tick={TICK} allowDecimals={false} width={30} />
          <Tooltip />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {reorder.map((d, i) => <Cell key={i} fill={i === 0 ? BAD : i === 1 ? WARN : GOOD} />)}
          </Bar>
        </BarChart>
      </Panel>
    </Grid2>
  );
}

// ── Maintenance: PM schedule by status + by task type ────────────────────────
export function maintenanceViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="PM tasks by status" subtitle="Preventive-maintenance schedule health">
        <CountBars rows={rows} groupKey="status" colorByStatus />
      </Panel>
      <Panel title="PM tasks by type" subtitle="Where scheduled effort concentrates">
        <CountBars rows={rows} groupKey="task_type" />
      </Panel>
    </Grid2>
  );
}

// ── Projects: capacity by project + status funnel ────────────────────────────
export function projectsViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Capacity by project" subtitle="Total kW under management · top 8">
        <NumBars rows={rows} groupKey="name" metric="total_capacity_kw" fill={GOOD} />
      </Panel>
      <Panel title="Projects by status" subtitle="Portfolio lifecycle position">
        <CountBars rows={rows} groupKey="status" colorByStatus />
      </Panel>
    </Grid2>
  );
}

// ── Sites: open faults by site + lost revenue by site ────────────────────────
export function sitesViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Open faults by site" subtitle="Where field attention is needed · top 8">
        <NumBars rows={rows} groupKey="name" metric="open_faults" fill={BAD} />
      </Panel>
      <Panel title="Revenue lost MTD by site" subtitle="ZAR bled to downtime this month · top 8">
        <ZarBars rows={rows} groupKey="name" metric="revenue_lost_mtd_zar" />
      </Panel>
    </Grid2>
  );
}

// ── Technicians: team availability by status + skill coverage ────────────────
export function techniciansViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Team by status" subtitle="Availability across the crew">
        <CountBars rows={rows} groupKey="status" colorByStatus />
      </Panel>
      <Panel title="Coverage by skill" subtitle="Head-count per primary skill">
        <CountBars rows={rows} groupKey="skills" />
      </Panel>
    </Grid2>
  );
}
