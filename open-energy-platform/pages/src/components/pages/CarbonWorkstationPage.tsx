import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { api } from '../../lib/api';

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button onClick={onCreate} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

const STAGE_OPTIONS = [
  { value: 'validated', label: 'Validated' },
  { value: 'listed', label: 'Listed' },
  { value: 'traded', label: 'Traded' },
  { value: 'retired_partial', label: 'Retired (partial)' },
  { value: 'retired_full', label: 'Retired (full)' },
  { value: 'expired', label: 'Expired' },
];

const MRV_TRANSITIONS = [
  { value: 'submitted', label: 'Submit' },
  { value: 'under_verification', label: 'Send for verification' },
  { value: 'verified', label: 'Mark verified' },
  { value: 'rejected', label: 'Reject' },
  { value: 'published', label: 'Publish' },
];

export function CarbonWorkstationPage() {
  return (
    <WorkstationShell
      eyebrow="Carbon fund · Workstation"
      title="Carbon workstation"
      subtitle="Vintage workflow · MRV submissions · Retirement certificates. All flows; no external tools needed."
      backHref="/carbon-registry"
      backLabel="Carbon registry"
      tabs={[
        {
          key: 'vintages',
          label: 'Vintage workflow',
          body: ({ onRefresh }) => <VintagesTab onRefresh={onRefresh} />,
        },
        {
          key: 'mrv',
          label: 'MRV submissions',
          body: ({ onRefresh }) => <MrvTab onRefresh={onRefresh} />,
        },
        {
          key: 'certificates',
          label: 'Retirement certificates',
          body: ({ onRefresh }) => <CertificatesTab onRefresh={onRefresh} />,
        },
      ]}
    />
  );
}

function VintagesTab({ onRefresh }: { onRefresh: () => void }) {
  const [advancing, setAdvancing] = useState<any | null>(null);
  return (
    <div>
      <ListingTable
        endpoint="/carbon-registry/vintage-workflow"
        rowKey={(r) => r.id}
        empty={{ title: 'No vintages in workflow', description: 'Vintage cohorts will appear here as they progress through issued → validated → listed → traded → retired.' }}
        columns={[
          { key: 'vintage_id', label: 'Vintage', render: (r) => <span className="font-mono text-[11px]">{(r.vintage_id || '').slice(0, 12)}…</span> },
          { key: 'current_stage', label: 'Stage', render: (r) => <Pill tone={r.current_stage === 'retired_full' ? 'good' : 'info'}>{r.current_stage.replace(/_/g, ' ')}</Pill> },
          { key: 'retired_volume_tco2e', label: 'Retired tCO₂e', align: 'right', render: (r) => Number(r.retired_volume_tco2e || 0).toFixed(1) },
          { key: 'outstanding_tco2e', label: 'Outstanding tCO₂e', align: 'right', render: (r) => Number(r.outstanding_tco2e || 0).toFixed(1) },
          { key: 'updated_at', label: 'Updated', render: (r) => new Date(r.updated_at).toLocaleDateString() },
          { key: '_actions', label: '', render: (r) => (
            <button onClick={() => setAdvancing(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Advance</button>
          ) },
        ]}
      />
      {advancing && (
        <ActionModal
          title={`Advance vintage stage · current: ${advancing.current_stage}`}
          submitLabel="Advance"
          fields={[
            { key: 'to_stage', label: 'Next stage', type: 'select', required: true, options: STAGE_OPTIONS },
          ] as FieldSpec[]}
          onClose={() => setAdvancing(null)}
          onSubmit={async (v) => {
            await api.post(`/carbon-registry/vintage-workflow/${advancing.id}/advance`, { to_stage: v.to_stage });
            setAdvancing(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function MrvTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="New MRV submission" />
      <ListingTable
        endpoint="/carbon-registry/mrv-submissions"
        rowKey={(r) => r.id}
        empty={{ title: 'No MRV submissions', description: 'Measurement-Reporting-Verification cycles will land here as they are drafted, submitted, verified, and published.' }}
        columns={[
          { key: 'project_id', label: 'Project', render: (r) => <span className="font-mono text-[11px]">{(r.project_id || '').slice(0, 12)}…</span> },
          { key: 'period_start', label: 'Period', render: (r) => `${r.period_start} → ${r.period_end}` },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'verified' || r.status === 'published' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status.replace(/_/g, ' ')}</Pill> },
          { key: 'reduction_tco2e', label: 'Reduction tCO₂e', align: 'right', render: (r) => r.reduction_tco2e != null ? Number(r.reduction_tco2e).toFixed(1) : '—' },
          { key: 'verified_at', label: 'Verified', render: (r) => r.verified_at ? new Date(r.verified_at).toLocaleDateString() : '—' },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'published' && r.status !== 'rejected' && (
              <button onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Transition</button>
            )
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="New MRV submission"
          submitLabel="File"
          fields={[
            { key: 'project_id', label: 'Project ID', required: true, placeholder: 'project_…' },
            { key: 'period_start', label: 'Period start', type: 'date', required: true },
            { key: 'period_end', label: 'Period end', type: 'date', required: true },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-registry/mrv-submissions', v);
            setFiling(false); onRefresh();
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
            setTransitioning(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function CertificatesTab({ onRefresh }: { onRefresh: () => void }) {
  const [issuing, setIssuing] = useState(false);
  return (
    <div>
      <Header onCreate={() => setIssuing(true)} label="Issue certificate" />
      <ListingTable
        endpoint="/carbon-registry/retirement-certificates"
        rowKey={(r) => r.id}
        empty={{ title: 'No retirement certificates', description: 'Certificates issued for retired tCO₂e on behalf of buyers will appear here.' }}
        columns={[
          { key: 'certificate_number', label: 'Certificate', render: (r) => <span className="font-mono text-[11px]">{r.certificate_number}</span> },
          { key: 'beneficiary_name', label: 'Beneficiary' },
          { key: 'retired_volume_tco2e', label: 'tCO₂e', align: 'right', render: (r) => Number(r.retired_volume_tco2e || 0).toFixed(1) },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'delivered' ? 'good' : r.status === 'revoked' ? 'bad' : 'info'}>{r.status}</Pill> },
          { key: 'issued_at', label: 'Issued', render: (r) => r.issued_at ? new Date(r.issued_at).toLocaleDateString() : '—' },
        ]}
      />
      {issuing && (
        <ActionModal
          title="Issue retirement certificate"
          submitLabel="Issue"
          fields={[
            { key: 'retirement_id', label: 'Retirement ID', required: true, placeholder: 'retirement_…' },
            { key: 'retired_volume_tco2e', label: 'Retired tCO₂e', type: 'number', required: true },
            { key: 'beneficiary_name', label: 'Beneficiary name' },
            { key: 'beneficiary_email', label: 'Beneficiary email' },
          ] as FieldSpec[]}
          onClose={() => setIssuing(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-registry/retirement-certificates/issue', {
              retirement_id: v.retirement_id,
              retired_volume_tco2e: Number(v.retired_volume_tco2e),
              beneficiary_name: v.beneficiary_name || undefined,
              beneficiary_email: v.beneficiary_email || undefined,
            });
            setIssuing(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}
