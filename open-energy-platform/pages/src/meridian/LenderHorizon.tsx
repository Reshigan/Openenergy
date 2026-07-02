// pages/src/meridian/LenderHorizon.tsx — bespoke lender Horizon.
// v2 "Quiet Book" surface (design-preview/v2/lender.html · Option 3):
// a deliberately quiet, low-density book. Everything performing fades to
// ledger-grey; only exceptions (overdue / breach) surface on the screen.
// The lender sees what needs them, not a wall of green.
//
// Data (all REAL, scoped to the signed-in lender):
//   • fetchHorizon('lender') → lanes (origination / monitoring / risk_lender /
//     enforcement) + duty (ranked cases with quantum_zar + actions).
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './meridian.css';
import { fetchHorizon, fmtZar, type Bucket, type HorizonData, type MerAction, type MerCase } from './lib';
import { ActErrorBar } from './components';
import { api } from '../lib/api';
import { MeridianHeader } from './MeridianHeader';
import { HorizonKpis } from './HorizonKpis';
import { GettingStarted } from './GettingStarted';
import { GuidedTour } from './GuidedTour';
import { cleanLabel } from './labels';

const BUCKET_RANK: Record<Bucket, number> = {
  breached: 0, h2: 1, today: 2, h48: 3, week: 4, later: 5,
};
const BUCKET_LABEL: Record<Bucket, string> = {
  breached: 'overdue', h2: 'next 2 hrs', today: 'today', h48: 'next 2 days', week: 'this week', later: 'later',
};

