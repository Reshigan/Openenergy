// pages/src/meridian/HorizonPage.tsx — Meridian Horizon board.
// Markup mirrors mockups/meridian/01-horizon.html (header / .main { .board + aside } / .wire);
// styling comes verbatim from meridian.css (scoped under .mer). Data from GET /api/horizon/:role.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './meridian.css';
import { fetchHorizon, BUCKETS, fmtZar, type Bucket, type HorizonData, type MerCase } from './lib';
import { CaseTile } from './components';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';

// Same source LaunchRedirect uses (App.tsx) — the signed-in user from AuthContext.
// ProtectedRoute guarantees a user before this page mounts.
function useRole(): string {
  const { user } = useAuth();
  return user?.role ?? '';
}

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
  const { user } = useAuth();
  const cfg = getRoleConfig(role);
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const nav = useNavigate();

  React.useEffect(() => {
    if (!role) return undefined;
    let live = true;
    fetchHorizon(role).then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
    const t = setInterval(() => {
      fetchHorizon(role).then(d => { if (live) setData(d); }).catch(() => { /* keep last good board */ });
    }, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [role]);

  const laneLabel = (key: string) =>
    cfg?.domains.find(d => d.key === key)?.label ?? key.replace(/_/g, ' ');

  async function act(c: MerCase, path: string) {
    // Duty-stream inline action: POST the existing chain endpoint, then refresh.
    // api has baseURL '/api', so strip the prefix the registry paths carry.
    try {
      await api.post(path.replace('/api', '').replace(':id', c.id), {});
    } catch { /* server rejected the transition; the refresh below shows authoritative state */ }
    try { setData(await fetchHorizon(role)); } catch { /* keep last good board */ }
  }

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Horizon failed to load.{' '}
        <button type="button" className="btn ghost" onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  if (!data) return <div className="mer mer-loading" aria-busy="true">Computing horizon…</div>;

  const now = new Date();
  const clock = `${now.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} · ${now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} SAST`;
  const initials = (user?.name ?? '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';

  return (
    <div className="mer horizon">
      <header>
        <div className="wordmark">MERIDIAN</div>
        <div className="ctx">
          <b>{cfg?.label ?? role}</b>
          <span>{data.counts.total} live · {data.counts.breached} breached</span>
        </div>
        <div className="spacer" />
        <div className="clock mono">{clock}</div>
        <Link className="kbd-hint" to="/atlas">Atlas — search anything <kbd>⌘K</kbd></Link>
        <div className="avatar">{initials}</div>
      </header>

      <div className="main">
        <section className="board" aria-label="Live cases by time to consequence">
          <div className="board-head">
            <div />
            {BUCKETS.map(b => (
              <div key={b.key} className={b.key === 'breached' ? 'bucket-h breach' : 'bucket-h'}>
                {b.label}
                <span className="tick">{bucketTick(b.key, now)}</span>
              </div>
            ))}
          </div>

          {data.lanes.map(lane => {
            const waves = Array.from(new Set(lane.cases.map(c => c.wave))).sort((a, b) => a - b);
            return (
              <div className="lane-row" key={lane.key}>
                <div className="lane-label">
                  {laneLabel(lane.key).toUpperCase()}
                  <span className="n">
                    {waves.map(w => `W${w}`).join(' · ')}{waves.length ? ' · ' : ''}{lane.cases.length} live
                  </span>
                </div>
                {BUCKETS.map(b => (
                  <div className="cell" key={b.key}>
                    {lane.cases.filter(c => c.bucket === b.key).map(c => <CaseTile key={`${c.chain}-${c.id}`} c={c} />)}
                  </div>
                ))}
              </div>
            );
          })}

          {data.lanes.length === 0 && (
            <div className="board-empty">
              No live cases. Initiate work from <Link to="/atlas">Atlas</Link>.
            </div>
          )}
        </section>

        <aside aria-label="Duty stream">
          <div className="duty-head">
            <h2>DUTY STREAM</h2>
            <p>Computed {now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} — ranked by ZAR at risk × time remaining</p>
          </div>
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
                    <button type="button" className="btn ghost" onClick={() => nav(`/thread/${c.chain}/${c.id}`)}>
                      Open thread
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {data.duty.length === 0 && (
              <div className="duty"><div className="rank">·</div><div className="why">Nothing demands action right now.</div></div>
            )}
          </div>
        </aside>
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
