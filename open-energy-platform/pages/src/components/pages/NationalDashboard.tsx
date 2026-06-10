// W7 — National Dashboard: Bloomberg-density operator view of the entire platform.
// Reads /api/national-dashboard — only ever touches pre-aggregated rollup tables.
// Admin-only. Surfaced at /dashboard.
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Kpis {
  active_chains: number;
  events_24h: number;
  sla_breach_rate_pct: number;
  value_30d_zar: number;
  open_actions: number;
  regulator_crossings_30d: number;
}

interface DomainRollup {
  domain: string;
  chains_active: number;
  events_30d: number;
  breach_rate_pct: number;
  value_30d_zar: number;
}

interface ChainHealth {
  chain_key: string;
  open_count: number;
  breach_count: number;
  events_30d: number;
  value_30d_zar: number;
  sla_adherence_pct: number;
}

interface QueueDepth {
  role: string;
  pending: number;
}

interface EventPoint {
  date: string;
  events: number;
  value_zar: number;
}

interface DashboardData {
  kpis: Kpis;
  domain_rollups: DomainRollup[];
  chain_health: ChainHealth[];
  role_queue_depth: QueueDepth[];
  event_trend: EventPoint[];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtZAR = (v: number) =>
  v >= 1_000_000_000
    ? `R${(v / 1_000_000_000).toFixed(1)}B`
    : v >= 1_000_000
    ? `R${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000
    ? `R${(v / 1_000).toFixed(0)}K`
    : `R${v.toFixed(0)}`;

const fmtNum = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v);

const pct = (v: number) => `${v.toFixed(1)}%`;

// ─── Domain meta ─────────────────────────────────────────────────────────────

const DOMAIN_COLOR: Record<string, string> = {
  trading:   '#1a3a5c',
  carbon:    '#16a34a',
  ipp:       '#7c3aed',
  lender:    '#b45309',
  offtaker:  '#0369a1',
  grid:      '#dc2626',
  regulator: '#0f766e',
  support:   '#6b7280',
  esums:     '#d97706',
};

const DOMAIN_ICON: Record<string, string> = {
  trading:   'T',
  carbon:    'C',
  ipp:       'I',
  lender:    'L',
  offtaker:  'O',
  grid:      'G',
  regulator: 'R',
  support:   'S',
  esums:     'E',
};

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 bg-white flex flex-col gap-1 ${alert ? 'border-red-200 bg-red-50' : 'border-[#dde4ec]'}`}>
      <span className="text-[11px] font-medium text-[#5a7184] uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${alert ? 'text-red-600' : 'text-[#1a3a5c]'}`}>{value}</span>
      {sub && <span className="text-[11px] text-[#8fa3b1]">{sub}</span>}
    </div>
  );
}

// ─── Sparkline (SVG inline) ───────────────────────────────────────────────────

