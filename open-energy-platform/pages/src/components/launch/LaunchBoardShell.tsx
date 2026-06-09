// ════════════════════════════════════════════════════════════════════════
// LaunchBoardShell — per-role landing page primitives
//
// Every role's home screen renders the same skeleton but with role-shaped
// content fetched from /api/launch/:role/kpis. The shell handles loading,
// error, and layout; the role-specific board only chooses what data to
// emphasise. AI inline assists land here (per [[feedback-ai-subtle-active]]
// — no AI tab, just inline cards with "why" + 1-click accept).
// ════════════════════════════════════════════════════════════════════════

import React, { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, X, Lightbulb } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { ActionQueueCard } from '../ActionQueueCard';
import { SetupChecklist } from './SetupChecklist';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export type Kpi = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  trend_value?: string;
  tone?: Tone;
  href?: string;
  footer?: string;
};

export type Workflow = {
  key: string;
  title: string;
  description: string;
  href: string;
  cta_label: string;
  icon?: string;
  metric?: { label: string; value: string | number; tone?: Tone };
};

export type AiSuggestion = {
  key: string;
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; href?: string; action?: string };
  dismiss?: { label: string };
};

export type LaunchPayload = {
  role: string;
  user: { id: string; name?: string; email: string };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primary_cta?: { label: string; href: string };
  };
  kpis: Kpi[];
  workflows: Workflow[];
  ai_suggestions: AiSuggestion[];
};

const toneBg: Record<Tone, string> = {
  good: '#cdf0dd',
  warn: '#fef3e6',
  bad: '#fde7e9',
  neutral: '#dbecfb',
};
const toneText: Record<Tone, string> = {
  good: '#1f7a4a',
  warn: '#b04e0f',
  bad: '#c0392b',
  neutral: '#3b82c4',
};

function formatValue(v: number | string): string {
  if (typeof v === 'number') {
    if (Math.abs(v) >= 100000) return new Intl.NumberFormat('en-ZA').format(Math.round(v));
    return String(v);
  }
  return v;
}

