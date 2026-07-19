// pages/src/meridian/NewPage.tsx — Meridian "Start a transaction" picker.
// The IPP-journey entry point: instead of hunting the right Ledger, an operator
// opens one screen that lists every workflow their role can START, grouped by
// domain, and clicks to land straight in the initiation form. Each tile links to
// /ledger/:chainKey?compose=1 — LedgerPage opens its +New drawer when the backend
// confirms the role may initiate that chain (else the operator sees the case list).
// Source is the role config (domains→features with a chainKey) — same registry
// Atlas + the command palette use; live counts come from one fetchHorizon(role) call.
import React from 'react';
import './meridian.css';
import { Link } from 'react-router-dom';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { useAuth } from '../lib/useAuth';
import { MeridianHeader } from './MeridianHeader';
import { cleanLabel } from './labels';
import { fetchHorizon, type HorizonData } from '../shared/lib';

export default function NewPage() {
  // ProtectedRoute guarantees a signed-in user before this page mounts.
  const { user } = useAuth();
  const role = user?.role ?? '';
  const cfg = getRoleConfig(role);
  const [h, setH] = React.useState<HorizonData | null>(null);
  // Liveness guard (HorizonPage idiom): a late resolve after unmount/role switch
  // must not setState with the previous request's result.
  React.useEffect(() => {
    if (!role) return undefined;
    let live = true;
    fetchHorizon(role).then(d => { if (live) setH(d); }).catch(() => { if (live) setH(null); });
    return () => { live = false; };
  }, [role]);

  const liveByChain = new Map<string, number>();
  for (const lane of h?.lanes ?? []) for (const c of lane.cases) {
    liveByChain.set(c.chain, (liveByChain.get(c.chain) ?? 0) + 1);
  }

  if (!cfg) return <div className="mer mer-error" role="alert">Unknown role.</div>;

  // Only chain-backed features can be initiated — those resolve to a Ledger that may
  // carry an initiation action. Non-chain functions (reports, dashboards) are not
  // "transactions to start" and belong on Atlas, not here.
  const domains = cfg.domains
    .map(d => ({ ...d, startable: d.features.filter(f => f.chainKey) }))
    .filter(d => d.startable.length > 0);
  const total = domains.reduce((n, d) => n + d.startable.length, 0);

  return (
    <div className="mer atlas new-txn">
      <MeridianHeader ctx={<>
        <b>START A TRANSACTION — {cleanLabel(cfg.label).toUpperCase()}</b>
        <span className="counts mono">{total} workflows</span>
      </>} />
      <main className="domains">
        {total === 0 ? (
          <div className="board-empty">
            No initiable workflows for this role. Browse the full function index in <Link to="/atlas">Atlas</Link>.
          </div>
        ) : domains.map(d => (
          <section className="domain" key={d.key}>
            <h2>{cleanLabel(d.label).toUpperCase()}</h2>
            {d.startable.map(f => {
              const live = liveByChain.get(f.chainKey!);
              return (
                <Link key={f.key} className="fn" to={`/ledger/${f.chainKey}?compose=1`}>
                  <span className="name">
                    {cleanLabel(f.label)}
                    {f.description && <span className="fn-desc">{cleanLabel(f.description)}</span>}
                  </span>
                  <span className="live mono">{live ? `${live} live · ` : ''}start →</span>
                </Link>
              );
            })}
          </section>
        ))}
      </main>
    </div>
  );
}