function Sparkline({ points, color = '#1a3a5c' }: { points: number[]; color?: string }) {
  if (points.length < 2) return <div className="h-8 w-full" />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const H = 32;
  const W = 100;
  const step = W / (points.length - 1);
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-8">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Domain card ─────────────────────────────────────────────────────────────

function DomainCard({ d }: { d: DomainRollup }) {
  const color = DOMAIN_COLOR[d.domain] ?? '#6b7280';
  const icon = DOMAIN_ICON[d.domain] ?? '?';
  const breachAlert = d.breach_rate_pct > 5;
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[11px] font-bold" style={{ backgroundColor: color }}>
          {icon}
        </div>
        <span className="text-[13px] font-semibold text-[#1a3a5c] capitalize">{d.domain}</span>
        <span className="ml-auto text-[11px] text-[#8fa3b1]">{d.chains_active} active</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-[15px] font-bold text-[#1a3a5c] tabular-nums">{fmtNum(d.events_30d)}</div>
          <div className="text-[10px] text-[#8fa3b1]">events 30d</div>
        </div>
        <div>
          <div className={`text-[15px] font-bold tabular-nums ${breachAlert ? 'text-red-600' : 'text-[#1a3a5c]'}`}>{pct(d.breach_rate_pct)}</div>
          <div className="text-[10px] text-[#8fa3b1]">SLA breach</div>
        </div>
        <div>
          <div className="text-[15px] font-bold text-[#1a3a5c] tabular-nums">{fmtZAR(d.value_30d_zar)}</div>
          <div className="text-[10px] text-[#8fa3b1]">value 30d</div>
        </div>
      </div>
    </div>
  );
}

// ─── Chain health table ───────────────────────────────────────────────────────

function ChainHealthTable({ rows }: { rows: ChainHealth[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#dde4ec] bg-white">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[#dde4ec] bg-[#f8fafc]">
            <th className="text-left px-3 py-2 font-semibold text-[#5a7184] uppercase text-[10px] tracking-wide">Chain</th>
            <th className="text-right px-3 py-2 font-semibold text-[#5a7184] uppercase text-[10px] tracking-wide">Open</th>
            <th className="text-right px-3 py-2 font-semibold text-[#5a7184] uppercase text-[10px] tracking-wide">Breaches</th>
            <th className="text-right px-3 py-2 font-semibold text-[#5a7184] uppercase text-[10px] tracking-wide">Events 30d</th>
            <th className="text-right px-3 py-2 font-semibold text-[#5a7184] uppercase text-[10px] tracking-wide">Value 30d</th>
            <th className="text-right px-3 py-2 font-semibold text-[#5a7184] uppercase text-[10px] tracking-wide">SLA %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const alert = r.sla_adherence_pct < 90;
            return (
              <tr key={r.chain_key} className="border-b border-[#f0f4f8] hover:bg-[#f8fafc] transition-colors">
                <td className="px-3 py-1.5 font-mono text-[11px] text-[#1a3a5c]">{r.chain_key}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[#1a3a5c]">{r.open_count}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${r.breach_count > 0 ? 'text-red-600 font-semibold' : 'text-[#1a3a5c]'}`}>{r.breach_count}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[#1a3a5c]">{fmtNum(r.events_30d)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[#1a3a5c]">{fmtZAR(r.value_30d_zar)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${alert ? 'text-red-600' : 'text-green-700'}`}>
                  {pct(r.sla_adherence_pct)}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-[#8fa3b1] text-[12px]">No chain data yet — metrics populate after first nightly rollup.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Role queue bars ──────────────────────────────────────────────────────────

function RoleQueueDepth({ rows }: { rows: QueueDepth[] }) {
  const max = Math.max(...rows.map((r) => r.pending), 1);
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
      <div className="text-[11px] font-semibold text-[#5a7184] uppercase tracking-wide mb-3">Role queue depth</div>
      {rows.length === 0 && (
        <div className="text-[12px] text-[#8fa3b1] py-2">All queues empty.</div>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.role} className="flex items-center gap-3">
            <div className="w-28 text-[11px] text-[#1a3a5c] font-medium truncate capitalize">{r.role.replace(/_/g, ' ')}</div>
            <div className="flex-1 h-2 rounded-full bg-[#e8edf2] overflow-hidden">
              <div
                role="progressbar"
                aria-label={`${r.role.replace(/_/g, ' ')} queue depth`}
                aria-valuenow={r.pending}
                aria-valuemin={0}
                aria-valuemax={max}
                className="h-full rounded-full bg-[#c2873a]"
                style={{ width: `${(r.pending / max) * 100}%` }}
              />
            </div>
            <div className="w-10 text-right text-[11px] font-semibold text-[#1a3a5c] tabular-nums">{r.pending}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Event trend chart ────────────────────────────────────────────────────────

function EventTrend({ points }: { points: EventPoint[] }) {
  const eventVals = points.map((p) => p.events);
  const valueVals = points.map((p) => p.value_zar);
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
      <div className="text-[11px] font-semibold text-[#5a7184] uppercase tracking-wide mb-1">14-day event trend</div>
      {points.length === 0 ? (
        <div className="text-[12px] text-[#8fa3b1] py-4">No data yet — trend populates after first nightly rollup.</div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] text-[#8fa3b1] mb-0.5">Events / day</div>
            <Sparkline points={eventVals} color="#1a3a5c" />
            <div className="flex justify-between text-[10px] text-[#8fa3b1]">
              <span>{points[0]?.date?.slice(5)}</span>
              <span>{points[points.length - 1]?.date?.slice(5)}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#8fa3b1] mb-0.5">Value ZAR / day</div>
            <Sparkline points={valueVals} color="#16a34a" />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div>
              <div className="text-[13px] font-bold text-[#1a3a5c] tabular-nums">{fmtNum(eventVals.reduce((a, b) => a + b, 0))}</div>
              <div className="text-[10px] text-[#8fa3b1]">total events</div>
            </div>
            <div>
              <div className="text-[13px] font-bold text-[#1a3a5c] tabular-nums">{fmtNum(Math.round(eventVals.reduce((a, b) => a + b, 0) / Math.max(points.length, 1)))}</div>
              <div className="text-[10px] text-[#8fa3b1]">avg/day</div>
            </div>
            <div>
              <div className="text-[13px] font-bold text-green-700 tabular-nums">{fmtZAR(valueVals.reduce((a, b) => a + b, 0))}</div>
              <div className="text-[10px] text-[#8fa3b1]">total value</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NationalDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: DashboardData }>('/national-dashboard');
      setData(res.data.data);
      setLastUpdated(new Date().toLocaleTimeString('en-ZA'));
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { error?: string } }; message?: string };
      setError(axiosErr?.response?.data?.error ?? axiosErr?.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-8 w-64" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-[13px]">
          {error === 'Admin only' ? 'This page requires admin access.' : `Error: ${error}`}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const kpis = data.kpis;

  return (
    <div className="p-4 space-y-5 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-bold text-[#1a3a5c] leading-tight">National Platform Dashboard</h1>
          <p className="text-[12px] text-[#8fa3b1] mt-0.5">
            Platform-wide aggregate metrics. Data reflects yesterday&apos;s nightly rollup.
            {lastUpdated && ` Loaded at ${lastUpdated}.`}
          </p>
        </div>
        <button type="button"
          onClick={() => void load()}
          className="h-8 px-3 rounded-md border border-[#dde4ec] bg-white text-[12px] font-medium text-[#1a3a5c] hover:bg-[#f8fafc] transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Active chains" value={fmtNum(kpis.active_chains)} sub="with open cases" />
        <KpiCard label="Events 24h" value={fmtNum(kpis.events_24h)} sub="platform events today" />
        <KpiCard
          label="SLA breach rate"
          value={pct(kpis.sla_breach_rate_pct)}
          sub="30-day rolling"
          alert={kpis.sla_breach_rate_pct > 5}
        />
        <KpiCard label="Value 30d" value={fmtZAR(kpis.value_30d_zar)} sub="transactions + settlements" />
        <KpiCard label="Open actions" value={fmtNum(kpis.open_actions)} sub="across all roles" />
        <KpiCard label="Regulator crossings" value={fmtNum(kpis.regulator_crossings_30d)} sub="30-day" />
      </div>

      {/* Domain rollups */}
      <div>
        <div className="text-[11px] font-semibold text-[#5a7184] uppercase tracking-wide mb-2">Domain rollups (30d)</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {data.domain_rollups.map((d) => <DomainCard key={d.domain} d={d} />)}
        </div>
      </div>

      {/* Main body: chain health + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          <div className="text-[11px] font-semibold text-[#5a7184] uppercase tracking-wide">Top 20 chains by activity</div>
          <ChainHealthTable rows={data.chain_health} />
        </div>
        <div className="space-y-4">
          <RoleQueueDepth rows={data.role_queue_depth} />
          <EventTrend points={data.event_trend} />
        </div>
      </div>

    </div>
  );
}
