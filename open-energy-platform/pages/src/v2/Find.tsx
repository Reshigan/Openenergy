// ═══════════════════════════════════════════════════════════════════════════
// Find (/v2/find) — search objects, not functions. Type to filter open/closed
// transactions across every chain; the "Start something" rail lists every @new
// edge (blocked ones shown disabled). ?start=<chainKey>:<edgeId> deep-links
// straight into the compose form for that opener.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { Shell } from './Shell';
import { getChains, listTxns, openTxn } from './api';
import { TransitionForm } from './FieldForm';
import { newEdges, idemKey, stateKind, type ChainMap, type TxnRow, type TransitionDecl, type Json } from './decl';

export default function Find() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [chains, setChains] = useState<ChainMap>({});
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<TxnRow[] | null>(null);
  const role = user?.role ?? '';

  useEffect(() => { getChains().then(setChains); }, []);
  useEffect(() => {
    const h = setTimeout(() => { listTxns({ q: q || undefined, limit: 60 }).then(setRows); }, 160);
    return () => clearTimeout(h);
  }, [q]);

  // ?start=chainKey:edgeId → compose overlay for that opener.
  const start = params.get('start');
  const compose = useMemo(() => {
    if (!start) return null;
    const [chainKey, edge] = start.split(':');
    const chain = chains[chainKey];
    const t = chain && newEdges(chain).find((e) => e.id === edge);
    return chain && t ? { chainKey, chain, t } : null;
  }, [start, chains]);

  // Every opener across every chain, this-role-first.
  const starts = useMemo(() => {
    const out: { chainKey: string; noun: string; t: TransitionDecl; enabled: boolean }[] = [];
    for (const [key, chain] of Object.entries(chains)) {
      for (const t of newEdges(chain)) {
        const enabled = t.by.includes(role);
        if (!q || `${chain.noun} ${t.label}`.toLowerCase().includes(q.toLowerCase())) {
          out.push({ chainKey: key, noun: chain.noun, t, enabled });
        }
      }
    }
    return out.sort((a, b) => Number(b.enabled) - Number(a.enabled));
  }, [chains, q, role]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const open = async (chainKey: string, t: TransitionDecl, input: Record<string, Json>, reason?: { code: string; text?: string }) => {
    setBusy(true); setErr(undefined);
    const res = await openTxn({
      chain_key: chainKey, edge: t.id, input,
      idempotency_key: idemKey(`${chainKey}:${t.id}`, JSON.stringify(input)),
      reason_code: reason?.code, reason_text: reason?.text,
    });
    setBusy(false);
    if (res.ok && res.txn_id) nav(`/v2/t/${res.txn_id}`);
    else setErr(res.constraint ? `${res.code} (${res.constraint})` : res.code || res.message || 'rejected');
  };

  return (
    <Shell>
      <input
        className="v2-input"
        style={{ fontSize: 'var(--t-18)', padding: '12px 14px', marginBottom: 'var(--sp-6)' }}
        autoFocus
        placeholder="Find a transaction, or start something…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {compose && (
        <div className="v2-card" style={{ padding: 'var(--sp-6)', marginBottom: 'var(--sp-6)' }}>
          <div className="v2-label" style={{ marginBottom: 4 }}>Start · {compose.chain.noun}</div>
          <h2 style={{ fontSize: 'var(--t-18)', fontWeight: 600, marginBottom: 'var(--sp-4)' }}>{compose.t.label}</h2>
          <TransitionForm
            t={compose.t}
            busy={busy}
            error={err}
            onSubmit={(input, reason) => open(compose.chainKey, compose.t, input, reason)}
            onCancel={() => { params.delete('start'); setParams(params, { replace: true }); setErr(undefined); }}
          />
        </div>
      )}

      <div className="v2-cols">
        <div className="v2-col">
          <h4>Transactions</h4>
          {rows === null ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="v2-skeleton" />)
          ) : rows.length === 0 ? (
            <div className="v2-empty">Nothing matches “{q}”.</div>
          ) : (
            <table className="v2-table">
              <tbody>
                {rows.map((r) => {
                  const kind = chains[r.chain_key] ? stateKind(chains[r.chain_key], r.state) : 'open';
                  const label = chains[r.chain_key]?.states[r.state]?.label ?? r.state;
                  return (
                    <tr key={r.id} className="v2-row" onClick={() => nav(`/v2/t/${r.id}`)}>
                      <td className="ref" style={{ width: 1, whiteSpace: 'nowrap' }}>{r.human_ref}</td>
                      <td className="ttl">{r.title}</td>
                      <td style={{ width: 1 }}><span className={`v2-pill is-${kind}`}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="v2-col">
          <h4>Start something</h4>
          <div className="v2-starts">
            {starts.map((s) => (
              <button
                key={`${s.chainKey}:${s.t.id}`}
                className={`v2-start ${s.enabled ? '' : 'blocked'}`}
                disabled={!s.enabled}
                onClick={() => setParams({ start: `${s.chainKey}:${s.t.id}` }, { replace: true })}
                title={s.enabled ? '' : 'Not available to your role'}
              >
                <span className="plus">＋</span>
                <span className="grow">{s.t.label}<span className="noun">{s.noun}</span></span>
                {!s.enabled && <span className="lock">not your role</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
