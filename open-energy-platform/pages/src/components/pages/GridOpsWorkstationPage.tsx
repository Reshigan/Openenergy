import React from 'react';
import { WorkstationShell, ListingTable, Pill } from '../launch/WorkstationShell';

export function GridOpsWorkstationPage() {
  return (
    <WorkstationShell
      eyebrow="Grid operator · Workstation"
      title="Grid operations workstation"
      subtitle="Curtailment events · Outage responses · Ancillary award events. Single screen, all in-platform."
      backHref="/grid-operator"
      backLabel="Operator suite"
      tabs={[
        {
          key: 'curtailment',
          label: 'Curtailment events',
          body: () => (
            <ListingTable
              endpoint="/grid-operator/curtailment-events"
              rowKey={(r) => r.id}
              empty={{ title: 'No curtailment events', description: 'Issuance, acknowledgement, partial / full lift events will appear here.' }}
              columns={[
                { key: 'curtailment_id', label: 'Curtailment', render: (r) => <span className="font-mono text-[11px]">{(r.curtailment_id || '').slice(0, 12)}…</span> },
                { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type.includes('lift') ? 'good' : r.event_type === 'disputed' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
                { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 12)}…</span> },
                { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
                { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
              ]}
            />
          ),
        },
        {
          key: 'outage',
          label: 'Outage responses',
          body: () => (
            <ListingTable
              endpoint="/grid-operator/outage-responses"
              rowKey={(r) => r.id}
              empty={{ title: 'No outage responses', description: 'Acknowledgements, crew dispatch, rerouting and restoration events will appear here.' }}
              columns={[
                { key: 'outage_id', label: 'Outage', render: (r) => <span className="font-mono text-[11px]">{(r.outage_id || '').slice(0, 12)}…</span> },
                { key: 'response_type', label: 'Response', render: (r) => <Pill tone={r.response_type === 'restored' || r.response_type === 'closed' ? 'good' : 'warn'}>{r.response_type.replace(/_/g, ' ')}</Pill> },
                { key: 'eta_minutes', label: 'ETA (min)', align: 'right' },
                { key: 'responded_at', label: 'When', render: (r) => new Date(r.responded_at).toLocaleString() },
                { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
              ]}
            />
          ),
        },
        {
          key: 'ancillary',
          label: 'Ancillary award events',
          body: () => (
            <ListingTable
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
          ),
        },
      ]}
    />
  );
}
