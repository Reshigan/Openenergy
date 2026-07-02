// pages/src/meridian/surfaces/regulator/SurveillanceSurface.tsx
//
// Meridian surface — "Surveillance triage" (regulator role). Extracted verbatim from the
// `surveillance` inline tab body of the RegulatorWorkstationPage husk (E2.8d). Self-contained:
// lists surveillance triage decisions via ListingTable against /regulator/surveillance/triage
// and files new triage decisions via POST /regulator/surveillance/triage. Registered as
// `regulator:surveillance` in surfaces.tsx, reached from Atlas (⌘K) via roleData feature key
// `surveillance`. Non-chain CRUD surface (Bucket B).
import React, { useState } from 'react';
import { ListingTable, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { StatusPill } from '../../components';
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

export default function SurveillanceSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [bump, setBump] = useState(0);
  const refresh = () => setBump((n) => n + 1);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Triage alert" />
      <ListingTable
        key={`surveillance-${bump}`}
        endpoint="/regulator/surveillance/triage"
        rowKey={(r) => r.id}
        empty={{ title: 'No triage decisions yet', description: 'Surveillance alert triage decisions (false positive / monitor / escalate / contact party / close) will appear here.' }}
        columns={[
          { key: 'alert_id', label: 'Alert', render: (r) => <span className="font-mono text-[11px]">{(r.alert_id || '').slice(0, 12)}…</span> },
          { key: 'decision', label: 'Decision', render: (r) => <StatusPill status={r.decision} tone={r.decision === 'false_positive' || r.decision === 'close_no_action' ? 'good' : r.decision === 'escalate_to_enforcement' ? 'bad' : 'warn'} /> },
          { key: 'rationale', label: 'Rationale', render: (r) => <span className="block truncate max-w-md" title={r.rationale || ''}>{r.rationale || '—'}</span> },
          { key: 'triaged_at', label: 'Triaged', render: (r) => new Date(r.triaged_at).toLocaleString() },
          { key: 'next_review_at', label: 'Review by', render: (r) => r.next_review_at ? new Date(r.next_review_at).toLocaleDateString() : '—' },
        ]}
      />
      {filing && (
        <ActionModal
          title="Triage surveillance alert"
          submitLabel="Save triage"
          fields={[
            { key: 'alert_id', label: 'Alert ID', required: true },
            { key: 'decision', label: 'Decision', type: 'select', required: true, options: [
              { value: 'false_positive', label: 'False positive' },
              { value: 'monitor', label: 'Monitor' },
              { value: 'contact_party', label: 'Contact party' },
              { value: 'escalate_to_enforcement', label: 'Escalate to enforcement' },
              { value: 'close_no_action', label: 'Close — no action' },
            ] },
            { key: 'rationale', label: 'Rationale', type: 'textarea' },
            { key: 'enforcement_case_id', label: 'Enforcement case ID (if escalating)' },
            { key: 'next_review_at', label: 'Next review at', type: 'date' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/regulator/surveillance/triage', v);
            setFiling(false); refresh();
          }}
        />
      )}
    </div>
  );
}
