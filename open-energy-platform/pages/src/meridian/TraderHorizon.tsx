// pages/src/meridian/TraderHorizon.tsx — bespoke trader Horizon.
// v2 "Risk Radar" surface (design-preview/v2/trader.html · Option 3):
// cases plotted spatially by time-to-consequence, sized by ZAR at risk,
// coloured by lane — act from the rail without leaving the picture.
//
// The mockup's radar is "distance-to-limit" (centre safe, outer breach) for
// live positions. The demo trader has no seeded position limits, but every
// trader has a real horizon duty stream ranked by ZAR × time-to-deadline. We
// map that honestly onto the same radar shape: outer ring = OVERDUE (hot),
// centre = LATER (calm). Same spatial read — "things near the edge need you
// now" — backed entirely by real chain state, no fakes.
//
// Data (all REAL, scoped to the signed-in trader):
//   • fetchHorizon('trader') → lanes (post_trade / compliance_reporting /
//     risk_margin) + duty (ranked cases with quantum_zar + actions).
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './meridian.css';
import { fetchHorizon, fmtZar, zarMagnitudeClass, type Bucket, type HorizonData, type MerAction, type MerCase } from './lib';
import { api } from '../lib/api';
import { MeridianHeader } from './MeridianHeader';
import { HorizonKpis } from './HorizonKpis';
import { GettingStarted } from './GettingStarted';
import { GuidedTour } from './GuidedTour';
import { cleanLabel } from './labels';

// Buckets → ring index. Outer ring (5) = breached/overdue (hot). Centre (0) =
// later (calm). Mirrors the mockup's "outer = breach, centre = safe" read.
const RING: Record<Bucket, number> = {
  breached: 5, h2: 4, today: 3, h48: 2, week: 1, later: 0,
};
const RING_LABEL: Record<Bucket, string> = {
  breached: 'OVERDUE', h2: '2 HRS', today: 'TODAY', h48: '2 DAYS', week: 'WEEK', later: 'LATER',
};
// Three lanes → three 120° sectors on the radar. Angle in deg (0 = right, CCW).
const LANE_SECTOR: Record<string, number> = {
  risk_margin: 90, compliance_reporting: 210, post_trade: 330,
};
const LANE_COLOR: Record<string, 'bad' | 'warn' | 'ok'> = {
  risk_margin: 'bad', compliance_reporting: 'warn', post_trade: 'ok',
};
const LANE_HEX: Record<string, string> = {
  risk_margin: '#ff4d5e', compliance_reporting: '#ffb02e', post_trade: '#37c6e0',
};

// which lane does a case belong to? The duty stream doesn't carry lane, but
// each case has a chain key — map by the chain registry's lane assignment is
// not available client-side, so fall back to a hash of the chain key into one
// of the three sectors. Stable per case (same case always lands same sector).
function laneOf(c: MerCase): string {
  if (c.chain.includes('margin') || c.chain.includes('risk')) return 'risk_margin';
  if (c.chain.includes('compliance') || c.chain.includes('report') || c.chain.includes('pna') || c.chain.includes('attest')) return 'compliance_reporting';
  return 'post_trade';
}

// polar → cartesian for an absolutely-positioned blip inside the stage.
// rFrac is fraction of the stage radius (0..1); angleDeg measured CCW from 3 o'clock.
function pos(rFrac: number, angleDeg: number): { left: string; top: string } {
  const rad = (angleDeg * Math.PI) / 180;
  // centre at 50%; subtract half the blip size via translate in CSS.
  const x = 50 + rFrac * 42 * Math.cos(rad);
  const y = 50 - rFrac * 42 * Math.sin(rad);
  return { left: `${x}%`, top: `${y}%` };
}

