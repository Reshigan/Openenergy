// pages/src/meridian/JourneyCockpit.tsx — the ONE journey-shaped workspace.
// Collapses Horizon/Atlas/Ledger/Thread/Deal-Desk into a single surface organised
// by journeys (outcomes). First layout: top journey tabs + light workspace.
//   • Today  — cross-journey priority (the old Horizon duty stream).
//   • Journey — its live items (cases whose chain is in the journey) + the journey's
//     tools + "Start › New X"; an item expands IN PLACE (folds the old Thread).
// Reads /api/journey-config governance: hides 'unavailable', badges 'required',
// shows a charge on charged features. Custom icons (no emoji); Substation styling.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './meridian.css';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { getJourneys } from './journeys';
import { Icon } from './icons';
import { fetchHorizon, fmtZar, type HorizonData, type MerCase } from './lib';
import { statusLabel, STATUS_TONE_CLASS } from './ease/statusLabel';
import { byAtRisk } from './ease/money';
import { PrimaryAction } from './ease/PrimaryAction';
import { isTileReachable, tileTarget } from './reachability';
import { SURFACE_REGISTRY } from './surfaces';
import { cleanLabel } from './labels';
import { MeridianHeader } from './MeridianHeader';

type Gov = Record<string, { status: 'required' | 'optional' | 'unavailable'; charge_zar: number | null; charge_event: string | null }>;
interface ThreadLite {
  case: { id: string; ref: string; title: string; status: string };
  events: { event_type?: string; created_at?: string; actor_role?: string }[];
  actions: { action: string; label: string; path: string; cascadeHint: string; tone?: string; fields?: unknown[] }[];
}

