// pages/src/meridian/RegulatorHorizon.tsx — bespoke regulator Horizon.
// v2 "Triage Inbox" surface (design-preview/v2/regulator.html · Option 1):
// a three-pane oversight desk. Left = triage rail pre-ranked by statutory-clock
// risk (breach first, then at-risk, then on-track). Centre = the live queue —
// cases ranked by SLA risk × ZAR, with state-machine status. Right = the focused
// case: why it's top of queue, its evidence trail hint, and the single defensible
// action set. The regulator never decides where to start — the statutory clock does.
//
// Data (all REAL, scoped to the signed-in regulator):
//   • fetchHorizon('regulator') → lanes (enforcement_regulator / licensing /
//     data_reporting / tariff_determinations / levies) + duty (ranked cases with
//     quantum_zar, deadline_at, status, counterparty, actions).
//   • Triage bands are computed across EVERY lane case (the whole desk, not just
//     the 8 duty cases) — breach / at-risk(<48h) / on-track. Honest to all 363.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './meridian.css';
import { fetchHorizon, fmtZar, zarMagnitudeClass, type Bucket, type HorizonData, type MerAction, type MerCase } from './lib';
import { ActErrorBar } from './components';
import { api } from '../lib/api';
import { MeridianHeader } from './MeridianHeader';
import { HorizonKpis } from './HorizonKpis';
import { GettingStarted } from './GettingStarted';
import { GuidedTour } from './GuidedTour';
import { cleanLabel } from './labels';

// Triage bands — compressed from the 6 buckets into the 3 statutory-clock bands
// the regulator actually thinks in. Breach first, at-risk next, on-track last.
type Band = 'breach' | 'risk' | 'track';
const BAND_OF: Record<Bucket, Band> = {
  breached: 'breach', h2: 'risk', today: 'risk', h48: 'risk', week: 'track', later: 'track',
};
const BAND_META: Record<Band, { label: string; tone: 'bad' | 'warn' | 'ok'; hint: string }> = {
  breach: { label: 'BREACHED', tone: 'bad', hint: 'past statutory clock' },
  risk: { label: 'AT RISK', tone: 'warn', hint: 'inside 48h warning band' },
  track: { label: 'ON TRACK', tone: 'ok', hint: 'within covenant' },
};

// SLA offset from deadline_at → "-6h 12m" (breached) / "18h 40m" (remaining).
function slaClock(deadlineAt: string | null, now: Date): { text: string; past: boolean } | null {
  if (!deadlineAt) return null;
  const ms = Date.parse(deadlineAt) - now.getTime();
  const past = ms < 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600_000);
  const m = Math.floor((abs % 3600_000) / 60_000);
  const d = Math.floor(abs / 86_400_000);
  if (d > 0) return { text: `${past ? '−' : ''}${d}d ${h}h`, past };
  return { text: `${past ? '−' : ''}${h}h ${String(m).padStart(2, '0')}m`, past };
}

