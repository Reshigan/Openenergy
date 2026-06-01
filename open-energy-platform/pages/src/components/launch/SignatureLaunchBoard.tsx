// SignatureLaunchBoard — re-skinned launch board using the signature design
// system. Drop-in replacement for <LaunchBoardShell> for roles that have been
// migrated. Consumes the same /api/launch/:role/kpis payload, so the API
// surface stays untouched.
//
// Wrapped in <RoleShell role={role}> so every CSS variable, font, and density
// rule comes from the role-themes table. The component itself is role-agnostic.

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { ActionQueueCard } from '../ActionQueueCard';
import {
  RoleShell,
  SignatureHero,
  HeroNumeral,
  DensityCard,
  FrostedCard,
  AiInlineCard,
  StatusPulse,
  Ticker,
  type TickerRow,
} from '../signature';
import type { LaunchPayload, Kpi, Workflow, AiSuggestion } from './LaunchBoardShell';
import type { RoleKey } from '../../lib/role-themes';

function kpiToHeroDelta(kpi: Kpi): { value: number; tone?: 'good' | 'bad' | 'neutral'; label?: string } | undefined {
  if (!kpi.trend_value) return undefined;
  const numeric = parseFloat(String(kpi.trend_value).replace(/[^0-9.\-+]/g, ''));
  if (Number.isNaN(numeric)) return undefined;
  const tone: 'good' | 'bad' | 'neutral' =
    kpi.tone === 'good' ? 'good' : kpi.tone === 'bad' ? 'bad' : 'neutral';
  return { value: numeric, tone, label: kpi.footer };
}

