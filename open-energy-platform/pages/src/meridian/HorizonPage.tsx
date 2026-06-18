// pages/src/meridian/HorizonPage.tsx — Meridian Horizon board.
// Markup mirrors mockups/meridian/01-horizon.html (header / .main { .board + aside } / .wire);
// styling comes verbatim from meridian.css (scoped under .mer). Data from GET /api/horizon/:role.
import React from 'react';
import { Link } from 'react-router-dom';
import './meridian.css';
import { fetchHorizon, singleChainOf, BUCKETS, fmtZar, type Bucket, type HorizonData, type MerCase } from './lib';
import { CaseTile } from './components';
import { MeridianHeader } from './MeridianHeader';
import { GettingStarted } from './GettingStarted';
import { cleanLabel } from './labels';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';

// Same source LaunchRedirect uses (App.tsx) — the signed-in user from AuthContext.
// ProtectedRoute guarantees a user before this page mounts.
function useRole(): string {
  const { user } = useAuth();
  return user?.role ?? '';
}

// Lane-holding roles for the admin role-switcher: unique roles across all chain
// lanes in src/utils/chain-registry-meridian.ts (backend), sorted. Admin has no
// lanes of its own; the backend lets admin GET /api/horizon/<any role>.
// Keep in sync with the registry (same convention as Bucket in ./lib.ts).
const LANE_ROLES = [
  'carbon_fund', 'epc_contractor', 'esco', 'grid_operator', 'ipp_developer',
  'lender', 'offtaker', 'regulator', 'support', 'trader',
];

// Bucket sub-ticks, computed against "now" like the mockup's static examples.
function bucketTick(key: Bucket, now: Date): string {
  const fmtT = (d: Date) => d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const fmtD = (d: Date) => d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' });
  switch (key) {
    case 'breached': return 'consequence running';
    case 'h2':       return `before ${fmtT(new Date(now.getTime() + 2 * 3600_000))}`;
    case 'today':    return 'before 17:00';
    case 'h48':      return `by ${fmtD(new Date(now.getTime() + 48 * 3600_000))}`;
    case 'week':     return `by ${fmtD(new Date(now.getTime() + 7 * 86400_000))}`;
    case 'later':    return '> 7 days';
  }
}

