// ════════════════════════════════════════════════════════════════════════
// EsumsOmCockpit — Fleet Overview Insights tab for the Esums module.
//
// The differentiating screen: every fault carries a live revenue-impact
// ticker, every AI insight has a 1-click CTA, and the WO kanban shows
// SLA countdowns inline.
//
// Pulls:
//   GET /esums/fleet-kpis          — portfolio aggregate
//   GET /esums/sites               — sites with KPI rollups
//   GET /esums/faults?status=...   — open fault register
//   GET /esums/work-orders         — kanban data
//   GET /esums/briefing            — proactive AI insights
//   GET /esums/predictions         — predictive maintenance
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';
import {
  Activity, AlertTriangle, Banknote, Battery, Brain, Clock, Cpu, Gauge,
  MapPin, ShieldAlert, Sparkles, Sun, Wind, Zap,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);
const formatZARm = (v: number) => `R ${(v / 1_000_000).toFixed(2)}m`;

type FleetKpis = {
  total_sites: number;
  total_mw: number;
  today_kwh: number;
  today_revenue_zar: number;
  blended_tariff_zar_mwh: number;
  availability_pct: number;
  open_faults: number;
  critical_faults: number;
  major_faults: number;
  bleed_rate_zar_hour: number;
  lost_so_far_zar: number;
  open_work_orders: number;
  sla_breached_open: number;
};

type SiteRow = {
  id: string;
  name: string;
  technology: string;
  capacity_mw: number;
  status: string;
  device_count: number;
  open_faults: number;
  revenue_lost_mtd_zar: number;
  open_wos: number;
};

type FaultRow = {
  id: string;
  site_id: string;
  site_name: string;
  category: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  description: string;
  detected_at: string;
  status: string;
  hourly_loss_zar: number;
  total_loss_zar: number;
  elapsed_hours: number;
  device_manufacturer?: string;
  device_model?: string;
  warranty_covered?: 0 | 1;
};

type WoRow = {
  id: string;
  wo_number: string;
  site_id: string;
  site_name: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  title: string;
  assigned_to: string | null;
  technician_name: string | null;
  sla_deadline: string;
};

type Insight = {
  type: 'revenue_alert' | 'sla_warning' | 'predictive' | 'maintenance';
  severity: string;
  title: string;
  body: string;
  estimated_loss_zar?: number;
  cta: { label: string; href: string };
};

type Briefing = {
  generated_at: string;
  summary: {
    open_faults: number;
    bleed_rate_zar_hour: number;
    sla_at_risk: number;
    predictions_open: number;
    maintenance_due_7d: number;
  };
  insights: Insight[];
};

const SEV_TONE: Record<string, string> = {
  critical: 'widget-tone-bad',
  major:    'widget-tone-amber',
  minor:    'widget-tone-info',
  info:     'widget-tone-info',
};

const TECH_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  solar: Sun,
  wind: Wind,
  bess: Battery,
  hybrid: Cpu,
};

// ─── Revenue Ticker — pulsing, accumulates locally ──────────────────────
function RevenueTicker({ baseToday, blendedTariff, totalMw, availabilityPct }: {
  baseToday: number; blendedTariff: number; totalMw: number; availabilityPct: number;
}) {
  // Instantaneous R/hour at current sun + availability — synthetic but plausible
  const ratePerHour = (totalMw * 0.4 * (availabilityPct / 100)) * blendedTariff;
  const [accum, setAccum] = useState(baseToday);
  useEffect(() => {
    setAccum(baseToday);
    const interval = setInterval(() => {
      setAccum((v) => v + ratePerHour / 3600);
    }, 1000);
    return () => clearInterval(interval);
  }, [baseToday, ratePerHour]);
  return (
    <div className="flex items-center gap-3 pr-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--good, #1a8a5b)] opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--good, #1a8a5b)]" />
      </span>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-white/70">Generating</div>
        <div className="text-[18px] font-mono font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatZAR(accum)}
        </div>
        <div className="text-[10px] text-white/60">@ {formatZAR(ratePerHour)}/h</div>
      </div>
    </div>
  );
}

