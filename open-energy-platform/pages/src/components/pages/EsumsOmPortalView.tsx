// ════════════════════════════════════════════════════════════════════════
// EsumsOmPortalView — /portal/:audience/:token
//
// Public, token-authenticated read-only view for stakeholders (lender,
// offtaker, insurer, contractor). NO Layout chrome, NO sidebar — just
// the data the recipient is entitled to see. Token is the auth.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Banknote, Shield, Wrench, Sun, Wind, Battery, Cpu, Zap } from 'lucide-react';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

const TECH_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  solar: Sun, wind: Wind, bess: Battery, hybrid: Cpu,
};

const AUDIENCE_META: Record<string, { title: string; subtitle: string; accent: string }> = {
  lender:     { title: 'Lender portal',     subtitle: 'Read-only portfolio view of financed assets — generation, DSCR, covenants.',  accent: '#1a3a5c' },
  offtaker:   { title: 'Offtaker portal',   subtitle: 'Live delivery vs commitment for your contracted energy.',                    accent: '#336a38' },
  insurer:    { title: 'Insurer portal',    subtitle: 'Operational risk and claim-trigger events on the insured assets.',           accent: '#6b3a82' },
  contractor: { title: 'Contractor portal', subtitle: 'Work orders, SLA performance and dispatch board for your assigned sites.',   accent: '#b04e0f' },
};

