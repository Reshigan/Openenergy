import React from 'react';
import { WorkstationShell, ListingTable, Pill } from '../launch/WorkstationShell';

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
          body: () => (
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
              ]}
            />
          ),
        },
        {
          key: 'mrv',
          label: 'MRV submissions',
          body: () => (
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
              ]}
            />
          ),
        },
        {
          key: 'certificates',
          label: 'Retirement certificates',
          body: () => (
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
          ),
        },
      ]}
    />
  );
}
