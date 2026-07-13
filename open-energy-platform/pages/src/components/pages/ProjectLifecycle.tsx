// ════════════════════════════════════════════════════════════════════════
// ProjectLifecycle — end-to-end view of a single IPP project
//
// Solar generators (and other IPP developers) come from /projects/:id and
// land here to walk the project file from origination through to
// decommissioning. Every existing lifecycle table contributes a record
// count to the relevant stage; status pills make it obvious where you are
// and what blocks the next stage. The AI inline assist at the top surfaces
// the next blocker without the developer having to read every stage card.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Clock, AlertCircle, Lightbulb, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';

type StageStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

type Stage = {
  key: string;
  label: string;
  summary: string;
  status: StageStatus;
  records: Record<string, number>;
  workflow: { label: string; href: string };
  next_action?: string | null;
};

type AiSuggestion = {
  key: string;
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; href: string };
};

type LifecyclePayload = {
  project: {
    id: string;
    project_name: string;
    technology: string;
    capacity_mw: number;
    location: string;
    status: string;
    commercial_operation_date?: string;
    developer_name?: string;
    ppa_price_per_mwh?: number;
    ppa_duration_years?: number;
  };
  phase: string;
  stages: Stage[];
  ai_suggestions: AiSuggestion[];
};

const statusStyle: Record<StageStatus, { label: string; bg: string; fg: string; icon: typeof Circle }> = {
  not_started: { label: 'Not started', bg: 'var(--s2, #eef1f4)', fg: 'var(--ink-2, #6b7685)', icon: Circle },
  in_progress: { label: 'In progress', bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', icon: Clock },
  completed: { label: 'Completed', bg: 'color-mix(in oklch, var(--good, oklch(0.55 0.18 145)) 14%, var(--s1, #cdf0dd))', fg: 'var(--good)', icon: CheckCircle2 },
  blocked: { label: 'Blocked', bg: 'color-mix(in oklch, var(--bad, oklch(0.55 0.22 25)) 14%, var(--s1, #fde7e9))', fg: 'var(--bad, #c0392b)', icon: AlertCircle },
};

const phaseLabel: Record<string, string> = {
  development: 'In development',
  construction: 'Under construction',
  commissioning: 'Commissioning',
  commercial_operations: 'In commercial operation',
  decommissioned: 'Decommissioned',
};

const titleCase = (key: string) =>
  key
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');

function StageCard({
  stage,
  index,
  isLast,
}: {
  stage: Stage;
  index: number;
  isLast: boolean;
}) {
  const navigate = useNavigate();
  const style = statusStyle[stage.status];
  const Icon = style.icon;
  const recordEntries = Object.entries(stage.records).filter(([, v]) => v > 0);
  return (
    <div className="relative flex gap-4">
      {/* Timeline rail */}
      <div className="flex flex-col items-center flex-shrink-0 pt-1">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: style.bg, color: style.fg, border: `2px solid ${style.fg}` }}
        >
          <Icon size={18} strokeWidth={2.5} />
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 my-2 min-h-[24px]"
            style={{ background: 'var(--border-subtle, #dde4ec)' }}
            aria-hidden
          />
        )}
      </div>

      {/* Card */}
      <div
        className="rounded-xl border p-5 flex-1 mb-5 last:mb-0"
        style={{ background: 'var(--s1, #fff)', borderColor: 'var(--border-subtle, #dde4ec)' }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold leading-snug" style={{ color: 'var(--ink, #0f1c2e)' }}>
              {stage.label}
            </h3>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--ink-2, #6b7685)' }}>
              {stage.summary}
            </p>
          </div>
          <span
            className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap"
            style={{ background: style.bg, color: style.fg }}
          >
            {style.label}
          </span>
        </div>

        {/* Record counts grid — only show keys with non-zero count */}
        {recordEntries.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {recordEntries.map(([k, v]) => (
              <div
                key={k}
                className="rounded-lg border p-2"
                style={{ borderColor: 'var(--border-subtle, #e5ebf2)', background: 'var(--s1, #f8fafc)' }}
              >
                <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--ink-2, #6b7685)' }}>
                  {titleCase(k)}
                </div>
                <div className="text-[18px] font-bold leading-none mt-1" style={{ color: 'var(--ink, #0f1c2e)' }}>
                  {v}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Next action callout — surfaces the per-stage blocker inline */}
        {stage.next_action && (
          <div
            className="mt-3 px-3 py-2 rounded-lg text-[12px] flex items-start gap-2"
            style={{ background: 'color-mix(in oklch, var(--warn, oklch(0.65 0.18 75)) 14%, var(--s1, #fff7e3))', border: '1px solid var(--warn, #ecd99a)', color: 'var(--warn, #7a4a0c)' }}
          >
            <Lightbulb size={14} className="flex-shrink-0 mt-0.5" />
            <span>{stage.next_action}</span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(stage.workflow.href)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded"
            style={{ background: 'var(--accent, oklch(0.46 0.16 55))', color: '#fff' }}
          >
            {stage.workflow.label} <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestionBanner({
  projectId,
  suggestion,
  onDismiss,
}: {
  projectId: string;
  suggestion: AiSuggestion;
  onDismiss: (key: string) => void;
}) {
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  const handleAccept = async () => {
    setAccepting(true);
    try {
      await api.post(`/launch/ipp_developer/ai/${suggestion.key}/accept`, {
        project_id: projectId,
        title: suggestion.title,
        confidence: suggestion.confidence,
      });
    } catch {
      /* audit-log failures are non-blocking */
    }
    if (suggestion.accept?.href) navigate(suggestion.accept.href);
    setAccepting(false);
  };
  return (
    <div
      className="rounded-xl border p-4 flex gap-3"
      style={{ background: 'linear-gradient(135deg,var(--s1, #fffdf3) 0%,color-mix(in oklch, var(--warn, oklch(0.65 0.18 75)) 14%, var(--s1, #fff7e3)) 100%)', borderColor: 'var(--warn, #ecd99a)' }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--s1, #fff)', color: 'var(--accent, #b04e0f)' }}
      >
        <Lightbulb size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[14px] font-semibold" style={{ color: 'var(--ink, #0f1c2e)' }}>
            {suggestion.title}
          </h4>
          <button
            type="button"
            onClick={() => onDismiss(suggestion.key)}
            aria-label="Dismiss"
            style={{ color: 'var(--ink-2, #6b7685)' }}
          >
            <X size={14} />
          </button>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-2, #6b7685)' }}>
          {suggestion.why}
        </p>
        {suggestion.accept && (
          <button
            type="button"
            disabled={accepting}
            onClick={handleAccept}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded"
            style={{ background: 'var(--accent, oklch(0.46 0.16 55))', color: '#fff', opacity: accepting ? 0.6 : 1 }}
          >
            {accepting ? 'Working…' : suggestion.accept.label} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export function ProjectLifecycle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<LifecyclePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await api.get(`/projects/${id}/lifecycle`);
        if (!alive) return;
        setPayload(res.data?.data || null);
      } catch (e: any) {
        if (alive) setErr(e?.response?.data?.error || e.message || 'Failed to load project lifecycle');
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton variant="card" rows={2} />
        <Skeleton variant="card" rows={6} />
      </div>
    );
  if (err) return <ErrorBanner message={err} onRetry={() => window.location.reload()} />;
  if (!payload) return <ErrorBanner message="No data" />;

  const { project, phase, stages, ai_suggestions } = payload;
  const visibleSuggestions = ai_suggestions.filter((s) => !dismissed.has(s.key));
  const completed = stages.filter((s) => s.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* Crumb back to project */}
      <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--ink-2, #6b7685)' }}>
        <Link to="/projects" className="hover:underline">All projects</Link>
        <span>/</span>
        <Link to={`/projects/${project.id}`} className="hover:underline">
          {project.project_name}
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--ink, #0f1c2e)', fontWeight: 600 }}>Lifecycle</span>
      </div>

      {/* Project header */}
      <div
        className="rounded-xl border p-5"
        style={{ background: 'var(--s1, oklch(0.99 0.002 80))', borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.12em] uppercase font-mono font-semibold" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>
              {phaseLabel[phase] || phase}
            </div>
            <h1 className="mt-1 text-[24px] sm:text-[28px] font-bold tracking-tight" style={{ color: 'var(--ink, oklch(0.15 0.025 250))' }}>
              {project.project_name}
            </h1>
            <p className="mt-0.5 text-[14px]" style={{ color: 'var(--ink-2, oklch(0.45 0.015 250))' }}>
              {project.capacity_mw} MW {project.technology} · {project.location}
              {project.commercial_operation_date ? ` · COD ${project.commercial_operation_date}` : ''}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-right">
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>Stages done</div>
              <div className="text-[24px] font-bold font-mono" style={{ color: 'var(--ink, oklch(0.15 0.025 250))' }}>{completed}/{stages.length}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>PPA price</div>
              <div className="text-[24px] font-bold font-mono" style={{ color: 'var(--ink, oklch(0.15 0.025 250))' }}>
                {project.ppa_price_per_mwh ? `R${Math.round(project.ppa_price_per_mwh)}` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ink-2, oklch(0.55 0.008 250))' }}>PPA term</div>
              <div className="text-[24px] font-bold font-mono" style={{ color: 'var(--ink, oklch(0.15 0.025 250))' }}>
                {project.ppa_duration_years ? `${project.ppa_duration_years}y` : '—'}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate(`/projects/${project.id}`)}
            className="h-9 px-4 rounded text-[12px] font-semibold inline-flex items-center gap-1.5 border hover:bg-[var(--s2, #eef2f7)]" style={{ color: 'var(--ink-2, oklch(0.45 0.015 250))', borderColor: 'var(--border-subtle, oklch(0.88 0.006 250))' } as React.CSSProperties}
          >
            <ArrowLeft size={12} /> Back to project file
          </button>
        </div>
      </div>

      {/* AI inline suggestions — top-of-page nudge */}
      {visibleSuggestions.length > 0 && (
        <div className="space-y-2">
          {visibleSuggestions.map((s) => (
            <SuggestionBanner
              key={s.key}
              projectId={project.id}
              suggestion={s}
              onDismiss={(key) => setDismissed((prev) => new Set(prev).add(key))}
            />
          ))}
        </div>
      )}

      {/* Stage timeline */}
      <div>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2, #6b7685)' }}>
          Lifecycle stages
        </h2>
        <div>
          {stages.map((stage, idx) => (
            <StageCard
              key={stage.key}
              stage={stage}
              index={idx}
              isLast={idx === stages.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
