// pages/src/meridian/surfaces/epc/RfisSurface.tsx
//
// Meridian surface — "RFIs" (epc_contractor role). Renders the live W116 IPP RFI chain
// (src/routes/ipp-rfi.ts, table oe_ipp_rfi) via the shared ListingTable against
// /ipp/rfis/chain and raises RFIs via POST /api/ipp/rfis/chain. The older /ipp/rfis
// listing this husk originally pointed at never existed (404) — the chain is the real,
// role-guarded RFI system. GET returns { data: { items, ...aggregates } }; ListingTable
// unwraps `.items`. Registered as `epc_contractor:rfis` in surfaces.tsx, reached from
// Atlas (⌘K) via roleData feature key `rfis`.
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal } from '../../../components/launch/WorkstationShell';
import { statusLabel } from '../../../shared/ease/statusLabel';

const TERMINAL_GOOD = new Set(['closed', 'closed_out', 'answered', 'archived']);
const TERMINAL_BAD = new Set(['rejected', 'voided', 'void']);

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
        endpoint="/ipp/rfis/chain"
        rowKey={(r) => r.id}
        empty={{ title: 'No RFIs', description: 'Requests for information raised on your projects will appear here.' }}
        columns={[
          { key: 'rfi_number', label: 'RFI No.', render: (r) => <span className="font-mono text-[11px]">{r.rfi_number}</span> },
          { key: 'title', label: 'Title', render: (r) => <span className="block truncate max-w-xs">{r.title}</span> },
          { key: 'current_tier', label: 'Tier', render: (r) => <span className="text-[11px] capitalize">{r.current_tier || '—'}</span> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={TERMINAL_GOOD.has(r.chain_status) ? 'good' : TERMINAL_BAD.has(r.chain_status) ? 'bad' : 'warn'}>{statusLabel(r.chain_status).text}</Pill> },
          { key: 'urgency_band_live', label: 'Urgency', render: (r) => r.urgency_band_live ? <Pill tone={r.urgency_band_live === 'critical' || r.urgency_band_live === 'high' ? 'bad' : 'warn'}>{r.urgency_band_live}</Pill> : <span>—</span> },
          { key: 'rfi_age_days_live', label: 'Age (days)', render: (r) => <span className="tabular-nums">{r.rfi_age_days_live ?? '—'}</span> },
        ]}
      />
      {creatingRfi && (
        <ActionModal
          title="Raise RFI"
          fields={[
            { key: 'title', label: 'Title', type: 'text', required: true },
            { key: 'question_long', label: 'Question', type: 'textarea', required: true },
            { key: 'rfi_class', label: 'Class', type: 'select', options: [{ value: 'clarification', label: 'Clarification' }, { value: 'design', label: 'Design' }, { value: 'technical', label: 'Technical' }, { value: 'commercial', label: 'Commercial' }] },
            { key: 'discipline', label: 'Discipline', type: 'select', options: [{ value: 'electrical', label: 'Electrical' }, { value: 'civil', label: 'Civil' }, { value: 'mechanical', label: 'Mechanical' }] },
          ]}
          onClose={() => setCreatingRfi(false)}
          onSubmit={async (v) => {
            const token = localStorage.getItem('token') || '';
            const res = await fetch('/api/ipp/rfis/chain', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(v) });
            if (!res.ok) throw new Error('Failed to raise RFI');
            setCreatingRfi(false);
            setBump((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
