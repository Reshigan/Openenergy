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

  // v2 reskin: var(--token, lightFallback) → dark under .v2, light on public pages.
  const toneColor: Record<string, string> = {
    good: 'var(--good, oklch(0.55 0.18 145))', warn: 'var(--warn, oklch(0.65 0.18 75))', bad: 'var(--bad, oklch(0.55 0.22 25))', neutral: 'var(--ink-2, oklch(0.50 0.008 250))',
  };

  return (
    <section
      className="border-b px-0 py-4"
      style={{ background: 'var(--s1, oklch(0.99 0.002 80))', borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && <div className="text-[10px] uppercase tracking-[0.12em] font-mono font-semibold" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>{eyebrow}</div>}
          <h2 className="font-display font-bold tracking-tight mt-0.5" style={{ fontSize: 20, color: 'var(--ink, oklch(0.15 0.025 250))' }}>{title}</h2>
          {subtitle && <p className="text-[12px] mt-0.5 max-w-2xl" style={{ color: 'var(--ink-2, oklch(0.45 0.015 250))' }}>{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {loaded && kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          {kpis.map((k) => (
            <KpiCell key={k.key} kpi={k} toneColor={toneColor} />
          ))}
        </div>
      )}
    </section>
  );
}

function KpiCell({ kpi, toneColor }: { kpi: Kpi; toneColor: Record<string, string> }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--s2, oklch(0.96 0.003 250))', border: '1px solid var(--border-subtle, oklch(0.90 0.004 250))' }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>{kpi.label}</div>
      <div className="mt-1 font-mono text-[18px] font-bold leading-tight" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink, oklch(0.15 0.025 250))' }}>
        {formatValue(kpi.value)}
        {kpi.unit && <span className="ml-1 text-[12px] font-semibold" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>{kpi.unit}</span>}
      </div>
      {(kpi.trend_value || kpi.footer) && (
        <div className="text-[10px] mt-0.5" style={{ color: kpi.tone ? toneColor[kpi.tone] : 'var(--ink-2, oklch(0.55 0.008 250))' }}>
          {kpi.trend_value || kpi.footer}
        </div>
      )}
    </div>
  );
}
