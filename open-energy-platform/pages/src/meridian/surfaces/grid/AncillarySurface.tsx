// pages/src/meridian/surfaces/grid/AncillarySurface.tsx
//
// Meridian surface — "Ancillary services events" (grid_operator role). Extracted verbatim from
// the inline `AncillaryTab` body of the GridOpsWorkstationPage husk (E2.5). Self-contained:
// lists the ancillary award event log via the shared ListingTable + a "Log ancillary event"
// ActionModal. Non-chain CRUD/event-log surface (Bucket B) — distinct from the W50
// `reserve_activation` chain (reached via /ledger). Registered as `grid_operator:ancillary` in
// surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key `ancillary` (added in E2.5).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

export default function AncillarySurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log ancillary event" />
      <ListingTable
        key={refreshKey}
        endpoint="/grid-operator/ancillary-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No ancillary events', description: 'Award acceptances, deliveries, failures and settlement events land here.' }}
        columns={[
          { key: 'award_id', label: 'Award', render: (r) => <span className="font-mono text-[11px]">{(r.award_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'delivered' || r.event_type === 'settled' ? 'good' : r.event_type === 'failed' || r.event_type === 'declined' ? 'bad' : 'info'}>{r.event_type}</Pill> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log ancillary award event"
          submitLabel="Log"
          fields={[
            { key: 'award_id', label: 'Award ID', required: true },
            { key: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'awarded', label: 'Awarded' },
              { value: 'accepted', label: 'Accepted' },
              { value: 'declined', label: 'Declined' },
              { value: 'delivered', label: 'Delivered' },
              { value: 'failed', label: 'Failed' },
              { value: 'settled', label: 'Settled' },
            ] },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/grid-operator/ancillary-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}
