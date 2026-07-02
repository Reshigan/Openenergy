// pages/src/meridian/IppHorizon.tsx — bespoke IPP developer Horizon.
// v2 "Calm Milestone-Guide" surface (design-preview/v2/ipp-developer.html · Option 2):
// strip the cockpit to ONE recommended next action and a linear, reassuring
// milestone spine. The novice IPP PM never mines a portfolio — the screen names
// the single next gated action, why it matters, and a button to act. Everything
// else recedes into an ordered spine of workstreams.
//
// Pivot note (goldrush-actuals): the mockup is per-project (Karoo Solar One path
// to COD), but /api/roles/ipp/portfolio returns project_count:0 on demo — the
// per-project stage spine would be a fake. So the spine is built from the 14 REAL
// workstream lanes (finance / construction / regulatory_risk / safety_grid /
// risk_quality / environmental / documents / mir / subcontractors / dfr /
// handover_dossier / wbs_schedule / cost_evm / project_controls), ordered by
// breach severity — the workstream most needing the developer surfaces at the
// top, calm ones recede. The "next action" is the top-ranked duty case.
//
// Data (all REAL, scoped to the signed-in IPP developer):
//   • fetchHorizon('ipp_developer') → lanes + duty (ranked, with quantum_zar,
//     deadline_at, status, counterparty, actions).
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

// Spine node tone from the workstream's worst bucket.
type SpineTone = 'now' | 'next' | 'done';
function spineTone(br: number, hasAtRisk: boolean): SpineTone {
  if (br > 0) return 'now';
  if (hasAtRisk) return 'next';
  return 'done';
}
const AT_RISK: Bucket[] = ['h2', 'today', 'h48'];

