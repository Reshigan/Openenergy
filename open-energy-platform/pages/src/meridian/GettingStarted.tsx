// pages/src/meridian/GettingStarted.tsx — post-onboarding activation card.
//
// Source of truth is GET /api/onboarding/checklist/:role (onboarding-checklist.ts):
// a per-role activation checklist with a live, data-computed `done` per item, a
// progress fraction, and an inline AI next-best-step (the first incomplete item
// with a short `why`). Directly answers the headline complaint - "its very
// difficult for an ipp to go through a journey" - by showing the operator how
// far they are, what is left, and one primary 1-click step to take next.
//
// GET /api/onboarding/state is read as OPTIONAL enrichment only: when a
// getting-started manifest exists (written by the onboarding-provisioning
// cascade) it supplies a friendlier headline and a profile recap. The card
// renders with or without it.
//
// Lifecycle:
//   • Shows whenever the checklist has loaded and is not yet complete - even for
//     a returning operator - so activation is always one glance away until done.
//   • Disappears the moment every checklist item is done (checklist.complete).
//   • Per-user dismiss (localStorage) hides it for operators who want it gone.
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import './meridian.css';

type NextAction = { key: string; label: string; route: string; description?: string };
type Manifest = {
  headline: string;
  profile_summary?: Record<string, unknown>;
  next_actions?: NextAction[];
};

type ChecklistItem = { key: string; label: string; description?: string; href: string; done: boolean };
type NextBestStep = { item_key: string; why: string; action_href: string };
type Checklist = {
  role: string;
  items: ChecklistItem[];
  progress: { done: number; total: number };
  complete: boolean;
  next_best_step: NextBestStep | null;
};

function dismissKey(userId: string | undefined): string {
  return `oe_gs_dismissed_${userId ?? 'anon'}`;
}

// Turn snake_case profile keys into readable chips ("trading_desk_name" -> "Trading desk name").
function prettyKey(k: string): string {
  const s = k.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function prettyVal(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

export function GettingStarted() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const welcome = new URLSearchParams(location.search).get('welcome') === '1';

  const [checklist, setChecklist] = React.useState<Checklist | null>(null);
  const [manifest, setManifest] = React.useState<Manifest | null>(null);
  const [dismissed, setDismissed] = React.useState<boolean>(() => {
    try { return localStorage.getItem(dismissKey(user?.id)) === '1'; } catch { return false; }
  });

  // ── Checklist (source of truth) ────────────────────────────────────────────
  // A single immediate read on mount / role change. The backend computes `done`
  // from live COUNT(*)s scoped to the participant - no settling poll needed.
  React.useEffect(() => {
    if (!user?.role || dismissed) return undefined;
    let live = true;
    api.get('/onboarding/checklist/' + user.role)
      .then((r: any) => {
        if (!live) return;
        const data = (r?.data?.data ?? null) as Checklist | null;
        if (data && Array.isArray(data.items) && data.progress) setChecklist(data);
      })
      .catch(() => { /* leave card hidden on error */ });
    return () => { live = false; };
  }, [user?.role, dismissed]);

  // ── Manifest (optional enrichment) ─────────────────────────────────────────
  // When arriving fresh from onboarding (?welcome=1) the provisioning cascade may
  // still be settling on the queue - retry a handful of times. Otherwise a single
  // read. A missing manifest is fine: the card falls back to a generic headline.
  React.useEffect(() => {
    if (!user || dismissed) return undefined;
    let live = true;
    const maxTries = welcome ? 6 : 1;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = () => {
      api.get('/onboarding/state')
        .then((r: any) => {
          if (!live) return;
          const envelope = r?.data?.data ?? r?.data ?? {};
          const m = envelope.manifest as Manifest | null;
          if (m && typeof m === 'object' && typeof m.headline === 'string' && m.headline.length > 0) {
            setManifest(m);
            return;
          }
          tries += 1;
          if (tries < maxTries) timer = setTimeout(poll, 1500);
        })
        .catch(() => { /* enrichment only - leave manifest absent on error */ });
    };
    poll();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [user, dismissed, welcome]);

  // Visibility gate: nothing until the checklist loads; gone once fully activated
  // or dismissed. Manifest is optional and never gates the card.
  if (dismissed) return null;
  if (!checklist) return null;
  if (checklist.complete) return null;

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(user?.id), '1'); } catch { /* private mode */ }
    setDismissed(true);
  };

  const profile = Object.entries(manifest?.profile_summary ?? {});
  const headline = manifest?.headline || 'Finish setting up your workspace';
  const { done, total } = checklist.progress;
  // Clamp to [0,1] for the scaleX fill (a degenerate total of 0 reads as full).
  const fraction = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const next = checklist.next_best_step;

  return (
    <section className="mer-gs" aria-label="Getting started">
      <div className="mer-gs-head">
        <span className="mer-gs-badge">GETTING STARTED</span>
        <button type="button" className="mer-gs-x" onClick={dismiss} aria-label="Dismiss getting-started card" title="Dismiss">×</button>
      </div>
      <p className="mer-gs-headline">{headline}</p>

      {profile.length > 0 && (
        <div className="mer-gs-profile">
          {profile.map(([k, v]) => (
            <span className="mer-gs-chip" key={k}>
              <span className="mer-gs-chip-k">{prettyKey(k)}</span>
              <span className="mer-gs-chip-v">{prettyVal(v)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Progress: a tabular fraction + a thin bar whose fill animates via
          transform: scaleX (see meridian.css), not width. */}
      <div className="mer-gs-progress">
        <span className="mer-gs-progress-frac" aria-hidden="true">{done} / {total}</span>
        <div
          className="mer-gs-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={`Setup progress: ${done} of ${total} steps done`}
        >
          <span className="mer-gs-bar-fill" style={{ transform: `scaleX(${fraction})` }} />
        </div>
      </div>

      {/* Per-item rows. The check is state-distinct by GLYPH (filled check vs an
          empty ring), not by colour alone. */}
      <ul className="mer-gs-items">
        {checklist.items.map((it) => (
          <li className={it.done ? 'mer-gs-item done' : 'mer-gs-item'} key={it.key}>
            <span className={it.done ? 'mer-gs-check done' : 'mer-gs-check'} aria-hidden="true">
              {it.done ? '✓' : '○'}
            </span>
            <span className="mer-gs-item-body">
              <span className="mer-gs-item-label">{it.label}</span>
              {it.description && <span className="mer-gs-item-desc">{it.description}</span>}
            </span>
            <span className="mer-gs-item-state">{it.done ? 'Done' : 'To do'}</span>
          </li>
        ))}
      </ul>

      {/* Inline AI next-best-step: its `why` + a single primary "Do this" button
          that navigates to action_href (1-click accept). */}
      {next && (
        <div className="mer-gs-ai" aria-label="Suggested next step">
          <div className="mer-gs-ai-body">
            <span className="mer-gs-ai-tag">NEXT BEST STEP</span>
            <p className="mer-gs-ai-why">{next.why}</p>
          </div>
          <button
            type="button"
            className="mer-gs-ai-cta"
            onClick={() => navigate(next.action_href)}
          >
            Do this
          </button>
        </div>
      )}
    </section>
  );
}
