// pages/src/meridian/AdminHorizon.tsx — bespoke admin Horizon.
// System-wide compliance oversight surface (no mockup — built from real data):
// a quiet-book variant for the admin role. Exceptions-only, performing fades
// to grey. The admin sees every compliance chain that's breaching, ranked by
// urgency, with inline actions to clear each one.
//
// Data (all REAL, scoped to the signed-in admin):
//   • fetchHorizon('admin') → lanes + duty (ranked, with deadline_at,
//     status, counterparty, actions). No quantum_zar (compliance != ZAR risk).
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './meridian.css';
import { fetchHorizon, type Bucket, type HorizonData, type MerAction, type MerCase } from './lib';
import { ActErrorBar } from './components';
import { api } from '../lib/api';
import { MeridianHeader } from './MeridianHeader';
import { HorizonKpis } from './HorizonKpis';
import { GettingStarted } from './GettingStarted';
import { GuidedTour } from './GuidedTour';
import { cleanLabel } from './labels';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import TraderHorizon from './TraderHorizon';
import OfftakerHorizon from './OfftakerHorizon';
import LenderHorizon from './LenderHorizon';
import RegulatorHorizon from './RegulatorHorizon';
import IppHorizon from './IppHorizon';
import GridHorizon from './GridHorizon';
import CarbonHorizon from './CarbonHorizon';
import EscHorizon from './EscHorizon';
import SupportHorizon from './SupportHorizon';

// Bucket rank for sorting (breach first).
const BUCKET_RANK: Record<Bucket, number> = {
  breached: 0, h2: 1, today: 2, h48: 3, week: 4, later: 5,
};

// Cross-role board passthrough. Admin holds no lanes of its own; the backend
// lets admin GET /api/horizon/<any role>, and each bespoke Horizon hardcodes
// its own role in fetchHorizon — so rendering one while signed in as admin
// shows that role's live board. Ordered for the switcher tab strip.
const ROLE_VIEWS: { role: string; Comp: React.ComponentType }[] = [
  { role: 'trader', Comp: TraderHorizon },
  { role: 'offtaker', Comp: OfftakerHorizon },
  { role: 'lender', Comp: LenderHorizon },
  { role: 'regulator', Comp: RegulatorHorizon },
  { role: 'ipp_developer', Comp: IppHorizon },
  { role: 'grid_operator', Comp: GridHorizon },
  { role: 'carbon_fund', Comp: CarbonHorizon },
  { role: 'esco', Comp: EscHorizon },
  { role: 'support', Comp: SupportHorizon },
];

