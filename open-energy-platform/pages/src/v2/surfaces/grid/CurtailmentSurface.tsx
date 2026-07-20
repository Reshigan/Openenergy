// pages/src/meridian/surfaces/grid/CurtailmentSurface.tsx
//
// Meridian surface — "Curtailment events" (grid_operator role). Extracted verbatim from the
// inline `CurtailmentTab` body of the GridOpsWorkstationPage husk (E2.5). Self-contained: lists
// the CSC-1 curtailment event log via the shared ListingTable + a "Log curtailment event"
// ActionModal. Non-chain CRUD/event-log surface (Bucket B). Registered as
// `grid_operator:curtailment` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature
// key `curtailment`.
import React, { useState } from 'react';
import { ListingTable, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { StatusPill } from '../../../shared/StatusPill';
import { api } from '../../../lib/api';

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="btn pri">
        + {label}
      </button>
    </div>
  );
}

export default function CurtailmentSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log curtailment event" />
      <ListingTable
        key={refreshKey}
        endpoint="/grid-operator/curtailment-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No curtailment events', description: 'Issuance, acknowledgement, partial / full lift events will appear here.' }}
        columns={[
          { key: 'curtailment_id', label: 'Curtailment', render: (r) => <span className="font-mono text-[11px]">{(r.curtailment_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <StatusPill status={r.event_type} tone={r.event_type.includes('lift') ? 'good' : r.event_type === 'disputed' ? 'bad' : 'info'} /> },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 12)}…</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log curtailment event"
          submitLabel="Log"
          fields={[
            { key: 'curtailment_id', label: 'Curtailment ID', required: true },
            { key: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'issued', label: 'Issued' },
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'disputed', label: 'Disputed' },
              { value: 'partial_lift', label: 'Partial lift' },
              { value: 'full_lift', label: 'Full lift' },
              { value: 'escalated', label: 'Escalated' },
            ] },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/grid-operator/curtailment-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}
