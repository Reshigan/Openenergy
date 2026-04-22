import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Calendar, Cog, Factory, Gauge,
  Loader2, Sparkles, Wrench, CircuitBoard, Sun, Wind, Zap,
  CheckCircle2, Clock, Flame, Rocket, Send,
} from 'lucide-react';
import { api } from '../../lib/api';
import { NarrativeText } from '../NarrativeText';

type Tab = 'fleet' | 'telemetry' | 'forecast' | 'faults' | 'maintenance' | 'analytics' | 'insights' | 'simulate';

type Site = {
  id: string;
  site_name: string;
  ona_site_id: string | null;
  project_id: string | null;
  project_name: string | null;
  technology: string | null;
  capacity_mw: number | null;
  status: string;
  open_faults: number;
  availability_30d: number;
  generation_ytd_mwh: number;
};

type Fault = {
  id: string;
  site_name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fault_code: string | null;
  fault_description: string | null;
  status: string;
  start_time: string;
  generation_lost_mwh: number | null;
  estimated_revenue_impact: number | null;
};

type Maint = {
  id: string;
  site_name: string;
  maintenance_type: string;
  status: string;
  start_time: string;
  end_time: string | null;
  description: string | null;
};

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'fleet', label: 'Fleet', icon: Factory },
  { id: 'telemetry', label: 'Telemetry', icon: Gauge },
  { id: 'forecast', label: 'Forecast', icon: Activity },
  { id: 'faults', label: 'Faults', icon: AlertTriangle },
  { id: 'maintenance', label: 'Maintenance', icon: Calendar },
  { id: 'analytics', label: 'Analytics', icon: CircuitBoard },
  { id: 'insights', label: 'AI Insights', icon: Sparkles },
  { id: 'simulate', label: 'Simulate & LOI', icon: Rocket },
];

function technologyIcon(tech: string | null) {
  if (!tech) return Cog;
  const t = tech.toLowerCase();
  if (t.includes('solar') || t.includes('pv')) return Sun;
  if (t.includes('wind')) return Wind;
  return Zap;
}

function severityPill(sev: string) {
  const styles: Record<string, string> = {
    critical: 'bg-[#bb0000] text-white',
    high: 'bg-[#e9730c] text-white',
    medium: 'bg-[#fff4d6] text-[#8b6d00]',
    low: 'bg-[#f0f0f0] text-[#6a6d70]',
  };
  return `px-2 py-[2px] text-[10px] uppercase font-semibold rounded ${styles[sev] || styles.low}`;
}

function statusPill(status: string) {
  const styles: Record<string, string> = {
    active: 'bg-[#e3f5ed] text-[#107e3e]',
    inactive: 'bg-[#f0f0f0] text-[#6a6d70]',
    maintenance: 'bg-[#fff4d6] text-[#8b6d00]',
    scheduled: 'bg-[#e8f2ff] text-[#0a6ed1]',
    in_progress: 'bg-[#fff4d6] text-[#8b6d00]',
    completed: 'bg-[#e3f5ed] text-[#107e3e]',
    cancelled: 'bg-[#f0f0f0] text-[#6a6d70]',
    open: 'bg-[#ffebee] text-[#bb0000]',
    investigating: 'bg-[#fff4d6] text-[#8b6d00]',
    resolved: 'bg-[#e3f5ed] text-[#107e3e]',
  };
  return `px-2 py-[2px] text-[10px] uppercase font-semibold rounded ${styles[status] || 'bg-[#f0f0f0] text-[#6a6d70]'}`;
}

function zar(v: number | null | undefined) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}
function num(v: number | null | undefined, digits = 0) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
}

// ---------------------------------------------------

