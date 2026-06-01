// ════════════════════════════════════════════════════════════════════════
// EntityFileShell — generic "entity file" cockpit
//
// Renders one screen that holds everything related to a single entity:
// project, contract, RFP, LOI, fund. The shape is intentionally identical
// across entities so the user gets the same gradient hero / KPI strip /
// tabbed-container experience whether they're looking at an IPP project
// file or a PPA contract file.
//
// The shell is data-driven:
//   - `endpoint`           — GET URL that returns { success, data: { ... } }
//   - `heroFor(data)`      — pick eyebrow / title / subtitle / kpis / actions
//   - `summaryFor(data)`   — drives tab-badge counts and (optional) header KPIs
//   - `tabs[]`             — id, label, optional badge key + render callback
//   - `suggestionsKey`     — defaults to `ai_suggestions`; surfaced above tabs
//
// Concrete callers (ProjectDetail, ContractDetail, etc.) compose this shell
// with a per-entity tab map.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { OEIcon } from '../OEIcon';
import { VaultPanel } from '../VaultPanel';
import { ThreadPanel } from '../ThreadPanel';

export type EntityFileSummary = Record<string, number | string | null | undefined>;

export interface EntityFileHero {
  eyebrowIcon?: React.ComponentType<{ size?: number }>;
  eyebrowLabel: string;
  title: string;
  subtitle?: string;
  kpis?: Array<{ key: string; label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>;
  actions?: React.ReactNode;
  accentFrom?: string;
  accentTo?: string;
}

export interface EntityFileTab<TData = unknown> {
  id: string;
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
  badgeFromSummary?: (summary: EntityFileSummary) => number | undefined;
  render: (data: TData) => React.ReactNode;
}

export interface EntityFileSuggestion {
  key: string;
  tab?: string;
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; href: string };
}

export interface EntityFileShellProps<TData> {
  /** GET endpoint that returns { success, data: TData }. */
  endpoint: string;
  /** Entity kind ('projects', 'contracts', etc.) used for vault/thread panels. */
  entityKind: string;
  /** Entity id used for vault/thread panels + tab change URL. */
  entityId: string;
  /** Render the gradient hero from the fetched data. */
  heroFor: (data: TData) => EntityFileHero;
  /** Pluck the summary object from data (counts that drive tab badges + KPIs). */
  summaryFor?: (data: TData) => EntityFileSummary | undefined;
  /** Pluck AI suggestions out of data (defaults to data.ai_suggestions). */
  suggestionsFor?: (data: TData) => EntityFileSuggestion[] | undefined;
  /** Tab map. The first tab is the default. */
  tabs: EntityFileTab<TData>[];
  /** Optional back-link (e.g. "/projects"). */
  backHref?: string;
  /** Optional back-link label (defaults to "Back"). */
  backLabel?: string;
  /** Whether to render the documents/discussion panel at the bottom of every tab. */
  showVaultAndThread?: boolean;
}

export function EntityFileShell<TData>({
  endpoint,
  entityKind,
  entityId,
  heroFor,
  summaryFor,
  suggestionsFor,
  tabs,
  backHref,
  backLabel = 'Back',
  showVaultAndThread = true,
}: EntityFileShellProps<TData>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(endpoint);
      setData((res.data?.data ?? null) as TData | null);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; message?: string };
      setError(
        err.response?.status === 404
          ? 'Record not found.'
          : err.message || 'Failed to load.',
      );
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeTabId = searchParams.get('tab') || tabs[0]?.id;
  const setActiveTab = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
  };
  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);

  if (loading) {
    return (
      <div className="p-6 lg:p-10 space-y-6 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
        <Skeleton variant="card" rows={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 lg:p-10 space-y-6 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
        <ErrorBanner message={error || 'No data.'} onRetry={refresh} />
        {backHref && (
          <Link to={backHref} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#3b82c4] hover:underline">
            <OEIcon name="chevron-left" size={14} /> {backLabel}
          </Link>
        )}
      </div>
    );
  }

  const hero = heroFor(data);
  const summary = summaryFor?.(data) || {};
  const suggestions = suggestionsFor?.(data) || ((data as { ai_suggestions?: EntityFileSuggestion[] }).ai_suggestions ?? []);
  const accentFrom = hero.accentFrom || '#1e3a5f';
  const accentTo = hero.accentTo || '#0b1c30';

  return (
    <div className="p-6 lg:p-10 space-y-5 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      {/* Gradient hero ─────────────────────────────────────────────────── */}
      <section
        className="rounded-xl text-white p-6 shadow-md"
        style={{ background: `linear-gradient(135deg, ${accentFrom} 0%, #1a3a5c 60%, ${accentTo} 100%)` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/80 bg-white/10 border border-white/15 rounded-full px-3 py-1">
              {hero.eyebrowIcon ? <hero.eyebrowIcon size={12} /> : null} {hero.eyebrowLabel}
            </div>
            <h1 className="font-display text-[26px] font-bold tracking-tight mt-2">{hero.title}</h1>
            {hero.subtitle && <p className="text-[13px] text-white/80 mt-1 max-w-3xl">{hero.subtitle}</p>}
          </div>
          {hero.actions && <div className="flex items-center gap-2">{hero.actions}</div>}
        </div>
        {hero.kpis && hero.kpis.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {hero.kpis.slice(0, 8).map((k) => (
              <div key={k.key} className="rounded-lg bg-white/10 backdrop-blur p-3 border border-white/10">
                <div className="text-[10px] uppercase tracking-wider text-white/75">{k.label}</div>
                <div className="mt-1 font-mono text-[20px] font-bold leading-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI inline-assist strip (top-of-page nudges) ─────────────────────── */}
      {suggestions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suggestions.slice(0, 3).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => s.tab && setActiveTab(s.tab)}
              className="text-left rounded-lg border border-[#dbecfb] bg-[#f0f7ff] p-3 hover:bg-[#e8f1fb] transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="text-[#1a5d97] mt-[2px]"><OEIcon name="spark" size={14} /></div>
                <div className="flex-1">
                  <div className="font-semibold text-[13px] text-[#0f1c2e]">{s.title}</div>
                  <div className="text-[12px] text-[#3d4756] mt-0.5">{s.why}</div>
                  {s.accept && (
                    <div className="mt-1 text-[12px] font-semibold text-[#1a5d97]">
                      {s.accept.label} <OEIcon name="chevron-right" size={12} />
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Tab strip ───────────────────────────────────────────────────────── */}
      <nav className="flex flex-wrap items-center gap-1 bg-white border border-[#dde4ec] rounded-lg p-1">
        {tabs.map((t) => {
          const TIcon = t.icon;
          const active = t.id === activeTab.id;
          const badge = t.badgeFromSummary?.(summary);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`h-9 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-2 ${
                active ? 'bg-[#1a3a5c] text-white' : 'text-[#3d4756] hover:bg-[#eef2f7]'
              }`}
            >
              {TIcon ? <TIcon size={14} /> : null} {t.label}
              {badge !== undefined && badge !== null && badge >= 0 && (
                <span className={`ml-1 px-1.5 py-[1px] text-[10px] rounded font-mono ${active ? 'bg-white/20' : 'bg-[#dbecfb] text-[#3b82c4]'}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Tab body ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">{activeTab.render(data)}</div>

      {showVaultAndThread && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
          <VaultPanel entityType={entityKind} entityId={entityId} title="Documents" />
          <ThreadPanel entityType={entityKind} entityId={entityId} title="Discussion" />
        </div>
      )}
    </div>
  );
}

export default EntityFileShell;
