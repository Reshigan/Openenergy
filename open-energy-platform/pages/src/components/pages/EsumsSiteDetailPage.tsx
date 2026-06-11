// ════════════════════════════════════════════════════════════════════════
// EsumsSiteDetailPage — /esums/sites/:id (replaces the listing fallback)
//
// Per-asset operations view:
//   • Overview  — KPIs (PR, CUF, MTTR, first-time-fix, faults) +
//                 30-day kWh/revenue trend + open faults + open WOs
//   • Devices   — every inverter / meter / sensor with status + last seen
//   • Charts    — PR & CUF trend, daily kWh column chart, fault timeline
//   • Tools     — calculators: payback, soiling-loss vs cleaning-cost,
//                 PR drift simulator, REC certificate value
//   • Print     — server-rendered lender pack + regulator pack buttons
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Activity, AlertCircle, ArrowLeft, BarChart3, Calculator, FileText, Layers,
  Radio, RefreshCw, Wrench, Zap,
} from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';
import { PrintPackButton } from '../PrintPackButton';

type Site = {
  id: string; name: string; technology: string; capacity_mw: number;
  capacity_kwp: number | null; province: string | null;
  commissioning_date: string | null; ppa_tariff_zar_mwh: number | null;
  status: string;
};

type Device = {
  id: string; site_id: string; device_type: string; manufacturer: string | null;
  model: string | null; serial_number: string | null; rated_kw: number | null;
  firmware_version: string | null; status: string; last_seen_at: string | null;
};

type SeriesPoint = { day: string; kwh: number; revenue_zar: number; pr: number; cf: number };

type Detail = {
  site: Site; devices: Device[];
  recent_faults: any[]; open_work_orders: any[];
  today_kwh: number; today_revenue_zar: number;
};

type Perf = {
  series: SeriesPoint[];
  faults: { total: number; critical: number; mttr_hours: number | null };
  work_orders: { total: number; first_time_fix_pct: number; avg_resolve_hours: number | null; sla_breached: number };
};

type Tab = 'overview' | 'live' | 'devices' | 'charts' | 'tools' | 'print';

type LivePayload = {
  site: Site;
  devices: Device[];
  device_count: number;
  online_pct: number;
  open_faults: any[];
  open_fault_count: number;
  connector_runs: any[];
  last_hour: {
    readings: number;
    kwh: number;
    last_ts: string | null;
    avg_ac_kw: number;
    max_temp_c: number;
  };
  generated_at: string;
};

