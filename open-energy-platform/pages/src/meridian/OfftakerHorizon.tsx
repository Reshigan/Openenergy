// pages/src/meridian/OfftakerHorizon.tsx — bespoke offtaker Horizon.
// v2 "Honest Number" surface (design-preview/v2/offtaker.html · Option 1):
// one plain-English answer first, three plain cards, the contract in plain
// terms, and one guided next step. Consumer-grade, not control-room — built
// for a buyer who is not an energy trader and checks in a few times a week.
//
// All numbers are REAL, sourced from existing scoped endpoints (no mocks):
//   • GET /api/offtaker/obligations            → oe_offtaker_ppa_obligations
//     (contracted_mwh, delivered_mwh, take_or_pay_amount_zar, status,
//     cure_deadline_at, period_month, ppa_id). Server scopes to the signed-in
//     offtaker (participant_id = user.id).
//   • GET /api/roles/offtaker/ppa-portfolio    → off_ppa_portfolio (the PPA
//     master the obligations join to: counterparty_name, technology,
//     capacity_mw, contract_ref, status).
//   • fetchHorizon('offtaker')                 → duty stream (one-thing-needs-
//     you + the action to take).
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './meridian.css';
import { api } from '../lib/api';
import { fetchHorizon, fmtZar, type HorizonData, type MerAction, type MerCase } from './lib';
import { ActErrorBar } from './components';
import { MeridianHeader } from './MeridianHeader';
import { HorizonKpis } from './HorizonKpis';
import { GettingStarted } from './GettingStarted';
import { GuidedTour } from './GuidedTour';

interface ObligationRow {
  id: string; ppa_id: string; period_month: string;
  contracted_mwh: number; delivered_mwh: number;
  threshold_pct: number; cure_deadline_at: string | null;
  status: 'pending' | 'delivered' | 'shortfall' | 'cured' | 'take_or_pay';
  take_or_pay_amount_zar: number;
}

interface PortfolioRow {
  id: string; counterparty_name: string; technology: string | null;
  capacity_mw: number | null; contract_ref: string | null; status: string;
}

function fmtMwh(v: number | null | undefined): string {
  if (v == null) return '0';
  return v.toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}
function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.round((new Date(deadline).getTime() - Date.now()) / 86400_000);
}
// Plain-language contract status from the portfolio row's status field.
function statusPhrase(status: string): string {
  switch (status) {
    case 'active': return 'active and delivering';
    case 'signed': return 'signed — activation pending';
    case 'negotiating': case 'in_negotiation': return 'in negotiation — nothing is binding yet';
    case 'draft': return 'draft — nothing is binding yet';
    case 'expired': return 'expired';
    case 'terminated': return 'terminated';
    default: return status.replace(/_/g, ' ');
  }
}