export function EsumsOmPortalView() {
  const { audience, token } = useParams<{ audience: string; token: string }>();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const meta = AUDIENCE_META[audience || ''] || AUDIENCE_META.lender;

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/esums-portal-view/${token}`);
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error || 'invalid token');
        setData(j.data);
      } catch (e: any) {
        setErr(e?.message || 'failed to load');
      }
    })();
  }, [token]);

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="widget-card p-8 max-w-md text-center">
          <Shield size={28} className="mx-auto text-[#c0392b]" />
          <div className="mt-3 text-[16px] font-semibold text-[#0f1c2e]">Cannot load portal</div>
          <div className="text-[12px] text-[#6b7685] mt-1">{err}</div>
          <div className="text-[11px] text-[#6b7685] mt-3">Contact your generator for a fresh invite link.</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-screen grid place-items-center text-[12px] text-[#6b7685]">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="text-white px-6 py-5 shadow-md" style={{ background: `linear-gradient(135deg, ${meta.accent}, #0b1c30)` }}>
        <div className="w-full max-w-[1760px] mx-auto flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/70">Esums O&amp;M · stakeholder portal</div>
            <h1 className="font-display text-[24px] font-bold mt-1">{meta.title}</h1>
            <p className="text-[12px] text-white/70 mt-1">{meta.subtitle}</p>
          </div>
          <div className="text-right text-[11px] text-white/70">
            <div>Generated</div>
            <div className="font-mono">{new Date(data.generated_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1760px] mx-auto p-4 lg:p-6 space-y-4">
        <SitesPanel sites={data.sites} />
        {audience === 'lender'     && <LenderBlocks data={data} />}
        {audience === 'offtaker'   && <OfftakerBlocks data={data} />}
        {audience === 'insurer'    && <InsurerBlocks data={data} />}
        {audience === 'contractor' && <ContractorBlocks data={data} />}
      </main>

      <footer className="w-full max-w-[1760px] mx-auto px-6 py-4 text-[11px] text-[#6b7685] text-center">
        <Sparkles size={11} className="inline" /> Powered by Consolidated Energy Cockpit · Esums Ops. Token expires per your invite.
      </footer>
    </div>
  );
}

function SitesPanel({ sites }: { sites: any[] }) {
  if (!sites?.length) return <section className="widget-card widget-empty">No sites in scope for this token.</section>;
  return (
    <section className="widget-card">
      <header className="widget-card-header">
        <div>
          <div className="widget-card-title">Sites in scope</div>
          <div className="widget-card-subtitle">{sites.length} site{sites.length === 1 ? '' : 's'} accessible via this token</div>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
        {sites.map((s: any) => {
          const Icon = TECH_ICON[s.technology] || Zap;
          return (
            <div key={s.id} className="rounded border border-[#e2e8f0] p-3">
              <div className="flex items-center gap-2">
                <Icon size={14} />
                <span className="text-[12px] font-semibold text-[#0f1c2e]">{s.name}</span>
              </div>
              <div className="text-[11px] text-[#6b7685] mt-1">
                {Number(s.capacity_mw || 0).toFixed(1)} MW · {s.technology} · {s.province || '—'}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LenderBlocks({ data }: { data: any }) {
  const perfBySite = new Map((data.performance || []).map((p: any) => [p.site_id, p]));
  const faultsBySite = new Map((data.open_faults || []).map((f: any) => [f.site_id, f]));
  return (
    <section className="widget-card">
      <header className="widget-card-header">
        <div className="widget-card-title">Generation & risk (MTD)</div>
        <div className="widget-card-subtitle">Real-time view feeding monthly performance reports & covenant compliance.</div>
      </header>
      <div className="overflow-x-auto p-3">
        <table className="w-full text-[12px]">
          <thead>
            <tr><th className="text-left">Site</th><th className="text-right">MTD MWh</th><th className="text-right">Open faults</th><th className="text-right">Bleed R/h</th></tr>
          </thead>
          <tbody>
            {data.sites.map((s: any) => {
              const p: any = perfBySite.get(s.id);
              const f: any = faultsBySite.get(s.id);
              const mwh = p ? Number(p.mtd_kwh || 0) / 1000 : 0;
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="text-right font-mono">{mwh.toFixed(2)}</td>
                  <td className="text-right font-mono">{f?.cnt || 0}</td>
                  <td className="text-right font-mono widget-tone-bad-text">{f?.bleed ? formatZAR(Number(f.bleed)) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OfftakerBlocks({ data }: { data: any }) {
  const dBySite = new Map((data.delivery || []).map((d: any) => [d.site_id, d]));
  return (
    <section className="widget-card">
      <header className="widget-card-header">
        <div className="widget-card-title">Delivery vs commitment (MTD)</div>
        <div className="widget-card-subtitle">Your contracted volume so far this month.</div>
      </header>
      <div className="overflow-x-auto p-3">
        <table className="w-full text-[12px]">
          <thead><tr><th className="text-left">Site</th><th className="text-right">MTD MWh delivered</th></tr></thead>
          <tbody>
            {data.sites.map((s: any) => {
              const d: any = dBySite.get(s.id);
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="text-right font-mono">{d?.mtd_mwh ? Number(d.mtd_mwh).toFixed(2) : '0.00'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InsurerBlocks({ data }: { data: any }) {
  return (
    <>
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">Recent claim-trigger events</div>
          <div className="widget-card-subtitle">Critical/major faults in the last 90 days.</div>
        </header>
        <div className="overflow-x-auto p-3">
          <table className="w-full text-[12px]">
            <thead><tr><th className="text-left">When</th><th className="text-left">Site</th><th className="text-left">Severity</th><th className="text-left">Description</th></tr></thead>
            <tbody>
              {(data.claimable_events || []).map((e: any) => (
                <tr key={e.id}>
                  <td className="font-mono text-[11px]">{new Date(e.detected_at).toLocaleString()}</td>
                  <td>{e.site_id}</td>
                  <td><span className={`px-1.5 rounded text-[10px] font-bold uppercase ${e.severity === 'critical' ? 'widget-tone-bad' : 'widget-tone-amber'}`}>{e.severity}</span></td>
                  <td>{e.description}</td>
                </tr>
              ))}
              {!(data.claimable_events || []).length && <tr><td colSpan={4} className="text-[#6b7685] italic">No qualifying events in scope.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">Maintenance compliance</div>
          <div className="widget-card-subtitle">Preventive maintenance status — policy requires {'>'}95%.</div>
        </header>
        <div className="overflow-x-auto p-3">
          <table className="w-full text-[12px]">
            <thead><tr><th className="text-left">Site</th><th className="text-right">Overdue</th><th className="text-right">Total scheduled</th></tr></thead>
            <tbody>
              {(data.maintenance_compliance || []).map((m: any) => (
                <tr key={m.site_id}>
                  <td>{m.site_id}</td>
                  <td className={`text-right font-mono ${m.overdue > 0 ? 'widget-tone-bad-text' : ''}`}>{m.overdue || 0}</td>
                  <td className="text-right font-mono">{m.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ContractorBlocks({ data }: { data: any }) {
  const stats = data.sla_stats || {};
  return (
    <>
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">SLA scorecard (last 90 days)</div>
        </header>
        <div className="grid grid-cols-3 gap-3 p-3">
          <KpiTile label="WOs completed" value={String(stats.total || 0)} tone="info" />
          <KpiTile label="SLA breached"  value={String(stats.breached || 0)} tone={Number(stats.breached || 0) > 0 ? 'bad' : 'good'} />
          <KpiTile label="First-time fix" value={`${Math.round(((stats.first_time_fix || 0) / Math.max(1, stats.total || 0)) * 100)}%`}
                   tone={(stats.first_time_fix || 0) / Math.max(1, stats.total || 1) >= 0.8 ? 'good' : 'warn'} />
        </div>
      </section>
      <section className="widget-card">
        <header className="widget-card-header">
          <div className="widget-card-title">Active work orders</div>
        </header>
        <div className="overflow-x-auto p-3">
          <table className="w-full text-[12px]">
            <thead>
              <tr><th className="text-left">WO #</th><th className="text-left">Site</th><th className="text-left">Title</th><th className="text-left">Priority</th><th className="text-left">Status</th><th className="text-left">SLA</th></tr>
            </thead>
            <tbody>
              {(data.work_orders || []).slice(0, 20).map((w: any) => (
                <tr key={w.id}>
                  <td className="font-mono text-[11px]">{w.wo_number}</td>
                  <td>{w.site_name}</td>
                  <td>{w.title}</td>
                  <td><Wrench size={11} className="inline" /> {w.priority}</td>
                  <td>{w.status}</td>
                  <td className="font-mono text-[11px]">{new Date(w.sla_deadline).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'info' }) {
  const map = { good: 'widget-tone-good', warn: 'widget-tone-amber', bad: 'widget-tone-bad', info: 'widget-tone-info' };
  return (
    <div className={`rounded p-3 ${map[tone]}`}>
      <div className="widget-kpi-label">{label}</div>
      <div className="widget-kpi-value-lg mt-1 inline-flex items-center gap-1">
        <Banknote size={14} /> {value}
      </div>
    </div>
  );
}

export default EsumsOmPortalView;