// ─── KPI tile ──────────────────────────────────────────────────────────
function KpiTile({ kpi }: { kpi: Kpi }) {
  const navigate = useNavigate();
  const tone: Tone = kpi.tone || 'neutral';
  const clickable = !!kpi.href;
  return (
    <button
      type="button"
      onClick={clickable ? () => navigate(kpi.href!) : undefined}
      className="text-left rounded-lg border p-3 transition-all"
      style={{
        background: '#ffffff',
        borderColor: '#dde4ec',
        cursor: clickable ? 'pointer' : 'default',
      }}
      onMouseEnter={
        clickable
          ? (e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82c4';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(59,130,196,0.15)';
            }
          : undefined
      }
      onMouseLeave={
        clickable
          ? (e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#dde4ec';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }
          : undefined
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: '#6b7685' }}>
        {kpi.label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <div className="text-[20px] font-bold leading-none" style={{ color: '#0f1c2e' }}>
          {formatValue(kpi.value)}
        </div>
        {kpi.unit && (
          <div className="text-[11px] font-medium" style={{ color: '#6b7685' }}>
            {kpi.unit}
          </div>
        )}
      </div>
      {(kpi.trend_value || kpi.footer) && (
        <div className="mt-1 flex items-center gap-1.5 text-[10px]">
          {kpi.trend_value && (
            <span
              className="px-1 py-px rounded font-semibold"
              style={{ background: toneBg[tone], color: toneText[tone] }}
            >
              {kpi.trend_value}
            </span>
          )}
          {kpi.footer && <span className="truncate" style={{ color: '#6b7685' }}>{kpi.footer}</span>}
        </div>
      )}
    </button>
  );
}

// ─── Workflow card ─────────────────────────────────────────────────────
function WorkflowCard({ wf }: { wf: Workflow }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(wf.href)}
      className="text-left rounded-lg border p-3 transition-all w-full h-full flex flex-col"
      style={{ background: '#ffffff', borderColor: '#dde4ec' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82c4';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(59,130,196,0.18)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#dde4ec';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold leading-snug" style={{ color: '#0f1c2e' }}>
          {wf.title}
        </h3>
        {wf.metric && (
          <span
            className="text-[11px] px-2 py-0.5 rounded font-semibold whitespace-nowrap"
            style={{ background: toneBg[wf.metric.tone || 'neutral'], color: toneText[wf.metric.tone || 'neutral'] }}
          >
            {wf.metric.value} {wf.metric.label}
          </span>
        )}
      </div>
      <p className="mt-2 text-[13px] flex-1" style={{ color: '#6b7685' }}>
        {wf.description.length > 120 ? wf.description.slice(0, 117) + '…' : wf.description}
      </p>
      <div
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold"
        style={{ color: '#3b82c4' }}
      >
        {wf.cta_label} <ArrowRight size={12} />
      </div>
    </button>
  );
}

// ─── AI suggestion card ───────────────────────────────────────────────
//
// Per [[feedback-ai-subtle-active]]: no AI tab. Subtle inline card with a
// clear "why" line and a 1-click accept. Accept is recorded server-side
// for audit + future ML; dismiss is local-only.
function AiSuggestionCard({
  role,
  suggestion,
  onDismiss,
}: {
  role: string;
  suggestion: AiSuggestion;
  onDismiss: (key: string) => void;
}) {
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await api.post(`/launch/${role}/ai/${suggestion.key}/accept`, {
        title: suggestion.title,
        confidence: suggestion.confidence,
      });
    } catch {
      /* audit-log failures are non-blocking; UX continues */
    }
    if (suggestion.accept?.href) navigate(suggestion.accept.href);
    setAccepting(false);
  };

  return (
    <div
      className="rounded-xl border p-4 flex gap-3"
      style={{
        background: 'linear-gradient(135deg,#fffdf3 0%,#fff7e3 100%)',
        borderColor: '#ecd99a',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: '#fff', color: '#b04e0f' }}
      >
        <Lightbulb size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[14px] font-semibold leading-tight" style={{ color: '#0f1c2e' }}>
            {suggestion.title}
          </h4>
          {suggestion.dismiss && (
            <button
              type="button"
              onClick={() => onDismiss(suggestion.key)}
              className="text-[11px]"
              style={{ color: '#6b7685' }}
              aria-label="Dismiss suggestion"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <p className="mt-1 text-[12px]" style={{ color: '#6b7685' }}>
          {suggestion.why}
        </p>
        {suggestion.accept && (
          <button
            type="button"
            disabled={accepting}
            onClick={handleAccept}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded"
            style={{
              background: '#0f1c2e',
              color: '#fff',
              opacity: accepting ? 0.6 : 1,
            }}
          >
            {accepting ? 'Working…' : suggestion.accept.label} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────
function HeroBlock({ payload }: { payload: LaunchPayload }) {
  const navigate = useNavigate();
  return (
    <div className="fiori-hero">
      <div className="flex flex-col lg:flex-row lg:items-end gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-white/60 font-semibold">
            <Sparkles size={10} />
            <span>{payload.hero.eyebrow}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h1 className="text-[18px] font-bold tracking-tight leading-tight">
              {payload.hero.title}
            </h1>
            <span className="text-white/65 text-[12px] hidden sm:inline">{payload.hero.subtitle}</span>
          </div>
          {payload.hero.primary_cta && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate(payload.hero.primary_cta!.href)}
                className="h-8 px-4 rounded text-[12px] font-semibold text-white inline-flex items-center gap-1.5 transition-all hover:brightness-110"
                style={{
                  background: 'linear-gradient(135deg,#5fa8e8 0%,#1a5d97 100%)',
                  boxShadow: '0 4px 12px rgba(95,168,232,0.35)',
                }}
              >
                {payload.hero.primary_cta.label} <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────
export function LaunchBoardShell({
  role,
  children,
}: {
  role: string;
  children?: ReactNode;
}) {
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

  const dismissSuggestion = (key: string) =>
    setDismissed((prev) => new Set(prev).add(key));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="card" rows={2} />
        <Skeleton variant="card" rows={4} />
      </div>
    );
  }
  if (err)
    return <ErrorBanner message={err} onRetry={() => window.location.reload()} />;
  if (!payload) return <ErrorBanner message="No data" />;

  const visibleSuggestions = payload.ai_suggestions.filter((s) => !dismissed.has(s.key));

  return (
    <div className="space-y-4">
      <HeroBlock payload={payload} />

      <SetupChecklist role={role} />

      {/* KPI grid */}
      {payload.kpis.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {payload.kpis.map((k) => (
            <KpiTile key={k.key} kpi={k} />
          ))}
        </div>
      )}

      {/* Action queue — shared component, queries server-side per-user */}
      <ActionQueueCard />

      {/* AI inline assists — only render if we have any */}
      {visibleSuggestions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#6b7685' }}>
            Suggested next steps
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {visibleSuggestions.map((s) => (
              <AiSuggestionCard
                key={s.key}
                role={role}
                suggestion={s}
                onDismiss={dismissSuggestion}
              />
            ))}
          </div>
        </div>
      )}

      {/* Workflow cards */}
      {payload.workflows.length > 0 && (
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#6b7685' }}>
            Primary workflows
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {payload.workflows.map((w) => (
              <WorkflowCard key={w.key} wf={w} />
            ))}
          </div>
        </div>
      )}

      {/* Role-specific extension slot (lifecycle timeline for IPP, etc.) */}
      {children}
    </div>
  );
}
