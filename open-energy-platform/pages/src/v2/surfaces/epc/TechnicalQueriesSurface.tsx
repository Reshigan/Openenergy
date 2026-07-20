// pages/src/meridian/surfaces/epc/TechnicalQueriesSurface.tsx
//
// Meridian surface — "Technical queries" (epc_contractor role). Extracted verbatim from
// the `technical-queries` tab body of the EpcWorkstationPage husk (E2.8b). Self-contained:
// it fetches its own data via the shared ListingTable against /api/ipp-tq (Wave 142 TQ log,
// src/routes/ipp-tq.ts, table oe_ipp_tqs). The husk originally pointed at /ipp/technical-queries
// which never existed (404). Registered as `epc_contractor:technical-queries`
// in surfaces.tsx, reached from Atlas (⌘K) via roleData feature key `technical-queries`.
// Non-chain read-only listing (Bucket B) — ipp-tq returns { data: [...rows], dashboard };
// ListingTable unwraps the `data` array directly.
import React from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';
import { statusLabel } from '../../../shared/ease/statusLabel';

export default function TechnicalQueriesSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/ipp-tq"
      rowKey={(r) => r.id}
      empty={{ title: 'No technical queries', description: 'Engineering technical queries will appear here.' }}
      columns={[
        { key: 'tq_number', label: 'TQ No.', render: (r) => <span className="font-mono text-[11px]">{r.tq_number}</span> },
        { key: 'tq_title', label: 'Subject', render: (r) => <span className="block truncate max-w-xs">{r.tq_title}</span> },
        { key: 'discipline', label: 'Discipline' },
        { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={r.chain_status === 'closed' ? 'good' : 'warn'}>{statusLabel(r.chain_status).text}</Pill> },
        { key: 'created_at', label: 'Raised', render: (r) => new Date(r.created_at).toLocaleDateString() },
      ]}
    />
  );
}
