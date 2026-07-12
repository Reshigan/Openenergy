// ═══════════════════════════════════════════════════════════════════════════
// Find (/v2/find) — search objects, not functions. Type to filter open/closed
// transactions across every chain; the "Start something" rail is now journey-
// grouped: the role's domains, each with its startable chains + management
// screens (no flat 142-chain dump, no "not your role" rows). Typing folds the
// rail to matching domains/starts/links too. ?start=<chainKey>:<edgeId> still
// deep-links straight into the compose form for that opener.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { Shell } from './Shell';
import { getChains, listTxns, openTxn } from './api';
import { TransitionForm } from './FieldForm';
import { groupedStarts } from './starts';
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

  // The role's journey home: domains, each with its startable chains + manage
  // links. groupedStarts already gates on the curated role taxonomy — do NOT
  // re-gate on the chain's abstract party-roles here.
  const domains = useMemo(() => groupedStarts(chains, role), [chains, role]);

  // Search folding: empty q → all domains; otherwise a domain shows if its
  // label matches (keeping all its children) or any child matches (keeping the
  // matching children only).
  const shownDomains = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return domains;
    const hit = (s: string) => s.toLowerCase().includes(needle);
    return domains.flatMap((d) => {
      if (hit(d.label)) return [d];
      const starts = d.starts.filter((s) => hit(s.label));
      const links = d.links.filter((l) => hit(l.label));
      return starts.length || links.length ? [{ ...d, starts, links }] : [];
    });
  }, [domains, q]);

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
          <div className="v2-journeys">
            {shownDomains.map((domain) => (
              <div key={domain.key} className="v2-journey">
                <div className="v2-journey-hd">
                  <span className="dot" style={{ ['--dc' as any]: domain.color }} />
                  <h3>{domain.label}</h3>
                  <span className="n">{domain.starts.length}</span>
                </div>
                <div className="v2-starts">
                  {domain.starts.map((s) => (
                    <button
                      key={s.chainKey}
                      className="v2-start"
                      onClick={() => setParams({ start: `${s.chainKey}:${s.edge.id}` }, { replace: true })}
                    >
                      <span className="plus">＋</span>
                      <span className="grow">{s.label}</span>
                    </button>
                  ))}
                </div>
                {domain.links.length > 0 && (
                  <>
                    <div className="v2-jsub">Manage</div>
                    {domain.links.map((link) => (
                      <button key={link.key} className="v2-jlink" onClick={() => nav(link.to)}>
                        <span className="grow">{link.label}</span>
                        <span className="arw">→</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
