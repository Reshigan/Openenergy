// pages/src/meridian/GridHorizon.tsx — bespoke grid operator Horizon.
// v2 "Constraint Alarm Board" surface (design-preview/v2/grid-operator.html · Option 3):
// a three-column alarm board — Critical · Warning · Watch — where every grid
// chain becomes a triage card with its live state-flow and SLA timer. The
// operator works top-down by severity and clears each alarm with an inline
// action; the card carries its own evidence, never a detour.
//
// Pivot note (goldrush-actuals): the mockup includes real-time telebars and
// synthetic grid telemetry, but /api/grid/* endpoints return 404 on demo — no
// real-time telemetry to build a fake from. So the alarm board is built from
// the 4 REAL lanes (connections / operations_grid / compliance_grid / monitoring)
// and the 8 duty cases ranked by SLA risk. No fake telebars.
//
// Data (all REAL, scoped to the signed-in grid operator):
//   • fetchHorizon('grid_operator') → lanes + duty (ranked, with quantum_zar,
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

// Alarm severity from bucket.
type Severity = 'critical' | 'warning' | 'watch';
const SEVERITY_OF: Record<Bucket, Severity> = {
  breached: 'critical', h2: 'warning', today: 'warning', h48: 'warning', week: 'watch', later: 'watch',
};
const SEVERITY_META: Record<Severity, { label: string; tone: 'bad' | 'warn' | 'ok' }> = {
  critical: { label: 'Critical · Act now', tone: 'bad' },
  warning: { label: 'Warning · Watch SLA', tone: 'warn' },
  watch: { label: 'Watch · In-flow', tone: 'ok' },
};

// SLA offset from deadline_at → "04:51" (breached) / "2d 04h" (remaining).
function slaClock(deadlineAt: string | null, now: Date): { text: string; past: boolean } | null {
  if (!deadlineAt) return null;
  const ms = Date.parse(deadlineAt) - now.getTime();
  const past = ms < 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600_000);
  const m = Math.floor((abs % 3600_000) / 60_000);
  const d = Math.floor(abs / 86_400_000);
  if (d > 0) return { text: `${d}d ${h}h`, past };
  return { text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, past };
}

export default function GridHorizon() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const load = () => fetchHorizon('grid_operator').then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
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
    try { setData(await fetchHorizon('grid_operator')); } catch { /* keep last */ }
  }

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Board failed to load.{' '}
        <button type="button" className="btn ghost" onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mer horizon">
        <div className="main" aria-busy="true" role="status" aria-label="Loading your board">
          <div className="skel skel-card" style={{ height: 160, marginBottom: 16 }} />
          <div className="skel skel-card" style={{ height: 480 }} />
        </div>
      </div>
    );
  }

  const { lanes, duty, counts } = data;
  const now = new Date();

  // Group duty cases by severity.
  const alarms: Record<Severity, MerCase[]> = { critical: [], warning: [], watch: [] };
  for (const c of duty) alarms[SEVERITY_OF[c.bucket]].push(c);
  const totalAlarms = duty.length;

  const headline = counts.breached > 0
    ? <>Your network holds <span className="gd-num bad">{fmtZar(counts.breached * 1000000)}</span> in live alarms that have crossed their SLA.</>
    : <>Your network is stable — <span className="gd-num ok">{counts.total}</span> live cases, nothing breaching.</>;
  const subtext = counts.breached > 0
    ? `${counts.breached} alarm${counts.breached === 1 ? '' : 's'} have crossed their SLA and sit in Critical. The rest are in Warning (at-risk) or Watch (on-track). Work top-down by severity.`
    : `${counts.total} live case${counts.total === 1 ? '' : 's'} across ${lanes.length} lanes, all within their windows. Anything that breaches surfaces in Critical the moment it crosses.`;

  return (
    <div className="mer horizon gd">
      <MeridianHeader ctx={<><b>Grid operator</b><span>{counts.total} live · {counts.breached} breaching</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="grid_operator" />

      <section className="gd-board" aria-label="Grid constraint alarm board">
        <div className="gd-hero">
          <div className="oh-eyebrow">YOUR BOARD · triaged by SLA severity</div>
          <h2 className="gd-hero-title hd-serif">{headline}</h2>
          <p className="gd-hero-sub">{subtext}</p>
        </div>

        {/* ── alarm board ── */}
        <ActErrorBar error={actErr} onDismiss={() => setActErr(null)} />
        <div className="gd-cols">
          {(['critical', 'warning', 'watch'] as Severity[]).map(sev => {
            const meta = SEVERITY_META[sev];
            const cs = alarms[sev];
            return (
              <div key={sev} className={`gd-col gd-col-${meta.tone}`} aria-label={meta.label}>
                <div className="gd-col-h">
                  <span className="gd-col-t">{meta.label}</span>
                  <span className="gd-col-n oh-mono">{cs.length}</span>
                </div>
                <div className="gd-alarm-list">
                  {cs.map(c => {
                    const clock = slaClock(c.deadline_at, now);
                    const isOverdue = c.bucket === 'breached';
                    return (
                      <div key={c.id} className={`gd-alarm ${isOverdue ? 'hot' : ''}`}>
                        <div className="gd-alarm-top">
                          <div>
                            <div className="gd-alarm-name hd-serif">{cleanLabel(c.title)}</div>
                            <div className="gd-alarm-chain oh-mono">{c.chain} · {c.ref}</div>
                          </div>
                          {clock && <span className={`gd-sla ${clock.past ? 'r' : meta.tone === 'bad' ? 'r' : meta.tone === 'warn' ? 'a' : 'g'}`}>{clock.text}</span>}
                        </div>
                        <div className="gd-state-flow oh-mono">
                          {cleanLabel(c.status.replace(/_/g, ' '))}
                        </div>
                        <div className="gd-alarm-acts">
                          {c.actions.slice(0, 2).map((a, ai) => {
                            const key = `${c.id}:${a.action}`;
                            const busy = acting === key;
                            return (
                              <button key={a.action} type="button"
                                className={a.tone === 'oxide' ? 'btn ox' : a.tone === 'amber' || a.tone === 'gold' ? 'btn gold' : ai === 0 ? 'btn pri' : 'btn quiet'}
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
                  {cs.length === 0 && (
                    <div className="gd-alarm-empty">
                      <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                      <span><b>No alarms.</b> Every case is within its SLA window.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── lanes summary ── */}
        <div className="gd-lanes">
          <div className="gd-lanes-h oh-mono">ALL LANES · {lanes.length} workstreams</div>
          <div className="gd-lanes-grid">
            {lanes.map(l => {
              const br = l.cases.filter(c => c.bucket === 'breached').length;
              const hasAtRisk = l.cases.some(c => ['h2', 'today', 'h48'].includes(c.bucket));
              return (
                <div key={l.key} className="gd-lane-card">
                  <div className="gd-lane-name hd-serif">{cleanLabel(l.key.replace(/_/g, ' '))}</div>
                  <div className="gd-lane-meta oh-mono">
                    {l.cases.length} live{br ? ` · ${br}!` : ''}{hasAtRisk ? ' · at risk' : ''}
                  </div>
                  <Link className="gd-lane-link oh-mono" to={`/cockpit`}>open →</Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}