export function EsumsSiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [perf, setPerf] = useState<Perf | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setErr(null);
    try {
      const [d, p] = await Promise.all([
        api.get(`/esums/sites/${encodeURIComponent(id)}`),
        api.get(`/esums/performance/${encodeURIComponent(id)}`, { params: { days: 30 } }),
      ]);
      if (!d.data.success) throw new Error(d.data.error || 'load failed');
      setDetail(d.data.data);
      if (p.data.success) setPerf(p.data.data);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'load failed');
    }
  };
  useEffect(() => { void load(); }, [id]);

  if (!id) return <div className="p-6" style={{ color: 'oklch(0.48 0.20 20)' }}>No site id in URL.</div>;
  if (err && !detail) {
    return (
      <div className="p-6">
        <Link to="/esums" className="text-[12px] underline inline-flex items-center gap-1"
              style={{ color: 'oklch(0.17 0.010 250)' }}>
          <ArrowLeft size={12}/> Back to fleet
        </Link>
        <div className="widget-card widget-tone-bad p-4 mt-2">{err}</div>
      </div>
    );
  }
  if (!detail) return <div className="p-6 text-[12px]" style={{ color: 'oklch(0.60 0.007 250)' }}>Loading site…</div>;

  const { site } = detail;
  const subtitle = `${site.technology || 'unknown'} · ${Number(site.capacity_mw).toFixed(1)} MW${site.province ? ` · ${site.province}` : ''} · status ${site.status}`;

  return (
    <StitchPage
      eyebrowIcon={Zap}
      eyebrowLabel={`Esums · site detail · ${id}`}
      title={site.name}
      subtitle={subtitle}
    >
      <div className="flex items-center gap-2 mb-3">
        <Link to="/esums" className="text-[11px] inline-flex items-center gap-1"
              style={{ color: 'oklch(0.60 0.007 250)' }}>
          <ArrowLeft size={12}/> Back to fleet
        </Link>
        <button type="button" onClick={load} className="ml-auto h-8 px-2 rounded border text-[11px] inline-flex items-center gap-1"
                style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
          <RefreshCw size={11}/> Refresh
        </button>
      </div>

      <div className="border-b flex flex-wrap gap-1 mb-3" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
        {([
          ['overview', 'Overview', Activity],
          ['live', 'Live', Radio],
          ['devices', 'Devices', Layers],
          ['charts', 'Charts', BarChart3],
          ['tools', 'Tools', Calculator],
          ['print', 'Print packs', FileText],
        ] as const).map(([k, label, Icon]) => (
          <button type="button" key={k} onClick={() => setTab(k)}
            className="h-9 px-3 text-[12px] font-semibold inline-flex items-center gap-1.5 border-b-2 -mb-px"
            style={tab === k
              ? { borderColor: 'oklch(0.46 0.16 55)', color: 'oklch(0.46 0.16 55)' }
              : { borderColor: 'transparent', color: 'oklch(0.60 0.007 250)' }}>
            <Icon size={13}/> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab detail={detail} perf={perf}/>}
      {tab === 'live' && <LiveTab siteId={id}/>}
      {tab === 'devices' && <DevicesTab devices={detail.devices}/>}
      {tab === 'charts' && <ChartsTab perf={perf}/>}
      {tab === 'tools' && <ToolsTab site={site} perf={perf}/>}
      {tab === 'print' && <PrintTab site={site}/>}
    </StitchPage>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────
function OverviewTab({ detail, perf }: { detail: Detail; perf: Perf | null }) {
  const todayPr = perf?.series.at(-1)?.pr ?? null;
  const todayCf = perf?.series.at(-1)?.cf ?? null;
  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Today kWh" value={Math.round(detail.today_kwh).toLocaleString('en-ZA')} caption="from telemetry"/>
        <Kpi label="Today R" value={`R${Math.round(detail.today_revenue_zar).toLocaleString('en-ZA')}`} caption="kWh × PPA tariff"/>
        <Kpi label="PR today" value={todayPr != null ? `${todayPr}%` : '—'} caption="kWh ÷ 5.5 PSH ref"/>
        <Kpi label="CUF today" value={todayCf != null ? `${todayCf}%` : '—'} caption="kWh ÷ nameplate × 24"/>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiSm label="30d faults" value={perf?.faults.total ?? 0} sub={perf?.faults.critical ? `${perf.faults.critical} critical` : ''}/>
        <KpiSm label="MTTR (h)" value={perf?.faults.mttr_hours ?? '—'}/>
        <KpiSm label="WO first-time fix" value={perf ? `${perf.work_orders.first_time_fix_pct}%` : '—'} sub={perf?.work_orders.sla_breached ? `${perf.work_orders.sla_breached} SLA breached` : ''}/>
      </div>
      <div className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Open faults ({detail.recent_faults.filter((f) => !['resolved','closed'].includes(f.status)).length})</div></header>
        <ul className="divide-y text-[12px]" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
          {detail.recent_faults.filter((f) => !['resolved','closed'].includes(f.status)).slice(0, 10).map((f) => (
            <li key={f.id} className="px-4 py-2 flex items-center gap-3">
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                    style={f.severity === 'critical'
                      ? { background: 'oklch(0.97 0.04 20)', color: 'oklch(0.48 0.20 20)' }
                      : { background: 'oklch(0.96 0.003 250)', color: 'oklch(0.17 0.010 250)' }}>{f.severity}</span>
              <span className="flex-1 truncate">{f.description}</span>
              <span className="font-mono text-[11px]" style={{ color: 'oklch(0.48 0.20 20)' }}>R{Math.round(Number(f.hourly_loss_zar || 0))}/h</span>
              <span className="font-mono text-[11px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{new Date(f.detected_at).toLocaleDateString('en-ZA')}</span>
            </li>
          ))}
          {detail.recent_faults.filter((f) => !['resolved','closed'].includes(f.status)).length === 0 && (
            <li className="px-4 py-3 text-[12px] italic" style={{ color: 'oklch(0.60 0.007 250)' }}>No open faults — nice.</li>
          )}
        </ul>
      </div>
      <div className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Open work orders ({detail.open_work_orders.length})</div></header>
        <ul className="divide-y text-[12px]" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
          {detail.open_work_orders.slice(0, 10).map((w) => (
            <li key={w.id} className="px-4 py-2 flex items-center gap-3">
              <span className="font-mono text-[11px]">{w.wo_number}</span>
              <span className="flex-1 truncate">{w.title}</span>
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                    style={{ background: 'oklch(0.96 0.003 250)', color: 'oklch(0.17 0.010 250)' }}>{w.status}</span>
              <span className="font-mono text-[11px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{w.sla_deadline ? new Date(w.sla_deadline).toLocaleDateString('en-ZA') : '—'}</span>
            </li>
          ))}
          {detail.open_work_orders.length === 0 && (
            <li className="px-4 py-3 text-[12px] italic" style={{ color: 'oklch(0.60 0.007 250)' }}>No open work orders.</li>
          )}
        </ul>
      </div>
    </section>
  );
}

// ─── Live ──────────────────────────────────────────────────────────────
// Auto-refreshing operations view backed by GET /esums/sites/:id/live.
// One round trip returns: open faults, recent connector runs, last-hour
// telemetry summary, and device freshness — so you don't fan-out four
// requests every 30s.
function LiveTab({ siteId }: { siteId: string }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`/esums/sites/${encodeURIComponent(siteId)}/live`);
      if (!r.data.success) throw new Error(r.data.error || 'live load failed');
      setData(r.data.data);
      setLastAt(Date.now());
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'live load failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(t);
  }, [siteId]);

  if (err && !data) return <div className="widget-card widget-tone-bad p-4">{err}</div>;
  if (!data) return <div className="widget-card p-6 text-center text-[12px]" style={{ color: 'oklch(0.60 0.007 250)' }}>Loading live snapshot…</div>;

  const devicesOnline = data.devices.filter((d) => d.status === 'online').length;
  const devicesStale = data.devices.filter((d) => {
    if (!d.last_seen_at) return true;
    return Date.now() - new Date(d.last_seen_at).getTime() > 60 * 60_000;
  }).length;
  const onlinePct = data.devices.length > 0 ? Math.round((devicesOnline / data.devices.length) * 100) : 0;
  const lh = data.last_hour;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'oklch(0.60 0.007 250)' }}>
        <Radio size={11} style={{ color: 'oklch(0.45 0.15 150)' }} className={loading ? 'animate-pulse' : ''}/>
        <span>Auto-refresh every 30s</span>
        {lastAt && <span className="font-mono">· last {new Date(lastAt).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</span>}
        <button type="button" onClick={load} className="ml-auto h-7 px-2 rounded border text-[11px] inline-flex items-center gap-1"
                style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
          <RefreshCw size={11}/> Refresh now
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiSm label="Devices online" value={`${devicesOnline}/${data.devices.length}`} sub={`${onlinePct}% online`}/>
        <KpiSm label="Stale (>60m)" value={devicesStale} sub={devicesStale > 0 ? 'check comms' : 'fresh'}/>
        <KpiSm label="Last hr kWh" value={Math.round(lh.kwh).toLocaleString('en-ZA')} sub={`${lh.readings} readings`}/>
        <KpiSm label="Avg AC kW" value={lh.avg_ac_kw ? Number(lh.avg_ac_kw).toFixed(1) : '—'}/>
        <KpiSm label="Peak temp °C" value={lh.max_temp_c ? Number(lh.max_temp_c).toFixed(1) : '—'} sub={Number(lh.max_temp_c) > 75 ? 'overtemp risk' : ''}/>
      </div>

      <div className="widget-card">
        <header className="widget-card-header flex items-center gap-2">
          <AlertCircle size={13} style={{ color: data.open_faults.length > 0 ? 'oklch(0.48 0.20 20)' : 'oklch(0.45 0.15 150)' }}/>
          <div className="widget-card-title">Open faults ({data.open_faults.length})</div>
        </header>
        <ul className="divide-y text-[12px]" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
          {data.open_faults.slice(0, 20).map((f) => (
            <li key={f.id} className="px-4 py-2 flex items-center gap-3">
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                    style={f.severity === 'critical'
                      ? { background: 'oklch(0.97 0.04 20)', color: 'oklch(0.48 0.20 20)' }
                      : f.severity === 'major'
                      ? { background: 'oklch(0.96 0.003 250)', color: 'oklch(0.46 0.16 55)' }
                      : { background: 'oklch(0.96 0.003 250)', color: 'oklch(0.17 0.010 250)' }}>{f.severity}</span>
              {f.fault_code && <span className="font-mono text-[10px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{f.fault_code}</span>}
              <span className="flex-1 truncate">{f.description}</span>
              <span className="font-mono text-[11px]" style={{ color: 'oklch(0.48 0.20 20)' }}>R{Math.round(Number(f.hourly_loss_zar || 0))}/h</span>
              <span className="font-mono text-[10px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{new Date(f.detected_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</span>
            </li>
          ))}
          {data.open_faults.length === 0 && (
            <li className="px-4 py-3 text-[12px] italic" style={{ color: 'oklch(0.60 0.007 250)' }}>No open faults — fleet is healthy.</li>
          )}
        </ul>
      </div>

      <div className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Connector runs (last 10)</div></header>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="text-left border-b" style={{ color: 'oklch(0.60 0.007 250)', borderColor: 'oklch(0.87 0.006 250)' }}>
              <th className="px-3 py-1.5">Started</th>
              <th className="px-3 py-1.5">Source</th>
              <th className="px-3 py-1.5">Status</th>
              <th className="px-3 py-1.5 text-right">Received</th>
              <th className="px-3 py-1.5 text-right">Written</th>
              <th className="px-3 py-1.5 text-right">Rejected</th>
              <th className="px-3 py-1.5">Error</th>
            </tr></thead>
            <tbody>
              {data.connector_runs.slice(0, 10).map((r) => (
                <tr key={r.id} className="border-b" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
                  <td className="px-3 py-1.5 font-mono text-[10px]">{new Date(r.started_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</td>
                  <td className="px-3 py-1.5">{r.source || '—'}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                          style={r.status === 'ok'
                            ? { background: 'oklch(0.97 0.04 150)', color: 'oklch(0.45 0.15 150)' }
                            : r.status === 'partial'
                            ? { background: 'oklch(0.96 0.003 250)', color: 'oklch(0.46 0.16 55)' }
                            : r.status === 'failed'
                            ? { background: 'oklch(0.97 0.04 20)', color: 'oklch(0.48 0.20 20)' }
                            : { background: 'oklch(0.96 0.003 250)', color: 'oklch(0.17 0.010 250)' }}>{r.status}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.rows_received ?? 0}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.rows_written ?? 0}</td>
                  <td className="px-3 py-1.5 text-right font-mono" style={{ color: 'oklch(0.48 0.20 20)' }}>{r.rows_rejected ?? 0}</td>
                  <td className="px-3 py-1.5 text-[10px] truncate max-w-[200px]" style={{ color: 'oklch(0.48 0.20 20)' }} title={r.error_sample || ''}>{r.error_sample || ''}</td>
                </tr>
              ))}
              {data.connector_runs.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-3 text-[12px] italic text-center" style={{ color: 'oklch(0.60 0.007 250)' }}>No connector runs yet — push telemetry to POST /api/esums-ingest/telemetry with a site ingest key.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── Devices ───────────────────────────────────────────────────────────
function DevicesTab({ devices }: { devices: Device[] }) {
  const byType = useMemo(() => {
    const m = new Map<string, Device[]>();
    for (const d of devices) {
      const k = d.device_type || 'unknown';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return [...m.entries()];
  }, [devices]);

  if (devices.length === 0) return <div className="widget-card p-6 text-center text-[12px]" style={{ color: 'oklch(0.60 0.007 250)' }}>No devices registered at this site yet.</div>;
  return (
    <section className="space-y-3">
      {byType.map(([type, list]) => (
        <div key={type} className="widget-card">
          <header className="widget-card-header"><div className="widget-card-title">{type} ({list.length})</div></header>
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-left border-b" style={{ color: 'oklch(0.60 0.007 250)', borderColor: 'oklch(0.87 0.006 250)' }}>
                <th className="py-1.5">Serial</th>
                <th className="py-1.5">OEM</th>
                <th className="py-1.5">Model</th>
                <th className="py-1.5 text-right">Rated kW</th>
                <th className="py-1.5">Firmware</th>
                <th className="py-1.5">Status</th>
                <th className="py-1.5">Last seen</th>
              </tr></thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id} className="border-b" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
                    <td className="py-1.5 font-mono">{d.serial_number || d.id}</td>
                    <td className="py-1.5">{d.manufacturer || '—'}</td>
                    <td className="py-1.5">{d.model || '—'}</td>
                    <td className="py-1.5 text-right font-mono">{d.rated_kw ?? '—'}</td>
                    <td className="py-1.5 font-mono">{d.firmware_version || '—'}</td>
                    <td className="py-1.5"><span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: 'oklch(0.96 0.003 250)', color: 'oklch(0.17 0.010 250)' }}>{d.status}</span></td>
                    <td className="py-1.5 font-mono text-[10px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

// ─── Charts ────────────────────────────────────────────────────────────
function ChartsTab({ perf }: { perf: Perf | null }) {
  if (!perf || perf.series.length === 0) {
    return <div className="widget-card p-6 text-center text-[12px]" style={{ color: 'oklch(0.60 0.007 250)' }}>No telemetry yet — connect an OEM adapter or push data to /api/esums/telemetry to start populating charts.</div>;
  }
  const maxKwh = Math.max(1, ...perf.series.map((s) => s.kwh));
  const maxPr  = Math.max(1, ...perf.series.map((s) => s.pr));
  return (
    <section className="space-y-3">
      <div className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Daily kWh (last 30 days)</div></header>
        <div className="p-4">
          <div className="flex items-end gap-0.5 h-40">
            {perf.series.map((s) => {
              const h = (s.kwh / maxKwh) * 100;
              return (
                <div key={s.day} className="flex-1 group relative" title={`${s.day} · ${Math.round(s.kwh).toLocaleString()} kWh · R${Math.round(s.revenue_zar).toLocaleString()}`}>
                  <div className="rounded-t" style={{ height: `${Math.max(2, h)}%`, background: 'oklch(0.46 0.16 55)' }}/>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] flex justify-between font-mono" style={{ color: 'oklch(0.60 0.007 250)' }}>
            <span>{perf.series[0].day}</span><span>{perf.series.at(-1)?.day}</span>
          </div>
        </div>
      </div>
      <div className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Performance ratio (PR) trend</div></header>
        <div className="p-4">
          <svg viewBox={`0 0 ${perf.series.length * 10} 100`} className="w-full h-40" preserveAspectRatio="none">
            <polyline
              fill="none" stroke="oklch(0.45 0.15 150)" strokeWidth="1.5"
              points={perf.series.map((s, i) => `${i * 10},${100 - (s.pr / maxPr) * 100}`).join(' ')}
            />
            <polyline
              fill="none" stroke="oklch(0.48 0.20 20)" strokeWidth="0.8" strokeDasharray="2,2"
              points={`0,${100 - (80 / maxPr) * 100} ${(perf.series.length - 1) * 10},${100 - (80 / maxPr) * 100}`}
            />
          </svg>
          <div className="text-[10px] flex justify-between" style={{ color: 'oklch(0.60 0.007 250)' }}>
            <span>Green: actual PR (%)</span>
            <span>Red dashed: 80% target</span>
          </div>
        </div>
      </div>
      <div className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Capacity factor (CUF) trend</div></header>
        <div className="p-4">
          <svg viewBox={`0 0 ${perf.series.length * 10} 100`} className="w-full h-32" preserveAspectRatio="none">
            <polyline
              fill="none" stroke="oklch(0.46 0.16 55)" strokeWidth="1.5"
              points={perf.series.map((s, i) => {
                const max = Math.max(1, ...perf.series.map((x) => x.cf));
                return `${i * 10},${100 - (s.cf / max) * 100}`;
              }).join(' ')}
            />
          </svg>
        </div>
      </div>
    </section>
  );
}

// ─── Tools — per-site calculators ──────────────────────────────────────
function ToolsTab({ site, perf }: { site: Site; perf: Perf | null }) {
  const tariff = Number(site.ppa_tariff_zar_mwh || 1500);
  const capMw = Number(site.capacity_mw || 0);
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <SoilingCalculator capMw={capMw} tariff={tariff}/>
      <BatteryPaybackCalculator capMw={capMw} tariff={tariff}/>
      <ModuleReplacementCalculator capMw={capMw} tariff={tariff} perf={perf}/>
      <RecCertCalculator capMw={capMw} perf={perf}/>
    </section>
  );
}

// Each calculator widget — small, focused, deterministic. Numbers update as
// inputs change; "Apply" stays out of the way (these are model widgets, not
// mutation actions).

function SoilingCalculator({ capMw, tariff }: { capMw: number; tariff: number }) {
  const [soilingPct, setSoilingPct] = useState(4);     // observed PR drop, %
  const [cleanCost, setCleanCost] = useState(8000);    // R per cleaning event
  const [eventsYr, setEventsYr] = useState(2);          // wash cycles/year

  // Annual generation at 1500 kWh/kWp → MWh; revenue lost at soilingPct
  const annualMwh = capMw * 1500;
  const revenueLost = (soilingPct / 100) * annualMwh * tariff / 2; // half avg between washes
  const cleanCostYr = cleanCost * eventsYr;
  const net = revenueLost - cleanCostYr;
  return (
    <div className="widget-card p-4">
      <div className="inline-flex items-center gap-1 text-[13px] font-semibold mb-2" style={{ color: 'oklch(0.17 0.010 250)' }}>
        <Wrench size={13}/> Soiling cleaning — payback
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'oklch(0.60 0.007 250)' }}>Compare cleaning cost against avoided generation loss.</p>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <NumIn label="PR drop %" value={soilingPct} onChange={setSoilingPct} step={0.5}/>
        <NumIn label="R/clean" value={cleanCost} onChange={setCleanCost} step={500}/>
        <NumIn label="Events/yr" value={eventsYr} onChange={setEventsYr} step={1}/>
      </div>
      <ResultRow label="Annual revenue lost" value={`R${Math.round(revenueLost).toLocaleString('en-ZA')}`}/>
      <ResultRow label="Annual clean spend" value={`R${Math.round(cleanCostYr).toLocaleString('en-ZA')}`}/>
      <ResultRow label="Net benefit" value={`R${Math.round(net).toLocaleString('en-ZA')}`} tone={net > 0 ? 'good' : 'bad'}/>
    </div>
  );
}

function BatteryPaybackCalculator({ capMw, tariff }: { capMw: number; tariff: number }) {
  const [storeMwh, setStoreMwh] = useState(Math.max(1, Math.round(capMw * 2)));
  const [costPerKwh, setCostPerKwh] = useState(5500);   // R/kWh installed
  const [cyclesYr, setCyclesYr] = useState(250);
  const [roundtripPct, setRoundtripPct] = useState(85);

  const capexZar = storeMwh * 1000 * costPerKwh;
  const arbitrageMwhYr = storeMwh * cyclesYr * (roundtripPct / 100);
  const annualRevenue = arbitrageMwhYr * tariff;
  const paybackYr = annualRevenue > 0 ? capexZar / annualRevenue : Infinity;
  return (
    <div className="widget-card p-4">
      <div className="inline-flex items-center gap-1 text-[13px] font-semibold mb-2" style={{ color: 'oklch(0.17 0.010 250)' }}>
        <Calculator size={13}/> Battery sizing — payback
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'oklch(0.60 0.007 250)' }}>Simple energy-arbitrage payback at the PPA tariff.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <NumIn label="Storage MWh" value={storeMwh} onChange={setStoreMwh} step={1}/>
        <NumIn label="R/kWh capex" value={costPerKwh} onChange={setCostPerKwh} step={250}/>
        <NumIn label="Cycles/yr" value={cyclesYr} onChange={setCyclesYr} step={10}/>
        <NumIn label="η round-trip %" value={roundtripPct} onChange={setRoundtripPct} step={1}/>
      </div>
      <ResultRow label="Capex (ZAR)" value={`R${Math.round(capexZar).toLocaleString('en-ZA')}`}/>
      <ResultRow label="Annual revenue" value={`R${Math.round(annualRevenue).toLocaleString('en-ZA')}`}/>
      <ResultRow label="Simple payback" value={isFinite(paybackYr) ? `${paybackYr.toFixed(1)} years` : '—'} tone={paybackYr < 7 ? 'good' : 'bad'}/>
    </div>
  );
}

function ModuleReplacementCalculator({ capMw, tariff, perf }: { capMw: number; tariff: number; perf: Perf | null }) {
  const recentPr = perf?.series.slice(-7).reduce((s, x) => s + x.pr, 0) ?? 0;
  const avgPr = perf ? recentPr / Math.max(1, Math.min(7, perf.series.length)) : 80;
  const [currentPr, setCurrentPr] = useState(Math.round(avgPr));
  const [targetPr, setTargetPr] = useState(82);
  const [costPerKwp, setCostPerKwp] = useState(6500);
  const [moduleSharePct, setModuleSharePct] = useState(40); // % of capacity to replace

  const annualMwhGain = (Math.max(0, targetPr - currentPr) / 100) * capMw * 1500;
  const annualRevenue = annualMwhGain * tariff;
  const capexZar = (moduleSharePct / 100) * capMw * 1000 * costPerKwp;
  const paybackYr = annualRevenue > 0 ? capexZar / annualRevenue : Infinity;
  return (
    <div className="widget-card p-4">
      <div className="inline-flex items-center gap-1 text-[13px] font-semibold mb-2" style={{ color: 'oklch(0.17 0.010 250)' }}>
        <Layers size={13}/> Module replacement — payback
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'oklch(0.60 0.007 250)' }}>Replace under-performing modules. Current PR seeded from last-7-day average.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <NumIn label="Current PR %" value={currentPr} onChange={setCurrentPr} step={0.5}/>
        <NumIn label="Target PR %" value={targetPr} onChange={setTargetPr} step={0.5}/>
        <NumIn label="R/kWp" value={costPerKwp} onChange={setCostPerKwp} step={250}/>
        <NumIn label="% to swap" value={moduleSharePct} onChange={setModuleSharePct} step={5}/>
      </div>
      <ResultRow label="Annual MWh gain" value={`${annualMwhGain.toFixed(1)} MWh`}/>
      <ResultRow label="Annual revenue" value={`R${Math.round(annualRevenue).toLocaleString('en-ZA')}`}/>
      <ResultRow label="Capex (ZAR)" value={`R${Math.round(capexZar).toLocaleString('en-ZA')}`}/>
      <ResultRow label="Simple payback" value={isFinite(paybackYr) ? `${paybackYr.toFixed(1)} years` : '—'} tone={paybackYr < 5 ? 'good' : 'bad'}/>
    </div>
  );
}

function RecCertCalculator({ capMw, perf }: { capMw: number; perf: Perf | null }) {
  const [recPrice, setRecPrice] = useState(85); // R per MWh
  const totalMwh = perf?.series.reduce((s, x) => s + x.kwh, 0) ?? 0;
  const annualisedMwh = capMw * 1500;
  const observed = totalMwh / 1000;
  const projAnnual = observed > 0 ? (observed / Math.max(1, perf?.series.length || 30)) * 365 : annualisedMwh;
  const annualRecRevenue = projAnnual * recPrice;
  return (
    <div className="widget-card p-4">
      <div className="inline-flex items-center gap-1 text-[13px] font-semibold mb-2" style={{ color: 'oklch(0.17 0.010 250)' }}>
        <Activity size={13}/> REC certificates — annual value
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'oklch(0.60 0.007 250)' }}>Project the annual REC stream from observed generation × current price.</p>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <NumIn label="R / MWh REC" value={recPrice} onChange={setRecPrice} step={5}/>
      </div>
      <ResultRow label="Observed (30d) MWh" value={observed.toFixed(1)}/>
      <ResultRow label="Projected annual MWh" value={projAnnual.toFixed(0)}/>
      <ResultRow label="Projected REC value/yr" value={`R${Math.round(annualRecRevenue).toLocaleString('en-ZA')}`} tone="good"/>
    </div>
  );
}

