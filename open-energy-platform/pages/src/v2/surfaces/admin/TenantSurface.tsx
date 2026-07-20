// pages/src/meridian/surfaces/admin/TenantSurface.tsx
//
// Meridian surface — "Tenant lifecycle" (admin role). Extracted verbatim from the inline
// `TenantTab` body of the AdminWorkstationPage husk (E2.1). Self-contained: lists tenant
// lifecycle events via the shared ListingTable against /admin-platform/tenant-events and logs
// a new event via POST /admin-platform/tenant-events. The husk's `onRefresh` is replaced by a
// local `bump` key that remounts the ListingTable after a successful log. Registered as
// `admin:tenant_events` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key
// `tenant_events`. Non-chain CRUD surface (Bucket B).
import React, { useState } from 'react';
import { ListingTable, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { StatusPill } from '../../../meridian/components';
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

export default function TenantSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [bump, setBump] = useState(0);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log tenant event" />
      <ListingTable
        key={`tenant-events-${bump}`}
        endpoint="/admin-platform/tenant-events"
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin-platform/tenants/${r.tenant_id}`}
        empty={{ title: 'No tenant events yet', description: 'Provisioned / activated / KYC / suspended / offboarded / data-erased events for every tenant will appear here.' }}
        columns={[
          { key: 'tenant_id', label: 'Tenant', render: (r) => <span className="font-mono text-[11px]">{(r.tenant_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <StatusPill status={r.event_type} tone={r.event_type === 'activated' || r.event_type === 'reactivated' || r.event_type === 'kyc_approved' ? 'good' : r.event_type === 'suspended' || r.event_type === 'offboarded' || r.event_type === 'kyc_rejected' || r.event_type === 'data_erased' ? 'bad' : 'info'} /> },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 12)}…</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason || ''}>{r.reason || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log tenant lifecycle event"
          submitLabel="Log"
          fields={[
            { key: 'tenant_id', label: 'Tenant', required: true, type: 'lookup', lookupEndpoint: '/api/lookup/tenants', lookupAutoFill: { name: 'tenant_name' } },
            { key: 'event_type', label: 'Event', type: 'select', required: true, options: [
              { value: 'provisioned', label: 'Provisioned' },
              { value: 'activated', label: 'Activated' },
              { value: 'plan_changed', label: 'Plan changed' },
              { value: 'kyc_approved', label: 'KYC approved' },
              { value: 'kyc_rejected', label: 'KYC rejected' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'reactivated', label: 'Reactivated' },
              { value: 'offboarded', label: 'Offboarded' },
              { value: 'data_exported', label: 'Data exported' },
              { value: 'data_erased', label: 'Data erased' },
            ] },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/tenant-events', v);
            setFiling(false); setBump((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
