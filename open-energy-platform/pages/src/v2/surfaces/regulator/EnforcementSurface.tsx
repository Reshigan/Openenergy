// pages/src/meridian/surfaces/regulator/EnforcementSurface.tsx
//
// Meridian surface — "Enforcement events" (regulator role). Extracted verbatim from the
// `enforcement` inline tab body of the RegulatorWorkstationPage husk (E2.8d). Self-contained:
// lists enforcement case events via ListingTable against /regulator/enforcement-events and
// logs new events via POST /regulator/enforcement-events. Registered as `regulator:enforcement`
// in surfaces.tsx, reached from Atlas (⌘K) via roleData feature key `enforcement`. Non-chain
// event-log surface (Bucket B) — distinct from the `enforcement_action` chain (→ /ledger).
import React, { useState } from 'react';
import { ListingTable, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { StatusPill } from '../../../shared/StatusPill';
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

export default function EnforcementSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [bump, setBump] = useState(0);
  const refresh = () => setBump((n) => n + 1);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log enforcement event" />
      <ListingTable
        key={`enforcement-${bump}`}
        endpoint="/regulator/enforcement-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No enforcement events', description: 'Case opened / evidence filed / hearings / findings / appeals events will appear here.' }}
        columns={[
          { key: 'case_id', label: 'Case', render: (r) => <span className="font-mono text-[11px]">{(r.case_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <StatusPill status={r.event_type} tone={r.event_type === 'closed' ? 'good' : r.event_type === 'finding_issued' || r.event_type === 'appeal_lodged' ? 'bad' : 'info'} /> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log enforcement case event"
          submitLabel="Log"
          fields={[
            { key: 'case_id', label: 'Case ID', required: true },
            { key: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'opened', label: 'Opened' },
              { value: 'evidence_filed', label: 'Evidence filed' },
              { value: 'hearing_scheduled', label: 'Hearing scheduled' },
              { value: 'hearing_held', label: 'Hearing held' },
              { value: 'finding_issued', label: 'Finding issued' },
              { value: 'appeal_lodged', label: 'Appeal lodged' },
              { value: 'appeal_decided', label: 'Appeal decided' },
              { value: 'closed', label: 'Closed' },
            ] },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/regulator/enforcement-events', v);
            setFiling(false); refresh();
          }}
        />
      )}
    </div>
  );
}