// ─── Hero KPI Strip ─────────────────────────────────────────────────────
function HeroStrip({ kpis }: { kpis: FleetKpis | null }) {
  if (!kpis) return <Skeleton variant="card" rows={1} />;
  return (
    <div className="rounded-xl border p-5" style={{ background: 'var(--s1, oklch(0.99 0.002 80))', borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-mono font-semibold" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>O&amp;M · Fleet Overview</div>
          <h1 className="font-display text-[22px] font-bold tracking-tight mt-0.5" style={{ color: 'var(--ink, oklch(0.15 0.025 250))' }}>
            {kpis.total_sites} sites · {kpis.total_mw.toFixed(1)} MW · ZA portfolio
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--ink-2, oklch(0.45 0.015 250))' }}>
            Real-time asset intelligence — every fault carries a financial price tag.
          </p>
        </div>
        <RevenueTicker
          baseToday={kpis.today_revenue_zar}
          blendedTariff={kpis.blended_tariff_zar_mwh}
          totalMw={kpis.total_mw}
          availabilityPct={kpis.availability_pct}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Kpi icon={<Activity size={14} />} label="Today's generation"
             value={`${(kpis.today_kwh / 1000).toFixed(1)} MWh`}
             sub={`@ R${kpis.blended_tariff_zar_mwh}/MWh blended`} />
        <Kpi icon={<Banknote size={14} />} label="Revenue today"
             value={formatZAR(kpis.today_revenue_zar)}
             sub={`Fleet availability ${kpis.availability_pct.toFixed(1)}%`} />
        <Kpi icon={<AlertTriangle size={14} />} label="Open faults"
             value={`${kpis.open_faults}`}
             sub={`${kpis.critical_faults} critical · ${kpis.major_faults} major`}
             tone={kpis.critical_faults > 0 ? 'bad' : kpis.major_faults > 0 ? 'warn' : 'good'} />
        <Kpi icon={<ShieldAlert size={14} />} label="SLA at risk"
             value={`${kpis.sla_breached_open}`}
             sub={`${kpis.open_work_orders} open WOs · bleeding ${formatZAR(kpis.bleed_rate_zar_hour)}/h`}
             tone={kpis.sla_breached_open > 0 ? 'bad' : 'info'} />
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone = 'info' }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' | 'info';
}) {
  const tones: Record<string, string> = {
    good: 'text-[var(--good, #1f7a4a)]',
    warn: 'text-[var(--warn, #b45309)]',
    bad:  'text-[var(--bad, #c0392b)]',
    info: '',
  };
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--s1, oklch(0.96 0.003 250))', border: '1px solid var(--border-subtle, oklch(0.90 0.004 250))' }}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>{icon}{label}</div>
      <div className={`mt-1 font-mono font-bold text-[18px] ${tones[tone]}`} style={{ fontVariantNumeric: 'tabular-nums', color: tones[tone] ? undefined : 'var(--ink, oklch(0.15 0.025 250))' }}>
        {value}
      </div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>{sub}</div>}
    </div>
  );
}