function HeaderStrip() {
  const [summary, setSummary] = useState<{ site_count: number; portfolio_mw: number; open_faults: number; critical_faults: number; scheduled_maintenance: number; generation_ytd_mwh: number } | null>(null);
  useEffect(() => {
    api.get('/ona/summary').then((r) => setSummary(r.data?.data)).catch(() => setSummary(null));
  }, []);
  const tiles = [
    { label: 'Sites monitored', value: num(summary?.site_count), icon: Factory, tone: 'blue' },
    { label: 'Portfolio MW', value: num(summary?.portfolio_mw, 1), icon: Zap, tone: 'indigo' },
    { label: 'Open faults', value: num(summary?.open_faults), icon: AlertTriangle, tone: (summary?.open_faults || 0) > 0 ? 'red' : 'green' },
    { label: 'Critical faults', value: num(summary?.critical_faults), icon: Flame, tone: (summary?.critical_faults || 0) > 0 ? 'red' : 'green' },
    { label: 'Maintenance scheduled', value: num(summary?.scheduled_maintenance), icon: Wrench, tone: 'amber' },
    { label: 'Generation YTD (MWh)', value: num(summary?.generation_ytd_mwh), icon: Activity, tone: 'teal' },
  ];
  const toneStyle: Record<string, string> = {
    blue: 'from-[#0a6ed1] to-[#5d36ff]',
    indigo: 'from-[#5d36ff] to-[#9b59b6]',
    red: 'from-[#bb0000] to-[#e9730c]',
    green: 'from-[#107e3e] to-[#2bb673]',
    amber: 'from-[#e9730c] to-[#f0ad4e]',
    teal: 'from-[#0e8574] to-[#3dc0a7]',
  };
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden relative">
          <div className={`h-1 bg-gradient-to-r ${toneStyle[t.tone]}`} />
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-[#6a6d70]">{t.label}</div>
              <t.icon size={14} />
            </div>
            <div className="mt-1 text-[22px] font-semibold text-[#32363a]">{t.value}</div>
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------

function FleetTab({ onSiteSelect }: { onSiteSelect: (id: string) => void }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/ona/sites').then((r) => setSites(r.data?.data || [])).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="text-[13px] text-[#6a6d70] flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Loading sites…</div>;
  if (sites.length === 0) return <div className="rounded-lg border border-dashed border-[#d0d5dd] bg-white p-8 text-center text-[13px] text-[#6a6d70]">No Ona sites linked yet. Create a project and link it to an Ona tenant to start streaming telemetry.</div>;
  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-[#fafbfd]">
            <tr className="text-[11px] uppercase text-[#6a6d70]">
              <th className="px-4 py-3 text-left">Site</th>
              <th className="px-4 py-3 text-left">Tech</th>
              <th className="px-4 py-3 text-right">Capacity MW</th>
              <th className="px-4 py-3 text-right">Availability 30d</th>
              <th className="px-4 py-3 text-right">Generation YTD</th>
              <th className="px-4 py-3 text-right">Open faults</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const Icon = technologyIcon(s.technology);
              return (
                <tr key={s.id} className="border-t border-[#f0f0f0] hover:bg-[#fafbfd]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Icon size={14} />
                      <div>
                        <div className="font-medium text-[#32363a]">{s.site_name}</div>
                        {s.project_name && <div className="text-[11px] text-[#6a6d70]">{s.project_name}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#6a6d70]">{s.technology || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">{num(s.capacity_mw, 1)}</td>
                  <td className="px-4 py-3 text-right font-mono">{num(s.availability_30d, 1)}%</td>
                  <td className="px-4 py-3 text-right font-mono">{num(s.generation_ytd_mwh)}</td>
                  <td className="px-4 py-3 text-right">
                    {s.open_faults > 0 ? <span className="font-semibold text-[#bb0000]">{s.open_faults}</span> : <span className="text-[#107e3e]">0</span>}
                  </td>
                  <td className="px-4 py-3"><span className={statusPill(s.status)}>{s.status}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onSiteSelect(s.id)} className="text-[12px] text-[#0a6ed1] hover:underline">Inspect</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------

function TelemetryTab({ siteId }: { siteId: string | null }) {
  const [rows, setRows] = useState<Array<{ nomination_date: string; nominated_mwh: number; forecast_mwh: number; actual_mwh: number; variance_mwh: number; status: string }>>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    api.get(`/ona/telemetry/${siteId}`).then((r) => setRows(r.data?.data || [])).finally(() => setLoading(false));
  }, [siteId]);
  if (!siteId) return <div className="rounded-lg border border-dashed border-[#d0d5dd] bg-white p-8 text-center text-[13px] text-[#6a6d70]">Pick a site from the Fleet tab to see live telemetry.</div>;
  if (loading) return <Loader2 size={14} className="animate-spin" />;
  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
      <div className="overflow-auto max-h-[520px]">
        <table className="w-full text-[12px]">
          <thead className="bg-[#fafbfd] sticky top-0">
            <tr className="text-[11px] uppercase text-[#6a6d70]">
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-right">Nominated (MWh)</th>
              <th className="px-3 py-2 text-right">Forecast (MWh)</th>
              <th className="px-3 py-2 text-right">Actual (MWh)</th>
              <th className="px-3 py-2 text-right">Variance</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[#f0f0f0]">
                <td className="px-3 py-2 font-mono">{r.nomination_date}</td>
                <td className="px-3 py-2 text-right font-mono">{num(r.nominated_mwh, 1)}</td>
                <td className="px-3 py-2 text-right font-mono">{num(r.forecast_mwh, 1)}</td>
                <td className="px-3 py-2 text-right font-mono">{num(r.actual_mwh, 1)}</td>
                <td className={`px-3 py-2 text-right font-mono ${Number(r.variance_mwh || 0) < 0 ? 'text-[#bb0000]' : 'text-[#107e3e]'}`}>{num(r.variance_mwh, 1)}</td>
                <td className="px-3 py-2"><span className={statusPill(r.status)}>{r.status}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-[#6a6d70]">No telemetry yet for this site.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------

function ForecastTab({ siteId }: { siteId: string | null }) {
  const [rows, setRows] = useState<Array<{ forecast_date: string; forecast_type: string; generation_mwh: number; availability_percentage: number; confidence_percentage: number }>>([]);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    setNarrative(null);
    api.get(`/ona/forecast/${siteId}`).then((r) => setRows(r.data?.data || [])).finally(() => setLoading(false));
  }, [siteId]);
  const generate = useCallback(async () => {
    if (!siteId) return;
    setBusy(true);
    try {
      const r = await api.post(`/ona/forecast/${siteId}/explain`, {});
      setNarrative(r.data?.data?.text || null);
      setFallback(!!r.data?.data?.fallback);
    } finally { setBusy(false); }
  }, [siteId]);
  if (!siteId) return <div className="rounded-lg border border-dashed border-[#d0d5dd] bg-white p-8 text-center text-[13px] text-[#6a6d70]">Select a site first.</div>;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] bg-gradient-to-r from-[#f5f6fa] to-[#eaf0ff]">
          <Sparkles size={16} className="text-[#5d36ff]" />
          <h3 className="text-[14px] font-semibold text-[#32363a]">7-day AI outlook</h3>
          {fallback && <span className="ml-2 text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px]">Deterministic fallback</span>}
          <button onClick={generate} disabled={busy} className="ml-auto h-8 px-3 rounded-lg bg-[#0a6ed1] text-white text-[12px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {busy && <Loader2 size={12} className="animate-spin" />} Generate
          </button>
        </header>
        <div className="p-5">
          {narrative
            ? <NarrativeText text={narrative} />
            : <div className="text-[13px] text-[#6a6d70]">Click Generate to run the AI forecast narrative for this site.</div>}
        </div>
      </div>
      <div className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-[12px]">
            <thead className="bg-[#fafbfd] sticky top-0">
              <tr className="text-[11px] uppercase text-[#6a6d70]">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Generation (MWh)</th>
                <th className="px-3 py-2 text-right">Availability %</th>
                <th className="px-3 py-2 text-right">Confidence %</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="p-4 text-center"><Loader2 size={14} className="animate-spin inline" /></td></tr>}
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[#f0f0f0]">
                  <td className="px-3 py-2 font-mono">{r.forecast_date}</td>
                  <td className="px-3 py-2">{r.forecast_type}</td>
                  <td className="px-3 py-2 text-right font-mono">{num(r.generation_mwh, 1)}</td>
                  <td className="px-3 py-2 text-right font-mono">{num(r.availability_percentage, 1)}</td>
                  <td className="px-3 py-2 text-right font-mono">{num(r.confidence_percentage, 1)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-[#6a6d70]">No forecasts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------

function FaultsTab() {
  const [status, setStatus] = useState<'open' | 'investigating' | 'resolved'>('open');
  const [faults, setFaults] = useState<Fault[]>([]);
  const [loading, setLoading] = useState(true);
  const [triaging, setTriaging] = useState<string | null>(null);
  const [triage, setTriage] = useState<Record<string, { text: string; fallback: boolean }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/ona/faults?status=${status}`);
      setFaults(r.data?.data || []);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const runTriage = async (id: string) => {
    setTriaging(id);
    try {
      const r = await api.post(`/ona/faults/${id}/triage`, {});
      setTriage((t) => ({ ...t, [id]: { text: r.data?.data?.text || '', fallback: !!r.data?.data?.fallback } }));
    } finally { setTriaging(null); }
  };

  const resolve = async (id: string) => {
    await api.post(`/ona/faults/${id}/resolve`, { note: triage[id]?.text?.slice(0, 500) || 'Resolved from O&M console' });
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-1 bg-white border border-[#e5e5e5] rounded-lg p-1">
        {(['open', 'investigating', 'resolved'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`h-8 px-3 rounded-md text-[12px] font-semibold capitalize ${status === s ? 'bg-[#0a6ed1] text-white' : 'text-[#6a6d70] hover:bg-[#f5f6fa]'}`}>{s}</button>
        ))}
      </div>
      {loading && <div className="text-[13px] text-[#6a6d70] flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Loading faults…</div>}
      {!loading && faults.length === 0 && <div className="rounded-lg border border-dashed border-[#d0d5dd] bg-white p-8 text-center text-[13px] text-[#6a6d70]">No {status} faults.</div>}
      <div className="space-y-3">
        {faults.map((f) => (
          <div key={f.id} className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
            <div className="p-4 flex items-start gap-4">
              <AlertTriangle size={18} className={f.severity === 'critical' || f.severity === 'high' ? 'text-[#bb0000]' : 'text-[#e9730c]'} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold text-[#32363a]">{f.fault_code || 'Unspecified fault'}</div>
                  <span className={severityPill(f.severity)}>{f.severity}</span>
                  <span className={statusPill(f.status)}>{f.status}</span>
                  <span className="text-[11px] text-[#6a6d70] ml-auto">{f.site_name}</span>
                </div>
                <p className="mt-1 text-[13px] text-[#6a6d70]">{f.fault_description || 'No description provided.'}</p>
                <div className="mt-2 text-[12px] text-[#6a6d70] flex flex-wrap gap-4">
                  <span><Clock size={12} className="inline mr-1" />{new Date(f.start_time).toLocaleString()}</span>
                  {f.generation_lost_mwh !== null && <span>{num(f.generation_lost_mwh, 1)} MWh lost</span>}
                  {f.estimated_revenue_impact !== null && <span>{zar(f.estimated_revenue_impact)} impact</span>}
                </div>
                {triage[f.id] && (
                  <div className="mt-3 border border-[#eaf0ff] bg-[#fafbff] rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={12} className="text-[#5d36ff]" />
                      <div className="text-[11px] uppercase tracking-wider text-[#5d36ff]">AI triage</div>
                      {triage[f.id].fallback && <span className="text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px]">Fallback</span>}
                    </div>
                    <NarrativeText text={triage[f.id].text} />
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => runTriage(f.id)} disabled={triaging === f.id} className="h-8 px-3 rounded-lg bg-[#5d36ff] text-white text-[12px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                    {triaging === f.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} AI triage
                  </button>
                  {f.status !== 'resolved' && (
                    <button onClick={() => resolve(f.id)} className="h-8 px-3 rounded-lg border border-[#d0d5dd] text-[12px] text-[#6a6d70] inline-flex items-center gap-2">
                      <CheckCircle2 size={12} /> Mark resolved
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------

function MaintenanceTab() {
  const [rows, setRows] = useState<Maint[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/ona/maintenance').then((r) => setRows(r.data?.data || [])).finally(() => setLoading(false)); }, []);
  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
      <div className="overflow-auto max-h-[600px]">
        <table className="w-full text-[13px]">
          <thead className="bg-[#fafbfd] sticky top-0">
            <tr className="text-[11px] uppercase text-[#6a6d70]">
              <th className="px-4 py-3 text-left">Site</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Start</th>
              <th className="px-4 py-3 text-left">End</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Description</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center"><Loader2 size={14} className="animate-spin inline" /></td></tr>}
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-[#f0f0f0]">
                <td className="px-4 py-3 font-medium text-[#32363a]">{m.site_name}</td>
                <td className="px-4 py-3 capitalize">{m.maintenance_type}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{m.start_time ? new Date(m.start_time).toLocaleString() : '—'}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{m.end_time ? new Date(m.end_time).toLocaleString() : '—'}</td>
                <td className="px-4 py-3"><span className={statusPill(m.status)}>{m.status.replace('_', ' ')}</span></td>
                <td className="px-4 py-3 text-[#6a6d70]">{m.description || '—'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[#6a6d70]">No maintenance records.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------

function AnalyticsTab({ siteId }: { siteId: string | null }) {
  const [data, setData] = useState<{ nominations: Array<{ nomination_date: string; forecast_mwh: number; actual_mwh: number; variance_mwh: number }>; faults_by_severity: Array<{ severity: string; c: number; lost_mwh: number; rev_lost: number }>; maintenance_by_type: Array<{ maintenance_type: string; c: number; hrs: number; mwh: number }> } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    api.get(`/ona/analytics/${siteId}?days=30`).then((r) => setData(r.data?.data)).finally(() => setLoading(false));
  }, [siteId]);
  if (!siteId) return <div className="rounded-lg border border-dashed border-[#d0d5dd] bg-white p-8 text-center text-[13px] text-[#6a6d70]">Pick a site first.</div>;
  if (loading || !data) return <div className="text-[13px] text-[#6a6d70] flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Loading analytics…</div>;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <h3 className="text-[14px] font-semibold text-[#32363a] mb-3">Variance (30 days)</h3>
        <div className="grid grid-cols-10 gap-1 h-24 items-end">
          {data.nominations.slice(-30).map((n, i) => {
            const v = Number(n.variance_mwh || 0);
            const max = Math.max(1, ...data.nominations.map((x) => Math.abs(Number(x.variance_mwh || 0))));
            const h = (Math.abs(v) / max) * 100;
            return (
              <div key={i} className="flex flex-col items-center justify-end">
                <div className={`w-full rounded-t ${v < 0 ? 'bg-[#bb0000]' : 'bg-[#107e3e]'}`} style={{ height: `${Math.max(2, h)}%` }} title={`${n.nomination_date}: ${v.toFixed(1)} MWh`} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
          <h3 className="text-[14px] font-semibold text-[#32363a] mb-3">Fault impact by severity</h3>
          <table className="w-full text-[12px]">
            <thead><tr className="text-[11px] uppercase text-[#6a6d70]"><th className="py-1 text-left">Severity</th><th className="py-1 text-right">Count</th><th className="py-1 text-right">MWh lost</th><th className="py-1 text-right">Revenue</th></tr></thead>
            <tbody>
              {data.faults_by_severity.map((f) => (
                <tr key={f.severity} className="border-t border-[#f0f0f0]"><td className="py-1 capitalize">{f.severity}</td><td className="py-1 text-right font-mono">{num(f.c)}</td><td className="py-1 text-right font-mono">{num(f.lost_mwh, 1)}</td><td className="py-1 text-right font-mono">{zar(f.rev_lost)}</td></tr>
              ))}
              {data.faults_by_severity.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-[#6a6d70]">No faults in period.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
          <h3 className="text-[14px] font-semibold text-[#32363a] mb-3">Maintenance by type</h3>
          <table className="w-full text-[12px]">
            <thead><tr className="text-[11px] uppercase text-[#6a6d70]"><th className="py-1 text-left">Type</th><th className="py-1 text-right">Count</th><th className="py-1 text-right">Hours</th><th className="py-1 text-right">MWh impact</th></tr></thead>
            <tbody>
              {data.maintenance_by_type.map((m) => (
                <tr key={m.maintenance_type} className="border-t border-[#f0f0f0]"><td className="py-1 capitalize">{m.maintenance_type}</td><td className="py-1 text-right font-mono">{num(m.c)}</td><td className="py-1 text-right font-mono">{num(m.hrs, 1)}</td><td className="py-1 text-right font-mono">{num(m.mwh, 1)}</td></tr>
              ))}
              {data.maintenance_by_type.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-[#6a6d70]">No maintenance in period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------

function InsightsTab() {
  const [data, setData] = useState<{ kpis: unknown; narrative: { text: string; fallback: boolean } } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/ona/insights').then((r) => setData(r.data?.data)).finally(() => setLoading(false)); }, []);
  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] bg-gradient-to-r from-[#f5f6fa] to-[#eaf0ff]">
        <Sparkles size={16} className="text-[#5d36ff]" />
        <h3 className="text-[14px] font-semibold text-[#32363a]">O&amp;M control-room brief</h3>
        {data?.narrative?.fallback && <span className="ml-2 text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px]">Deterministic fallback</span>}
      </header>
      <div className="p-5">
        {loading && <div className="text-[13px] text-[#6a6d70] flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Generating control-room brief…</div>}
        {!loading && data?.narrative?.text && (
          <NarrativeText text={data.narrative.text} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------

function SimulateTab() {
  const [form, setForm] = useState({
    project_name: 'New renewable IPP',
    technology: 'solar_pv',
    capacity_mw: 50,
    capex_zar: 800000000,
    site_description: 'Northern Cape, high irradiance, 25 ha fenced plot',
    target_offtake_mwh_per_year: 110000,
    horizon_years: 20,
  });
  const [simulation, setSimulation] = useState<{ text: string; fallback: boolean } | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  const [projects, setProjects] = useState<Array<{ id: string; project_name: string; technology: string; capacity_mw: number; status: string }>>([]);
  const [offtakers, setOfftakers] = useState<Array<{ id: string; name: string; company_name?: string }>>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [projectId, setProjectId] = useState<string>('');
  const [mwh, setMwh] = useState(75000);
  const [price, setPrice] = useState(980);
  const [tenor, setTenor] = useState(15);
  const [outBusy, setOutBusy] = useState(false);
  const [drafts, setDrafts] = useState<Array<{ loi_id: string; offtaker_name: string; body_md: string; fallback: boolean }>>([]);

  useEffect(() => {
    api.get('/projects').then((r) => {
      const ps = (r.data?.data || []).filter((p: { developer_id?: string; status?: string }) => p);
      setProjects(ps);
      if (ps[0]) setProjectId(ps[0].id);
    }).catch(() => undefined);
    api.get('/participants?role=offtaker').then((r) => setOfftakers(r.data?.data || [])).catch(() => undefined);
  }, []);

  const runSimulation = async () => {
    setSimBusy(true);
    try {
      const r = await api.post('/ona/simulate', form);
      setSimulation({ text: r.data?.data?.text || '', fallback: !!r.data?.data?.fallback });
    } finally { setSimBusy(false); }
  };

  const runOutreach = async () => {
    if (!projectId) return;
    setOutBusy(true);
    try {
      const offtaker_ids = Object.keys(selected).filter((id) => selected[id]);
      const r = await api.post(`/ona/projects/${projectId}/outreach`, {
        offtaker_ids: offtaker_ids.length > 0 ? offtaker_ids : undefined,
        mwh_per_year: mwh,
        blended_price: price,
        horizon_years: tenor,
      });
      setDrafts(r.data?.data?.drafts || []);
    } finally { setOutBusy(false); }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] bg-gradient-to-r from-[#f5f6fa] to-[#eaf0ff]">
          <Rocket size={16} className="text-[#5d36ff]" />
          <h3 className="text-[14px] font-semibold text-[#32363a]">Simulate a project</h3>
          {simulation?.fallback && <span className="ml-2 text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px]">Deterministic fallback</span>}
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
          <label className="text-[12px] text-[#6a6d70]">Project name
            <input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]" />
          </label>
          <label className="text-[12px] text-[#6a6d70]">Technology
            <select value={form.technology} onChange={(e) => setForm({ ...form, technology: e.target.value })} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]">
              <option value="solar_pv">Solar PV</option>
              <option value="wind">Wind</option>
              <option value="hybrid_pv_battery">Hybrid PV + Battery</option>
              <option value="battery_storage">Battery storage</option>
              <option value="biomass">Biomass</option>
            </select>
          </label>
          <label className="text-[12px] text-[#6a6d70]">Capacity (MW)
            <input type="number" value={form.capacity_mw} onChange={(e) => setForm({ ...form, capacity_mw: Number(e.target.value) })} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]" />
          </label>
          <label className="text-[12px] text-[#6a6d70]">Capex (ZAR)
            <input type="number" value={form.capex_zar} onChange={(e) => setForm({ ...form, capex_zar: Number(e.target.value) })} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]" />
          </label>
          <label className="text-[12px] text-[#6a6d70] md:col-span-2">Site description
            <textarea value={form.site_description} onChange={(e) => setForm({ ...form, site_description: e.target.value })} className="mt-1 w-full p-2 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]" rows={2} />
          </label>
          <label className="text-[12px] text-[#6a6d70]">Target offtake (MWh/yr)
            <input type="number" value={form.target_offtake_mwh_per_year} onChange={(e) => setForm({ ...form, target_offtake_mwh_per_year: Number(e.target.value) })} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]" />
          </label>
          <label className="text-[12px] text-[#6a6d70]">Horizon (years)
            <input type="number" value={form.horizon_years} onChange={(e) => setForm({ ...form, horizon_years: Number(e.target.value) })} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]" />
          </label>
        </div>
        <div className="px-5 pb-5">
          <button onClick={runSimulation} disabled={simBusy} className="h-9 px-4 rounded-lg bg-[#5d36ff] text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {simBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Run AI simulation
          </button>
        </div>
        {simulation?.text && (
          <div className="border-t border-[#f0f0f0] bg-[#fafbff] p-5">
            <NarrativeText text={simulation.text} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] bg-gradient-to-r from-[#f5f6fa] to-[#fdf1ff]">
          <Send size={16} className="text-[#bb2d8a]" />
          <h3 className="text-[14px] font-semibold text-[#32363a]">Batch LOI outreach</h3>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5">
          <label className="text-[12px] text-[#6a6d70] md:col-span-2">Project
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name} — {num(p.capacity_mw, 1)} MW · {p.status}</option>)}
              {projects.length === 0 && <option value="">No projects found</option>}
            </select>
          </label>
          <label className="text-[12px] text-[#6a6d70]">MWh / year
            <input type="number" value={mwh} onChange={(e) => setMwh(Number(e.target.value))} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]" />
          </label>
          <label className="text-[12px] text-[#6a6d70]">Blended price (ZAR/MWh)
            <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]" />
          </label>
          <label className="text-[12px] text-[#6a6d70]">Tenor (years)
            <input type="number" value={tenor} onChange={(e) => setTenor(Number(e.target.value))} className="mt-1 w-full h-9 px-3 rounded-md border border-[#d0d5dd] text-[13px] text-[#32363a]" />
          </label>
        </div>
        <div className="px-5 pb-5">
          <div className="text-[12px] text-[#6a6d70] mb-1">Target offtakers (leave empty to broadcast to all)</div>
          <div className="flex flex-wrap gap-2">
            {offtakers.map((o) => (
              <button key={o.id} onClick={() => setSelected((s) => ({ ...s, [o.id]: !s[o.id] }))} className={`h-8 px-3 rounded-full border text-[12px] ${selected[o.id] ? 'bg-[#0a6ed1] text-white border-[#0a6ed1]' : 'bg-white text-[#32363a] border-[#d0d5dd]'}`}>
                {o.company_name || o.name}
              </button>
            ))}
            {offtakers.length === 0 && <span className="text-[12px] text-[#6a6d70]">No offtakers loaded.</span>}
          </div>
          <button onClick={runOutreach} disabled={outBusy || !projectId} className="mt-4 h-9 px-4 rounded-lg bg-[#bb2d8a] text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {outBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Generate &amp; send LOIs
          </button>
        </div>
        {drafts.length > 0 && (
          <div className="border-t border-[#f0f0f0] p-5 space-y-3">
            {drafts.map((d) => (
              <div key={d.loi_id} className="rounded-lg border border-[#e5e5e5] bg-white p-4">
                <div className="flex items-center gap-2">
                  <Send size={12} className="text-[#bb2d8a]" />
                  <div className="text-[13px] font-semibold text-[#32363a]">LOI to {d.offtaker_name}</div>
                  {d.fallback && <span className="ml-2 text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px]">Fallback</span>}
                </div>
                <div className="mt-2"><NarrativeText text={d.body_md} /></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------

export function OM() {
  const [tab, setTab] = useState<Tab>('fleet');
  const [siteId, setSiteId] = useState<string | null>(null);

  const body = useMemo(() => {
    switch (tab) {
      case 'fleet': return <FleetTab onSiteSelect={(id) => { setSiteId(id); setTab('telemetry'); }} />;
      case 'telemetry': return <TelemetryTab siteId={siteId} />;
      case 'forecast': return <ForecastTab siteId={siteId} />;
      case 'faults': return <FaultsTab />;
      case 'maintenance': return <MaintenanceTab />;
      case 'analytics': return <AnalyticsTab siteId={siteId} />;
      case 'insights': return <InsightsTab />;
      case 'simulate': return <SimulateTab />;
    }
  }, [tab, siteId]);

  return (
    <div className="min-h-screen bg-[#f5f6fa] p-6 lg:p-10 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6a6d70] bg-white border border-[#e5e5e5] rounded-full px-3 py-1">
          <Cog size={12} /> Operations &amp; Maintenance
        </div>
        <h1 className="mt-2 text-[24px] font-semibold text-[#32363a]">O&amp;M control centre</h1>
        <p className="text-[13px] text-[#6a6d70]">Every Ona capability — asset fleet, live telemetry, AI generation outlook, fault triage, maintenance calendar, performance analytics and control-room AI — in one cockpit.</p>
      </header>

      <HeaderStrip />

      <nav className="flex flex-wrap items-center gap-1 bg-white border border-[#e5e5e5] rounded-lg p-1 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`h-9 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-2 ${active ? 'bg-[#0a6ed1] text-white' : 'text-[#6a6d70] hover:bg-[#f5f6fa]'}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </nav>

      {body}
    </div>
  );
}

export default OM;
