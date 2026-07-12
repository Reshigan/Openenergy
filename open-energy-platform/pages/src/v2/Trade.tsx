// ═══════════════════════════════════════════════════════════════════════════
// Trade (/v2/trade) — the focused surface for the trading family: open a
// position (the trading-chain openers) + your live positions (open txns on
// those chains), biggest first. There is no v2 order-book/matching endpoint
// yet, so this is a position book, not a depth ladder — when /v2 exposes book
// depth, the left column becomes a real ladder.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { Shell } from './Shell';
import { getChains, listTxns } from './api';
import { tradeStarts } from './starts';
import { moneyValue, homeSort, stateKind, type ChainMap, type TxnRow } from './decl';

function money(n: number): string {
  if (!n) return '—';
  const a = Math.abs(n);
  return a >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${n}`;
}

export default function Trade() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chains, setChains] = useState<ChainMap>({});
  const [rows, setRows] = useState<TxnRow[] | null>(null);
  const role = user?.role ?? '';

  useEffect(() => { getChains().then(setChains); }, []);
  useEffect(() => { listTxns({ open: true, limit: 300 }).then(setRows); }, []);

  // The role's trading-shaped journey domains (Active Trading, Risk & Margin,
  // Post-trade & Settlement, Contracts). Openers + position filter both derive
  // from this — no chain-key regex.
  const domains = useMemo(() => tradeStarts(chains, role), [chains, role]);
  const tradeKeys = useMemo(
    () => new Set(domains.flatMap((d) => d.starts.map((s) => s.chainKey))),
    [domains],
  );

  const positions = useMemo(
    () => (rows ? homeSort(rows.filter((r) => tradeKeys.has(r.chain_key))) : []),
    [rows, tradeKeys],
  );

  // Role doesn't trade: nothing to show on either side.
  if (chains && Object.keys(chains).length > 0 && domains.length === 0) {
    return (
      <Shell>
        <div className="v2-empty">Trading isn’t part of your workspace.</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="v2-cols" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="v2-col">
          <h4>Your positions</h4>
          {rows === null ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="v2-skeleton" />)
          ) : positions.length === 0 ? (
            <div className="v2-empty">No open positions. Open one from the right.</div>
          ) : (
            <table className="v2-table">
              <thead>
                <tr><th>Ref</th><th>Position</th><th>State</th><th style={{ textAlign: 'right' }}>Value</th></tr>
              </thead>
              <tbody>
                {positions.map((r) => {
                  const kind = chains[r.chain_key] ? stateKind(chains[r.chain_key], r.state) : 'open';
                  const label = chains[r.chain_key]?.states[r.state]?.label ?? r.state;
                  return (
                    <tr key={r.id} className="v2-row" onClick={() => nav(`/v2/t/${r.id}`)}>
                      <td className="ref" style={{ width: 1, whiteSpace: 'nowrap' }}>{r.human_ref}</td>
                      <td className="ttl">{r.title}</td>
                      <td style={{ width: 1 }}><span className={`v2-pill is-${kind}`}>{label}</span></td>
                      <td className="money">{money(moneyValue(r))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="v2-col">
          <h4>Open a position</h4>
          {domains.map((d) => (
            <div key={d.key} className="v2-journey">
              <div className="v2-journey-hd">
                <span className="dot" style={{ ['--dc' as any]: d.color }} />
                <h3>{d.label}</h3>
                <span className="n">{d.starts.length}</span>
              </div>
              <div className="v2-starts">
                {d.starts.map((s) => (
                  <button
                    key={s.chainKey}
                    className="v2-start"
                    onClick={() => nav(`/v2/find?start=${s.chainKey}:${s.edge.id}`)}
                  >
                    <span className="plus">＋</span>
                    <span className="grow">{s.label}<span className="noun">{s.chain.noun}</span></span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
