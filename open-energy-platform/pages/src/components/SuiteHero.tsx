// SuiteHero — gradient KPI hero panel used at the top of every role suite
// page to match the Esums cockpit's signature look.
//
// Pulls the role's launch KPIs from /launch/:role/kpis (same endpoint as
// LaunchBoardShell) and renders them in the canonical gradient strip.

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Tone = 'good' | 'warn' | 'bad' | 'neutral';
type Kpi = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  tone?: Tone;
  trend_label?: string;
  trend_value?: string;
  trend_direction?: 'up' | 'down' | 'flat';
  footer?: string;
  href?: string;
};

type LaunchPayload = {
  role: string;
  hero: { eyebrow: string; title: string; subtitle: string };
  kpis: Kpi[];
};

export interface SuiteHeroProps {
  /** Which role's KPIs to fetch (e.g. 'trader', 'grid_operator'). When
   *  omitted, the hero renders without a KPI strip — title + subtitle
   *  only. Used by global pages (e.g. /lois, /contracts) that aren't tied
   *  to a single role. */
  role?: string;
  /** Eyebrow chip text; shown above the title in the gradient panel. */
  eyebrow: string;
  /** Big bold title. */
  title: string;
  /** Secondary line. */
  subtitle?: string;
  /** Gradient start / end. Defaults to the Esums steel-blue. */
  accentFrom?: string;
  accentTo?: string;
  /** Right-aligned slot (e.g. action buttons, tab strip). Rendered in the
   *  hero on translucent chrome so the gradient remains the focal point. */
  actions?: React.ReactNode;
}

function formatValue(v: number | string): string {
  if (typeof v === 'number') {
    if (Math.abs(v) >= 100000) return new Intl.NumberFormat('en-ZA').format(Math.round(v));
    return String(v);
  }
  return v;
}

export function SuiteHero({ role, eyebrow, title, subtitle, accentFrom, accentTo, actions }: SuiteHeroProps) {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!role) {
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    api
      .get(`/launch/${role}/kpis`)
      .then((res) => {
        if (cancelled) return;
        const data = (res.data?.data as LaunchPayload) || null;
        setKpis(Array.isArray(data?.kpis) ? data.kpis.slice(0, 4) : []);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const from = accentFrom || '#1e3a5f';
  const to = accentTo || '#0b1c30';

  return (
    <section
      className="rounded-xl text-white p-5 shadow-md"
      style={{ background: `linear-gradient(135deg, ${from} 0%, #1a3a5c 60%, ${to} 100%)` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/70">{eyebrow}</div>
          <h2 className="font-display text-[22px] font-bold tracking-tight mt-1">{title}</h2>
          {subtitle && <p className="text-[12px] text-white/70 mt-1 max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {loaded && kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {kpis.map((k) => (
            <KpiCell key={k.key} kpi={k} />
          ))}
        </div>
      )}
    </section>
  );
}

function KpiCell({ kpi }: { kpi: Kpi }) {
  return (
    <div className="rounded-lg bg-white/10 backdrop-blur p-3 border border-white/10">
      <div className="text-[10px] uppercase tracking-wider text-white/75">{kpi.label}</div>
      <div className="mt-1 font-mono text-[20px] font-bold leading-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatValue(kpi.value)}
        {kpi.unit && <span className="ml-1 text-[12px] font-semibold text-white/70">{kpi.unit}</span>}
      </div>
      {(kpi.trend_value || kpi.footer) && (
        <div className="text-[10px] text-white/60 mt-0.5">
          {kpi.trend_value || kpi.footer}
        </div>
      )}
    </div>
  );
}
