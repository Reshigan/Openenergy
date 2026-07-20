// pages/src/meridian/surfaces/admin/FlagsSurface.tsx
//
// Meridian surface — "Feature flag overrides" (admin role). Extracted verbatim from the inline
// `FlagsTab` body of the AdminWorkstationPage husk (E2.1). Self-contained: lists feature-flag
// overrides via the shared ListingTable against /admin-platform/flag-overrides and records an
// override via POST /admin-platform/flag-overrides. The husk's `onRefresh` is replaced by a
// local `bump` key that remounts the ListingTable after a successful override. Registered as
// `admin:flags` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key `flags`.
// Non-chain CRUD surface (Bucket B).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
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

export default function FlagsSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [bump, setBump] = useState(0);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Override flag" />
      <ListingTable
        key={`flag-overrides-${bump}`}
        endpoint="/admin-platform/flag-overrides"
        rowKey={(r) => r.id}
        empty={{ title: 'No flag overrides', description: 'Every feature-flag override (global / tenant / user) is audit-logged here.' }}
        columns={[
          { key: 'flag_key', label: 'Flag', render: (r) => <span className="font-mono text-[11px]">{r.flag_key}</span> },
          { key: 'scope_type', label: 'Scope', render: (r) => <Pill tone="info">{r.scope_type}</Pill> },
          { key: 'previous_value', label: 'Was', render: (r) => r.previous_value || '—' },
          { key: 'new_value', label: 'Now' },
          { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason || ''}>{r.reason || '—'}</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
        ]}
      />
      {filing && (
        <ActionModal
          title="Override feature flag"
          submitLabel="Override"
          fields={[
            { key: 'flag_key', label: 'Flag key', required: true, placeholder: 'e.g. trade.allow_advanced_modifiers' },
            { key: 'scope_type', label: 'Scope', type: 'select', required: true, options: [
              { value: 'global', label: 'Global' },
              { value: 'tenant', label: 'Tenant' },
              { value: 'user', label: 'User' },
            ] },
            { key: 'scope_id', label: 'Scope ID (if tenant/user)' },
            { key: 'previous_value', label: 'Previous value' },
            { key: 'new_value', label: 'New value', required: true },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/flag-overrides', v);
            setFiling(false); setBump((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