export default function IppHorizon() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const load = () => fetchHorizon('ipp_developer').then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
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
    try { setData(await fetchHorizon('ipp_developer')); } catch { /* keep last */ }
  }

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Guide failed to load.{' '}
        <button type="button" className="btn ghost" onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mer horizon">
        <div className="main" aria-busy="true" role="status" aria-label="Loading your guide">
          <div className="skel skel-card" style={{ height: 160, marginBottom: 16 }} />
          <div className="skel skel-card" style={{ height: 420 }} />
        </div>
      </div>
    );
  }

  const { lanes, duty, counts } = data;
  const totalZar = duty.reduce((s, c) => s + (c.quantum_zar || 0), 0);
  const performing = counts.total - counts.breached;
  const performingPct = counts.total > 0 ? Math.round((performing / counts.total) * 100) : 100;

  // Single next action = top-ranked duty case (highest score = ZAR × urgency).
  const nextAction = duty[0] ?? null;

  // Spine rows: lanes ordered by breach severity (breached count desc, then ZAR
  // desc), so the workstream most needing the developer sits at the top.
  const spineRows = lanes.map(l => {
    const br = l.cases.filter(c => c.bucket === 'breached').length;
    const hasAtRisk = l.cases.some(c => AT_RISK.includes(c.bucket));
    const zar = l.cases.reduce((s, c) => s + (c.quantum_zar || 0), 0);
    return { key: l.key, n: l.cases.length, br, zar, tone: spineTone(br, hasAtRisk) };
  }).sort((a, b) => b.br - a.br || b.zar - a.zar);

  const headline = counts.breached > 0
    ? <>Your portfolio holds <span className="ip-num bad">{fmtZar(totalZar)}</span> at risk across <span className="ip-num bad">{counts.breached}</span> case{counts.breached === 1 ? '' : 's'} that have crossed their deadline.</>
    : <>Your portfolio is on track — <span className="ip-num ok">{counts.total}</span> live case{counts.total === 1 ? '' : 's'}, nothing breaching.</>;
  const subtext = counts.breached > 0
    ? `${performingPct}% of your ${counts.total} live cases are performing and stay in the spine below. The rest have crossed their deadline — the one that matters most is named below, with a single button to act. The other ${counts.breached - 1 > 0 ? counts.breached - 1 : 0} recede into the spine in order of urgency.`
    : `${counts.total} live case${counts.total === 1 ? '' : 's'} across ${lanes.length} workstreams, all within their windows. Anything that breaches surfaces as your next action the moment it crosses.`;

  // Conic ring style — performing % filled in steel, remainder muted.
  const ringStyle = { background: `conic-gradient(var(--petrol) 0 ${performingPct}%, var(--line) ${performingPct}% 100%)` };

  return (
    <div className="mer horizon ip">
      <MeridianHeader ctx={<><b>IPP developer</b><span>{counts.total} live · {counts.breached} breaching</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="ipp_developer" />

      <section className="ip-board" aria-label="IPP developer guide">
        <div className="ip-hero">
          <div className="oh-eyebrow">YOUR GUIDE · one next action</div>
          <h2 className="ip-hero-title hd-serif">{headline}</h2>
          <p className="ip-hero-sub">{subtext}</p>
        </div>

        {/* ── single next action ── */}
        <div className="ip-next">
          <div className="ip-next-ring" style={ringStyle} aria-hidden="true">
            <div className="ip-next-ring-in"><b>{performingPct}%</b><span>performing</span></div>
          </div>
          <div className="ip-next-body">
            <div className="ip-next-eyebrow oh-mono">DO THIS NEXT</div>
            {nextAction ? (
              <>
                <h3 className="ip-next-title hd-serif">{cleanLabel(nextAction.title)}</h3>
                <div className="ip-next-why">
                  <span className="oh-mono">{nextAction.ref}</span>
                  <span className="oh-mono">· {cleanLabel(nextAction.status.replace(/_/g, ' '))}</span>
                  {nextAction.counterparty && <span>· {nextAction.counterparty}</span>}
                  {nextAction.quantum_zar != null && <span className="ip-next-zar oh-mono">· {fmtZar(nextAction.quantum_zar)} at risk</span>}
                </div>
                <p className="ip-next-line">
                  {nextAction.bucket === 'breached'
                    ? 'This case has crossed its statutory deadline and carries the highest urgency × ZAR score on your desk. Acting here first costs the least.'
                    : 'This case sits inside its warning band and ranks highest on your desk. Acting here first keeps the portfolio calm.'}
                </p>
              </>
            ) : (
              <div className="ip-next-empty">
                <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                <span><b>Nothing needs you.</b> Every case is within its window. We'll name the next action the moment something breaches.</span>
              </div>
            )}
          </div>
          <ActErrorBar error={actErr} onDismiss={() => setActErr(null)} />
          {nextAction && nextAction.actions.length > 0 && (
            <div className="ip-next-cta">
              {(() => {
                const a = nextAction.actions[0];
                const key = `${nextAction.id}:${a.action}`;
                const busy = acting === key;
                return (
                  <button type="button"
                    className={a.tone === 'oxide' ? 'btn ox' : 'btn pri'}
                    title={a.fields?.length ? `${a.cascadeHint} — opens the form` : a.cascadeHint}
                    disabled={acting !== null}
                    aria-busy={busy || undefined}
                    onClick={() => act(nextAction, a)}>
                    {busy ? '…' : a.fields?.length ? `${a.label}…` : a.label} →
                  </button>
                );
              })()}
              <Link className="btn ghost" to={`/thread/${nextAction.chain}/${nextAction.id}`}>Open case</Link>
            </div>
          )}
        </div>

        {/* ── milestone spine — workstreams ordered by urgency ── */}
        <div className="ip-spine">
          <div className="ip-spine-h">
            <span className="hd-serif">Where your work stands</span>
            <span className="oh-mono">{lanes.length} workstreams · ordered by urgency</span>
          </div>
          <ol className="ip-spine-list">
            {spineRows.map((r, i) => (
              <li key={r.key} className={`ip-step ${r.tone}`}>
                <span className={`ip-node ${r.tone}`}>
                  {r.tone === 'done' ? '✓' : r.tone === 'now' ? '●' : i + 1}
                </span>
                <div className="ip-step-body">
                  <div className="ip-step-top">
                    <b className="hd-serif">{cleanLabel(r.key.replace(/_/g, ' '))}</b>
                    <span className={`oh-pill ${r.tone === 'now' ? 'bad' : r.tone === 'next' ? 'warn' : 'ok'}`}>
                      {r.tone === 'now' ? `${r.br} overdue` : r.tone === 'next' ? 'at risk' : 'on track'}
                    </span>
                  </div>
                  <div className="ip-step-meta oh-mono">
                    {r.n} live{r.br ? ` · ${r.br} breaching` : ''}{r.zar > 0 ? ` · ${fmtZar(r.zar)}` : ''}
                  </div>
                </div>
                <Link className="ip-step-link oh-mono" to={`/cockpit`}>open →</Link>
              </li>
            ))}
          </ol>
          <p className="ip-spine-foot">
            {performing} performing case{performing === 1 ? '' : 's'} are within their windows and deliberately recede down the spine. They're in your <Link to="/cockpit">cockpit</Link> when you need them — not in your face when you don't.
          </p>
        </div>
      </section>
    </div>
  );
}