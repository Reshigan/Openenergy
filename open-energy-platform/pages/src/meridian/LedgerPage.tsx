// pages/src/meridian/LedgerPage.tsx — Meridian Ledger: scan one chain.
// Per-chain list surface (the third of four Meridian surfaces, after Horizon + Atlas,
// before Thread). A KPI strip, status filter pills, and a card list of cases for one
// chain key — each card links into its Thread. When the chain exposes an initiation
// action, a "+ New" veil drawer opens the schema-driven FieldForm to start a case.
// Data from GET /api/ledger/:chainKey (via fetchLedger in ./lib); writes POST the
// registry action path (api baseURL '/api', so the /api prefix is stripped).
import React from 'react';
import './meridian.css';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fetchLedger, fmtZar, type LedgerData } from './lib';
import { MeridianHeader } from './MeridianHeader';
import { FieldForm } from './FieldForm';
import { FuseBar } from './components';

export default function LedgerPage() {
  const { chainKey = '' } = useParams();
  const nav = useNavigate();
  const [data, setData] = React.useState<LedgerData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);            // load failure — replaces the page
  const [status, setStatus] = React.useState<string | undefined>(undefined); // active filter key
  const [composeOpen, setComposeOpen] = React.useState(false);          // +New drawer

  // Liveness-guard load (ThreadPage/AtlasPage idiom): a late resolve after unmount —
  // or after chainKey/status changes — must not setState with a stale result.
  const load = React.useCallback(() => {
    let live = true;
    fetchLedger(chainKey, status)
      .then(d => { if (live) setData(d); })
      .catch(e => { if (live) setErr(String(e)); });
    return () => { live = false; };
  }, [chainKey, status]);
  React.useEffect(() => load(), [load]);

  // Escape-to-dismiss + focus-restore for the +New veil (DealDeskPage idiom).
  React.useEffect(() => {
    if (!composeOpen) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setComposeOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [composeOpen]);

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Ledger failed to load.{' '}
        <button type="button" className="btn ghost" onClick={() => { setErr(null); load(); }}>Retry</button>
      </div>
    );
  }
  if (!data) return <div className="mer mer-loading" aria-busy="true">Loading ledger…</div>;

  const { initiation } = data;
  // ZAR heuristic keys off the kpi key name — the LedgerData kpi shape carries no unit.
  const fmtKpi = (k: { key: string; value: number }) =>
    /exposure|zar|amount|value/i.test(k.key) ? fmtZar(k.value) : String(k.value);

  return (
    <div className="mer ledger">
      <MeridianHeader ctx={<><b>{data.chain.title}</b><span>W{data.chain.wave} · {data.rows.length} shown</span></>} />

      <main className="ledger-body">
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
                <span className="chip">{row.status.replace(/_/g, ' ')}</span>
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
