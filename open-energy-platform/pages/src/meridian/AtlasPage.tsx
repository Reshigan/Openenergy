// pages/src/meridian/AtlasPage.tsx — Meridian Atlas, Hybrid layout (platform-ease P3).
// Was a flat exhaustive grid where every function was an equal-weight row. Now:
//   1. Search — filters the whole library inline; ⌘K opens the global command palette.
//   2. YOUR WORK — a prioritised strip (pinned + live + recent), ranked urgency-first
//      via the Ease atRisk key, so the few things that matter sit up top, calm.
//   3. Library — the full per-role function index as collapsed domain accordions; the
//      long tail is one tap (or one keystroke) away, not a wall.
// Pins/hidden persist per user via the Ease customisation engine (useViewPrefs('atlas')).
// Data unchanged: role config (domains→features) + one fetchHorizon(role) for live counts.
import React from 'react';
import './meridian.css';
import { Link, useNavigate } from 'react-router-dom';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { useAuth } from '../lib/useAuth';
import { MeridianHeader } from './MeridianHeader';
import { GuidedTour } from './GuidedTour';
import { SURFACE_REGISTRY } from './surfaces';
import { isTileReachable, tileTarget } from './reachability';
import { fetchHorizon, fetchDealTypes, dealLabel, type HorizonData, type DealTypeInfo } from './lib';
import { cleanLabel } from './labels';
import { useViewPrefs } from './ease/useViewPrefs';

const RECENTS_KEY = 'mer.atlas.recents';
function getRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; }
}
function pushRecent(key: string) {
  try {
    const r = getRecents().filter((k) => k !== key);
    r.unshift(key);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(r.slice(0, 8)));
  } catch { /* non-fatal */ }
}

type Feat = {
  key: string; label: string; to: string;
  domainKey: string; domainLabel: string;
  live: number; breached: number;
};

