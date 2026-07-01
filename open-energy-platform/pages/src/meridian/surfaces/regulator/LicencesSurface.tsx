// pages/src/meridian/surfaces/regulator/LicencesSurface.tsx
//
// Meridian surface — "Licence actions" (regulator role). Extracted verbatim from the
// `licences` inline tab body of the RegulatorWorkstationPage husk (E2.8d). Self-contained:
// lists licence actions via ListingTable against /regulator/licence-actions, files new
// actions via POST /regulator/licence-actions, and transitions them via
// POST /regulator/licence-actions/:id/transition. Registered as `regulator:licences` in
// surfaces.tsx, reached from Atlas (⌘K) via roleData feature key `licences`. Non-chain CRUD
// surface (Bucket B).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';
import { statusLabel } from '../../ease/statusLabel';

const LICENCE_TRANSITIONS = [
  { value: 'pending_hearing', label: 'Schedule hearing' },
  { value: 'decided', label: 'Decide' },
  { value: 'executed', label: 'Execute' },
  { value: 'appealed', label: 'Appeal' },
  { value: 'reversed', label: 'Reverse' },
];

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="btn pri">
        + {label}
      </button>
    </div>
  );
}

export default function LicencesSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  const [bump, setBump] = useState(0);
  const refresh = () => setBump((n) => n + 1);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="File licence action" />
      <ListingTable
        key={`licences-${bump}`}
        endpoint="/regulator/licence-actions"
        rowKey={(r) => r.id}
        rowHref={(r) => `/regulator/licence-actions/${r.id}`}
        empty={{ title: 'No licence actions yet', description: 'Grant, vary, suspend, revoke, reinstate and renew workflows will appear here.' }}
        columns={[
          { key: 'action_type', label: 'Action', render: (r) => <Pill tone={r.action_type === 'grant' || r.action_type === 'renew' || r.action_type === 'reinstate' ? 'good' : r.action_type === 'revoke' || r.action_type === 'suspend' ? 'bad' : 'warn'}>{r.action_type}</Pill> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'executed' || r.status === 'decided' ? 'good' : r.status === 'reversed' ? 'bad' : 'info'}>{statusLabel(r.status).text}</Pill> },
          { key: 'licence_id', label: 'Licence', render: (r) => r.licence_id ? <span className="font-mono text-[11px]">{r.licence_id.slice(0, 12)}…</span> : '—' },
          { key: 'application_id', label: 'Application', render: (r) => r.application_id ? <span className="font-mono text-[11px]">{r.application_id.slice(0, 12)}…</span> : '—' },
          { key: 'initiated_at', label: 'Initiated', render: (r) => new Date(r.initiated_at).toLocaleDateString() },
          { key: 'decided_at', label: 'Decided', render: (r) => r.decided_at ? new Date(r.decided_at).toLocaleDateString() : '—' },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'executed' && r.status !== 'reversed' && (
              <button type="button" onClick={() => setTransitioning(r)} className="btn pri">Transition</button>
            )
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="File licence action"
          submitLabel="File"
          fields={[
            { key: 'action_type', label: 'Action type', type: 'select', required: true, options: [
              { value: 'grant', label: 'Grant' },
              { value: 'vary', label: 'Vary' },
              { value: 'suspend', label: 'Suspend' },
              { value: 'revoke', label: 'Revoke' },
              { value: 'reinstate', label: 'Reinstate' },
              { value: 'renew', label: 'Renew' },
            ] },
            { key: 'licence_id', label: 'Licence', type: 'lookup', lookupEndpoint: '/api/lookup/licences' },
            { key: 'application_id', label: 'Application ID' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/regulator/licence-actions', v);
            setFiling(false); refresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title={`Licence action transition · current: ${transitioning.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: LICENCE_TRANSITIONS },
            { key: 'rationale', label: 'Decision rationale', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(null)}
          onSubmit={async (v) => {
            await api.post(`/regulator/licence-actions/${transitioning.id}/transition`, v);
            setTransitioning(null); refresh();
          }}
        />
      )}
    </div>
  );
}
