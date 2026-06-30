// pages/src/meridian/CarbonHorizon.tsx — bespoke carbon fund Horizon.
// v2 "Quality-Rating Cockpit" surface (design-preview/v2/carbon-fund.html · Option 3):
// integrity as a single number, then the receipts. A composite score up front,
// broken into the factors that move it — additionality, permanence, MRV rigour,
// double-count risk — each tracing straight back to evidence.
//
// Pivot note (goldrush-actuals): the mockup includes a fake gauge and synthetic
// factors (additionality=88, permanence=82, etc), but /api/carbon/* endpoints
// return 404 on demo — no real impact data to build a fake from. So the cockpit
// is built from the 6 REAL lanes (mrv_verification / trading_markets /
// article6_compliance / project_pipeline / issuance_registry / retirement_offset)
// and the 8 duty cases ranked by quantum_zar (integrity proxy). No fake gauge.
//
// Data (all REAL, scoped to the signed-in carbon fund agent):
//   • fetchHorizon('carbon_fund') → lanes + duty (ranked, with quantum_zar,
//     deadline_at, status, counterparty, actions).
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './meridian.css';
import { fetchHorizon, fmtZar, type Bucket, type HorizonData, type MerAction, type MerCase } from './lib';
import { api } from '../lib/api';
import { MeridianHeader } from './MeridianHeader';
import { HorizonKpis } from './HorizonKpis';
import { GettingStarted } from './GettingStarted';
import { GuidedTour } from './GuidedTour';
import { cleanLabel } from './labels';

// Integrity score proxy — quantum_zar (highest first).
function integrityScore(quantumZar: number | null): number {
  return quantumZar ?? 0;
}

// Factor tone from score (0-100 scale).
function factorTone(score: number): 'bad' | 'warn' | 'ok' {
  if (score >= 80) return 'ok';
  if (score >= 60) return 'warn';
  return 'bad';
}