function kpiValueAsNumber(v: number | string): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(v.replace(/[^0-9.\-+]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

// Trader-only motif — the ticker tape lives in the hero. For other roles we
// could substitute their motif (waterfall, grid map, etc.). For now,
// trader is the only role with a tape; everyone else gets a quiet hero.
function TraderTickerMotif({ kpis }: { kpis: Kpi[] }) {
  const rows: TickerRow[] = useMemo(
    () =>
      kpis.slice(0, 4).map((k) => ({
        symbol: k.key.slice(0, 4).toUpperCase(),
        label: k.label,
        value: kpiValueAsNumber(k.value),
        delta: parseFloat(String(k.trend_value || '0').replace(/[^0-9.\-+]/g, '')) || 0,
        display: `${k.value}${k.unit ? ` ${k.unit}` : ''}`,
      })),
    [kpis],
  );
  if (rows.length === 0) return null;
  return <Ticker rows={rows} ariaLabel="Live trading tape" />;
}

// Lender motif — a "waterfall" stack of the top KPIs as stacked frosted cards.
function LenderWaterfallMotif({ kpis }: { kpis: Kpi[] }) {
  if (kpis.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {kpis.slice(0, 3).map((k, idx) => (
        <FrostedCard
          key={k.key}
          style={{
            transform: `translateX(${idx * 12}px)`,
            opacity: 1 - idx * 0.12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--role-on-surface-muted)',
              }}
            >
              {k.label}
            </span>
            <span
              className="oe-tnum"
              style={{
                fontFamily: 'var(--oe-num-font)',
                fontSize: 26,
                fontWeight: 600,
                color: 'var(--role-on-surface)',
              }}
            >
              {k.value}
              {k.unit ? <span style={{ marginLeft: 6, opacity: 0.55, fontSize: 14 }}>{k.unit}</span> : null}
            </span>
          </div>
        </FrostedCard>
      ))}
    </div>
  );
}

// "Vital signs" — a stack of StatusPulse rows derived from KPI tone. Used as
// the default motif for ops roles (grid, regulator, support) that don't have
// a bespoke visualization yet.
function VitalSignsMotif({ kpis }: { kpis: Kpi[] }) {
  if (kpis.length === 0) return null;
  const toneToPulse = (t?: string): 'live' | 'warn' | 'critical' | 'idle' => {
    if (t === 'good') return 'live';
    if (t === 'warn') return 'warn';
    if (t === 'bad') return 'critical';
    return 'idle';
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {kpis.slice(0, 5).map((k) => (
        <div
          key={k.key}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            background: 'color-mix(in srgb, var(--role-surface-raised) 60%, transparent)',
            border: '1px solid var(--role-border)',
            borderRadius: 'var(--oe-radius-card)',
          }}
        >
          <StatusPulse tone={toneToPulse(k.tone)} label={k.label} />
          <span
            className="oe-tnum"
            style={{ fontFamily: 'var(--oe-num-font)', fontSize: 18, fontWeight: 600, color: 'var(--role-on-surface)' }}
          >
            {k.value}
            {k.unit ? <span style={{ opacity: 0.6, fontSize: 12, marginLeft: 4 }}>{k.unit}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function HeroMotifFor({ role, kpis }: { role: string; kpis: Kpi[] }) {
  if (role === 'trader') return <TraderTickerMotif kpis={kpis} />;
  if (role === 'lender') return <LenderWaterfallMotif kpis={kpis} />;
  if (role === 'grid_operator' || role === 'regulator' || role === 'support') {
    return <VitalSignsMotif kpis={kpis} />;
  }
  if (role === 'admin' || role === 'ipp_developer' || role === 'offtaker' || role === 'carbon_fund') {
    return <LenderWaterfallMotif kpis={kpis} />;
  }
  return null;
}

function WorkflowTile({ wf }: { wf: Workflow }) {
  const navigate = useNavigate();
  return (
    <DensityCard
      onClick={() => navigate(wf.href)}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <h3
          style={{
            fontFamily: 'var(--oe-display-font)',
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.3,
            color: 'var(--role-on-surface)',
            margin: 0,
          }}
        >
          {wf.title}
        </h3>
        {wf.metric ? (
          <span
            className="oe-tnum"
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--role-accent-soft)',
              color: 'var(--role-accent)',
              whiteSpace: 'nowrap',
            }}
          >
            {wf.metric.value} {wf.metric.label}
          </span>
        ) : null}
      </div>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--role-on-surface-muted)',
          margin: 0,
          flex: 1,
        }}
      >
        {wf.description.length > 120 ? wf.description.slice(0, 117) + '…' : wf.description}
      </p>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--role-accent)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {wf.cta_label} <span aria-hidden="true">→</span>
      </span>
    </DensityCard>
  );
}

function AiAcceptHandler({
  role,
  suggestion,
  onDismiss,
}: {
  role: string;
  suggestion: AiSuggestion;
  onDismiss: (key: string) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      await api.post(`/launch/${role}/ai/${suggestion.key}/accept`, {
        title: suggestion.title,
        confidence: suggestion.confidence,
      });
    } catch {
      /* non-blocking audit */
    }
    if (suggestion.accept?.href) navigate(suggestion.accept.href);
    setBusy(false);
  };
  return (
    <AiInlineCard
      title={suggestion.title}
      why={suggestion.why}
      confidence={suggestion.confidence}
      accept={
        suggestion.accept
          ? {
              label: busy ? 'Working…' : suggestion.accept.label,
              onClick: accept,
            }
          : undefined
      }
      dismiss={
        suggestion.dismiss
          ? { label: suggestion.dismiss.label, onClick: () => onDismiss(suggestion.key) }
          : undefined
      }
    />
  );
}

