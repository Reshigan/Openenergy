// ════════════════════════════════════════════════════════════════════════
// EsumsOmOpportunities — performance-improvement opportunity engine UI.
//
// Renders the ranked output of GET /api/esums/opportunities. Every
// opportunity is rule-derived (deterministic SQL + math), so each card
// shows the cited evidence + a one-click CTA.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon, Banknote, Brain, ClipboardList, Cpu, Droplet, Flame,
  Gauge, PackageOpen, ShieldCheck, Sparkles, TrendingUp, Wrench,
} from 'lucide-react';
import { api } from '../../lib/api';

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

type Opportunity = {
  id: string;
  category: string;
  site_id?: string;
  site_name?: string;
  device_id?: string;
  title: string;
  detail: string;
  annual_upside_zar: number;
  effort: 'low' | 'medium' | 'high';
  confidence: number;
  evidence: string[];
  action?: { kind: string; payload?: Record<string, any> };
};

const CAT_META: Record<string, { icon: React.ComponentType<{ size?: number }>; tone: string; label: string }> = {
  soiling_clean:           { icon: Droplet,        tone: 'widget-tone-info',  label: 'Soiling clean' },
  recurring_fault:         { icon: AlertOctagon,   tone: 'widget-tone-bad',   label: 'Recurring fault' },
  underperforming_string:  { icon: Gauge,          tone: 'widget-tone-amber', label: 'Underperforming string' },
  firmware_pattern:        { icon: Cpu,            tone: 'widget-tone-amber', label: 'Firmware pattern' },
  inverter_pre_failure:    { icon: Brain,          tone: 'widget-tone-bad',   label: 'Pre-failure signal' },
  mttr_outlier:            { icon: ClipboardList,  tone: 'widget-tone-amber', label: 'MTTR outlier' },
  sla_breach_cluster:      { icon: Flame,          tone: 'widget-tone-bad',   label: 'SLA breach cluster' },
  parts_stockout:          { icon: PackageOpen,    tone: 'widget-tone-info',  label: 'Parts stockout' },
  warranty_leakage:        { icon: ShieldCheck,    tone: 'widget-tone-good',  label: 'Warranty leakage' },
  maintenance_backlog:     { icon: Wrench,         tone: 'widget-tone-amber', label: 'Maintenance backlog' },
  om_cost_outlier:         { icon: Banknote,       tone: 'widget-tone-info',  label: 'O&M cost outlier' },
};

const EFFORT_TONE: Record<string, string> = {
  low:    'widget-tone-good',
  medium: 'widget-tone-amber',
  high:   'widget-tone-bad',
};