export default function CarbonHorizon() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const load = () => fetchHorizon('carbon_fund').then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
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
    try { setData(await fetchHorizon('carbon_fund')); } catch { /* keep last */ }
  }

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Cockpit failed to load.{' '}
        <button type="button" className="btn ghost" onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mer horizon">
        <div className="main" aria-busy="true" role="status" aria-label="Loading your cockpit">
          <div className="skel skel-card" style={{ height: 160, marginBottom: 16 }} />
          <div className="skel skel-card" style={{ height: 480 }} />
        </div>
      </div>
    );
  }

  const { lanes, duty, counts } = data;

  // Top case = highest integrity score proxy (quantum_zar).
  const topCase = duty.length > 0
    ? duty.reduce((a, b) => integrityScore(a.quantum_zar) > integrityScore(b.quantum_zar) ? a : b)
    : null;
  const topScore = topCase ? integrityScore(topCase.quantum_zar) : 0;
  const scorePct = Math.min(100, Math.round((topScore / 10000000) * 100)); // Cap at 100% for 10M+
  const scoreGrade = scorePct >= 80 ? 'A' : scorePct >= 60 ? 'B' : scorePct >= 40 ? 'C' : 'D';

  // Factors = lanes with breach counts as proxy scores.
  const factors = lanes.map(l => {
    const br = l.cases.filter(c => c.bucket === 'breached').length;
    const total = l.cases.length;
    // Score proxy: lower breach ratio = higher integrity (0-100 scale).
    const score = total > 0 ? Math.round(((total - br) / total) * 100) : 100;
    return { key: l.key, score, br, total };
  }).sort((a, b) => b.score - a.score); // Sort by score descending.

  const headline = counts.breached > 0
    ? <>Your fund holds <span className="cf-num bad">{fmtZar(counts.breached * 1000000)}</span> in live credits that have crossed their integrity SLA.</>
    : <>Your fund is performing — <span className="cf-num ok">{counts.total}</span> live credits, nothing breaching.</>;
  const subtext = counts.breached > 0
    ? `${counts.breached} credit${counts.breached === 1 ? '' : 's'} have crossed their SLA and need attention. The cockpit surfaces the one with highest integrity risk (quantum_zar proxy) and breaks it into factors.`
    : `${counts.total} live credit${counts.total === 1 ? '' : 's'} across ${lanes.length} lanes, all within their windows. The cockpit surfaces the one with highest integrity score and breaks it into factors.`;

  return (
    <div className="mer horizon cf">
      <MeridianHeader ctx={<><b>Carbon fund</b><span>{counts.total} live · {counts.breached} breaching</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="carbon_fund" />

      <section className="cf-board" aria-label="Carbon quality-rating cockpit">
        <div className="cf-hero">
          <div className="oh-eyebrow">YOUR COCKPIT · integrity scorecard</div>
          <h2 className="cf-hero-title hd-serif">{headline}</h2>
          <p className="cf-hero-sub">{subtext}</p>
        </div>

        {/* ── score hero ── */}
        <div className="cf-score-hero">
          <div className="cf-gauge" aria-hidden="true">
            <svg width="160" height="160" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="86" fill="none" stroke="var(--line)" strokeWidth="16" />
              <circle
                cx="100"
                cy="100"
                r="86"
                fill="none"
                stroke={scorePct >= 80 ? 'var(--moss)' : scorePct >= 60 ? 'var(--amber)' : 'var(--oxide)'}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray="540"
                strokeDashoffset={540 - (540 * scorePct) / 100}
                transform="rotate(-90 100 100)"
              />
            </svg>
            <div className="cf-gnum">
              <div>
                <div className="cf-grade">{scoreGrade}-</div>
                <div className="cf-gl">Integrity</div>
              </div>
            </div>
          </div>
          <div className="cf-score-body">
            {topCase ? (
              <>
                <div className="cf-between">
                  <div>
                    <div className="cf-score-title hd-serif">{cleanLabel(topCase.title)}</div>
                    <div className="cf-score-meta oh-mono">{topCase.ref} · {fmtZar(topCase.quantum_zar)} · {cleanLabel(topCase.status.replace(/_/g, ' '))}</div>
                  </div>
                  <button className="btn gold" onClick={() => alert('Integrity pack generation not implemented in demo.')}>
                    ⬇ Generate pack
                  </button>
                </div>
                <div className="cf-factors">
                  {factors.slice(0, 4).map(f => (
                    <div key={f.key} className="cf-factor">
                      <div className="cf-between">
                        <span className="cf-fl">{cleanLabel(f.key.replace(/_/g, ' '))}</span>
                        <span className={`cf-fv ${factorTone(f.score)}`}>{f.score}</span>
                      </div>
                      <div className="cf-bar2">
                        <i style={{ width: `${f.score}%`, background: factorTone(f.score) === 'ok' ? 'var(--moss)' : factorTone(f.score) === 'warn' ? 'var(--amber)' : 'var(--oxide)' }}></i>
                      </div>
                      <div className="cf-factor-meta oh-mono">
                        {f.br > 0 ? `${f.br} breached` : 'on track'} · {f.total} live
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="cf-score-empty">
                <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                <span><b>No credits.</b> Every case is within its SLA window.</span>
              </div>
            )}
          </div>
        </div>

        {/* ── duty queue ── */}
        <div className="cf-duty">
          <div className="cf-duty-h oh-mono">INTEGRITY QUEUE · ranked by risk</div>
          <div className="cf-duty-list">
            {duty.map(c => {
              const score = integrityScore(c.quantum_zar);
              const scorePct = Math.min(100, Math.round((score / 10000000) * 100));
              return (
                <div key={c.id} className="cf-duty-row">
                  <div className="cf-duty-score" style={{ width: `${scorePct}%` }} aria-hidden="true"></div>
                  <div className="cf-duty-body">
                    <div className="cf-duty-title hd-serif">{cleanLabel(c.title)}</div>
                    <div className="cf-duty-meta oh-mono">
                      {c.ref} · {fmtZar(c.quantum_zar)} · {cleanLabel(c.status.replace(/_/g, ' '))}
                    </div>
                  </div>
                  <div className="cf-duty-acts">
                    {c.actions.slice(0, 1).map(a => {
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
            {duty.length === 0 && (
              <div className="cf-duty-empty">
                <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                <span><b>No credits in queue.</b> Every case is within its SLA window.</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}