export default function AtlasPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const cfg = getRoleConfig(role);
  const navigate = useNavigate();
  const { prefs, togglePin, toggleHidden, isPinned, isHidden } = useViewPrefs('atlas');

  const [h, setH] = React.useState<HorizonData | null>(null);
  React.useEffect(() => {
    if (!role) return undefined;
    let live = true;
    fetchHorizon(role).then((d) => { if (live) setH(d); }).catch(() => { if (live) setH(null); });
    return () => { live = false; };
  }, [role]);

  const [dealTypes, setDealTypes] = React.useState<DealTypeInfo[]>([]);
  React.useEffect(() => {
    let live = true;
    fetchDealTypes().then((t) => { if (live) setDealTypes(t); }).catch(() => { if (live) setDealTypes([]); });
    return () => { live = false; };
  }, []);
  const transactable = dealTypes.filter((t) => t.can_offer || t.can_request);
  const dealCap = (t: DealTypeInfo) =>
    t.can_offer && t.can_request ? 'offer · request' : t.can_offer ? 'offer' : 'request';

  const [q, setQ] = React.useState('');
  const [openDomains, setOpenDomains] = React.useState<Set<string>>(new Set());
  const toggleDomain = (k: string) => setOpenDomains((prev) => {
    const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next;
  });

  const liveByChain = new Map<string, { live: number; breached: number }>();
  for (const lane of h?.lanes ?? []) for (const c of lane.cases) {
    const e = liveByChain.get(c.chain) ?? { live: 0, breached: 0 };
    e.live++; if (c.bucket === 'breached') e.breached++;
    liveByChain.set(c.chain, e);
  }

  if (!cfg) return <div className="mer mer-error" role="alert">Unknown role.</div>;

  const hasSurface = (k: string) => !!SURFACE_REGISTRY[k];
  const isReachable = (f: { chainKey?: string; route?: string; key: string }) =>
    isTileReachable(role, f, hasSurface);

  // Flat reachable catalogue with live counts + destination.
  const catalogue: Feat[] = [];
  for (const d of cfg.domains) for (const f of d.features) {
    if (!isReachable(f)) continue;
    const lv = f.chainKey ? liveByChain.get(f.chainKey) : undefined;
    catalogue.push({
      key: f.key, label: cleanLabel(f.label), to: tileTarget(role, f, hasSurface) ?? '#',
      domainKey: d.key, domainLabel: cleanLabel(d.label),
      live: lv?.live ?? 0, breached: lv?.breached ?? 0,
    });
  }
  const fnCount = catalogue.length;
  const nothing = fnCount === 0 && transactable.length === 0;

  const visible = catalogue.filter((c) => !isHidden(c.key));
  const recents = getRecents();
  const query = q.trim().toLowerCase();
  const matches = query ? visible.filter((c) => c.label.toLowerCase().includes(query)) : null;

  // YOUR WORK: pinned ∪ live ∪ recent, ranked pinned→breached→live→recency, capped.
  const yourWork = visible
    .filter((c) => isPinned(c.key) || c.live > 0 || recents.includes(c.key))
    .sort((a, b) => {
      const pa = isPinned(a.key) ? 0 : 1, pb = isPinned(b.key) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (b.breached !== a.breached) return b.breached - a.breached;
      if (b.live !== a.live) return b.live - a.live;
      const ra = recents.indexOf(a.key), rb = recents.indexOf(b.key);
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    })
    .slice(0, 12);

  const hiddenCount = catalogue.length - visible.length;

  const Card = ({ c }: { c: Feat }) => (
    <div className={c.breached > 0 ? 'atlas-card hot' : 'atlas-card'}>
      <Link className="atlas-card-main" to={c.to} onClick={() => pushRecent(c.key)}>
        <span className="atlas-card-name">{c.label}</span>
        <span className="atlas-card-meta mono">
          {c.live > 0 ? `${c.live} live` : 'open'}{c.breached > 0 ? ` · ${c.breached} ⚠` : ''}
        </span>
      </Link>
      <button
        type="button"
        className={isPinned(c.key) ? 'atlas-pin on' : 'atlas-pin'}
        aria-pressed={isPinned(c.key)}
        title={isPinned(c.key) ? 'Unpin from Your Work' : 'Pin to Your Work'}
        onClick={() => togglePin(c.key)}
      >★</button>
    </div>
  );

  return (
    <div className="mer atlas">
      <MeridianHeader ctx={<>
        <b>ATLAS — {cleanLabel(cfg.label).toUpperCase()}</b>
        <span className="counts mono">{fnCount} functions · {h?.counts.total ?? 0} live · {h?.counts.breached ?? 0} overdue</span>
      </>} />
      <GuidedTour surface="atlas" />

      <main className="atlas-main">
        {nothing && (
          <div className="lcard-empty">
            No functions are wired for your role yet. Your live work still lands on{' '}
            <Link to="/horizon">Horizon</Link>.
          </div>
        )}

        {!nothing && (
          <div className="atlas-search">
            <span className="atlas-search-icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search functions, records…"
              aria-label="Search functions"
            />
            <span className="atlas-search-kbd mono" aria-hidden="true">⌘K for commands</span>
          </div>
        )}

        {/* Search results — flat, replaces the browse layout while typing. */}
        {matches && (
          <section className="atlas-results">
            <h2>{matches.length} result{matches.length === 1 ? '' : 's'}</h2>
            {matches.length === 0
              ? <p className="atlas-empty-note">Nothing matches “{q}”. Try fewer letters, or ⌘K for live records.</p>
              : <div className="atlas-cards">{matches.map((c) => <Card key={c.key} c={c} />)}</div>}
          </section>
        )}

        {/* Browse layout — only when not searching. */}
        {!matches && (
          <>
            {transactable.length > 0 && (
              <section className="atlas-block">
                <h2>DEAL DESK</h2>
                <div className="atlas-cards">
                  {transactable.map((t) => (
                    <div className="atlas-card" key={t.deal_type}>
                      <Link className="atlas-card-main" to="/deals">
                        <span className="atlas-card-name">{dealLabel(t.deal_type)}</span>
                        <span className="atlas-card-meta mono">{dealCap(t)}</span>
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {yourWork.length > 0 && (
              <section className="atlas-block">
                <h2>YOUR WORK</h2>
                <p className="atlas-block-sub">Pinned, recent, and anything live — ranked by what needs you soonest.</p>
                <div className="atlas-cards">{yourWork.map((c) => <Card key={c.key} c={c} />)}</div>
              </section>
            )}

            <section className="atlas-block">
              <h2>LIBRARY</h2>
              <div className="atlas-lib">
                {cfg.domains.map((d) => {
                  const feats = visible.filter((c) => c.domainKey === d.key);
                  if (feats.length === 0) return null;
                  const open = openDomains.has(d.key);
                  const breached = feats.reduce((n, c) => n + c.breached, 0);
                  return (
                    <div className="atlas-acc" key={d.key}>
                      <button type="button" className="atlas-acc-head" aria-expanded={open} onClick={() => toggleDomain(d.key)}>
                        <span className="atlas-acc-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
                        {cleanLabel(d.label).toUpperCase()}
                        <span className="atlas-acc-n mono">{feats.length}{breached > 0 ? ` · ${breached} ⚠` : ''}</span>
                      </button>
                      {open && (
                        <div className="atlas-acc-body">
                          {feats.map((c) => (
                            <div className="fn" key={c.key}>
                              <Link className="name" to={c.to} onClick={() => pushRecent(c.key)}>{c.label}</Link>
                              {c.live > 0 && <span className="live mono">{c.live} live</span>}
                              {c.breached > 0 && <span className="breach mono">{c.breached} ⚠</span>}
                              <button
                                type="button"
                                className={isPinned(c.key) ? 'atlas-pin on' : 'atlas-pin'}
                                aria-pressed={isPinned(c.key)}
                                title={isPinned(c.key) ? 'Unpin' : 'Pin to Your Work'}
                                onClick={() => togglePin(c.key)}
                              >★</button>
                              <button
                                type="button" className="atlas-hide"
                                title="Hide from Atlas"
                                onClick={() => toggleHidden(c.key)}
                              >×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {hiddenCount > 0 && (
                <button
                  type="button" className="atlas-show-hidden"
                  onClick={() => prefs.hidden.forEach((k) => toggleHidden(k))}
                  title="Unhide all hidden functions"
                >Show {hiddenCount} hidden</button>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