export default function LenderHorizon() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const load = () => fetchHorizon('lender').then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
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
    try { setData(await fetchHorizon('lender')); } catch { /* keep last */ }
  }

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Book failed to load.{' '}
        <button type="button" className="btn ghost" onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mer horizon">
        <div className="main" aria-busy="true" role="status" aria-label="Loading your book">
          <div className="skel skel-card" style={{ height: 160, marginBottom: 16 }} />
          <div className="skel skel-card" style={{ height: 320 }} />
        </div>
      </div>
    );
  }

  const { lanes, duty, counts } = data;
  const totalZar = duty.reduce((s, c) => s + (c.quantum_zar || 0), 0);
  const overdue = duty.filter(c => c.bucket === 'breached');
  const overdueZar = overdue.reduce((s, c) => s + (c.quantum_zar || 0), 0);
  const performing = counts.total - counts.breached;

  // exceptions = every duty case (these are the ranked "needs you" set).
  // Performing cases stay in the ledger, not on this screen.
  const exceptions = [...duty].sort((a, b) => BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket]);

  // lane exposure — quiet bars; only the overdue count colours them.
  const laneRows = lanes.map(l => {
    const br = l.cases.filter(c => c.bucket === 'breached').length;
    const zar = l.cases.reduce((s, c) => s + (c.quantum_zar || 0), 0);
    return { key: l.key, n: l.cases.length, br, zar };
  });
  const maxLaneN = Math.max(1, ...laneRows.map(r => r.n));

  const headline = counts.breached > 0
    ? <>Your book holds <span className="lh-num bad">{fmtZar(overdueZar)}</span> across <span className="lh-num bad">{counts.breached}</span> case{counts.breached === 1 ? '' : 's'} that need you.</>
    : <>Your book is quiet — <span className="lh-num ok">{counts.total}</span> live case{counts.total === 1 ? '' : 's'}, nothing overdue.</>;
  const subtext = counts.breached > 0
    ? `${counts.breached} case${counts.breached === 1 ? '' : 's'} have crossed their deadline. They're ranked below by ZAR at risk × urgency — work the top first. The other ${performing} are performing and stay in your ledger, off this screen.`
    : `${counts.total} live case${counts.total === 1 ? '' : 's'} across ${lanes.length} lanes, all within their covenants. Anything that breaches appears here the moment it does.`;

  return (
    <div className="mer horizon lh">
      <MeridianHeader ctx={<><b>Lender</b><span>{counts.total} live · {counts.breached} need you</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="lender" />

      <section className="lh-board" aria-label="Your lender book">
        <div className="lh-hero">
          <div className="oh-eyebrow">YOUR BOOK · exceptions only</div>
          <h2 className="lh-hero-title hd-serif">{headline}</h2>
          <p className="lh-hero-sub">{subtext}</p>
          <div className="oh-hero-actions">
            <Link to="/new" className="btn pri">+ New facility</Link>
            <Link to="/atlas" className="btn ghost">Browse functions</Link>
          </div>
        </div>

        {/* quiet lane exposure — grey bars; overdue count is the only colour */}
        <div className="lh-lanes">
          {laneRows.map(l => (
            <div key={l.key} className="lh-lane">
              <div className="lh-lane-head">
                <span className="lh-lane-name hd-serif">{cleanLabel(l.key.replace(/_/g, ' '))}</span>
                <span className="oh-mono">{l.n} live{l.br ? ` · ${l.br} overdue` : ''}</span>
              </div>
              <div className="lh-lane-bar"><div className="lh-lane-fill" style={{ width: `${(l.n / maxLaneN) * 100}%` }} /></div>
              <div className="lh-lane-foot">
                {l.br > 0 ? <span className="oh-pill bad">{l.br} need you</span> : <span className="lh-quiet">performing</span>}
                {l.zar > 0 && <span className="oh-mono"> · {fmtZar(l.zar)}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* exceptions — the only detailed list on the screen */}
        <div className="lh-exc-card">
          <div className="lh-exc-head">
            <h3 className="hd-serif">Needs you</h3>
            <span className="oh-mono">{exceptions.length} case{exceptions.length === 1 ? '' : 's'} · ranked by ZAR × urgency</span>
          </div>
          <ActErrorBar error={actErr} onDismiss={() => setActErr(null)} />
          <div className="lh-exc-list">
            {exceptions.map((c, i) => {
              const isOverdue = c.bucket === 'breached';
              return (
                <div key={c.id} className={`lh-exc-row ${isOverdue ? 'hot' : ''}`}>
                  <div className="lh-exc-rank oh-mono">{String(i + 1).padStart(2, '0')}</div>
                  <div className="lh-exc-body">
                    <div className="lh-exc-top">
                      <span className="oh-mono">{c.ref}</span>
                      <span className={`oh-pill ${isOverdue ? 'bad' : c.bucket === 'h2' || c.bucket === 'today' ? 'warn' : 'neu'}`}>{BUCKET_LABEL[c.bucket]}</span>
                      {c.quantum_zar != null && <span className="oh-mono lh-exc-zar">{fmtZar(c.quantum_zar)} at risk</span>}
                    </div>
                    <div className="lh-exc-title hd-serif">{cleanLabel(c.title)}</div>
                    {c.counterparty && <div className="lh-exc-cp">{c.counterparty}</div>}
                    <div className="lh-exc-acts">
                      {c.actions.slice(0, 2).map(a => {
                        const key = `${c.id}:${a.action}`;
                        const busy = acting === key;
                        return (
                          <button key={a.action} type="button"
                            className={a.tone === 'oxide' ? 'btn ox' : a.tone === 'amber' || a.tone === 'gold' ? 'btn gold' : 'btn pri'}
                            title={a.fields?.length ? `${a.cascadeHint} — opens the form` : a.cascadeHint}
                            disabled={acting !== null}
                            aria-busy={busy || undefined}
                            onClick={() => act(c, a)}>
                            {busy ? '…' : a.fields?.length ? `${a.label}…` : a.label}
                          </button>
                        );
                      })}
                      <Link className="btn ghost" to={`/thread/${c.chain}/${c.id}`}>Open thread</Link>
                    </div>
                  </div>
                </div>
              );
            })}
            {exceptions.length === 0 && (
              <div className="lh-quiet-empty">
                <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                <span><b>Nothing needs you.</b> Every facility is within its covenants. We'll surface any breach here the moment it crosses.</span>
              </div>
            )}
          </div>
        </div>

        {/* quiet reassurance footer — the performing book, deliberately grey */}
        {performing > 0 && (
          <div className="lh-reassure">
            <span className="lh-reassure-mark oh-mono">PERFORMING</span>
            <span>{performing} case{performing === 1 ? '' : 's'} are within their covenants and deliberately left off this screen. They're in your <Link to="/atlas">ledger</Link> when you need them — not in your face when you don't.</span>
          </div>
        )}
      </section>
    </div>
  );
}