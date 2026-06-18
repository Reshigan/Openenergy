// pages/src/meridian/GettingStarted.tsx — post-onboarding "what next" card.
// Renders the getting-started MANIFEST that the onboarding-provisioning cascade
// writes to oe_onboarding_provisioning_log (returned by GET /api/onboarding/state
// as data.manifest). Directly answers the headline complaint — "its very
// difficult for an ipp to go through a journey" — by handing the new operator a
// headline, a profile recap, and 3+ guaranteed-valid clickable next steps.
//
// Lifecycle:
//   • Shows only when a manifest exists AND it hasn't been dismissed (per-user
//     localStorage flag) — so it appears once, after onboarding, then gets out
//     of the way.
//   • The provisioning cascade runs async via the queue, so right after
//     onboarding the manifest may not be written yet. When the page is opened
//     with ?welcome=1 we poll a few times while it settles.
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import './meridian.css';

type NextAction = { key: string; label: string; route: string; description?: string };
type Manifest = {
  headline: string;
  profile_summary?: Record<string, unknown>;
  next_actions?: NextAction[];
};

function dismissKey(userId: string | undefined): string {
  return `oe_gs_dismissed_${userId ?? 'anon'}`;
}

// Turn snake_case profile keys into readable chips ("trading_desk_name" → "Trading desk name").
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
  const location = useLocation();
  const welcome = new URLSearchParams(location.search).get('welcome') === '1';

  const [manifest, setManifest] = React.useState<Manifest | null>(null);
  const [dismissed, setDismissed] = React.useState<boolean>(() => {
    try { return localStorage.getItem(dismissKey(user?.id)) === '1'; } catch { return false; }
  });

  React.useEffect(() => {
    if (!user || dismissed) return undefined;
    let live = true;
    // When arriving fresh from onboarding (?welcome=1) the manifest may still be
    // settling on the queue — retry a handful of times. Otherwise a single read.
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
        .catch(() => { /* leave card hidden on error */ });
    };
    poll();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [user, dismissed, welcome]);

  if (dismissed || !manifest) return null;

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(user?.id), '1'); } catch { /* private mode */ }
    setDismissed(true);
  };

  const profile = Object.entries(manifest.profile_summary ?? {});
  const actions = manifest.next_actions ?? [];

  return (
    <section className="mer-gs" aria-label="Getting started">
      <div className="mer-gs-head">
        <span className="mer-gs-badge">GETTING STARTED</span>
        <button type="button" className="mer-gs-x" onClick={dismiss} aria-label="Dismiss getting-started card" title="Dismiss">×</button>
      </div>
      <p className="mer-gs-headline">{manifest.headline}</p>

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

      {actions.length > 0 && (
        <div className="mer-gs-actions">
          {actions.map((a) => (
            <Link className="mer-gs-action" key={a.key} to={a.route}>
              <span className="mer-gs-action-label">{a.label}</span>
              {a.description && <span className="mer-gs-action-desc">{a.description}</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
