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
import { fetchHorizon, fetchLedger, fmtZar, humanizeKey, type HorizonData, type MerCase, type LedgerActionField } from './lib';
import { FieldForm } from './FieldForm';

// Format a raw case-record value for the in-cockpit detail (folds the Thread record).
// Conservative on money (ZAR only on a clear `zar` key, so no field is wrongly stamped),
// ISO timestamps → readable, booleans → Yes/No, snake_case enums → humanized.
function fmtField(k: string, v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return /zar/i.test(k) ? fmtZar(v) : v.toLocaleString('en-ZA');
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:/.test(v)) return v.slice(0, 16).replace('T', ' ');
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    if (/zar/i.test(k) && /^-?\d+(\.\d+)?$/.test(v)) return fmtZar(Number(v));
    if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(v)) return humanizeKey(v);
    return v;
  }
  return String(v);
}
import { statusLabel, STATUS_TONE_CLASS } from './ease/statusLabel';
import { byAtRisk } from './ease/money';
import { PrimaryAction } from './ease/PrimaryAction';
import { EaseLoading, EaseError } from './ease/states';
import { isTileReachable, tileTarget, surfaceRole } from './reachability';
import { SURFACE_REGISTRY } from './surfaces';
import { SurfaceBoundary } from './MeridianSurfacePage';
import { cleanLabel } from './labels';
import { MeridianHeader } from './MeridianHeader';

type Gov = Record<string, { status: 'required' | 'optional' | 'unavailable'; charge_zar: number | null; charge_event: string | null }>;
interface ThreadLite {
  case: { id: string; ref: string; title: string; status: string; raw?: Record<string, unknown> };
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
  // Create-in-journey: opening a "start" affordance fetches that chain's initiation
  // schema and renders it in an in-place composer over the cockpit — no navigation to
  // Atlas/Ledger. Submit POSTs the real initiation endpoint (cascades fire) and reloads.
  const [compose, setCompose] = React.useState<
    { chain: string; label: string; path: string; fields: LedgerActionField[]; prefill?: Record<string, unknown> } | null>(null);
  // Surface-in-journey: a journey "tool" (master-data CRUD, analytics, connectors)
  // renders its registered component in a panel over the cockpit instead of
  // navigating to /surface/:key. Same component, same CRUD — no second plane.
  const [surfacePanel, setSurfacePanel] = React.useState<{ key: string; label: string } | null>(null);

  const reload = React.useCallback(() => {
    if (!role) return;
    setLoadErr(false);
    fetchHorizon(role).then(setData).catch(() => setLoadErr(true));
  }, [role]);