export default function JourneyCockpit() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const navigate = useNavigate();
  const cfg = getRoleConfig(role);
  const { journeys, primaryEntity } = React.useMemo(() => getJourneys(role), [role]);

  const [data, setData] = React.useState<HorizonData | null>(null);
  const [gov, setGov] = React.useState<Gov>({});
  const [active, setActive] = React.useState<string>('today');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ThreadLite | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  const reload = React.useCallback(() => {
    if (!role) return;
    fetchHorizon(role).then(setData).catch(() => setData(null));
  }, [role]);

  React.useEffect(() => {
    if (!role) return;
    reload();
    api.get(`/journey-config/${role}`).then(r => setGov(r.data?.data ?? {})).catch(() => { /* defaults */ });
  }, [role, reload]);

  // Open an item: fetch its thread detail in place (folds the old Thread page).
  React.useEffect(() => {
    if (!openId) { setDetail(null); return; }
    const c = (data?.lanes ?? []).flatMap(l => l.cases).concat(data?.duty ?? []).find(x => x.id === openId);
    if (!c) return;
    api.get(`/thread/${c.chain}/${c.id}`).then(r => setDetail(r.data.data)).catch(() => setDetail(null));
  }, [openId, data]);

  const hasSurface = (k: string) => !!SURFACE_REGISTRY[k];
  const domByKey = React.useMemo(() => new Map((cfg?.domains ?? []).map(d => [d.key, d])), [cfg]);
  const journeyFeatures = (jk: string) => {
    const j = journeys.find(x => x.key === jk);
    return (j?.domainKeys ?? []).flatMap(dk => domByKey.get(dk)?.features ?? []);
  };
  const featAvailable = (key: string) => (gov[key]?.status ?? 'optional') !== 'unavailable';
  const featRequired = (key: string) => gov[key]?.status === 'required';

  // Journeys with at least one reachable+available feature (or a cross-cutting route).
  const visibleJourneys = journeys.filter(j =>
    j.route || journeyFeatures(j.key).some(f => isTileReachable(role, f, hasSurface) && featAvailable(f.key)));

  const activeJourney = journeys.find(j => j.key === active);

  function casesForJourney(jk: string): MerCase[] {
    const chainKeys = new Set(journeyFeatures(jk).map(f => f.chainKey).filter(Boolean) as string[]);
    return (data?.lanes ?? []).flatMap(l => l.cases).filter(c => chainKeys.has(c.chain)).sort(byAtRisk);
  }

  if (!cfg) return <div className="mer mer-error" role="alert">Unknown role.</div>;

  const today = (data?.duty ?? []);

  // ── an item card with in-context expand ──
  const ItemCard = ({ c, tag }: { c: MerCase; tag?: string }) => {
    const open = openId === c.id;
    const sl = statusLabel(c.status);
    return (
      <div className={c.bucket === 'breached' ? 'jc-item crit' : 'jc-item'}>
        <button type="button" className="jc-item-row" aria-expanded={open} onClick={() => setOpenId(open ? null : c.id)}>
          <Icon name="chevron" size={13} className={open ? 'jc-chev open' : 'jc-chev'} />
          {tag && <span className="jc-tag">{tag}</span>}
          <span className="jc-item-ttl">{cleanLabel(c.title)}</span>
          {c.quantum_zar != null && <span className="jc-zar mono">{fmtZar(c.quantum_zar)}</span>}
          <span className={`jc-pill ${STATUS_TONE_CLASS[sl.tone]}`}>{sl.text}</span>
        </button>
        {open && (
          <div className="jc-detail">
            {!detail ? <div className="jc-detail-load mono">Loading…</div> : (
              <>
                <div className="jc-track">
                  {detail.events.slice(-4).map((e, i) => (
                    <span key={i} className="jc-step done">{cleanLabel(e.event_type ?? '')}</span>
                  ))}
                  <span className="jc-step now">{statusLabel(detail.case.status).text}</span>
                </div>
                <div className="jc-acts">
                  {detail.actions.map(a => (
                    <PrimaryAction key={a.action} target={{ chain: c.chain, id: c.id, ref: c.ref }}
                      action={a as any} onActed={async () => { setOpenId(null); reload(); }}
                      onError={setActErr} />
                  ))}
                  <Link className="btn ghost" to={`/thread/${c.chain}/${c.id}`}>Full record</Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mer jc">
      <MeridianHeader ctx={<b>{cleanLabel(cfg.label)}</b>} />

      {/* journey tabs */}
      <nav className="jc-tabs" aria-label="Journeys">
        <button type="button" className={active === 'today' ? 'jc-tab on' : 'jc-tab'} onClick={() => { setActive('today'); setOpenId(null); }}>
          <Icon name="today" size={16} /> Today
          {data && data.counts.breached > 0 && <span className="jc-alert" aria-label={`${data.counts.breached} overdue`} />}
        </button>
        {visibleJourneys.map(j => (
          <button key={j.key} type="button" className={active === j.key ? 'jc-tab on' : 'jc-tab'}
            onClick={() => { if (j.route) { navigate(j.route); return; } setActive(j.key); setOpenId(null); }}>
            <Icon name={j.icon} size={16} /> {cleanLabel(j.label)}
          </button>
        ))}
      </nav>

      {actErr && <div className="act-error mer" role="alert"><span>{actErr}</span><button type="button" className="btn ghost" onClick={() => setActErr(null)}>Dismiss</button></div>}

      <main className="jc-stage">
        {active === 'today' ? (
          <>
            <header className="jc-head">
              <h1 className="hd-serif">{today.length ? `${today.length} ${today.length === 1 ? 'thing needs' : 'things need'} you` : 'Nothing needs you right now'}</h1>
              <p className="jc-sub">Priority across every journey — ranked by what costs the most while it waits.</p>
            </header>
            <div className="jc-items">
              {today.map(c => <ItemCard key={c.id} c={c} tag={journeyTagFor(c, journeys, domByKey)} />)}
              {today.length === 0 && <div className="jc-empty">All your journeys are within their windows. Pick one above to work ahead.</div>}
            </div>
          </>
        ) : activeJourney ? (
          <>
            <header className="jc-head">
              <h1 className="hd-serif">{cleanLabel(activeJourney.label)}</h1>
            </header>
            <div className="jc-starts">
              <button type="button" className="jc-start" onClick={() => navigate('/new')}>
                <Icon name="plus" size={14} /> {primaryEntity.verb} {primaryEntity.label}
              </button>
              {journeyFeatures(activeJourney.key)
                .filter(f => f.chainKey && isTileReachable(role, f, hasSurface) && featAvailable(f.key))
                .slice(0, 6)
                .map(f => (
                  <Link key={f.key} className="jc-start ghost" to={(tileTarget(role, f, hasSurface) ?? '#') + '?compose=1'}>
                    <Icon name="plus" size={13} /> {cleanLabel(f.label)}
                    {gov[f.key]?.charge_zar ? <span className="jc-charge mono">{fmtZar(gov[f.key].charge_zar)}</span> : null}
                    {featRequired(f.key) && <span className="jc-req">required</span>}
                  </Link>
                ))}
            </div>
            <div className="jc-items">
              {casesForJourney(activeJourney.key).map(c => <ItemCard key={c.id} c={c} />)}
              {casesForJourney(activeJourney.key).length === 0 && (
                <div className="jc-empty">No live items in this journey. Use “Start” above to begin one, or open a tool from the list.</div>
              )}
            </div>
            {/* journey tools (non-chain surfaces/pages) */}
            <div className="jc-tools">
              {journeyFeatures(activeJourney.key)
                .filter(f => !f.chainKey && isTileReachable(role, f, hasSurface) && featAvailable(f.key))
                .map(f => (
                  <Link key={f.key} className="jc-tool" to={tileTarget(role, f, hasSurface) ?? '#'}>
                    {cleanLabel(f.label)}
                    {featRequired(f.key) && <span className="jc-req">required</span>}
                  </Link>
                ))}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

// Tag a Today card with the journey it belongs to (first journey whose domains hold the chain).
function journeyTagFor(c: MerCase, journeys: ReturnType<typeof getJourneys>['journeys'], domByKey: Map<string, { features: { chainKey?: string }[] }>): string | undefined {
  for (const j of journeys) {
    const chains = (j.domainKeys ?? []).flatMap(dk => (domByKey.get(dk)?.features ?? []).map(f => f.chainKey).filter(Boolean));
    if (chains.includes(c.chain)) return cleanLabel(j.label);
  }
  return undefined;
}
