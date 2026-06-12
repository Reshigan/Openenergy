// pages/src/meridian/ThreadPage.tsx — Meridian Thread: two-sided case view.
// Markup follows mockups/meridian/02-thread.html (header / case body + state rail / actbar);
// styling from meridian.css (scoped under .mer). Data from GET /api/thread/:chainKey/:id —
// any role with a lane sees the same facts; write actions are role-filtered server-side,
// so the counterparty gets no .actbar at all.
import React from 'react';
import './meridian.css';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtZar } from './lib';
import { FuseBar } from './components';

interface ThreadData {
  chain: { key: string; wave: number; title: string };
  case: { id: string; ref: string; title: string; status: string; deadline_at: string | null;
          quantum_zar: number | null; counterparty: string | null; raw: Record<string, unknown> };
  events: { event_type?: string; created_at?: string; actor_role?: string; note?: string }[];
  actions: { action: string; label: string; path: string; cascadeHint: string; tone?: string }[];
  viewer_role: string;
}

export default function ThreadPage() {
  const { chainKey = '', id = '' } = useParams();
  const [t, setT] = React.useState<ThreadData | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);          // load failure — replaces the page
  const [actErr, setActErr] = React.useState<string | null>(null);    // action failure — thread stays rendered

  const load = React.useCallback(() =>
    api.get(`/thread/${chainKey}/${id}`).then(r => setT(r.data.data)).catch(e => setErr(String(e))),
  [chainKey, id]);
  React.useEffect(() => { load(); }, [load]);

  async function act(a: ThreadData['actions'][number]) {
    setBusy(a.action);
    // api has baseURL '/api', so strip the prefix the registry paths carry.
    try {
      await api.post(a.path.replace('/api', '').replace(':id', id), {});
      setActErr(null); // success clears any previous action error
      await load();
    } catch (e: any) {
      // State machines return 409 with a reason for invalid transitions —
      // surface the server's {error} text; keep the thread rendered.
      setActErr(e?.response?.data?.error ?? e?.message ?? 'Action failed');
    } finally { setBusy(null); }
  }

  if (err) {
    return (
      <div className="mer mer-error" role="alert">
        Thread failed to load.{' '}
        <button type="button" className="btn ghost" onClick={() => { setErr(null); load(); }}>Retry</button>
      </div>
    );
  }
  if (!t) return <div className="mer mer-loading" aria-busy="true">Loading thread…</div>;

  return (
    <div className="mer thread">
      <header className="mer-head">
        <Link to="/horizon" className="back">← Horizon</Link>
        <span className="mono ref">{t.case.ref}</span>
        <span className="spacer" />
        <span className="mono zar m3">{fmtZar(t.case.quantum_zar)}</span>
      </header>

      <main className="mer-main">
        <section className="case-body">
          <div className="case-head">
            <h1>{t.case.title}</h1>
            <div className="case-sub">
              <span className="chip">{t.case.status.replace(/_/g, ' ')}</span>
              <span>W{t.chain.wave} · {t.chain.title}</span>
              {t.case.counterparty && <span>↔ {t.case.counterparty}</span>}
            </div>
            <FuseBar deadline={t.case.deadline_at} />
          </div>

          {t.events.length > 0 && (
            <ol className="state-rail">
              {t.events.map((e, i) => (
                <li key={`${e.created_at ?? ''}-${e.event_type ?? ''}-${i}`} className="state done">
                  <span className="mono">{e.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  <b>{(e.event_type ?? '').replace(/_/g, ' ')}</b>
                  {e.actor_role && <span className="actor">{e.actor_role}</span>}
                </li>
              ))}
              <li className="state now"><b>{t.case.status.replace(/_/g, ' ')}</b></li>
            </ol>
          )}

          <details className="raw-fields" open>
            <summary>Case record</summary>
            <dl>
              {Object.entries(t.case.raw)
                .filter(([k, v]) => v != null && !['id'].includes(k))
                .map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k.replace(/_/g, ' ')}</dt><dd className="mono">{String(v)}</dd>
                  </React.Fragment>
                ))}
            </dl>
          </details>
        </section>
      </main>

      {t.actions.length > 0 && (
        <footer className="actbar">
          {actErr && (
            <div className="act-error" role="alert">
              <span>{actErr}</span>
              <button type="button" className="btn ghost" onClick={() => setActErr(null)}>Dismiss</button>
            </div>
          )}
          <div className="cascade-preview">{t.actions[0].cascadeHint}</div>
          <div className="actbar-btns">
            {t.actions.map(a => (
              <button key={a.action} type="button" disabled={busy !== null}
                      className={`btn ${a.tone === 'oxide' ? 'ox' : 'pri'}`}
                      title={a.cascadeHint} onClick={() => act(a)}>
                {busy === a.action ? '…' : a.label}
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
