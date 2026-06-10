import React from 'react';
import { SuiteHero } from './SuiteHero';

/* ════════════════════════════════════════════════════════════════════════
 * StitchPage — shared Stitch-style page chrome
 *
 * Every full page in the platform should wrap its content in <StitchPage>
 * to get the consistent header (eyebrow chip + display title + subtitle +
 * optional tab nav + actions slot) and OE surface gradient. Replaces the
 * ad-hoc "<header><h1>…</h1><p>…</p></header>" pattern that drifted
 * across pages.
 *
 * Layout matches the Stitch Industrial-Fintech reference:
 *   - 24px gutter padding (32px on desktop)
 *   - oe-surface canvas
 *   - Eyebrow pill (icon + label) in outline-variant border
 *   - 28px Metropolis display heading on a Navy → Blue gradient when
 *     `gradientHeading` is set (used by hero pages like Cockpit)
 *   - 13px IBM Plex Sans subtitle
 *   - Tab strip is right-aligned on desktop, wraps on mobile
 * ═══════════════════════════════════════════════════════════════════════ */

export interface StitchTab<TId extends string = string> {
  id: TId;
  label: string;
  // Older callers pass an IconName string (resolved by OEIcon downstream).
  // Newer callers pass a React component directly. Accept both.
  icon?: React.ComponentType<{ size?: number }> | string;
  badge?: string;
}

export interface StitchPageProps<TId extends string = string> {
  /** Eyebrow icon (Lucide / Material Symbols / lucide-react) */
  eyebrowIcon?: React.ComponentType<{ size?: number }>;
  /** Eyebrow label — short uppercase chip text (e.g. "Carbon Markets") */
  eyebrowLabel?: string;
  /** Page title (renders as Metropolis 28px) */
  title: string;
  /** Optional one-line subtitle */
  subtitle?: string;
  /** Render heading with the OE Navy→Blue gradient text */
  gradientHeading?: boolean;
  /** Optional right-aligned action slot (e.g. New, Refresh) */
  actions?: React.ReactNode;
  /** Optional tab strip; consumer manages active state */
  tabs?: StitchTab<TId>[];
  activeTab?: TId;
  onTabChange?: (id: TId) => void;
  /** When set, pulls /launch/:heroRole/kpis and renders the Esums gradient
   *  hero panel with the role's top KPIs. */
  heroRole?: string;
  /** Override gradient endpoints (defaults to Esums steel-blue). */
  heroAccentFrom?: string;
  heroAccentTo?: string;
  /** Opt out of the gradient hero (use the legacy plain header instead).
   *  Default: false — every page shows the Esums-style summary hero so
   *  the look-and-feel is consistent across the platform. */
  noHero?: boolean;
  /** Page body content */
  children: React.ReactNode;
}