export default function OfftakerHorizon() {
  const navigate = useNavigate();
  const [obs, setObs] = React.useState<ObligationRow[] | null>(null);
  const [portfolio, setPortfolio] = React.useState<PortfolioRow[] | null>(null);
  const [horizon, setHorizon] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [o, p, h] = await Promise.all([
          api.get('/offtaker/obligations').then(r => (r.data?.data as ObligationRow[]) ?? []),
          api.get('/roles/offtaker/ppa-portfolio').then(r => (r.data?.data as PortfolioRow[]) ?? []),
          fetchHorizon('offtaker').catch(() => null),
        ]);
        if (!live) return;
        setObs(o); setPortfolio(p); setHorizon(h); setErr(null);
      } catch (e: any) { if (live) setErr(String(e?.message ?? e)); }
    };
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
    try { setHorizon(await fetchHorizon('offtaker')); } catch { /* keep last */ }
  }

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Couldn't load your delivery summary.{' '}
        <button type="button" className="btn ghost" onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }
  if (!obs || !portfolio) {
    return (
      <div className="mer horizon">
        <div className="main" aria-busy="true" role="status" aria-label="Loading your delivery summary">
          <div className="skel skel-card" style={{ height: 180, marginBottom: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            <div className="skel skel-card" style={{ height: 130 }} />
            <div className="skel skel-card" style={{ height: 130 }} />
            <div className="skel skel-card" style={{ height: 130 }} />
          </div>
        </div>
      </div>
    );
  }

  const ppaName = (id: string) => {
    const p = portfolio.find(x => x.id === id);
    if (!p) return 'Your PPA';
    const tech = p.technology ? ` ${p.technology}` : '';
    const cap = p.capacity_mw ? ` · ${p.capacity_mw} MW` : '';
    return `${p.counterparty_name}${tech}${cap}`;
  };
  const ppaRow = (id: string) => portfolio.find(x => x.id === id) ?? null;

  // ── portfolio truth for the latest obligation month ────────────────────────
  const latestMonth = obs.length ? obs.reduce((m, o) => o.period_month > m ? o.period_month : m, obs[0].period_month) : null;
  const monthObs = latestMonth ? obs.filter(o => o.period_month === latestMonth) : [];
  const contractedTotal = monthObs.reduce((s, o) => s + (o.contracted_mwh || 0), 0);
  const deliveredTotal = monthObs.reduce((s, o) => s + (o.delivered_mwh || 0), 0);
  const pct = contractedTotal > 0 ? (deliveredTotal / contractedTotal) * 100 : null;
  const gap = Math.max(0, contractedTotal - deliveredTotal);
  const hasShortfall = monthObs.some(o => o.status === 'shortfall');
  const hasTop = monthObs.some(o => o.status === 'take_or_pay');
  const topExposure = monthObs
    .filter(o => o.status === 'take_or_pay' || o.status === 'shortfall')
    .reduce((s, o) => s + (o.take_or_pay_amount_zar || 0), 0);

  // per-site gauges for the month
  const perSite = monthObs.map(o => ({
    ppa_id: o.ppa_id,
    name: ppaName(o.ppa_id),
    contracted: o.contracted_mwh || 0,
    delivered: o.delivered_mwh || 0,
    status: o.status,
    pct: o.contracted_mwh > 0 ? (o.delivered_mwh / o.contracted_mwh) * 100 : null,
    cure: daysUntil(o.cure_deadline_at),
  })).sort((a, b) => a.pct === null ? 1 : b.pct === null ? -1 : (a.pct ?? 0) - (b.pct ?? 0));

  // hero site = the obligated PPA delivering the most this month
  const heroSite = [...perSite].sort((a, b) => b.contracted - a.contracted)[0] ?? null;
  const heroPpa = heroSite ? ppaRow(heroSite.ppa_id) : null;

  // one thing that needs you: real horizon duty first, else nearest cure deadline
  const duty = horizon?.duty ?? [];
  const oneThing = duty[0] ?? null;
  const fallbackUrgent = perSite.find(s => s.status === 'shortfall' && s.cure != null && s.cure >= 0) ?? null;

  // ── headline sentence + tone ───────────────────────────────────────────────
  const tone: 'ok' | 'warn' | 'bad' = hasTop ? 'bad' : hasShortfall ? 'warn' : (pct == null ? 'ok' : pct >= 98 ? 'ok' : pct >= 90 ? 'warn' : 'bad');
  const pctTxt = pct == null ? '—' : pct.toFixed(1) + '%';
  const monthLabel = latestMonth
    ? new Date(latestMonth + '-01').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    : 'this period';
  const monthShort = monthLabel.split(' ')[0];
  const headline = contractedTotal > 0
    ? <>You're getting <span className={`oh-num ${tone}`}>{pctTxt}</span> of the energy you contracted.</>
    : <>No delivered energy to reconcile yet <span className="oh-num ok">this period</span>.</>;
  const subtext = contractedTotal > 0
    ? hasTop
      ? `A take-or-pay liability of ${fmtZar(topExposure)} has accrued on ${heroSite ? heroSite.name : 'your PPA'} this ${monthShort}. Review the exposure below before it settles.`
      : hasShortfall
        ? `Delivery is tracking under contract on ${perSite.filter(s => s.status === 'shortfall').length} site${perSite.filter(s => s.status === 'shortfall').length === 1 ? '' : 's'} this ${monthShort}. A cure window is open — the generator can still make good before any deemed-energy adjustment.`
        : `${heroSite ? heroSite.name : 'Your portfolio'} has delivered ${fmtMwh(deliveredTotal)} MWh against your ${fmtMwh(contractedTotal)} MWh nomination. The ${fmtMwh(gap)} MWh gap is within your tolerance — no action needed.`
    : 'Your PPA delivery summary appears here once your generator submits the first meter reading for the period.';

  // other active contracts in the portfolio (not obligated this month)
  const obligatedIds = new Set(monthObs.map(o => o.ppa_id));
  const otherContracts = portfolio.filter(p => !obligatedIds.has(p.id));

  return (
    <div className="mer horizon oh">
      <MeridianHeader ctx={<><b>Offtaker</b><span>{monthObs.length} site{monthObs.length === 1 ? '' : 's'} · {monthLabel}</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="offtaker" />

      <section className="oh-board" aria-label="Your delivery summary">
        {/* ── hero honest number ── */}
        <div className="oh-hero">
          <div className="oh-hero-glow" aria-hidden="true" />
          <div className="oh-eyebrow">{monthLabel.toUpperCase()} · so far</div>
          <h2 className="oh-hero-title hd-serif">{headline}</h2>
          <p className="oh-hero-sub">{subtext}</p>
          <div className="oh-hero-actions">
            <Link to="/ledger/ppa_obligation" className="btn pri">See the breakdown</Link>
            <Link to="/surface/offtaker:ppa_portfolio" className="btn ghost">View your contracts</Link>
          </div>
        </div>

        {/* ── three plain cards ── */}
        <div className="oh-cards">
          <div className="oh-card">
            <div className="oh-card-l">Take-or-pay exposure</div>
            <div className={`oh-card-v hd-serif ${topExposure > 0 ? 'warn' : 'ok'}`}>{topExposure > 0 ? fmtZar(topExposure) : 'R 0'}</div>
            <div className="oh-card-d">
              {topExposure > 0
                ? 'A shortfall liability is building. Review the cure window below before it settles.'
                : "You're taking everything you pay for. No shortfall building up this period."}
            </div>
            <span className={`oh-pill ${topExposure > 0 ? 'warn' : 'ok'}`}>
              {topExposure > 0 ? '● Exposure accruing' : '● Clear · within contract'}
            </span>
          </div>

          <div className="oh-card">
            <div className="oh-card-l">Delivered this {monthShort}</div>
            <div className="oh-card-v hd-serif">{fmtMwh(deliveredTotal)}<span className="oh-unit"> MWh</span></div>
            <div className="oh-card-d">
              of {fmtMwh(contractedTotal)} MWh contracted across {monthObs.length} site{monthObs.length === 1 ? '' : 's'}.
            </div>
            <span className={`oh-pill ${tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : 'ok'}`}>
              {pct == null ? '● Awaiting readings' : `● ${pct.toFixed(1)}% of contracted`}
            </span>
          </div>

          <div className={`oh-card ${oneThing || fallbackUrgent ? 'oh-card-action' : ''}`}>
            {oneThing || fallbackUrgent ? (
              <>
                <div className="oh-card-l amber">One thing needs you</div>
                <div className="oh-card-v-action hd-serif">
                  {oneThing ? oneThing.title : `${fallbackUrgent!.name} shortfall`}
                </div>
                <div className="oh-card-d">
                  {oneThing
                    ? oneThing.ref
                    : `Cure window ${fallbackUrgent!.cure === 0 ? 'closes today' : `closes in ${fallbackUrgent!.cure} day${fallbackUrgent!.cure === 1 ? '' : 's'}`}.`}
                </div>
                {oneThing ? (
                  <><ActErrorBar error={actErr} onDismiss={() => setActErr(null)} />
                  <div className="oh-card-acts">
                    {oneThing.actions.slice(0, 1).map(a => {
                      const key = `${oneThing.id}:${a.action}`;
                      const busy = acting === key;
                      return (
                        <button key={a.action} type="button"
                          className={a.tone === 'oxide' ? 'btn ox' : 'btn gold'}
                          title={a.fields?.length ? `${a.cascadeHint} — opens the form` : a.cascadeHint}
                          disabled={acting !== null}
                          aria-busy={busy || undefined}
                          onClick={() => act(oneThing, a)}>
                          {busy ? '…' : a.fields?.length ? `${a.label}…` : a.label}
                        </button>
                      );
                    })}
                    <Link className="btn ghost" to={`/thread/${oneThing.chain}/${oneThing.id}`}>Open</Link>
                  </div></>
                ) : (
                  <Link className="btn gold" to="/ledger/ppa_obligation">Review cure window</Link>
                )}
              </>
            ) : (
              <>
                <div className="oh-card-l ok">All clear</div>
                <div className="oh-card-v hd-serif ok">Nothing needs you</div>
                <div className="oh-card-d">Delivery is on track and no take-or-pay shortfall is building. We'll surface anything that needs you here.</div>
                <span className="oh-pill ok">● On track</span>
              </>
            )}
          </div>
        </div>

        {/* ── hero contract in plain terms ── */}
        {heroPpa && (
          <div className="oh-pipeline-card">
            <div className="oh-pipeline-head">
              <h3 className="hd-serif">Where your PPA stands</h3>
              <span className="oh-mono">{heroPpa.contract_ref ?? heroPpa.id}</span>
            </div>
            <div className="oh-contract-grid">
              <div><span className="oh-contract-k">Counterparty</span><span className="oh-contract-v">{heroPpa.counterparty_name}</span></div>
              <div><span className="oh-contract-k">Capacity</span><span className="oh-contract-v">{heroPpa.capacity_mw ? `${heroPpa.capacity_mw} MW` : '—'}{heroPpa.technology ? ` · ${heroPpa.technology}` : ''}</span></div>
              <div><span className="oh-contract-k">Status</span><span className="oh-contract-v"><span className={`oh-pill ${heroPpa.status === 'active' ? 'ok' : 'neu'}`}>{statusPhrase(heroPpa.status)}</span></span></div>
              <div><span className="oh-contract-k">This month</span><span className="oh-contract-v">{heroSite ? `${fmtMwh(heroSite.delivered)} of ${fmtMwh(heroSite.contracted)} MWh` : '—'}</span></div>
            </div>
            <p className="oh-pipeline-foot">
              In plain terms: your contract is <b>{statusPhrase(heroPpa.status)}</b>.
              {heroPpa.status === 'active' && ' Energy is flowing and being reconciled against your nomination each month.'}
            </p>
            <div className="oh-card-acts" style={{ marginTop: 10 }}>
              <Link className="btn ghost" to="/surface/offtaker:ppa_portfolio">Open contract</Link>
              <Link className="btn ghost" to="/ledger/ppa_obligation">See obligations</Link>
            </div>
          </div>
        )}

        {/* ── per-site delivery table (only when more than one obligated site) ── */}
        {perSite.length > 1 && (
          <div className="oh-sites-card">
            <div className="oh-pipeline-head">
              <h3 className="hd-serif">Delivery by site</h3>
              <span className="oh-mono">{perSite.length} sites · {monthLabel}</span>
            </div>
            <table className="oh-table">
              <thead><tr><th>Site</th><th>Contracted</th><th>Delivered</th><th className="oh-rate">Delivery rate</th><th>Status</th></tr></thead>
              <tbody>
                {perSite.map(s => (
                  <tr key={s.ppa_id}>
                    <td><b>{s.name}</b></td>
                    <td className="oh-mono">{fmtMwh(s.contracted)}</td>
                    <td className="oh-mono">{fmtMwh(s.delivered)}</td>
                    <td>
                      <div className="oh-bar-wrap">
                        <div className="oh-bar"><div className={`oh-bar-fill ${s.status === 'shortfall' || s.status === 'take_or_pay' ? 'warn' : 'ok'}`} style={{ width: `${Math.min(100, Math.max(0, s.pct ?? 0))}%` }} /></div>
                        <span className={`oh-mono oh-rate-v ${s.status === 'shortfall' || s.status === 'take_or_pay' ? 'warn' : 'ok'}`}>{s.pct == null ? '—' : s.pct.toFixed(1) + '%'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`oh-pill ${s.status === 'take_or_pay' ? 'bad' : s.status === 'shortfall' ? 'warn' : 'ok'}`}>
                        {s.status === 'take_or_pay' ? 'exposure' : s.status === 'shortfall' ? (s.cure != null && s.cure >= 0 ? `cure ${s.cure}d` : 'shortfall') : s.status === 'cured' ? 'cured' : 'clear'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── other contracts in the portfolio ── */}
        {otherContracts.length > 0 && (
          <div className="oh-sites-card">
            <div className="oh-pipeline-head">
              <h3 className="hd-serif">Your other contracts</h3>
              <span className="oh-mono">{otherContracts.length} · no readings due this period</span>
            </div>
            <div className="oh-contract-list">
              {otherContracts.map(p => (
                <Link key={p.id} className="oh-contract-item" to="/surface/offtaker:ppa_portfolio">
                  <div>
                    <b>{p.counterparty_name}</b>
                    <span className="oh-mono"> {p.capacity_mw ? `${p.capacity_mw} MW` : ''}{p.technology ? ` · ${p.technology}` : ''}{p.contract_ref ? ` · ${p.contract_ref}` : ''}</span>
                  </div>
                  <span className={`oh-pill ${p.status === 'active' ? 'ok' : 'neu'}`}>{statusPhrase(p.status)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── reassurance / empty states ── */}
        {perSite.length === 0 ? (
          <div className="oh-empty">
            <h3 className="hd-serif">No PPA obligations yet</h3>
            <p>Once your generator submits the first meter reading, your delivery summary appears here in plain English.</p>
            <Link to="/surface/offtaker:ppa_portfolio" className="btn pri">View your contracts</Link>
          </div>
        ) : !hasShortfall && !hasTop && tone === 'ok' && (
          <div className="oh-reassure">
            <span className="oh-reassure-tick" aria-hidden="true">✓</span>
            <span><b>Everything else is on track.</b> Delivery is {pctTxt} of contracted this {monthShort} and no take-or-pay shortfall is building. Only items above need your attention.</span>
          </div>
        )}
      </section>
    </div>
  );
}