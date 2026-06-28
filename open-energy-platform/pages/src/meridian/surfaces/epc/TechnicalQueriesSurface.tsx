// pages/src/meridian/surfaces/epc/TechnicalQueriesSurface.tsx
//
// Meridian surface — "Technical queries" (epc_contractor role). Extracted verbatim from
// the `technical-queries` tab body of the EpcWorkstationPage husk (E2.8b). Self-contained:
// it fetches its own data via the shared ListingTable against /ipp/technical-queries. No
// dependency on workstation-page-local state. Registered as `epc_contractor:technical-queries`
// in surfaces.tsx, reached from Atlas (⌘K) via roleData feature key `technical-queries`.
// Non-chain read-only listing (Bucket B) — /ipp/technical-queries has no MERIDIAN_CHAINS
// descriptor, so it is extracted rather than retired to /ledger.
import React from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';
import { statusLabel } from '../../ease/statusLabel';

export default function TechnicalQueriesSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/ipp/technical-queries"
      rowKey={(r) => r.id}
      empty={{ title: 'No technical queries', description: 'Engineering technical queries will appear here.' }}
      columns={[
        { key: 'tq_number', label: 'TQ No.', render: (r) => <span className="font-mono text-[11px]">{r.tq_number}</span> },
        { key: 'subject', label: 'Subject', render: (r) => <span className="block truncate max-w-xs">{r.subject}</span> },
        { key: 'discipline', label: 'Discipline' },
        { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'closed' ? 'good' : 'warn'}>{statusLabel(r.status).text}</Pill> },
        { key: 'created_at', label: 'Raised', render: (r) => new Date(r.created_at).toLocaleDateString() },
      ]}
    />
  );
}
