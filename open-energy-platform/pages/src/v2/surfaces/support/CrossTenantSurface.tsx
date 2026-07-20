// pages/src/meridian/surfaces/support/CrossTenantSurface.tsx
//
// Meridian surface — "Cross-tenant access" (support role). Extracted verbatim from the
// `cross_tenant` tab body of the SupportWorkstationPage husk (E2.4). Self-contained: a POPIA
// cross-tenant access log ListingTable + the "Log access" ActionModal. Bucket B (non-chain
// inline CRUD). Registered as `support:cross_tenant`, reached from Atlas (⌘K) via the roleData
// feature key `cross_tenant`.
import React, { useState } from 'react';
import { ListingTable, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

export default function CrossTenantSurface(_props: { role: string }) {
  const [loggingAccess, setLoggingAccess] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => setRefreshKey((k) => k + 1);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setLoggingAccess(true)} className="btn pri">
          + Log access
        </button>
      </div>
      <ListingTable
        key={refreshKey}
        endpoint="/support/cross-tenant-access"
        rowKey={(r) => r.id}
        empty={{ title: 'No cross-tenant access logs', description: 'Every cross-tenant data access is POPIA-logged here.' }}
        columns={[
          { key: 'agent_id', label: 'Agent', render: (r) => <span className="font-mono text-[11px]">{(r.agent_id || '').slice(0, 12)}…</span> },
          { key: 'tenant_accessed', label: 'Tenant', render: (r) => <span className="font-mono text-[11px]">{(r.tenant_accessed || '').slice(0, 12)}…</span> },
          { key: 'resource_type', label: 'Resource' },
          { key: 'justification', label: 'Justification', render: (r) => <span className="block truncate max-w-md" title={r.justification}>{r.justification}</span> },
          { key: 'accessed_at', label: 'When', render: (r) => new Date(r.accessed_at).toLocaleString() },
        ]}
      />
      {loggingAccess && (
        <ActionModal
          title="Log cross-tenant access (POPIA audit)"
          submitLabel="Log"
          fields={[
            { key: 'tenant_accessed', label: 'Tenant ID accessed', required: true },
            { key: 'resource_type', label: 'Resource type', required: true, placeholder: 'e.g. invoice, contract, project' },
            { key: 'resource_id', label: 'Resource ID (optional)' },
            { key: 'justification', label: 'Justification', type: 'textarea', required: true, helperText: 'POPIA requires a documented reason for cross-tenant access.' },
            { key: 'ticket_id', label: 'Linked ticket (optional)', type: 'lookup', lookupEndpoint: '/api/lookup/tickets', lookupAutoFill: { ticket_ref: 'reference' } },
          ] as FieldSpec[]}
          onClose={() => setLoggingAccess(false)}
          onSubmit={async (v) => {
            await api.post('/support/cross-tenant-access', v);
            setLoggingAccess(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}
