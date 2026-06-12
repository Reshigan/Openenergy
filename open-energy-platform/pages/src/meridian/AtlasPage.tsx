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
import { fetchHorizon, type HorizonData } from './lib';

export default function AtlasPage() {
  // Same source LaunchRedirect uses (App.tsx) — the signed-in user from AuthContext.
  // ProtectedRoute guarantees a user before this page mounts.
  const { user } = useAuth();
  const role = user?.role ?? '';
  const cfg = getRoleConfig(role);
  const [h, setH] = React.useState<HorizonData | null>(null);
  React.useEffect(() => { if (role) fetchHorizon(role).then(setH).catch(() => setH(null)); }, [role]);

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
        {cfg.domains.map(d => (
          <section className="domain" key={d.key}>
            <h2>{d.label.toUpperCase()}</h2>
            {d.features.map(f => {
              const live = f.chainKey ? liveByChain.get(f.chainKey) : undefined;
              return (
                <Link key={f.key} className="fn" to={`${cfg.workstationPath}?tab=${f.key}`}>
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
