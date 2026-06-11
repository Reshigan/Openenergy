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

// ── Design tokens ───────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_BG  = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

// ── Types ────────────────────────────────────────────────────────────────

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

// ── Tone helper ──────────────────────────────────────────────────────────
function toneColor(tone?: 'good' | 'warn' | 'bad' | 'neutral'): string {
  if (tone === 'good') return GOOD;
  if (tone === 'warn') return WARN;
  if (tone === 'bad')  return BAD;
  return TX1;
}

// ── Shell ────────────────────────────────────────────────────────────────

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

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '32px 36px', minHeight: '100vh', background: BG }}>
        <Skeleton variant="card" rows={4} />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div style={{ padding: '32px 36px', minHeight: '100vh', background: BG }}>
        <ErrorBanner message={error || 'No data.'} onRetry={refresh} />
        {backHref && (
          <Link
            to={backHref}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 13, fontWeight: 600, color: ACC, marginTop: 16,
              textDecoration: 'none',
            }}
          >
            <OEIcon name="chevron-left" size={14} /> {backLabel}
          </Link>
        )}
      </div>
    );
  }

  const hero        = heroFor(data);
  const summary     = summaryFor?.(data) || {};
  const suggestions = suggestionsFor?.(data) || ((data as { ai_suggestions?: EntityFileSuggestion[] }).ai_suggestions ?? []);

  // ── Two-column layout ──────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        height: 'calc(100vh - 50px)',
        background: BG,
        overflow: 'hidden',
      }}
    >
      {/* ── LEFT COLUMN: main content ─────────────────────────────────── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>

        {/* Back link */}
        {backHref && (
          <Link
            to={backHref}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 600, color: TX2,
              textDecoration: 'none', marginBottom: 16,
            }}
          >
            <OEIcon name="chevron-left" size={12} /> {backLabel}
          </Link>
        )}

        {/* Hero header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          {hero.eyebrowLabel && (
            <div
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: ACC, fontFamily: MONO,
                marginBottom: 4,
              }}
            >
              {hero.eyebrowIcon ? <hero.eyebrowIcon size={10} /> : null}{' '}
              {hero.eyebrowLabel}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0, lineHeight: 1.2 }}>
                {hero.title}
              </h1>
              {hero.subtitle && (
                <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0', maxWidth: 680 }}>
                  {hero.subtitle}
                </p>
              )}
            </div>
            {hero.actions && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {hero.actions}
              </div>
            )}
          </div>
        </div>

        {/* KPI strip ───────────────────────────────────────────────────── */}
        {hero.kpis && hero.kpis.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {hero.kpis.slice(0, 8).map((k) => (
              <div
                key={k.key}
                style={{
                  background: BG1,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '12px 16px',
                  flex: '1 1 120px',
                  minWidth: 120,
                }}
              >
                <div
                  style={{
                    fontSize: 10, fontWeight: 700, color: TX3,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}
                >
                  {k.label}
                </div>
                <div
                  style={{
                    fontSize: 20, fontWeight: 700, color: toneColor(k.tone),
                    fontFamily: MONO, marginTop: 4, lineHeight: 1.2,
                  }}
                >
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI suggestion strip ─────────────────────────────────────────── */}
        {suggestions.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {suggestions.slice(0, 4).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => s.tab && setActiveTab(s.tab)}
                style={{
                  textAlign: 'left', background: BG1,
                  border: `1px solid ${BORDER}`, borderRadius: 8,
                  padding: '10px 14px', cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BG2; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BG1; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ color: ACC, marginTop: 1, flexShrink: 0 }}>
                    <OEIcon name="spark" size={13} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: TX1 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: TX2, marginTop: 2, lineHeight: 1.4 }}>{s.why}</div>
                    {s.accept && (
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: ACC, display: 'flex', alignItems: 'center', gap: 2 }}>
                        {s.accept.label} <OEIcon name="chevron-right" size={11} />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Tab strip ───────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 4,
            background: BG1, border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: 4, marginBottom: 20,
          }}
        >
          {tabs.map((t) => {
            const TIcon  = t.icon;
            const active = t.id === activeTab.id;
            const badge  = t.badgeFromSummary?.(summary);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                style={{
                  height: 32, padding: '0 12px', borderRadius: 6,
                  fontSize: 12, fontWeight: 600, border: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  cursor: 'pointer',
                  background: active ? ACC : 'transparent',
                  color: active ? '#fff' : TX2,
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = BG2;
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                {TIcon ? <TIcon size={13} /> : null}
                {t.label}
                {badge !== undefined && badge !== null && badge >= 0 && (
                  <span
                    style={{
                      fontSize: 10, fontFamily: MONO, borderRadius: 10,
                      padding: '1px 5px', lineHeight: 1.5,
                      background: active ? 'rgba(255,255,255,0.25)' : ACC_BG,
                      color: active ? '#fff' : ACC,
                    }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab body ────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          {activeTab.render(data)}
        </div>

        {/* Vault + Thread panels ───────────────────────────────────────── */}
        {showVaultAndThread && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingBottom: 32 }}>
            <VaultPanel entityType={entityKind} entityId={entityId} title="Documents" />
            <ThreadPanel entityType={entityKind} entityId={entityId} title="Discussion" />
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN: action panel ────────────────────────────────── */}
      <div
        style={{
          borderLeft: `1px solid ${BORDER}`,
          background: BG1,
          overflowY: 'auto',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Summary stats card ───────────────────────────────────────────── */}
        {Object.keys(summary).length > 0 && (
          <div
            style={{
              background: BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontSize: 11, fontWeight: 700, color: TX2,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12,
              }}
            >
              Summary
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(summary)
                .filter(([, v]) => v !== null && v !== undefined)
                .slice(0, 10)
                .map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', fontSize: 12,
                    }}
                  >
                    <span style={{ color: TX2, textTransform: 'capitalize' }}>
                      {k.replace(/_/g, ' ')}
                    </span>
                    <span
                      style={{
                        color: TX1, fontFamily: MONO, fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {String(v)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Tab quick-jump ───────────────────────────────────────────────── */}
        <div
          style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11, fontWeight: 700, color: TX2,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
            }}
          >
            Sections
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {tabs.map((t) => {
              const TIcon  = t.icon;
              const active = t.id === activeTab.id;
              const badge  = t.badgeFromSummary?.(summary);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', borderRadius: 6, border: 'none',
                    cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500,
                    background: active ? ACC_BG : 'transparent',
                    color: active ? ACC : TX2,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.background = BG2;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {TIcon ? <TIcon size={12} /> : null}
                    {t.label}
                  </span>
                  {badge !== undefined && badge !== null && badge > 0 && (
                    <span
                      style={{
                        fontSize: 10, fontFamily: MONO, borderRadius: 10,
                        padding: '1px 6px', lineHeight: 1.5,
                        background: active ? ACC_BG : BG2,
                        color: active ? ACC : TX3,
                        fontWeight: 600,
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* AI nudges panel ──────────────────────────────────────────────── */}
        {suggestions.length > 0 && (
          <div
            style={{
              background: BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontSize: 11, fontWeight: 700, color: TX2,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <OEIcon name="spark" size={11} /> AI Insights
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => s.tab && setActiveTab(s.tab)}
                  style={{
                    textAlign: 'left', background: BG1,
                    border: `1px solid ${BORDER}`, borderRadius: 6,
                    padding: '8px 10px', cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BG2; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BG1; }}
                >
                  <div style={{ fontWeight: 600, fontSize: 11, color: TX1, marginBottom: 2 }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 11, color: TX2, lineHeight: 1.4 }}>{s.why}</div>
                  {s.accept && (
                    <div
                      style={{
                        marginTop: 4, fontSize: 11, fontWeight: 600,
                        color: ACC, display: 'flex', alignItems: 'center', gap: 2,
                      }}
                    >
                      {s.accept.label} <OEIcon name="chevron-right" size={10} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EntityFileShell;