// ─── Print packs ───────────────────────────────────────────────────────
function PrintTab({ site }: { site: Site }) {
  return (
    <section className="space-y-3">
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Lender pack</div>
        <p className="text-[12px] mt-1 mb-2" style={{ color: 'oklch(0.40 0.009 250)' }}>
          Quarterly report formatted for IFC / DBSA / commercial lenders — milestones, drawdowns, performance vs covenants.
        </p>
        <PrintPackButton kind="lender" ref={site.id} label="Build lender pack"/>
      </div>
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Regulator pack</div>
        <p className="text-[12px] mt-1 mb-2" style={{ color: 'oklch(0.40 0.009 250)' }}>
          NERSA / IR submission with KYC status, recent compliance audits, open findings, and the linked participant profile.
        </p>
        <PrintPackButton kind="regulator" ref={site.id} label="Build regulator pack"/>
      </div>
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Daily audit summary</div>
        <p className="text-[12px] mt-1 mb-2" style={{ color: 'oklch(0.40 0.009 250)' }}>
          Published Merkle roots over yesterday's audit_events — for regulator transparency or external attestors.
        </p>
        <PrintPackButton kind="audit" ref={new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)} label="Build audit pack (yesterday)"/>
      </div>
    </section>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────
function Kpi({ label, value, caption }: { label: string; value: React.ReactNode; caption?: string }) {
  return (
    <div className="widget-card p-3">
      <div className="text-[11px] uppercase tracking-wider" style={{ color: 'oklch(0.60 0.007 250)' }}>{label}</div>
      <div className="text-[20px] font-bold" style={{ color: 'oklch(0.17 0.010 250)' }}>{value}</div>
      {caption && <div className="text-[10px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{caption}</div>}
    </div>
  );
}
function KpiSm({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="widget-card p-3">
      <div className="text-[11px] uppercase tracking-wider" style={{ color: 'oklch(0.60 0.007 250)' }}>{label}</div>
      <div className="text-[16px] font-bold" style={{ color: 'oklch(0.17 0.010 250)' }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{sub}</div>}
    </div>
  );
}
function NumIn({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase" style={{ color: 'oklch(0.60 0.007 250)' }}>{label}</div>
      <input type="number" step={step} className="mt-1 w-full h-7 px-2 rounded border text-[12px] font-mono"
             style={{ borderColor: 'oklch(0.87 0.006 250)' }}
             value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}/>
    </label>
  );
}
function ResultRow({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'bad' }) {
  const valueColor = tone === 'good' ? 'oklch(0.45 0.15 150)' : tone === 'bad' ? 'oklch(0.48 0.20 20)' : 'oklch(0.17 0.010 250)';
  return (
    <div className="flex justify-between border-t py-1.5 text-[12px]" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
      <span style={{ color: 'oklch(0.60 0.007 250)' }}>{label}</span>
      <span className="font-mono font-semibold" style={{ color: valueColor }}>{value}</span>
    </div>
  );
}
