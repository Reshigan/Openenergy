// ═══════════════════════════════════════════════════════════════════════════
// Home (/v2) — the per-role work queue. One "Next" card (the single highest-
// consequence open item) + the ranked queue, split into "Waiting on you" vs
// "Waiting on others / in progress". When nothing is open, a first-run hero +
// the role's journey starts (grouped by domain). No dashboards-as-destination.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { Shell } from './Shell';
import { getChains, listTxns } from './api';
import { groupedStarts } from './starts';
import { homeSort, moneyValue, stateKind, candidatesFor, type ChainMap, type TxnRow } from './decl';

function money(n: number): string {
  if (!n) return '';
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : abs >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${n}`;
  return s;
}

function Pill({ chain, state }: { chain: ChainMap[string] | undefined; state: string }) {
  const kind = chain ? stateKind(chain, state) : 'open';
  const label = chain?.states[state]?.label ?? state;
  return <span className={`v2-pill is-${kind}`}>{label}</span>;
}

export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chains, setChains] = useState<ChainMap>({});
  const [rows, setRows] = useState<TxnRow[] | null>(null);

  useEffect(() => { getChains().then(setChains); }, []);
  useEffect(() => { listTxns({ open: true, mine: true, limit: 200 }).then(setRows); }, [user?.id]);

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
      const yours = c && candidatesFor(c, r.state, role).some((x) => x.enabled);
      (yours ? mine : others).push(r);
    }
    return { mine, others };
  }, [rest, chains, role]);

  return (
    <Shell>
      {rows === null ? (
        <>
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
                      <span className="grow">{s.label}<span className="noun">{s.chain.noun}</span></span>
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
          {next && (
            <NextCard row={next} chain={chains[next.chain_key]} onOpen={() => nav(`/v2/t/${next.id}`)} />
          )}

          {mine.length > 0 && (
            <>
              <div className="v2-split-hd mine">
                <h3>Waiting on you</h3>
                <span className="badge">{mine.length}</span>
                <span className="sub">your move</span>
              </div>
              <QueueTable rows={mine} chains={chains} onOpen={(id) => nav(`/v2/t/${id}`)} />
            </>
          )}

          {others.length > 0 && (
            <>
              <div className="v2-split-hd">
                <h3>Waiting on others</h3>
                <span className="badge">{others.length}</span>
                <span className="sub">held elsewhere or in progress</span>
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
          <th style={{ textAlign: 'right' }}>Value</th><th>Opened</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const holder = chains[r.chain_key]?.states[r.state]?.holder;
          return (
            <tr key={r.id} className="v2-row" onClick={() => onOpen(r.id)}>
              <td className="ref">{r.human_ref}</td>
              <td className="ttl">{r.title}</td>
              <td><Pill chain={chains[r.chain_key]} state={r.state} /></td>
              <td className="muted">{holder && holder !== 'none' ? holder : '—'}</td>
              <td className="money">{money(moneyValue(r))}</td>
              <td className="muted">{r.opened_at.slice(0, 10)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function NextCard({ row, chain, onOpen }: { row: TxnRow; chain?: ChainMap[string]; onOpen: () => void }) {
  const holder = chain?.states[row.state]?.holder;
  const why = holder && holder !== 'none' ? `Held by ${holder} — awaiting the next move.` : 'Open and progressing.';
  return (
    <div className="v2-card v2-next">
      <div className="v2-label">Next</div>
      <div className="v2-next-row">
        <div>
          <h2>{row.title}</h2>
          <div className="sub">{row.human_ref} · {chain?.noun ?? row.chain_key}</div>
          <div className="why">{why}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <Pill chain={chain} state={row.state} />
          <button className="v2-btn v2-btn-primary" onClick={onOpen}>Open</button>
        </div>
      </div>
    </div>
  );
}
