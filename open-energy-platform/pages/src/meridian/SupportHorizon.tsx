// pages/src/meridian/SupportHorizon.tsx — bespoke support Horizon.
// Help-desk ticket triage surface (no mockup — 404):
// a three-column board — Breached · At Risk · On Track — where every support
// chain becomes a triage card with its live state-flow and SLA timer. The
// support agent works top-down by urgency and clears each ticket with an
// inline action; the card carries its own evidence, never a detour.
//
// Data (all REAL, scoped to the signed-in support agent):
//   • fetchHorizon('support') → lanes + duty (ranked, with quantum_zar,
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

// Ticket urgency from bucket.
type Urgency = 'breached' | 'risk' | 'track';
const URG_OF: Record<Bucket, Urgency> = {
  breached: 'breached', h2: 'risk', today: 'risk', h48: 'risk', week: 'track', later: 'track',
};
const URG_META: Record<Urgency, { label: string; tone: 'bad' | 'warn' | 'ok' }> = {
  breached: { label: 'Breached · Act now', tone: 'bad' },
  risk: { label: 'At risk · Watch SLA', tone: 'warn' },
  track: { label: 'On track · Queued', tone: 'ok' },
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

export default function SupportHorizon() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const load = () => fetchHorizon('support').then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
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
    try { setData(await fetchHorizon('support')); } catch { /* keep last */ }
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

  // Group duty cases by urgency.
  const tickets: Record<Urgency, MerCase[]> = { breached: [], risk: [], track: [] };
  for (const c of duty) tickets[URG_OF[c.bucket]].push(c);
  const totalTickets = duty.length;

  const headline = counts.breached > 0
    ? <>Your desk holds <span className="su-num bad">{fmtZar(counts.breached * 1000000)}</span> in live tickets that have crossed their SLA.</>
    : <>Your desk is calm — <span className="su-num ok">{counts.total}</span> live tickets, nothing breaching.</>;
  const subtext = counts.breached > 0
    ? `${counts.breached} ticket${counts.breached === 1 ? '' : 's'} have crossed their SLA and sit in Breached. The rest are in At Risk or On Track. Work top-down by urgency.`
    : `${counts.total} live ticket${counts.total === 1 ? '' : 's'} across ${lanes.length} lanes, all within their windows. Anything that breaches surfaces in Breached the moment it crosses.`;

  return (
    <div className="mer horizon su">
      <MeridianHeader ctx={<><b>Support</b><span>{counts.total} live · {counts.breached} breaching</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="support" />

      <section className="su-board" aria-label="Support ticket triage board">
        <div className="su-hero">
          <div className="oh-eyebrow">YOUR DESK · triaged by SLA urgency</div>
          <h2 className="su-hero-title hd-serif">{headline}</h2>
          <p className="su-hero-sub">{subtext}</p>
        </div>

        {/* ── ticket board ── */}
        <ActErrorBar error={actErr} onDismiss={() => setActErr(null)} />
        <div className="su-cols">
          {(['breached', 'risk', 'track'] as Urgency[]).map(urg => {
            const meta = URG_META[urg];
            const cs = tickets[urg];
            return (
              <div key={urg} className={`su-col su-col-${meta.tone}`} aria-label={meta.label}>
                <div className="su-col-h">
                  <span className="su-col-t">{meta.label}</span>
                  <span className="su-col-n oh-mono">{cs.length}</span>
                </div>
                <div className="su-ticket-list">
                  {cs.map(c => {
                    const clock = slaClock(c.deadline_at, now);
                    const isOverdue = c.bucket === 'breached';
                    return (
                      <div key={c.id} className={`su-ticket ${isOverdue ? 'hot' : ''}`}>
                        <div className="su-ticket-top">
                          <div>
                            <div className="su-ticket-name hd-serif">{cleanLabel(c.title)}</div>
                            <div className="su-ticket-chain oh-mono">{c.chain} · {c.ref}</div>
                          </div>
                          {clock && <span className={`su-sla ${clock.past ? 'r' : meta.tone === 'bad' ? 'r' : meta.tone === 'warn' ? 'a' : 'g'}`}>{clock.text}</span>}
                        </div>
                        <div className="su-state-flow oh-mono">
                          {cleanLabel(c.status.replace(/_/g, ' '))}
                        </div>
                        <div className="su-ticket-acts">
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
                    <div className="su-ticket-empty">
                      <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                      <span><b>No tickets.</b> Every case is within its SLA window.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── lanes summary ── */}
        <div className="su-lanes">
          <div className="su-lanes-h oh-mono">ALL LANES · {lanes.length} workstreams</div>
          <div className="su-lanes-grid">
            {lanes.map(l => {
              const br = l.cases.filter(c => c.bucket === 'breached').length;
              const hasAtRisk = l.cases.some(c => ['h2', 'today', 'h48'].includes(c.bucket));
              return (
                <div key={l.key} className="su-lane-card">
                  <div className="su-lane-name hd-serif">{cleanLabel(l.key.replace(/_/g, ' '))}</div>
                  <div className="su-lane-meta oh-mono">
                    {l.cases.length} live{br ? ` · ${br}!` : ''}{hasAtRisk ? ' · at risk' : ''}
                  </div>
                  <Link className="su-lane-link oh-mono" to={`/cockpit`}>open →</Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}