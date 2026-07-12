// ═══════════════════════════════════════════════════════════════════════════
// Home (/v2) — the per-role work queue. One "Next" card (the single highest-
// consequence open item) + the ranked queue. No dashboards-as-destination.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { Shell } from './Shell';
import { getChains, listTxns } from './api';
import { homeSort, moneyValue, stateKind, type ChainMap, type TxnRow } from './decl';

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

  const ranked = useMemo(() => (rows ? homeSort(rows) : []), [rows]);
  const next = ranked[0];
  const rest = ranked.slice(1);

  return (
    <Shell>
      {rows === null ? (
        <>
          <div className="v2-skeleton" style={{ height: 120 }} />
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="v2-skeleton" />)}
        </>
      ) : ranked.length === 0 ? (
        <div className="v2-card v2-empty">
          Nothing waiting on you. Press <span className="v2-kbd">⌘K</span> to start something,
          or open <b>Find</b> to browse everything.
        </div>
      ) : (
        <>
          {next && (
            <NextCard row={next} chain={chains[next.chain_key]} onOpen={() => nav(`/v2/t/${next.id}`)} />
          )}

          <div className="v2-queue-head">
            <h3>Your queue</h3>
            <span className="count">{rest.length} more open</span>
          </div>
          <table className="v2-table">
            <thead>
              <tr>
                <th>Ref</th><th>What</th><th>State</th>
                <th style={{ textAlign: 'right' }}>Value</th><th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((r) => (
                <tr key={r.id} className="v2-row" onClick={() => nav(`/v2/t/${r.id}`)}>
                  <td className="ref">{r.human_ref}</td>
                  <td className="ttl">{r.title}</td>
                  <td><Pill chain={chains[r.chain_key]} state={r.state} /></td>
                  <td className="money">{money(moneyValue(r))}</td>
                  <td className="muted">{r.opened_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Shell>
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