export default function AdminHorizon() {
  const navigate = useNavigate();
  // 'admin' = the compliance desk below; any other value = that role's live
  // board (rendered via ROLE_VIEWS). Lets admin oversee every role's Horizon
  // without leaving its own surface (replaces the legacy HorizonPage switcher).
  const [view, setView] = React.useState('admin');
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (view !== 'admin') return undefined;  // other roles fetch their own board
    let live = true;
    const load = () => fetchHorizon('admin').then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
    load();
    const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [view]);

  async function act(c: MerCase, a: MerAction) {
    if (a.fields?.length) { navigate(`/thread/${c.chain}/${c.id}?act=${encodeURIComponent(a.action)}`); return; }
    if (a.tone === 'oxide' && !window.confirm(`${a.label} — ${c.ref}?\nThis may be hard to reverse.`)) return;
    const key = `${c.id}:${a.action}`;
    setActing(key);
    try { await api.post(a.path.replace('/api', '').replace(':id', c.id), {}); setActErr(null); }
    catch (e: any) { setActErr(e?.response?.data?.error ?? e?.message ?? 'Action failed'); }
    finally { setActing(null); }
    try { setData(await fetchHorizon('admin')); } catch { /* keep last */ }
  }

  // Cross-role switcher — sits above whichever board is in view. 'Compliance'
  // is admin's own desk; the rest deep-view each lane-role's live Horizon.
  const switcher = (
    <nav className="mer" aria-label="View board as role">
      <div className="role-switch" role="group">
        <button type="button"
                className={view === 'admin' ? 'btn pri' : 'btn ghost'}
                aria-pressed={view === 'admin'}
                onClick={() => setView('admin')}>
          Compliance
        </button>
        {ROLE_VIEWS.map(({ role }) => (
          <button key={role} type="button"
                  className={view === role ? 'btn pri' : 'btn ghost'}
                  aria-pressed={view === role}
                  onClick={() => { if (view !== role) { setView(role); setErr(null); } }}>
            {cleanLabel(getRoleConfig(role)?.label ?? role.replace(/_/g, ' '))}
          </button>
        ))}
      </div>
    </nav>
  );

  // Non-admin view: render that role's real bespoke Horizon under the switcher.
  // Each hardcodes its own fetchHorizon(role); admin reaches it via passthrough.
  if (view !== 'admin') {
    const Comp = ROLE_VIEWS.find(v => v.role === view)!.Comp;
    return <>{switcher}<Comp /></>;
  }

  if (err) {
    return (
      <>{switcher}
        <div className="mer mer-error" role="alert">
          Desk failed to load.{' '}
          <button type="button" className="btn ghost" onClick={() => location.reload()}>Retry</button>
        </div>
      </>
    );
  }
  if (!data) {
    return (
      <>{switcher}
        <div className="mer horizon">
          <div className="main" aria-busy="true" role="status" aria-label="Loading your desk">
            <div className="skel skel-card" style={{ height: 160, marginBottom: 16 }} />
            <div className="skel skel-card" style={{ height: 360 }} />
          </div>
        </div>
      </>
    );
  }

  const { lanes, duty, counts } = data;

  // Exceptions = duty (already ranked by score = urgency).
  const exceptions = [...duty].sort((a, b) => BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket]);
  const performing = counts.total - counts.breached;

  // Lane summary.
  const laneRows = lanes.map(l => {
    const br = l.cases.filter(c => c.bucket === 'breached').length;
    const zar = l.cases.reduce((s, c) => s + (c.quantum_zar || 0), 0);
    return { key: l.key, n: l.cases.length, br, zar };
  });
  const maxLaneN = Math.max(1, ...laneRows.map(r => r.n));

  const headline = counts.breached > 0
    ? <>Your system holds <span className="ad-num bad">{counts.breached}</span> compliance chain{counts.breached === 1 ? '' : 's'} that have crossed their SLA.</>
    : <>Your system is compliant — <span className="ad-num ok">{counts.total}</span> live chain{counts.total === 1 ? '' : 's'}, nothing breaching.</>;
  const subtext = counts.breached > 0
    ? `${counts.breached} chain${counts.breached === 1 ? '' : 's'} have crossed their SLA and sit in the exceptions list below, ranked by urgency. Everything else is performing and deliberately recedes.`
    : `${counts.total} live chain${counts.total === 1 ? '' : 's'} across ${lanes.length} lanes, all within their windows. Anything that breaches surfaces in the exceptions list the moment it crosses.`;

  return (
    <>{switcher}
    <div className="mer horizon ad">
      <MeridianHeader ctx={<><b>Admin</b><span>{counts.total} live · {counts.breached} breaching</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="admin" />

      <section className="ad-board" aria-label="Admin compliance desk">
        <div className="ad-hero">
          <div className="oh-eyebrow">YOUR DESK · compliance oversight</div>
          <h2 className="ad-hero-title hd-serif">{headline}</h2>
          <p className="ad-hero-sub">{subtext}</p>
        </div>

        {/* ── quiet book ── */}
        <div className="ad-quiet">
          <div className="ad-lanes" aria-label="Compliance lanes">
            {laneRows.map(r => (
              <div key={r.key} className="ad-lane">
                <div className="ad-lane-name hd-serif">{cleanLabel(r.key.replace(/_/g, ' '))}</div>
                <div className="ad-lane-bar">
                  <div
                    className="ad-lane-fill"
                    style={{
                      width: `${(r.n / maxLaneN) * 100}%`,
                      background: r.br > 0 ? 'var(--oxide)' : 'var(--line)',
                    }}
                  ></div>
                </div>
                <div className="ad-lane-meta oh-mono">
                  {r.n} live{r.br ? ` · ${r.br}!` : ''}
                </div>
              </div>
            ))}
          </div>

          <div className="ad-exc-card" aria-label="Compliance exceptions">
            <ActErrorBar error={actErr} onDismiss={() => setActErr(null)} />
            <div className="ad-exc-list">
              {exceptions.map(c => {
                const isOverdue = c.bucket === 'breached';
                return (
                  <div key={c.id} className={`ad-exc-row ${isOverdue ? 'hot' : ''}`}>
                    <div className="ad-exc-body">
                      <div className="ad-exc-title hd-serif">{cleanLabel(c.title)}</div>
                      <div className="ad-exc-meta oh-mono">
                        {c.ref} · {cleanLabel(c.status.replace(/_/g, ' '))}
                        {c.counterparty && ` · ${c.counterparty}`}
                      </div>
                    </div>
                    <div className="ad-exc-acts">
                      {c.actions.slice(0, 2).map(a => {
                        const key = `${c.id}:${a.action}`;
                        const busy = acting === key;
                        return (
                          <button key={a.action} type="button"
                            className={a.tone === 'oxide' ? 'btn ox' : 'btn pri'}
                            title={a.fields?.length ? `${a.cascadeHint} — opens the form` : a.cascadeHint}
                            disabled={acting !== null}
                            aria-busy={busy || undefined}
                            onClick={() => act(c, a)}>
                            {busy ? '…' : a.fields?.length ? `${a.label}…` : a.label}
                          </button>
                        );
                      })}
                      <Link className="btn ghost" to={`/thread/${c.chain}/${c.id}`}>Case</Link>
                    </div>
                  </div>
                );
              })}
              {exceptions.length === 0 && (
                <div className="ad-quiet-empty">
                  <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                  <span><b>Nothing needs you.</b> Every chain is within its SLA window.</span>
                </div>
              )}
            </div>
          </div>

          <div className="ad-reassure oh-mono">
            <span className="ad-reassure-mark" aria-hidden="true">—</span>
            <span>
              {performing} performing chain{performing === 1 ? '' : 's'} are within their windows and deliberately recede.
              They're in your <Link to="/atlas">ledger</Link> when you need them — not in your face when you don't.
            </span>
          </div>
        </div>
      </section>
    </div>
    </>
  );
}