export default function HorizonPage() {
  const role = useRole();
  // Admin holds no Meridian lanes — it views any role's board via the backend
  // passthrough. Non-admin roles always view their own board (boardRole === role).
  const isAdmin = role === 'admin';
  const [adminRole, setAdminRole] = React.useState(LANE_ROLES[0]);
  const boardRole = isAdmin ? adminRole : role;
  const cfg = getRoleConfig(boardRole);
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  // Duty-stream collapse — persisted so the operator's choice survives a reload
  // and the 60s board refresh. The aside is a fixed 348px grid column; collapsed,
  // it yields a slim reopen rail and gives the board the full width.
  const [dutyCollapsed, setDutyCollapsed] = React.useState(
    () => localStorage.getItem('mer.duty.collapsed') === '1',
  );
  const toggleDuty = React.useCallback(() => {
    setDutyCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('mer.duty.collapsed', next ? '1' : '0'); } catch { /* non-fatal */ }
      return next;
    });
  }, []);

  // Per-lane collapse — a role like ipp_developer holds 14 lanes; collapsing tames
  // the wall to the lanes the operator is working. Persisted as a key list so the
  // choice survives reload and the 60s refresh (same idiom as dutyCollapsed).
  const [collapsedLanes, setCollapsedLanes] = React.useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem('mer.lanes.collapsed') || '[]')); }
    catch { return new Set<string>(); }
  });
  const toggleLane = React.useCallback((key: string) => {
    setCollapsedLanes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem('mer.lanes.collapsed', JSON.stringify([...next])); } catch { /* non-fatal */ }
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!boardRole) return undefined;
    let live = true;
    fetchHorizon(boardRole).then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
    const t = setInterval(() => {
      fetchHorizon(boardRole).then(d => { if (live) setData(d); }).catch(() => { /* keep last good board */ });
    }, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [boardRole]);

  const laneLabel = (key: string) =>
    cfg?.domains.find(d => d.key === key)?.label ?? key.replace(/_/g, ' ');

  async function act(c: MerCase, path: string) {
    // Duty-stream inline action: POST the existing chain endpoint, then refresh.
    // api has baseURL '/api', so strip the prefix the registry paths carry.
    try {
      await api.post(path.replace('/api', '').replace(':id', c.id), {});
      setActErr(null);
    } catch (e: any) {
      // State machines return 409 with a reason for invalid transitions —
      // surface it; the refresh below still shows authoritative state.
      setActErr(e?.response?.data?.error ?? e?.message ?? 'Action failed');
    }
    try { setData(await fetchHorizon(boardRole)); } catch { /* keep last good board */ }
  }

  // Admin-only: compact switcher across the lane-holding roles' boards.
  const roleSwitcher = isAdmin && (
    <div className="role-switch" role="group" aria-label="View board as role">
      {LANE_ROLES.map(r => (
        <button key={r} type="button"
                className={r === adminRole ? 'btn pri' : 'btn ghost'}
                aria-pressed={r === adminRole}
                onClick={() => { if (r !== adminRole) { setAdminRole(r); setData(null); setActErr(null); } }}>
          {cleanLabel(getRoleConfig(r)?.label ?? r.replace(/_/g, ' '))}
        </button>
      ))}
    </div>
  );

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Horizon failed to load.{' '}
        <button type="button" className="btn ghost" onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mer horizon">
        {roleSwitcher}
        <div className="main" aria-busy="true" role="status" aria-label="Computing horizon">
          <section className="board" style={{ padding: '8px 0' }}>
            {[0, 1, 2, 3].map(r => (
              <div key={r} style={{ marginBottom: 18 }}>
                <div className="skel skel-line lg" style={{ width: `${28 - r * 4}%` }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[0, 1, 2, 3].map(col => <div key={col} className="skel skel-card" />)}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="mer horizon">
      <MeridianHeader ctx={<><b>{cleanLabel(cfg?.label ?? boardRole)}</b><span>{data.counts.total} live · {data.counts.breached} breached</span></>} />

      <GettingStarted />

      {roleSwitcher}

      <div className={dutyCollapsed ? 'main duty-collapsed' : 'main'}>
        <section className="board" aria-label="Live cases by time to consequence">
          <div className="board-head">
            <Link to="/new" className="board-new" title="Start a new transaction">+ New transaction</Link>
            {BUCKETS.map(b => (
              <div key={b.key} className={b.key === 'breached' ? 'bucket-h breach' : 'bucket-h'}>
                {b.label}
                <span className="tick">{bucketTick(b.key, now)}</span>
              </div>
            ))}
          </div>

          {data.lanes.map(lane => {
            const collapsed = collapsedLanes.has(lane.key);
            const breached = lane.cases.filter(c => c.bucket === 'breached').length;
            // A lane whose cases all belong to one chain gets a clickable label
            // that deep-links to that chain's Ledger (the headline "labels aren't
            // clickable" complaint). The chevron splits off into its own toggle so
            // collapse and navigate are distinct targets. Mixed/empty lanes keep the
            // single all-button header (no single Ledger to point at).
            const laneChain = singleChainOf(lane.cases);
            const laneText = cleanLabel(laneLabel(lane.key)).toUpperCase();
            const laneCount = `${lane.cases.length} live${breached ? ` · ${breached} breached` : ''}`;
            return (
              <div className="lane-row" key={lane.key}>
                {laneChain ? (
                  <div className={collapsed ? 'lane-label lane-label-split collapsed' : 'lane-label lane-label-split'}>
                    <button type="button" className="lane-chev-btn"
                            aria-expanded={!collapsed}
                            aria-label={collapsed ? 'Expand lane' : 'Collapse lane'}
                            title={collapsed ? 'Expand lane' : 'Collapse lane'}
                            onClick={() => toggleLane(lane.key)}>
                      <span className="lane-chev" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                    </button>
                    <Link to={`/ledger/${laneChain}`} className="lane-label-link" title={`Open ${laneText} ledger`}>
                      {laneText}
                      <span className="n">{laneCount}</span>
                    </Link>
                  </div>
                ) : (
                  <button type="button"
                          className={collapsed ? 'lane-label collapsed' : 'lane-label'}
                          aria-expanded={!collapsed}
                          title={collapsed ? 'Expand lane' : 'Collapse lane'}
                          onClick={() => toggleLane(lane.key)}>
                    <span className="lane-chev" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                    {laneText}
                    <span className="n">{laneCount}</span>
                  </button>
                )}
                {collapsed ? (
                  <button type="button" className="lane-collapsed-summary" onClick={() => toggleLane(lane.key)}>
                    {lane.cases.length} case{lane.cases.length === 1 ? '' : 's'}{breached ? ` · ${breached} breached` : ''} — click to expand
                  </button>
                ) : BUCKETS.map(b => (
                  <div className="cell" key={b.key}>
                    {lane.cases.filter(c => c.bucket === b.key).map(c => <CaseTile key={`${c.chain}-${c.id}`} c={c} />)}
                  </div>
                ))}
              </div>
            );
          })}

          {data.lanes.length === 0 && (
            <div className="board-empty">
              <p>No live cases yet.</p>
              <Link to="/new" className="btn pri">+ Start a transaction</Link>
              <p className="board-empty-sub">or browse every function in <Link to="/atlas">Atlas</Link>.</p>
            </div>
          )}
        </section>

        <aside className={dutyCollapsed ? 'collapsed' : undefined} aria-label="Duty stream">
          <div className="duty-head">
            <button type="button" className="duty-collapse" onClick={toggleDuty}
                    aria-label="Collapse duty stream" title="Collapse duty stream">›</button>
            <h2>DUTY STREAM</h2>
            <p>Computed {now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} — ranked by ZAR at risk × time remaining</p>
          </div>
          {actErr && (
            <div className="act-error" role="alert">
              <span>{actErr}</span>
              <button type="button" className="btn ghost" onClick={() => setActErr(null)}>Dismiss</button>
            </div>
          )}
          <div className="duty-list">
            {data.duty.map((c, i) => (
              <div key={c.id} className={c.bucket === 'breached' ? 'duty ox' : 'duty'}>
                <div className="rank">{i + 1}</div>
                <div>
                  <h3>{c.title}</h3>
                  <div className="why">
                    <span className="mono">{c.ref}</span>
                    {c.quantum_zar != null && <> · <span className="mono">{fmtZar(c.quantum_zar)}</span></>}
                    {c.bucket === 'breached' && <> · <span className="due-ox">SLA breached</span></>}
                  </div>
                  <div className="acts">
                    {c.actions.slice(0, 2).map(a => (
                      <button
                        type="button"
                        key={a.action}
                        className={a.tone === 'oxide' ? 'btn ox' : 'btn pri'}
                        title={a.cascadeHint}
                        onClick={() => act(c, a.path)}
                      >
                        {a.label}
                      </button>
                    ))}
                    <Link className="btn ghost" to={`/thread/${c.chain}/${c.id}`}>
                      Open thread
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            {data.duty.length === 0 && (
              <div className="duty"><div className="rank">·</div><div className="why">Nothing demands action right now.</div></div>
            )}
          </div>
        </aside>

        {dutyCollapsed && (
          <button type="button" className="duty-rail" onClick={toggleDuty}
                  aria-label="Expand duty stream" title="Expand duty stream">
            <span className="chev" aria-hidden="true">‹</span>
            <span className="lbl">DUTY STREAM</span>
            {data.counts.breached > 0 && <span className="dot" aria-hidden="true" />}
          </button>
        )}
      </div>

      {data.duty.length > 0 && (
        <div className="wire" aria-label="Live cascade wire">
          <div className="wire-label"><span className="pulse" />THE WIRE</div>
          <div className="wire-feed">
            {data.duty.slice(0, 6).map(c => (
              <span key={c.id}>
                <b>{c.ref}</b> {c.title}{c.quantum_zar != null && <> (<b>{fmtZar(c.quantum_zar)}</b>)</>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
