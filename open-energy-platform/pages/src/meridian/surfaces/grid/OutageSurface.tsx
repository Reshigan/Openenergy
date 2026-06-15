// pages/src/meridian/surfaces/grid/OutageSurface.tsx
//
// Meridian surface — "Outage responses" (grid_operator role). Extracted verbatim from the inline
// `OutageTab` body of the GridOpsWorkstationPage husk (E2.5). Self-contained: lists the outage
// response log via the shared ListingTable (rows link to /grid-operator/outages/:id) + a
// "Log outage response" ActionModal. Non-chain CRUD/event-log surface (Bucket B). Registered as
// `grid_operator:outage` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key
// `outage` (added in E2.5).
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

export default function OutageSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log outage response" />
      <ListingTable
        key={refreshKey}
        endpoint="/grid-operator/outage-responses"
        rowKey={(r) => r.id}
        rowHref={(r) => `/grid-operator/outages/${encodeURIComponent(r.outage_id)}`}
        empty={{ title: 'No outage responses', description: 'Acknowledgements, crew dispatch, rerouting and restoration events will appear here.' }}
        columns={[
          { key: 'outage_id', label: 'Outage', render: (r) => <span className="font-mono text-[11px]">{(r.outage_id || '').slice(0, 12)}…</span> },
          { key: 'response_type', label: 'Response', render: (r) => <Pill tone={r.response_type === 'restored' || r.response_type === 'closed' ? 'good' : 'warn'}>{r.response_type.replace(/_/g, ' ')}</Pill> },
          { key: 'eta_minutes', label: 'ETA (min)', align: 'right' },
          { key: 'responded_at', label: 'When', render: (r) => new Date(r.responded_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log outage response"
          submitLabel="Log"
          fields={[
            { key: 'outage_id', label: 'Outage ID', required: true },
            { key: 'response_type', label: 'Response type', type: 'select', required: true, options: [
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'dispatched_crew', label: 'Dispatched crew' },
              { value: 'rerouted', label: 'Rerouted' },
              { value: 'restored', label: 'Restored' },
              { value: 'escalated', label: 'Escalated' },
              { value: 'closed', label: 'Closed' },
            ] },
            { key: 'eta_minutes', label: 'ETA (minutes)', type: 'number' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            const body: any = { outage_id: v.outage_id, response_type: v.response_type, notes: v.notes };
            if (v.eta_minutes) body.eta_minutes = Number(v.eta_minutes);
            await api.post('/grid-operator/outage-responses', body);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}