export function StitchPage<TId extends string = string>({
  eyebrowIcon: Icon,
  eyebrowLabel,
  title,
  subtitle,
  gradientHeading,
  actions,
  tabs,
  activeTab,
  onTabChange,
  heroRole,
  heroAccentFrom,
  heroAccentTo,
  noHero,
  children,
}: StitchPageProps<TId>) {
  const tabStrip = tabs && tabs.length > 0 ? (
    <nav className="flex flex-wrap items-center gap-1 bg-white border border-[#dde4ec] rounded-lg p-1">
      {tabs.map((t) => {
        const TIcon = t.icon;
        const active = t.id === activeTab;
        return (
          <button type="button"
            key={t.id}
            onClick={() => onTabChange?.(t.id)}
            className={`h-9 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-2 ${
              active ? 'bg-[#1a3a5c] text-white' : 'text-[#3d4756] hover:bg-[#eef2f7]'
            }`}
          >
            {TIcon ? <TIcon size={14} /> : null} {t.label}
            {t.badge && (
              <span className={`ml-1 px-1.5 py-[1px] text-[10px] rounded ${active ? 'bg-white/20' : 'bg-[#dbecfb] text-[#3b82c4]'}`}>{t.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  ) : null;

  return (
    <div className="space-y-0 min-h-screen" style={{ background: 'oklch(0.96 0.003 250)' }}>
      {noHero ? (
        <header className="border-b px-6 lg:px-10 py-4 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3"
          style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.88 0.006 250)' }}>
          <div>
            {eyebrowLabel && (
              <div className="text-[10px] uppercase tracking-[0.12em] font-mono font-semibold" style={{ color: 'oklch(0.55 0.008 250)' }}>
                {Icon ? <span className="inline mr-1"><Icon size={10} /></span> : null}{eyebrowLabel}
              </div>
            )}
            <h1
              className="mt-0.5 font-display font-bold tracking-tight"
              style={{ fontSize: 20, color: 'oklch(0.15 0.025 250)' }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-[12px] mt-0.5 max-w-3xl" style={{ color: 'oklch(0.45 0.015 250)' }}>{subtitle}</p>
            )}
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end gap-2">
            {tabStrip}
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>
      ) : (
        <div className="px-6 lg:px-10">
          <SuiteHero
            role={heroRole}
            eyebrow={eyebrowLabel || ''}
            title={title}
            subtitle={subtitle}
            accentFrom={heroAccentFrom}
            accentTo={heroAccentTo}
            actions={actions}
          />
          {tabStrip && <div className="flex justify-end pt-2">{tabStrip}</div>}
        </div>
      )}

      <div className="px-6 lg:px-10 py-5 space-y-5">
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Stitch-style Card / KPI / Field — exported once so every page renders the
 * same atoms instead of each redeclaring its own.
 * ─────────────────────────────────────────────────────────────────────── */

export function StitchCard({ title, subtitle, action, children, padding = true }: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  padding?: boolean;
}) {
  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white">
      {(title || subtitle || action) && (
        <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center justify-between">
          <div>
            {title && <div className="font-display font-semibold text-[14px] text-[#0f1c2e]">{title}</div>}
            {subtitle && <div className="text-[12px] text-[#6b7685] mt-0.5">{subtitle}</div>}
          </div>
          {action}
        </header>
      )}
      <div className={padding ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function StitchKpi({
  label, value, sub, icon: Icon, tone, hint,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ComponentType<{ size?: number }>;
  tone?: 'up' | 'down' | 'warn';
  hint?: string;
}) {
  const colour =
    tone === 'up' ? 'text-[#1a8a5b]' :
    tone === 'down' ? 'text-[#c0392b]' :
    tone === 'warn' ? 'text-[#c97a14]' :
    'text-[#0f1c2e]';
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4" title={hint}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
        {Icon ? <Icon size={14} /> : null}
      </div>
      <div className={`mt-1 text-[22px] font-semibold font-mono ${colour}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#6b7685] mt-1">{sub}</div>}
    </div>
  );
}

export function StitchField({ label, hint, children, required }: {
  label: string; hint?: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6b7685]">
        {label}{required && <span className="text-[#c0392b] ml-1">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <div className="text-[11px] text-[#6b7685] mt-1">{hint}</div>}
    </label>
  );
}

export function StitchEmpty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-[13px] text-[#6b7685]">{children}</div>;
}

export function StitchPill({ status, label, tone }: {
  status?: string;
  label?: string;
  tone?: 'good' | 'warn' | 'critical' | 'info' | 'neutral';
}) {
  // Auto-derive tone from common status strings if not provided.
  const text = label || status || '—';
  const auto = status ? statusToTone(status) : 'neutral';
  const t = tone || auto;
  const palette: Record<string, string> = {
    good: 'bg-[#cdf0dd] text-[#1a8a5b]',
    warn: 'bg-[#fce5c4] text-[#c97a14]',
    critical: 'bg-[#fde0db] text-[#c0392b]',
    info: 'bg-[#dbecfb] text-[#3b82c4]',
    neutral: 'bg-[#eef2f7] text-[#6b7685]',
  };
  return (
    <span className={`px-2 py-[2px] text-[10px] uppercase font-semibold rounded ${palette[t]}`}>{text}</span>
  );
}

function statusToTone(s: string): 'good' | 'warn' | 'critical' | 'info' | 'neutral' {
  const k = s.toLowerCase();
  if (['active','available','approved','signed','complete','completed','paid','pass','open'].includes(k)) return 'good';
  if (['pending','warn','warning','review','submitted','draft','scheduled','in_progress','investigating','evaluation'].includes(k)) return 'warn';
  if (['breach','breached','rejected','failed','error','expired','cancelled','withdrawn'].includes(k)) return 'critical';
  if (['shortlisted','awarded','issued','published','sent'].includes(k)) return 'info';
  return 'neutral';
}

export default StitchPage;
