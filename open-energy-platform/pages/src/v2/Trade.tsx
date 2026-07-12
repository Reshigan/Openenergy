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
import { newEdges, moneyValue, homeSort, stateKind, type ChainMap, type TxnRow, type TransitionDecl } from './decl';

// ponytail: trading family by key/noun match — no `family` tag on ChainDecl.
// Add a real family field to ChainDecl when a second surface needs to group by it.
const TRADE_RE = /trade|order|bid|offer|auction|ppa|power|energy|swap|hedge|rec\b|carbon|allocation|position|match/i;
const isTrade = (c: { key: string; noun: string }) => TRADE_RE.test(c.key) || TRADE_RE.test(c.noun);

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

  const tradeKeys = useMemo(
    () => new Set(Object.values(chains).filter(isTrade).map((c) => c.key)),
    [chains],
  );

  const positions = useMemo(
    () => (rows ? homeSort(rows.filter((r) => tradeKeys.has(r.chain_key))) : []),
    [rows, tradeKeys],
  );

  const openers = useMemo(() => {
    const out: { chainKey: string; noun: string; t: TransitionDecl; enabled: boolean }[] = [];
    for (const c of Object.values(chains)) {
      if (!isTrade(c)) continue;
      for (const t of newEdges(c)) out.push({ chainKey: c.key, noun: c.noun, t, enabled: t.by.includes(role) });
    }
    return out.sort((a, b) => Number(b.enabled) - Number(a.enabled));
  }, [chains, role]);

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
                <tr><th>Ref</th><th>Position</th><th>State</th><th style={{ textAlign: 'right' }}>Notional</th></tr>
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
          <div className="v2-starts">
            {openers.length === 0 && <div className="v2-empty">No trading actions available.</div>}
            {openers.map((s) => (
              <button
                key={`${s.chainKey}:${s.t.id}`}
                className={`v2-start ${s.enabled ? '' : 'blocked'}`}
                disabled={!s.enabled}
                onClick={() => nav(`/v2/find?start=${s.chainKey}:${s.t.id}`)}
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
