// ════════════════════════════════════════════════════════════════════════
// WidgetPrimitives — shared chrome for all decision-support widgets.
//
// Aligned with the Stitch "Consolidated Energy Cockpit" design system:
//   • Card surface = #ffffff with 1px outline var(--border-subtle, #e2e8f0) and 8px radius
//   • Card header  = Metropolis 14/600 title + IBM Plex 11/400 subtitle,
//     low-contrast bottom separator
//   • Control band = #f1f5f9 fill to demarcate slider inputs from data
//   • KPI tile     = label-caps (Metropolis) + JetBrains Mono numeric
//   • Tones        = good / warn / bad / info / amber (CSS classes)
//
// Plain JSX — no Tailwind plugin needed. The actual visual rules live in
// /pages/src/styles/widgets.css.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'amber';

export function WidgetCard({
  title, subtitle, right, children, footer, className = '',
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`widget-card ${className}`}>
      {(title || subtitle || right) && (
        <header className="widget-card-header">
          <div className="min-w-0">
            {title && <div className="widget-card-title">{title}</div>}
            {subtitle && <div className="widget-card-subtitle">{subtitle}</div>}
          </div>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      {children}
      {footer && <footer className="widget-card-footer">{footer}</footer>}
    </section>
  );
}

export function WidgetControlBand({ children, columns = 3 }: { children: React.ReactNode; columns?: number }) {
  return (
    <div className="widget-control-band" style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: 12,
    }}>
      {children}
    </div>
  );
}

export function WidgetKpi({
  label, value, tone = 'info', hint,
}: {
  label: string; value: React.ReactNode; tone?: Tone; hint?: string;
}) {
  return (
    <div className={`widget-tile widget-tone-${tone}`} title={hint}>
      <div className="widget-kpi-label">{label}</div>
      <div className="widget-kpi-value">{value}</div>
    </div>
  );
}

export function WidgetKpiLarge({
  label, value, tone = 'info', hint,
}: {
  label: string; value: React.ReactNode; tone?: Tone; hint?: string;
}) {
  return (
    <div className={`widget-tile widget-tone-${tone}`} title={hint}>
      <div className="widget-kpi-label">{label}</div>
      <div className="widget-kpi-value-lg">{value}</div>
    </div>
  );
}

export function WidgetSlider({
  label, value, min, max, step, onChange, format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="block text-[11px]">
      <div className="flex justify-between items-baseline">
        <span className="font-medium" style={{ color: 'var(--ink-2, #3d4756)' }}>{label}</span>
        <span className="font-mono font-semibold" style={{
          color: 'var(--ink, #0f1c2e)', fontVariantNumeric: 'tabular-nums', fontSize: 11,
        }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1"
      />
    </label>
  );
}

export function WidgetEmpty({ children }: { children: React.ReactNode }) {
  return <div className="widget-empty">{children}</div>;
}

export function WidgetSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-3 py-3 ${className}`}>{children}</div>;
}