  const openCompose = React.useCallback((chainKey: string) => {
    setActErr(null);
    fetchLedger(chainKey)
      .then(d => {
        if (d.initiation) setCompose({ chain: chainKey, ...d.initiation, prefill: d.prefill });
        else setActErr('This can’t be started here — open it from its journey.');
      })
      .catch(() => setActErr('Couldn’t open the form. Try again.'));
  }, []);

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
                {detail.case.raw && (
                  <details className="jc-record">
                    <summary>Record</summary>
                    <dl>
                      {Object.entries(detail.case.raw)
                        .filter(([k, v]) => v != null && v !== '' && !['id', 'tenant_id'].includes(k))
                        .slice(0, 14)
                        .map(([k, v]) => (
                          <React.Fragment key={k}>
                            <dt>{humanizeKey(k, true)}</dt><dd className="mono">{fmtField(k, v)}</dd>
                          </React.Fragment>
                        ))}
                    </dl>
                  </details>
                )}
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
            {(() => {
              const initiable = journeyFeatures(activeJourney.key)
                .filter(f => f.chainKey && isTileReachable(role, f, hasSurface) && featAvailable(f.key));
              const primaryChain = initiable[0]?.chainKey;
              return (
                <div className="jc-starts">
                  {/* Primary create opens the composer in place (falls back to the picker
                     only if the journey has no initiable chain). No Atlas navigation. */}
                  <button type="button" className="jc-start"
                    onClick={() => primaryChain ? openCompose(primaryChain) : navigate('/new')}>
                    <Icon name="plus" size={14} /> {primaryEntity.verb} {primaryEntity.label}
                  </button>
                  {initiable.slice(0, 6).map(f => (
                    <button key={f.key} type="button" className="jc-start ghost" onClick={() => openCompose(f.chainKey!)}>
                      <Icon name="plus" size={13} /> {cleanLabel(f.label)}
                      {gov[f.key]?.charge_zar ? <span className="jc-charge mono">{fmtZar(gov[f.key].charge_zar)}</span> : null}
                      {featRequired(f.key) && <span className="jc-req">required</span>}
                    </button>
                  ))}
                </div>
              );
            })()}
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
                  {[...laneFeats]
                    // Populated lanes first; empty ones sink and render compact.
                    .sort((a, b) => jcases.filter(c => c.chain === b.chainKey).length - jcases.filter(c => c.chain === a.chainKey).length)
                    .map(f => {
                    const mine = jcases.filter(c => c.chain === f.chainKey);
                    // A lane with no live cases collapses to a single quiet row — the full
                    // stage track is only worth its height when something is on it.
                    if (mine.length === 0) {
                      return (
                        <div className="jc-lane jc-lane-0" key={f.key}>
                          <b>{cleanLabel(f.label)}</b><span className="jc-lane-n mono">0 live</span>
                        </div>
                      );
                    }
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
                .map(f => hasSurface(`${surfaceRole(role)}:${f.key}`) ? (
                  // Registered surface → open in a panel over the cockpit (no navigation).
                  <button key={f.key} type="button" className="jc-tool"
                    onClick={() => setSurfacePanel({ key: f.key, label: cleanLabel(f.label) })}>
                    {cleanLabel(f.label)}
                    {featRequired(f.key) && <span className="jc-req">required</span>}
                  </button>
                ) : (
                  // Non-surface (standalone route, e.g. /esg) → link out for now.
                  <Link key={f.key} className="jc-tool" to={tileTarget(role, f, hasSurface) ?? '#'}>
                    {cleanLabel(f.label)}
                    {featRequired(f.key) && <span className="jc-req">required</span>}
                  </Link>
                ))}
            </div>
          </>
        ) : null}
      </main>

      {/* Create-in-journey composer — schema-driven initiation over the cockpit, no
         navigation. Submitting POSTs the real endpoint (cascades fire) and reloads. */}
      {compose && (
        <div className="mer veil" onClick={() => setCompose(null)}>
          <div className="veil-body" role="dialog" aria-modal="true" aria-label={compose.label} onClick={e => e.stopPropagation()}>
            <FieldForm
              fields={compose.fields}
              prefill={compose.prefill}
              submitLabel={compose.label}
              ariaLabel={compose.label}
              onSubmit={async (values) => {
                await api.post(compose.path.replace('/api', ''), values);
                setCompose(null);
                reload();
              }}
              onCancel={() => setCompose(null)}
            />
          </div>
        </div>
      )}

      {/* Surface-in-journey panel — renders the registered surface component (its own
         CRUD intact) in a wide panel over the cockpit. No navigation to /surface/:key. */}
      {surfacePanel && (() => {
        const Comp = SURFACE_REGISTRY[`${surfaceRole(role)}:${surfacePanel.key}`];
        return (
          <div className="mer veil" onClick={() => setSurfacePanel(null)}>
            <div className="jc-surface-panel" role="dialog" aria-modal="true" aria-label={surfacePanel.label} onClick={e => e.stopPropagation()}>
              <div className="jc-sp-head">
                <b>{surfacePanel.label}</b>
                <button type="button" className="jc-sp-x" onClick={() => setSurfacePanel(null)} aria-label="Close">×</button>
              </div>
              <div className="jc-sp-body">
                {Comp ? (
                  <SurfaceBoundary>
                    <React.Suspense fallback={<EaseLoading rows={4} />}>
                      <Comp role={surfaceRole(role)} />
                    </React.Suspense>
                  </SurfaceBoundary>
                ) : (
                  <div className="mer mer-error" role="alert">This tool isn’t available for your role.</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
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
