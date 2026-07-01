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
import { EaseLoading, EaseError } from './ease/states';
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
  const [loadErr, setLoadErr] = React.useState(false);

  const reload = React.useCallback(() => {
    if (!role) return;
    setLoadErr(false);
    fetchHorizon(role).then(setData).catch(() => setLoadErr(true));
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
  const now = new Date();
  const niceDate = now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
  // Journeys that are live but calm — surfaced under Today as quiet reassurance.
  const onTrack = data
    ? visibleJourneys.filter(j => !j.route).map(j => {
        const cs = casesForJourney(j.key);
        return { key: j.key, label: j.label, icon: j.icon, live: cs.length, breached: cs.filter(c => c.bucket === 'breached').length };
      }).filter(h => h.live > 0 && h.breached === 0)
    : [];

  // ── an item card: glance (title/money/status + inline primary action) → tap.
  // Expanding fetches the full state track + remaining actions (folds the Thread).
  const ItemCard = ({ c, tag }: { c: MerCase; tag?: string }) => {
    const open = openId === c.id;
    const sl = statusLabel(c.status);
    const toggle = () => setOpenId(open ? null : c.id);
    // The case already carries its ranked actions — surface the top one inline so
    // the operator can act without opening the item (the glance→one-tap bar).
    const inline = (c.actions ?? []).slice(0, 1);
    return (
      <div className={c.bucket === 'breached' ? 'jc-item crit' : 'jc-item'}>
        <div className="jc-item-row">
          <button type="button" className="jc-expand" aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'} onClick={toggle}>
            <Icon name="chevron" size={13} className={open ? 'jc-chev open' : 'jc-chev'} />
          </button>
          <button type="button" className="jc-item-main" onClick={toggle}>
            {tag && <span className="jc-tag">{tag}</span>}
            <span className="jc-item-ttl">{cleanLabel(c.title)}</span>
          </button>
          {c.quantum_zar != null && <span className="jc-zar mono">{fmtZar(c.quantum_zar)}</span>}
          <span className={`jc-pill ${STATUS_TONE_CLASS[sl.tone]}`}>{sl.text}</span>
          {inline.length > 0 && (
            <span className="jc-inline-acts">
              {inline.map(a => (
                <PrimaryAction key={a.action} target={{ chain: c.chain, id: c.id, ref: c.ref }}
                  action={a as any} onActed={async () => { reload(); }} onError={setActErr} />
              ))}
            </span>
          )}
        </div>
        {open && (
          <div className="jc-detail">
            {!detail ? <div className="jc-detail-load"><span className="skel skel-line" style={{ width: '55%' }} /></div> : (
              <>
                <div className="jc-track">
                  {detail.events.slice(-4).map((e, i) => (
                    <React.Fragment key={i}><span className="jc-step done">{cleanLabel(e.event_type ?? '')}</span><span className="jc-arr">›</span></React.Fragment>
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
        {loadErr ? (
          <EaseError message="Couldn’t load your workspace." onRetry={reload} />
        ) : !data ? (
          <EaseLoading rows={4} />
        ) : active === 'today' ? (
          <>
            <header className="jc-head">
              <div className="jc-date mono">{niceDate}</div>
              <h1 className="hd-serif">{today.length ? `${today.length} ${today.length === 1 ? 'thing needs' : 'things need'} you` : 'You’re all caught up'}</h1>
              <p className="jc-sub">{today.length
                ? 'Priority across every journey — ranked by what costs the most while it waits.'
                : 'Nothing is overdue or due right now. Pick a journey to work ahead.'}</p>
            </header>
            {today.length > 0 && (
              <div className="jc-items">
                {today.map(c => <ItemCard key={c.id} c={c} tag={journeyTagFor(c, journeys, domByKey)} />)}
              </div>
            )}
            {onTrack.length > 0 && (
              <section className="jc-ontrack">
                <p className="jc-seclabel">On track</p>
                <div className="jc-ht-grid">
                  {onTrack.map(h => (
                    <button key={h.key} type="button" className="jc-ht" onClick={() => { setActive(h.key); setOpenId(null); }}>
                      <span className="jc-ht-h"><Icon name={h.icon} size={15} /> {cleanLabel(h.label)}</span>
                      <span className="jc-ht-m mono">{h.live} live · on track</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
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
            {/* Lifecycle lanes — each chain in the journey drawn as its state track,
               with live cases counted at the stage they're in. Overview above the
               actionable item list; nothing here replaces the items below. */}
            {(() => {
              const jcases = casesForJourney(activeJourney.key);
              // A chain-feature earns a lane if it defines states OR has any live case.
              const laneFeats = journeyFeatures(activeJourney.key)
                .filter(f => f.chainKey && isTileReachable(role, f, hasSurface) && featAvailable(f.key)
                  && ((f.mockStates?.length ?? 0) > 0 || jcases.some(c => c.chain === f.chainKey)));
              if (!laneFeats.length) return null;
              return (
                <div className="jc-lanes">
                  {laneFeats.map(f => {
                    const mine = jcases.filter(c => c.chain === f.chainKey);
                    // Stages = the feature's declared states, unioned with any live status
                    // actually present, so no real case is ever invisible on the lane.
                    const base = [...(f.mockStates ?? [])];
                    for (const c of mine) if (c.status && !base.includes(c.status)) base.push(c.status);
                    return (
                      <div className="jc-lane" key={f.key}>
                        <div className="jc-lane-h"><b>{cleanLabel(f.label)}</b><span className="jc-lane-n mono">{mine.length} live</span></div>
                        <div className="jc-lstages">
                          {base.map(s => {
                            const at = mine.filter(c => c.status === s);
                            const hot = at.some(c => c.bucket === 'breached');
                            const cls = hot ? 'jc-lstage hot' : at.length ? 'jc-lstage pass' : 'jc-lstage empty';
                            return (
                              <div className={cls} key={s}>
                                <span className="jc-lnode" />
                                <span className="jc-lsnm">{cleanLabel(s)}</span>
                                <span className="jc-lcc mono">{at.length}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
