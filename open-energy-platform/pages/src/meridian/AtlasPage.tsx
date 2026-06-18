// pages/src/meridian/AtlasPage.tsx — Meridian Atlas: the full per-role function index.
// Markup follows mockups/meridian/03-atlas.html (header / .domains grid of .fn rows);
// styling from meridian.css (scoped under .mer). Frontend-only v1: the function list
// comes from the role config (domains→features) and live counts from one
// fetchHorizon(role) call grouped by chain key — no dedicated /api/atlas endpoint.
import React from 'react';
import './meridian.css';
import { Link } from 'react-router-dom';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { useAuth } from '../lib/useAuth';
import { MeridianHeader } from './MeridianHeader';
import { SURFACE_REGISTRY } from './surfaces';
import { isTileReachable, tileTarget } from './reachability';
import { fetchHorizon, fetchDealTypes, dealLabel, type HorizonData, type DealTypeInfo } from './lib';
import { cleanLabel } from './labels';

export default function AtlasPage() {
  // Same source LaunchRedirect uses (App.tsx) — the signed-in user from AuthContext.
  // ProtectedRoute guarantees a user before this page mounts.
  const { user } = useAuth();
  const role = user?.role ?? '';
  const cfg = getRoleConfig(role);
  const [h, setH] = React.useState<HorizonData | null>(null);
  // Liveness guard (HorizonPage idiom): a late resolve after unmount — or after the
  // role changes — must not setState with the previous request's result.
  React.useEffect(() => {
    if (!role) return undefined;
    let live = true;
    fetchHorizon(role).then(d => { if (live) setH(d); }).catch(() => { if (live) setH(null); });
    return () => { live = false; };
  }, [role]);
  // Deal Desk discoverability — the deal types this role can transact (empty/fail = section hidden).
  const [dealTypes, setDealTypes] = React.useState<DealTypeInfo[]>([]);
  React.useEffect(() => {
    let live = true;
    fetchDealTypes().then(t => { if (live) setDealTypes(t); }).catch(() => { if (live) setDealTypes([]); });
    return () => { live = false; };
  }, []);
  const transactable = dealTypes.filter(t => t.can_offer || t.can_request);
  const dealCap = (t: DealTypeInfo) =>
    t.can_offer && t.can_request ? 'offer · request' : t.can_offer ? 'offer' : 'request';

  const liveByChain = new Map<string, { live: number; breached: number }>();
  for (const lane of h?.lanes ?? []) for (const c of lane.cases) {
    const e = liveByChain.get(c.chain) ?? { live: 0, breached: 0 };
    e.live++; if (c.bucket === 'breached') e.breached++;
    liveByChain.set(c.chain, e);
  }

  if (!cfg) return <div className="mer mer-error" role="alert">Unknown role.</div>;
  // A function is reachable iff it resolves to a chain (/ledger), a mounted page
  // (route), or a per-role Meridian surface — same predicate the render loop uses.
  const hasSurface = (k: string) => !!SURFACE_REGISTRY[k];
  const isReachable = (f: { chainKey?: string; route?: string; key: string }) =>
    isTileReachable(role, f, hasSurface);
  const fnCount = cfg.domains.reduce((n, d) => n + d.features.filter(isReachable).length, 0);

  return (
    <div className="mer atlas">
      <MeridianHeader ctx={<>
        <b>ATLAS — {cleanLabel(cfg.label).toUpperCase()}</b>
        <span className="counts mono">{fnCount} functions · {h?.counts.total ?? 0} live · {h?.counts.breached ?? 0} breached</span>
      </>} />
      <main className="domains">
        {transactable.length > 0 && (
          <section className="domain">
            <h2>DEAL DESK</h2>
            {transactable.map(t => (
              <Link key={t.deal_type} className="fn" to="/deals">
                <span className="name">{dealLabel(t.deal_type)}</span>
                <span className="live mono">{dealCap(t)}</span>
              </Link>
            ))}
          </section>
        )}
        {cfg.domains.map(d => {
          // Reachability filter: a function tile renders only if it resolves to a
          // real destination — a registry chain (/ledger), a mounted standalone
          // page (route), or a per-role Meridian surface (SURFACE_REGISTRY). This
          // makes dead-end tiles structurally impossible and hides prototype menu
          // items that were never built (no chain, no route, no surface).
          const reachable = d.features.filter(isReachable);
          if (reachable.length === 0) return null;
          return (
          <section className="domain" key={d.key}>
            <h2>{cleanLabel(d.label).toUpperCase()}</h2>
            {reachable.map(f => {
              const live = f.chainKey ? liveByChain.get(f.chainKey) : undefined;
              // Chain-backed functions open their Meridian Ledger; functions with a
              // standalone page open that route; everything else opens its per-role
              // Meridian surface (/surface/:key, resolved via SURFACE_REGISTRY).
              const to = tileTarget(role, f, hasSurface) ?? '#';
              return (
                <Link key={f.key} className="fn" to={to}>
                  <span className="name">{cleanLabel(f.label)}</span>
                  {live && <span className="live mono">{live.live} live</span>}
                  {live && live.breached > 0 && <span className="breach mono">{live.breached} ⚠</span>}
                </Link>
              );
            })}
          </section>
          );
        })}
      </main>
    </div>
  );
}