export default function TraderHorizon() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [selId, setSelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const load = () => fetchHorizon('trader').then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
    load();
    const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  async function act(c: MerCase, a: MerAction) {
    if (a.fields?.length) { navigate(`/thread/${c.chain}/${c.id}?act=${encodeURIComponent(a.action)}`); return; }
    if (a.tone === 'oxide' && !window.confirm(`${a.label} — ${c.ref}?\nThis may be hard to reverse.`)) return;
    const key = `${c.id}:${a.action}`;
    setActing(key);
    try { await api.post(a.path.replace('/api', '').replace(':id', c.id), {}); }
    catch { /* keep last good state */ }
    finally { setActing(null); }
    try { setData(await fetchHorizon('trader')); } catch { /* keep last */ }
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
          <div className="skel skel-card" style={{ height: 420, marginBottom: 16 }} />
        </div>
      </div>
    );
  }

  const { lanes, duty, counts } = data;
  const totalZar = duty.reduce((s, c) => s + (c.quantum_zar || 0), 0);
  const overdue = duty.filter(c => c.bucket === 'breached');
  const overdueZar = overdue.reduce((s, c) => s + (c.quantum_zar || 0), 0);

  // Build blips from the duty stream. Each case → one blip on the radar.
  // Sector by lane, spread within sector by index, ring by bucket, size by ZAR.
  const byLane: Record<string, MerCase[]> = {};
  for (const c of duty) { const l = laneOf(c); (byLane[l] ??= []).push(c); }
  const blips = duty.map(c => {
    const lane = laneOf(c);
    const sector = LANE_SECTOR[lane] ?? 330;
    const idxInSector = byLane[lane].indexOf(c);
    const spread = byLane[lane].length;
    // ±35° wiggle within the sector so blips in the same lane don't overlap.
    const wiggle = spread > 1 ? (idxInSector / (spread - 1) - 0.5) * 70 : 0;
    const angle = sector + wiggle;
    const ring = RING[c.bucket];
    const rFrac = ring / 5; // 0 (centre) .. 1 (outer)
    const p = pos(rFrac, angle);
    return { c, lane, p, mag: zarMagnitudeClass(c.quantum_zar), tone: LANE_COLOR[lane] };
  });

  const sel = blips.find(b => b.c.id === selId)?.c ?? duty[0] ?? null;

  // lane summary cards
  const laneRows = lanes.map(l => {
    const br = l.cases.filter(c => c.bucket === 'breached').length;
    const zar = l.cases.reduce((s, c) => s + (c.quantum_zar || 0), 0);
    return { key: l.key, n: l.cases.length, br, zar };
  });

  const headline = counts.breached > 0
    ? <>Your desk holds <span className="tr-num bad">{fmtZar(overdueZar)}</span> overdue across <span className="tr-num bad">{overdue.length}</span> case{overdue.length === 1 ? '' : 's'}.</>
    : <>Your desk is clear — <span className="tr-num ok">{counts.total}</span> live case{counts.total === 1 ? '' : 's'}, nothing overdue.</>;
  const subtext = counts.breached > 0
    ? `${overdue.length} case${overdue.length === 1 ? '' : 's'} have passed their deadline and are accruing cost. Act from the rail — the radar shows what's closest to the edge.`
    : `${counts.total} live case${counts.total === 1 ? '' : 's'} across ${lanes.length} lanes. Anything that needs you appears on the outer ring the moment it crosses its deadline.`;

  return (
    <div className="mer horizon tr">
      <MeridianHeader ctx={<><b>Trader</b><span>{counts.total} live · {counts.breached} overdue</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="trader" />

      <section className="tr-board" aria-label="Your trading desk">
        <div className="tr-hero">
          <div className="oh-eyebrow">DESK · radar sweep</div>
          <h2 className="tr-hero-title hd-serif">{headline}</h2>
          <p className="tr-hero-sub">{subtext}</p>
          <div className="oh-hero-actions">
            <Link to="/new" className="btn pri">+ New order</Link>
            <Link to="/atlas" className="btn ghost">Browse functions</Link>
          </div>
        </div>

        <div className="tr-radarwrap">
          <div className="tr-radar">
            <div className="tr-radar-head">
              <h3 className="hd-serif">Risk radar</h3>
              <span className="oh-mono">outer = overdue · centre = later · size = ZAR at risk</span>
            </div>
            <div className="tr-stage" role="img" aria-label={`Radar of ${duty.length} cases plotted by time to consequence`}>
              <div className="tr-sweep" aria-hidden="true" />
              <div className="tr-ring r0" /><div className="tr-ring r1" /><div className="tr-ring r2" />
              <div className="tr-ring r3" /><div className="tr-ring r4" /><div className="tr-ring r5" />
              <div className="tr-ringlbl outer">OVERDUE</div>
              <div className="tr-ringlbl mid">TODAY</div>
              <div className="tr-ringlbl inner">LATER</div>
              <div className="tr-center">
                <div className="tr-center-big hd-serif">{fmtZar(totalZar)}</div>
                <div className="tr-center-cl">at risk · {duty.length} watch</div>
              </div>

              {blips.map(b => {
                const isSel = b.c.id === sel?.id;
                return (
                  <button key={b.c.id} type="button"
                    className={`tr-blip ${b.tone} mag-${b.mag} ${isSel ? 'sel' : ''} ${b.c.bucket === 'breached' ? 'hot' : ''}`}
                    style={{ left: b.p.left, top: b.p.top }}
                    title={`${b.c.ref} · ${cleanLabel(b.c.title)} · ${RING_LABEL[b.c.bucket]}${b.c.quantum_zar != null ? ` · ${fmtZar(b.c.quantum_zar)}` : ''}`}
                    aria-label={`${cleanLabel(b.c.title)}, ${RING_LABEL[b.c.bucket]}${b.c.quantum_zar != null ? `, ${fmtZar(b.c.quantum_zar)} at risk` : ''}`}
                    aria-pressed={isSel}
                    onClick={() => setSelId(b.c.id)}>
                    <span className="tr-dotg" />
                    <span className="tr-nm">{b.c.ref}</span>
                  </button>
                );
              })}

              {duty.length === 0 && (
                <div className="tr-center">
                  <div className="tr-center-big hd-serif ok">Clear</div>
                  <div className="tr-center-cl">nothing on the radar</div>
                </div>
              )}
            </div>
            <div className="tr-legend">
              {Object.entries(LANE_HEX).map(([k, hex]) => (
                <span key={k} className="tr-legend-item"><span className="tr-legend-dot" style={{ background: hex }} />{cleanLabel(k.replace(/_/g, ' '))}</span>
              ))}
            </div>
          </div>

          {/* action rail — act in place on the selected case */}
          <aside className="tr-rail" aria-label="Act on the selected case">
            <div className="tr-rail-h">
              <span className="oh-mono">ACT IN PLACE</span>
              <span className={`oh-pill ${counts.breached > 0 ? 'warn' : 'ok'}`}>{counts.breached > 0 ? `${counts.breached} overdue` : 'clear'}</span>
            </div>
            {sel ? (
              <div className={`tr-rail-item ${sel.bucket === 'breached' ? 'hot' : ''}`}>
                <div className="tr-rail-ref oh-mono">{sel.ref}</div>
                <h3 className="hd-serif">{cleanLabel(sel.title)}</h3>
                <div className="tr-rail-why">
                  <span className={`oh-pill ${sel.bucket === 'breached' ? 'bad' : 'neu'}`}>{RING_LABEL[sel.bucket]}</span>
                  {sel.quantum_zar != null && <span className="oh-mono"> · {fmtZar(sel.quantum_zar)} at risk</span>}
                  <span className="oh-mono"> · {cleanLabel(laneOf(sel).replace(/_/g, ' '))}</span>
                </div>
                {sel.counterparty && <div className="tr-rail-cp">vs {sel.counterparty}</div>}
                <div className="tr-rail-acts">
                  {sel.actions.slice(0, 3).map(a => {
                    const key = `${sel.id}:${a.action}`;
                    const busy = acting === key;
                    return (
                      <button key={a.action} type="button"
                        className={a.tone === 'oxide' ? 'btn ox' : a.tone === 'amber' || a.tone === 'gold' ? 'btn gold' : 'btn pri'}
                        title={a.fields?.length ? `${a.cascadeHint} — opens the form` : a.cascadeHint}
                        disabled={acting !== null}
                        aria-busy={busy || undefined}
                        onClick={() => act(sel, a)}>
                        {busy ? '…' : a.fields?.length ? `${a.label}…` : a.label}
                      </button>
                    );
                  })}
                  <Link className="btn ghost" to={`/thread/${sel.chain}/${sel.id}`}>Open thread</Link>
                </div>
              </div>
            ) : (
              <div className="tr-rail-empty">Nothing demands action right now.</div>
            )}

            <div className="tr-rail-list">
              <div className="tr-rail-list-h oh-mono">ALL WATCH · {duty.length}</div>
              {duty.map(c => (
                <button key={c.id} type="button"
                  className={`tr-rail-row ${c.id === sel?.id ? 'sel' : ''} ${c.bucket === 'breached' ? 'hot' : ''}`}
                  onClick={() => setSelId(c.id)}>
                  <span className="oh-mono">{c.ref}</span>
                  <span className="tr-rail-row-t">{cleanLabel(c.title)}</span>
                  <span className={`oh-pill ${c.bucket === 'breached' ? 'bad' : 'neu'}`}>{RING_LABEL[c.bucket]}</span>
                </button>
              ))}
              {duty.length === 0 && <div className="tr-rail-empty">No live watch items.</div>}
            </div>
          </aside>
        </div>

        {/* lane summary */}
        <div className="tr-lanes">
          {laneRows.map(l => (
            <Link key={l.key} className="tr-lane" to={`/ledger/${laneChain(l.key)}`}>
              <div className="tr-lane-top">
                <span className="tr-lane-dot" style={{ background: LANE_HEX[Object.keys(LANE_HEX).find(k => k.startsWith(l.key.slice(0, 4))) ?? 'post_trade'] }} />
                <span className="tr-lane-name hd-serif">{cleanLabel(l.key.replace(/_/g, ' '))}</span>
                <span className="tr-lane-n oh-mono">{l.n} live</span>
              </div>
              <div className="tr-lane-mid">
                {l.br > 0 ? <span className="oh-pill bad">{l.br} overdue</span> : <span className="oh-pill ok">on track</span>}
                {l.zar > 0 && <span className="oh-mono"> · {fmtZar(l.zar)}</span>}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

// Best-effort lane → ledger chain key. The trader's three lanes are each
// dominated by one chain family; the chain registry maps them server-side.
// Fall back to the lane key itself (the Ledger route tolerates unknown keys
// with an empty list).
function laneChain(laneKey: string): string {
  if (laneKey.startsWith('risk')) return 'counterparty_margin';
  if (laneKey.startsWith('compliance')) return 'pna_publication';
  if (laneKey.startsWith('post_trade')) return 'trade_settlement';
  return laneKey;
}