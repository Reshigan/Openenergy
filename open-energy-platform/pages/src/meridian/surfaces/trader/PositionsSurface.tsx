// pages/src/meridian/surfaces/trader/PositionsSurface.tsx
//
// Meridian surface — "Positions & P&L" (trader role). Read-only book over
// GET /api/trader-risk/positions (scoped to caller): net volume, mark vs entry, and realised /
// unrealised P&L per energy_type × delivery_date. Distinct from `trader:orders` (working orders)
// and `trader:trades` (executions) — this is the live position blotter with mark-to-market.
// Bucket B read surface. Registered as `trader:positions` in surfaces.tsx, reached from Atlas
// (⌘K) via the roleData feature key `positions`.
import React from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';

const zar = (n: any) => (n == null || isNaN(Number(n)) ? '—' : `R${Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`);
const num = (n: any, d = 2) => (n == null || isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d }));

function pnlCell(v: any) {
  if (v == null || isNaN(Number(v))) return <span>—</span>;
  const n = Number(v);
  const tone = n > 0 ? 'good' : n < 0 ? 'bad' : 'neutral';
  return <Pill tone={tone}>{zar(n)}</Pill>;
}

export default function PositionsSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/trader-risk/positions"
      rowKey={(r) => r.id ?? `${r.energy_type}-${r.delivery_date}`}
      empty={{ title: 'No open positions', description: 'Filled orders that net to a non-zero position will appear here, marked to the latest VWAP.' }}
      columns={[
        { key: 'energy_type', label: 'Energy', render: (r) => <Pill tone="info">{(r.energy_type || '—').replace(/_/g, ' ')}</Pill> },
        { key: 'delivery_date', label: 'Delivery', render: (r) => r.delivery_date ? new Date(r.delivery_date).toLocaleDateString() : '—' },
        { key: 'net_volume_mwh', label: 'Net MWh', align: 'right', render: (r) => {
          const n = Number(r.net_volume_mwh);
          return <span className={n < 0 ? 'text-rose-600' : 'text-emerald-700'}>{num(r.net_volume_mwh, 1)}</span>;
        } },
        { key: 'avg_entry_price', label: 'Avg entry', align: 'right', render: (r) => num(r.avg_entry_price) },
        { key: 'mark_price', label: 'Mark', align: 'right', render: (r) => num(r.mark_price) },
        { key: 'notional', label: 'Notional', align: 'right', render: (r) => zar(r.notional) },
        { key: 'unrealised_pnl', label: 'Unrealised', align: 'right', render: (r) => pnlCell(r.unrealised_pnl) },
        { key: 'realised_pnl', label: 'Realised', align: 'right', render: (r) => pnlCell(r.realised_pnl) },
        { key: 'updated_at', label: 'Marked', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleString() : '—' },
      ]}
    />
  );
}