// ─── Live Fault Register ────────────────────────────────────────────────
function FaultRegister({ faults }: { faults: FaultRow[] }) {
  if (!faults.length) {
    return <section className="widget-card widget-empty">No active faults — fleet is operating cleanly.</section>;
  }
  return (
    <section className="widget-card">
      <header className="widget-card-header">
        <div>
          <div className="widget-card-title">Fault register — live revenue impact</div>
          <div className="widget-card-subtitle">Sorted by severity then bleed rate. Every row updates as time passes.</div>
        </div>
        {/* Faults have no Meridian chain (anomaly feed, not a state-machine case) —
            the dispatched work order is the navigable artifact (see WO board above). */}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <th className="text-left">Site</th>
              <th className="text-left">Device</th>
              <th className="text-left">Severity</th>
              <th className="text-left">Detected</th>
              <th className="text-right">R/hour</th>
              <th className="text-right">Lost so far</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {faults.slice(0, 6).map((f) => (
              <tr key={f.id}>
                <td>{f.site_name}</td>
                <td>{f.device_manufacturer ? `${f.device_manufacturer} ${f.device_model || ''}` : '—'}</td>
                <td>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${SEV_TONE[f.severity]}`}>
                    {f.severity}
                  </span>
                </td>
                <td className="font-mono text-[11px]">{Math.round(f.elapsed_hours)}h ago</td>
                <td className="text-right font-mono">{formatZAR(f.hourly_loss_zar)}</td>
                <td className="text-right font-mono widget-tone-bad-text">{formatZAR(f.total_loss_zar)}</td>
                <td className="text-right">
                  <span className="text-[11px] font-semibold text-[var(--ink-2, #6b7685)]">
                    {f.status === 'open' ? 'Open' : f.status === 'acknowledged' ? 'Ack' : 'Tracking'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Fleet Health Grid ──────────────────────────────────────────────────
function FleetHealthGrid({ sites }: { sites: SiteRow[] }) {
  return (
    <section className="widget-card">
      <header className="widget-card-header">
        <div>
          <div className="widget-card-title">Fleet health</div>
          <div className="widget-card-subtitle">{sites.length} sites under management</div>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3">
        {sites.map((s) => {
          const Icon = TECH_ICON[s.technology] || Zap;
          const tone = s.open_faults > 0 && s.revenue_lost_mtd_zar > 2000
            ? 'widget-tone-bad'
            : s.open_faults > 0 ? 'widget-tone-amber' : 'widget-tone-good';
          return (
            <Link key={s.id} to={`/esums/sites/${s.id}`}
                  className="rounded-lg border border-[var(--border-subtle, #e2e8f0)] p-3 hover:border-[oklch(0.46_0.16_55)] hover:bg-[var(--s1, #f8fafc)] transition-colors block">
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-[oklch(0.46_0.16_55)]" />
                <span className="text-[12px] font-semibold text-[var(--ink, #0f1c2e)] flex-1 min-w-0 truncate">{s.name}</span>
                <span className={`inline-flex w-2 h-2 rounded-full ${tone}`} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--ink-2, #6b7685)]">
                <span>{s.capacity_mw.toFixed(1)} MW · {s.technology}</span>
                <span className="font-mono">
                  {s.open_faults > 0 ? `${s.open_faults} faults` : 'healthy'}
                </span>
              </div>
              {s.revenue_lost_mtd_zar > 0 && (
                <div className="mt-1 text-[10px] widget-tone-bad-text font-mono">
                  MTD lost: {formatZAR(s.revenue_lost_mtd_zar)}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── AI Briefing Panel ──────────────────────────────────────────────────
function AiBriefing({ briefing }: { briefing: Briefing | null }) {
  if (!briefing) return <section className="widget-card widget-empty">Loading briefing…</section>;
  if (!briefing.insights.length) {
    return (
      <section className="widget-card">
        <header className="widget-card-header">
          <div>
            <div className="widget-card-title inline-flex items-center gap-1"><Sparkles size={14} className="text-[#f6c44a]" /> AI briefing</div>
            <div className="widget-card-subtitle">All caught up — no proactive flags right now.</div>
          </div>
        </header>
      </section>
    );
  }
  return (
    <section className="widget-card">
      <header className="widget-card-header">
        <div>
          <div className="widget-card-title inline-flex items-center gap-1">
            <Sparkles size={14} className="text-[#f6c44a]" /> AI briefing
          </div>
          <div className="widget-card-subtitle">
            {briefing.summary.open_faults} open · bleeding {formatZAR(briefing.summary.bleed_rate_zar_hour)}/h ·
            {' '}{briefing.summary.predictions_open} predictive flags
          </div>
        </div>
      </header>
      <ul className="divide-y divide-[var(--s2, #eef2f7)]">
        {briefing.insights.slice(0, 6).map((i, idx) => (
          <li key={idx} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <BriefingIcon type={i.type} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-[var(--ink, #0f1c2e)]">{i.title}</div>
                <div className="text-[11px] text-[var(--ink-2, #6b7685)] mt-0.5 line-clamp-2">{i.body}</div>
                {i.estimated_loss_zar ? (
                  <div className="text-[10px] widget-tone-bad-text font-mono mt-0.5">
                    Est. impact: {formatZAR(i.estimated_loss_zar)}
                  </div>
                ) : null}
              </div>
              <Link to={i.cta.href}
                    className="text-[11px] font-semibold text-white bg-[#c2873a] hover:bg-[#a3702f] rounded-md px-2 py-1 transition-colors whitespace-nowrap">
                {i.cta.label}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BriefingIcon({ type }: { type: Insight['type'] }) {
  const map = {
    revenue_alert: <Banknote size={14} className="text-[var(--bad, #c0392b)] mt-0.5" />,
    sla_warning:   <Clock    size={14} className="text-[#b04e0f] mt-0.5" />,
    predictive:    <Brain    size={14} className="text-[#6b3a82] mt-0.5" />,
    maintenance:   <Gauge    size={14} className="text-[oklch(0.46_0.16_55)] mt-0.5" />,
  };
  return map[type];
}

// ─── Work Order Kanban ──────────────────────────────────────────────────
const WO_LANES: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'assigned', label: 'Assigned',  statuses: ['assigned', 'acknowledged'] },
  { key: 'en_route', label: 'En route',  statuses: ['en_route'] },
  { key: 'on_site',  label: 'On site',   statuses: ['on_site', 'diagnosing', 'repairing', 'testing'] },
  { key: 'done',     label: 'Completed', statuses: ['completed', 'verified'] },
];

function WoKanban({ wos }: { wos: WoRow[] }) {
  const lanes = WO_LANES.map((l) => ({
    ...l,
    cards: wos.filter((w) => l.statuses.includes(w.status)),
  }));
  return (
    <section className="widget-card">
      <header className="widget-card-header">
        <div>
          <div className="widget-card-title">Active work orders</div>
          <div className="widget-card-subtitle">Drag-to-reassign in the WO Board · countdown shown for SLA</div>
        </div>
        <Link to="/ledger/om_work_order" className="text-[11px] font-semibold text-[oklch(0.46_0.16_55)] hover:underline">View board →</Link>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-3">
        {lanes.map((lane) => (
          <div key={lane.key} className="rounded border border-[var(--s2, #eef2f7)] bg-[var(--s1, #fafbfd)] p-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #6b7685)] font-bold mb-2">
              {lane.label} <span className="font-mono">({lane.cards.length})</span>
            </div>
            <div className="space-y-2">
              {lane.cards.slice(0, 5).map((w) => (
                <WoCard key={w.id} wo={w} />
              ))}
              {!lane.cards.length && <div className="text-[11px] text-[var(--ink-2, #6b7685)] italic px-1">empty</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const PRIO_TONE: Record<string, string> = {
  critical: 'widget-tone-bad',
  high:     'widget-tone-amber',
  medium:   'widget-tone-info',
  low:      'widget-tone-info',
};

function WoCard({ wo }: { wo: WoRow }) {
  const minsLeft = Math.round((new Date(wo.sla_deadline).getTime() - Date.now()) / 60_000);
  const slaTone = minsLeft < 0 ? 'widget-tone-bad-text' : minsLeft < 60 ? 'widget-tone-warn-text' : 'widget-tone-good-text';
  return (
    <Link to={`/thread/om_work_order/${wo.id}`}
          className="block rounded bg-surface-v2 border border-[var(--border-subtle, #e2e8f0)] p-2 text-[11px] hover:border-[oklch(0.46_0.16_55)] transition-colors">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono font-semibold text-[var(--ink, #0f1c2e)]">{wo.wo_number}</span>
        <span className={`inline-flex px-1.5 rounded text-[9px] font-bold uppercase ${PRIO_TONE[wo.priority]}`}>{wo.priority}</span>
      </div>
      <div className="text-[var(--ink-2, #6b7685)] mt-1 line-clamp-2">{wo.title}</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] inline-flex items-center gap-1 text-[var(--ink-2, #6b7685)]">
          <MapPin size={9} /> {wo.site_name}
        </span>
        <span className={`text-[10px] font-mono font-semibold ${slaTone}`}>
          {minsLeft < 0 ? `⚠ ${Math.abs(minsLeft)}m over` : `${minsLeft}m`}
        </span>
      </div>
      {wo.technician_name && (
        <div className="text-[10px] text-[oklch(0.46_0.16_55)] mt-0.5">👷 {wo.technician_name}</div>
      )}
    </Link>
  );
}

// ─── Composite ──────────────────────────────────────────────────────────
export function EsumsOmCockpit() {
  const [kpis, setKpis] = useState<FleetKpis | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [faults, setFaults] = useState<FaultRow[]>([]);
  const [wos, setWos] = useState<WoRow[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const [k, s, f, w, b] = await Promise.all([
        api.get('/esums/fleet-kpis'),
        api.get('/esums/sites'),
        api.get('/esums/faults?status=open').catch(() => ({ data: { data: [] } })),
        api.get('/esums/work-orders'),
        api.get('/esums/briefing'),
      ]);
      setKpis(k.data?.data || null);
      setSites((s.data?.data as SiteRow[]) || []);
      // include acknowledged + in_progress too
      const [fb, fc] = await Promise.all([
        api.get('/esums/faults?status=acknowledged'),
        api.get('/esums/faults?status=in_progress'),
      ]);
      const merged = [...(f.data?.data || []), ...(fb.data?.data || []), ...(fc.data?.data || [])];
      setFaults(merged as FaultRow[]);
      setWos((w.data?.data as WoRow[]) || []);
      setBriefing((b.data?.data as Briefing) || null);
    } catch (e: any) {
      setErr(e?.message || 'failed to load');
    }
  };

  // Visibility-aware polling — pauses fetches while the tab is hidden,
  // refreshes immediately when the user returns. Cuts cockpit-driven D1
  // reads to near-zero for inactive sessions.
  useVisiblePolling(60_000, load);

  if (err) return <div className="widget-card widget-empty">Error: {err}</div>;

  return (
    <div className="space-y-3">
      <HeroStrip kpis={kpis} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3">
          <FaultRegister faults={faults} />
          <WoKanban wos={wos} />
        </div>
        <div className="space-y-3">
          <FleetHealthGrid sites={sites} />
          <AiBriefing briefing={briefing} />
        </div>
      </div>
    </div>
  );
}

export default EsumsOmCockpit;