export function SignatureLaunchBoard({ role }: { role: string }) {
  const [payload, setPayload] = useState<LaunchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await api.get(`/launch/${role}/kpis`);
        if (!alive) return;
        setPayload(res.data?.data || null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.response?.data?.error || e.message || 'Failed to load launch board');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [role]);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <Skeleton variant="card" rows={2} />
        <div style={{ height: 16 }} />
        <Skeleton variant="card" rows={4} />
      </div>
    );
  }
  if (err) return <ErrorBanner message={err} onRetry={() => window.location.reload()} />;
  if (!payload) return <ErrorBanner message="No data" />;

  const visibleSuggestions = payload.ai_suggestions.filter((s) => !dismissed.has(s.key));
  const featuredKpis = payload.kpis.slice(0, 4);
  const remainingKpis = payload.kpis.slice(4);
  const dismiss = (key: string) => setDismissed((prev) => new Set(prev).add(key));

  return (
    <RoleShell role={role as RoleKey}>
      <SignatureHero
        eyebrow={payload.hero.eyebrow}
        title={payload.hero.title}
        subtitle={payload.hero.subtitle}
        primaryCta={
          payload.hero.primary_cta
            ? { label: payload.hero.primary_cta.label, href: payload.hero.primary_cta.href }
            : undefined
        }
        motif={<HeroMotifFor role={role} kpis={featuredKpis} />}
      />

      <div style={{ display: 'grid', gap: 32, padding: 'clamp(20px, 3vw, 40px)', maxWidth: 1440, margin: '0 auto' }}>
        {featuredKpis.length > 0 && (
          <section>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--role-on-surface-muted)',
                marginBottom: 16,
              }}
            >
              Today at a glance
              {payload.hero.eyebrow.toLowerCase().includes('live') ? (
                <span style={{ marginLeft: 12 }}>
                  <StatusPulse tone="live" label="Live" />
                </span>
              ) : null}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              {featuredKpis.map((k) => (
                <FrostedCard key={k.key}>
                  <HeroNumeral
                    eyebrow={k.label}
                    value={kpiValueAsNumber(k.value)}
                    unit={k.unit}
                    delta={kpiToHeroDelta(k)}
                    format={(v) =>
                      typeof k.value === 'string'
                        ? k.value
                        : Math.abs(v) >= 1_000_000
                        ? (v / 1_000_000).toFixed(2) + 'M'
                        : Math.abs(v) >= 1_000
                        ? (v / 1_000).toFixed(1) + 'k'
                        : v.toFixed(v % 1 === 0 ? 0 : 1)
                    }
                    countUp={false}
                  />
                </FrostedCard>
              ))}
            </div>
          </section>
        )}

        {remainingKpis.length > 0 && (
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {remainingKpis.map((k) => (
              <DensityCard key={k.key}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--role-on-surface-muted)',
                    }}
                  >
                    {k.label}
                  </span>
                  <span
                    className="oe-tnum"
                    style={{
                      fontFamily: 'var(--oe-num-font)',
                      fontSize: 22,
                      fontWeight: 600,
                      color: 'var(--role-on-surface)',
                    }}
                  >
                    {k.value}
                    {k.unit ? (
                      <span style={{ marginLeft: 4, opacity: 0.55, fontSize: 12 }}>{k.unit}</span>
                    ) : null}
                  </span>
                  {k.trend_value ? (
                    <span
                      className="oe-tnum"
                      style={{
                        fontSize: 11,
                        color:
                          k.tone === 'good'
                            ? '#1f8a5b'
                            : k.tone === 'bad'
                            ? '#c0392b'
                            : 'var(--role-on-surface-muted)',
                      }}
                    >
                      {k.trend_value}
                    </span>
                  ) : null}
                </div>
              </DensityCard>
            ))}
          </section>
        )}

        <ActionQueueCard />

        {visibleSuggestions.length > 0 && (
          <section>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--role-on-surface-muted)',
                marginBottom: 12,
              }}
            >
              Suggested next steps
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 12,
              }}
            >
              {visibleSuggestions.map((s) => (
                <AiAcceptHandler key={s.key} role={role} suggestion={s} onDismiss={dismiss} />
              ))}
            </div>
          </section>
        )}

        {payload.workflows.length > 0 && (
          <section>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--role-on-surface-muted)',
                marginBottom: 16,
              }}
            >
              Primary workflows
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              {payload.workflows.map((w) => (
                <WorkflowTile key={w.key} wf={w} />
              ))}
            </div>
          </section>
        )}
      </div>
    </RoleShell>
  );
}
