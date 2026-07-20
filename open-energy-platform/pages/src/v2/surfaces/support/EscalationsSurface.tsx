// pages/src/meridian/surfaces/support/EscalationsSurface.tsx
//
// Meridian surface — "Escalations" (support role). Extracted verbatim from the `escalations`
// tab body of the SupportWorkstationPage husk (E2.4). Self-contained read-only ListingTable of
// tickets escalated to engineering / management. Bucket B (non-chain inline listing).
// Registered as `support:escalations`, reached from Atlas (⌘K) via roleData feature key `escalations`.
import React from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';

export default function EscalationsSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/support/escalations"
      rowKey={(r) => r.id}
      empty={{ title: 'No escalations', description: 'Tickets that bubble up to engineering / management will appear here.' }}
      columns={[
        { key: 'ticket_id', label: 'Ticket', render: (r) => <span className="font-mono text-[11px]">{(r.ticket_id || '').slice(0, 12)}…</span> },
        { key: 'escalated_to', label: 'To', render: (r) => <span className="font-mono text-[11px]">{(r.escalated_to || '').slice(0, 18)}…</span> },
        { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason}>{r.reason}</span> },
        { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' || r.status === 'accepted' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Pill> },
        { key: 'escalated_at', label: 'When', render: (r) => new Date(r.escalated_at).toLocaleString() },
      ]}
    />
  );
}
