// pages/src/meridian/surfaces/carbon/MrvSurface.tsx
//
// Meridian surface — "MRV submissions" (carbon_fund role). Extracted verbatim from the
// `mrv` tab body of the CarbonWorkstationPage husk (E2.8c). Self-contained: fetches its
// own data via ListingTable against /carbon-registry/mrv-submissions, files new MRV cycles
// via POST /carbon-registry/mrv-submissions, and transitions them via
// POST /carbon-registry/mrv-submissions/:id/transition. Registered as `carbon_fund:mrv` in
// surfaces.tsx, reached from Atlas (⌘K) via roleData feature key `mrv`. Non-chain CRUD
// surface (Bucket B) — distinct from the `mrv_submissions` chain (→ /ledger).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';
import { statusLabel } from '../../../shared/ease/statusLabel';
import { mrvViz } from './viz';

const MRV_TRANSITIONS = [
  { value: 'submitted', label: 'Submit' },
  { value: 'under_verification', label: 'Send for verification' },
  { value: 'verified', label: 'Mark verified' },
  { value: 'rejected', label: 'Reject' },
  { value: 'published', label: 'Publish' },
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

export default function MrvSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  const [bump, setBump] = useState(0);
  const refresh = () => setBump((n) => n + 1);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="New MRV submission" />
      <ListingTable
        key={`mrv-${bump}`}
        endpoint="/carbon-registry/mrv-submissions"
        rowKey={(r) => r.id}
        viz={mrvViz}
        empty={{ title: 'No MRV submissions', description: 'Measurement-Reporting-Verification cycles will land here as they are drafted, submitted, verified, and published.' }}
        columns={[
          { key: 'project_id', label: 'Project', render: (r) => <span className="font-mono text-[11px]">{(r.project_id || '').slice(0, 12)}…</span> },
          { key: 'period_start', label: 'Period', render: (r) => `${r.period_start} → ${r.period_end}` },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'verified' || r.status === 'published' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{statusLabel(r.status).text}</Pill> },
          { key: 'reduction_tco2e', label: 'Reduction tCO₂e', align: 'right', render: (r) => r.reduction_tco2e != null ? Number(r.reduction_tco2e).toFixed(1) : '—' },
          { key: 'verified_at', label: 'Verified', render: (r) => r.verified_at ? new Date(r.verified_at).toLocaleDateString() : '—' },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'published' && r.status !== 'rejected' && (
              <button type="button" onClick={() => setTransitioning(r)} className="btn pri">Transition</button>
            )
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="New MRV submission"
          submitLabel="File"
          fields={[
            { key: 'project_id', label: 'Project', type: 'lookup', required: true, lookupEndpoint: '/api/lookup/carbon_projects', lookupAutoFill: { methodology_id: 'methodology_id' } },
            { key: 'period_start', label: 'Period start', type: 'date', required: true },
            { key: 'period_end', label: 'Period end', type: 'date', required: true },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-registry/mrv-submissions', v);
            setFiling(false); refresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title={`MRV transition · current: ${transitioning.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: MRV_TRANSITIONS },
            { key: 'reduction_tco2e', label: 'Reduction tCO₂e (verification only)', type: 'number' },
            { key: 'rejection_reason', label: 'Rejection reason (rejected only)', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(null)}
          onSubmit={async (v) => {
            const body: any = { to: v.to };
            if (v.reduction_tco2e) body.reduction_tco2e = Number(v.reduction_tco2e);
            if (v.rejection_reason) body.rejection_reason = v.rejection_reason;
            await api.post(`/carbon-registry/mrv-submissions/${transitioning.id}/transition`, body);
            setTransitioning(null); refresh();
          }}
        />
      )}
    </div>
  );
}
