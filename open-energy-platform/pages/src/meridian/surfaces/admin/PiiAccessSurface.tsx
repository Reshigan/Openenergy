// pages/src/meridian/surfaces/admin/PiiAccessSurface.tsx
//
// Meridian surface — "PII access log" (admin role). Extracted verbatim from the inline
// `PiiAccessTab` body of the AdminWorkstationPage husk (E2.1). Self-contained read-only view:
// lists every cross-tenant read of personal information (POPIA s.18/s.19) via the shared
// ListingTable against /popia/pii-access. Registered as `admin:pii_access` in surfaces.tsx,
// reached from Atlas (⌘K) via the roleData feature key `pii_access` (added in E2.1 — the husk
// tab had no roleData feature). Non-chain read-only surface (Bucket B).
import React from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';

export default function PiiAccessSurface(_props: { role: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[var(--line)] bg-surface-v2 p-4 text-[12px] text-[var(--ink2)]">
        Every cross-tenant read of personal information is logged here under
        POPIA s.18 (accountability) + s.19 (security safeguards). Each entry
        is also chained on the <span className="font-mono">admin</span> audit
        chain via the cascade hook, so this view is tamper-evident — a
        regulator can verify any row against the chain head.
      </div>
      <ListingTable
        endpoint="/popia/pii-access"
        rowKey={(r) => r.id}
        empty={{ title: 'No PII access logged', description: 'Cross-tenant data access by admins / support / regulators will appear here as it happens.' }}
        columns={[
          { key: 'created_at', label: 'When', render: (r) => new Date(r.created_at).toLocaleString() },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 16)}…</span> },
          { key: 'access_type', label: 'Type', render: (r) => <Pill tone={r.access_type === 'impersonation' ? 'bad' : 'info'}>{(r.access_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'subject_id', label: 'Subject', render: (r) => <span className="font-mono text-[11px]">{(r.subject_id || '').slice(0, 16)}…</span> },
          { key: 'justification', label: 'Justification', render: (r) => <span className="block truncate max-w-md" title={r.justification || ''}>{r.justification || '—'}</span> },
        ]}
      />
    </div>
  );
}
