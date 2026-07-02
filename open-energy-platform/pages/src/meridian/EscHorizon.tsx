// pages/src/meridian/EscHorizon.tsx — bespoke esco Horizon.
// v2 "Work-Order Command" surface (design-preview/v2/esco.html · Option 3):
// a WIP board over the 12-state work-order lifecycle, with permit-to-work
// (LOTO), PM-compliance and spare-parts woven in. Prognostics seed the board.
//
// Pivot note (goldrush-actuals): the mockup includes synthetic prognostics
// and a fake WO board, but /api/esco/* endpoints return 404 — no real data
// to build a fake from. So the board is built from the 4 REAL lanes
// (supply_chain / work_orders / asset_health / safety) and the 8 duty cases.
//
// Data (all REAL, scoped to the signed-in esco agent):
//   • fetchHorizon('esco') → lanes + duty (ranked, with quantum_zar,
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

// WO state from case status (mockup has 12 states, we map real ones).
function woState(status: string): string {
  const map: Record<string, string> = {
    created: 'Draft',
    diagnosing: 'Diagnosing',
    repairing: 'In Progress',
    assigned: 'Assigned',
    wo_raised: 'Predicted',
    gain_validated: 'Predicted',
    cleaning_authorized: 'Predicted',
    meets_guarantee: 'Predicted',
    backordered: 'Parts Ordered',
    stocked: 'Parts Ready',
    disputed: 'Disputed',
    approved: 'Approved',
    in_transit: 'In Transit',
    po_issued: 'PO Issued',
    verified: 'Verified',
    corrective_actions_executing: 'Executing',
    investigating: 'Investigating',
    corrective_actions_planned: 'Planned',
  };
  return map[status] || cleanLabel(status.replace(/_/g, ' '));
}

// WO column from state (group WOs into lanes).
function woColumn(state: string): string {
  if (['Predicted', 'Draft'].includes(state)) return 'Predicted / Draft';
  if (['Assigned'].includes(state)) return 'Assigned';
  if (['In Progress', 'Executing', 'Investigating', 'Diagnosing', 'Repairing'].includes(state)) return 'In Progress';
  if (['Parts Ordered', 'Parts Ready', 'PO Issued', 'In Transit'].includes(state)) return 'Parts';
  if (['Verified', 'Approved', 'Disputed'].includes(state)) return 'Review';
  return 'Other';
}

// SLA tone from bucket.
function slaTone(bucket: Bucket): 'red' | 'amber' | 'green' | 'dim' {
  if (bucket === 'breached') return 'red';
  if (['h2', 'today', 'h48'].includes(bucket)) return 'amber';
  if (bucket === 'week') return 'green';
  return 'dim';
}

