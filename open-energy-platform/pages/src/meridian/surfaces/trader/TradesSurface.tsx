// pages/src/meridian/surfaces/trader/TradesSurface.tsx
//
// Meridian surface — "Trade blotter" (trader role). Post-execution view: own fills
// (GET /api/trading/fills) and the cleared matches behind them (GET /api/trading/matches),
// toggled by a sub-view switch. Distinct from `trader:orders` (working/amendable orders) and
// `trader:positions` (netted book) — this is the execution audit trail with counterparty and
// P&L-attribution context. Bucket B read surface. Registered as `trader:trades` in surfaces.tsx,
// reached from Atlas (⌘K) via the roleData feature key `trades`.
import React, { useState } from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';

const num = (n: any, d = 2) => (n == null || isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d }));

function sideTone(s: string): 'good' | 'bad' | 'neutral' {
  if (s === 'buy') return 'good';
  if (s === 'sell') return 'bad';
  return 'neutral';
}

export default function TradesSurface(_props: { role: string }) {
  const [view, setView] = useState<'fills' | 'matches'>('fills');
  return (
    <div>
      <div className="flex gap-1 mb-3">
        {(['fills', 'matches'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`h-8 px-3 rounded-md text-[12px] font-semibold ${view === v ? 'bg-[var(--petrol)] text-white' : 'bg-[var(--raised)] text-[var(--ink2)]'}`}
          >
            {v === 'fills' ? 'My fills' : 'Cleared matches'}
          </button>
        ))}
      </div>
      {view === 'fills' ? (
        <ListingTable
          key="fills"
          endpoint="/trading/fills"
          rowKey={(r) => r.id}
          empty={{ title: 'No fills', description: 'Executed fills against your orders appear here.' }}
          columns={[
            { key: 'executed_at', label: 'Executed', render: (r) => r.executed_at ? new Date(r.executed_at).toLocaleString() : '—' },
            { key: 'side', label: 'Side', render: (r) => <Pill tone={sideTone(r.side)}>{r.side || '—'}</Pill> },
            { key: 'shard_key', label: 'Shard', render: (r) => <span className="font-mono text-[10px] text-[var(--ink3)]">{r.shard_key || '—'}</span> },
            { key: 'volume_mwh', label: 'MWh', align: 'right', render: (r) => num(r.volume_mwh, 1) },
            { key: 'price', label: 'Price', align: 'right', render: (r) => num(r.price) },
            { key: 'order_id', label: 'Order', render: (r) => <span className="font-mono text-[10px] text-[var(--ink3)]">{r.order_id || '—'}</span> },
            { key: 'match_id', label: 'Match', render: (r) => <span className="font-mono text-[10px] text-[var(--ink3)]">{r.match_id || '—'}</span> },
          ]}
        />
      ) : (
        <ListingTable
          key="matches"
          endpoint="/trading/matches"
          rowKey={(r) => r.id}
          empty={{ title: 'No matches', description: 'Cleared matches across the book appear here.' }}
          columns={[
            { key: 'matched_at', label: 'Matched', render: (r) => r.matched_at ? new Date(r.matched_at).toLocaleString() : '—' },
            { key: 'energy_type', label: 'Energy', render: (r) => <Pill tone="info">{(r.energy_type || '—').replace(/_/g, ' ')}</Pill> },
            { key: 'delivery_date', label: 'Delivery', render: (r) => r.delivery_date ? new Date(r.delivery_date).toLocaleDateString() : '—' },
            { key: 'matched_volume_mwh', label: 'MWh', align: 'right', render: (r) => num(r.matched_volume_mwh, 1) },
            { key: 'buyer_name', label: 'Buyer', render: (r) => r.buyer_name || '—' },
            { key: 'seller_name', label: 'Seller', render: (r) => r.seller_name || '—' },
            { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'settled' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'}>{r.status || '—'}</Pill> },
          ]}
        />
      )}
    </div>
  );
}
