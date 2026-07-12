// ═══════════════════════════════════════════════════════════════════════════
// Home (/v2) — the per-role work queue, framed as a command centre. A metric
// strip states the shape of the day (open · your move · at stake · oldest) →
// the single highest-consequence "Next" card → the queue split into "Waiting on
// you" vs "Waiting on others", each row carrying state, holder, age+urgency and
// an honest value. When nothing is open, a first-run hero + the role's journey
// starts. No dashboards-as-destination; every number is a door into a txn.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { Shell, LoadError } from './Shell';
import { getChains, listTxns } from './api';
import { groupedStarts } from './starts';
import {
  homeSort, moneyValue, zarValue, valueText, ageSince, stateKind, candidatesFor, rowProps,
  type ChainMap, type TxnRow,
} from './decl';

function Pill({ chain, state }: { chain: ChainMap[string] | undefined; state: string }) {
  const kind = chain ? stateKind(chain, state) : 'open';
  const label = chain?.states[state]?.label ?? state;
  return <span className={`v2-pill is-${kind}`}>{label}</span>;
}

// Sum of money-valued positions in a set, as an honest "R …" (or "—").
function stakeText(rows: TxnRow[]): string {
  let sum = 0;
  for (const r of rows) { const v = zarValue(r); if (v.isMoney) sum += Math.abs(v.amount); }
  if (!sum) return '—';
  const a = sum;
  return a >= 1e9 ? `R ${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `R ${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `R ${(a / 1e3).toFixed(0)}k` : `R ${Math.round(a)}`;
}

export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chains, setChains] = useState<ChainMap>({});
  const [rows, setRows] = useState<TxnRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { getChains().then(setChains); }, []);
  const load = useCallback(() => {
    setFailed(false); setRows(null);
    listTxns({ open: true, mine: true, limit: 200 })
      .then(setRows)
      .catch(() => { setFailed(true); setRows([]); });
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);

  const role = user?.role ?? '';
  const ranked = useMemo(() => (rows ? homeSort(rows) : []), [rows]);
  const next = ranked[0];
  const rest = ranked.slice(1);

  // Split the queue tail on whether the current JWT role has an enabled edge
  // from the row's state.
  // ponytail: this is a client heuristic — chain candidates gate on abstract
  // party-roles (operator/buyer/…), not JWT roles, so `mine` is approximate.
  // The Transaction page + the server are the authoritative say on who can act.
  const { mine, others } = useMemo(() => {
    const mine: TxnRow[] = [];
    const others: TxnRow[] = [];
    for (const r of rest) {
      const c = chains[r.chain_key];
      const yours = c && candidatesFor(c, r.state, [role]).some((x) => x.enabled);
      (yours ? mine : others).push(r);
    }
    return { mine, others };
  }, [rest, chains, role]);

  // The day's shape — computed from what's already loaded, no extra endpoint.
  const stats = useMemo(() => {
    const nextIsMine = next && chains[next.chain_key]
      && candidatesFor(chains[next.chain_key], next.state, [role]).some((x) => x.enabled);
    const oldest = ranked.length ? ageSince(ranked[ranked.length - 1].opened_at) : null;
    return {
      open: ranked.length,
      yours: mine.length + (nextIsMine ? 1 : 0),
      stake: stakeText(ranked),
      oldest,
    };
  }, [ranked, mine, next, chains, role]);

  return (
    <Shell>
      {failed ? (
        <LoadError what="your work queue" onRetry={load} />
      ) : rows === null ? (
        <>
          <div className="v2-skeleton" style={{ height: 76, marginBottom: 'var(--sp-6)' }} />
          <div className="v2-skeleton" style={{ height: 120 }} />
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="v2-skeleton" />)}
        </>
      ) : ranked.length === 0 ? (
        <>
          <div className="v2-hero">
            <h1>You’re all clear</h1>
            <p>Nothing is waiting on you right now. Start something below, or press <span className="v2-kbd">⌘K</span> to search everything.</p>
          </div>
          <div className="v2-journeys">
            {groupedStarts(chains, role).map((d) => (
              <div key={d.key} className="v2-journey">
                <div className="v2-journey-hd">
                  <span className="dot" style={{ ['--dc' as any]: d.color }} />
                  <h3>{d.label}</h3>
                  <span className="n">{d.starts.length}</span>
                </div>
                <div className="v2-starts">
                  {d.starts.map((s) => (
                    <button
                      key={`${s.chainKey}:${s.edge.id}`}
                      className="v2-start"
                      onClick={() => nav(`/v2/find?start=${s.chainKey}:${s.edge.id}`)}
                    >
                      <span className="plus">＋</span>
                      <span className="grow">{s.label}</span>
                    </button>
                  ))}
                </div>
                {d.links.length > 0 && (
                  <>
                    <div className="v2-jsub">Manage</div>
                    <div className="v2-starts">
                      {d.links.map((l) => (
                        <button key={l.key} className="v2-jlink" onClick={() => nav(l.to)}>
                          <span className="grow">{l.label}</span>
                          <span className="arw">→</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="v2-stats">
            <div className="v2-stat"><span className="k">Open</span><span className="v">{stats.open}</span><span className="d">on your desk</span></div>
            <div className={`v2-stat ${stats.yours > 0 ? 'accent' : ''}`}><span className="k">Your move</span><span className="v">{stats.yours}</span><span className="d">awaiting you</span></div>
            <div className="v2-stat"><span className="k">At stake</span><span className="v mono">{stats.stake}</span><span className="d">across open items</span></div>
            {stats.oldest && (
              <div className={`v2-stat ${stats.oldest.tier === 'ok' ? '' : 'alert'}`}><span className="k">Oldest</span><span className="v mono">{stats.oldest.text}</span><span className="d">waiting longest</span></div>
            )}
          </div>

          {next && (
            <NextCard row={next} chain={chains[next.chain_key]} onOpen={() => nav(`/v2/t/${next.id}`)} />
          )}

          {mine.length > 0 && (
            <>
              <div className="v2-sectionbar mine">
                <h3>Waiting on you</h3>
                <span className="badge">{mine.length}</span>
                <span className="tot">{stakeText(mine)}</span>
              </div>
              <QueueTable rows={mine} chains={chains} onOpen={(id) => nav(`/v2/t/${id}`)} />
            </>
          )}

          {others.length > 0 && (
            <>
              <div className="v2-sectionbar">
                <h3>Waiting on others</h3>
                <span className="badge">{others.length}</span>
                <span className="tot">{stakeText(others)}</span>
              </div>
              <QueueTable rows={others} chains={chains} onOpen={(id) => nav(`/v2/t/${id}`)} />
            </>
          )}
        </>
      )}
    </Shell>
  );
}

function QueueTable({ rows, chains, onOpen }: { rows: TxnRow[]; chains: ChainMap; onOpen: (id: string) => void }) {
  return (
    <table className="v2-table">
      <thead>
        <tr>
          <th>Ref</th><th>What</th><th>State</th><th>Holder</th>
          <th style={{ textAlign: 'right' }}>Value</th><th style={{ textAlign: 'right' }}>Age</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const holder = chains[r.chain_key]?.states[r.state]?.holder;
          const age = ageSince(r.opened_at);
          return (
            <tr key={r.id} {...rowProps(() => onOpen(r.id), `${r.human_ref} — ${r.title}`)}>
              <td className="ref">{r.human_ref}</td>
              <td className="ttl">{r.title}</td>
              <td><Pill chain={chains[r.chain_key]} state={r.state} /></td>
              <td className="muted">{holder && holder !== 'none' ? holder : '—'}</td>
              <td className="money">{valueText(r)}</td>
              <td style={{ textAlign: 'right' }}>
                <span className={`v2-age ${age.tier}`}><span className="u" />{age.text}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function NextCard({ row, chain, onOpen }: { row: TxnRow; chain?: ChainMap[string]; onOpen: () => void }) {
  const holder = chain?.states[row.state]?.holder;
  const age = ageSince(row.opened_at);
  const hasValue = moneyValue(row) !== 0;
  // Why THIS is first — the honest ranking reason (Home sorts value desc, then
  // oldest). Not a restatement of the Holder chip below.
  const why = hasValue
    ? `The largest open item on your desk — ${valueText(row)} at stake.`
    : age.tier === 'ok'
      ? 'The most pressing item on your desk right now.'
      : `Your oldest open item — waiting ${age.text}.`;
  return (
    <div className="v2-card v2-next">
      <div className="v2-label">Next</div>
      <div className="v2-next-row">
        <div>
          <h2>{row.title}</h2>
          <div className="sub">{row.human_ref} · {chain?.noun ?? row.chain_key}</div>
          <div className="why">{why}</div>
          <div className="v2-next-facts">
            {hasValue && <span className="f"><span className="fk">Value</span><span className="fv mono">{valueText(row)}</span></span>}
            <span className="f"><span className="fk">Waiting</span><span className={`fv mono ${age.tier === 'ok' ? '' : 'hot'}`}>{age.text}</span></span>
            {holder && holder !== 'none' && <span className="f"><span className="fk">Holder</span><span className="fv">{holder}</span></span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <Pill chain={chain} state={row.state} />
          <button className="v2-btn v2-btn-primary" onClick={onOpen}>Open</button>
        </div>
      </div>
    </div>
  );
}