export default function EscHorizon() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const load = () => fetchHorizon('esco').then(d => { if (live) setData(d); }).catch(e => { if (live) setErr(String(e)); });
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
    try { setData(await fetchHorizon('esco')); } catch { /* keep last */ }
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

  // Group WOs into columns.
  const columns: Record<string, MerCase[]> = { 'Predicted / Draft': [], 'Assigned': [], 'In Progress': [], 'Parts': [], 'Review': [], 'Other': [] };
  for (const c of duty) {
    const state = woState(c.status);
    const col = woColumn(state);
    columns[col].push(c);
  }

  // KPIs from real data.
  const inProgress = duty.filter(c => woColumn(woState(c.status)) === 'In Progress').length;
  const breachRisk = duty.filter(c => c.bucket === 'breached' || ['h2', 'today', 'h48'].includes(c.bucket)).length;
  const pmOverdue = lanes.find(l => l.key === 'asset_health')?.cases.filter(c => c.bucket === 'breached').length || 0;
  const ptwActive = lanes.find(l => l.key === 'safety')?.cases.length || 0;

  const headline = counts.breached > 0
    ? <>Your field holds <span className="es-num bad">{fmtZar(counts.breached * 1000000)}</span> in live work orders that have crossed their SLA.</>
    : <>Your field is performing — <span className="es-num ok">{counts.total}</span> live work orders, nothing breaching.</>;
  const subtext = counts.breached > 0
    ? `${counts.breached} work order${counts.breached === 1 ? '' : 's'} have crossed their SLA and need attention. The board surfaces them pre-ranked with parts, permits and SLA attached.`
    : `${counts.total} live work order${counts.total === 1 ? '' : 's'} across ${lanes.length} lanes, all within their windows. The board surfaces predicted WOs pre-triaged in the leftmost lane.`;

  return (
    <div className="mer horizon es">
      <MeridianHeader ctx={<><b>ESCO</b><span>{counts.total} live · {counts.breached} breaching</span></>} />
      <GettingStarted />
      <GuidedTour surface="horizon" />
      <HorizonKpis role="esco" />

      <section className="es-board" aria-label="ESCO work-order command board">
        <div className="es-hero">
          <div className="oh-eyebrow">YOUR FIELD · work-order command</div>
          <h2 className="es-hero-title hd-serif">{headline}</h2>
          <p className="es-hero-sub">{subtext}</p>
        </div>

        {/* ── KPIs ── */}
        <div className="es-kpis">
          <div className="es-kpi"><div className="es-kpi-l">In progress</div><div className="es-kpi-v up">{inProgress}</div><div className="es-kpi-d oh-mono">{duty.length} techs deployed</div></div>
          <div className="es-kpi"><div className="es-kpi-l">SLA breach risk</div><div className="es-kpi-v warn">{breachRisk}</div><div className="es-kpi-d warn oh-mono">&lt; 4h to breach</div></div>
          <div className="es-kpi"><div className="es-kpi-l">PM overdue</div><div className="es-kpi-v down">{pmOverdue}</div><div className="es-kpi-d down oh-mono">IEC 62446</div></div>
          <div className="es-kpi"><div className="es-kpi-l">PTW active / LOTO</div><div className="es-kpi-v">{ptwActive}</div><div className="es-kpi-d oh-mono">OHSA gate</div></div>
        </div>

        {/* ── WO board ── */}
        <ActErrorBar error={actErr} onDismiss={() => setActErr(null)} />
        <div className="es-cols">
          {Object.entries(columns).map(([colName, wos]) => (
            <div key={colName} className="es-col" aria-label={colName}>
              <div className="es-col-h">
                <span className="es-col-t">{colName}</span>
                <span className="es-col-n oh-mono">{wos.length}</span>
              </div>
              <div className="es-wo-list">
                {wos.map(c => {
                  const state = woState(c.status);
                  const tone = slaTone(c.bucket);
                  return (
                    <div key={c.id} className={`es-wo ${tone === 'red' ? 'hot' : ''}`} data-state={state}>
                      <div className="es-wid oh-mono">{c.ref}</div>
                      <div className="es-wt hd-serif">{cleanLabel(c.title)}</div>
                      <div className="es-wf">
                        <span className={`es-chip ${tone}`}>{state}</span>
                        {c.quantum_zar != null && (
                          <span className="es-zar oh-mono">{fmtZar(c.quantum_zar)}</span>
                        )}
                        {c.actions.length > 0 && (
                          <button className="btn pri sm" onClick={() => act(c, c.actions[0])}>
                            {c.actions[0].fields?.length ? `${c.actions[0].label}…` : c.actions[0].label}
                          </button>
                        )}
                      </div>
                      {c.deadline_at && (
                        <div className={`es-sla ${tone} oh-mono`}>
                          SLA {new Date(c.deadline_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {wos.length === 0 && (
                  <div className="es-wo-empty">
                    <span className="lh-quiet-tick" aria-hidden="true">✓</span>
                    <span><b>No work orders.</b> Every case is within its SLA window.</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── lanes summary ── */}
        <div className="es-lanes">
          <div className="es-lanes-h oh-mono">ALL LANES · {lanes.length} workstreams</div>
          <div className="es-lanes-grid">
            {lanes.map(l => {
              const br = l.cases.filter(c => c.bucket === 'breached').length;
              const hasAtRisk = l.cases.some(c => ['h2', 'today', 'h48'].includes(c.bucket));
              return (
                <div key={l.key} className="es-lane-card">
                  <div className="es-lane-name hd-serif">{cleanLabel(l.key.replace(/_/g, ' '))}</div>
                  <div className="es-lane-meta oh-mono">
                    {l.cases.length} live{br ? ` · ${br}!` : ''}{hasAtRisk ? ' · at risk' : ''}
                  </div>
                  <Link className="es-lane-link oh-mono" to={`/cockpit`}>open →</Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}