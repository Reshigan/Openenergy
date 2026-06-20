// pages/src/meridian/LedgerPage.tsx — Meridian Ledger: scan one chain.
// Per-chain list surface (the third of four Meridian surfaces, after Horizon + Atlas,
// before Thread). A KPI strip, status filter pills, and a card list of cases for one
// chain key — each card links into its Thread. When the chain exposes an initiation
// action, a "+ New" veil drawer opens the schema-driven FieldForm to start a case.
// Data from GET /api/ledger/:chainKey (via fetchLedger in ./lib); writes POST the
// registry action path (api baseURL '/api', so the /api prefix is stripped).
import React from 'react';
import './meridian.css';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fetchLedger, classifyLoadError, fmtZar, humanizeKey, type LedgerData, type LoadErrorKind } from './lib';
import { MeridianHeader } from './MeridianHeader';
import { GuidedTour } from './GuidedTour';
import { FieldForm } from './FieldForm';
import { FuseBar } from './components';

export default function LedgerPage() {
  const { chainKey = '' } = useParams();
  const nav = useNavigate();
  // The "New transaction" picker (NewPage) deep-links here with ?compose=1 so the
  // operator lands straight in the initiation form — the IPP-journey entry point.
  const [sp, setSp] = useSearchParams();
  const wantCompose = sp.get('compose') === '1';
  const [data, setData] = React.useState<LedgerData | null>(null);
  const [err, setErr] = React.useState<LoadErrorKind | null>(null);     // load failure — replaces the page
  const [status, setStatus] = React.useState<string | undefined>(undefined); // active filter key
  const [composeOpen, setComposeOpen] = React.useState(false);          // +New drawer
  const [notice, setNotice] = React.useState<string | null>(null);      // non-blocking compose advisory

  // Liveness-guard load (ThreadPage/AtlasPage idiom): a late resolve after unmount —
  // or after chainKey/status changes — must not setState with a stale result.
  const load = React.useCallback(() => {
    let live = true;
    fetchLedger(chainKey, status)
      .then(d => { if (live) setData(d); })
      .catch(e => { if (live) setErr(classifyLoadError(e)); });
    return () => { live = false; };
  }, [chainKey, status]);
  React.useEffect(() => load(), [load]);

  // Honor ?compose=1 once data confirms the role can initiate — then strip the param
  // so a reload or back-nav doesn't reopen the drawer. If the role can't initiate this
  // chain, the param is dropped silently and the operator sees the existing case list.
  React.useEffect(() => {
    if (!wantCompose || !data) return;
    if (data.initiation) setComposeOpen(true);
    // Role can view the chain but isn't an initiator here — say so instead of a
    // silent no-op, so the operator understands why no form opened.
    else setNotice(`Your role can review ${data.chain.title} but can't start a new case here.`);
    setSp(prev => { const next = new URLSearchParams(prev); next.delete('compose'); return next; }, { replace: true });
  }, [wantCompose, data, setSp]);

  // Escape-to-dismiss + focus-restore for the +New veil (DealDeskPage idiom).
  React.useEffect(() => {
    if (!composeOpen) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setComposeOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [composeOpen]);

  if (err) {
    // Distinguish why the load failed so the message is honest and a Retry shows
    // only when retrying could help. A 403/404 won't change on retry — offer a
    // route out (Atlas / Horizon) instead of a button that re-fails.
    const msg: Record<LoadErrorKind, string> = {
      forbidden: "Your role can't access this ledger.",
      notfound: "This ledger doesn't exist.",
      network: "Couldn't reach the server. Check your connection.",
      unknown: 'The ledger failed to load.',
    };
    const canRetry = err === 'network' || err === 'unknown';
    return (
      <div className="mer mer-error" role="alert">
        <p>{msg[err]}</p>
        <div className="mer-error-acts">
          {canRetry && (
            <button type="button" className="btn ghost" onClick={() => { setErr(null); load(); }}>Retry</button>
          )}
          <Link to="/atlas" className="btn ghost">Browse Atlas</Link>
          <Link to="/horizon" className="btn ghost">Back to Horizon</Link>
        </div>
      </div>
    );
  }
  if (!data) return (
    <div className="mer ledger" aria-busy="true" role="status" aria-label="Loading ledger">
      <div style={{ padding: '20px 24px', maxWidth: 760 }}>
        <div className="skel skel-line lg" style={{ width: '34%', marginBottom: 18 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 52 }} />)}
        </div>
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skel skel-card" />)}
      </div>
    </div>
  );

  const { initiation } = data;
  // ZAR heuristic keys off the kpi key name — the LedgerData kpi shape carries no unit.
  const fmtKpi = (k: { key: string; value: number }) =>
    /exposure|zar|amount|value/i.test(k.key) ? fmtZar(k.value) : String(k.value);

  return (
    <div className="mer ledger">
      <MeridianHeader ctx={<><b>{data.chain.title}</b><span>{data.rows.length} shown</span></>} />

      <GuidedTour surface="ledger" />

      <main className="ledger-body">
        <Link to="/horizon" className="ledger-back">← Horizon</Link>
        {notice && (
          <div className="ledger-notice" role="status">
            {notice}{' '}
            <Link to="/atlas">Browse what you can start →</Link>
          </div>
        )}
        {/* KPI strip */}
        {data.kpis.length > 0 && (
          <div className="kpis">
            {data.kpis.map(k => (
              <div className="kpi" key={k.key}>
                <span className="kpi-val mono">{fmtKpi(k)}</span>
                <span className="kpi-label">{k.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Filter pills + initiation */}
        <div className="pills" role="group" aria-label="Filter by status">
          <button type="button" className={status == null ? 'pill on' : 'pill'}
                  aria-pressed={status == null} onClick={() => setStatus(undefined)}>
            All
          </button>
          {data.filters.map(f => {
            const active = status === f.key;
            return (
              <button type="button" key={f.key} className={active ? 'pill on' : 'pill'}
                      aria-pressed={active} onClick={() => setStatus(f.key)}>
                {f.label}
              </button>
            );
          })}
          <span className="spacer" />
          {initiation && (
            <button type="button" className="btn pri" onClick={() => setComposeOpen(true)}>
              {initiation.label}
            </button>
          )}
        </div>

        {/* Card list */}
        {data.rows.length === 0 ? (
          <div className="lcard-empty">
            No cases.{initiation && ` Start one with "${initiation.label}".`}
          </div>
        ) : (
          data.rows.map(row => (
            <button type="button" className="lcard" key={row.id}
                    onClick={() => nav('/thread/' + chainKey + '/' + row.id)}>
              <div className="lcard-top">
                <span className="ref mono">{row.ref}</span>
                <span className="chip">{humanizeKey(row.status, true)}</span>
              </div>
              <b className="lcard-title">{row.title}</b>
              <FuseBar deadline={row.deadline_at} />
              <div className="lcard-meta mono">
                {[
                  row.quantum_zar != null ? fmtZar(row.quantum_zar) : null,
                  row.counterparty ? '↔ ' + row.counterparty : null,
                ].filter(Boolean).join(' · ')}
              </div>
            </button>
          ))
        )}
      </main>

      {/* +New veil drawer — schema-driven initiation form. */}
      {composeOpen && initiation && (
        <div className="mer veil" onClick={() => setComposeOpen(false)}>
          <div className="veil-body" role="dialog" aria-modal="true" aria-label={initiation.label}
               onClick={e => e.stopPropagation()}>
            <FieldForm
              fields={initiation.fields}
              submitLabel={initiation.label}
              ariaLabel={initiation.label}
              onSubmit={async (values) => {
                await api.post(initiation.path.replace('/api', ''), values);
                setComposeOpen(false);
                load();
              }}
              onCancel={() => setComposeOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
