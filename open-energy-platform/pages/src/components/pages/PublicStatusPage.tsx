// ════════════════════════════════════════════════════════════════════════
// PublicStatusPage — /status (public, no auth)
//
// Live health view backed by /api/public/status. Designed to be linkable
// externally (e.g. status.oe.vantax.co.za alias) without exposing any
// tenant data — only platform-level health.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Activity, AlertOctagon, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

type Component = { name: string; status: string; metric?: string };
type StatusData = {
  overall_status: 'operational' | 'degraded' | 'major_outage';
  generated_at: string;
  live_db_latency_ms: number;
  components: Component[];
  metrics_24h: any[];
  metrics_recent: any[];
};

const STATUS_META: Record<string, { tone: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  operational:  { tone: 'widget-tone-good',  label: 'All systems operational', icon: CheckCircle },
  degraded:     { tone: 'widget-tone-amber', label: 'Some systems degraded',   icon: AlertCircle },
  major_outage: { tone: 'widget-tone-bad',   label: 'Major outage in progress', icon: AlertOctagon },
};

export function PublicStatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    try {
      const r = await fetch('/api/public/status');
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'fetch failed');
      setData(j.data);
      setErr(null);
    } catch (e: any) { setErr(e?.message || 'fetch failed'); }
  };
  useEffect(() => {
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (err && !data) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--oe-surface)' }}>
      <div className="widget-card widget-tone-bad p-6 max-w-md text-center">
        <AlertOctagon size={28} className="mx-auto" />
        <div className="mt-2 text-[16px] font-semibold">Status page unreachable</div>
        <div className="text-[12px] mt-1">{err}</div>
        <button type="button" onClick={load} className="mt-3 h-9 px-3 rounded bg-[#c2873a] text-white text-[12px] font-semibold">Retry</button>
      </div>
    </div>
  );
  if (!data) return <div className="min-h-screen grid place-items-center text-[12px] text-[#6b7685]">Loading…</div>;

  const meta = STATUS_META[data.overall_status] || STATUS_META.operational;
  const Icon = meta.icon;

  return (
    <div className="min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="p-6 lg:p-10 pb-4">
        <div className="max-w-4xl mx-auto flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685] bg-white border border-[#dde4ec] rounded-full px-3 py-1 mb-2">
              <Activity size={12} /> Platform · status
            </div>
            <h1 className="font-display text-[28px] font-bold tracking-tight leading-tight" style={{ color: 'var(--oe-on-surface)' }}>
              Platform status
            </h1>
            <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-semibold ${meta.tone}`}>
              <Icon size={14} /> {meta.label}
            </div>
            <p className="text-[12px] text-[#6b7685] mt-2">
              Updated {new Date(data.generated_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} · DB round-trip {data.live_db_latency_ms} ms
            </p>
          </div>
          <button type="button" onClick={load} className="h-9 px-3 rounded-md bg-white border border-[#dde4ec] hover:bg-[#eef2f7] text-[#0f1c2e] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 lg:p-10 pt-0 space-y-4">
        <section className="widget-card">
          <header className="widget-card-header"><div className="widget-card-title">Components</div></header>
          <ul className="divide-y divide-[#eef2f7]">
            {data.components.map((c) => {
              const m = STATUS_META[c.status] || STATUS_META.operational;
              const I = m.icon;
              return (
                <li key={c.name} className="px-4 py-3 flex items-center gap-3">
                  <I size={14} className={c.status === 'operational' ? 'text-[#1a8a5b]' : c.status === 'degraded' ? 'text-[#b04e0f]' : 'text-[#c0392b]'} />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#0f1c2e]">{c.name}</div>
                    {c.metric && <div className="text-[11px] text-[#6b7685]">{c.metric}</div>}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${m.tone}`}>{c.status.replace('_', ' ')}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="widget-card">
          <header className="widget-card-header">
            <div>
              <div className="widget-card-title">24-hour summary</div>
              <div className="widget-card-subtitle">Aggregated SLO metrics from the per-minute ingest cron.</div>
            </div>
          </header>
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr><th className="text-left">Metric</th><th className="text-right">Avg (24h)</th><th className="text-right">Max (24h)</th></tr></thead>
              <tbody>
                {data.metrics_24h.length === 0 ? (
                  <tr><td colSpan={3} className="text-[#6b7685] italic py-2">No metrics ingested yet — the per-minute cron fires every 15 min.</td></tr>
                ) : data.metrics_24h.map((m: any) => (
                  <tr key={m.metric}>
                    <td className="font-mono">{m.metric}</td>
                    <td className="text-right font-mono">{Number(m.avg_value).toFixed(2)}</td>
                    <td className="text-right font-mono">{Number(m.max_value).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <footer className="text-center text-[11px] text-[#6b7685] pt-2">
          Consolidated Energy Cockpit · oe.vantax.co.za · operated by GONXT Technology (Pty) Ltd
        </footer>
      </main>
    </div>
  );
}

export default PublicStatusPage;
