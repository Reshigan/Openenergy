// pages/src/meridian/surfaces/trader/OrdersSurface.tsx
//
// Meridian surface — "Open orders" (trader role). Extracted verbatim from the inline
// `OrdersTab` body of the TraderWorkstationPage husk (E2.3). Trader ORDER surfaces are NOT
// chains (plan-mandated exception) — extracted as a self-contained listing + amend/cancel
// action surface (Bucket B). Registered as `trader:orders` in surfaces.tsx, reached from
// Atlas (⌘K) via the roleData feature key `orders`.
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

export default function OrdersSurface(_props: { role: string }) {
  const [cancelling, setCancelling] = useState<any | null>(null);
  const [amending, setAmending] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <ListingTable
        key={refreshKey}
        endpoint="/trading/orders"
        rowKey={(r) => r.id}
        rowHref={(r) => `/trading/orders/${r.id}`}
        empty={{ title: 'No orders', description: 'Orders you place will appear here. Use the trading desk to submit.' }}
        columns={[
          { key: 'id', label: 'Order', render: (r) => <span className="font-mono text-[11px]">{(r.id || '').slice(0, 12)}…</span> },
          { key: 'side', label: 'Side', render: (r) => <Pill tone={r.side === 'buy' ? 'info' : 'neutral'}>{r.side}</Pill> },
          { key: 'energy_type', label: 'Energy' },
          { key: 'volume_mwh', label: 'Vol (MWh)', align: 'right', render: (r) => `${Number(r.remaining_volume_mwh ?? r.volume_mwh).toFixed(1)} / ${Number(r.volume_mwh).toFixed(1)}` },
          { key: 'price', label: 'Price', align: 'right', render: (r) => r.price != null ? Number(r.price).toFixed(2) : '—' },
          { key: 'delivery_date', label: 'Delivery', render: (r) => r.delivery_date || '—' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'filled' ? 'good' : r.status === 'cancelled' ? 'bad' : 'warn'}>{(r.status || '').replace(/_/g, ' ')}</Pill> },
          { key: '_actions', label: '', render: (r) => (
            (r.status === 'open' || r.status === 'partially_filled') ? (
              <div className="flex gap-1">
                <button type="button" onClick={() => setAmending(r)} className="px-2 py-1 text-[11px] bg-[#c2873a] text-white rounded">Amend</button>
                <button type="button" onClick={() => setCancelling(r)} className="px-2 py-1 text-[11px] bg-red-600 text-white rounded">Cancel</button>
              </div>
            ) : null
          ) },
        ]}
      />
      {cancelling && (
        <ActionModal
          title={`Cancel order ${(cancelling.id || '').slice(0, 12)}…`}
          submitLabel="Cancel order"
          cta="danger"
          fields={[
            { key: 'reason', label: 'Cancellation reason', type: 'textarea', required: true, helperText: 'Audited — keep it specific.' },
          ] as FieldSpec[]}
          onClose={() => setCancelling(null)}
          onSubmit={async (v) => {
            await api.post(`/trading/orders/${cancelling.id}/cancel`, { reason: v.reason });
            setCancelling(null); onRefresh();
          }}
        />
      )}
      {amending && (
        <ActionModal
          title={`Amend order ${(amending.id || '').slice(0, 12)}…`}
          submitLabel="Submit amendment"
          fields={[
            { key: 'price', label: 'New price (blank = keep)', type: 'number', placeholder: String(amending.price ?? '') },
            { key: 'volume_mwh', label: 'New volume MWh (blank = keep)', type: 'number', placeholder: String(amending.volume_mwh ?? '') },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true, helperText: 'Audited — amendments are tracked in order_amendments.' },
          ] as FieldSpec[]}
          onClose={() => setAmending(null)}
          onSubmit={async (v) => {
            const body: any = { reason: v.reason };
            if (v.price) body.price = Number(v.price);
            if (v.volume_mwh) body.volume_mwh = Number(v.volume_mwh);
            await api.post(`/trading/orders/${amending.id}/amend`, body);
            setAmending(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}