export default function RegulatorHorizon() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const load = () => fetchHorizon('regulator').then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
    load();
    const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  async function act(c: MerCase, a: MerAction) {
    if (a.fields?.length) { navigate(`/thread/${c.chain}/${c.id}?act=${encodeURIComponent(a.action)}`); return; }
    if (a.tone === 'oxide' && !window.confirm(`${a.label} — ${c.ref}?\nThis may be hard to reverse.`)) return;
    const key = `${c.id}:${a.action}`;
    setActing(key);
    try { await api.post(a.path.replace('/api', '').replace(':id', c.id), {}); setActErr(null); }
    catch (e: any) { setActErr(e?.response?.data?.error ?? e?.message ?? 'Action failed'); }
    finally { setActing(null); }
    try { setData(await fetchHorizon('regulator')); } catch { /* keep last */ }
  }

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Desk failed to load.{' '}
        <button type="button" className="btn ghost" onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mer horizon">
        <div className="main" aria-busy="true" role="status" aria-label="Loading your desk">
          <div className="skel skel-card" style={{ height: 160, marginBottom: 16 }} />
          <div className="skel skel-card" style={{ height: 360 }} />
        </div>
      </div>
    );
  }

  const { lanes, duty, counts } = React.useMemo(() => data, [data]);
  const now = new Date();

  // Triage bands across the WHOLE desk (every lane case), not just duty.
  const allCases = lanes.flatMap(l => l.cases);
  const bands: Record<Band, MerCase[]> = { breach: [], risk: [], track: [] };
  for (const c of allCases) bands[BAND_OF[c.bucket]].push(c);
  // Queue = duty (already ranked by score = ZAR × urgency). These are the cases
  // that need a decision now; the rest stay in their lane ledgers.
  const queue = duty;
  const focus = queue.find(c => c.id === focusId) ?? queue[0] ?? null;
  const focusClock = focus ? slaClock(focus.deadline_at, now) : null;

  const totalZar = duty.reduce((s, c) => s + (c.quantum_zar || 0), 0);

  const headline = counts.breached > 0
    ? <>Your desk holds <span className="rg-num bad">{fmtZar(totalZar)}</span> across <span className="rg-num bad">{counts.breached}</span> case{counts.breached === 1 ? '' : 's'} past their statutory clock.</>
    : <>Your desk is on track — <span className="rg-num ok">{counts.total}</span> live case{counts.total === 1 ? '' : 's'}, nothing breaching.</>;
  const subtext = counts.breached > 0
    ? `${counts.breached} case${counts.breached === 1 ? '' : 's'} have crossed their statutory deadline and sit at the top of your queue, ranked by ZAR at risk × urgency. Work the top first — it's already triaged for you.`
    : `${counts.total} live case${counts.total === 1 ? '' : 's'} across ${lanes.length} lanes, all within their statutory windows. Anything that breaches surfaces at the top here the moment it crosses.`;

  return (
    <div className="mer horizon rg">
      <MeridianHeader ctx={<><b>Regulator</b><span>{counts.total} live · {counts.breached} breaching</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="regulator" />

      <section className="rg-board" aria-label="Regulatory triage desk">
        <div className="rg-hero">
          <div className="oh-eyebrow">YOUR DESK · triaged by statutory clock</div>
          <h2 className="rg-hero-title hd-serif">{headline}</h2>
          <p className="rg-hero-sub">{subtext}</p>
          <div className="oh-hero-actions">
            <Link to="/atlas" className="btn ghost">Browse functions</Link>
          </div>
        </div>

        <div className="rg-tri">
          {/* ── triage rail ── */}
          <aside className="rg-rail" aria-label="Triage by SLA risk">
            <div className="rg-rail-h">Triage · <b>by SLA risk</b></div>
            {(['breach', 'risk', 'track'] as Band[]).map(b => {
              const meta = BAND_META[b];
              const cs = bands[b];
              return (
                <div key={b} className={`rg-band ${meta.tone}`}>
                  <div className="rg-band-top">
                    <span className="rg-band-lbl">⬓ {meta.label}</span>
                    <span className={`rg-band-n ${meta.tone}`}>{cs.length}</span>
                  </div>
                  <div className="rg-band-hint">{meta.hint}</div>
                </div>
              );
            })}
            <div className="rg-rail-foot oh-mono">FILTER BY LANE</div>
            <div className="rg-rail-lanes">
              {lanes.map(l => {
                const br = l.cases.filter(c => c.bucket === 'breached').length;
                return (
                  <div key={l.key} className="rg-rail-lane">
                    <span className="rg-rail-lane-name">{cleanLabel(l.key.replace(/_/g, ' '))}</span>
                    <span className="oh-mono">{l.cases.length}{br ? ` · ${br}!` : ''}</span>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* ── queue ── */}
          <div className="rg-queue" aria-label="Live queue ranked by SLA risk × ZAR">
            <div className="rg-queue-h">
              <span>Queue</span>
              <span className="oh-mono">{queue.length} need you</span>
            </div>
            <div className="rg-q-list">
              {queue.map((c, i) => {
                const clock = slaClock(c.deadline_at, now);
                const sel = focus?.id === c.id;
                const isOverdue = c.bucket === 'breached';
                return (
                  <button key={c.id} type="button"
                          className={`rg-q-row ${sel ? 'sel' : ''} ${isOverdue ? 'hot' : ''}`}
                          onClick={() => setFocusId(c.id)}
                          aria-pressed={sel}>
                    <div className="rg-q-r1">
                      <span className="rg-q-ttl hd-serif">{cleanLabel(c.title)}</span>
                      <span className={`oh-pill ${isOverdue ? 'bad' : c.bucket === 'h2' || c.bucket === 'today' || c.bucket === 'h48' ? 'warn' : 'ok'}`}>
                        {isOverdue ? 'breach' : BAND_META[BAND_OF[c.bucket]].label.toLowerCase()}
                      </span>
                    </div>
                    <div className="rg-q-sub oh-mono">{c.chain} · {c.ref}</div>
                    <div className="rg-q-state">{cleanLabel(c.status.replace(/_/g, ' '))}</div>
                    <div className="rg-q-r2">
                      <span className="rg-q-cp">{c.counterparty || '—'}</span>
                      {clock && <span className={`rg-q-sla ${clock.past ? 'r' : 'a'}`}>{clock.text}</span>}
                      {c.quantum_zar != null && <span className="oh-mono rg-q-zar">{fmtZar(c.quantum_zar)}</span>}
                    </div>
                  </button>
                );
              })}
              {queue.length === 0 && (
                <div className="rg-quiet-empty">
                  <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                  <span><b>Nothing needs you.</b> Every case is within its statutory window. Anything that breaches lands here the moment it crosses.</span>
                </div>
              )}
            </div>
          </div>

          {/* ── focused case ── */}
          <aside className="rg-focus" aria-label="Focused case">
            {focus ? (
              <>
                <div className="rg-focus-h">
                  <span>Focused case</span>
                  {focusClock && <span className={`oh-pill ${focusClock.past ? 'bad' : 'warn'}`}>SLA {focusClock.text}</span>}
                </div>
                <div className="rg-focus-body">
                  <h3 className="rg-focus-title hd-serif">{cleanLabel(focus.title)}</h3>
                  <div className="rg-focus-meta oh-mono">{focus.ref} · {cleanLabel(focus.status.replace(/_/g, ' '))} · {focus.chain}</div>
                  {focus.counterparty && <div className="rg-focus-cp">Party · {focus.counterparty}</div>}

                  <div className="rg-why">
                    <div className="rg-why-h oh-mono">WHY THIS IS TOP OF QUEUE</div>
                    <div className="rg-why-body">
                      {focus.bucket === 'breached'
                        ? <>Statutory response window expired. Auto-escalation fires if left unactioned. It carries <b className={`rg-num ${zarMagnitudeClass(focus.quantum_zar) === 'm1' ? 'bad' : zarMagnitudeClass(focus.quantum_zar) === 'm2' ? 'warn' : 'ok'}`}>{fmtZar(focus.quantum_zar)}</b> at risk and the highest urgency score on your desk.</>
                        : <>Inside its warning band — the statutory clock is running. It carries <b>{fmtZar(focus.quantum_zar)}</b> at risk and ranks above the rest of your queue.</>}
                    </div>
                  </div>

                  <ActErrorBar error={actErr} onDismiss={() => setActErr(null)} />
                  <div className="rg-acts">
                    <div className="rg-acts-h oh-mono">DEFENSIBLE ACTIONS</div>
                    <div className="rg-acts-list">
                      {focus.actions.slice(0, 4).map(a => {
                        const key = `${focus.id}:${a.action}`;
                        const busy = acting === key;
                        return (
                          <button key={a.action} type="button"
                            className={a.tone === 'oxide' ? 'btn ox' : a.tone === 'amber' || a.tone === 'gold' ? 'btn gold' : 'btn pri'}
                            title={a.fields?.length ? `${a.cascadeHint} — opens the form` : a.cascadeHint}
                            disabled={acting !== null}
                            aria-busy={busy || undefined}
                            onClick={() => act(focus, a)}>
                            {busy ? '…' : a.fields?.length ? `${a.label}…` : a.label}
                          </button>
                        );
                      })}
                      <Link className="btn ghost" to={`/thread/${focus.chain}/${focus.id}`}>Open full case file</Link>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rg-focus-empty">
                <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                <span><b>No focused case.</b> Select a case from the queue to see why it's top and the defensible action set.</span>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}