export function EsumsOmOpportunities() {
  const [data, setData] = useState<{ generated_at: string; total_annual_upside_zar: number; count: number; by_category: Record<string, number>; opportunities: Opportunity[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try {
      const r = await api.get('/esums/opportunities');
      setData(r.data?.data || null);
    } catch (e: any) {
      setErr(e?.message || 'failed to load');
    }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return filter === 'all' ? data.opportunities : data.opportunities.filter((o) => o.category === filter);
  }, [data, filter]);

  const act = async (opp: Opportunity) => {
    if (!opp.action) return;
    setActing(opp.id);
    try {
      await api.post('/esums/opportunities/act', { category: opp.category, action: opp.action });
      await load();
    } finally { setActing(null); }
  };

  if (err) return <div className="widget-card widget-empty">Error: {err}</div>;
  if (!data) return <div className="widget-card widget-empty">Scanning fleet for opportunities…</div>;

  return (
    <div className="space-y-3">
      <header className="rounded-xl bg-gradient-to-r from-[#1e3a5f] via-[#1a3a5c] to-[#0b1c30] text-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/70 inline-flex items-center gap-1">
              <Sparkles size={11} /> Performance opportunities · deterministic rule scan
            </div>
            <h1 className="font-display text-[22px] font-bold tracking-tight mt-1">
              {data.count} opportunities · {formatZAR(data.total_annual_upside_zar)} annual upside
            </h1>
            <p className="text-[12px] text-white/70 mt-1">
              Every opportunity is computed from SQL + arithmetic over operational data — no LLM inference,
              no opaque models. Tap an evidence chip to see why a rule fired.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/70">
            <span>Last scan</span>
            <span className="font-mono">{new Date(data.generated_at).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })}</span>
            <button onClick={load} className="ml-2 px-2 h-7 rounded bg-white/10 hover:bg-white/15 text-white text-[11px] border border-white/15">
              Re-scan
            </button>
          </div>
        </div>
      </header>

      <section className="widget-card">
        <div className="px-4 py-2 flex flex-wrap gap-2 items-center border-b border-[#eef2f7]">
          <button
            onClick={() => setFilter('all')}
            className={`h-7 px-2.5 rounded-full text-[11px] font-semibold border ${filter === 'all' ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}
          >
            All <span className="opacity-70 ml-1">{data.count}</span>
          </button>
          {Object.entries(data.by_category)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, upside]) => {
              const meta = CAT_META[cat] || { icon: TrendingUp, tone: 'widget-tone-info', label: cat };
              const Icon = meta.icon;
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-semibold border inline-flex items-center gap-1 ${filter === cat ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}
                >
                  <Icon size={11} />
                  {meta.label}
                  <span className="opacity-70">{formatZAR(upside)}</span>
                </button>
              );
            })}
        </div>

        <ul className="divide-y divide-[#eef2f7]">
          {filtered.length === 0 ? (
            <li className="widget-empty">No opportunities in this category — fleet is humming.</li>
          ) : filtered.map((o) => {
            const meta = CAT_META[o.category] || { icon: TrendingUp, tone: 'widget-tone-info', label: o.category };
            const Icon = meta.icon;
            return (
              <li key={o.id} className="p-4 hover:bg-[#fafbfd]">
                <div className="flex items-start gap-3">
                  <span className={`inline-flex items-center justify-center w-9 h-9 rounded-md ${meta.tone}`}>
                    <Icon size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[13px] font-semibold text-[#0f1c2e]">{o.title}</div>
                        <div className="text-[12px] text-[#3d4756] mt-0.5">{o.detail}</div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="widget-kpi-label">Annual upside</div>
                        <div className="text-[15px] font-mono font-bold widget-tone-good-text" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatZAR(o.annual_upside_zar)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded ${meta.tone} font-semibold`}>
                        {meta.label}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded ${EFFORT_TONE[o.effort]} font-semibold`}>
                        {o.effort} effort
                      </span>
                      <span className="px-1.5 py-0.5 rounded widget-tone-info font-semibold">
                        {Math.round(o.confidence * 100)}% confidence
                      </span>
                      {o.site_name && (
                        <span className="px-1.5 py-0.5 rounded widget-tone-info">
                          {o.site_name}
                        </span>
                      )}
                    </div>
                    <details className="mt-2 text-[11px]">
                      <summary className="cursor-pointer text-[#3b82c4] hover:underline">
                        Evidence ({o.evidence.length})
                      </summary>
                      <ul className="mt-1 pl-4 list-disc text-[#3d4756] space-y-0.5">
                        {o.evidence.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </details>
                  </div>
                  {o.action && (
                    <button
                      onClick={() => act(o)}
                      disabled={acting === o.id}
                      className="self-start h-8 px-3 rounded-md bg-[#1a3a5c] hover:bg-[#0b1c30] text-white text-[11px] font-semibold disabled:opacity-50 whitespace-nowrap"
                    >
                      {acting === o.id ? 'Acting…' : actionLabel(o.action.kind)}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function actionLabel(kind: string): string {
  const map: Record<string, string> = {
    create_wo: 'Create WO',
    thermal_imaging: 'Schedule thermal scan',
    hold_firmware_update: 'Hold firmware',
    reorder_parts: 'Reorder parts',
    file_warranty_claim: 'File warranty claim',
    reschedule_maintenance: 'Reschedule',
    add_technician_shift: 'Plan shift',
    investigate: 'Open investigation',
  };
  return map[kind] || 'Act';
}

export default EsumsOmOpportunities;
