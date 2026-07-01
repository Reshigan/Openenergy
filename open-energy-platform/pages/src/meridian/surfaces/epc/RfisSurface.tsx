// pages/src/meridian/surfaces/epc/RfisSurface.tsx
//
// Meridian surface — "RFIs" (epc_contractor role). Extracted verbatim from the `rfis`
// tab body of the EpcWorkstationPage husk (E2.8b). Self-contained: it fetches its own
// data via the shared ListingTable against /ipp/rfis and creates RFIs via POST
// /api/ipp/rfis. No dependency on workstation-page-local state. Registered as
// `epc_contractor:rfis` in surfaces.tsx, reached from Atlas (⌘K) via roleData feature
// key `rfis`. This is a non-chain inline CRUD surface (Bucket B) — the /ipp/rfis listing
// has no MERIDIAN_CHAINS descriptor, so it is extracted rather than retired to /ledger.
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal } from '../../../components/launch/WorkstationShell';
import { statusLabel } from '../../ease/statusLabel';

export default function RfisSurface(_props: { role: string }) {
  const [creatingRfi, setCreatingRfi] = useState(false);
  const [bump, setBump] = useState(0);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setCreatingRfi(true)} className="btn pri">+ New RFI</button>
      </div>
      <ListingTable
        key={`rfis-${bump}`}
        endpoint="/ipp/rfis"
        rowKey={(r) => r.id}
        empty={{ title: 'No RFIs', description: 'Requests for information submitted to the client will appear here.' }}
        columns={[
          { key: 'rfi_number', label: 'RFI No.', render: (r) => <span className="font-mono text-[11px]">{r.rfi_number}</span> },
          { key: 'subject', label: 'Subject', render: (r) => <span className="block truncate max-w-xs">{r.subject}</span> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'closed' ? 'good' : r.status === 'overdue' ? 'bad' : 'warn'}>{statusLabel(r.status).text}</Pill> },
          { key: 'required_by', label: 'Response due', render: (r) => r.required_by ? new Date(r.required_by).toLocaleDateString() : '—' },
        ]}
      />
      {creatingRfi && (
        <ActionModal
          title="Raise RFI"
          fields={[
            { key: 'subject', label: 'Subject', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea', required: true },
            { key: 'discipline', label: 'Discipline', type: 'select', options: [{ value: 'electrical', label: 'Electrical' }, { value: 'civil', label: 'Civil' }, { value: 'mechanical', label: 'Mechanical' }] },
            { key: 'required_by', label: 'Response required by', type: 'date' },
          ]}
          onClose={() => setCreatingRfi(false)}
          onSubmit={async (v) => {
            const token = localStorage.getItem('token') || '';
            const res = await fetch('/api/ipp/rfis', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(v) });
            if (!res.ok) throw new Error('Failed to raise RFI');
            setCreatingRfi(false);
            setBump((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
