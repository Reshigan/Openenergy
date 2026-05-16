import React from 'react';
import { WorkstationShell, ListingTable, Pill } from '../launch/WorkstationShell';

export function RegulatorWorkstationPage() {
  return (
    <WorkstationShell
      eyebrow="Regulator · Workstation"
      title="Regulator workstation"
      subtitle="Surveillance triage · Licence action workflow · Enforcement case events."
      backHref="/regulator-suite"
      backLabel="Regulator suite"
      tabs={[
        {
          key: 'surveillance',
          label: 'Surveillance triage',
          body: () => (
            <ListingTable
              endpoint="/regulator-suite/surveillance/triage"
              rowKey={(r) => r.id}
              empty={{ title: 'No triage decisions yet', description: 'Surveillance alert triage decisions (false positive / monitor / escalate / contact party / close) will appear here.' }}
              columns={[
                { key: 'alert_id', label: 'Alert', render: (r) => <span className="font-mono text-[11px]">{(r.alert_id || '').slice(0, 12)}…</span> },
                { key: 'decision', label: 'Decision', render: (r) => <Pill tone={r.decision === 'false_positive' || r.decision === 'close_no_action' ? 'good' : r.decision === 'escalate_to_enforcement' ? 'bad' : 'warn'}>{r.decision.replace(/_/g, ' ')}</Pill> },
                { key: 'rationale', label: 'Rationale', render: (r) => <span className="block truncate max-w-md" title={r.rationale || ''}>{r.rationale || '—'}</span> },
                { key: 'triaged_at', label: 'Triaged', render: (r) => new Date(r.triaged_at).toLocaleString() },
                { key: 'next_review_at', label: 'Review by', render: (r) => r.next_review_at ? new Date(r.next_review_at).toLocaleDateString() : '—' },
              ]}
            />
          ),
        },
        {
          key: 'licences',
          label: 'Licence actions',
          body: () => (
            <ListingTable
              endpoint="/regulator-suite/licence-actions"
              rowKey={(r) => r.id}
              empty={{ title: 'No licence actions yet', description: 'Grant, vary, suspend, revoke, reinstate and renew workflows will appear here.' }}
              columns={[
                { key: 'action_type', label: 'Action', render: (r) => <Pill tone={r.action_type === 'grant' || r.action_type === 'renew' || r.action_type === 'reinstate' ? 'good' : r.action_type === 'revoke' || r.action_type === 'suspend' ? 'bad' : 'warn'}>{r.action_type}</Pill> },
                { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'executed' || r.status === 'decided' ? 'good' : r.status === 'reversed' ? 'bad' : 'info'}>{r.status.replace(/_/g, ' ')}</Pill> },
                { key: 'licence_id', label: 'Licence', render: (r) => r.licence_id ? <span className="font-mono text-[11px]">{r.licence_id.slice(0, 12)}…</span> : '—' },
                { key: 'application_id', label: 'Application', render: (r) => r.application_id ? <span className="font-mono text-[11px]">{r.application_id.slice(0, 12)}…</span> : '—' },
                { key: 'initiated_at', label: 'Initiated', render: (r) => new Date(r.initiated_at).toLocaleDateString() },
                { key: 'decided_at', label: 'Decided', render: (r) => r.decided_at ? new Date(r.decided_at).toLocaleDateString() : '—' },
              ]}
            />
          ),
        },
        {
          key: 'enforcement',
          label: 'Enforcement events',
          body: () => (
            <ListingTable
              endpoint="/regulator-suite/enforcement-events"
              rowKey={(r) => r.id}
              empty={{ title: 'No enforcement events', description: 'Case opened / evidence filed / hearings / findings / appeals events will appear here.' }}
              columns={[
                { key: 'case_id', label: 'Case', render: (r) => <span className="font-mono text-[11px]">{(r.case_id || '').slice(0, 12)}…</span> },
                { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'closed' ? 'good' : r.event_type === 'finding_issued' || r.event_type === 'appeal_lodged' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
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
