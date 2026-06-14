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
import { fetchHorizon, fetchDealTypes, dealLabel, type HorizonData, type DealTypeInfo } from './lib';

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
  const fnCount = cfg.domains.reduce((n, d) => n + d.features.length, 0);

  return (
    <div className="mer atlas">
      <header className="mer-head">
        <Link to="/horizon" className="back">← Horizon</Link>
        <span className="wordmark">ATLAS — {cfg.label.toUpperCase()}</span>
        <span className="counts mono">{fnCount} functions · {h?.counts.total ?? 0} live · {h?.counts.breached ?? 0} breached</span>
      </header>
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
        {cfg.domains.map(d => (
          <section className="domain" key={d.key}>
            <h2>{d.label.toUpperCase()}</h2>
            {d.features.map(f => {
              const live = f.chainKey ? liveByChain.get(f.chainKey) : undefined;
              // Chain-backed functions open their Meridian Ledger; non-chain
              // functions stay on the legacy workstation tab (coexistence).
              const to = f.chainKey ? `/ledger/${f.chainKey}` : `${cfg.workstationPath}?tab=${f.key}`;
              return (
                <Link key={f.key} className="fn" to={to}>
                  <span className="name">{f.label}</span>
                  {live && <span className="live mono">{live.live} live</span>}
                  {live && live.breached > 0 && <span className="breach mono">{live.breached} ⚠</span>}
                </Link>
              );
            })}
          </section>
        ))}
      </main>
    </div>
  );
}
